// Leaderboard client + menu section: top-10 list, one-time name registration
// (optionally guarded by Cloudflare Turnstile), score submission with a
// simple JWT identity kept in localStorage.

const TOKEN_KEY = 'spacesaver.jwt';

export class Leaderboard {
  constructor(apiBase) {
    this.api = apiBase;
    this.token = localStorage.getItem(TOKEN_KEY);
    this.available = false; // API reachable?
    this.sitekey = null;
    this.pendingScore = null;
    this._tsWidget = null;
    this._tsToken = null;

    this.el = {
      section: document.getElementById('lb'),
      list: document.getElementById('lb-list'),
      form: document.getElementById('lb-form'),
      name: document.getElementById('lb-name'),
      turnstile: document.getElementById('lb-turnstile'),
      status: document.getElementById('lb-status'),
      you: document.getElementById('lb-you'),
    };
    this.el.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this._register();
    });

    this._init();
  }

  async _init() {
    try {
      const r = await fetch(`${this.api}/config`);
      if (!r.ok) throw new Error();
      this.sitekey = (await r.json()).sitekey;
      this.available = true;
    } catch {
      this.el.section.hidden = true; // offline / standalone: no leaderboard
    }
  }

  playerName() {
    if (!this.token) return null;
    try {
      return JSON.parse(atob(this.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).name;
    } catch {
      return null;
    }
  }

  /** Called by the game-over flow; submits right away if we have an identity. */
  async onGameOver(score) {
    this.pendingScore = score;
    if (this.token) await this._submit();
  }

  /** Re-render the whole section (called when the menu opens). */
  async refresh() {
    if (!this.available) return;
    this.el.section.hidden = false;
    const registered = !!this.token;
    this.el.form.hidden = registered;
    if (!registered && this.sitekey) this._mountTurnstile();
    try {
      const r = await fetch(`${this.api}/leaderboard`, {
        headers: this.token ? { authorization: `Bearer ${this.token}` } : {},
      });
      const data = await r.json();
      this._renderList(data.top);
      this._renderYou(data.me);
    } catch {
      this.el.status.textContent = 'Bestenliste gerade nicht erreichbar';
    }
  }

  _renderList(top) {
    this.el.list.innerHTML = '';
    if (!top.length) {
      this.el.list.innerHTML = '<div class="lb-empty">noch keine Einträge — sei der erste!</div>';
      return;
    }
    for (const row of top) {
      const div = document.createElement('div');
      div.className = 'lb-row' + (row.name === this.playerName() ? ' me' : '');
      const rank = document.createElement('span');
      rank.className = 'lb-rank';
      rank.textContent = `${row.rank}.`;
      const name = document.createElement('span');
      name.className = 'lb-name';
      name.textContent = row.name;
      const score = document.createElement('span');
      score.className = 'lb-score';
      score.textContent = row.score;
      div.append(rank, name, score);
      this.el.list.appendChild(div);
    }
  }

  _renderYou(me) {
    if (me && me.best != null) {
      this.el.you.textContent = `${me.name} — best ${me.best} (#${me.rank})`;
    } else if (me) {
      this.el.you.textContent = me.name;
    } else {
      this.el.you.textContent = '';
    }
    if (this.pendingScore != null && !this.token) {
      this.el.status.textContent = `Score ${this.pendingScore} wartet — Name eintragen!`;
    }
  }

  _mountTurnstile() {
    if (this._tsWidget !== null || !this.sitekey) return;
    const render = () => {
      this._tsWidget = window.turnstile.render(this.el.turnstile, {
        sitekey: this.sitekey,
        theme: 'dark',
        callback: (token) => { this._tsToken = token; },
      });
    };
    if (window.turnstile) {
      render();
    } else {
      window._tsReady = render;
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=_tsReady';
      s.async = true;
      document.head.appendChild(s);
    }
  }

  async _register() {
    const name = this.el.name.value.trim();
    if (name.length < 2) {
      this.el.status.textContent = 'Name: mindestens 2 Zeichen';
      return;
    }
    this.el.status.textContent = '…';
    try {
      const r = await fetch(`${this.api}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, turnstile: this._tsToken }),
      });
      const data = await r.json();
      if (!r.ok) {
        this.el.status.textContent = {
          name_taken: 'Name ist schon vergeben',
          bad_name: 'Name enthält ungültige Zeichen',
          captcha_failed: 'Captcha fehlgeschlagen — nochmal versuchen',
          slow_down: 'Langsam! Kurz warten…',
        }[data.error] || 'Fehler — nochmal versuchen';
        if (this._tsWidget !== null) window.turnstile?.reset(this._tsWidget);
        return;
      }
      this.token = data.token;
      localStorage.setItem(TOKEN_KEY, data.token);
      this.el.status.textContent = '';
      if (this.pendingScore != null) await this._submit();
      this.refresh();
    } catch {
      this.el.status.textContent = 'Netzwerkfehler';
    }
  }

  async _submit() {
    if (this.pendingScore == null || !this.token) return;
    try {
      const r = await fetch(`${this.api}/score`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ score: this.pendingScore }),
      });
      if (r.status === 401) {
        // stale identity (e.g. wiped DB) — re-register
        this.token = null;
        localStorage.removeItem(TOKEN_KEY);
        return;
      }
      if (r.ok) this.pendingScore = null;
    } catch { /* keep pendingScore for a later retry */ }
  }
}
