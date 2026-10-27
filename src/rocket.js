// 3D-raket uit een ontwerp: boostertrappen + Kievit (capsule & servicemodule).
// Oorsprong van elke trap = onderkant van de straalpijp. De stapel groeit langs +Y.
import * as THREE from 'three';
import { ENGINES, TANK } from './data.js';
import { buildCraft } from './craft.js';

const CRAFT_BASE = 6.25;      // straalpijp servicemodule onder de capsulebasis
export const CAPSULE_BASE = 0.44; // onderkant hitteschild onder de capsulebasis

let tankTex = null;
function tankTexture() {
  if (tankTex) return tankTex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#ece8df'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#1d1d1f'; // klassiek rolpatroon (helpt bij het zien van rotatie op film)
  g.fillRect(0, 0, 128, 40); g.fillRect(256, 0, 128, 40); g.fillRect(128, 216, 128, 40); g.fillRect(384, 216, 128, 40);
  g.strokeStyle = 'rgba(80,75,65,0.35)'; g.lineWidth = 2;
  for (let x = 0; x < 512; x += 64) { g.beginPath(); g.moveTo(x, 40); g.lineTo(x, 216); g.stroke(); }
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(120,110,90,${Math.random() * 0.06})`; g.fillRect(Math.random() * 512, 40 + Math.random() * 176, 30, 4); }
  g.save(); g.translate(192, 128); g.rotate(-Math.PI / 2); g.fillStyle = '#20232a'; g.font = 'bold 44px Arial'; g.textAlign = 'center'; g.fillText('ERO', 0, 15); g.restore();
  tankTex = new THREE.CanvasTexture(c); tankTex.colorSpace = THREE.SRGBColorSpace; tankTex.anisotropy = 4;
  return tankTex;
}

function flameTexture() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 128; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.15, 'rgba(255,230,160,0.95)');
  gr.addColorStop(0.5, 'rgba(255,140,50,0.5)'); gr.addColorStop(1, 'rgba(255,90,30,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let flameTex = null;
export function makeFlame(radius) {
  flameTex ??= flameTexture();
  const grp = new THREE.Group();
  const geo = new THREE.CylinderGeometry(radius * 0.9, radius * 0.5, 1, 20, 1, true); geo.translate(0, -0.5, 0);
  // UV: v=1 bovenaan (pijp) -> textuur kleurt van wit naar transparant
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  for (const [s, op] of [[1, 0.9], [1.5, 0.35]]) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: flameTex, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.scale.set(s, 1, s); grp.add(m);
  }
  grp.visible = false; grp.userData.r = radius;
  return grp;
}
export function setFlame(f, throttle, vac, t) {
  f.visible = throttle > 0.01;
  if (!f.visible) return;
  const flick = 1 + 0.06 * Math.sin(t * 40) + 0.04 * Math.sin(t * 73);
  const len = (4 + 10 * throttle) * f.userData.r * (1 + vac * 0.6) * flick;
  const wid = 1 + vac * 1.6;
  f.scale.set(wid, len, wid);
}

function bellGeo([r0, r1, L]) {
  const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(r0 + (r1 - r0) * Math.pow(t, 1.5), L - L * t)); }
  return new THREE.LatheGeometry(pts, 32);
}

export function buildRocket(design, withSat) {
  const mats = {
    tank: new THREE.MeshStandardMaterial({ map: tankTexture(), roughness: 0.6, metalness: 0.1 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.6, metalness: 0.6 }),
    bell: new THREE.MeshStandardMaterial({ color: 0x3b3631, metalness: 0.85, roughness: 0.45, side: THREE.DoubleSide }),
    skirt: new THREE.MeshStandardMaterial({ color: 0x55565a, roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide }),
  };
  const root = new THREE.Group(), stack = new THREE.Group(); root.add(stack);
  const stages = []; let y = 0;
  const mesh = (geo, mat, parent, py) => { const m = new THREE.Mesh(geo, mat); m.position.y = py; m.castShadow = m.receiveShadow = true; parent.add(m); return m; };

  design.stages.forEach((s, i) => {
    const e = ENGINES[s.engine], [, , L] = e.bell, g = new THREE.Group();
    g.position.y = y; stack.add(g);
    mesh(bellGeo(e.bell), mats.bell, g, 0);
    mesh(new THREE.CylinderGeometry(0.4, e.bell[0] + 0.05, 0.3, 16), mats.dark, g, L + 0.1);
    mesh(new THREE.CylinderGeometry(TANK.r, TANK.r * 0.9, 0.4, 32), mats.dark, g, L + 0.2);
    const th = s.tanks * TANK.h;
    const tank = mesh(new THREE.CylinderGeometry(TANK.r, TANK.r, th, 40), mats.tank, g, L + 0.4 + th / 2);
    tank.material = mats.tank.clone(); tank.material.map = mats.tank.map.clone(); tank.material.map.repeat.set(1, s.tanks); tank.material.map.wrapT = THREE.RepeatWrapping; tank.material.map.needsUpdate = true;
    const next = design.stages[i + 1], nextL = next ? ENGINES[next.engine].bell[2] : (CRAFT_BASE - 4.55);
    const skirtH = nextL + 0.15;
    mesh(new THREE.CylinderGeometry(TANK.r, TANK.r, skirtH, 40, 1, true), mats.skirt, g, L + 0.4 + th + skirtH / 2);
    mesh(new THREE.TorusGeometry(TANK.r, 0.05, 6, 40), mats.dark, g, L + 0.4 + th + skirtH).rotation.x = Math.PI / 2;
    const flame = makeFlame(e.bell[1]); g.add(flame);
    const height = L + 0.4 + th + 0.15; // volgende trap begint hier (pijp in de rok)
    stages.push({ group: g, flame, height, base: y });
    y += height;
  });

  const craft = buildCraft();
  craft.group.position.y = y + CRAFT_BASE; stack.add(craft.group);
  const omsFlame = makeFlame(0.98); omsFlame.position.y = -CRAFT_BASE; craft.sm.add(omsFlame);
  stages.push({ group: craft.sm, flame: omsFlame, height: CRAFT_BASE - CAPSULE_BASE, base: y, isSM: true });

  // Satelliet in het vak van de servicemodule
  let sat = null;
  if (withSat) { sat = buildSatellite(); sat.position.set(-1.75, -2.6, 0); sat.rotation.z = Math.PI / 2; craft.sm.add(sat); }

  // Parachute
  const chute = buildChute(); chute.position.y = 3.3; chute.visible = false; craft.group.add(chute);

  // Plasma bij terugkeer
  const plasma = new THREE.Mesh(new THREE.SphereGeometry(2.3, 32, 12, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45),
    new THREE.MeshBasicMaterial({ color: 0xff7a30, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  plasma.position.y = 0.9; craft.group.add(plasma);
  const plasmaLight = new THREE.PointLight(0xff8040, 0, 30, 2); plasmaLight.position.y = -1.5; craft.group.add(plasmaLight);

  return { root, stack, stages, craft, sat, chute, plasma, plasmaLight, capsuleBase: y + CRAFT_BASE - CAPSULE_BASE };
}

export function buildSatellite() {
  const g = new THREE.Group();
  const foil = new THREE.MeshStandardMaterial({ color: 0xd9a444, metalness: 1, roughness: 0.35 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x1b2a4a, metalness: 0.5, roughness: 0.3, emissive: 0x050a18 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.55, 8), foil); body.castShadow = true; g.add(body);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.4), panel); p.position.x = s * 0.78; p.castShadow = true; g.add(p);
  }
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.8, 4), new THREE.MeshStandardMaterial({ color: 0xcccccc })); ant.position.y = 0.65; g.add(ant);
  return g;
}

function buildChute() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#f2efe6' : '#e2622b'; g.fillRect(i * 16, 0, 16, 64); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }));
  canopy.position.y = 14 - 9 * Math.cos(Math.PI * 0.42) - 9 * (1 - Math.cos(Math.PI * 0.42)); canopy.castShadow = true;
  canopy.position.y = 14 - 9; grp.add(canopy);
  const pts = []; const rr = 9 * Math.sin(Math.PI * 0.42), yy = 14 - 9 + 9 * Math.cos(Math.PI * 0.42);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; pts.push(0, 0, 0, Math.cos(a) * rr, yy, Math.sin(a) * rr); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  grp.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xcfc8b8 })));
  return grp;
}

// Lanceerbasis (eiland): betonplaat, toren, grond die zacht overloopt in het aardoppervlak
export function buildPad() {
  const g = new THREE.Group();
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  const gr = x.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, 'rgba(150,140,115,1)'); gr.addColorStop(0.25, 'rgba(110,112,80,1)'); gr.addColorStop(0.6, 'rgba(70,90,50,0.9)'); gr.addColorStop(1, 'rgba(60,80,45,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) { x.fillStyle = `rgba(${40 + Math.random() * 60},${50 + Math.random() * 50},${30 + Math.random() * 30},0.25)`; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(700, 48), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.6; ground.receiveShadow = true; g.add(ground);
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9b968c, roughness: 0.95 });
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(22, 24, 2, 40), concrete); slab.position.y = -1; slab.receiveShadow = true; g.add(slab);
  const trench = new THREE.Mesh(new THREE.BoxGeometry(5, 0.1, 30), new THREE.MeshStandardMaterial({ color: 0x1a1918, roughness: 1 })); trench.position.set(0, 0.02, 10); g.add(trench);
  // Toren: roestrood met gele markeringen
  const rust = new THREE.MeshStandardMaterial({ color: 0x8a3b24, roughness: 0.8, metalness: 0.3 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd9a52a, roughness: 0.6 });
  const tower = new THREE.Group(); tower.position.set(6.5, 0, 0); g.add(tower);
  const H = 42;
  for (const [px, pz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, H, 0.3), rust); leg.position.set(px, H / 2, pz); leg.castShadow = true; tower.add(leg);
  }
  for (let yy = 3; yy < H; yy += 3) {
    for (const [w, d, px, pz] of [[2.9, 0.15, 0, -1.3], [2.9, 0.15, 0, 1.3], [0.15, 2.9, -1.3, 0], [0.15, 2.9, 1.3, 0]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, d), yy % 12 === 0 ? yellow : rust); b.position.set(px, yy, pz); b.castShadow = true; tower.add(b);
    }
    const diag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.2, 0.1), rust); diag.position.set(-1.3, yy - 1.5, 0); diag.rotation.x = 0.75; tower.add(diag);
  }
  const arm = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.5, 1.2), rust); arm.position.set(-3.2, 30, 0); arm.castShadow = true; tower.add(arm);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3a20 })); lamp.position.y = H + 0.3; tower.add(lamp);
  g.userData.arm = arm;
  return g;
}
