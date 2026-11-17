/* ============================================================
   MICROGAMES INC. — pixel.js
   Editor de píxeles para las 4 celdas de animación.
   Incluye zoom y cuadrícula conmutable.
   ============================================================ */
(function () {
  'use strict';
  const MI = window.MI;
  const U = MI.util;
  const el = MI.el;

  const P = MI.pixelEditor = {};

  P.open = function (obj, frameIndex, onClose) {
    if (!obj) return;
    const frameSeed = U.clamp(frameIndex | 0, 0, 3);
    const state = {
      frame: frameSeed,
      tool: 'pencil',
      color: 1,
      changed: false,
      down: false,
      last: null,
      hover: null,
      history: [],
      hIndex: -1,
      zoom: 24,
      showGrid: true
    };

    let grid = MI.sprites.gridFrom(obj.anims[state.frame] || MI.sprites.empty());

    function currentData() {
      return MI.sprites.fromGrid(grid);
    }

    function applyGrid() {
      obj.anims[state.frame] = currentData();
      state.changed = true;
      redraw();
    }

    function pushHistory() {
      state.history = state.history.slice(0, state.hIndex + 1);
      state.history.push({ frame: state.frame, data: obj.anims[state.frame] });
      if (state.history.length > 50) state.history.shift();
      state.hIndex = state.history.length - 1;
    }

    function restore(entry) {
      state.frame = entry.frame;
      obj.anims[state.frame] = entry.data;
      grid = MI.sprites.gridFrom(entry.data);
      state.changed = true;
      syncFrames();
      redraw();
      updateThumbs();
    }

    function undo() {
      if (state.hIndex <= 0) return;
      const entry = state.history[state.hIndex];
      state.hIndex--;
      restore(state.history[state.hIndex]);
      MI.audio.sfx('tick');
    }
    function redo() {
      if (state.hIndex >= state.history.length - 1) return;
      state.hIndex++;
      restore(state.history[state.hIndex]);
      MI.audio.sfx('tick');
    }

    /* ----------------------------- DOM ----------------------------- */
    const canvas = el('canvas', { width: 16 * state.zoom, height: 16 * state.zoom, id: 'pixel-canvas' });
    const ctx = canvas.getContext('2d');

    const tools = [
      { id: 'pencil', icon: '✏️', name: 'Lápiz' },
      { id: 'eraser', icon: '🧽', name: 'Borrador' },
      { id: 'fill', icon: '🪣', name: 'Relleno' },
      { id: 'picker', icon: '💧', name: 'Cuentagotas' }
    ];
    const toolsWrap = el('div', { class: 'pixel-tools' });
    const toolBtns = {};
    tools.forEach(t => {
      const b = el('button', { class: 'pixel-tool' + (state.tool === t.id ? ' active' : ''), type: 'button', title: t.name, text: t.icon + ' ' + t.name });
      b.addEventListener('click', () => {
        state.tool = t.id;
        Object.keys(toolBtns).forEach(k => toolBtns[k].classList.toggle('active', k === t.id));
        canvas.style.cursor = t.id === 'picker' ? 'copy' : (t.id === 'fill' ? 'cell' : 'crosshair');
      });
      toolBtns[t.id] = b;
      toolsWrap.appendChild(b);
    });

    const palette = el('div', { class: 'palette' });
    const paletteBtns = [];
    MI.sprites.PALETTE.forEach((color, idx) => {
      const b = el('button', {
        type: 'button',
        class: idx === 0 ? 'transparent' : '',
        title: MI.sprites.PALETTE_NAMES[idx],
        style: color ? { background: color } : {}
      });
      if (idx === state.color) b.classList.add('active');
      b.addEventListener('click', () => {
        state.color = idx;
        if (state.tool === 'eraser') {
          state.tool = 'pencil';
          Object.keys(toolBtns).forEach(k => toolBtns[k].classList.toggle('active', k === 'pencil'));
        }
        paletteBtns.forEach((pb, i) => pb.classList.toggle('active', i === idx));
      });
      paletteBtns.push(b);
      palette.appendChild(b);
    });

    const framesWrap = el('div', { class: 'pixel-frames' });
    const frameBtns = [];
    const frameCanvases = [];
    for (let i = 0; i < 4; i++) {
      const b = el('button', { class: 'pf' + (i === state.frame ? ' active' : ''), type: 'button', title: 'Celda ' + (i + 1) });
      const c = el('canvas', { width: 16, height: 16 });
      b.appendChild(c);
      b.addEventListener('click', () => {
        state.frame = i;
        grid = MI.sprites.gridFrom(obj.anims[i]);
        syncFrames();
        redraw();
        updateThumbs();
      });
      frameBtns.push(b);
      frameCanvases.push(c);
      framesWrap.appendChild(b);
    }

    const shapesWrap = el('div', { class: 'shape-list' });
    MI.sprites.keys().forEach(key => {
      const b = el('button', { type: 'button', title: MI.sprites.DISPLAY_NAMES[key] || key });
      const c = el('canvas', { width: 16, height: 16 });
      MI.sprites.thumb(c, MI.sprites.preset(key));
      b.appendChild(c);
      b.addEventListener('click', () => {
        pushHistory();
        grid = MI.sprites.gridFrom(MI.sprites.preset(key));
        applyGrid();
        updateThumbs();
      });
      shapesWrap.appendChild(b);
    });

    const undoBtn = el('button', { class: 'pixel-tool', type: 'button', text: '↶ Deshacer' });
    undoBtn.addEventListener('click', undo);
    const redoBtn = el('button', { class: 'pixel-tool', type: 'button', text: '↷ Rehacer' });
    redoBtn.addEventListener('click', redo);

    const nudgeWrap = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' } });
    [
      ['', '↑', ''],
      ['←', '', '→'],
      ['', '↓', '']
    ].forEach(row => row.forEach(dir => {
      if (!dir) { nudgeWrap.appendChild(el('span')); return; }
      const b = el('button', { class: 'pixel-tool', type: 'button', text: dir, title: 'Mover el dibujo ' + dir });
      b.addEventListener('click', () => {
        pushHistory();
        const dx = dir === '←' ? -1 : (dir === '→' ? 1 : 0);
        const dy = dir === '↑' ? -1 : (dir === '↓' ? 1 : 0);
        const next = new Uint8Array(256);
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          const v = grid[y * 16 + x];
          if (!v) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < 16 && ny >= 0 && ny < 16) next[ny * 16 + nx] = v;
        }
        grid = next;
        applyGrid();
        updateThumbs();
      });
      nudgeWrap.appendChild(b);
    }));

    /* ----------------------------- zoom / cuadrícula ----------------------------- */
    const zoomLabel = el('span', { class: 'pixel-zoom-label', text: state.zoom + ' px' });
    const zoomOut = el('button', { class: 'pixel-tool', type: 'button', text: '－', title: 'Reducir zoom' });
    const zoomIn = el('button', { class: 'pixel-tool', type: 'button', text: '＋', title: 'Aumentar zoom' });
    const zoomRange = el('input', {
      type: 'range', min: 8, max: 32, step: 2, value: String(state.zoom),
      class: 'pixel-zoom-range', title: 'Zoom del lienzo'
    });
    const gridToggle = el('input', { type: 'checkbox', checked: state.showGrid });
    const gridLabel = el('label', { class: 'pixel-grid-toggle' }, [
      gridToggle,
      el('span', { text: 'Cuadrícula' })
    ]);

    function setZoom(z) {
      state.zoom = U.clamp(Math.round(z / 2) * 2, 8, 32);
      zoomRange.value = String(state.zoom);
      zoomLabel.textContent = state.zoom + ' px';
      canvas.width = 16 * state.zoom;
      canvas.height = 16 * state.zoom;
      canvas.style.width = (16 * state.zoom) + 'px';
      canvas.style.height = (16 * state.zoom) + 'px';
      redraw();
    }
    zoomOut.addEventListener('click', () => setZoom(state.zoom - 2));
    zoomIn.addEventListener('click', () => setZoom(state.zoom + 2));
    zoomRange.addEventListener('input', () => setZoom(Number(zoomRange.value)));
    gridToggle.addEventListener('change', () => { state.showGrid = gridToggle.checked; redraw(); });

    const zoomWrap = el('div', { class: 'pixel-zoom-bar' }, [
      el('span', { class: 'micro-label', style: { margin: 0 }, text: 'Zoom' }),
      zoomOut,
      zoomRange,
      zoomIn,
      zoomLabel,
      gridLabel
    ]);

    const side = el('div', { class: 'pixel-side' }, [
      el('div', {}, [
        el('div', { class: 'micro-label', text: 'Celdas de animación' }),
        framesWrap
      ]),
      el('div', {}, [
        el('div', { class: 'micro-label', text: 'Paleta' }),
        palette
      ]),
      el('div', {}, [
        el('div', { class: 'micro-label', text: 'Deshacer' }),
        el('div', { class: 'pixel-tools' }, [undoBtn, redoBtn])
      ]),
      el('div', {}, [
        el('div', { class: 'micro-label', text: 'Mover dibujo' }),
        nudgeWrap
      ]),
      el('div', {}, [
        el('div', { class: 'micro-label', text: 'Insertar sprite' }),
        shapesWrap
      ])
    ]);

    const left = el('div', { class: 'pixel-canvas-wrap' }, [
      el('div', { class: 'pixel-canvas-shell' }, canvas),
      zoomWrap,
      toolsWrap,
      el('p', { class: 'field-note', style: { textAlign: 'center', margin: 0 }, text: 'Lienzo de 16×16. Usa el zoom para editar con precisión y desactiva la cuadrícula si prefieres ver el dibujo limpio.' })
    ]);

    const body = el('div', { class: 'pixel-editor' }, [left, side]);

    MI.modal.open({
      title: 'Editor de píxeles · ' + obj.name,
      wide: true,
      dismissible: true,
      body,
      footer: [
        {
          label: 'Copiar a las 4', className: 'btn-paper', close: false,
          onClick: () => {
            pushHistory();
            const data = obj.anims[state.frame];
            for (let i = 0; i < 4; i++) obj.anims[i] = data;
            state.changed = true;
            syncFrames();
            redraw();
            updateThumbs();
            MI.toast('Animación copiada a las 4 celdas', 'ok');
          }
        },
        {
          label: 'Limpiar celda', className: 'btn-danger', close: false,
          onClick: () => {
            pushHistory();
            grid = new Uint8Array(256);
            applyGrid();
            updateThumbs();
          }
        },
        { label: 'Hecho ✓', className: 'btn-lime', onClick: () => {} }
      ],
      onClose: () => {
        if (onClose) onClose(state.changed);
      }
    });

    function syncFrames() {
      frameBtns.forEach((b, i) => b.classList.toggle('active', i === state.frame));
    }

    function updateThumbs() {
      for (let i = 0; i < 4; i++) {
        MI.sprites.thumb(frameCanvases[i], obj.anims[i]);
      }
    }

    function redraw() {
      const PX = state.zoom;
      const SIZE = 16 * PX;
      if (canvas.width !== SIZE) {
        canvas.width = SIZE;
        canvas.height = SIZE;
        canvas.style.width = SIZE + 'px';
        canvas.style.height = SIZE + 'px';
      }
      ctx.clearRect(0, 0, SIZE, SIZE);

      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          ctx.fillStyle = state.showGrid
            ? (((x + y) % 2 === 0) ? '#232c4a' : '#1b2440')
            : '#1b2440';
          ctx.fillRect(x * PX, y * PX, PX, PX);
        }
      }
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const v = grid[y * 16 + x];
          if (!v) continue;
          ctx.fillStyle = MI.sprites.PALETTE[v];
          ctx.fillRect(x * PX, y * PX, PX, PX);
        }
      }
      if (state.showGrid) {
        ctx.strokeStyle = 'rgba(255,255,255,.09)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 16; i++) {
          ctx.beginPath(); ctx.moveTo(i * PX + 0.5, 0); ctx.lineTo(i * PX + 0.5, SIZE); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i * PX + 0.5); ctx.lineTo(SIZE, i * PX + 0.5); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(79,209,255,.26)';
        for (let i = 0; i <= 16; i += 4) {
          ctx.beginPath(); ctx.moveTo(i * PX + 0.5, 0); ctx.lineTo(i * PX + 0.5, SIZE); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i * PX + 0.5); ctx.lineTo(SIZE, i * PX + 0.5); ctx.stroke();
        }
      }
      if (state.hover) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(state.hover.x * PX + 1, state.hover.y * PX + 1, PX - 2, PX - 2);
      }
    }

    function cellAt(e) {
      const r = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / r.width * 16);
      const y = Math.floor((e.clientY - r.top) / r.height * 16);
      if (x < 0 || x > 15 || y < 0 || y > 15) return null;
      return { x, y };
    }

    function putCell(x, y, v) {
      const i = y * 16 + x;
      if (grid[i] === v) return false;
      grid[i] = v;
      return true;
    }

    function lineTo(cx, cy) {
      if (!state.last) return putCell(cx, cy, state.tool === 'eraser' ? 0 : state.color);
      let x0 = state.last.x, y0 = state.last.y;
      const x1 = cx, y1 = cy;
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (let guard = 0; guard < 40; guard++) {
        putCell(x0, y0, state.tool === 'eraser' ? 0 : state.color);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
      state.last = { x: cx, y: cy };
      return true;
    }

    function floodFill(sx, sy, value) {
      const target = grid[sy * 16 + sx];
      if (target === value) return false;
      const stack = [[sx, sy]];
      let touched = false;
      while (stack.length) {
        const [x, y] = stack.pop();
        if (x < 0 || x > 15 || y < 0 || y > 15) continue;
        if (grid[y * 16 + x] !== target) continue;
        grid[y * 16 + x] = value;
        touched = true;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      return touched;
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      const c = cellAt(e);
      if (!c) return;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }

      if (state.tool === 'picker') {
        const v = grid[c.y * 16 + c.x];
        state.color = v;
        paletteBtns.forEach((pb, i) => pb.classList.toggle('active', i === v));
        state.tool = 'pencil';
        Object.keys(toolBtns).forEach(k => toolBtns[k].classList.toggle('active', k === 'pencil'));
        return;
      }

      pushHistory();
      state.down = true;
      state.last = null;
      if (state.tool === 'fill') {
        const val = state.color;
        if (floodFill(c.x, c.y, val)) applyGrid();
        else historyNoop();
      } else {
        lineTo(c.x, c.y);
        state.last = { x: c.x, y: c.y };
        applyGrid();
      }
      updateThumbs();
    });

    function historyNoop() {
      state.history.pop();
      state.hIndex = state.history.length - 1;
    }

    canvas.addEventListener('pointermove', (e) => {
      const c = cellAt(e);
      if (!c) { if (state.hover) { state.hover = null; redraw(); } return; }
      state.hover = c;
      if (state.down && (state.tool === 'pencil' || state.tool === 'eraser')) {
        lineTo(c.x, c.y);
        applyGrid();
      } else {
        redraw();
      }
    });

    function stopPaint(e) {
      state.down = false;
      state.last = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
      updateThumbs();
    }
    canvas.addEventListener('pointerup', stopPaint);
    canvas.addEventListener('pointercancel', stopPaint);
    canvas.addEventListener('pointerleave', () => {
      state.hover = null;
      redraw();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // pintar con clic derecho = borrar
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        const c = cellAt(e);
        if (!c) return;
        pushHistory();
        grid[c.y * 16 + c.x] = 0;
        applyGrid();
        updateThumbs();
      }
    });

    pushHistory();
    syncFrames();
    updateThumbs();
    setZoom(state.zoom);
  };

})();
