/* iPod-classic style hue wheel. makeHueDial(container, {value, onInput(deg), onChange(deg), label})
   Drag around the ring to shift the DJ name colour away from red; tap the centre to reset to red. Used by Control and both phone remotes. */
window.makeHueDial = function (el, opts) {
  opts = opts || {};
  el.innerHTML = '';
  const size = opts.size || 168;
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:relative;width:${size}px;height:${size}px;border-radius:50%;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;
    background:conic-gradient(from 0deg, hsl(355,100%,55%), hsl(45,100%,55%), hsl(95,100%,50%), hsl(175,100%,50%), hsl(235,100%,62%), hsl(295,100%,60%), hsl(355,100%,55%));
    box-shadow:0 0 0 1px #3a3a46, 0 6px 22px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.15);`;
  const hub = document.createElement('div');
  hub.style.cssText = `position:absolute;left:22%;top:22%;width:56%;height:56%;border-radius:50%;background:radial-gradient(circle at 40% 35%,#2a2a33,#121217);
    box-shadow:inset 0 2px 6px rgba(0,0,0,.6), 0 0 0 1px #3a3a46;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;`;
  const sw = document.createElement('div'); sw.style.cssText = 'font:900 15px/1 -apple-system,Helvetica,Arial;letter-spacing:.08em;';
  sw.textContent = opts.label || 'NAME';
  const deg = document.createElement('div'); deg.style.cssText = 'font:600 11px/1 -apple-system,Helvetica,Arial;color:#9a9aa8;';
  const knob = document.createElement('div');
  knob.style.cssText = `position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px rgba(0,0,0,.55),0 0 10px rgba(255,255,255,.6);pointer-events:none;`;
  hub.appendChild(sw); hub.appendChild(deg); wrap.appendChild(hub); wrap.appendChild(knob); el.appendChild(wrap);
  let v = ((+opts.value || 0) % 360 + 360) % 360, dragging = false, lastSent = 0;
  function paint() {
    const a = (v - 90) * Math.PI / 180, r = size * 0.39;
    knob.style.left = (size / 2 + Math.cos(a) * r) + 'px'; knob.style.top = (size / 2 + Math.sin(a) * r) + 'px';
    sw.style.color = `hsl(${(355 + v) % 360},100%,60%)`; sw.style.textShadow = `0 0 10px hsl(${(355 + v) % 360},100%,50%)`;
    deg.textContent = v === 0 ? 'red (tap to reset)' : Math.round(v) + '°';
  }
  function fromEvent(e) {
    const b = wrap.getBoundingClientRect(), x = e.clientX - b.left - size / 2, y = e.clientY - b.top - size / 2;
    if (Math.hypot(x, y) < size * 0.27) return null;               // the hub is the reset button
    let a = Math.atan2(y, x) * 180 / Math.PI + 90; a = (a % 360 + 360) % 360;
    return Math.abs(a) < 4 || Math.abs(a - 360) < 4 ? 0 : a;       // snap back to red near the top
  }
  wrap.addEventListener('pointerdown', e => { const a = fromEvent(e); if (a === null) return; dragging = true; wrap.setPointerCapture(e.pointerId); v = a; paint(); opts.onInput && opts.onInput(v); });
  wrap.addEventListener('pointermove', e => { if (!dragging) return; const a = fromEvent(e); if (a === null) return; v = a; paint(); const now = Date.now(); if (opts.onInput && now - lastSent > 60) { lastSent = now; opts.onInput(v); } });
  const end = () => { if (!dragging) return; dragging = false; opts.onInput && opts.onInput(v); opts.onChange && opts.onChange(v); };
  wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
  hub.addEventListener('click', () => { v = 0; paint(); opts.onInput && opts.onInput(0); opts.onChange && opts.onChange(0); });
  paint();
  return { set(x) { if (dragging) return; v = ((+x || 0) % 360 + 360) % 360; paint(); }, get: () => v };
};
