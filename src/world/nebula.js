import * as THREE from 'three';

// Deep-space backdrop: an inverted sphere with slow-drifting fbm noise,
// plus a handful of big additive gradient sprites drifting past for parallax.

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.1;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = vDir;
    float t = uTime * 0.008;
    float n1 = fbm(d * 3.0 + vec3(t, 0.0, -t));
    float n2 = fbm(d * 6.0 + vec3(-t * 1.4, t, 4.7));

    // NOTE: these linear values get brightened a lot by the sRGB transfer
    // curve — keep them tiny or space turns gray
    vec3 base = vec3(0.0015, 0.002, 0.006);
    vec3 purple = vec3(0.045, 0.012, 0.075);
    vec3 teal = vec3(0.008, 0.042, 0.055);

    vec3 col = base;
    col += purple * smoothstep(0.5, 0.9, n1);
    col += teal * smoothstep(0.55, 0.95, n2);
    // faint band across the sky, like a distant galactic plane
    float band = pow(1.0 - abs(d.y + 0.15), 6.0);
    col += vec3(0.02, 0.016, 0.035) * band * smoothstep(0.3, 0.7, n1);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export class Nebula {
  constructor(scene) {
    const geo = new THREE.SphereGeometry(900, 32, 24);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 } },
      side: THREE.BackSide,
      depthWrite: false,
    });
    const sphere = new THREE.Mesh(geo, this.mat);
    sphere.renderOrder = -10;
    sphere.frustumCulled = false;
    scene.add(sphere);

    // drifting glow sprites
    const texture = makeGlowTexture();
    const palette = [0x6a3fa0, 0x2f7f8f, 0xa04f7f, 0x3f5fa0];
    this.sprites = [];
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.SpriteMaterial({
        map: texture,
        color: palette[i % palette.length],
        transparent: true,
        opacity: 0.05 + Math.random() * 0.05,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const s = new THREE.Sprite(mat);
      this.resetSprite(s, true);
      s.renderOrder = -5;
      scene.add(s);
      this.sprites.push(s);
    }
  }

  resetSprite(s, anywhere = false) {
    s.position.set(
      (Math.random() - 0.5) * 500,
      (Math.random() - 0.5) * 280,
      anywhere ? -80 - Math.random() * 420 : -480 - Math.random() * 60
    );
    const size = 140 + Math.random() * 180;
    s.scale.set(size, size * (0.6 + Math.random() * 0.5), 1);
  }

  update(dt, speed, time) {
    this.mat.uniforms.uTime.value = time;
    for (const s of this.sprites) {
      s.position.z += speed * 0.22 * dt;
      // recycle well before the camera — an additive sprite crossing the
      // camera plane would wash out the whole frame
      if (s.position.z > -30) this.resetSprite(s);
    }
  }
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
