import { toggleFullscreen } from '../core/input.js';

// ESC/pause menu: resume, restart, fullscreen, and one button per registered
// mode — future mini-games appear here automatically via mode.label.

export class Menu {
  /**
   * @param {object} handlers { onResume(), onRestart(), onSelectMode(id) }
   */
  constructor(handlers) {
    this.handlers = handlers;
    this.modesEl = document.getElementById('menu-modes');
    document.getElementById('menu-resume').addEventListener('click', () => handlers.onResume());
    document.getElementById('menu-restart').addEventListener('click', () => handlers.onRestart());
    document.getElementById('menu-fullscreen').addEventListener('click', () => toggleFullscreen());
    // click on the backdrop (outside the panel) resumes too
    document.getElementById('menu').addEventListener('click', (e) => {
      if (e.target.id === 'menu') handlers.onResume();
    });
  }

  /** (Re)build the mode buttons from the registry and highlight the current one. */
  show(modes, currentId) {
    this.modesEl.innerHTML = '';
    for (const mode of modes) {
      if (!mode.label) continue; // unlisted/internal modes stay hidden
      const b = document.createElement('button');
      b.textContent = mode.label;
      b.classList.toggle('active', mode.id === currentId);
      b.addEventListener('click', () => this.handlers.onSelectMode(mode.id));
      this.modesEl.appendChild(b);
    }
    document.body.classList.add('paused');
  }

  hide() {
    document.body.classList.remove('paused');
  }
}
