import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CONFIG } from './config.js';

export class Engine {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.pixelRatioCap));
    this.clock = new THREE.Clock();
    this.running = false;
    this._loop = this._loop.bind(this);
  }

  attach(scene, camera) {
    this.camera = camera;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    const b = CONFIG.bloom;
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(256, 256), b.strength, b.radius, b.threshold)
    );
    this.composer.addPass(new OutputPass());
    this._resize();
    window.addEventListener('resize', () => this._resize());

    // full stop when the tab is hidden — a screensaver must not heat laptops in the background
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.running = false;
      } else if (this.update) {
        this.clock.getDelta(); // swallow the time spent hidden
        this.running = true;
        requestAnimationFrame(this._loop);
      }
    });
  }

  /**
   * Multi-display: this window shows the sub-rect (x, y, window-size) of a
   * virtual canvas W×H spanning all screens. One camera frustum, sliced.
   */
  setView(view) {
    this.view = view; // { x, y, W, H } in virtual-canvas CSS pixels
    this._resize();
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    if (this.view) {
      this.camera.aspect = this.view.W / this.view.H;
      this.camera.setViewOffset(this.view.W, this.view.H, this.view.x, this.view.y, w, h);
    } else {
      this.camera.aspect = w / h;
    }
    this.camera.updateProjectionMatrix();
  }

  start(update) {
    this.update = update;
    this.running = true;
    requestAnimationFrame(this._loop);
  }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(this._loop);
    // clamp dt so a stall never teleports the world
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.update(dt);
    this.composer.render();
  }
}
