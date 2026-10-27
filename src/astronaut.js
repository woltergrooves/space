// Astronaut: licht karikaturaal (groot hoofd, expressieve wenkbrauwen, snor),
// humor via gedrag. Opgebouwd uit eenvoudige vormen met gewrichtsgroepen.
import * as THREE from 'three';
import { fabricTextures } from './textures.js';

const lerp = THREE.MathUtils.lerp, damp = THREE.MathUtils.damp, smooth = THREE.MathUtils.smoothstep;

export function buildAstronaut() {
  const fab = fabricTextures();
  const suit = new THREE.MeshStandardMaterial({ color: 0xebe6da, roughness: 0.92, normalMap: fab.normal, normalScale: new THREE.Vector2(0.5, 0.5) });
  const glove = new THREE.MeshStandardMaterial({ color: 0x77828f, roughness: 0.75 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x3b6db3, metalness: 0.6, roughness: 0.35 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0a987, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.8 });
  const eyeW = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.3 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x8d8f92, roughness: 0.5, metalness: 0.4 });

  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  const joint = (parent, x, y, z) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };

  const body = new THREE.Group();
  // Romp, borstkastje met knoppen, rugzak
  mesh(new THREE.CapsuleGeometry(0.24, 0.32, 6, 16), suit, body, 0, 0.33, 0).scale.set(1, 1, 0.82);
  const chest = mesh(new THREE.BoxGeometry(0.28, 0.15, 0.08), grey, body, 0, 0.4, 0.21);
  [[-0.08, 0xc23b22], [0, 0xe5b52a], [0.08, 0x3b6db3]].forEach(([x, c]) =>
    mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 10), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }), chest, x, 0.02, 0.05).rotation.x = Math.PI / 2);
  const pack = mesh(new THREE.BoxGeometry(0.46, 0.58, 0.22), suit, body, 0, 0.36, -0.3);
  mesh(new THREE.BoxGeometry(0.4, 0.08, 0.02), accent, pack, 0, 0.18, -0.115);
  mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 24), accent, body, 0, 0.66, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.CircleGeometry(0.05, 16), new THREE.MeshStandardMaterial({ color: 0xd9662b, roughness: 0.6 }), body, -0.25, 0.5, 0.05).rotation.y = -Math.PI / 2.4; // missie-embleem

  // Hoofd
  const head = joint(body, 0, 0.84, 0);
  mesh(new THREE.SphereGeometry(0.15, 24, 16), skin, head).scale.set(1, 1.05, 1);
  const cap = mesh(new THREE.SphereGeometry(0.158, 24, 12, 0, Math.PI * 2, 0, Math.PI / 1.9), new THREE.MeshStandardMaterial({ color: 0xf0ebe0, roughness: 0.8 }), head, 0, 0.005, -0.012);
  cap.rotation.x = -0.25;
  mesh(new THREE.TorusGeometry(0.152, 0.012, 6, 24, Math.PI), dark, head, 0, 0.03, -0.01).rotation.y = Math.PI / 2; // band van de comm-cap
  const eyes = [], brows = [], pupils = [];
  for (const s of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(0.032, 14, 10), eyeW, head, s * 0.055, 0.02, 0.122); eyes.push(e);
    pupils.push(mesh(new THREE.SphereGeometry(0.016, 10, 8), black, e, 0, 0, 0.024));
    const b = mesh(new THREE.BoxGeometry(0.065, 0.016, 0.02), dark, head, s * 0.058, 0.072, 0.13); b.userData.s = s; brows.push(b);
    mesh(new THREE.SphereGeometry(0.03, 10, 8), skin, head, s * 0.148, 0.0, 0).scale.set(0.5, 1, 0.8);
  }
  mesh(new THREE.SphereGeometry(0.03, 12, 8), skin, head, 0, -0.012, 0.15).scale.set(1, 0.9, 1.25);
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.06, 0.024, 0.03), dark, head, s * 0.03, -0.05, 0.138).rotation.z = s * -0.18; // snor
  const mouth = mesh(new THREE.BoxGeometry(0.04, 0.008, 0.01), new THREE.MeshStandardMaterial({ color: 0x6a2c22 }), head, 0, -0.08, 0.135);

  // Helm (glas) + omhoog geschoven gouden vizier
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.25, 32, 20),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.03, metalness: 0.1, depthWrite: false }));
  helmet.position.y = 0.84; helmet.renderOrder = 2; body.add(helmet);
  const visor = mesh(new THREE.SphereGeometry(0.262, 32, 12, -1.2, 2.4, 0.05, 0.85),
    new THREE.MeshStandardMaterial({ color: 0xe2b356, metalness: 1, roughness: 0.18 }), body, 0, 0.84, 0);
  visor.rotation.y = 0;
  visor.rotation.x = -0.35;

  // Armen
  const arm = (s) => {
    const sh = joint(body, s * 0.3, 0.55, 0);
    mesh(new THREE.SphereGeometry(0.1, 12, 10), suit, sh);
    mesh(new THREE.CapsuleGeometry(0.085, 0.2, 4, 10), suit, sh, 0, -0.16, 0);
    const el = joint(sh, 0, -0.31, 0);
    mesh(new THREE.CapsuleGeometry(0.08, 0.18, 4, 10), suit, el, 0, -0.14, 0);
    mesh(new THREE.TorusGeometry(0.075, 0.022, 6, 16), accent, el, 0, -0.26, 0).rotation.x = Math.PI / 2;
    const hand = joint(el, 0, -0.33, 0);
    mesh(new THREE.SphereGeometry(0.085, 12, 10), glove, hand).scale.set(1, 1.15, 0.8);
    const thumb = mesh(new THREE.CapsuleGeometry(0.025, 0.05, 4, 8), glove, hand, s * -0.07, 0.02, 0.04);
    thumb.rotation.z = s * 0.6;
    return { sh, el, hand, thumb };
  };
  const R = arm(-1), L = arm(1);

  // Benen
  const leg = (s) => {
    const hip = joint(body, s * 0.13, -0.02, 0);
    mesh(new THREE.CapsuleGeometry(0.11, 0.28, 4, 10), suit, hip, 0, -0.2, 0);
    const kn = joint(hip, 0, -0.42, 0);
    mesh(new THREE.CapsuleGeometry(0.1, 0.26, 4, 10), suit, kn, 0, -0.18, 0);
    mesh(new THREE.BoxGeometry(0.17, 0.13, 0.3), new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.85 }), kn, 0, -0.42, 0.04);
    return { hip, kn };
  };
  const RL = leg(-1), LL = leg(1);

  // Vaste pose rechterarm: houdt een handgreep vast (zijwaarts omhoog)
  R.sh.rotation.set(0.2, 0, -1.9); R.el.rotation.set(0, 0, 0.5);

  // Pivot rond de rechterhand, zodat het lichaam rond de greep schommelt
  body.updateMatrixWorld(true);
  const handLocal = new THREE.Vector3(); R.hand.getWorldPosition(handLocal);
  const pivot = new THREE.Group();
  body.position.copy(handLocal).negate();
  pivot.add(body);

  const waist = new THREE.Object3D(); waist.position.set(0.05, 0.1, -0.2); body.add(waist);

  // --- Gedrag ---
  const tmp = new THREE.Vector3(), camLocal = new THREE.Vector3();
  let blinkT = 2.5, gestureT = 0;
  const st = { look: 0, lookP: 0, wave: 0, point: 0, brow: 0 };

  function update(t, dt, camera) {
    // zachte zweefbeweging rond de greep
    pivot.rotation.x = 0.12 * Math.sin(t * 0.45);
    pivot.rotation.z = 0.08 * Math.sin(t * 0.33 + 1);
    pivot.rotation.y = 0.15 * Math.sin(t * 0.21);
    RL.hip.rotation.x = 0.25 + 0.2 * Math.sin(t * 0.5); LL.hip.rotation.x = 0.05 + 0.2 * Math.sin(t * 0.5 + 1.7);
    RL.kn.rotation.x = -0.5 - 0.2 * Math.sin(t * 0.5 + 0.4); LL.kn.rotation.x = -0.35 - 0.2 * Math.sin(t * 0.5 + 2);
    RL.hip.rotation.z = -0.12; LL.hip.rotation.z = 0.15;

    // camera dichtbij? Dan kijkt hij naar je; anders naar de aarde
    camLocal.copy(camera.position); body.worldToLocal(camLocal);
    const dist = camera.position.distanceTo(body.getWorldPosition(tmp));
    const near = dist < 9 ? 1 : 0;
    const yaw = THREE.MathUtils.clamp(Math.atan2(camLocal.x, camLocal.z), -0.9, 0.9);
    const pitch = THREE.MathUtils.clamp(Math.atan2(camLocal.y - 0.84, Math.hypot(camLocal.x, camLocal.z)), -0.5, 0.5);
    st.look = damp(st.look, near ? yaw : 0.3 * Math.sin(t * 0.1), 2.5, dt);
    st.lookP = damp(st.lookP, near ? pitch : -0.45, 2.5, dt);
    head.rotation.set(-st.lookP * -1, st.look, 0);
    head.rotation.x = -st.lookP;
    for (const p of pupils) { p.position.x = st.look * 0.008; p.position.y = st.lookP * 0.01; }

    // gebaren: wijzen naar de aarde, en zwaaien als je dichtbij bent
    gestureT += dt;
    const c = gestureT % 16;
    st.point = damp(st.point, c > 3 && c < 7 ? 1 : 0, 3, dt);
    st.wave = damp(st.wave, near && c > 9 && c < 12.5 ? 1 : 0, 3, dt);
    const w = Math.sin(t * 9) * st.wave;
    L.sh.rotation.set(lerp(lerp(0.15, 0.9, st.point), 0.3, st.wave), 0, lerp(lerp(0.35, 0.2, st.point), 2.3, st.wave));
    L.el.rotation.set(lerp(lerp(-0.4, -0.05, st.point), -0.2, st.wave), 0, lerp(0, -0.6 + w * 0.5, st.wave));
    L.thumb.scale.setScalar(1 + st.point * 0.3);

    // wenkbrauwen: omhoog bij zwaaien, gefronst bij concentratie
    st.brow = damp(st.brow, st.wave > 0.3 ? 1 : (st.point > 0.5 ? -0.4 : 0), 4, dt);
    for (const b of brows) { b.position.y = 0.072 + st.brow * 0.018; b.rotation.z = b.userData.s * (0.18 * st.brow - 0.1); }
    mouth.scale.x = 1 + st.wave * 0.6; mouth.scale.y = 1 + st.wave * 2;

    // knipperen
    blinkT -= dt; const bl = blinkT < 0.12 ? 0.1 : 1;
    for (const e of eyes) e.scale.y = bl;
    if (blinkT < 0) blinkT = 2.5 + Math.random() * 3;
  }

  return { group: pivot, body, waist, update };
}
