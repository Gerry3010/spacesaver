import * as THREE from 'three';
import { Starfield } from './starfield.js';
import { Nebula } from './nebula.js';
import { Ship } from './ship.js';
import { Trail } from './trail.js';
import { CameraRig } from './camera-rig.js';
import { CONFIG } from '../core/config.js';

// The persistent base: ship gliding through infinite space.
// Modes only add gameplay on top — the world never resets or cuts.

const _delta = new THREE.Vector3();
const _invAtt = new THREE.Quaternion();

export class World {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x02040c, 0.0035);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2000);
    this.camera.position.set(0, 3.4, 10.5);

    // distant sun + soft fill
    const sun = new THREE.DirectionalLight(0xbfd4ff, 2.6);
    sun.position.set(-40, 55, -80);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xff9a5e, 0.7);
    rim.position.set(60, -20, 40);
    this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight(0x24304a, 0.7));

    this.starfield = new Starfield(this.scene);
    this.nebula = new Nebula(this.scene);
    this.ship = new Ship(this.scene);
    this.trail = new Trail(this.scene);
    this.rig = new CameraRig(this.camera);

    this.speed = CONFIG.idleSpeed; // world units/s flowing past the ship
    this.time = 0;
    this.scroll = 0; // total distance flown — starfield/nebula are pure f(scroll)
    // Explore mode rotates the whole sky: attitude = rotation applied to the
    // background objects; identity everywhere else (zero behavior change)
    this.attitude = new THREE.Quaternion();
    this.shift = new THREE.Vector3(); // star-pattern translation, (0,0,scroll) at identity
    // extra per-frame updaters (entity fields register here so leftovers
    // keep drifting past even when their mode is not active)
    this.updatables = [];
  }

  /**
   * Reduced update while the pause menu is open: stars keep twinkling and
   * existing trail particles fade out, but gameplay (ship steering targets,
   * entities, spawning) is frozen.
   */
  scenicUpdate(dt) {
    // world.time is frozen on purpose — game timers (combo, invulnerability,
    // game-over countdown) must not tick while the menu is open. The shaders
    // get their own clock so stars keep twinkling.
    this._menuTime = (this._menuTime ?? this.time) + dt;
    const t = this._menuTime;
    this._advance(this.speed * 0.12 * dt);
    this.ship.update(dt, t);
    this.starfield.update(this.shift, t, this.attitude);
    this.nebula.update(this.scroll, t, this.attitude);
    this.trail.update(dt);
    this.rig.update(dt, this.ship);
  }

  /** Advance flight distance; at identity attitude shift tracks scroll exactly
   *  (keeps follower-sync scroll corrections effective). */
  _advance(d) {
    this.scroll += d;
    const a = this.attitude;
    if (a.x === 0 && a.y === 0 && a.z === 0 && a.w === 1) {
      this.shift.set(0, 0, this.scroll);
    } else {
      _delta.set(0, 0, d).applyQuaternion(_invAtt.copy(a).invert());
      this.shift.add(_delta);
    }
  }

  update(dt) {
    this._menuTime = null;
    this.time += dt;
    this._advance(this.speed * dt);
    for (const u of this.updatables) u(dt, this.speed);
    this.ship.update(dt, this.time);
    this.starfield.update(this.shift, this.time, this.attitude);
    this.nebula.update(this.scroll, this.time, this.attitude);
    this.trail.emitEngine(dt, this.ship, this.speed);
    this.trail.update(dt);
    this.rig.speedFactor = THREE.MathUtils.clamp((this.speed - CONFIG.idleSpeed) / 90, 0, 1);
    this.rig.update(dt, this.ship);
  }
}
