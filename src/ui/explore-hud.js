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
      warning: document.getElementById('explore-warning'),
      warningDist: document.getElementById('warning-dist'),
      map: document.getElementById('map-overlay'),
      mapCanvas: document.getElementById('map-canvas'),
    };
    this.onSelect = null;   // fly-to (target list), set by the mode
    this.onTeleport = null; // instant jump (map), set by the mode
    this._infoKey = null;
    this._warnOn = false;
    this.mapOpen = false;   // mode reads this to suppress steering/gaze
    this._mapData = null;   // [{host, x, z, colorHex, planets}]
    this._mapHits = [];     // per-dot canvas hit boxes, rebuilt each draw
    this._ship = { x: 0, z: 0, yaw: 0 };
    this._ctx = this.el.mapCanvas.getContext('2d');
    this._keyHandler = (e) => {
      if (document.body.classList.contains('paused')) return;
      if (e.key === 'l' || e.key === 'L') this.toggleList();
      else if (e.key === 'm' || e.key === 'M') this.toggleMap();
    };
    this._mapClick = (e) => this._onMapClick(e);
    this.el.map.addEventListener('click', this._mapClick);
  }

  setActive(on) {
    this.el.root.hidden = !on;
    if (on) window.addEventListener('keydown', this._keyHandler);
    else window.removeEventListener('keydown', this._keyHandler);
    if (!on) {
      this.hideInfo();
      this.el.list.classList.remove('on');
      this.closeMap();
      this.setWarning(false);
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

  /** Boundary warning banner. `dist`/`edge` in world units (rounded to k-units). */
  setWarning(on, dist, edge) {
    if (on && dist != null) {
      this.el.warningDist.textContent =
        `${(dist / 1000).toFixed(1)}k u out · edge at ${(edge / 1000).toFixed(1)}k`;
    }
    if (on === this._warnOn) return;
    this._warnOn = on;
    this.el.warning.hidden = !on;
  }

  // ---- star map ----

  /** One-time system layout for the map: [{host, x, z, colorHex, planets}]. */
  setMapData(entries) {
    this._mapData = entries;
    // fit all systems (+ origin) into the canvas with padding
    let max = 500;
    for (const e of entries) max = Math.max(max, Math.abs(e.x), Math.abs(e.z));
    this._mapSpan = max * 1.12;
  }

  /** Ship pose in world space, pushed each frame by the mode (cheap). */
  setShip(x, z, yaw) {
    this._ship.x = x;
    this._ship.z = z;
    this._ship.yaw = yaw;
    if (this.mapOpen) this._drawMap();
  }

  toggleMap() {
    if (this.mapOpen) this.closeMap();
    else this.openMap();
  }

  openMap() {
    if (!this._mapData) return;
    this.mapOpen = true;
    this.el.map.hidden = false;
    this.el.list.classList.remove('on');
    this._drawMap();
  }

  closeMap() {
    this.mapOpen = false;
    this.el.map.hidden = true;
  }

  _worldToCanvas(x, z) {
    const c = this.el.mapCanvas;
    const s = (Math.min(c.width, c.height) * 0.5 - 28) / this._mapSpan;
    return [c.width / 2 + x * s, c.height / 2 + z * s];
  }

  _drawMap() {
    const ctx = this._ctx;
    const c = this.el.mapCanvas;
    ctx.clearRect(0, 0, c.width, c.height);

    // faint range rings around origin (every 1000 u)
    ctx.strokeStyle = 'rgba(125, 245, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let r = 1000; r <= this._mapSpan; r += 1000) {
      const [cx, cy] = this._worldToCanvas(0, 0);
      const [ex] = this._worldToCanvas(r, 0);
      ctx.beginPath();
      ctx.arc(cx, cy, ex - cx, 0, Math.PI * 2);
      ctx.stroke();
    }

    // system dots
    this._mapHits = [];
    ctx.textAlign = 'center';
    ctx.font = '11px "DejaVu Sans Mono", monospace';
    this._mapData.forEach((e, i) => {
      const [px, py] = this._worldToCanvas(e.x, e.z);
      const rad = 3 + Math.min(e.planets, 8) * 0.7;
      const hex = '#' + e.colorHex.toString(16).padStart(6, '0');
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fillStyle = hex;
      ctx.shadowColor = hex;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(223, 246, 255, 0.72)';
      ctx.fillText(e.host, px, py - rad - 5);
      this._mapHits.push({ x: px, y: py, i });
    });

    // ship marker: a glowing sci-fi dart at your position, nose pointing the way
    // you're facing (heading). The shape reads as ">" — location + orientation.
    const [sx, sy] = this._worldToCanvas(this._ship.x, this._ship.z);
    const fx = -Math.sin(this._ship.yaw); // forward on the map
    const fz = -Math.cos(this._ship.yaw);
    const rx = -fz; // right-hand perpendicular
    const rz = fx;
    const pt = (fwd, side) => [sx + fx * fwd + rx * side, sy + fz * fwd + rz * side];

    // faint "you are here" position halo
    ctx.beginPath();
    ctx.arc(sx, sy, 15, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // the dart: nose ahead, swept-back wings, concave tail
    const [nx, ny] = pt(13, 0);   // nose
    const [lx, ly] = pt(-8, 8);   // left wingtip
    const [tx, ty] = pt(-3, 0);   // tail notch (concave → arrowhead look)
    const [wx, wy] = pt(-8, -8);  // right wingtip
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(lx, ly);
    ctx.lineTo(tx, ty);
    ctx.lineTo(wx, wy);
    ctx.closePath();
    ctx.fillStyle = '#ffd166';
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 244, 214, 0.95)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  _onMapClick(e) {
    if (e.target !== this.el.mapCanvas) {
      // click outside the canvas (on the dim backdrop) closes the map
      this.closeMap();
      return;
    }
    const rect = this.el.mapCanvas.getBoundingClientRect();
    const scaleX = this.el.mapCanvas.width / rect.width;
    const scaleY = this.el.mapCanvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    let best = null;
    let bestD = 22 * 22; // click tolerance (canvas px, squared)
    for (const h of this._mapHits) {
      const d = (h.x - mx) ** 2 + (h.y - my) ** 2;
      if (d < bestD) {
        bestD = d;
        best = h.i;
      }
    }
    if (best != null) {
      this.closeMap();
      this.onTeleport?.(best);
    }
  }
}
