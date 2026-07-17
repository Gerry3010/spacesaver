import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { IndexPool } from './pool.js';
import { mulberry32 } from '../core/rng.js';

const _dummy = new THREE.Object3D();
const _hidden = new THREE.Matrix4().makeScale(0, 0, 0);

/** Spinning golden coins, one InstancedMesh = one draw call. */
export class CoinField {
  constructor(scene) {
    const n = CONFIG.coins.max;
    this.pool = new IndexPool(n);
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.spin = new Float32Array(n);

    const geo = new THREE.TorusGeometry(1.25, 0.42, 12, 28);
    // moderate emissive — pushed higher, ACES tone mapping bleaches the
    // gold to white
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffb340,
      metalness: 0.85,
      roughness: 0.3,
      emissive: 0xff8800,
      emissiveIntensity: 0.75,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, _hidden);
    scene.add(this.mesh);

    this.radius = CONFIG.coins.radius;
  }

  spawn(x, y, z) {
    const i = this.pool.acquire();
    if (i === -1) return;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.spin[i] = Math.random() * Math.PI * 2;
  }

  update(dt, speed) {
    this.pool.forEachActive((i) => {
      this.z[i] += speed * dt;
      this.spin[i] += 3.5 * dt;
      if (this.z[i] > CONFIG.killZ) {
        this.remove(i);
        return;
      }
      _dummy.position.set(this.x[i], this.y[i], this.z[i]);
      _dummy.rotation.set(0, this.spin[i], 0);
      _dummy.scale.setScalar(1);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  remove(i) {
    this.pool.release(i);
    this.mesh.setMatrixAt(i, _hidden);
  }

  clear() {
    this.pool.forEachActive((i) => this.mesh.setMatrixAt(i, _hidden));
    this.pool.releaseAll();
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Tumbling rocks. One displaced icosahedron, variety from non-uniform per-instance scale. */
export class AsteroidField {
  constructor(scene) {
    const n = CONFIG.asteroids.max;
    this.pool = new IndexPool(n);
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.scale = new Float32Array(n); // mean scale, used for collision radius
    this.sx = new Float32Array(n);
    this.sy = new Float32Array(n);
    this.sz = new Float32Array(n);
    this.rx = new Float32Array(n);
    this.ry = new Float32Array(n);
    this.rvx = new Float32Array(n);
    this.rvy = new Float32Array(n);

    const rng = mulberry32(4242); // same rock shape in every window
    const geo = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    const seen = new Map(); // displace shared corners identically to keep the hull closed
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      let f = seen.get(key);
      if (f === undefined) {
        f = 1 + (rng() - 0.5) * 0.55;
        seen.set(key, f);
      }
      v.multiplyScalar(f);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0x8d8a86,
      metalness: 0.1,
      roughness: 0.95,
      flatShading: true,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, _hidden);
    scene.add(this.mesh);
  }

  spawn(x, y, z) {
    const i = this.pool.acquire();
    if (i === -1) return;
    const { minScale, maxScale } = CONFIG.asteroids;
    const s = minScale + Math.random() * (maxScale - minScale);
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.sx[i] = s * (0.75 + Math.random() * 0.5);
    this.sy[i] = s * (0.75 + Math.random() * 0.5);
    this.sz[i] = s * (0.75 + Math.random() * 0.5);
    this.scale[i] = (this.sx[i] + this.sy[i] + this.sz[i]) / 3;
    this.rx[i] = Math.random() * Math.PI * 2;
    this.ry[i] = Math.random() * Math.PI * 2;
    this.rvx[i] = (Math.random() - 0.5) * 1.6;
    this.rvy[i] = (Math.random() - 0.5) * 1.6;
  }

  radiusOf(i) {
    return this.scale[i] * CONFIG.asteroids.hitFactor;
  }

  update(dt, speed) {
    this.pool.forEachActive((i) => {
      this.z[i] += speed * dt;
      this.rx[i] += this.rvx[i] * dt;
      this.ry[i] += this.rvy[i] * dt;
      if (this.z[i] > CONFIG.killZ) {
        this.remove(i);
        return;
      }
      _dummy.position.set(this.x[i], this.y[i], this.z[i]);
      _dummy.rotation.set(this.rx[i], this.ry[i], 0);
      _dummy.scale.set(this.sx[i], this.sy[i], this.sz[i]);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  remove(i) {
    this.pool.release(i);
    this.mesh.setMatrixAt(i, _hidden);
  }

  clear() {
    this.pool.forEachActive((i) => this.mesh.setMatrixAt(i, _hidden));
    this.pool.releaseAll();
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
