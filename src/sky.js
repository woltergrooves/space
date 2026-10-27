// Achtergrondlaag: Melkweg, nevels, zon, aarde en atmosfeer in één full-screen shader,
// plus een sterrenveld als punten. Alles in aardstralen; het vaartuig staat op hoogte uAlt.
// Lokaal frame: aarde-middelpunt ligt recht onder het vaartuig (-Y).
import * as THREE from 'three';

// Gedeelde atmosfeer-constanten (shader en CPU gebruiken dezelfde waarden)
export const ATM = {
  HR: 0.0021,            // Rayleigh schaalhoogte (≈13 km, bewust iets dikker dan echt voor leesbaarheid)
  HM: 0.0006,            // Mie schaalhoogte
  tauR: [0.05, 0.12, 0.29], // verticale optische diepte Rayleigh
  tauM: 0.015,
};

const NOISE = /* glsl */`
float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0 - 2.0*f);
  return mix(mix(mix(hash13(i), hash13(i+vec3(1,0,0)), f.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p, int oct){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}
`;

const VERT = /* glsl */`
uniform mat4 uInvProj; uniform mat3 uCamRot;
varying vec3 vDir;
void main(){
  vec4 v = uInvProj * vec4(position.xy, 1.0, 1.0);
  vDir = uCamRot * (v.xyz / v.w);
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}`;

const FRAG = /* glsl */`
uniform mat3 uOrbit;   // inertiaal/aardvast -> lokaal
uniform vec3 uSun;     // lokaal
uniform float uAlt;
uniform float uTime;
uniform float uSkyVis; // zichtbaarheid sterren/nevels (belichtingsaanpassing)
uniform int uOct;
uniform int uSteps;
varying vec3 vDir;

const float RA = 1.016;
const float HR = ${ATM.HR};
const float HM = ${ATM.HM};
const vec3 betaR = vec3(${ATM.tauR.join(',')}) / HR;
const float betaM = ${ATM.tauM} / HM;
const float SUN_I = 7.5;

${NOISE}

vec2 raySphere(vec3 ro, vec3 rd, float r){
  float b = dot(ro, rd); float c = dot(ro, ro) - r*r; float h = b*b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h); return vec2(-b - h, -b + h);
}

vec3 sunTrans(vec3 p){
  float r = length(p); float mu = dot(p / r, uSun);
  vec2 e = raySphere(p, uSun, 0.9995);
  if (e.x > 0.0) return vec3(0.0);
  float h = max(r - 1.0, 0.0);
  float zen = min(degrees(acos(clamp(mu, -1.0, 1.0))), 90.0);
  float am = 1.0 / (max(mu, 0.0) + 0.50572 * pow(96.07995 - zen, -1.6364));
  vec3 od = betaR * HR * exp(-h/HR) * am + vec3(betaM * HM * exp(-h/HM) * am * 1.1);
  return exp(-od);
}

vec3 inscatter(vec3 ro, vec3 rd, float tMax, float jitter, out vec3 trans){
  trans = vec3(1.0);
  vec2 a = raySphere(ro, rd, RA);
  if (a.y < 0.0) return vec3(0.0);
  float t0 = max(a.x, 0.0), t1 = min(a.y, tMax);
  if (t1 <= t0) return vec3(0.0);
  float ds = (t1 - t0) / float(uSteps);
  float mu = dot(rd, uSun);
  float pR = 0.0596831 * (1.0 + mu*mu);
  const float g = 0.76;
  float pM = 0.1193662 * (1.0 - g*g) * (1.0 + mu*mu) / ((2.0 + g*g) * pow(1.0 + g*g - 2.0*g*mu, 1.5));
  vec3 sum = vec3(0.0), od = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    if (i >= uSteps) break;
    vec3 p = ro + rd * (t0 + ds * (float(i) + jitter));
    float h = length(p) - 1.0;
    float dR = exp(-h/HR), dM = exp(-h/HM);
    vec3 so = (betaR*dR + betaM*dM*1.1) * ds;
    sum += exp(-(od + so*0.5)) * sunTrans(p) * (betaR*dR*pR + betaM*dM*pM) * ds;
    od += so;
  }
  trans = exp(-od);
  return sum * SUN_I;
}

vec3 galaxy(vec3 d){
  vec3 N = normalize(vec3(0.35, 0.62, 0.70));
  vec3 C = normalize(cross(N, vec3(0.0, 0.0, 1.0)));
  float lat = dot(d, N);
  float band = exp(-lat*lat / 0.02);
  if (band < 0.002) return vec3(0.0);
  float core = exp(-lat*lat / 0.007) * pow(max(dot(d, C), 0.0), 3.0);
  float n = fbm(d * 7.0, 5);
  float dust = smoothstep(0.42, 0.72, fbm(d * 11.0 + 3.0, 5)) * exp(-lat*lat / 0.005);
  float lum = band * (0.25 + 1.1 * n * n) + core * 1.8;
  lum *= 1.0 - 0.85 * dust;
  vec3 col = mix(vec3(0.55, 0.62, 0.9), vec3(1.0, 0.85, 0.62), clamp(core * 2.0 + n * 0.3, 0.0, 1.0));
  return col * lum * 0.045;
}

vec3 nebula(vec3 d, vec3 c, float size, vec3 colA, vec3 colB, float seed){
  float a = acos(clamp(dot(d, c), -1.0, 1.0));
  float fall = exp(-a*a / (size*size));
  if (fall < 0.004) return vec3(0.0);
  vec3 q = d * (1.6 / size) + seed;
  vec3 w = vec3(fbm(q, 4), fbm(q + 5.2, 4), fbm(q + 9.7, 4));
  float gas = smoothstep(0.38, 0.85, fbm(q * 2.0 + w * 2.2, 5)) * fall;
  float dust = smoothstep(0.48, 0.78, fbm(q * 3.0 + w * 1.5 + 11.0, 4));
  vec3 col = mix(colA, colB, smoothstep(0.4, 0.75, w.x));
  return col * gas * (1.0 - 0.85 * dust) * 0.14;
}

vec3 surface(vec3 q, vec3 n, vec3 rd){
  vec3 w = vec3(fbm(q * 3.0 + 1.3, 4), fbm(q * 3.0 + 7.1, 4), 0.0);
  float c = fbm(q * 6.0 + w.xyx * 1.6, uOct);
  float land = smoothstep(0.512, 0.522, c);
  float lat = abs(q.y);
  float detail = fbm(q * 45.0, 4);
  float arid = fbm(q * 7.0 + 17.0, 4) + (0.25 - abs(lat - 0.38)) * 0.9;
  vec3 ocean = mix(vec3(0.004, 0.018, 0.055), vec3(0.012, 0.07, 0.11), smoothstep(0.44, 0.512, c));
  vec3 lc = mix(vec3(0.045, 0.075, 0.03), vec3(0.30, 0.22, 0.12), smoothstep(0.58, 0.74, arid));
  lc = mix(lc, vec3(0.13, 0.12, 0.10), smoothstep(0.62, 0.78, lat));
  float ridge = 1.0 - abs(fbm(q * 18.0 + 4.0, 4) * 2.0 - 1.0);
  lc *= 0.7 + 0.45 * detail + 0.35 * ridge * ridge * smoothstep(0.53, 0.6, c);
  float ice = smoothstep(0.84, 0.88, lat + (detail - 0.5) * 0.1);
  vec3 col = mix(mix(ocean, lc, land), vec3(0.72, 0.77, 0.82), ice);

  vec3 cq = q * 11.0 + vec3(uTime * 0.0015, 0.0, uTime * 0.0008);
  vec3 cw = vec3(fbm(cq * 0.5, 3), fbm(cq * 0.5 + 4.0, 3), 0.0);
  float cf = fbm(cq + cw.xyx * 1.6, uOct) + (fbm(q * 70.0 + uTime * 0.004, 3) - 0.5) * 0.12;
  float cl = smoothstep(0.535, 0.64, cf) * 0.95;

  float ndl = dot(n, uSun);
  vec3 T = sunTrans(n * 1.0004);
  vec3 h = normalize(uSun - rd);
  float glint = pow(max(dot(n, h), 0.0), 900.0) * 1.2 + pow(max(dot(n, h), 0.0), 120.0) * 0.05;
  vec3 lit = col * max(ndl, 0.0) * T * 3.2 + vec3(glint) * T * (1.0 - land) * (1.0 - ice);
  vec3 cloud = vec3(0.92, 0.93, 0.95) * (max(ndl, 0.0) * 1.6 + 0.08 * smoothstep(-0.1, 0.2, ndl)) * T;
  lit = mix(lit, cloud, cl);

  float night = smoothstep(0.03, -0.12, ndl);
  float city = smoothstep(0.6, 0.82, fbm(q * 140.0, 3)) * smoothstep(0.5, 0.66, fbm(q * 20.0 + 5.0, 3));
  city *= land * (1.0 - ice) * (1.0 - smoothstep(0.6, 0.75, arid));
  lit += vec3(1.0, 0.55, 0.2) * city * night * (1.0 - cl * 0.85) * 0.35;

  vec3 cell = floor(q * 28.0 + vec3(0.0, 0.0, uTime * 0.0));
  float rnd = hash13(cell + floor(uTime * 4.0) * 0.731);
  float flash = step(0.9985, rnd) * smoothstep(0.3, 0.8, cl) * night;
  float dc = length(fract(q * 28.0) - 0.5);
  lit += vec3(0.65, 0.72, 1.0) * flash * exp(-dc * dc * 18.0) * 1.5;
  return lit;
}

void main(){
  vec3 rd = normalize(vDir);
  vec3 ro = vec3(0.0, 1.0 + uAlt, 0.0);
  vec3 dI = transpose(uOrbit) * rd;
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));

  vec2 e = raySphere(ro, rd, 1.0);
  bool hit = e.x > 0.0;
  vec3 trans;
  vec3 ins = inscatter(ro, rd, hit ? e.x : 1e9, jitter, trans);
  vec3 col;
  if (hit) {
    vec3 p = ro + rd * e.x;
    vec3 n = normalize(p);
    col = surface(transpose(uOrbit) * n, n, rd);
  } else {
    float cs = dot(rd, uSun);
    vec3 sky = galaxy(dI);
    sky += nebula(dI, normalize(vec3(-0.55, 0.35, 0.76)), 0.16, vec3(0.85, 0.22, 0.35), vec3(0.95, 0.45, 0.30), 3.0);
    sky += nebula(dI, normalize(vec3(0.62, -0.30, 0.72)), 0.11, vec3(0.25, 0.45, 0.95), vec3(0.55, 0.40, 0.90), 17.0);
    sky += nebula(dI, normalize(vec3(-0.2, -0.85, -0.45)), 0.2, vec3(0.75, 0.3, 0.5), vec3(0.3, 0.5, 0.8), 29.0);
    sky *= uSkyVis;
    float disc = smoothstep(0.99997, 0.999985, cs) * 80.0;
    float glow = pow(max(cs, 0.0), 3000.0) * 6.0 + pow(max(cs, 0.0), 120.0) * 0.25 + pow(max(cs, 0.0), 8.0) * 0.02;
    col = sky + vec3(1.0, 0.97, 0.92) * (disc + glow);
  }
  gl_FragColor = vec4(col * trans + ins, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const STAR_VERT = /* glsl */`
attribute float aMag; attribute vec3 aCol;
uniform mat3 uOrbit; uniform float uSkyVis; uniform float uPix; uniform float uAlt;
varying vec3 vCol; varying float vA;
void main(){
  vec3 d = uOrbit * position;
  vec3 ro = vec3(0.0, 1.0 + uAlt, 0.0);
  float b = dot(ro, d);
  float limb = b < 0.0 ? smoothstep(1.0, 1.012, sqrt(max(dot(ro, ro) - b*b, 0.0))) : 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(d * 1000.0, 1.0);
  float k = clamp((7.0 - aMag) / 8.0, 0.0, 1.0);
  gl_PointSize = mix(1.1, 4.2, k*k) * uPix;
  vA = clamp(pow(2.512, 2.5 - aMag) * 0.7, 0.05, 1.0) * uSkyVis * limb;
  if (limb <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vCol = aCol;
}`;

const STAR_FRAG = /* glsl */`
varying vec3 vCol; varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float a = exp(-dot(c, c) * 14.0) * vA;
  gl_FragColor = vec4(vCol * a * 1.6, 1.0);
  #include <colorspace_fragment>
}`;

function makeStars(count) {
  const pos = new Float32Array(count * 3), mag = new Float32Array(count), col = new Float32Array(count * 3);
  const N = new THREE.Vector3(0.35, 0.62, 0.70).normalize();
  const U = new THREE.Vector3(0, 0, 1).cross(N).normalize(), V = N.clone().cross(U);
  const temps = [[0.7, 0.8, 1.0], [0.85, 0.9, 1.0], [1.0, 1.0, 1.0], [1.0, 0.93, 0.8], [1.0, 0.8, 0.6], [1.0, 0.65, 0.5]];
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    if (Math.random() < 0.4) { // geconcentreerd rond het galactisch vlak
      const a = Math.random() * Math.PI * 2, lat = (Math.random() + Math.random() + Math.random() - 1.5) * 0.25;
      v.copy(U).multiplyScalar(Math.cos(a)).addScaledVector(V, Math.sin(a)).addScaledVector(N, lat).normalize();
    } else {
      const z = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      v.set(r * Math.cos(a), z, r * Math.sin(a));
    }
    v.toArray(pos, i * 3);
    mag[i] = 7.2 - 8.2 * Math.pow(Math.random(), 4.0);
    const t = temps[Math.min(5, Math.floor(Math.pow(Math.random(), 1.3) * 6))];
    col.set(t, i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  return g;
}

export class Sky {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 1, 5000);
    this.uniforms = {
      uInvProj: { value: new THREE.Matrix4() }, uCamRot: { value: new THREE.Matrix3() },
      uOrbit: { value: new THREE.Matrix3() }, uSun: { value: new THREE.Vector3() },
      uAlt: { value: 400 / 6371 }, uTime: { value: 0 }, uSkyVis: { value: 1 },
      uOct: { value: 6 }, uSteps: { value: 12 }, uPix: { value: 1 },
    };
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, depthWrite: false, depthTest: false }));
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.starMat = new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    this.stars = null;
    this.setStarCount(8000);
  }
  setStarCount(n) {
    if (this.stars) { this.scene.remove(this.stars); this.stars.geometry.dispose(); }
    this.stars = new THREE.Points(makeStars(n), this.starMat);
    this.stars.frustumCulled = false; this.stars.renderOrder = 1;
    this.scene.add(this.stars);
  }
  sync(mainCam) {
    const c = this.camera;
    c.fov = mainCam.fov; c.aspect = mainCam.aspect; c.updateProjectionMatrix();
    c.quaternion.copy(mainCam.quaternion); c.updateMatrixWorld();
    this.uniforms.uInvProj.value.copy(c.projectionMatrixInverse);
    this.uniforms.uCamRot.value.setFromMatrix4(c.matrixWorld);
  }
}

// --- CPU-helpers -------------------------------------------------------------

// Zonlicht (kleur*intensiteit) op het vaartuig: schaduw van de aarde + rode overgang.
export function sunlightAt(sun, alt, out) {
  const r = 1 + alt, d = r * sun.y; // p = (0,r,0)
  if (d >= 0) return out.setRGB(1, 1, 1);
  const hmin = Math.sqrt(Math.max(r * r - d * d, 0)) - 1;
  if (hmin <= 0) return out.setRGB(0, 0, 0);
  const am = 38 * Math.exp(-hmin / ATM.HR);
  return out.setRGB(Math.exp(-(ATM.tauR[0] + ATM.tauM) * am), Math.exp(-(ATM.tauR[1] + ATM.tauM) * am), Math.exp(-(ATM.tauR[2] + ATM.tauM) * am));
}

// Grove schatting van hoe fel het beeld is (verlichte aarde / zon in beeld) voor oogadaptatie.
const _d = new THREE.Vector3(), _n = new THREE.Vector3();
export function sceneBrightness(cam, sun, alt) {
  const r = 1 + alt; let lit = 0, total = 0;
  for (let y = -1; y <= 1; y += 0.5) for (let x = -1; x <= 1; x += 0.5) {
    _d.set(x, y, 0.5).unproject(cam).sub(cam.position).normalize();
    total++;
    const b = r * _d.y, c = r * r - 1, h = b * b - c;
    if (h > 0 && -b - Math.sqrt(h) > 0) {
      const t = -b - Math.sqrt(h);
      _n.set(_d.x * t, r + _d.y * t, _d.z * t).normalize();
      lit += THREE.MathUtils.smoothstep(_n.dot(sun), -0.02, 0.3);
    }
  }
  _d.set(0, 0, -1).applyQuaternion(cam.quaternion);
  const sunView = THREE.MathUtils.smoothstep(_d.dot(sun), Math.cos(0.9), Math.cos(0.25));
  const sunUp = sun.y > -Math.sqrt(1 - 1 / (r * r)) ? 1 : 0;
  return Math.min(1, Math.max(lit / total * 1.2, sunView * sunUp));
}
