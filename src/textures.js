// Procedurele canvas-texturen: geen externe assets nodig.
import * as THREE from 'three';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Hoogteveld (grijs canvas) -> normal map
function heightToNormal(src, strength) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, g] = canvas(w, h); const out = g.createImageData(w, h);
  const H = (x, y) => d[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    out.data[i] = (-dx / l * 0.5 + 0.5) * 255; out.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
    out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0); return c;
}

function tex(c, srgb, repeat = [1, 1]) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4; return t;
}

// Gekreukte goudfolie: willekeurige facetten
export function foilTextures() {
  const S = 512, r = rnd(7);
  const [hc, hg] = canvas(S, S);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const x = r() * S, y = r() * S, s = 10 + r() * 50;
    const v = Math.floor(90 + r() * 80);
    hg.fillStyle = `rgba(${v},${v},${v},0.5)`;
    hg.beginPath(); hg.moveTo(x, y);
    for (let k = 0; k < 3; k++) hg.lineTo(x + (r() - 0.5) * s * 2, y + (r() - 0.5) * s * 2);
    hg.fill();
  }
  hg.strokeStyle = 'rgba(40,40,40,0.5)'; // naden van tape
  for (let i = 0; i < 4; i++) { hg.lineWidth = 3; hg.beginPath(); hg.moveTo(0, i * S / 4 + 20); hg.lineTo(S, i * S / 4 + 20); hg.stroke(); }
  const [rc, rg] = canvas(S, S); rg.drawImage(hc, 0, 0); // ruwheid volgt facetten
  rg.globalCompositeOperation = 'difference'; rg.fillStyle = '#404040'; rg.fillRect(0, 0, S, S);
  return { normal: tex(heightToNormal(hc, 6), false, [3, 1]), rough: tex(rc, false, [3, 1]) };
}

// Crèmekleurige gelakte panelen met naden, klinknagels, verbrandingssporen onderaan en naam
export function hullTextures(name) {
  const W = 1024, Hh = 512, r = rnd(3);
  const [cc, cg] = canvas(W, Hh);
  cg.fillStyle = '#e9dfc6'; cg.fillRect(0, 0, W, Hh);
  for (let i = 0; i < 400; i++) { // lichte vlekkerigheid in de lak
    cg.fillStyle = `rgba(${150 + r() * 60},${140 + r() * 50},${110 + r() * 40},0.05)`;
    cg.beginPath(); cg.arc(r() * W, r() * Hh, 5 + r() * 40, 0, 7); cg.fill();
  }
  const grad = cg.createLinearGradient(0, Hh, 0, Hh * 0.55); // schroeisporen bij hitteschild
  grad.addColorStop(0, 'rgba(60,40,25,0.75)'); grad.addColorStop(1, 'rgba(60,40,25,0)');
  cg.fillStyle = grad; cg.fillRect(0, 0, W, Hh);
  for (let i = 0; i < 70; i++) { // strepen
    const x = r() * W; cg.strokeStyle = `rgba(50,32,20,${0.08 + r() * 0.15})`; cg.lineWidth = 2 + r() * 8;
    cg.beginPath(); cg.moveTo(x, Hh); cg.lineTo(x + (r() - 0.5) * 20, Hh * (0.45 + r() * 0.3)); cg.stroke();
  }
  // panelen + klinknagels (ook naar hoogteveld)
  const [hc, hg] = canvas(W, Hh); hg.fillStyle = '#808080'; hg.fillRect(0, 0, W, Hh);
  const cols = 16, rows = 4;
  for (const [g, col, lw] of [[cg, 'rgba(90,80,60,0.55)', 2], [hg, '#303030', 3]]) {
    g.strokeStyle = col; g.lineWidth = lw;
    for (let i = 0; i <= cols; i++) { g.beginPath(); g.moveTo(i * W / cols, 0); g.lineTo(i * W / cols, Hh); g.stroke(); }
    for (let j = 1; j < rows; j++) { g.beginPath(); g.moveTo(0, j * Hh / rows); g.lineTo(W, j * Hh / rows); g.stroke(); }
  }
  hg.fillStyle = '#c0c0c0'; cg.fillStyle = 'rgba(120,110,90,0.6)';
  for (let i = 0; i <= cols; i++) for (let y = 6; y < Hh; y += 16) {
    for (const g of [hg, cg]) { g.beginPath(); g.arc(i * W / cols + 6, y, 2, 0, 7); g.fill(); }
  }
  // luikomlijning + naam (gesjabloneerd)
  cg.strokeStyle = 'rgba(60,55,45,0.8)'; cg.lineWidth = 4; cg.strokeRect(W * 0.46, Hh * 0.22, W * 0.08, Hh * 0.36);
  hg.strokeStyle = '#202020'; hg.lineWidth = 5; hg.strokeRect(W * 0.46, Hh * 0.22, W * 0.08, Hh * 0.36);
  cg.fillStyle = '#c23b22'; cg.fillRect(W * 0.62, Hh * 0.3, 70, 10); cg.fillRect(W * 0.62, Hh * 0.3 + 16, 70, 10);
  cg.save(); cg.translate(W * 0.75, Hh * 0.43); cg.scale(1, 1.6);
  cg.fillStyle = 'rgba(30,30,30,0.85)'; cg.font = 'bold 34px "Arial Narrow", Arial, sans-serif'; cg.textAlign = 'center';
  cg.fillText(name, 0, 0); cg.restore();
  return { map: tex(cc, true), normal: tex(heightToNormal(hc, 2.5), false) };
}

// Ablatief hitteschild: gevlekt donkerbruin
export function shieldTexture() {
  const S = 256, r = rnd(11); const [c, g] = canvas(S, S);
  g.fillStyle = '#3b2b20'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1500; i++) { const v = 25 + r() * 50; g.fillStyle = `rgba(${v + 15},${v},${v - 8},0.35)`; g.fillRect(r() * S, r() * S, 2 + r() * 6, 2 + r() * 6); }
  return tex(c, true, [2, 2]);
}

// Geweven pakstof
export function fabricTextures() {
  const S = 128; const [hc, hg] = canvas(S, S);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 4) {
    hg.fillStyle = 'rgba(255,255,255,0.18)'; hg.fillRect(i, 0, 2, S);
    hg.fillStyle = 'rgba(0,0,0,0.18)'; hg.fillRect(0, i, S, 2);
  }
  return { normal: tex(heightToNormal(hc, 1.5), false, [8, 8]) };
}
