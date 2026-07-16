// DOM overlay: score, combo, lives, game-over card, idle hint.
// All shows/hides run through CSS opacity transitions — that IS the
// idle<->game fade; the 3D world itself never cuts.

const BEST_KEY = 'spacesaver.best';

export class Hud {
  constructor() {
    this.el = {
      score: document.getElementById('score'),
      combo: document.getElementById('combo'),
      lives: document.getElementById('lives'),
      gameover: document.getElementById('gameover'),
      finalScore: document.getElementById('final-score'),
      bestScore: document.getElementById('best-score'),
      hint: document.getElementById('hint'),
      debug: document.getElementById('debug'),
    };
    this._lastScore = -1;
  }

  setPlaying(on) {
    document.body.classList.toggle('playing', on);
    document.body.classList.toggle('idle', !on);
  }

  setScore(n) {
    if (n === this._lastScore) return;
    this._lastScore = n;
    this.el.score.textContent = String(n);
    this.el.score.classList.remove('pop');
    void this.el.score.offsetWidth; // restart the animation
    this.el.score.classList.add('pop');
  }

  setCombo(mult) {
    if (mult > 1) {
      this.el.combo.textContent = `x${mult}`;
      this.el.combo.classList.add('on');
    } else {
      this.el.combo.classList.remove('on');
    }
  }

  setLives(n, total) {
    if (this.el.lives.childElementCount !== total) {
      this.el.lives.innerHTML = '';
      for (let i = 0; i < total; i++) {
        const d = document.createElement('div');
        d.className = 'life';
        this.el.lives.appendChild(d);
      }
    }
    [...this.el.lives.children].forEach((c, i) => {
      c.classList.toggle('lost', i >= n);
    });
  }

  showGameOver(score) {
    const best = Math.max(score, this.getBest());
    localStorage.setItem(BEST_KEY, String(best));
    this.el.finalScore.textContent = `score ${score}`;
    this.el.bestScore.textContent = `best ${best}`;
    this.el.gameover.classList.add('on');
  }

  hideGameOver() {
    this.el.gameover.classList.remove('on');
  }

  getBest() {
    return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
  }

  showHint(on) {
    this.el.hint.classList.toggle('on', on);
  }

  setDebug(text) {
    if (this.el.debug.style.display !== 'block') this.el.debug.style.display = 'block';
    this.el.debug.textContent = text;
  }
}
