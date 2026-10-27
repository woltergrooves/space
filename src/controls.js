// Touch-first camerabesturing: één vinger draait, knijpen zoomt, dubbeltik = volgend standpunt.
// Muis/wiel werkt ook (handig bij testen).
import * as THREE from 'three';

export class OrbitTouch {
  constructor(el, camera) {
    this.el = el; this.camera = camera;
    this.target = new THREE.Vector3(); this.goalTarget = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0.1; this.dist = 12;
    this.goal = { yaw: 0, pitch: 0.1, dist: 12 };
    this.vel = { yaw: 0, pitch: 0 };
    this.minDist = 1.6; this.maxDist = 60;
    this.onDoubleTap = null; this.lastInput = 0;
    const pts = new Map(); let lastTap = 0, pinch0 = 0, dist0 = 0;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = this.goal.dist; }
      if (pts.size === 1) { const now = performance.now(); if (now - lastTap < 300) this.onDoubleTap?.(); lastTap = now; }
      this.lastInput = performance.now();
    });
    el.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 1) {
        const k = 3.2 / Math.max(el.clientHeight, 1);
        this.goal.yaw -= dx * k; this.goal.pitch = THREE.MathUtils.clamp(this.goal.pitch + dy * k, -1.4, 1.4);
        this.vel.yaw = -dx * k; this.vel.pitch = dy * k;
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) this.goal.dist = THREE.MathUtils.clamp(dist0 * pinch0 / d, this.minDist, this.maxDist);
      }
      this.lastInput = performance.now();
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.goal.dist = THREE.MathUtils.clamp(this.goal.dist * Math.exp(e.deltaY * 0.001), this.minDist, this.maxDist); }, { passive: false });
  }
  set(p, instant = false) {
    Object.assign(this.goal, { yaw: p.yaw, pitch: p.pitch, dist: p.dist });
    this.goalTarget.copy(p.target);
    if (instant) { this.yaw = p.yaw; this.pitch = p.pitch; this.dist = p.dist; this.target.copy(p.target); }
  }
  update(dt) {
    const idle = performance.now() - this.lastInput > 6000;
    if (idle) this.goal.yaw += dt * 0.012; // langzaam meedrijven als niemand aanraakt
    const k = 1 - Math.exp(-dt * 6);
    this.yaw += (this.goal.yaw - this.yaw) * k; this.pitch += (this.goal.pitch - this.pitch) * k;
    this.dist += (this.goal.dist - this.dist) * k;
    this.target.lerp(this.goalTarget, 1 - Math.exp(-dt * 3));
    const cp = Math.cos(this.pitch);
    this.camera.position.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp).multiplyScalar(this.dist).add(this.target);
    this.camera.lookAt(this.target);
  }
}
