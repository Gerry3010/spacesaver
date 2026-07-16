import * as THREE from 'three';

// Damped chase cam: trails the ship slower than the ship moves (so the ship
// travels within the frame), rolls with the bank, shakes on impact and widens
// its FOV as the world speeds up.

const BASE_FOV = 62;

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.camera.fov = BASE_FOV;
    this.offset = new THREE.Vector3(0, 3.2, 12.5);
    this.lookAhead = new THREE.Vector3(0, 0.6, -22);
    this.shake = 0;
    this._target = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this.speedFactor = 0; // 0 idle .. 1 max speed
  }

  addShake(strength) {
    this.shake = Math.min(this.shake + strength, 1.5);
  }

  update(dt, ship) {
    this._target.copy(ship.position).add(this.offset);
    const p = this.camera.position;
    p.x = THREE.MathUtils.damp(p.x, this._target.x * 0.72, 2.0, dt);
    p.y = THREE.MathUtils.damp(p.y, this._target.y * 0.72 + this.offset.y * 0.28, 2.0, dt);
    p.z = this.offset.z;

    this.shake = Math.max(0, this.shake - dt * 2.2);
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.9;
      p.x += (Math.random() - 0.5) * s;
      p.y += (Math.random() - 0.5) * s;
    }

    this._look.copy(ship.position).add(this.lookAhead);
    this.camera.lookAt(this._look);
    // roll a fraction of the ship's bank for that swoopy feel
    this.camera.rotateZ(-ship.bank * 0.35);

    const fov = BASE_FOV + this.speedFactor * 9;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 2.0, dt);
      this.camera.updateProjectionMatrix();
    }
  }
}
