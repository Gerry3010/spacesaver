import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { mulberry32 } from '../core/rng.js';

// Star positions are static; the vertex shader wraps them around the camera
// with mod() as uScroll grows. Infinity for free, zero CPU work, 3 draw calls.

const VERT = /* glsl */ `
  uniform vec3 uScrollVec;
  uniform float uBox;
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aSeed;
  varying vec3 vColor;
  varying float vSeed;
  void main() {
    // wrap in all three axes so flight can point anywhere (Explore mode)
    vec3 p = mod(position + uScrollVec + uBox * 0.5, vec3(uBox)) - uBox * 0.5;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * (320.0 / max(-mv.z, 1.0));
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
    vSeed = aSeed;
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uBrightness;
  varying vec3 vColor;
  varying float vSeed;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float glow = pow(1.0 - d * 2.0, 2.4);
    float twinkle = 0.78 + 0.22 * sin(uTime * (1.5 + vSeed * 2.5) + vSeed * 6.2831);
    gl_FragColor = vec4(vColor * glow * twinkle * uBrightness, 1.0);
  }
`;

function starColor(rand) {
  // white / ice-blue / warm amber mix
  if (rand < 0.6) return [0.85, 0.9, 1.0];
  if (rand < 0.85) return [0.55, 0.75, 1.0];
  return [1.0, 0.78, 0.5];
}

export class Starfield {
  constructor(scene, worldSeed = 1337) {
    this.layers = [];
    let layerIdx = 0;
    for (const layer of CONFIG.stars.layers) {
      const rng = mulberry32(worldSeed + layerIdx++ * 7919);
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(layer.count * 3);
      const size = new Float32Array(layer.count);
      const color = new Float32Array(layer.count * 3);
      const seed = new Float32Array(layer.count);
      for (let i = 0; i < layer.count; i++) {
        pos[i * 3] = (rng() - 0.5) * layer.box;
        pos[i * 3 + 1] = (rng() - 0.5) * layer.box;
        pos[i * 3 + 2] = (rng() - 0.5) * layer.box;
        size[i] = layer.size * (0.5 + rng());
        const [r, g, b] = starColor(rng());
        color[i * 3] = r;
        color[i * 3 + 1] = g;
        color[i * 3 + 2] = b;
        seed[i] = rng();
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uScrollVec: { value: new THREE.Vector3() },
          uBox: { value: layer.box },
          uTime: { value: 0 },
          uBrightness: { value: layer.brightness },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      scene.add(points);
      this.layers.push({ points, mat, parallax: layer.parallax });
    }
  }

  /**
   * @param {THREE.Vector3} shift accumulated flight translation in star-pattern
   *   space (plain (0,0,scroll) outside Explore — sync-friendly)
   * @param {THREE.Quaternion} attitude rotation applied to the star sky
   */
  update(shift, time, attitude) {
    for (const l of this.layers) {
      l.mat.uniforms.uScrollVec.value.copy(shift).multiplyScalar(l.parallax);
      l.mat.uniforms.uTime.value = time;
      l.points.quaternion.copy(attitude);
    }
  }
}
