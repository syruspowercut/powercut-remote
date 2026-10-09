/* Extra phone remote controls, shared by the Wi-Fi remote (remote.html) and the anywhere remote (relay-remote/).
   1. Stage buttons on the Show tab: Blackout, Calm, Power cut, Drop, and the paid-message QR card.
   2. A Paid tab: guests' paid messages, end-to-end encrypted, read straight from ntfy.sh and decrypted on this phone.
      Type the code from the Revolut note, then Copy or Show. Photos are kept on the phone (ntfy deletes them after ~3 h).
   The page provides window.PC_EXTRAS = { control(action, value, label), sendText(text, seconds), sendImage(blob, seconds, caption), paidKey() }. */
(() => {
'use strict';
const X = window.PC_EXTRAS; if (!X) return;
const RELAY = 'https://ntfy.sh';
const $ = id => document.getElementById(id);
const b64d = s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const r = atob(s); const u = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) u[i] = r.charCodeAt(i); return u; };
const b64e = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const toast = (m, ms) => (X.toast || window.alert)(m, ms);
const css = document.createElement('style');
css.textContent = `
  .stage-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .stage-grid button { font:inherit; font-weight:700; color:var(--fg); background:#1d1d24; border:1px solid #33333e; border-radius:12px; padding:15px 8px; }
  .stage-grid button.on { border-color:var(--acc); background:rgba(255,42,60,.2); color:#fff; }
  .stage-grid .wide { grid-column:1 / -1; }
  .pd-card { background:#0f0f14; border:1px solid #33333e; border-radius:12px; padding:10px; margin-top:10px; }
  .pd-card.shown { opacity:.55; }
  .pd-head { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
  .pd-code { font:900 20px/1 "PC Orbitron","Arial Black",sans-serif; letter-spacing:.05em; }
  .pd-meta { font-size:13px; color:var(--mut); }
  .pd-txt { font:900 17px/1.25 "PC Orbitron","Arial Black",sans-serif; color:#ffdbe1; margin:8px 0; word-break:break-word; }
  .pd-card img { width:100%; max-height:40vh; object-fit:contain; border-radius:8px; background:#000; margin:8px 0; display:block; }
  .pd-acts { display:flex; gap:8px; } .pd-acts button { flex:1; font:inherit; font-weight:700; color:var(--fg); background:#1d1d24; border:1px solid #33333e; border-radius:10px; padding:11px 6px; }
  .pd-acts .go { background:var(--acc); border-color:var(--acc); color:#fff; }
  #pdFind { text-transform:uppercase; }`;
document.head.appendChild(css);

// ---------------- 1. stage buttons ----------------
const pShow = $('pShow');
const stage = document.createElement('div'); stage.className = 'panel';
stage.innerHTML = '<label>Stage</label><div class="stage-grid">' +
  '<button id="xBlack">Blackout</button><button id="xCalm">Calm</button>' +
  '<button id="xCut">Power cut</button><button id="xDrop">Drop</button>' +
  '<button id="xLogo">Logo off</button><button id="xPromo">Paid QR (20 s)</button></div>';
pShow.insertBefore(stage, pShow.firstChild);
let st = {}, lockUntil = 0;
const buzz = () => { if (navigator.vibrate) navigator.vibrate(20); };
function paint(force) {
  if (!force && Date.now() < lockUntil) return;
  $('xBlack').classList.toggle('on', !!st.black); $('xCalm').classList.toggle('on', st.mode === 0); $('xCut').classList.toggle('on', !!st.cut);
  $('xBlack').textContent = st.black ? 'Blackout ON (tap to light)' : 'Blackout';
  $('xLogo').classList.toggle('on', !!st.logoOff); $('xLogo').textContent = st.logoOff ? 'Logo hidden' : 'Logo off';
}
function flip(id, key, on, action, label) { lockUntil = Date.now() + 4000; st[key] = on; $(id).classList.toggle('on', !!on); buzz(); X.control(action, on, label); }
$('xBlack').onclick = () => { const on = !st.black; if (on && !confirm('Black out the screen?')) return; flip('xBlack', 'black', on, 'black', on ? 'Blackout on' : 'Screen back on'); $('xBlack').textContent = on ? 'Blackout ON (tap to light)' : 'Blackout'; };
$('xCalm').onclick = () => { const on = st.mode !== 0; lockUntil = Date.now() + 4000; st.mode = on ? 0 : 5; $('xCalm').classList.toggle('on', on); buzz(); X.control('calm', on, on ? 'Calm' : 'Light show back'); };
$('xCut').onclick = () => flip('xCut', 'cut', !st.cut, 'cut', st.cut ? 'Power back' : 'Power cut');
$('xLogo').onclick = () => { const on = !st.logoOff; lockUntil = Date.now() + 4000; st.logoOff = on; paint.force(); buzz(); X.control('logo', on, on ? 'Logo hidden' : 'Logo back'); };
$('xDrop').onclick = () => { buzz(); X.control('drop', true, 'Drop'); };
$('xPromo').onclick = () => { buzz(); X.control('promo', 20, 'QR card on screen'); };
paint.force = () => paint(true);
window.PC_EXTRAS_STATE = sh => { if (!sh) return; st = Object.assign({}, sh); paint(); };

// ---------------- 2. paid inbox ----------------
const tabs = document.querySelector('.tabs');
const tBtn = document.createElement('button'); tBtn.id = 'tPaid'; tBtn.textContent = 'Paid';
tabs.appendChild(tBtn); tabs.style.gridTemplateColumns = 'repeat(' + tabs.children.length + ',1fr)';
const pPaid = document.createElement('section'); pPaid.id = 'pPaid'; pPaid.className = 'hidden';
pPaid.innerHTML = '<div class="panel"><label>Paid messages</label>' +
  '<input type="text" id="pdFind" placeholder="Code from Revolut, e.g. PC-7K3Q" autocomplete="off" autocapitalize="characters">' +
  '<div class="chips" id="pdSizes" style="margin-top:10px"><button class="chip on" data-size="normal">Photos normal</button><button class="chip" data-size="large">Large</button><button class="chip" data-size="full">Full screen</button></div>' +
  '<div class="pd-meta" id="pdState" style="margin-top:8px">Loading...</div><div id="pdList"></div></div>';
pShow.parentNode.insertBefore(pPaid, pShow.nextSibling);
const others = [...tabs.children].filter(b => b !== tBtn);
const sendPanel = $('sendPanel'), againBox = $('againBox');
function openPaid(on) {
  tBtn.classList.toggle('on', on); pPaid.classList.toggle('hidden', !on);
  if (on) { others.forEach(b => b.classList.remove('on')); document.querySelectorAll('#pText,#pPhoto,#pShow').forEach(p => p.classList.add('hidden')); if (sendPanel) sendPanel.classList.add('hidden'); if (againBox) againBox.classList.add('hidden'); refresh(); }
}
tBtn.onclick = () => openPaid(true);
others.forEach(b => b.addEventListener('click', () => openPaid(false)));

let priv = null, topic = '', items = [], busy = false;
let dbp = null;
function db() { if (!dbp) dbp = new Promise((res, rej) => { const r = indexedDB.open('pc-phone-paid', 1); r.onupgradeneeded = () => r.result.createObjectStore('items', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); return dbp; }
async function put(it) { try { const d = await db(); const c = Object.assign({}, it); delete c._url; d.transaction('items', 'readwrite').objectStore('items').put(c); } catch (e) {} }
async function all() { try { const d = await db(); return await new Promise(res => { const r = d.transaction('items').objectStore('items').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); }); } catch (e) { return []; } }

async function setup() {
  const k = await X.paidKey(); if (!k || !k.pub || !k.d) throw new Error('This remote link has no paid-inbox key. Rescan the QR in the Control window.');
  const raw = b64d(k.pub);
  priv = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: b64e(raw.slice(1, 33)), y: b64e(raw.slice(33, 65)), d: k.d, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  topic = 'pcpaid' + hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pc-paid-topic|' + k.pub))).slice(0, 24);
}
async function open(s) {
  const p = String(s || '').split('.'); if (p.length !== 4 || p[0] !== 'pcp1') throw new Error('not ours');
  const pub = await crypto.subtle.importKey('raw', b64d(p[1]), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256);
  const hk = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('pc-paid-v1') }, hk, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  return { msg: JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(p[2]) }, key, b64d(p[3])))), key };
}
async function refresh() {
  if (busy) return; busy = true;
  try {
    if (!priv) { items = await all(); draw(); await setup(); }
    const r = await fetch(`${RELAY}/${topic}/json?poll=1&since=12h`, { cache: 'no-store' });
    if (!r.ok) throw new Error('relay error ' + r.status);
    for (const line of (await r.text()).split('\n')) {
      if (!line.trim()) continue;
      let ev; try { ev = JSON.parse(line); } catch (e) { continue; }
      if (ev.event !== 'message' || items.some(i => i.id === ev.id)) continue;
      let o; try { o = await open(ev.message); } catch (e) { continue; }
      const m = o.msg;
      const it = { id: ev.id, ref: String(m.ref || '').toUpperCase().slice(0, 12), kind: m.kind === 'image' ? 'image' : 'text', text: String(m.text || '').slice(0, 140), caption: String(m.caption || '').slice(0, 60),
        seconds: Math.max(3, Math.min(120, +m.seconds || 10)), price: +m.price || 0, at: (ev.time || 0) * 1000, shown: false };
      if (it.kind === 'image') {
        try { const a = await fetch(ev.attachment.url, { cache: 'no-store' }); if (!a.ok) throw new Error('expired'); const buf = new Uint8Array(await a.arrayBuffer());
          it.img = new Blob([await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, o.key, buf.slice(12))], { type: 'image/jpeg' }); }
        catch (e) { it.imgError = 'photo expired on the relay'; }
      }
      items.push(it); put(it);
    }
    $('pdState').textContent = items.length ? 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · newest first' : 'No paid messages yet (checks every 20 s while open).';
  } catch (e) { $('pdState').textContent = String(e.message || e); }
  busy = false; draw();
}
function draw() {
  const q = $('pdFind').value.trim().toUpperCase().replace(/^PC-?/, '');
  let list = items.slice().sort((a, b) => b.at - a.at);
  if (q) list = list.filter(i => i.ref.replace(/^PC-?/, '').includes(q));
  const box = $('pdList'); box.innerHTML = '';
  if (q && !list.length) { const d = document.createElement('div'); d.className = 'pd-meta'; d.style.marginTop = '10px'; d.textContent = 'No message with that code yet. It may still be arriving.'; box.appendChild(d); }
  for (const it of list.slice(0, 30)) {
    const c = document.createElement('div'); c.className = 'pd-card' + (it.shown ? ' shown' : '');
    c.innerHTML = '<div class="pd-head"><span class="pd-code"></span><span class="pd-meta"></span></div><div class="pd-body"></div><div class="pd-acts"></div>';
    c.querySelector('.pd-code').textContent = it.ref;
    c.querySelector('.pd-meta').textContent = '£' + it.price + ' · ' + it.seconds + ' s · ' + new Date(it.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + (it.shown ? ' · shown' : '');
    const body = c.querySelector('.pd-body');
    if (it.kind === 'text') { const d = document.createElement('div'); d.className = 'pd-txt'; d.textContent = it.text; body.appendChild(d); }
    else if (it.img) { const im = document.createElement('img'); im.src = it._url || (it._url = URL.createObjectURL(it.img)); body.appendChild(im); if (it.caption) { const d = document.createElement('div'); d.className = 'pd-txt'; d.textContent = it.caption; body.appendChild(d); } }
    else { const d = document.createElement('div'); d.className = 'pd-meta'; d.textContent = 'Photo: ' + (it.imgError || 'missing'); body.appendChild(d); }
    const acts = c.querySelector('.pd-acts');
    const btn = (label, cls, fn) => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.onclick = fn; acts.appendChild(b); };
    if (it.kind === 'text') btn('Copy', '', async () => { try { await navigator.clipboard.writeText(it.text); toast('Copied'); } catch (e) { toast('Copy blocked: press and hold the text instead'); } });
    if (it.kind === 'text' || it.img) btn((it.shown ? 'Show again ' : 'Show ') + it.seconds + ' s', it.shown ? '' : 'go', async e => {
      if (!confirm('Put ' + it.ref + ' on screen for ' + it.seconds + ' s? Check it has been paid.')) return;
      const b = e.target; b.disabled = true; b.textContent = 'Sending...';
      try { const ok = it.kind === 'text' ? await X.sendText(it.text, it.seconds) : await X.sendImage(it.img, it.seconds, it.caption, (pPaid.querySelector('#pdSizes .chip.on') || {}).dataset?.size || 'normal'); if (ok !== false) { it.shown = true; put(it); } }
      catch (err) { toast(err.message || String(err), 4000); }
      draw();
    });
    box.appendChild(c);
  }
}
$('pdFind').addEventListener('input', draw);
pPaid.querySelectorAll('#pdSizes .chip').forEach(b => b.onclick = () => pPaid.querySelectorAll('#pdSizes .chip').forEach(x => x.classList.toggle('on', x === b)));
setInterval(() => { if (!pPaid.classList.contains('hidden') && !document.hidden) refresh(); }, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !pPaid.classList.contains('hidden')) refresh(); });
})();
