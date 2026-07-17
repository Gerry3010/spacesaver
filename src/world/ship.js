import * as THREE from 'three';
import { CONFIG } from '../core/config.js';

// Procedural low-poly fighter built from primitives. Forward = -z.
// Steering: modes call setTarget(x, y) every frame; the ship damps toward it
// and derives banking/pitch from its own velocity — that damping is also what
// makes the idle<->game control handover seamless.

export class Ship {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.scale.setScalar(CONFIG.shipScale);
    this.position = this.group.position;
    this.radius = CONFIG.shipRadius;
    this.targetX = 0;
    this.targetY = 0;
    this.velX = 0;
    this.velY = 0;
    this.bank = 0;

    const body = new THREE.MeshStandardMaterial({
      color: 0x39445e,
      metalness: 0.85,
      roughness: 0.35,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x1c2334,
      metalness: 0.7,
      roughness: 0.5,
    });
    const glowCyan = new THREE.MeshStandardMaterial({
      color: 0x113344,
      emissive: 0x37e0ff,
      emissiveIntensity: 1.5,
      metalness: 0.2,
      roughness: 0.4,
    });

    // fuselage — long cone pointing forward
    const fuselage = new THREE.Mesh(new THREE.ConeGeometry(1.05, 5.4, 8), body);
    fuselage.geometry.rotateX(-Math.PI / 2);
    fuselage.position.z = -0.4;
    this.group.add(fuselage);

    // rear engine block
    const block = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.02, 1.3, 8), dark);
    block.geometry.rotateX(Math.PI / 2);
    block.position.z = 2.35;
    this.group.add(block);

    // swept wings
    const wingGeo = new THREE.BoxGeometry(7.2, 0.16, 2.0);
    const wing = new THREE.Mesh(wingGeo, body);
    wing.position.set(0, -0.12, 1.35);
    wing.rotation.y = 0.0;
    this.group.add(wing);
    // sweep: two angled leading-edge strakes
    for (const side of [-1, 1]) {
      const strake = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 1.1), dark);
      strake.position.set(side * 2.1, -0.1, 0.45);
      strake.rotation.y = side * 0.55;
      this.group.add(strake);
      // wingtip fins
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.95, 1.3), dark);
      fin.position.set(side * 3.5, 0.3, 1.5);
      this.group.add(fin);
      // wingtip lights (bloom picks these up)
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), glowCyan);
      tip.position.set(side * 3.5, 0.62, 1.2);
      this.group.add(tip);
    }

    // cockpit
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), glowCyan);
    cockpit.scale.set(0.9, 0.62, 1.7);
    cockpit.position.set(0, 0.52, 0.1);
    this.group.add(cockpit);

    // engine nozzles + emissive cores
    this.cores = [];
    this.nozzleOffsets = [];
    for (const side of [-1, 1]) {
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.7, 10), dark);
      nozzle.geometry.rotateX(Math.PI / 2);
      nozzle.position.set(side * 0.48, -0.05, 3.1);
      this.group.add(nozzle);

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 10, 10),
        new THREE.MeshStandardMaterial({
          color: 0x072033,
          emissive: 0x45d8ff,
          emissiveIntensity: 1.9,
          metalness: 0,
          roughness: 0.3,
        })
      );
      core.position.set(side * 0.48, -0.05, 3.3);
      this.group.add(core);
      this.cores.push(core);
      this.nozzleOffsets.push(new THREE.Vector3(side * 0.48, -0.05, 3.45));
    }

    // engine light spilling onto the hull
    this.engineLight = new THREE.PointLight(0x45d8ff, 30, 22, 2);
    this.engineLight.position.set(0, 0.1, 3.6);
    this.group.add(this.engineLight);

    // shield bubble (invisible until hit / invulnerable)
    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 24, 16),
      new THREE.MeshBasicMaterial({
        color: 0x66eaff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.group.add(this.shield);
    this.shieldFlash = 0;

    scene.add(this.group);
    this._nozzleWorld = new THREE.Vector3();
  }

  setTarget(x, y) {
    const c = CONFIG.corridor;
    this.targetX = THREE.MathUtils.clamp(x, -c.x, c.x);
    this.targetY = THREE.MathUtils.clamp(y, -c.y, c.y);
  }

  nozzleWorldPos(i) {
    return this._nozzleWorld.copy(this.nozzleOffsets[i]).applyMatrix4(this.group.matrixWorld);
  }

  update(dt, time) {
    const px = this.position.x;
    const py = this.position.y;
    // high lambda = snappy steering; the trailing camera keeps it cinematic
    this.position.x = THREE.MathUtils.damp(px, this.targetX, 5.5, dt);
    this.position.y = THREE.MathUtils.damp(py, this.targetY, 5.5, dt);
    this.velX = dt > 0 ? (this.position.x - px) / dt : 0;
    this.velY = dt > 0 ? (this.position.y - py) / dt : 0;

    // banking follows lateral velocity, pitch follows vertical velocity
    this.bank = THREE.MathUtils.damp(this.bank, THREE.MathUtils.clamp(-this.velX * 0.032, -0.55, 0.55), 5, dt);
    this.group.rotation.z = this.bank;
    this.group.rotation.x = THREE.MathUtils.damp(
      this.group.rotation.x,
      THREE.MathUtils.clamp(this.velY * 0.028, -0.5, 0.5),
      5,
      dt
    );
    this.group.rotation.y = this.bank * 0.35;

    // engine flicker
    const flicker = 1.45 + Math.sin(time * 37.0) * 0.25 + Math.sin(time * 13.7) * 0.15;
    for (const core of this.cores) core.material.emissiveIntensity = flicker;
    this.engineLight.intensity = 24 + flicker * 5;

    // shield fade
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 1.6);
    this.shield.material.opacity = this.shieldFlash * 0.55;

    this.group.updateMatrixWorld();
  }

  flashShield(strength = 1) {
    this.shieldFlash = strength;
  }

  /**
   * Hard-set pose from a sync master (follower windows). No damping — at a
   * display seam both windows must show the ship in exactly the same spot.
   */
  snapTo(x, y, bank, pitch) {
    this.position.x = x;
    this.position.y = y;
    this.targetX = x;
    this.targetY = y;
    this.bank = bank;
    this.group.rotation.z = bank;
    this.group.rotation.x = pitch;
    this.group.rotation.y = bank * 0.35;
    this.group.updateMatrixWorld();
  }

  setVisible(v) {
    this.group.visible = v;
  }
}
