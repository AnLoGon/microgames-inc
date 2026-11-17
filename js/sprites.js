/* ============================================================
   MICROGAMES INC. — sprites.js
   Paleta, generador de sprites 16x16, celdas de animación
   ============================================================ */
(function () {
  'use strict';
  const MI = window.MI;
  const N = 16;

  /* Paleta global: 0 = transparente */
  const PALETTE = [
    null,
    '#10131f', // 1 tinta
    '#ffffff', // 2 blanco
    '#c3cbe0', // 3 gris claro
    '#6b7594', // 4 gris
    '#ff4d5e', // 5 rojo
    '#ff8a3d', // 6 naranja
    '#ffd23f', // 7 amarillo
    '#8bd450', // 8 lima
    '#3fbf6b', // 9 verde
    '#4fd1ff', // a cian
    '#3aa7ff', // b azul
    '#a45cff', // c morado
    '#ff86c8', // d rosa
    '#8a5a2b', // e marrón
    '#4a2a12'  // f marrón oscuro
  ];
  const PALETTE_NAMES = [
    'Transparente', 'Tinta', 'Blanco', 'Gris claro', 'Gris', 'Rojo', 'Naranja',
    'Amarillo', 'Lima', 'Verde', 'Cian', 'Azul', 'Morado', 'Rosa', 'Marrón', 'Marrón oscuro'
  ];

  /* ----------------------------- helpers de rejilla ----------------------------- */
  function makeGrid() { return new Uint8Array(N * N); }
  function put(g, x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && x < N && y >= 0 && y < N) g[y * N + x] = c;
  }
  function get(g, x, y) {
    if (x < 0 || x >= N || y < 0 || y >= N) return 0;
    return g[y * N + x];
  }
  function rect(g, x, y, w, h, c) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(g, xx, yy, c);
  }
  function ellipse(g, cx, cy, rx, ry, c) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) put(g, x, y, c);
    }
  }
  function circle(g, cx, cy, r, c) { ellipse(g, cx, cy, r, r, c); }
  function line(g, x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 80; guard++) {
      put(g, x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function poly(g, pts, c) {
    let minY = 99, maxY = -1;
    pts.forEach(p => { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(N - 1, Math.ceil(maxY)); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.round(xs[i] + 0.2); x < Math.round(xs[i + 1] - 0.2); x++) put(g, x, y, c);
      }
    }
  }
  function outline(g, c) {
    const copy = g.slice();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (copy[y * N + x] !== 0) continue;
      if (get(copy, x - 1, y) || get(copy, x + 1, y) || get(copy, x, y - 1) || get(copy, x, y + 1)) {
        g[y * N + x] = c;
      }
    }
  }
  function eyes(g, x1, y1, x2, y2, w, h, white, pupil) {
    w = w || 2; h = h || 3; white = white == null ? 2 : white; pupil = pupil == null ? 1 : pupil;
    [[x1, y1], [x2, y2]].forEach(([x, y]) => {
      rect(g, x, y, w, h, white);
      rect(g, x + w - 1, y + 1, 1, Math.max(1, h - 1), pupil);
    });
  }
  function shiftGrid(g, dx, dy) {
    const out = makeGrid();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = g[y * N + x];
      if (v) put(out, x + dx, y + dy, v);
    }
    return out;
  }
  function serialize(g) {
    let s = '';
    for (let i = 0; i < g.length; i++) s += g[i].toString(16);
    return s;
  }

  /* ----------------------------- sprites predefinidos ----------------------------- */
  const BUILDERS = {
    slime() {
      const g = makeGrid();
      ellipse(g, 8, 9, 6, 5, 8);
      ellipse(g, 8, 12, 4, 2, 9);
      outline(g, 1);
      eyes(g, 5, 7, 9, 7, 2, 3);
      put(g, 7, 11, 1); put(g, 8, 11, 1); put(g, 9, 11, 1);
      put(g, 4, 6, 2); put(g, 5, 5, 2);
      return g;
    },
    star() {
      const g = makeGrid();
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const r = i % 2 ? 3.2 : 7;
        pts.push([8 + Math.cos(a) * r, 8 + Math.sin(a) * r]);
      }
      poly(g, pts, 7);
      outline(g, 1);
      eyes(g, 6, 7, 10, 7, 2, 2, 2, 1);
      put(g, 7, 10, 6); put(g, 8, 10, 1); put(g, 9, 10, 6);
      put(g, 4, 5, 2);
      return g;
    },
    heart() {
      const g = makeGrid();
      circle(g, 5.5, 6, 3.4, 5);
      circle(g, 10.5, 6, 3.4, 5);
      poly(g, [[2.5, 7], [13.5, 7], [8, 14.5]], 5);
      outline(g, 1);
      put(g, 4, 5, 2); put(g, 5, 4, 2);
      eyes(g, 5, 7, 9, 7, 2, 2, 2, 1);
      return g;
    },
    bomb() {
      const g = makeGrid();
      circle(g, 8, 10, 5.6, 1);
      circle(g, 6, 8, 1.9, 4);
      outline(g, 4);
      line(g, 10, 5, 12, 2, 14);
      put(g, 13, 1, 7); put(g, 14, 2, 6); put(g, 12, 2, 7); put(g, 13, 2, 6);
      eyes(g, 6, 9, 9, 9, 2, 2, 2, 1);
      line(g, 7, 12, 9, 12, 4);
      return g;
    },
    apple() {
      const g = makeGrid();
      circle(g, 8, 10, 6, 5);
      outline(g, 1);
      rect(g, 8, 2, 1, 4, 14);
      ellipse(g, 10, 3, 2.2, 1.2, 9);
      put(g, 4, 7, 2); put(g, 5, 6, 2);
      eyes(g, 5, 9, 9, 9, 2, 3, 2, 1);
      return g;
    },
    ghost() {
      const g = makeGrid();
      ellipse(g, 8, 8, 6, 5.4, 2);
      rect(g, 2, 8, 12, 5, 2);
      for (let x = 2; x < 14; x += 4) { put(g, x, 13, 0); put(g, x + 3, 13, 0); }
      outline(g, 1);
      eyes(g, 5, 7, 9, 7, 2, 3, 1, 1);
      rect(g, 5, 7, 2, 3, 1); rect(g, 9, 7, 2, 3, 1);
      put(g, 6, 7, 2); put(g, 10, 7, 2);
      put(g, 7, 11, 1); put(g, 8, 11, 1); put(g, 6, 10, 1); put(g, 9, 10, 1);
      return g;
    },
    cat() {
      const g = makeGrid();
      circle(g, 8, 9, 5.6, 6);
      outline(g, 1);
      poly(g, [[2, 3], [6, 6], [3, 8]], 6);
      poly(g, [[14, 3], [10, 6], [13, 8]], 6);
      outline(g, 1);
      poly(g, [[3, 4], [5, 6], [4, 7]], 13);
      poly(g, [[13, 4], [11, 6], [12, 7]], 13);
      eyes(g, 5, 7, 9, 7, 2, 3, 2, 1);
      put(g, 8, 10, 13); put(g, 7, 11, 1); put(g, 8, 11, 1); put(g, 9, 11, 1);
      line(g, 3, 10, 5, 10, 1); line(g, 11, 10, 13, 10, 1);
      return g;
    },
    rocket() {
      const g = makeGrid();
      poly(g, [[8, 0], [11, 6], [5, 6]], 5);
      ellipse(g, 8, 8.5, 3.6, 6, 2);
      rect(g, 5, 5, 6, 8, 3);
      outline(g, 1);
      circle(g, 8, 7, 1.8, 11);
      put(g, 8, 7, 10); put(g, 7, 6, 2);
      poly(g, [[4, 13], [2, 8], [4, 8]], 5);
      poly(g, [[12, 13], [14, 8], [12, 8]], 5);
      outline(g, 1);
      poly(g, [[6, 14], [8, 16], [10, 14]], 6);
      poly(g, [[7, 14], [8, 15.5], [9, 14]], 7);
      return g;
    },
    coin() {
      const g = makeGrid();
      circle(g, 8, 8, 6.2, 7);
      outline(g, 1);
      circle(g, 8, 8, 4.2, 6);
      circle(g, 8, 8, 2.4, 7);
      put(g, 6, 5, 2); put(g, 7, 4, 2); put(g, 5, 6, 2);
      put(g, 8, 6, 14); put(g, 8, 7, 14); put(g, 8, 8, 14); put(g, 8, 9, 14); put(g, 8, 10, 14);
      return g;
    },
    cloud() {
      const g = makeGrid();
      circle(g, 5, 8, 3.2, 2);
      circle(g, 9, 6.5, 3.8, 2);
      circle(g, 12, 9, 2.6, 2);
      rect(g, 3, 8, 11, 4, 2);
      ellipse(g, 8, 11.5, 6.4, 2, 2);
      outline(g, 4);
      eyes(g, 6, 9, 10, 9, 2, 2, 1, 1);
      put(g, 6, 12, 10); put(g, 7, 12, 10);
      return g;
    },
    snake() {
      const g = makeGrid();
      ellipse(g, 8, 8, 5, 3.5, 9);
      line(g, 3, 5, 1, 3, 9);
      line(g, 1, 3, 2, 2, 9);
      circle(g, 12, 8, 2.6, 9);
      outline(g, 1);
      put(g, 13, 7, 2); put(g, 13, 8, 1);
      put(g, 11, 10, 5);
      return g;
    },
    cactus() {
      const g = makeGrid();
      rect(g, 7, 3, 3, 11, 9);
      rect(g, 3, 6, 2, 5, 9);
      rect(g, 2, 6, 4, 2, 9);
      rect(g, 10, 8, 2, 5, 9);
      rect(g, 10, 8, 4, 2, 9);
      outline(g, 1);
      eyes(g, 7, 6, 9, 6, 1, 2, 2, 1);
      put(g, 4, 4, 2); put(g, 8, 3, 8);
      return g;
    },
    fish() {
      const g = makeGrid();
      ellipse(g, 7.5, 8, 5.5, 4, 10);
      poly(g, [[12, 8], [15, 4], [15, 12]], 11);
      outline(g, 1);
      circle(g, 6, 7, 1.2, 2);
      put(g, 6, 7, 1);
      line(g, 4, 9, 7, 9, 11);
      put(g, 9, 5, 2); put(g, 10, 6, 2);
      return g;
    },
    ball() {
      const g = makeGrid();
      circle(g, 8, 8, 6.4, 2);
      outline(g, 1);
      circle(g, 8, 8, 3.2, 1);
      circle(g, 3, 5, 1.6, 1);
      circle(g, 13, 5, 1.6, 1);
      circle(g, 3.5, 11, 1.6, 1);
      circle(g, 12.5, 11, 1.6, 1);
      put(g, 5, 4, 3); put(g, 4, 5, 3);
      return g;
    },
    car() {
      const g = makeGrid();
      rect(g, 2, 8, 12, 4, 5);
      poly(g, [[4, 8], [6, 4], [11, 4], [13, 8]], 11);
      outline(g, 1);
      rect(g, 7, 5, 3, 2, 10);
      circle(g, 4.5, 12, 2, 1);
      circle(g, 11.5, 12, 2, 1);
      circle(g, 4.5, 12, 1, 3);
      circle(g, 11.5, 12, 1, 3);
      put(g, 2, 9, 7); put(g, 13, 9, 7);
      return g;
    },
    flower() {
      const g = makeGrid();
      [[8, 4], [4, 7], [12, 7], [8, 10]].forEach(([x, y]) => circle(g, x, y, 2.4, 13));
      circle(g, 8, 7, 2.4, 7);
      outline(g, 1);
      rect(g, 8, 10, 1, 5, 9);
      put(g, 8, 12, 8); put(g, 9, 11, 8);
      eyes(g, 7, 6, 9, 6, 1, 2, 2, 5);
      return g;
    },
    alien() {
      const g = makeGrid();
      ellipse(g, 8, 8, 5, 6, 12);
      outline(g, 1);
      ellipse(g, 5.5, 7, 2, 2.8, 2);
      ellipse(g, 10.5, 7, 2, 2.8, 2);
      put(g, 5, 7, 1); put(g, 6, 8, 1); put(g, 10, 7, 1); put(g, 11, 8, 1);
      line(g, 6, 11, 10, 11, 9);
      line(g, 6, 3, 4, 0, 9); line(g, 10, 3, 12, 0, 9);
      put(g, 4, 0, 7); put(g, 12, 0, 7);
      return g;
    },
    ninja() {
      const g = makeGrid();
      circle(g, 8, 8, 5.6, 11);
      outline(g, 1);
      rect(g, 2, 5, 12, 3, 5);
      eyes(g, 5, 8, 10, 8, 2, 2, 2, 1);
      rect(g, 4, 4, 8, 1, 1);
      put(g, 8, 3, 2);
      line(g, 6, 12, 10, 12, 1);
      return g;
    },
    banana() {
      const g = makeGrid();
      poly(g, [[3, 3], [5, 2], [9, 5], [12, 9], [12, 13], [10, 14], [7, 11], [4, 7]], 7);
      poly(g, [[4, 5], [6, 4], [9, 7], [11, 10], [10, 12], [8, 10], [5, 7]], 8);
      outline(g, 1);
      put(g, 3, 2, 14); put(g, 12, 13, 14);
      put(g, 5, 4, 2);
      return g;
    },
    asteroid() {
      const g = makeGrid();
      circle(g, 8, 8, 6.2, 4);
      outline(g, 1);
      circle(g, 6, 6, 1.6, 3);
      circle(g, 10, 9, 2, 3);
      circle(g, 5, 10, 1.2, 3);
      put(g, 11, 5, 3);
      return g;
    },
    button() {
      const g = makeGrid();
      circle(g, 8, 8, 6.4, 5);
      outline(g, 1);
      circle(g, 8, 8, 4.6, 2);
      circle(g, 8, 8, 3.4, 5);
      put(g, 6, 5, 2); put(g, 7, 4, 2);
      eyes(g, 7, 7, 9, 7, 1, 2, 2, 5);
      return g;
    },
    target() {
      const g = makeGrid();
      circle(g, 8, 8, 7, 5);
      circle(g, 8, 8, 4.8, 2);
      circle(g, 8, 8, 2.2, 5);
      outline(g, 1);
      put(g, 8, 8, 1); put(g, 5, 4, 2);
      return g;
    },
    mole() {
      const g = makeGrid();
      ellipse(g, 8, 10, 5.4, 4.8, 14);
      ellipse(g, 8, 12, 3, 2.4, 6);
      outline(g, 1);
      eyes(g, 5, 8, 9, 8, 2, 2, 2, 1);
      circle(g, 8, 11, 1.4, 13);
      put(g, 8, 11, 5);
      line(g, 3, 12, 5, 13, 1); line(g, 12, 12, 10, 13, 1);
      put(g, 4, 4, 14); put(g, 11, 4, 14);
      return g;
    },
    balloon() {
      const g = makeGrid();
      ellipse(g, 8, 7, 5, 5.6, 5);
      poly(g, [[7, 12], [9, 12], [8, 14]], 5);
      outline(g, 1);
      put(g, 5, 4, 2); put(g, 6, 3, 2);
      line(g, 8, 14, 7, 15, 4);
      eyes(g, 5, 6, 8, 6, 1, 2, 2, 1);
      return g;
    },
    cube() {
      const g = makeGrid();
      poly(g, [[8, 1], [15, 4], [15, 11], [8, 14], [1, 11], [1, 4]], 13);
      poly(g, [[8, 1], [15, 4], [8, 7], [1, 4]], 7);
      poly(g, [[8, 7], [15, 4], [15, 11], [8, 14]], 6);
      outline(g, 1);
      eyes(g, 6, 8, 9, 8, 1, 1, 1, 2);
      put(g, 5, 4, 2);
      return g;
    },
    spark() {
      const g = makeGrid();
      poly(g, [[8, 0], [9, 6], [15, 8], [9, 9], [8, 15], [7, 9], [1, 8], [7, 6]], 7);
      outline(g, 1);
      put(g, 8, 7, 2); put(g, 8, 8, 2);
      return g;
    }
  };

  const DISPLAY_NAMES = {
    slime: 'Gotita', star: 'Estrella', heart: 'Corazón', bomb: 'Bomba', apple: 'Manzana',
    ghost: 'Fantasma', cat: 'Gato', rocket: 'Cohete', coin: 'Moneda', cloud: 'Nube',
    snake: 'Serpiente', cactus: 'Cactus', fish: 'Pez', ball: 'Balón', car: 'Coche',
    flower: 'Flor', alien: 'Alien', ninja: 'Ninja', banana: 'Plátano', asteroid: 'Asteroide',
    button: 'Botón', target: 'Diana', mole: 'Topo', balloon: 'Globo', cube: 'Cubo', spark: 'Destello'
  };

  const dataCache = {};
  function presetData(key) {
    if (!dataCache[key]) {
      const b = BUILDERS[key];
      dataCache[key] = b ? serialize(b()) : '0'.repeat(256);
    }
    return dataCache[key];
  }

  /* ----------------------------- canvas cache ----------------------------- */
  const canvasCache = new Map();

  function hexToRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  const paletteRgb = PALETTE.map(c => c ? hexToRgb(c) : null);

  function canvasFor(data) {
    if (canvasCache.has(data)) return canvasCache.get(data);
    const c = document.createElement('canvas');
    c.width = N; c.height = N;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(N, N);
    for (let i = 0; i < 256; i++) {
      const idx = parseInt(data[i] || '0', 16);
      const rgb = paletteRgb[idx];
      if (!rgb) continue;
      img.data[i * 4] = rgb[0];
      img.data[i * 4 + 1] = rgb[1];
      img.data[i * 4 + 2] = rgb[2];
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    canvasCache.set(data, c);
    return c;
  }

  function drawSprite(ctx, data, x, y, w, h) {
    if (!data || data.length !== 256) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvasFor(data), Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /* ----------------------------- fondos de pantalla ----------------------------- */
  const bgCache = new Map();

  function bgSeed(i) {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function paintBackground(ctx, bg, W, H) {
    const color = bg.color || '#101a36';
    const accent = bg.accent || '#4fd1ff';
    const k = W / 1280;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    ctx.save();

    if (bg.pattern === 'sunset') {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, color);
      grad.addColorStop(0.62, accent);
      grad.addColorStop(1, '#1b2340');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.arc(W * 0.74, H * 0.5, 110 * k, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 26; i++) ctx.fillRect((i * 191 * k + 40) % W, (i * 97 * k + 30) % (H * 0.55), 4 * k, 4 * k);
    } else if (bg.pattern === 'stars') {
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      for (let i = 0; i < 110; i++) {
        const x = bgSeed(i) * W, y = bgSeed(i + 300) * H * 0.9;
        const s = (bgSeed(i + 700) > 0.82 ? 3 : 1.5) * k;
        ctx.fillRect(Math.round(x), Math.round(y), s, s);
      }
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(W * 0.82, H * 0.2, 74 * k, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#fff8e8';
      ctx.beginPath(); ctx.arc(W * 0.82, H * 0.2, 54 * k, 0, Math.PI * 2); ctx.fill();
    } else if (bg.pattern === 'bricks') {
      const bw = 160 * k, bh = 64 * k, mortar = 5 * k;
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = accent;
      for (let row = 0, y = 0; y < H + bh; row++, y += bh) {
        const off = row % 2 ? bw / 2 : 0;
        for (let x = -bw; x < W + bw; x += bw) {
          ctx.fillRect(x + off, y, bw - mortar, bh - mortar);
        }
      }
    } else if (bg.pattern === 'waves') {
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 5 * k;
      for (let row = 0; row < 7; row++) {
        const y0 = (row + 0.5) * H / 7;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 16 * k) {
          const y = y0 + Math.sin(x / (110 * k) + row * 0.9) * 22 * k;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } else if (bg.pattern === 'clouds') {
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = accent;
      for (let i = 0; i < 12; i++) {
        const x = (bgSeed(i) * W * 1.2) - W * 0.1;
        const y = bgSeed(i + 40) * H;
        const r = (46 + bgSeed(i + 80) * 54) * k;
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.7, r * 0.6, 0, 0, Math.PI * 2);
        ctx.ellipse(x - r * 0.7, y + r * 0.18, r * 0.8, r * 0.5, 0, 0, Math.PI * 2);
        ctx.ellipse(x + r * 0.8, y + r * 0.2, r * 0.9, r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (bg.pattern === 'circuit') {
      const step = 80 * k;
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3 * k;
      ctx.fillStyle = accent;
      for (let y = 0; y <= H; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      for (let x = 0; x <= W; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 46; i++) {
        const gx = Math.round(bgSeed(i) * (W / step)) * step;
        const gy = Math.round(bgSeed(i + 90) * (H / step)) * step;
        ctx.fillRect(gx - 5 * k, gy - 5 * k, 10 * k, 10 * k);
      }
    } else if (bg.pattern === 'grid') {
      ctx.globalAlpha = 0.14;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2 * k;
      for (let x = 0; x <= W; x += 64 * k) {
        ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke();
      }
      for (let y = 0; y <= H; y += 64 * k) {
        ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
      }
    } else if (bg.pattern === 'dots') {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = accent;
      for (let y = 32 * k; y < H; y += 64 * k) for (let x = 32 * k; x < W; x += 64 * k) {
        ctx.fillRect(x - 4 * k, y - 4 * k, 8 * k, 8 * k);
      }
    } else if (bg.pattern === 'checker') {
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = accent;
      for (let y = 0; y < H; y += 64 * k) for (let x = 0; x < W; x += 64 * k) {
        if ((Math.round(x / (64 * k)) + Math.round(y / (64 * k))) % 2 === 0) ctx.fillRect(x, y, 64 * k, 64 * k);
      }
    } else if (bg.pattern === 'stripes') {
      ctx.globalAlpha = 0.13;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 10 * k;
      for (let i = -H; i < W; i += 72 * k) {
        ctx.beginPath(); ctx.moveTo(i, H); ctx.lineTo(i + H, 0); ctx.stroke();
      }
    } else {
      // Liso: un degradado suave para dar profundidad sin textura.
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, color);
      grad.addColorStop(1, '#080c18');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(W * 0.5, H * 0.5, H * 0.45, 0, Math.PI * 2); ctx.fill();
    }

    // Viñeta común.
    const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,.34)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function backgroundCanvas(bg, W, H) {
    const key = [W, H, bg.color, bg.pattern, bg.accent].join('|');
    if (bgCache.has(key)) return bgCache.get(key);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W));
    c.height = Math.max(1, Math.round(H));
    paintBackground(c.getContext('2d'), bg, c.width, c.height);
    bgCache.set(key, c);
    if (bgCache.size > 12) bgCache.delete(bgCache.keys().next().value);
    return c;
  }

  /* ----------------------------- API ----------------------------- */
  MI.sprites = {
    N, PALETTE, PALETTE_NAMES, DISPLAY_NAMES,
    keys() { return Object.keys(BUILDERS); },
    preset(key) { return presetData(key); },
    empty() { return '0'.repeat(256); },
    fromGrid: serialize,
    data: presetData,
    canvasFor,
    draw: drawSprite,
    variant(key, dx, dy) {
      const g = makeGrid();
      const src = presetData(key);
      for (let i = 0; i < 256; i++) g[i] = parseInt(src[i], 16);
      return serialize(shiftGrid(g, dx, dy));
    },
    gridFrom(data) {
      const g = makeGrid();
      for (let i = 0; i < 256; i++) g[i] = parseInt(data[i] || '0', 16);
      return g;
    },
    makeObject(name, key, opts) {
      opts = opts || {};
      const base = presetData(key);
      let frames;
      if (Array.isArray(opts.frames) && opts.frames.length) {
        frames = opts.frames.map(f => {
          if (typeof f === 'string' && f.length === 256) return f;
          if (BUILDERS[f]) return presetData(f);
          return base;
        });
      } else {
        frames = [base, base, base, base];
      }
      while (frames.length < 4) frames.push(frames[frames.length - 1]);
      frames = frames.slice(0, 4);
      return {
        id: MI.util.uid('obj'),
        name: name || DISPLAY_NAMES[key] || 'Objeto',
        x: opts.x != null ? opts.x : 592,
        y: opts.y != null ? opts.y : 312,
        w: opts.w || 96,
        h: opts.h || 96,
        placement: opts.placement === 'zone' ? 'zone' : 'point',
        zone: opts.zone || { x: 320, y: 160, w: 640, h: 400 },
        visible: opts.visible !== false,
        fps: opts.fps || 6,
        anims: frames
      };
    },
    thumb(canvas, data) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      const s = Math.min(canvas.width, canvas.height);
      ctx.drawImage(canvasFor(data), 0, 0, s, s);
    },
    renderGameThumb(canvas, game) {
      const ctx = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height;
      const sx = W / MI.W, sy = H / MI.H;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.scale(sx, sy);
      MI.sprites.background(ctx, (game && game.bg) || { color: '#101a36', pattern: 'grid', accent: '#4fd1ff' }, MI.W, MI.H);
      if (game && Array.isArray(game.objects)) {
        game.objects.forEach(o => {
          if (o.visible === false) return;
          drawSprite(ctx, o.anims[0], o.x, o.y, o.w, o.h);
        });
      }
      ctx.restore();
    },
    background(ctx, bg, W, H) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(backgroundCanvas(bg || {}, W, H), 0, 0, W, H);
    }
  };

})();
