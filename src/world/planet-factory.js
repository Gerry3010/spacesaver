import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { planetRadius, starRadius, starColorHex, planetType, orbitRadius } from '../game/explore-math.js';

// Procedural star systems for Explore mode: star + corona, planets with
// canvas textures derived from their real properties, decorative orbit rings.
// No asset files — everything generated (repo rule).

function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Palette by planet class and equilibrium temperature. */
function palette(type, eqt, rng) {
  const t = eqt ?? 300;
  if (type === 'jovian' || type === 'neptunian') {
    if (t > 900) return ['#7a4a2a', '#c8865a', '#e8b27a', '#9a6a42']; // hot jupiter
    if (t > 250) return ['#c0a075', '#e0cba5', '#a58a68', '#efe3c0']; // temperate giant
    return ['#3a5f8a', '#5b83b0', '#7fa8cf', '#2e4a6e'];              // ice giant blues
  }
  if (t > 700) return ['#2a1a14', '#7a2e12', '#c85a1e', '#3a2018'];   // lava rock
  if (t > 180) return ['#3a6a4a', '#4a7ba0', '#6a9a70', '#8aa8b8'];   // temperate
  return ['#c8d8e2', '#a8c0d2', '#e8f0f5', '#8aa4b8'];                // ice world
}

function planetTexture(planet, rng) {
  const type = planetType(planet.rade, planet.masse);
  const cols = palette(type, planet.eqt, rng);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');

  if (type === 'jovian' || type === 'neptunian') {
    // horizontal bands with wobble
    const bands = type === 'jovian' ? 7 + Math.floor(rng() * 5) : 4 + Math.floor(rng() * 3);
    for (let b = 0; b < bands; b++) {
      const y0 = (b / bands) * 128;
      const h = 128 / bands + 3;
      x.fillStyle = cols[Math.floor(rng() * cols.length)];
      x.globalAlpha = 0.85;
      x.fillRect(0, y0, 256, h);
      // wobble streaks
      x.globalAlpha = 0.25;
      x.fillStyle = cols[Math.floor(rng() * cols.length)];
      for (let s = 0; s < 5; s++) {
        const sy = y0 + rng() * h;
        x.beginPath();
        x.ellipse(rng() * 256, sy, 20 + rng() * 50, 2 + rng() * 3, 0, 0, Math.PI * 2);
        x.fill();
      }
    }
    if (type === 'jovian' && rng() < 0.5) {
      // great spot
      x.globalAlpha = 0.7;
      x.fillStyle = cols[0];
      x.beginPath();
      x.ellipse(60 + rng() * 140, 40 + rng() * 50, 14 + rng() * 8, 8 + rng() * 4, 0, 0, Math.PI * 2);
      x.fill();
    }
  } else {
    // rocky: base + noise splotches + polar caps for cool worlds
    x.fillStyle = cols[0];
    x.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 90; i++) {
      x.globalAlpha = 0.12 + rng() * 0.2;
      x.fillStyle = cols[1 + Math.floor(rng() * (cols.length - 1))];
      x.beginPath();
      x.ellipse(rng() * 256, rng() * 128, 6 + rng() * 26, 4 + rng() * 14, rng() * 3, 0, Math.PI * 2);
      x.fill();
    }
    if ((planet.eqt ?? 300) < 290) {
      x.globalAlpha = 0.8;
      x.fillStyle = '#f2f7fa';
      x.fillRect(0, 0, 256, 7 + rng() * 8);
      x.fillRect(0, 128 - (7 + rng() * 8), 256, 20);
    }
  }
  x.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function coronaTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let _corona = null;

/**
 * Build one system group at local origin.
 * @returns {{ group, gazeTargets: THREE.Mesh[], planets: {mesh, spin}[], starR: number }}
 */
export function buildSystem(sys) {
  const rng = mulberry32(seedFrom(sys.host));
  const group = new THREE.Group();
  const gazeTargets = [];
  const planets = [];

  // star
  const starR = starRadius(sys.stRad);
  const color = starColorHex(sys.teff);
  const star = new THREE.Mesh(
    new THREE.SphereGeometry(starR, 32, 16),
    new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: color,
      emissiveIntensity: 2.4,
    })
  );
  star.userData = { kind: 'star', sys };
  group.add(star);
  gazeTargets.push(star);

  if (!_corona) _corona = coronaTexture();
  const corona = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: _corona,
      color,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  corona.scale.setScalar(starR * 7);
  group.add(corona);

  // planets on decorative rings
  sys.planets.forEach((p, i) => {
    const oR = orbitRadius(i, starR);
    const angle = rng() * Math.PI * 2;
    const tilt = (rng() - 0.5) * 0.35;

    const ringPts = [];
    for (let k = 0; k <= 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      ringPts.push(new THREE.Vector3(Math.cos(a) * oR, 0, Math.sin(a) * oR));
    }
    const ring = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(ringPts),
      new THREE.LineBasicMaterial({ color: 0x7df5ff, transparent: true, opacity: 0.1 })
    );
    ring.rotation.x = tilt;
    group.add(ring);

    const pr = planetRadius(p.rade);
    const tex = planetTexture(p, rng);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(pr, 24, 16),
      new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.9,
        metalness: 0,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.14, // faintly self-lit so distant planets stay visible
      })
    );
    // axial tilt via a parent, spin on the mesh's own y
    const tiltGroup = new THREE.Group();
    tiltGroup.rotation.z = (rng() - 0.5) * 0.9;
    tiltGroup.add(mesh);
    tiltGroup.position.set(Math.cos(angle) * oR, Math.sin(tilt) * Math.sin(angle) * -oR, Math.sin(angle) * oR * Math.cos(tilt));
    mesh.userData = { kind: 'planet', sys, planet: p };
    group.add(tiltGroup);
    gazeTargets.push(mesh);
    planets.push({ mesh, spin: (0.15 + rng() * 0.5) / Math.sqrt(pr) });
  });

  return { group, gazeTargets, planets, starR };
}
