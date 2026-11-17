/* ============================================================
   MICROGAMES INC. — core.js
   Utilidades, modelo de datos, almacenamiento, modales y toasts
   ============================================================ */
(function () {
  'use strict';

  const MI = window.MI = window.MI || {};

  MI.W = 1280;
  MI.H = 720;
  MI.VERSION = 2;
  MI.FORMAT = 'microgames-inc';
  MI.OBJ_MIN = 48;
  MI.OBJ_MAX = 256;

  /* ----------------------------- utilidades ----------------------------- */
  const U = MI.util = {
    uid(prefix) {
      return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
    },
    clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp(a, b, t) { return a + (b - a) * t; },
    rand(a, b) { return a + Math.random() * (b - a); },
    randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
    choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    deepClone(v) { return JSON.parse(JSON.stringify(v)); },
    esc(str) {
      return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    slug(str) {
      return String(str || 'microjuego').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'microjuego';
    },
    msToSec(ms) { return (ms / 1000).toFixed(1).replace('.', ','); },
    msToShort(ms) {
      const s = ms / 1000;
      return (Number.isInteger(s) ? s : s.toFixed(1).replace('.', ',')) + 's';
    },
    download(filename, text, mime) {
      const blob = new Blob([text], { type: mime || 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 600);
    },
    readFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo'));
        reader.readAsText(file);
      });
    },
    rectsOverlap(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    },
    rectsTouch(a, b, tol) {
      const t = tol == null ? 2 : tol;
      return a.x - t < b.x + b.w && a.x + a.w + t > b.x && a.y - t < b.y + b.h && a.y + a.h + t > b.y;
    },
    overlapRatio(a, b) {
      const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      const area = Math.max(1, Math.min(a.w * a.h, b.w * b.h));
      return (x * y) / area;
    },
    pointInRect(px, py, r) {
      return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
    },
    rectFromPoints(x1, y1, x2, y2) {
      return {
        x: Math.min(x1, x2), y: Math.min(y1, y2),
        w: Math.abs(x2 - x1), h: Math.abs(y2 - y1)
      };
    },
    snap(v, grid) { return grid ? Math.round(v / grid) * grid : v; },
    platformMod(e) { return e.ctrlKey || e.metaKey; },
    formatDate(ts) {
      try {
        return new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
      } catch (e) { return ''; }
    }
  };

  MI.$ = (sel, root) => (root || document).querySelector(sel);
  MI.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  MI.el = function (tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'value') node.value = v;
        else if (k === 'checked') node.checked = !!v;
        else if (k === 'disabled') node.disabled = !!v;
        else node.setAttribute(k, v);
      }
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(c => {
        if (c == null || c === false) return;
        node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
      });
    }
    return node;
  };

  /* ----------------------------- toasts ----------------------------- */
  MI.toast = function (msg, type) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const t = MI.el('div', { class: 'toast ' + (type || '') }, msg);
    root.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 280);
    }, type === 'err' ? 3400 : 2400);
  };

  /* ----------------------------- modales ----------------------------- */
  const modalState = { current: null, prevFocus: null };

  MI.modal = {
    open(opts) {
      opts = opts || {};
      const root = document.getElementById('modal-root');
      if (!root) return null;
      this.close();

      modalState.prevFocus = document.activeElement;
      const backdrop = MI.el('div', { class: 'modal-backdrop' });
      const modal = MI.el('div', { class: 'modal' + (opts.wide ? ' wide' : '') + (opts.narrow ? ' narrow' : '') });
      const head = MI.el('div', { class: 'modal-head' }, [
        MI.el('h2', { text: opts.title || '' }),
        MI.el('button', { class: 'modal-close', title: 'Cerrar', text: '✕', onclick: () => this.close() })
      ]);
      const body = MI.el('div', { class: 'modal-body' });
      if (typeof opts.body === 'string') body.innerHTML = opts.body;
      else if (opts.body) body.appendChild(opts.body);

      const foot = MI.el('div', { class: 'modal-foot' });
      (opts.footer || []).forEach(f => {
        if (!f) return;
        const b = MI.el('button', { class: 'btn ' + (f.className || 'btn-paper'), text: f.label, disabled: f.disabled });
        b.addEventListener('click', () => {
          const r = f.onClick ? f.onClick(modal, body) : null;
          if (f.close !== false) this.close();
          return r;
        });
        foot.appendChild(b);
      });

      modal.appendChild(head);
      modal.appendChild(body);
      if (foot.children.length) modal.appendChild(foot);
      root.innerHTML = '';
      root.appendChild(backdrop);
      root.appendChild(modal);
      root.classList.add('open');
      document.body.style.overflow = 'hidden';

      modalState.current = { root, modal, onClose: opts.onClose };
      if (opts.dismissible !== false) backdrop.addEventListener('click', () => this.close());
      setTimeout(() => {
        const focusable = modal.querySelector('input, select, textarea, button:not(.modal-close)');
        if (focusable && opts.autofocus !== false) focusable.focus({ preventScroll: true });
      }, 60);
      if (opts.onOpen) setTimeout(() => opts.onOpen(modal, body), 0);
      return { root, modal, body };
    },
    close() {
      const root = document.getElementById('modal-root');
      if (!root || !root.classList.contains('open')) return;
      const cur = modalState.current;
      root.classList.remove('open');
      root.innerHTML = '';
      document.body.style.overflow = '';
      modalState.current = null;
      if (cur && cur.onClose) { try { cur.onClose(); } catch (e) { console.warn(e); } }
      if (modalState.prevFocus && modalState.prevFocus.focus) {
        try { modalState.prevFocus.focus({ preventScroll: true }); } catch (e) { /* noop */ }
      }
    },
    confirm(title, message, onYes, yesLabel, danger) {
      return this.open({
        title, narrow: true,
        body: MI.el('p', { style: { fontSize: '13px', lineHeight: '1.55' }, text: message }),
        footer: [
          { label: 'Cancelar', className: 'btn-paper' },
          {
            label: yesLabel || 'Aceptar', className: danger ? 'btn-danger' : 'btn-primary',
            onClick: () => { if (onYes) onYes(); }
          }
        ]
      });
    }
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const root = document.getElementById('modal-root');
      if (root && root.classList.contains('open')) { MI.modal.close(); e.preventDefault(); }
      else if (MI.player && MI.player.onEscape) MI.player.onEscape();
    }
  });

  /* ----------------------------- almacenamiento ----------------------------- */
  const KEY_GAMES = 'mi.games.v1';
  const KEY_DRAFT = 'mi.draft.v1';
  const KEY_SETTINGS = 'mi.settings.v1';

  function safeGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) {
      console.warn('Almacenamiento no disponible', e);
      return false;
    }
  }

  MI.store = {
    list() {
      const arr = safeGet(KEY_GAMES, []);
      if (!Array.isArray(arr)) return [];
      // Migra al vuelo las partidas guardadas con el escenario antiguo 320×240.
      return arr.map(g => {
        if (!g || typeof g !== 'object') return g;
        if ((Number(g.version) || 1) >= MI.VERSION) return g;
        try { return MI.normalizeGame(g, { keepId: true }); } catch (e) { return g; }
      });
    },
    get(id) {
      return this.list().find(g => g.id === id) || null;
    },
    save(game) {
      const games = this.list();
      game.updatedAt = Date.now();
      const idx = games.findIndex(g => g.id === game.id);
      if (idx >= 0) games[idx] = U.deepClone(game);
      else games.unshift(U.deepClone(game));
      safeSet(KEY_GAMES, games);
      return game;
    },
    remove(id) {
      const games = this.list().filter(g => g.id !== id);
      safeSet(KEY_GAMES, games);
    },
    count() { return this.list().length; },
    getDraft() { return safeGet(KEY_DRAFT, null); },
    setDraft(game) { safeSet(KEY_DRAFT, game); },
    clearDraft() { try { localStorage.removeItem(KEY_DRAFT); } catch (e) { /* noop */ } },
    settings() {
      const s = safeGet(KEY_SETTINGS, {});
      return Object.assign({ muted: false }, s);
    },
    setSettings(patch) {
      const s = Object.assign(this.settings(), patch);
      safeSet(KEY_SETTINGS, s);
      return s;
    }
  };

  /* ----------------------------- modelo de datos ----------------------------- */
  MI.DURATIONS = [
    { value: 4000, label: '4 segundos', short: '4 s' },
    { value: 8000, label: '8 segundos', short: '8 s' },
    { value: 0, label: 'Tiempo infinito', short: '∞' }
  ];

  MI.TRIGGERS = {
    tap: 'Tocar',
    touch: 'Contacto · Tocar',
    overlap: 'Contacto · Solapamiento',
    anim: 'Animación',
    time: 'Tiempo',
    switch: 'Interruptor',
    result: 'Victoria / derrota'
  };

  MI.ACTIONS = {
    moveDir: 'Movimiento · Línea recta (dirección)',
    moveRandom: 'Movimiento · Línea recta (aleatoria)',
    moveTo: 'Movimiento · Línea recta (a un punto)',
    moveFrom: 'Movimiento · Línea recta desde otra ubicación',
    jumpPoint: 'Movimiento · Saltar a un punto',
    jumpZone: 'Movimiento · Saltar a una zona',
    jumpObject: 'Movimiento · Saltar a otro objeto',
    wander: 'Movimiento · Deambular',
    stop: 'Movimiento · Detenerse',
    swap: 'Movimiento · Cambiar posiciones',
    approach: 'Movimiento · Acercarse a',
    lose: 'Derrota',
    sound: 'Sonido',
    switch: 'Interruptor',
    anim: 'Animación',
    effect: 'Efecto'
  };

  MI.GOALS = {
    survive: 'Sobrevivir hasta el final',
    switch: 'Activar el interruptor de un objeto',
    touch: 'Tocar un objeto concreto',
    reach: 'Llevar un objeto a una zona'
  };

  MI.patterns = ['plain', 'grid', 'dots', 'checker', 'stripes', 'sunset', 'stars', 'bricks', 'waves', 'clouds', 'circuit'];
  MI.PATTERN_LABELS = {
    plain: 'Liso', grid: 'Rejilla', dots: 'Puntos', checker: 'Damero', stripes: 'Rayas',
    sunset: 'Atardecer', stars: 'Estrellas', bricks: 'Ladrillos', waves: 'Ondas',
    clouds: 'Nubes', circuit: 'Circuito'
  };

  /**
   * Normaliza y valida una definición de microjuego. Devuelve una copia segura.
   */
  MI.normalizeGame = function (raw, opts) {
    opts = opts || {};
    if (!raw || typeof raw !== 'object') throw new Error('El archivo no contiene un microjuego válido.');
    const src = raw.game && typeof raw.game === 'object' ? raw.game : raw;
    if (!Array.isArray(src.objects)) throw new Error('El microjuego no tiene una lista de objetos válida.');

    // Los microjuegos de la versión 1 se diseñaron en 320×240. Se convierten
    // a la resolución actual (1280×720) sin deformar ni recortar el escenario.
    const legacy = (Number(src.version) || 1) < MI.VERSION;
    const kx = legacy ? MI.W / 320 : 1;
    const ky = legacy ? MI.H / 240 : 1;
    const ka = legacy ? 4 : 1;
    const X0 = -MI.W, X1 = MI.W * 2, Y0 = -MI.H, Y1 = MI.H * 2;
    const num = (v, def) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : def;
    };
    const px = (v, def) => U.clamp(Math.round(num(v, def) * kx), X0, X1);
    const py = (v, def) => U.clamp(Math.round(num(v, def) * ky), Y0, Y1);
    const pw = (v, def, min, max) => U.clamp(Math.round(num(v, def) * ka), min, max);
    const speed = (v, def, min, max) => U.clamp(Math.round(num(v, def) * ka), min, max);
    const ms = (v, def) => U.clamp(Math.round(num(v, def)), 100, 60000);

    const game = {
      format: MI.FORMAT,
      version: MI.VERSION,
      id: opts.keepId && src.id ? String(src.id) : U.uid('game'),
      name: String(src.name || 'Microjuego sin título').slice(0, 40),
      hint: String(src.hint || 'Toca lo que pida').slice(0, 20),
      author: String(src.author || 'Anónimo').slice(0, 30),
      duration: [4000, 8000, 0].indexOf(Number(src.duration)) >= 0 ? Number(src.duration) : 4000,
      music: typeof src.music === 'string' ? src.music : 'alegre',
      bg: {
        color: /^#[0-9a-fA-F]{6}$/.test((src.bg || {}).color || '') ? src.bg.color : '#101a36',
        pattern: MI.patterns.indexOf((src.bg || {}).pattern) >= 0 ? src.bg.pattern : 'grid',
        accent: /^#[0-9a-fA-F]{6}$/.test((src.bg || {}).accent || '') ? src.bg.accent : '#4fd1ff'
      },
      goal: { type: 'survive', objectId: null, zoneId: null },
      objects: [],
      zones: [],
      rules: [],
      example: !!src.example,
      createdAt: Number(src.createdAt) || Date.now(),
      updatedAt: Number(src.updatedAt) || Date.now()
    };

    const goal = src.goal || {};
    if (MI.GOALS[goal.type]) game.goal.type = goal.type;
    game.goal.objectId = goal.objectId ? String(goal.objectId) : null;
    game.goal.zoneId = goal.zoneId ? String(goal.zoneId) : null;

    // zonas
    const zoneIds = new Set();
    (Array.isArray(src.zones) ? src.zones : []).forEach((z, i) => {
      if (!z || typeof z !== 'object') return;
      const id = z.id ? String(z.id) : U.uid('zone');
      if (zoneIds.has(id)) return;
      zoneIds.add(id);
      game.zones.push({
        id,
        name: String(z.name || ('Zona ' + (i + 1))).slice(0, 24),
        x: px(z.x, 0),
        y: py(z.y, 0),
        w: pw(z.w, 40, 8, 3840),
        h: pw(z.h, 40, 8, 2880)
      });
    });

    const objIds = new Set();
    (Array.isArray(src.objects) ? src.objects : []).slice(0, 40).forEach((o, i) => {
      if (!o || typeof o !== 'object') return;
      let id = o.id ? String(o.id) : U.uid('obj');
      if (objIds.has(id)) id = U.uid('obj');
      objIds.add(id);
      const anims = [];
      for (let f = 0; f < 4; f++) {
        let data = Array.isArray(o.anims) ? o.anims[f] : null;
        if (Array.isArray(data)) data = data.join('');
        if (typeof data !== 'string' || data.length !== 256 || /[^0-9a-f]/i.test(data)) {
          data = MI.sprites ? MI.sprites.empty() : '0'.repeat(256);
        }
        anims.push(data);
      }
      const placement = o.placement === 'zone' ? 'zone' : 'point';
      const zone = o.zone && typeof o.zone === 'object' ? o.zone : { x: 40, y: 40, w: 100, h: 80 };
      game.objects.push({
        id,
        name: String(o.name || ('Objeto ' + (i + 1))).slice(0, 24),
        x: px(o.x, legacy ? 144 : 592),
        y: py(o.y, legacy ? 104 : 312),
        w: pw(o.w, legacy ? 32 : 96, MI.OBJ_MIN, MI.OBJ_MAX),
        h: pw(o.h, legacy ? 32 : 96, MI.OBJ_MIN, MI.OBJ_MAX),
        placement,
        zone: {
          x: px(zone.x, 0),
          y: py(zone.y, 0),
          w: pw(zone.w, 56, 16, 3840),
          h: pw(zone.h, 56, 16, 2880)
        },
        visible: o.visible !== false,
        fps: U.clamp(Math.round(Number(o.fps) || 6), 1, 30),
        anims
      });
    });

    if (!game.objects.length) throw new Error('El microjuego debe tener al menos un objeto.');

    const validTrigger = (tr) => {
      if (!tr || typeof tr !== 'object' || !MI.TRIGGERS[tr.type]) return null;
      const t = { type: tr.type };
      if (tr.type === 'tap') t.where = tr.where === 'stage' ? 'stage' : 'self';
      if (tr.type === 'touch' || tr.type === 'overlap') {
        t.mode = tr.mode === 'zone' ? 'zone' : 'object';
        t.objectId = objIds.has(String(tr.objectId)) ? String(tr.objectId) : null;
        t.zoneId = zoneIds.has(String(tr.zoneId)) ? String(tr.zoneId) : null;
        if (t.mode === 'object' && !t.objectId) return null;
        if (t.mode === 'zone' && !t.zoneId) return null;
      }
      if (tr.type === 'anim') {
        t.mode = tr.mode === 'end' ? 'end' : 'specific';
        t.frame = U.clamp(Math.round(Number(tr.frame) || 0), 0, 3);
      }
      if (tr.type === 'time') {
        t.mode = tr.mode === 'interval' ? 'interval' : 'point';
        t.at = ms(tr.at, 1000);
        t.from = ms(tr.from, 500);
        t.to = ms(tr.to, 2000);
        if (t.to < t.from) { const tmp = t.from; t.from = t.to; t.to = tmp; }
      }
      if (tr.type === 'switch') {
        t.objectId = objIds.has(String(tr.objectId)) ? String(tr.objectId) : 'self';
        t.mode = ['turnOn', 'isOn', 'turnOff', 'isOff'].indexOf(tr.mode) >= 0 ? tr.mode : 'turnOn';
      }
      if (tr.type === 'result') {
        t.mode = ['win', 'afterWin', 'beforeWin', 'lose', 'afterLose', 'beforeLose'].indexOf(tr.mode) >= 0 ? tr.mode : 'win';
      }
      return t;
    };

    const validAction = (a) => {
      if (!a || typeof a !== 'object' || !MI.ACTIONS[a.type]) return null;
      const act = { type: a.type };
      const target = a.target && a.target !== 'self' && objIds.has(String(a.target)) ? String(a.target) : 'self';
      const objRef = (v) => objIds.has(String(v)) ? String(v) : null;
      const zoneRef = (v) => zoneIds.has(String(v)) ? String(v) : null;

      if (['moveDir', 'moveRandom', 'moveTo', 'moveFrom', 'jumpPoint', 'jumpZone', 'jumpObject', 'wander', 'swap', 'approach', 'anim'].indexOf(a.type) >= 0) {
        act.target = target;
      }
      switch (a.type) {
        case 'moveDir':
          act.dir = U.clamp(Math.round(Number(a.dir) || 0), 0, 7);
          act.speed = speed(a.speed, 60, 16, 1600);
          break;
        case 'moveRandom':
          act.speed = speed(a.speed, 60, 16, 1600);
          break;
        case 'moveTo':
          act.x = px(a.x, 0);
          act.y = py(a.y, 0);
          act.speed = speed(a.speed, 60, 16, 1600);
          break;
        case 'moveFrom':
          act.fromMode = a.fromMode === 'object' ? 'object' : 'point';
          act.fromObjectId = objRef(a.fromObjectId);
          act.x = px(a.x, 0);
          act.y = py(a.y, 0);
          act.speed = speed(a.speed, 60, 16, 1600);
          if (act.fromMode === 'object' && !act.fromObjectId) return null;
          break;
        case 'jumpPoint':
          act.x = px(a.x, 0);
          act.y = py(a.y, 0);
          break;
        case 'jumpZone':
          act.zoneId = zoneRef(a.zoneId);
          act.avoid = !!a.avoid;
          if (!act.zoneId) return null;
          break;
        case 'jumpObject':
          act.objectId = objRef(a.objectId);
          if (!act.objectId) return null;
          break;
        case 'wander':
          act.mode = ['wobble', 'billiard', 'fly', 'ball'].indexOf(a.mode) >= 0 ? a.mode : 'wobble';
          act.zoneId = zoneRef(a.zoneId);
          act.avoid = !!a.avoid;
          act.speed = speed(a.speed, 55, 24, 1200);
          if (!act.zoneId) return null;
          break;
        case 'swap':
          act.objectId = objRef(a.objectId);
          if (!act.objectId) return null;
          break;
        case 'approach':
          act.objectId = objRef(a.objectId);
          act.distance = U.clamp(Math.round(num(a.distance, 0) * ka), 0, 1200);
          act.speed = speed(a.speed, 60, 16, 1200);
          if (!act.objectId) return null;
          break;
        case 'sound':
          act.soundId = String(a.soundId || 'blip');
          break;
        case 'switch':
          act.objectId = a.objectId === 'self' || !a.objectId ? 'self' : (objRef(a.objectId) || 'self');
          act.value = a.value === true;
          break;
        case 'anim':
          act.mode = a.mode === 'stop' ? 'stop' : 'set';
          act.frame = U.clamp(Math.round(Number(a.frame) || 0), 0, 3);
          break;
        case 'effect':
          act.effect = ['flash', 'confetti', 'shake', 'freeze'].indexOf(a.effect) >= 0 ? a.effect : 'flash';
          act.duration = U.clamp(Math.round(Number(a.duration) || 500), 100, 5000);
          break;
      }
      return act;
    };

    (Array.isArray(src.rules) ? src.rules : []).slice(0, 120).forEach((r) => {
      if (!r || typeof r !== 'object') return;
      const trigger = validTrigger(r.trigger);
      if (!trigger) return;
      const subject = r.subject && r.subject !== 'stage' && objIds.has(String(r.subject)) ? String(r.subject) : 'stage';
      if ((trigger.type === 'tap' && trigger.where === 'self') || trigger.type === 'anim') {
        if (subject === 'stage') return;
      }
      const actions = (Array.isArray(r.actions) ? r.actions : []).map(validAction).filter(Boolean);
      if (!actions.length) return;
      game.rules.push({
        id: r.id ? String(r.id) : U.uid('rule'),
        subject,
        trigger,
        actions,
        repeat: !!r.repeat,
        enabled: r.enabled !== false
      });
    });

    // referencias del objetivo
    if (game.goal.objectId && !objIds.has(game.goal.objectId)) game.goal.objectId = null;
    if (game.goal.zoneId && !zoneIds.has(game.goal.zoneId)) game.goal.zoneId = null;
    if (game.goal.type !== 'survive' && !game.goal.objectId) game.goal.type = 'survive';
    if (game.goal.type === 'reach' && !game.goal.zoneId) game.goal.type = 'survive';

    return game;
  };

  MI.exportGame = function (game) {
    const payload = {
      format: MI.FORMAT,
      version: MI.VERSION,
      exportedAt: new Date().toISOString(),
      game: MI.util.deepClone(game)
    };
    MI.util.download(MI.util.slug(game.name) + '.microgame', JSON.stringify(payload, null, 2), 'application/json');
  };

  MI.importFile = async function (file) {
    const text = await MI.util.readFile(file);
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('El archivo no es JSON válido.'); }
    if (data && data.format && data.format !== MI.FORMAT) throw new Error('Ese archivo no es un microjuego de Microgames Inc.');
    return MI.normalizeGame(data, { keepId: false });
  };

  MI.newGame = function (name) {
    const g = {
      format: MI.FORMAT,
      version: MI.VERSION,
      id: U.uid('game'),
      name: name || 'Mi microjuego',
      hint: 'Toca lo que pida',
      author: 'Tú',
      duration: 4000,
      music: 'alegre',
      bg: { color: '#101a36', pattern: 'grid', accent: '#4fd1ff' },
      goal: { type: 'survive', objectId: null, zoneId: null },
      objects: [],
      zones: [],
      rules: [],
      example: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    if (MI.sprites) {
      const sp = MI.sprites.makeObject('Objeto 1', 'slime');
      sp.x = (MI.W - sp.w) / 2;
      sp.y = (MI.H - sp.h) / 2;
      g.objects.push(sp);
    }
    return g;
  };

  /* atajos de depuración */
  MI.debug = { U };

})();
