import * as THREE from 'three';
import systemsData from '../data/systems.json';
import { buildSystem } from '../world/planet-factory.js';
import { ExploreHud } from '../ui/explore-hud.js';
import { turnRate, approachSpeed, angleDelta, systemPosition, starColorHex } from '../game/explore-math.js';

// Explore: ~26 real star systems floating in one big volume. Pick a target
// from the list (L), the autopilot flies you there and brakes; look around
// with the mouse (push away from center to turn), scroll wheel = throttle.
// Gazing at a planet or star shows its real data. No idle timeout — reading
// is allowed. Desktop-only (registered only for fine pointers, see main.js).

const MAX_SPEED = 260;
const _fwd = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _sysPos = new THREE.Vector3();

export const exploreMode = {
  id: 'explore',
  label: 'Explore',
  universe: null,

  _init(ctx) {
    if (this.universe) return;
    this.universe = new THREE.Group();
    this.systems = [];
    systemsData.systems.forEach((sys, i) => {
      const built = buildSystem(sys);
      const [x, y, z] = systemPosition(i);
      built.group.position.set(x, y, z);
      built.pos = new THREE.Vector3(x, y, z);
      built.sys = sys;
      built.arrive = built.starR * 6 + 60;
      this.universe.add(built.group);
      this.systems.push(built);
    });
    this.gazeTargets = this.systems.flatMap((s) => s.gazeTargets);
    ctx.world.scene.add(this.universe);

    // one shared point light, parked at the nearest star (26 real lights
    // would drown the forward renderer)
    this.starLight = new THREE.PointLight(0xffffff, 3000, 900, 1.6);
    this.universe.add(this.starLight);

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 700;
    this.hud = new ExploreHud();
    this.hud.onSelect = (i) => this._flyTo(i);
    this.hud.onTeleport = (i) => this._teleport(i);
    this.hud.setMapData(this.systems.map((s) => ({
      host: s.sys.host,
      x: s.pos.x,
      z: s.pos.z,
      colorHex: starColorHex(s.sys.teff),
      planets: s.sys.planets.length,
    })));
    this.visited = new Set();
    this.worldPos = new THREE.Vector3();
    this.heading = new THREE.Quaternion();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');

    // "charted space" edge: just beyond the furthest star system
    let far = 0;
    for (const s of this.systems) far = Math.max(far, s.pos.length() + s.arrive);
    this.edge = far + 900;
  },

  enter(ctx) {
    this._init(ctx);
    this.universe.visible = true;
    // start just outside Sol, looking at the sun
    this.yaw = 0;
    this.pitch = 0;
    this.worldPos.set(0, 10, 330);
    // demo hovers at Sol first (throttle 0) before the tour picks it up
    this.throttle = ctx.isDemo?.() ? 0 : 0.25;
    this.autopilot = null;
    this.gazeCooldown = 0;
    this.tourWait = 0;
    this.nearestIdx = 0;
    this.visited.add('Sol');
    ctx.hud.setPlaying(false);
    this.hud.setActive(true);
    this.hud.renderList(systemsData.systems, this.visited, 0);

    // ?goto=<host>: immediate autopilot target (headless screenshots/tuning)
    const goto_ = new URLSearchParams(location.search).get('goto');
    if (goto_) {
      const i = this.systems.findIndex((x) => x.sys.host.toLowerCase() === goto_.toLowerCase());
      if (i >= 0) this._flyTo(i);
    }
  },

  _flyTo(i) {
    this.autopilot = this.systems[i];
    this.hud.renderList(systemsData.systems, this.visited, i);
  },

  /** Instant jump from the star map: drop in just outside the star, facing it. */
  _teleport(i) {
    const t = this.systems[i];
    _dir.set(0, t.starR * 1.6, t.arrive + 30); // offset from the star
    this.worldPos.copy(t.pos).add(_dir);
    _dir.copy(t.pos).sub(this.worldPos).normalize();
    this.yaw = Math.atan2(-_dir.x, -_dir.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(_dir.y, -1, 1));
    this.throttle = 0;
    this.autopilot = null;
    this.visited.add(t.sys.host);
    this.hud.renderList(systemsData.systems, this.visited, -1);
  },

  /** Demo tour: head to the nearest system we haven't shown yet, loop forever. */
  _tourNext() {
    this.tourWait = 0;
    let bestI = -1;
    let best = Infinity;
    for (let i = 0; i < this.systems.length; i++) {
      if (this.visited.has(this.systems[i].sys.host)) continue;
      const d = this.systems[i].pos.distanceToSquared(this.worldPos);
      if (d < best) { best = d; bestI = i; }
    }
    if (bestI < 0) {
      // seen them all — reset and start a fresh loop from where we are
      this.visited.clear();
      this.visited.add(this.systems[this.nearestIdx].sys.host);
      bestI = this.nearestIdx;
    }
    this._flyTo(bestI);
  },

  update(dt, ctx) {
    const { world, input } = ctx;

    // the star map is a modal overlay: freeze steering/throttle/gaze while it's
    // open (the mouse is picking a target, not flying), but keep the world alive.
    // demo does the same — it's a hands-off tour, the mouse must not hijack it.
    const mapOpen = this.hud.mapOpen;
    const demo = ctx.isDemo?.();
    const locked = mapOpen || demo;

    // throttle
    const wheel = locked ? 0 : input.consumeWheel();
    if (wheel !== 0) {
      this.throttle = THREE.MathUtils.clamp(this.throttle - wheel * 0.0005, 0, 1);
      if (this.autopilot) this.autopilot = null; // manual override
    }

    // steering (suppressed while the map is open or in demo)
    const yawRate = locked ? 0 : -turnRate(input.nx);
    const pitchRate = locked ? 0 : turnRate(input.ny);
    let speed;

    if (this.autopilot) {
      const t = this.autopilot;
      _dir.copy(t.pos).sub(this.worldPos);
      const dist = _dir.length();
      _dir.normalize();
      const wantYaw = Math.atan2(-_dir.x, -_dir.z);
      const wantPitch = Math.asin(THREE.MathUtils.clamp(_dir.y, -1, 1));
      this.yaw += THREE.MathUtils.clamp(angleDelta(this.yaw, wantYaw), -2.2 * dt, 2.2 * dt);
      this.pitch += THREE.MathUtils.clamp(angleDelta(this.pitch, wantPitch), -2.2 * dt, 2.2 * dt);
      speed = approachSpeed(dist, t.arrive, MAX_SPEED);
      if (yawRate !== 0 || pitchRate !== 0) {
        this.autopilot = null; // player takes the stick
      } else if (dist <= t.arrive + 2) {
        this.visited.add(t.sys.host);
        this.throttle = 0;
        this.autopilot = null;
        this.hud.renderList(systemsData.systems, this.visited, -1);
      }
    } else {
      this.yaw += yawRate * dt;
      this.pitch = THREE.MathUtils.clamp(this.pitch + pitchRate * dt, -1.35, 1.35);
      speed = this.throttle * MAX_SPEED;
    }

    this._euler.set(this.pitch, this.yaw, 0);
    this.heading.setFromEuler(this._euler);

    // fly
    _fwd.set(0, 0, -1).applyQuaternion(this.heading);
    this.worldPos.addScaledVector(_fwd, speed * dt);
    world.speed = speed;

    // sky + universe get the inverse attitude (world rotates around the ship)
    world.attitude.copy(this.heading).invert();
    this.universe.quaternion.copy(world.attitude);
    this.universe.position.copy(this.worldPos).negate().applyQuaternion(world.attitude);

    // ship leans into turns; slight idle breathing otherwise
    world.ship.setTarget(-yawRate * 9, pitchRate * 5 + Math.sin(world.time * 0.4) * 0.8);

    // planets spin on their own axis
    for (const s of this.systems) {
      for (const p of s.planets) p.mesh.rotation.y += p.spin * dt;
    }

    // shared star light follows the nearest system
    let nearest = null;
    let nearestIdx = -1;
    let best = Infinity;
    for (let i = 0; i < this.systems.length; i++) {
      const d = this.systems[i].pos.distanceToSquared(this.worldPos);
      if (d < best) {
        best = d;
        nearest = this.systems[i];
        nearestIdx = i;
      }
    }
    this.starLight.position.copy(nearest.pos);
    this.nearestIdx = nearestIdx;

    // demo: fly to a system, pause ~4s to admire, then move to the next one
    if (demo) {
      if (this.autopilot) this.tourWait = 0;
      else if ((this.tourWait += dt) > 4) this._tourNext();
    }

    this.hud.setThrottle(this.autopilot ? speed / MAX_SPEED : this.throttle, speed);

    // boundary: warn past the charted-space edge; if you keep going far beyond
    // it, quietly engage the autopilot back to the nearest system (no lost ships)
    const fromOrigin = this.worldPos.length();
    if (fromOrigin > this.edge) {
      this.hud.setWarning(true, fromOrigin, this.edge);
      if (fromOrigin > this.edge * 1.6 && !this.autopilot) this._flyTo(nearestIdx);
    } else {
      this.hud.setWarning(false);
    }

    // feed the map (redraws only while open)
    this.hud.setShip(this.worldPos.x, this.worldPos.z, this.yaw);

    // gaze info (center raycast, throttled) — paused while the map is open
    this.gazeCooldown -= dt;
    if (!mapOpen && this.gazeCooldown <= 0) {
      this.gazeCooldown = 0.12;
      this.raycaster.setFromCamera(_center, world.camera);
      const hit = this.raycaster.intersectObjects(this.gazeTargets, false)[0];
      if (hit) {
        const u = hit.object.userData;
        if (u.kind === 'planet') this.hud.showPlanet(u.planet, u.sys);
        else this.hud.showStar(u.sys);
      } else {
        this.hud.hideInfo();
      }
    }
    // deliberately no idle timeout — Explore doubles as an ambient museum
  },

  exit(ctx) {
    this.universe.visible = false;
    ctx.world.attitude.identity();
    ctx.world.shift.set(0, 0, ctx.world.scroll); // re-align stars with plain z-flow
    this.hud.setActive(false);
  },
};

const _center = new THREE.Vector2(0, 0);
