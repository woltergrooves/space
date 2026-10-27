// Capsule "Kievit 3" + servicemodule. Gebouwd met de neus langs +Y (meters),
// daarna als geheel gedraaid. Alleen eenvoudige vormen + procedurele texturen.
import * as THREE from 'three';
import { foilTextures, hullTextures, shieldTexture } from './textures.js';

export const CONE = { r0: 1.9, r1: 0.62, y0: 0.2, y1: 3.05 };
export const coneR = (y) => CONE.r0 - (CONE.r0 - CONE.r1) * (y - CONE.y0) / (CONE.y1 - CONE.y0);
const SLOPE = Math.atan((CONE.r0 - CONE.r1) / (CONE.y1 - CONE.y0));

// Punt + normaal op het kegeloppervlak (lathe: x = sin(phi)*r, z = cos(phi)*r)
export function conePoint(y, phi, off = 0) {
  const n = new THREE.Vector3(Math.sin(phi) * Math.cos(SLOPE), Math.sin(SLOPE), Math.cos(phi) * Math.cos(SLOPE));
  const p = new THREE.Vector3(Math.sin(phi) * coneR(y), y, Math.cos(phi) * coneR(y)).addScaledVector(n, off);
  return { p, n };
}

export function buildCraft() {
  const g = new THREE.Group();
  const add = (geo, mat, setup) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; setup?.(m); g.add(m); return m; };

  const hull = hullTextures('KIEVIT 3');
  const hullMat = new THREE.MeshStandardMaterial({ map: hull.map, normalMap: hull.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.55, metalness: 0.05 });
  const foil = foilTextures();
  const foilMat = new THREE.MeshStandardMaterial({ color: 0xd9a444, metalness: 1, roughness: 0.3, roughnessMap: foil.rough, normalMap: foil.normal, normalScale: new THREE.Vector2(0.9, 0.9) });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, metalness: 0.8, roughness: 0.45 });
  const greyMetal = new THREE.MeshStandardMaterial({ color: 0x9a9a98, metalness: 0.7, roughness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.7 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe5b52a, roughness: 0.5 });

  // Bemanningsmodule (kegel), gelijkmatige punten zodat de textuur niet uitrekt
  const pts = [new THREE.Vector2(1.95, 0), new THREE.Vector2(1.96, 0.1)];
  for (let i = 0; i <= 24; i++) { const y = CONE.y0 + (CONE.y1 - CONE.y0) * i / 24; pts.push(new THREE.Vector2(coneR(y), y)); }
  pts.push(new THREE.Vector2(0.56, 3.12), new THREE.Vector2(0, 3.12));
  add(new THREE.LatheGeometry(pts, 64), hullMat);

  // Hitteschild (bolle kap)
  const a = Math.asin(1.96 / 4.6);
  add(new THREE.SphereGeometry(4.6, 64, 6, 0, Math.PI * 2, Math.PI - a, a),
    new THREE.MeshStandardMaterial({ map: shieldTexture(), roughness: 0.95 }), (m) => (m.position.y = 4.6 * Math.cos(a)));

  // Koppeltunnel + sonde
  add(new THREE.CylinderGeometry(0.36, 0.42, 0.35, 32), greyMetal, (m) => (m.position.y = 3.28));
  add(new THREE.CylinderGeometry(0.05, 0.16, 0.5, 16), darkMetal, (m) => (m.position.y = 3.68));

  // Servicemodule met goudfolie, radiatoren en adapterring
  add(new THREE.CylinderGeometry(1.9, 1.96, 0.25, 64), darkMetal, (m) => (m.position.y = -0.55));
  add(new THREE.CylinderGeometry(1.92, 1.92, 3.6, 64, 1, true), foilMat, (m) => (m.position.y = -2.47));
  for (let k = 0; k < 3; k++) add(new THREE.CylinderGeometry(1.945, 1.945, 2.6, 24, 1, true, k * 2.1 + 0.4, 0.75), white, (m) => (m.position.y = -2.5));
  add(new THREE.CylinderGeometry(1.92, 1.6, 0.3, 64), darkMetal, (m) => (m.position.y = -4.4));

  // Hoofdmotor
  const bell = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; bell.push(new THREE.Vector2(0.32 + 0.66 * Math.pow(t, 1.6), -4.55 - 1.7 * t)); }
  add(new THREE.LatheGeometry(bell, 48), new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.85, roughness: 0.5, side: THREE.DoubleSide }));

  // Antenne
  const dish = new THREE.Group(); dish.position.set(0, -3.2, 2.0); g.add(dish);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8), greyMetal); boom.rotation.x = Math.PI / 2; boom.position.z = 0.5; dish.add(boom);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 8, 0, Math.PI * 2, 0, 0.7), new THREE.MeshStandardMaterial({ color: 0xdedbd2, roughness: 0.6, side: THREE.DoubleSide }));
  bowl.rotation.x = -Math.PI / 2; bowl.position.z = 1.4; bowl.castShadow = true; dish.add(bowl);

  // RCS-blokken
  for (let k = 0; k < 4; k++) {
    const phi = Math.PI / 4 + k * Math.PI / 2, { p, n } = conePoint(2.0, phi, 0.08);
    const blk = add(new THREE.BoxGeometry(0.26, 0.3, 0.16), greyMetal, (m) => { m.position.copy(p); m.lookAt(p.clone().add(n)); });
    for (const [dx, dy] of [[0.17, 0], [-0.17, 0], [0, 0.19], [0, -0.19]]) {
      const noz = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 8), darkMetal);
      noz.position.set(dx, dy, 0); noz.rotation.z = dx ? (dx > 0 ? -Math.PI / 2 : Math.PI / 2) : (dy > 0 ? 0 : Math.PI); blk.add(noz);
    }
  }

  // Ramen met warm binnenlicht (menselijke warmte tegen de koude ruimte)
  const glow = new THREE.MeshStandardMaterial({ color: 0x221a10, emissive: 0xffa956, emissiveIntensity: 1.4, roughness: 0.1 });
  for (const phi of [Math.PI - 0.5, Math.PI + 0.5]) {
    const { p, n } = conePoint(1.75, phi, 0.015);
    add(new THREE.CircleGeometry(0.2, 24), glow, (m) => { m.position.copy(p); m.lookAt(p.clone().add(n)); m.castShadow = false; });
    add(new THREE.TorusGeometry(0.21, 0.035, 8, 24), darkMetal, (m) => { m.position.copy(p); m.lookAt(p.clone().add(n)); });
  }

  // Handgrepen langs het luik (geel)
  for (const phi of [Math.PI - 0.22, Math.PI + 0.22]) {
    const a0 = conePoint(0.7, phi, 0.12).p, a1 = conePoint(2.6, phi, 0.12).p;
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, a0.distanceTo(a1), 8), yellow);
    rail.position.copy(a0).add(a1).multiplyScalar(0.5); rail.lookAt(a1); rail.rotateX(Math.PI / 2); rail.castShadow = true; g.add(rail);
    for (const y of [0.75, 1.65, 2.55]) {
      const s0 = conePoint(y, phi, 0).p, s1 = conePoint(y, phi, 0.12).p;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), yellow);
      post.position.copy(s0).add(s1).multiplyScalar(0.5); post.lookAt(s1); post.rotateX(Math.PI / 2); g.add(post);
    }
  }

  const windowLight = new THREE.PointLight(0xffa956, 0.7, 2.5, 2);
  windowLight.position.copy(conePoint(1.75, Math.PI, 0.6).p); g.add(windowLight);

  return { group: g, yellow, greyMetal };
}
