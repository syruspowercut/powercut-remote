/* Powercut remote over the internet (runs on the phone). Sends end-to-end encrypted texts/photos to the show Mac
   through ntfy.sh. The key comes from the link's #k= part, which browsers never send to any server. */
(() => {
'use strict';
const RELAY = 'https://ntfy.sh', MAX_PHOTO = 1.8 * 1024 * 1024;
const $ = id => document.getElementById(id);
const b64u = { enc: b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const r = atob(s); const u = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) u[i] = r.charCodeAt(i); return u; } };
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const HP = new URLSearchParams(location.hash.slice(1));
let K = HP.get('k') || '', PD = HP.get('p') || '', PQ = HP.get('q') || '';
try { if (K) localStorage.setItem('pc-relay-key', K); else K = localStorage.getItem('pc-relay-key') || ''; } catch (e) {}
try { if (PD && PQ) localStorage.setItem('pc-paid-key', JSON.stringify({ d: PD, pub: PQ })); else ({ d: PD, pub: PQ } = JSON.parse(localStorage.getItem('pc-paid-key') || '{}')); } catch (e) {}
let key = null, topic = '', stopic = '', tab = 'text', style = 'headline', secs = 8, photoBlob = null, busy = false, LONG = 10, macStatus = null;
document.querySelectorAll('#sizes .chip').forEach(b => b.onclick = () => document.querySelectorAll('#sizes .chip').forEach(x => x.classList.toggle('on', x === b)));
const photoSize = () => (document.querySelector('#sizes .chip.on') || {}).dataset?.size || 'normal';
const toast = (m, ms = 2400) => { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), ms); };

async function setup() {
  if (!K || !/^[A-Za-z0-9_-]{43}$/.test(K)) { $('conn').textContent = 'link has no key'; $('conn').className = 'pill bad'; toast('Open the link from the Control window QR code (it contains the key).', 6000); return false; }
  if (!(window.crypto && crypto.subtle)) { toast('This browser cannot encrypt. Use Safari on the iPhone.', 6000); return false; }
  key = await crypto.subtle.importKey('raw', b64u.dec(K), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const enc = new TextEncoder();
  topic = 'pc' + hex(await crypto.subtle.digest('SHA-256', enc.encode('pc-relay-topic|' + K))).slice(0, 24);
  stopic = 'pc' + hex(await crypto.subtle.digest('SHA-256', enc.encode('pc-relay-status|' + K))).slice(0, 24);
  return true;
}
async function encText(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return 'pc1.' + b64u.enc(iv) + '.' + b64u.enc(ct);
}
async function decText(s) {
  const p = String(s || '').split('.'); if (p.length !== 3 || p[0] !== 'pc1') throw new Error('x');
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64u.dec(p[1]) }, key, b64u.dec(p[2]))));
}
function xhr(method, url, body, headers, timeoutMs, onProgress) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest(); x.open(method, url, true); x.timeout = timeoutMs || 10000;
    for (const [k, v] of Object.entries(headers || {})) x.setRequestHeader(k, v);
    if (onProgress && x.upload) x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => x.status >= 200 && x.status < 300 ? res(x.responseText) : rej(new Error(x.status === 429 ? 'The relay is rate-limiting this phone. Wait a minute.' : x.status === 413 ? 'Photo too large for the relay.' : 'Relay error ' + x.status));
    x.onerror = () => rej(new Error('No internet on the phone. Try again, or use the local Wi-Fi remote.'));
    x.ontimeout = () => rej(new Error('The connection is slow: not sent. Try again.'));
    x.send(body || null);
  });
}
const newId = () => b64u.enc(crypto.getRandomValues(new Uint8Array(9)));
async function publish(msg, attachment, onProgress) {
  msg.id = newId(); msg.ts = Date.now();
  if (!attachment) { await xhr('POST', `${RELAY}/${topic}`, await encText(msg), {}, 10000); return msg.id; }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, attachment));
  const body = new Uint8Array(12 + ct.length); body.set(iv, 0); body.set(ct, 12);
  await xhr('PUT', `${RELAY}/${topic}`, body, { 'Filename': 'p.bin', 'X-Message': await encText(msg) }, 45000, onProgress);
  return msg.id;
}
async function readStatus(sinceSec) {
  const txt = await xhr('GET', `${RELAY}/${stopic}/json?poll=1&since=${sinceSec}s`, null, {}, 8000);
  const out = [];
  for (const line of txt.split('\n')) { if (!line.trim()) continue; try { const ev = JSON.parse(line); if (ev.event !== 'message') continue; const m = await decText(ev.message); m._t = ev.time; out.push(m); } catch (e) {} }
  return out;
}
async function waitAck(id) {                       // the Mac confirms each item: poll the status topic briefly
  const t0 = Date.now();
  while (Date.now() - t0 < 16000) {
    await new Promise(r => setTimeout(r, 1500));
    try { const ms = await readStatus(30); const a = ms.find(m => m.type === 'ack' && m.ackId === id); if (a) { applyStatus(a); return a; } } catch (e) {}
  }
  return null;
}

// ---------- Show tab: DJ on screen, dot colour, DJ name hue ----------
const DOTC = { white: "#ece6ff", blue: "#4664ff", red: "#ff283c", pink: "#ff46be", green: "#3cff78", cyan: "#32e6ff" };
let showState = null, hueDial = null, showLockUntil = 0;
function drawShow(sh) {
  if (!sh) return; showState = sh; if (window.PC_EXTRAS_STATE) window.PC_EXTRAS_STATE(sh);
  if (Date.now() < showLockUntil) return;                          // keep the optimistic choice for a moment after a tap
  const box = $("scenesBox");
  if (box.childElementCount !== (sh.scenes || []).length) { box.innerHTML = ""; (sh.scenes || []).forEach(sc => { const b = document.createElement("button"); b.className = "scn"; b.dataset.id = sc.id; b.textContent = sc.label.replace(" (rendering)", ""); b.onclick = () => pickScene(sc.id, b); box.appendChild(b); }); }
  box.querySelectorAll(".scn").forEach(b => b.classList.toggle("on", b.dataset.id === sh.scene));
  const db = $("dotBox");
  if (!db.childElementCount) Object.entries(DOTC).forEach(([id, col]) => { const b = document.createElement("button"); b.className = "dotb"; b.dataset.dot = id; b.setAttribute("aria-label", "Dots " + id); b.style.background = `radial-gradient(circle at 40% 35%, #fff 0 8%, ${col} 30%, ${col}88 70%)`; b.style.boxShadow = `0 0 12px ${col}66`; b.onclick = () => pickDot(id); db.appendChild(b); });
  db.querySelectorAll(".dotb").forEach(b => { b.style.outline = b.dataset.dot === sh.dotColor ? "3px solid #fff" : "none"; b.style.outlineOffset = "3px"; });
  if (hueDial) hueDial.set(sh.nameHue || 0);
}
function lockShow() { showLockUntil = Date.now() + 4000; }

async function control(action, value, label) {
  if (!key) return;
  try { const id = await publish({ type: 'control', action, value }); const a = await waitAck(id); toast(a ? (a.ok ? label + ' ✓' : (a.error || 'The Mac could not do that')) : 'Sent, but the Mac did not confirm', a && a.ok ? 1800 : 4000); }
  catch (e) { toast(e.message, 4000); showLockUntil = 0; }
}
function pickScene(id, btn) { lockShow(); $('scenesBox').querySelectorAll('.scn').forEach(b => b.classList.toggle('on', b === btn)); toast('Switching to ' + btn.textContent + '...'); control('scene', id, btn.textContent + ' on screen'); if (navigator.vibrate) navigator.vibrate(20); }
function pickDot(id) { lockShow(); $('dotBox').querySelectorAll('.dotb').forEach(b => { b.style.outline = b.dataset.dot === id ? '3px solid #fff' : 'none'; }); control('dotcolor', id, 'Dots ' + id); }
function applyStatus(m) {
  macStatus = m; macStatus._seen = (m._t || Date.now() / 1000) * 1000;
  drawStatus(); drawAgain(m.history || []); if (m.show) drawShow(m.show);
}
function drawStatus() {
  const c = $('conn');
  if (!macStatus) { c.textContent = 'Mac not seen yet'; c.className = 'pill bad'; }
  else {
    const ago = Math.round((Date.now() - macStatus._seen) / 1000);
    if (macStatus.enabled === false) { c.textContent = 'remote off in Control'; c.className = 'pill bad'; }
    else if (ago < 240) { c.textContent = 'Mac online · ' + (ago < 60 ? ago + ' s ago' : Math.round(ago / 60) + ' min ago'); c.className = 'pill ok'; }
    else { c.textContent = 'Mac offline? last seen ' + Math.round(ago / 60) + ' min ago'; c.className = 'pill bad'; }
  }
  const o = macStatus && macStatus.onscreen; const ends = o && o.endsAt ? o.endsAt : 0;
  const live = o && (o.seconds === 0 || !ends || ends > Date.now());
  $('live').innerHTML = 'On screen now: <b></b>';
  $('live').querySelector('b').textContent = !live ? 'nothing (DJ name showing)' : (o.kind === 'image' ? 'photo' + (o.caption ? ' · ' + o.caption : '') : o.text) + (o.seconds === 0 ? ' (until cleared)' : '');
}
async function poll() {
  if (!key) return;
  try { const ms = await readStatus(600); const last = ms.filter(m => m.type === 'status' || m.type === 'ack').pop(); if (last) applyStatus(last); else drawStatus(); } catch (e) { const c = $('conn'); c.textContent = 'no internet on phone'; c.className = 'pill bad'; }
}

// ---------- UI (same as the local remote) ----------
function setTab(t) { tab = t; for (const [b, p] of [['tText', 'pText'], ['tPhoto', 'pPhoto'], ['tShow', 'pShow']]) { $(b).classList.toggle('on', $(b).id === 't' + t[0].toUpperCase() + t.slice(1)); $(p).classList.toggle('hidden', p !== 'p' + t[0].toUpperCase() + t.slice(1)); } $('sendPanel').classList.toggle('hidden', t === 'show'); updateSend(); }
$('tText').onclick = () => setTab('text'); $('tPhoto').onclick = () => setTab('photo'); $('tShow').onclick = () => setTab('show');
document.querySelectorAll('#styles .chip').forEach(b => b.onclick = () => { style = b.dataset.style; document.querySelectorAll('#styles .chip').forEach(x => x.classList.toggle('on', x === b)); renderPrev(); });
document.querySelectorAll('#durs .chip').forEach(b => b.onclick = () => { secs = +b.dataset.s; document.querySelectorAll('#durs .chip').forEach(x => x.classList.toggle('on', x === b)); });
function renderPrev() {
  const t = $('msg').value.trim().toUpperCase(); $('cnt').textContent = $('msg').value.length;
  const el = $('prev'); el.innerHTML = '';
  if (style === 'shoutout' && t) { const e = document.createElement('span'); e.className = 'eyebrow'; e.textContent = 'SHOUT OUT'; el.appendChild(e); }
  el.appendChild(document.createTextNode(t || 'YOUR MESSAGE')); const cr = document.createElement('span'); cr.className = 'pcaret'; el.appendChild(cr);
  const n = (t || 'YOUR MESSAGE').length, w = el.parentElement.clientWidth || 300;
  el.style.fontSize = Math.max(11, Math.min(w * 0.11, w * 1.25 / Math.max(6, Math.sqrt(n) * 3.2))) + 'px'; updateSend();
}
$('msg').addEventListener('input', renderPrev);
function updateSend() { $('send').disabled = busy || !key || (tab === 'text' ? !$('msg').value.trim() : !photoBlob); }
function recent() { try { return JSON.parse(localStorage.getItem('pc-relay-recent') || '[]'); } catch (e) { return []; } }
function pushRecent(t) { try { localStorage.setItem('pc-relay-recent', JSON.stringify([t, ...recent().filter(x => x !== t)].slice(0, 8))); } catch (e) {} drawRecent(); }
function drawRecent() { const r = recent(); $('recentBox').classList.toggle('hidden', !r.length); $('recent').innerHTML = ''; r.forEach(t => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = t; b.onclick = () => { $('msg').value = t; renderPrev(); }; $('recent').appendChild(b); }); }

// photos: decode (HEIC ok), fix rotation, shrink to 1600 px JPEG, and make sure it is under the relay's 2 MB limit
async function loadPhoto(file) {
  if (!file) return;
  try {
    const url = URL.createObjectURL(file), img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    let max = 1600, q = 0.86, blob = null;
    for (let i = 0; i < 6; i++) {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      blob = await new Promise(res => c.toBlob(res, 'image/jpeg', q));
      if (blob && blob.size <= MAX_PHOTO) break;
      q = Math.max(0.6, q - 0.08); max = Math.round(max * 0.85);
    }
    URL.revokeObjectURL(url);
    if (!blob || blob.size > MAX_PHOTO) throw new Error('too big');
    photoBlob = blob; $('photoPrev').src = URL.createObjectURL(blob); $('photoPrev').style.display = 'block';
  } catch (e) { photoBlob = null; toast('Could not read that photo. Try another.'); }
  updateSend();
}
$('cam').onchange = e => loadPhoto(e.target.files[0]); $('roll').onchange = e => loadPhoto(e.target.files[0]);
const isLong = s => s === 0 || s > LONG;
function confirmLong(s) { return confirm(s === 0 ? 'Keep this on screen until you clear it? It covers the DJ name.' : 'Keep this on screen for ' + (s >= 60 ? Math.round(s / 60) + ' min' : s + ' s') + '? It covers the DJ name.'); }
async function afterSend(id) {
  const a = await waitAck(id);
  if (!a) toast('Sent, but the Mac did not confirm. Check the Mac has internet.', 4500);
  else if (a.ok) { toast('On screen now'); if (navigator.vibrate) navigator.vibrate(30); }
  else toast(a.error || 'The Mac could not show it.', 4500);
}
$('send').onclick = async () => {
  if (busy || !key) return;
  const confirmed = isLong(secs) ? confirmLong(secs) : false; if (isLong(secs) && !confirmed) return;
  busy = true; updateSend(); $('send').textContent = 'Sending...';
  try {
    let id;
    if (tab === 'text') { const t = $('msg').value.trim(); id = await publish({ type: 'text', text: t, style, seconds: secs, confirmed }); pushRecent(t.toUpperCase()); }
    else { const buf = await photoBlob.arrayBuffer(); id = await publish({ type: 'image', seconds: secs, confirmed, caption: $('cap').value.trim(), size: photoSize() }, buf, p => { $('send').textContent = 'Uploading ' + Math.round(p * 100) + '%'; }); }
    $('send').textContent = 'Waiting for the screen...';
    await afterSend(id);
  } catch (e) { toast(e.message, 4500); }
  busy = false; $('send').textContent = 'Show on screen'; updateSend();
};
$('clear').onclick = async () => { if (!key) return; try { const id = await publish({ type: 'clear' }); toast('Clearing...'); const a = await waitAck(id); toast(a ? 'Cleared' : 'Sent clear, Mac did not confirm', 3000); } catch (e) { toast(e.message, 4500); } };
function drawAgain(h) {
  $('againBox').classList.toggle('hidden', !h.length); const box = $('again'); box.innerHTML = '';
  h.slice(0, 6).forEach(it => {
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = it.kind === 'image' ? '📷 ' + (it.caption || 'photo') : it.text;
    b.onclick = async () => {
      const confirmed = isLong(secs) ? confirmLong(secs) : false; if (isLong(secs) && !confirmed) return;
      try { const id = await publish({ type: 'reshow', itemId: it.id, seconds: secs, confirmed }); toast('Sending...'); await afterSend(id); } catch (e) { toast(e.message, 4500); }
    };
    box.appendChild(b);
  });
}
(async () => { renderPrev(); drawRecent(); if (await setup()) { updateSend(); if (window.makeHueDial) hueDial = window.makeHueDial($('hueBox'), { size: 220, onChange: v => { lockShow(); control('hue', Math.round(v), 'Name colour'); } }); poll(); setInterval(poll, 20000); setInterval(drawStatus, 5000); document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); }); } })();
window.PC_EXTRAS = {
  toast, control: (a, v, label) => control(a, v, label),
  paidKey: async () => (PD && PQ ? { d: PD, pub: PQ } : null),
  sendText: async (text, seconds) => { if (!key) throw new Error('No key'); toast('Sending...'); const id = await publish({ type: 'text', text, style: 'headline', seconds, confirmed: true }); await afterSend(id); return true; },
  sendImage: async (blob, seconds, caption, size) => { if (!key) throw new Error('No key'); toast('Uploading...'); const id = await publish({ type: 'image', seconds, confirmed: true, caption: caption || '', size: size || 'normal' }, await blob.arrayBuffer()); await afterSend(id); return true; }
};
})();
