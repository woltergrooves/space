// Weergave: hemel + aarde (shader) en de lokale 3D-scène rond het vaartuig.
// Lokaal frame: vaartuig in de oorsprong, +Y = recht omhoog, -X = baanrichting (oost).
import * as THREE from 'three';
import { Sky, sunlightAt, sceneBrightness } from './sky.js';
import { buildRocket, buildPad, setFlame } from './rocket.js';
import { buildAstronaut } from './astronaut.js';
import { conePoint } from './craft.js';
import { OrbitTouch } from './controls.js';
import { R, MU, PAD_ANGLE, rho, RHO0 } from './physics.js';

const SUN_I = new THREE.Vector3(-0.906, 0.423, 0.25).normalize(); // ochtend op de basis

export class World {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.toneMapping = THREE.ACESFilmicToneMapping; r.autoClear = false;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.sky = new Sky();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.3, 40000);
    this.scene = new THREE.Scene();
    this.controls = new OrbitTouch(canvas, this.camera); this.controls.maxDist = 400;

    // Omgevingslicht (aarde onder, zwart boven) voor metaalreflecties
    const W = 64, H = 32, d = new Float32Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const el = (0.5 - y / (H - 1)) * Math.PI, e = Math.max(0, -Math.sin(el + 0.35)), i = (y * W + x) * 4;
      d[i] = 0.25 * e; d[i + 1] = 0.42 * e; d[i + 2] = 0.65 * e; d[i + 3] = 1;
    }
    const et = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.FloatType);
    et.mapping = THREE.EquirectangularReflectionMapping; et.needsUpdate = true;
    this.scene.environment = new THREE.PMREMGenerator(r).fromEquirectangular(et).texture;

    this.sun = new THREE.DirectionalLight(0xffffff, 3.2); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024); this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x05060a, 0x6b8fc4, 1); this.scene.add(this.hemi);

    this.pad = buildPad(); this.scene.add(this.pad);
    this.objects = []; // losse objecten in het inertiale frame (afgestoten trappen, satelliet)
    this.M = new THREE.Matrix3(); this.sunLocal = new THREE.Vector3(); this.lightCol = new THREE.Color();
    this.skyVis = 1; this.t = 0; this.rocket = null; this.astro = null;
    this.quality = 1; this.photoReq = null;
    addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    const Q = [{ pix: 1, oct: 5, steps: 8, stars: 5000, sh: false }, { pix: 1.5, oct: 6, steps: 12, stars: 8000, sh: true }, { pix: 2, oct: 7, steps: 16, stars: 11000, sh: true }][q];
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pix));
    Object.assign(this.sky.uniforms, {}); this.sky.uniforms.uOct.value = Q.oct; this.sky.uniforms.uSteps.value = Q.steps;
    this.sky.uniforms.uPix.value = this.renderer.getPixelRatio(); this.sky.setStarCount(Q.stars);
    this.renderer.shadowMap.enabled = Q.sh; this.sun.castShadow = Q.sh;
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    this.resize();
  }
  resize() {
    const w = innerWidth, h = innerHeight; this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.fov = w < h ? 66 : 50; this.camera.updateProjectionMatrix();
  }

  // Nieuwe raket in de scène
  setRocket(design, withSat) {
    if (this.rocket) { this.scene.remove(this.rocket.root); }
    for (const o of this.objects) this.scene.remove(o.mesh); this.objects = [];
    this.rocket = buildRocket(design, withSat); this.scene.add(this.rocket.root);
    this.endEva(); this.dropped = 0;
    return this.rocket;
  }
  stackHeight(si) { const st = this.rocket.stages; return si >= st.length ? this.rocket.capsuleBase : st[si].base; }

  // Trap afgestoten: mesh wordt los object, raket-oorsprong schuift naar de nieuwe onderkant
  separate(sim, index) {
    const st = this.rocket.stages[index], g = st.group, s = sim.s;
    const dir = [Math.cos(s.alpha), Math.sin(s.alpha)];
    const oldBase = this.stackHeight(index), newBase = this.stackHeight(index + 1);
    const originY = st.isSM ? st.base + 6.25 : st.base; // oorsprong van de mesh in stapelcoördinaten
    const rel = originY - oldBase;
    g.parent.remove(g); this.scene.add(g);
    if (st.flame) st.flame.visible = false;
    this.objects.push({ mesh: g, p: [s.p[0] + dir[0] * rel, s.p[1] + dir[1] * rel], v: [s.v[0] - dir[0] * 1.5, s.v[1] - dir[1] * 1.5], alpha: s.alpha, spin: (Math.random() - 0.5) * 0.3, life: 0, cda: 3 });
    s.p[0] += dir[0] * (newBase - oldBase); s.p[1] += dir[1] * (newBase - oldBase);
    this.rocket.stack.position.y = -newBase;
  }
  // Hervatte vlucht: al afgestoten delen direct weghalen
  applyState(sim) {
    const s = sim.s;
    for (let i = 0; i < s.si; i++) { const g = this.rocket.stages[i].group; g.parent?.remove(g); }
    this.rocket.stack.position.y = -this.stackHeight(s.si);
    if (s.satReleased && this.rocket.sat) { this.rocket.sat.parent.remove(this.rocket.sat); this.rocket.sat = null; }
  }
  releaseSat(sim) {
    const sat = this.rocket.sat; if (!sat) return;
    sat.updateMatrixWorld(); const wp = new THREE.Vector3(); sat.getWorldPosition(wp);
    sat.parent.remove(sat); this.scene.add(sat);
    const s = sim.s, phi = Math.atan2(s.p[1], s.p[0]);
    const up = [Math.cos(phi), Math.sin(phi)], east = [-Math.sin(phi), Math.cos(phi)];
    const pI = [s.p[0] - east[0] * wp.x + up[0] * wp.y, s.p[1] - east[1] * wp.x + up[1] * wp.y];
    this.objects.push({ mesh: sat, p: pI, v: [s.v[0] + up[0] * 0.4 + east[0] * 0.25, s.v[1] + up[1] * 0.4 + east[1] * 0.25], alpha: s.alpha, spin: 0.15, life: 0, cda: 0.5, keep: true });
    this.rocket.sat = null;
  }

  // Ruimtewandeling
  startEva() {
    if (this.astro) return;
    const c = this.rocket.craft, a = this.astro = buildAstronaut();
    const hold = conePoint(1.35, Math.PI + 0.75, 0.8).p, base = conePoint(1.35, Math.PI + 0.75, 0).p;
    const holder = new THREE.Group(); holder.position.copy(hold);
    holder.quaternion.setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)));
    holder.add(a.group); c.group.add(holder);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, base.distanceTo(hold), 8), c.greyMetal);
    strut.position.copy(base).add(hold).multiplyScalar(0.5); strut.lookAt(hold); strut.rotateX(Math.PI / 2);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.4, 8), c.yellow); bar.position.copy(hold); bar.rotation.x = Math.PI / 2;
    c.group.add(strut, bar);
    this.evaParts = [holder, strut, bar]; this.tetherAnchor = conePoint(0.9, Math.PI, 0.05).p;
  }
  endEva() {
    if (!this.astro) return;
    for (const p of this.evaParts) p.parent?.remove(p);
    if (this.tether) { this.scene.remove(this.tether); this.tether.geometry.dispose(); this.tether = null; }
    this.astro = null;
  }
  astroHead() { return this.astro.body.localToWorld(new THREE.Vector3(0, 0.84, 0)); }

  // Inertiaal (2D) -> lokaal (3D)
  toLocal(pI, sp, out) {
    const dx = pI[0] - sp[0], dy = pI[1] - sp[1], e = this.M.elements; // kolom-major
    return out.set(e[0] * dx + e[3] * dy, e[1] * dx + e[4] * dy, 0);
  }

  update(sim, dt, mode) {
    this.t += dt;
    const s = sim.s, phi = Math.atan2(s.p[1], s.p[0]), alt = Math.hypot(s.p[0], s.p[1]) - R, altR = Math.max(alt, 0) / R;
    const sn = Math.sin(phi), cs = Math.cos(phi);
    this.M.set(sn, -cs, 0, cs, sn, 0, 0, 0, 1);
    const U = this.sky.uniforms;
    U.uOrbit.value.copy(this.M); U.uAlt.value = altR + 0.000004; U.uTime.value += dt * (mode === 'flight' ? 1 : 0.2);
    this.sunLocal.copy(SUN_I).applyMatrix3(this.M); U.uSun.value.copy(this.sunLocal);

    // Raket
    const rk = this.rocket;
    rk.root.rotation.set(0, 0, s.alpha - phi);
    const shake = s.phase === 'flying' && s.throttle > 0 && alt < 20000 ? 0.02 * s.throttle * (1 - alt / 20000) : 0;
    rk.root.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0);
    const vac = 1 - rho(alt) / RHO0;
    rk.stages.forEach((st, i) => {
      if (st.group.parent !== rk.stack && st.group.parent !== rk.craft.group) return;
      const es = s.eng[i];
      const on = i === s.si && s.stages[i].prop > 0 && !(es && es.failed) && s.phase !== 'landed';
      setFlame(st.flame, on ? (es?.limited ? Math.min(s.throttle, 0.7) : s.throttle) : 0, vac, this.t);
    });
    rk.chute.visible = s.chuteState === 'open'; if (rk.chute.visible) { const k = Math.max(0.05, s.chute); rk.chute.scale.set(k, 0.4 + 0.6 * k, k); }
    const heat = Math.min(1, s.flux / 180);
    rk.plasma.material.opacity = heat * 0.75 * (0.85 + 0.15 * Math.sin(this.t * 30)); rk.plasmaLight.intensity = heat * 40;
    rk.plasma.visible = heat > 0.01;
    // toren-arm zwaait weg bij de lancering
    const arm = this.pad.userData.arm; arm.rotation.y = THREE.MathUtils.damp(arm.rotation.y, s.phase === 'pad' && s.throttle === 0 ? 0 : -1.2, 1.5, dt);

    // Lanceerbasis
    const v3 = new THREE.Vector3();
    this.toLocal([Math.cos(PAD_ANGLE) * R, Math.sin(PAD_ANGLE) * R], s.p, v3);
    this.pad.position.copy(v3); this.pad.rotation.set(0, 0, PAD_ANGLE - phi);
    this.pad.visible = v3.length() < 30000;

    // Losse objecten
    for (const o of this.objects) {
      const r = Math.hypot(o.p[0], o.p[1]), g = MU / (r * r), sp = Math.hypot(o.v[0], o.v[1]);
      const steps = Math.ceil(dt * (mode === 'flight' ? sim.warp || 1 : 1) / 0.05);
      const h = dt * (sim.warp || 1) / steps;
      for (let k = 0; k < steps; k++) {
        const rr = Math.hypot(o.p[0], o.p[1]), a = rho(rr - R) * 0.5 * sp * sp * o.cda / 1500;
        o.v[0] += (-g * o.p[0] / rr - (sp > 0 ? o.v[0] / sp * a : 0)) * h; o.v[1] += (-g * o.p[1] / rr - (sp > 0 ? o.v[1] / sp * a : 0)) * h;
        o.p[0] += o.v[0] * h; o.p[1] += o.v[1] * h;
      }
      o.alpha += o.spin * dt; o.life += dt;
      this.toLocal(o.p, s.p, o.mesh.position);
      o.mesh.rotation.set(0, 0, o.alpha - phi);
      o.mesh.visible = o.mesh.position.length() < 20000;
      o.dead = Math.hypot(o.p[0], o.p[1]) < R || (!o.keep && o.life > 90);
    }
    for (const o of this.objects.filter((x) => x.dead)) this.scene.remove(o.mesh);
    this.objects = this.objects.filter((x) => !x.dead);

    // Licht
    sunlightAt(this.sunLocal, altR, this.lightCol);
    this.sun.color.copy(this.lightCol); this.sun.position.copy(this.sunLocal).multiplyScalar(40); this.sun.target.position.set(0, 0, 0);
    const sc = this.sun.shadow.camera, span = s.phase === 'pad' || alt < 200 ? 30 : 12;
    if (sc.right !== span) { Object.assign(sc, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 120 }); sc.updateProjectionMatrix(); }
    const day = THREE.MathUtils.smoothstep(this.sunLocal.y, -0.25, 0.4);
    const air = Math.exp(-alt / 12000);
    this.hemi.color.setRGB(0.02 + 0.35 * air * day, 0.03 + 0.5 * air * day, 0.05 + 0.75 * air * day);
    this.hemi.groundColor.setRGB(0.42 * day * (1 - air * 0.5), 0.56 * day * (1 - air * 0.5), 0.77 * day * (1 - air * 0.5));
    this.hemi.intensity = 0.06 + 1.2 * day;
    this.scene.environmentIntensity = 0.08 + 0.9 * day;

    // Camera
    const target = this.cameraTarget(sim);
    this.controls.goalTarget.copy(target);
    this.controls.update(dt);
    if (this.controls.target.distanceTo(target) > 50) this.controls.target.copy(target);
    this.camera.updateMatrixWorld();

    // EVA
    if (this.astro) { this.astro.update(this.t, dt, this.camera); this.updateTether(); }

    // Oogadaptatie: sterren zichtbaar in het donker en buiten de atmosfeer
    const B = sceneBrightness(this.camera, this.sunLocal, altR);
    const dayAir = THREE.MathUtils.smoothstep(this.sunLocal.y, -0.12, 0.08) * Math.min(1, Math.exp(-alt / 9000) * 1.4);
    const goal = THREE.MathUtils.lerp(1, 0.15, Math.max(B, dayAir)) * (1 - dayAir * 0.95);
    this.skyVis += (goal - this.skyVis) * (1 - Math.exp(-dt * 1.2));
    U.uSkyVis.value = this.skyVis;
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(1.0, 1.5, THREE.MathUtils.clamp((this.skyVis - 0.15) / 0.85, 0, 1));
  }
  cameraTarget(sim) {
    if (this.astro && this.camMode === 'astro') return this.astroHead();
    const rk = this.rocket, base = this.stackHeight(sim.s.si), top = rk.capsuleBase + 3.2;
    const mid = (top - base) * 0.5;
    const ax = new THREE.Vector3(0, mid, 0).applyEuler(rk.root.rotation);
    return ax;
  }
  updateTether() {
    const a = this.astro.waist.getWorldPosition(new THREE.Vector3());
    const b = this.rocket.craft.group.localToWorld(this.tetherAnchor.clone());
    const t = this.t;
    const m1 = a.clone().lerp(b, 0.33).add(new THREE.Vector3(0.2 * Math.sin(t * 0.7), -0.3, -0.25));
    const m2 = a.clone().lerp(b, 0.66).add(new THREE.Vector3(-0.15 * Math.sin(t * 0.6 + 1), -0.2, -0.2));
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, m1, m2, b]), 30, 0.013, 5);
    if (this.tether) { this.tether.geometry.dispose(); this.tether.geometry = geo; }
    else { this.tether = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xe9e2c9, roughness: 0.8 })); this.scene.add(this.tether); }
  }

  render() {
    const r = this.renderer;
    this.sky.sync(this.camera);
    r.clear(); r.render(this.sky.scene, this.sky.camera); r.clearDepth(); r.render(this.scene, this.camera);
    if (this.photoReq) { // direct na het renderen uitlezen
      const c = document.createElement('canvas'), w = 480, h = Math.round(480 * r.domElement.height / r.domElement.width);
      c.width = w; c.height = Math.min(h, 640); const g = c.getContext('2d');
      g.drawImage(r.domElement, 0, (r.domElement.height - c.height * r.domElement.width / w) / 2 * 0, r.domElement.width, c.height * r.domElement.width / w, 0, 0, w, c.height);
      g.filter = 'sepia(0.25) contrast(1.05)'; g.drawImage(c, 0, 0);
      const cb = this.photoReq; this.photoReq = null; cb(c.toDataURL('image/jpeg', 0.72));
    }
  }
}
