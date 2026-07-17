import * as THREE from 'three';
import { CONFIG } from '../core/config.js';

// Pooled particle trail (engine exhaust + pickup bursts).
// CPU moves the particles (a few hundred — trivial), shader fades/shrinks by age.

const VERT = /* glsl */ `
  attribute float aAge;
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uLife;
  varying float vFade;
  varying vec3 vColor;
  void main() {
    float t = clamp(aAge / uLife, 0.0, 1.0);
    vFade = 1.0 - t;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * vFade * (240.0 / max(-mv.z, 1.0));
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying float vFade;
  varying vec3 vColor;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float glow = pow(1.0 - d * 2.0, 2.0);
    // additive + hundreds of overlapping particles: keep each one faint
    gl_FragColor = vec4(vColor * glow * vFade * vFade * 0.38, 1.0);
  }
`;

export class Trail {
  constructor(scene) {
    const n = CONFIG.trail.max;
    this.n = n;
    this.life = CONFIG.trail.life;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n).fill(999);
    this.size = new Float32Array(n);
    this.color = new Float32Array(n * 3);
    this.head = 0;
    this.emitAcc = 0;

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.ageAttr = new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.colorAttr = new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aAge', this.ageAttr);
    geo.setAttribute('aSize', this.sizeAttr);
    geo.setAttribute('aColor', this.colorAttr);

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uLife: { value: this.life } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, size, r, g, b) {
    const i = this.head;
    this.head = (i + 1) % this.n;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.age[i] = 0;
    this.size[i] = size;
    this.color[i * 3] = r;
    this.color[i * 3 + 1] = g;
    this.color[i * 3 + 2] = b;
  }

  /** Engine exhaust from both nozzles, rate scaled with world speed
   *  (idles down to embers when the ship stands still in Explore). */
  emitEngine(dt, ship, worldSpeed) {
    this.emitAcc += dt * CONFIG.trail.rate * Math.min(Math.max(worldSpeed / 60, 0.1), 1);
    while (this.emitAcc >= 1) {
      this.emitAcc -= 1;
      for (let k = 0; k < 2; k++) {
        const p = ship.nozzleWorldPos(k);
        this.emit(
          p.x + (Math.random() - 0.5) * 0.18,
          p.y + (Math.random() - 0.5) * 0.18,
          p.z,
          (Math.random() - 0.5) * 1.2 - ship.velX * 0.25,
          (Math.random() - 0.5) * 1.2 - ship.velY * 0.25,
          worldSpeed * 0.55 + Math.random() * 4,
          1.0 + Math.random() * 0.6,
          0.28, 0.85, 1.0
        );
      }
    }
  }

  /** Golden burst when a coin is collected. */
  burst(x, y, z, count = 14) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 4 + Math.random() * 9;
      this.emit(
        x, y, z,
        Math.cos(a) * s,
        Math.sin(a) * s,
        (Math.random() - 0.2) * 10,
        2.0 + Math.random() * 1.2,
        1.0, 0.75, 0.25
      );
    }
  }

  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] >= this.life) continue;
      this.age[i] += dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      // kill before reaching the camera plane — a particle crossing it would
      // momentarily become a giant screen-filling blob
      if (this.pos[i * 3 + 2] > 5.5) this.age[i] = this.life;
    }
    this.posAttr.needsUpdate = true;
    this.ageAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }
}
