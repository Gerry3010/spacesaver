// Explore-mode HUD: crosshair, throttle bar, gaze info panel, target list.

const fmt = (v, digits = 2, unit = '') =>
  v == null ? '—' : `${(+v).toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')}${unit}`;

function periodStr(days) {
  if (days == null) return '—';
  if (days > 1500) return `${(days / 365.25).toFixed(1)} yr`;
  return `${days < 10 ? days.toFixed(2) : Math.round(days)} d`;
}

export class ExploreHud {
  constructor() {
    this.el = {
      root: document.getElementById('explore'),
      throttleFill: document.getElementById('throttle-fill'),
      throttleLabel: document.getElementById('throttle-label'),
      info: document.getElementById('info-panel'),
      list: document.getElementById('target-list'),
      rows: document.getElementById('target-rows'),
    };
    this.onSelect = null; // set by the mode
    this._infoKey = null;
    this._keyHandler = (e) => {
      if ((e.key === 'l' || e.key === 'L') && !document.body.classList.contains('paused')) {
        this.toggleList();
      }
    };
  }

  setActive(on) {
    this.el.root.hidden = !on;
    if (on) window.addEventListener('keydown', this._keyHandler);
    else window.removeEventListener('keydown', this._keyHandler);
    if (!on) {
      this.hideInfo();
      this.el.list.classList.remove('on');
    }
  }

  setThrottle(frac, speed) {
    this.el.throttleFill.style.width = `${Math.round(frac * 100)}%`;
    this.el.throttleLabel.textContent = `${Math.round(speed)} u/s`;
  }

  /** Build/refresh the target list. */
  renderList(systems, visited, currentIdx) {
    this.el.rows.innerHTML = '';
    systems.forEach((sys, i) => {
      const row = document.createElement('button');
      row.className = 'target-row' + (i === currentIdx ? ' active' : '');
      const dist = sys.distLy == null ? '—' : sys.distLy === 0 ? 'home' : `${sys.distLy} ly`;
      row.innerHTML =
        `<span class="t-name">${sys.host}</span>` +
        `<span class="t-dist">${dist}</span>` +
        `<span class="t-count">${sys.planets.length} ✦</span>` +
        `<span class="t-visited">${visited.has(sys.host) ? '✓' : ''}</span>`;
      row.addEventListener('click', () => {
        this.el.list.classList.remove('on');
        this.onSelect?.(i);
      });
      this.el.rows.appendChild(row);
    });
  }

  toggleList() {
    this.el.list.classList.toggle('on');
  }

  showPlanet(p, sys) {
    const key = `p:${p.name}`;
    if (this._infoKey === key) return;
    this._infoKey = key;
    this.el.info.innerHTML =
      `<h3>${p.name}</h3>` +
      `<div class="i-sub">${sys.host} system</div>` +
      `<dl>` +
      `<dt>Radius</dt><dd>${fmt(p.rade, 2, ' R⊕')}</dd>` +
      `<dt>Mass</dt><dd>${fmt(p.masse, 1, ' M⊕')}</dd>` +
      `<dt>Orbital period</dt><dd>${periodStr(p.period)}</dd>` +
      `<dt>Eq. temperature</dt><dd>${p.eqt == null ? '—' : Math.round(p.eqt) + ' K'}</dd>` +
      `<dt>Discovered</dt><dd>${p.discYear ?? '—'}${p.discMethod ? ` · ${p.discMethod}` : ''}</dd>` +
      `</dl>`;
    this.el.info.classList.add('on');
  }

  showStar(sys) {
    const key = `s:${sys.host}`;
    if (this._infoKey === key) return;
    this._infoKey = key;
    this.el.info.innerHTML =
      `<h3>${sys.host}</h3>` +
      `<div class="i-sub">star system</div>` +
      `<dl>` +
      `<dt>Spectral type</dt><dd>${sys.spectype ?? '—'}</dd>` +
      `<dt>Eff. temperature</dt><dd>${sys.teff == null ? '—' : Math.round(sys.teff) + ' K'}</dd>` +
      `<dt>Distance</dt><dd>${sys.distLy == null ? '—' : sys.distLy === 0 ? 'you are here' : sys.distLy + ' ly'}</dd>` +
      `<dt>Known planets</dt><dd>${sys.planets.length}</dd>` +
      `</dl>` +
      `<div class="i-planets">${sys.planets.map((p) => p.name).join(' · ')}</div>`;
    this.el.info.classList.add('on');
  }

  hideInfo() {
    this._infoKey = null;
    this.el.info.classList.remove('on');
  }
}
