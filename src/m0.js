// M0 — sfeertest: capsule + astronaut in een lage baan, aarde, sterren, Melkweg, nevels.
import * as THREE from 'three';
import { Sky, sunlightAt, sceneBrightness } from './sky.js';
import { buildCraft, conePoint } from './craft.js';
import { buildAstronaut } from './astronaut.js';
import { OrbitTouch } from './controls.js';

const $ = (s) => document.querySelector(s);
const store = {
  get() { try { return JSON.parse(localStorage.getItem('longrace.m0') || '{}'); } catch { return {}; } },
  set(v) { try { localStorage.setItem('longrace.m0', JSON.stringify(v)); } catch { /* privémodus */ } },
};
const saved = store.get();

// --- Renderer ---------------------------------------------------------------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.autoClear = false;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const QUALITY = [
  { name: 'Laag', pix: 1.0, oct: 5, steps: 8, stars: 5000, shadows: false },
  { name: 'Middel', pix: 1.5, oct: 6, steps: 12, stars: 8000, shadows: true },
  { name: 'Hoog', pix: 2.0, oct: 7, steps: 16, stars: 11000, shadows: true },
];
let q = saved.q ?? 1;

const sky = new Sky();
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 400);
const scene = new THREE.Scene();

// Omgevingsreflectie: aarde-blauw van onder, zwart van boven
{
  const W = 64, H = 32, d = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = 1 - y / (H - 1), el = (v - 0.5) * Math.PI; // -π/2 .. π/2
    const e = Math.max(0, -Math.sin(el + 0.35)), i = (y * W + x) * 4;
    d[i] = 0.25 * e; d[i + 1] = 0.42 * e; d[i + 2] = 0.65 * e; d[i + 3] = 1;
  }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.FloatType);
  t.mapping = THREE.EquirectangularReflectionMapping; t.needsUpdate = true;
  scene.environment = new THREE.PMREMGenerator(renderer).fromEquirectangular(t).texture;
}

// --- Licht ------------------------------------------------------------------
const sunLight = new THREE.DirectionalLight(0xffffff, 3.2);
sunLight.castShadow = true; sunLight.shadow.mapSize.set(1024, 1024);
Object.assign(sunLight.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 70 });
sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.03;
scene.add(sunLight, sunLight.target);
const earthLight = new THREE.HemisphereLight(0x05060a, 0x6b8fc4, 1);
scene.add(earthLight);

// --- Vaartuig + astronaut -----------------------------------------------------
const craft = buildCraft();
craft.group.rotation.z = Math.PI / 2; // neus vooruit (prograde = -X)
scene.add(craft.group);

const astro = buildAstronaut();
const holdLocal = conePoint(1.35, Math.PI + 0.75, 0.8).p;
{ // handgreep op een steun, precies waar de hand zit
  const base = conePoint(1.35, Math.PI + 0.75, 0).p;
  const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, base.distanceTo(holdLocal), 8), craft.greyMetal);
  strut.position.copy(base).add(holdLocal).multiplyScalar(0.5); strut.lookAt(holdLocal); strut.rotateX(Math.PI / 2);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.4, 8), craft.yellow);
  bar.position.copy(holdLocal); bar.rotation.x = Math.PI / 2;
  strut.castShadow = bar.castShadow = true;
  craft.group.add(strut, bar);
}
const astroHolder = new THREE.Group();
astroHolder.position.copy(holdLocal);
// astronaut rechtop in de wereld, gezicht naar de camera (-Z)
astroHolder.quaternion.copy(craft.group.quaternion).invert().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)));
astroHolder.add(astro.group);
craft.group.add(astroHolder);

const tetherAnchor = conePoint(0.9, Math.PI, 0.05).p;
const tetherMat = new THREE.MeshStandardMaterial({ color: 0xe9e2c9, roughness: 0.8 });
let tether = null;
function updateTether(t) {
  const a = astro.waist.getWorldPosition(new THREE.Vector3());
  const b = craft.group.localToWorld(tetherAnchor.clone());
  const m1 = a.clone().lerp(b, 0.33).add(new THREE.Vector3(0.2 * Math.sin(t * 0.7), -0.35 + 0.1 * Math.sin(t * 0.5), -0.25));
  const m2 = a.clone().lerp(b, 0.66).add(new THREE.Vector3(-0.15 * Math.sin(t * 0.6 + 1), -0.25, -0.2));
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, m1, m2, b]), 40, 0.013, 5);
  if (tether) { tether.geometry.dispose(); tether.geometry = geo; }
  else { tether = new THREE.Mesh(geo, tetherMat); tether.castShadow = true; scene.add(tether); }
}

// --- Camera -------------------------------------------------------------------
const controls = new OrbitTouch(canvas, camera);
const headPos = () => astro.body.localToWorld(new THREE.Vector3(0, 0.84, 0));
const PRESETS = [
  { name: 'Capsule', get: () => ({ target: new THREE.Vector3(-0.6, 0, -0.5), yaw: -0.5, pitch: 0.12, dist: 13 }) },
  { name: 'Astronaut', get: () => ({ target: headPos(), yaw: 0.25, pitch: 0.05, dist: 2.4 }) },
  { name: 'Uitzicht', get: () => ({ target: new THREE.Vector3(-0.6, 0, 0), yaw: -1.2, pitch: 0.06, dist: 26 }) },
];
let preset = saved.cam ?? 0;

// --- Baan & tijd --------------------------------------------------------------
const OMEGA = 2 * Math.PI / (92.6 * 60); // rad/s bij 400 km
const WARPS = [1, 10, 60];
let warp = saved.warp ?? 1;
let theta = saved.theta ?? 0.9, missionT = saved.missionT ?? 0;
const SUN0 = new THREE.Vector3(1, 0, 0.35).normalize();
const orbitM4 = new THREE.Matrix4(), sun = new THREE.Vector3(), lightCol = new THREE.Color();
let skyVis = 1, t = 0;

// --- UI -----------------------------------------------------------------------
const btnCam = $('#bCam'), btnTime = $('#bTime'), btnQ = $('#bQ'), btnHide = $('#bHide');
function refreshUI() {
  btnCam.textContent = `Camera: ${PRESETS[preset].name}`;
  btnTime.textContent = `Tijd ×${WARPS[warp]}`;
  btnQ.textContent = `Kwaliteit: ${QUALITY[q].name}`;
}
function save() { store.set({ q, cam: preset, warp, theta, missionT }); }
function toast(msg, ms = 3500) { const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), ms); }
btnCam.onclick = () => { preset = (preset + 1) % PRESETS.length; controls.set(PRESETS[preset].get()); refreshUI(); save(); };
controls.onDoubleTap = () => btnCam.onclick();
btnTime.onclick = () => { warp = (warp + 1) % WARPS.length; refreshUI(); save(); };
btnQ.onclick = () => { q = (q + 1) % QUALITY.length; applyQuality(); refreshUI(); save(); };
btnHide.onclick = (e) => { e.stopPropagation(); document.body.classList.add('clean'); toast('Tik met twee vingers tegelijk om de knoppen terug te halen', 2500); };
canvas.addEventListener('touchstart', (e) => { if (e.touches.length >= 2 && document.body.classList.contains('clean')) { document.body.classList.remove('clean'); } });
canvas.addEventListener('dblclick', () => document.body.classList.remove('clean'));
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
addEventListener('pagehide', save);

function applyQuality() {
  const Q = QUALITY[q];
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pix));
  sky.uniforms.uOct.value = Q.oct; sky.uniforms.uSteps.value = Q.steps;
  sky.uniforms.uPix.value = renderer.getPixelRatio();
  sky.setStarCount(Q.stars);
  renderer.shadowMap.enabled = Q.shadows; sunLight.castShadow = Q.shadows;
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  resize();
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w < h ? 68 : 52; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// --- Lus ------------------------------------------------------------------------
let last = performance.now(), fpsAcc = 0, fpsN = 0, lowFpsTime = 0, autoChecked = saved.q !== undefined;
const clockEl = $('#clock'), statusEl = $('#status'), fpsEl = $('#fps');
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1); last = now; t += dt;
  theta += OMEGA * WARPS[warp] * dt; missionT += dt * WARPS[warp];

  orbitM4.makeRotationZ(theta);
  sky.uniforms.uOrbit.value.setFromMatrix4(orbitM4);
  sun.copy(SUN0).applyMatrix4(orbitM4);
  sky.uniforms.uSun.value.copy(sun);
  sky.uniforms.uTime.value = missionT;

  // licht op het vaartuig
  sunlightAt(sun, sky.uniforms.uAlt.value, lightCol);
  sunLight.color.copy(lightCol); sunLight.intensity = 3.2;
  sunLight.position.copy(sun).multiplyScalar(30);
  const earthLit = THREE.MathUtils.smoothstep(sun.y, -0.3, 0.6);
  earthLight.intensity = 0.06 + 1.3 * earthLit;
  scene.environmentIntensity = 0.08 + 0.9 * earthLit;

  astro.update(t, dt, camera);
  updateTether(t);
  if (preset === 1) controls.goalTarget.copy(headPos());
  controls.update(dt);
  camera.updateMatrixWorld();

  // oogadaptatie: sterren en nevels verschijnen in het donker
  const B = sceneBrightness(camera, sun, sky.uniforms.uAlt.value);
  skyVis += (THREE.MathUtils.lerp(1, 0.15, B) - skyVis) * (1 - Math.exp(-dt * 1.2));
  sky.uniforms.uSkyVis.value = skyVis;
  renderer.toneMappingExposure = THREE.MathUtils.lerp(1.0, 1.5, (skyVis - 0.15) / 0.85);

  sky.sync(camera);
  renderer.clear();
  renderer.render(sky.scene, sky.camera);
  renderer.clearDepth();
  renderer.render(scene, camera);

  // HUD
  const s = Math.floor(missionT), hh = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60, ss = s % 60;
  clockEl.textContent = `T+ ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  statusEl.textContent = lightCol.r < 0.01 ? 'Nachtzijde — in de schaduw van de aarde' : (lightCol.b < 0.8 ? 'Zonsopkomst / -ondergang' : 'Dagzijde');
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1) {
    const fps = fpsN / fpsAcc; fpsEl.textContent = `${fps.toFixed(0)} fps`; fpsAcc = 0; fpsN = 0;
    if (!autoChecked && t > 3) { // automatisch een stap omlaag als het hapert
      lowFpsTime = fps < 38 ? lowFpsTime + 1 : 0;
      if (lowFpsTime >= 3 && q > 0) { q--; applyQuality(); refreshUI(); toast(`Kwaliteit verlaagd naar ${QUALITY[q].name} voor soepeler beeld`); lowFpsTime = 0; }
      if (t > 15) { autoChecked = true; save(); }
    }
  }
  if (Math.floor(t) % 5 === 0 && Math.floor(t - dt) % 5 !== 0) save();
  requestAnimationFrame(frame);
}

applyQuality(); refreshUI();
controls.set(PRESETS[preset].get(), true);
toast('Sleep om rond te kijken · knijp om te zoomen · dubbeltik voor ander standpunt', 5000);
window.__longrace = { controls, setTheta: (v) => (theta = v), setPreset: (i) => { preset = i; controls.set(PRESETS[i].get(), true); refreshUI(); } };
requestAnimationFrame(frame);
