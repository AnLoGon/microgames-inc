/* ============================================================
   MICROGAMES INC. — editor.js
   Editor visual de microjuegos (parte 1: escenario y estado)
   ============================================================ */
(function () {
  'use strict';
  const MI = window.MI;
  const U = MI.util;
  const $ = MI.$;
  const el = MI.el;

  const DIRS = [
    { v: 5, a: '↖' }, { v: 6, a: '↑' }, { v: 7, a: '↗' },
    { v: 4, a: '←' }, { v: -1, a: '·' }, { v: 0, a: '→' },
    { v: 3, a: '↙' }, { v: 2, a: '↓' }, { v: 1, a: '↘' }
  ];

  const OBJ_MIN = MI.OBJ_MIN;
  const OBJ_MAX = MI.OBJ_MAX;
  const BOUNDS = { x0: -MI.W, x1: MI.W * 2, y0: -MI.H, y1: MI.H * 2 };
  // La rejilla del editor equivale a 8 px del diseño antiguo de 320×240.
  const SNAP_STEP = 32;
  const HANDLE = 30;
  const MIN_ZONE = 24;

  const state = {
    active: false,
    game: null,
    savedId: null,
    source: 'new',
    selectedObjectId: null,
    selectedZoneId: null,
    tab: 'object',
    tool: 'select',
    snap: true,
    pick: null,
    drag: null,
    pickDrag: null,
    zoneDrag: null,
    animClock: 0,
    animIndex: 0,
    animFrame: 0,
    frameClipboard: null,
    ruleClipboard: null,
    previewSpeed: 1,
    previewSwitches: true,
    animPreview: null,
    history: [],
    hIndex: -1,
    dirty: false,
    onExit: null
  };

  let bound = false;
  let raf = null;
  let lastTs = 0;
  let autosaveTimer = null;
  let fileInput = null;

  const E = MI.editor = {};
  E.state = state;

  /* ----------------------------- helpers ----------------------------- */
  function objById(id) { return (state.game.objects || []).find(o => o.id === id) || null; }
  function zoneById(id) { return (state.game.zones || []).find(z => z.id === id) || null; }

  function selectedObject() { return objById(state.selectedObjectId); }
  function selectedZone() { return zoneById(state.selectedZoneId); }

  function snapVal(v) { return state.snap ? Math.round(v / SNAP_STEP) * SNAP_STEP : Math.round(v); }

  function requiresSubject(t) {
    if (!t) return false;
    if (t.type === 'tap') return t.where !== 'stage';
    if (t.type === 'touch' || t.type === 'overlap') return true;
    if (t.type === 'anim') return true;
    if (t.type === 'switch') return t.objectId === 'self';
    return false;
  }

  function otherObjects(excludeId) {
    return (state.game.objects || []).filter(o => o.id !== excludeId);
  }

  function createText(data) {
    const t = {
      id: U.uid('text'),
      text: (data && data.text) || 'Texto',
      x: Math.round(data && data.x != null ? data.x : MI.W / 2),
      y: Math.round(data && data.y != null ? data.y : MI.H / 2),
      size: U.clamp(Math.round(data && data.size ? data.size : 56), 10, 160),
      font: (data && data.font) || 'display',
      align: (data && data.align) || 'center',
      color: (data && data.color) || '#ffd23f'
    };
    state.game.texts.push(t);
    return t;
  }
  function textById(id) { return (state.game.texts || []).find(t => t.id === id) || null; }

  function createZone(rect, name) {
    const z = {
      id: U.uid('zone'),
      name: name || ('Zona ' + (state.game.zones.length + 1)),
      x: Math.round(rect.x), y: Math.round(rect.y),
      w: Math.max(MIN_ZONE, Math.round(rect.w)), h: Math.max(MIN_ZONE, Math.round(rect.h))
    };
    state.game.zones.push(z);
    return z;
  }

  function ensureZone() {
    if (state.game.zones.length) return state.game.zones[0].id;
    const z = createZone({ x: 288, y: 168, w: 704, h: 384 }, 'Zona 1');
    commit();
    return z.id;
  }

  /* ----------------------------- historial / guardado ----------------------------- */
  function markDirty() {
    state.dirty = true;
    updateSaveState('Sin guardar', '');
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      if (!state.active) return;
      MI.store.setDraft({ game: U.deepClone(state.game), savedId: state.savedId, source: state.source });
      updateSaveState('Borrador guardado', '');
    }, 700);
  }

  function updateSaveState(text, cls) {
    const node = $('#save-state');
    if (!node) return;
    node.textContent = text;
    node.className = 'save-state ' + (cls || '');
  }

  function commit() {
    if (!state.game) return;
    // Mantiene anims/fps antiguos sincronizados con la primera animación.
    state.game.objects.forEach(o => MI.syncObjectAliases(o));
    state.history = state.history.slice(0, state.hIndex + 1);
    state.history.push(U.deepClone(state.game));
    if (state.history.length > 60) state.history.shift();
    state.hIndex = state.history.length - 1;
    markDirty();
    updateUndoButtons();
  }

  function restoreHistory() {
    const snap = state.history[state.hIndex];
    if (!snap) return;
    state.game = U.deepClone(snap);
    if (!objById(state.selectedObjectId)) state.selectedObjectId = null;
    if (!zoneById(state.selectedZoneId)) state.selectedZoneId = null;
    markDirty();
    renderAll();
  }
  function undo() {
    if (state.hIndex <= 0) { MI.toast('No hay más cambios que deshacer'); return; }
    state.hIndex--;
    restoreHistory();
    MI.audio.sfx('select');
  }
  function redo() {
    if (state.hIndex >= state.history.length - 1) { MI.toast('No hay cambios que rehacer'); return; }
    state.hIndex++;
    restoreHistory();
    MI.audio.sfx('select');
  }
  function updateUndoButtons() {
    const u = $('#btn-undo'), r = $('#btn-redo');
    if (u) u.disabled = state.hIndex <= 0;
    if (r) r.disabled = state.hIndex >= state.history.length - 1;
  }
  E.commit = commit;
  E.undo = undo;
  E.redo = redo;
  E.markDirty = markDirty;
  E.objById = objById;
  E.zoneById = zoneById;
  E.createZone = createZone;
  E.ensureZone = ensureZone;
  E.otherObjects = otherObjects;
  E.renderAll = () => renderAll();

  /* ----------------------------- apertura ----------------------------- */
  E.open = function (game, opts) {
    opts = opts || {};
    MI.modal.close();
    state.active = true;
    state.game = U.deepClone(game);
    if (!Array.isArray(state.game.texts)) state.game.texts = [];
    state.savedId = opts.savedId || null;
    state.source = opts.source || 'edit';
    state.onExit = opts.onExit || null;
    state.selectedObjectId = state.game.objects[0] ? state.game.objects[0].id : null;
    state.selectedZoneId = null;
    state.tab = 'object';
    state.tool = 'select';
    state.pick = null;
    state.drag = null;
    state.pickDrag = null;
    state.zoneDrag = null;
    state.animClock = 0;
    state.animIndex = 0;
    state.animFrame = 0;
    state.animPreview = null;
    state.history = [U.deepClone(state.game)];
    state.hIndex = 0;
    state.dirty = false;
    state.frameClipboard = null;

    if (!bound) bind();

    const nameInput = $('#game-name');
    if (nameInput) nameInput.value = state.game.name;
    updateSaveState(state.savedId ? 'Guardado' : 'Borrador', state.savedId ? 'saved' : '');
    setTool('select');
    const snap = $('#snap-grid');
    if (snap) snap.checked = state.snap;
    const testSpeed = $('#test-speed');
    if (testSpeed) testSpeed.value = String(state.previewSpeed);
    const testSwitches = $('#test-switches');
    if (testSwitches) testSwitches.checked = state.previewSwitches;
    renderAll();
    updateUndoButtons();

    if (raf) cancelAnimationFrame(raf);
    lastTs = 0;
    raf = requestAnimationFrame(loop);
  };

  E.close = function () {
    if (!state.active) return;
    if (state.dirty && state.game) {
      MI.store.setDraft({ game: U.deepClone(state.game), savedId: state.savedId, source: state.source });
    }
    state.active = false;
    state.pick = null;
    state.drag = null;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
  };

  E.getGame = function () { return state.game; };

  /* ----------------------------- pestañas / herramientas ----------------------------- */
  function setTab(tab) {
    state.tab = tab;
    MI.$$('#inspector-tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    renderInspector();
    const body = $('#inspector-body');
    if (body) body.scrollTop = 0;
  }
  E.setTab = setTab;

  function setTool(tool) {
    state.tool = tool;
    if (tool !== 'pick') state.pick = null;
    MI.$$('.stage-toolbar .tool[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    const canvas = $('#editor-canvas');
    if (canvas) {
      canvas.classList.toggle('tool-select', tool === 'select');
      canvas.classList.toggle('dragging', false);
    }
    setHint(tool === 'zone'
      ? 'Arrastra sobre el escenario para dibujar una zona. Puedes salir del borde para agrandarla.'
      : (tool === 'text'
        ? 'Haz clic en el escenario para colocar un texto y elegir su fuente, tamaño y alineación.'
        : 'Arrastra los objetos para colocarlos. Haz clic en un objeto o zona para editarlo.'));
  }
  E.setTool = setTool;

  function setHint(text) {
    const h = $('#context-hint');
    if (h) h.textContent = text;
  }

  /* ----------------------------- pickers ----------------------------- */
  function startPick(type, cb, message) {
    state.pick = { type, cb };
    state.tool = 'pick';
    MI.$$('.stage-toolbar .tool[data-tool]').forEach(b => b.classList.remove('active'));
    setHint(message || (type === 'point'
      ? 'Haz clic en el escenario para elegir el punto. Pulsa Esc para cancelar.'
      : 'Arrastra para dibujar la zona. Puedes salir del escenario. Pulsa Esc para cancelar.'));
    $('#editor-canvas').classList.add('tool-select');
  }
  function clearPick() {
    state.pick = null;
    state.pickDrag = null;
    setTool('select');
  }
  function cancelPick() {
    if (!state.pick) return;
    clearPick();
    MI.toast('Selección cancelada');
    renderAll();
  }
  E.startPick = startPick;
  E.cancelPick = cancelPick;

  /* ----------------------------- loop de dibujo ----------------------------- */
  function loop(ts) {
    if (!state.active) return;
    if (!lastTs) lastTs = ts;
    const dt = Math.min(60, ts - lastTs);
    lastTs = ts;
    state.animClock += dt;
    const screen = $('#screen-editor');
    const modalOpen = $('#modal-root') && $('#modal-root').classList.contains('open');
    if (screen && screen.classList.contains('active') && !modalOpen) {
      drawStage();
      drawAnimPreview();
    }
    raf = requestAnimationFrame(loop);
  }

  function stageCoords(e) {
    const c = $('#editor-canvas');
    const r = c.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * MI.W,
      y: (e.clientY - r.top) / r.height * MI.H
    };
  }

  function animIndexFor(o) {
    return o && o.id === state.selectedObjectId ? state.animIndex : 0;
  }

  function animOf(o, index) {
    const animations = MI.objectAnimations(o);
    return animations[index] || animations[0];
  }

  function animFrameData(o, index, frame) {
    const anim = animOf(o, index);
    return (anim && anim.frames[frame]) || (anim && anim.frames[0]) || MI.sprites.empty();
  }

  function frameFor(o) {
    const index = animIndexFor(o);
    const anim = animOf(o, index);
    const fps = Math.max(1, MI.animFps(anim && anim.speed));
    return Math.floor(state.animClock / (1000 / fps)) % 4;
  }

  const LABEL_FONT = 'bold 24px "Cascadia Mono", Consolas, monospace';

  function drawTag(ctx, text, x, y, color, bg) {
    ctx.font = LABEL_FONT;
    const tw = ctx.measureText(text).width;
    const pad = 10;
    const h = 34;
    ctx.fillStyle = bg || 'rgba(20,28,56,.86)';
    ctx.fillRect(x, y, tw + pad * 2, h);
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + pad, y + h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }

  function drawGrid(ctx) {
    if (!state.snap) return;
    ctx.save();
    // Líneas menores y mayores para poder alinear objetos y zonas con claridad.
    for (let x = 0; x <= MI.W; x += SNAP_STEP) {
      const major = x % (SNAP_STEP * 4) === 0;
      ctx.strokeStyle = major ? 'rgba(255,255,255,.26)' : 'rgba(255,255,255,.12)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, MI.H);
      ctx.stroke();
    }
    for (let y = 0; y <= MI.H; y += SNAP_STEP) {
      const major = y % (SNAP_STEP * 4) === 0;
      ctx.strokeStyle = major ? 'rgba(255,255,255,.26)' : 'rgba(255,255,255,.12)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(MI.W, y + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawZones(ctx) {
    for (const z of state.game.zones) {
      const sel = z.id === state.selectedZoneId;
      ctx.save();
      ctx.fillStyle = sel ? 'rgba(255,210,63,0.16)' : 'rgba(164,92,255,0.12)';
      ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.setLineDash([16, 12]);
      ctx.strokeStyle = sel ? '#ffd23f' : '#a45cff';
      ctx.lineWidth = sel ? 6 : 4;
      ctx.strokeRect(z.x + 2, z.y + 2, z.w, z.h);
      ctx.setLineDash([]);
      drawTag(ctx, z.name, z.x + 4, z.y + 4, sel ? '#ffd23f' : '#d9c2ff');
      if (sel) {
        const pts = [[z.x, z.y], [z.x + z.w, z.y], [z.x, z.y + z.h], [z.x + z.w, z.y + z.h]];
        pts.forEach(([px, py]) => {
          ctx.fillStyle = '#ffd23f';
          ctx.fillRect(px - 7, py - 7, 14, 14);
          ctx.strokeStyle = '#1b2340';
          ctx.lineWidth = 2;
          ctx.strokeRect(px - 7, py - 7, 14, 14);
        });
      }
      ctx.restore();
    }
  }

  function drawTexts(ctx) {
    for (const t of (state.game.texts || [])) {
      if (!t || !t.text) continue;
      ctx.save();
      ctx.font = '900 ' + Math.max(10, t.size || 48) + 'px ' + MI.fontCss(t.font);
      ctx.textAlign = t.align === 'left' ? 'left' : (t.align === 'right' ? 'right' : 'center');
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(3, (t.size || 48) * 0.14);
      ctx.strokeStyle = 'rgba(16,19,31,.92)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color || '#fff8e8';
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }

  function drawObjects(ctx) {
    const selObj = selectedObject();
    if (selObj && selObj.placement === 'zone') {
      const z = selObj.zone;
      ctx.save();
      ctx.setLineDash([12, 10]);
      ctx.strokeStyle = 'rgba(79,209,255,.9)';
      ctx.fillStyle = 'rgba(79,209,255,.07)';
      ctx.lineWidth = 4;
      ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.strokeRect(z.x + 2, z.y + 2, z.w, z.h);
      ctx.setLineDash([]);
      drawTag(ctx, 'ZONA ALEATORIA', z.x + 4, z.y + 4, '#9be8ff');
      ctx.restore();
    }

    for (const o of state.game.objects) {
      const selected = o.id === state.selectedObjectId;
      const animIndex = animIndexFor(o);
      const frame = frameFor(o);
      ctx.save();
      if (!o.visible) ctx.globalAlpha = 0.32;
      MI.sprites.draw(ctx, animFrameData(o, animIndex, frame), o.x, o.y, o.w, o.h);
      if (!o.visible) {
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = '#7b86a8';
        ctx.setLineDash([8, 8]);
        ctx.lineWidth = 3;
        ctx.strokeRect(o.x + 2, o.y + 2, o.w - 4, o.h - 4);
      }
      if (selected) {
        ctx.globalAlpha = 1;
        ctx.setLineDash([16, 10]);
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 5;
        ctx.strokeRect(o.x - 6, o.y - 6, o.w + 12, o.h + 12);
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffd23f';
        [[o.x - 6, o.y - 6], [o.x + o.w + 6, o.y - 6], [o.x - 6, o.y + o.h + 6]]
          .forEach(([px, py]) => {
            ctx.fillRect(px - 7, py - 7, 14, 14);
            ctx.strokeStyle = '#1b2340';
            ctx.lineWidth = 2;
            ctx.strokeRect(px - 7, py - 7, 14, 14);
          });
        // Tirador de tamaño (esquina inferior derecha).
        ctx.fillStyle = '#4fd1ff';
        ctx.fillRect(o.x + o.w - HANDLE / 2, o.y + o.h - HANDLE / 2, HANDLE, HANDLE);
        ctx.strokeStyle = '#1b2340';
        ctx.lineWidth = 3;
        ctx.strokeRect(o.x + o.w - HANDLE / 2, o.y + o.h - HANDLE / 2, HANDLE, HANDLE);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(o.x + o.w - HANDLE / 2 + 8, o.y + o.h + HANDLE / 2 - 8);
        ctx.lineTo(o.x + o.w + HANDLE / 2 - 8, o.y + o.h - HANDLE / 2 + 8);
        ctx.stroke();

        const label = o.name + ' · ' + o.w + '×' + o.h;
        ctx.font = LABEL_FONT;
        const tw = ctx.measureText(label).width;
        const ly = o.y > 40 ? o.y - 40 : o.y + o.h + 8;
        drawTag(ctx, label, o.x - 2, ly, '#ffd23f', 'rgba(27,35,64,.92)');
      }
      ctx.restore();
    }
  }

  function drawPick(ctx) {
    const p = state.pickDrag || state.zoneDrag;
    if (!p) return;
    const r = U.rectFromPoints(p.x0, p.y0, p.x1, p.y1);
    ctx.save();
    ctx.fillStyle = 'rgba(79,209,255,.14)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([16, 12]);
    ctx.strokeStyle = '#4fd1ff';
    ctx.lineWidth = 5;
    ctx.strokeRect(r.x + 2, r.y + 2, r.w, r.h);
    ctx.setLineDash([]);
    drawTag(ctx, Math.round(r.w) + '×' + Math.round(r.h), r.x + 4, r.y + 4, '#9be8ff');
    ctx.restore();
  }

  function drawStage() {
    const c = $('#editor-canvas');
    if (!c || !state.game) return;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, MI.W, MI.H);
    MI.sprites.background(ctx, state.game.bg, MI.W, MI.H);
    drawGrid(ctx);
    drawZones(ctx);
    drawTexts(ctx);
    drawObjects(ctx);
    drawPick(ctx);
  }
  E.drawStage = drawStage;

  function drawAnimPreview() {
    const ap = state.animPreview;
    if (!ap || !ap.canvas || !document.body.contains(ap.canvas)) return;
    const obj = objById(ap.objectId);
    if (!obj) return;
    const ctx = ap.canvas.getContext('2d');
    const size = ap.canvas.width;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#202946';
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#4fd1ff';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * size / 4, 0); ctx.lineTo(i * size / 4, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * size / 4); ctx.lineTo(size, i * size / 4); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const frame = frameFor(obj);
    const animIndex = animIndexFor(obj);
    const s = Math.min(size - 12, size - 12);
    MI.sprites.draw(ctx, animFrameData(obj, animIndex, frame), (size - s) / 2, (size - s) / 2, s, s);
  }

  /* ----------------------------- puntero ----------------------------- */
  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    if (!state.game) return;
    const p = stageCoords(e);
    const canvas = e.currentTarget;
    canvas.focus({ preventScroll: true });
    if (state.tool === 'text') {
      const x = snapVal(p.x);
      const y = snapVal(p.y);
      setTool('select');
      openTextEditor(null, { x, y });
      return;
    }
    const capture = () => {
      // En algunos navegadores el puntero sintético ya no está activo.
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
    };

    if (state.pick) {
      if (state.pick.type === 'point') {
        const cb = state.pick.cb;
        clearPick();
        cb(Math.round(p.x), Math.round(p.y));
      } else {
        state.pickDrag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        capture();
      }
      return;
    }

    if (state.tool === 'zone') {
      state.zoneDrag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, tool: true };
      capture();
      return;
    }

    // redimensionar zona seleccionada
    const sz = selectedZone();
    if (sz) {
      const hx = sz.x + sz.w, hy = sz.y + sz.h;
      if (Math.abs(p.x - hx) <= HANDLE && Math.abs(p.y - hy) <= HANDLE) {
        state.drag = { kind: 'zoneResize', zoneId: sz.id, startX: p.x, startY: p.y, ow: sz.w, oh: sz.h };
        capture();
        canvas.classList.add('dragging');
        return;
      }
    }

    // redimensionar el objeto seleccionado desde su esquina inferior derecha
    const so = selectedObject();
    if (so) {
      const hx = so.x + so.w, hy = so.y + so.h;
      if (Math.abs(p.x - hx) <= HANDLE && Math.abs(p.y - hy) <= HANDLE) {
        state.drag = { kind: 'objectResize', objectId: so.id, startX: p.x, startY: p.y, ow: so.w, oh: so.h };
        capture();
        canvas.classList.add('dragging');
        return;
      }
    }

    // objeto
    for (let i = state.game.objects.length - 1; i >= 0; i--) {
      const o = state.game.objects[i];
      if (U.pointInRect(p.x, p.y, { x: o.x, y: o.y, w: o.w, h: o.h })) {
        selectObject(o.id, false);
        state.drag = { kind: 'object', objectId: o.id, offX: p.x - o.x, offY: p.y - o.y, moved: false };
        capture();
        canvas.classList.add('dragging');
        return;
      }
    }

    // zona
    for (let i = state.game.zones.length - 1; i >= 0; i--) {
      const z = state.game.zones[i];
      if (U.pointInRect(p.x, p.y, z)) {
        selectZone(z.id, false);
        state.drag = { kind: 'zone', zoneId: z.id, startX: p.x, startY: p.y, ox: z.x, oy: z.y, moved: false };
        capture();
        canvas.classList.add('dragging');
        return;
      }
    }

    state.selectedObjectId = null;
    state.selectedZoneId = null;
    renderObjectList();
    renderZoneList();
    renderInspector();
    drawStage();
  }

  function onPointerMove(e) {
    if (!state.game) return;
    const p = stageCoords(e);
    const cursor = $('#stage-cursor');
    if (cursor) {
      const frame = $('#editor-stage-frame').getBoundingClientRect();
      cursor.style.left = (e.clientX - frame.left) + 'px';
      cursor.style.top = (e.clientY - frame.top) + 'px';
      cursor.classList.add('visible');
    }

    if (state.pickDrag) {
      state.pickDrag.x1 = p.x; state.pickDrag.y1 = p.y;
      drawStage();
      return;
    }
    if (state.zoneDrag) {
      state.zoneDrag.x1 = p.x; state.zoneDrag.y1 = p.y;
      drawStage();
      return;
    }
    const d = state.drag;
    if (!d) return;
    if (d.kind === 'object') {
      const o = objById(d.objectId);
      if (!o) return;
      o.x = U.clamp(snapVal(p.x - d.offX), BOUNDS.x0, BOUNDS.x1);
      o.y = U.clamp(snapVal(p.y - d.offY), BOUNDS.y0, BOUNDS.y1);
      d.moved = true;
      drawStage();
    } else if (d.kind === 'objectResize') {
      const o = objById(d.objectId);
      if (!o) return;
      o.w = U.clamp(Math.round(d.ow + (p.x - d.startX)), OBJ_MIN, OBJ_MAX);
      o.h = U.clamp(Math.round(d.oh + (p.y - d.startY)), OBJ_MIN, OBJ_MAX);
      d.moved = true;
      drawStage();
    } else if (d.kind === 'zone') {
      const z = zoneById(d.zoneId);
      if (!z) return;
      z.x = U.clamp(snapVal(d.ox + (p.x - d.startX)), BOUNDS.x0, BOUNDS.x1);
      z.y = U.clamp(snapVal(d.oy + (p.y - d.startY)), BOUNDS.y0, BOUNDS.y1);
      d.moved = true;
      drawStage();
    } else if (d.kind === 'zoneResize') {
      const z = zoneById(d.zoneId);
      if (!z) return;
      z.w = Math.max(MIN_ZONE, snapVal(d.ow + (p.x - d.startX)));
      z.h = Math.max(MIN_ZONE, snapVal(d.oh + (p.y - d.startY)));
      d.moved = true;
      drawStage();
    }
  }

  function onPointerUp(e) {
    const canvas = e.currentTarget;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
    canvas.classList.remove('dragging');

    if (state.pickDrag) {
      const drag = state.pickDrag;
      state.pickDrag = null;
      const rect = U.rectFromPoints(
        snapVal(drag.x0), snapVal(drag.y0), snapVal(drag.x1), snapVal(drag.y1)
      );
      const cb = state.pick ? state.pick.cb : null;
      if (rect.w >= 20 && rect.h >= 20) {
        clearPick();
        if (cb) cb(rect);
      } else {
        setHint('La zona es demasiado pequeña. Vuelve a arrastrar.');
      }
      return;
    }

    if (state.zoneDrag) {
      const drag = state.zoneDrag;
      state.zoneDrag = null;
      const rect = U.rectFromPoints(
        snapVal(drag.x0), snapVal(drag.y0), snapVal(drag.x1), snapVal(drag.y1)
      );
      if (rect.w >= 20 && rect.h >= 20) {
        const z = createZone(rect);
        state.selectedObjectId = null;
        state.selectedZoneId = z.id;
        commit();
        setTool('select');
        setTab('object');
        renderAll();
        MI.toast('Zona «' + z.name + '» creada', 'ok');
        MI.audio.sfx('select');
      } else {
        setHint('La zona es demasiado pequeña. Arrastra un poco más.');
      }
      return;
    }

    const d = state.drag;
    state.drag = null;
    if (d && d.moved) {
      commit();
      renderAll();
    } else if (d) {
      renderInspector();
    }
  }

  function onPointerLeave() {
    const cursor = $('#stage-cursor');
    if (cursor) cursor.classList.remove('visible');
  }

  /* ----------------------------- selección ----------------------------- */
  function selectObject(id, doRender) {
    if (id !== state.selectedObjectId) {
      state.animIndex = 0;
      state.animFrame = 0;
    }
    state.selectedObjectId = id;
    state.selectedZoneId = null;
    // Al cambiar de objeto desde Lógica se mantiene Lógica para comparar,
    // copiar y pegar reglas sin salir de la pestaña.
    if (state.tab !== 'object' && state.tab !== 'anim' && state.tab !== 'logic') state.tab = 'object';
    if (doRender !== false) {
      MI.$$('#inspector-tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
      renderObjectList();
      renderZoneList();
      renderInspector();
      drawStage();
    }
  }
  function selectZone(id, doRender) {
    state.selectedZoneId = id;
    state.selectedObjectId = null;
    state.tab = 'object';
    MI.$$('#inspector-tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'object'));
    if (doRender !== false) {
      renderObjectList();
      renderZoneList();
      renderInspector();
      drawStage();
    }
  }
  E.selectObject = selectObject;
  E.selectZone = selectZone;

  /* ----------------------------- listas laterales ----------------------------- */
  function renderObjectList() {
    const list = $('#object-list');
    if (!list) return;
    list.innerHTML = '';
    state.game.objects.forEach(o => {
      const btn = el('button', {
        class: 'object-item' + (o.id === state.selectedObjectId ? ' selected' : ''),
        title: o.name,
        onclick: () => { MI.audio.sfx('select'); selectObject(o.id); }
      });
      const c = el('canvas', { width: 16, height: 16 });
      MI.sprites.thumb(c, animFrameData(o, 0, 0));
      btn.appendChild(c);
      btn.appendChild(el('span', { class: 'obj-name', text: o.name }));
      btn.appendChild(el('span', { class: 'switch-led' }));
      list.appendChild(btn);
    });
    if (!state.game.objects.length) {
      list.appendChild(el('p', { class: 'field-note', style: { padding: '6px' }, text: 'No hay objetos. Pulsa ＋ para añadir uno.' }));
    }
    const del = $('#btn-delete-object');
    if (del) del.disabled = !state.selectedObjectId;
  }

  function renderZoneList() {
    const list = $('#zone-list');
    if (!list) return;
    list.innerHTML = '';
    state.game.zones.forEach(z => {
      const row = el('div', {
        class: 'zone-item' + (z.id === state.selectedZoneId ? ' selected' : ''),
        title: z.name + ' · ' + Math.round(z.x) + ', ' + Math.round(z.y) + ' · ' + Math.round(z.w) + '×' + Math.round(z.h)
      });
      row.appendChild(el('span', { class: 'zone-swatch' }));
      const nameBtn = el('button', {
        class: 'link-btn', style: { flex: '1', textAlign: 'left', fontSize: '10.5px', padding: '1px 2px', textDecoration: 'none' },
        text: z.name, onclick: () => selectZone(z.id)
      });
      row.appendChild(nameBtn);
      row.appendChild(el('button', {
        class: 'mini-btn', title: 'Editar zona', text: '✎',
        onclick: (e) => { e.stopPropagation(); openZoneEditor(z.id); }
      }));
      list.appendChild(row);
    });
    if (!state.game.zones.length) {
      list.appendChild(el('p', { class: 'field-note', style: { padding: '4px 6px', margin: 0 }, text: 'Sin zonas. Pulsa ＋ para dibujar.' }));
    }
  }

  function renderTimeline() {
    const track = $('#timeline-track');
    const label = $('#duration-label');
    if (!track) return;
    const dur = state.game.duration || 12000;
    if (label) label.textContent = state.game.duration ? U.msToSec(state.game.duration) + ' s' : '∞ sin límite';
    track.innerHTML = '';
    for (let i = 0; i <= 4; i++) {
      const tick = el('div', { class: 'timeline-tick', style: { left: (i * 25) + '%' } });
      track.appendChild(tick);
      if (i > 0) track.appendChild(el('span', { class: 'timeline-label', style: { left: (i * 25) + '%' }, text: (dur * i / 4 / 1000).toFixed(dur >= 8000 ? 0 : 1).replace('.', ',') + 's' }));
    }
    let has = false;
    state.game.rules.forEach(rule => {
      const triggers = [rule.trigger].concat((rule.extraTriggers || []).map(e => e.trigger));
      triggers.forEach(t => {
        if (!t || t.type !== 'time') return;
        has = true;
        const from = t.mode === 'interval' ? t.from : t.at;
        const to = t.mode === 'interval' ? t.to : t.at + 60;
        const left = U.clamp(from / dur * 100, 0, 100);
        const width = U.clamp((to - from) / dur * 100, 0.9, 100);
        const bar = el('div', {
          class: 'timeline-rule' + (t.mode === 'interval' ? ' interval' : ''),
          style: { left: left + '%', width: width + '%' },
          title: (t.mode === 'interval' ? 'Intervalo ' : 'Punto ') + U.msToShort(from) + (t.mode === 'interval' ? ' → ' + U.msToShort(to) : '') + ' · clic para editar'
        });
        bar.addEventListener('click', () => {
          setTab('logic');
          if (rule.subject && rule.subject !== 'stage') selectObject(rule.subject);
          renderInspector();
          setTimeout(() => {
            const card = document.querySelector('[data-rule-id="' + rule.id + '"]');
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 60);
        });
        track.appendChild(bar);
      });
    });
    if (!has) {
      track.appendChild(el('span', { class: 'timeline-empty', text: 'Añade reglas con activador de Tiempo para verlas aquí' }));
    }
  }

  function updateDurationUI() {
    MI.$$('.duration-group .seg').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.duration) === Number(state.game.duration));
    });
  }

  function renderAll() {
    if (!state.game) return;
    const nameInput = $('#game-name');
    if (nameInput && document.activeElement !== nameInput) nameInput.value = state.game.name;
    updateDurationUI();
    renderObjectList();
    renderZoneList();
    renderTimeline();
    renderInspector();
    updateUndoButtons();
    drawStage();
    if (state.animPreview) drawAnimPreview();
  }
  E.renderAll = renderAll;

  /* ----------------------------- eventos ----------------------------- */
  function bind() {
    bound = true;

    $('#editor-back').addEventListener('click', exitEditor);
    $('#game-name').addEventListener('input', (e) => {
      state.game.name = e.target.value;
      markDirty();
    });
    $('#game-name').addEventListener('blur', () => {
      if (!state.game.name.trim()) {
        state.game.name = 'Mi microjuego';
        $('#game-name').value = state.game.name;
      }
    });

    MI.$$('.duration-group .seg').forEach(btn => {
      btn.addEventListener('click', () => {
        state.game.duration = Number(btn.dataset.duration);
        updateDurationUI();
        commit();
        renderAll();
        MI.audio.sfx('select');
      });
    });

    $('#btn-save').addEventListener('click', saveGame);
    $('#btn-test').addEventListener('click', testGame);
    const speedSel = $('#test-speed');
    if (speedSel) {
      speedSel.addEventListener('change', () => {
        const v = Number(speedSel.value);
        state.previewSpeed = [0.5, 1, 2, 3].indexOf(v) >= 0 ? v : 1;
        MI.toast('Velocidad de prueba: ' + String(state.previewSpeed).replace('.', ',') + '×');
      });
    }
    const switchesBox = $('#test-switches');
    if (switchesBox) {
      switchesBox.addEventListener('change', () => {
        state.previewSwitches = switchesBox.checked;
        MI.toast(state.previewSwitches ? 'Interruptores visibles en la prueba' : 'Interruptores ocultos en la prueba');
      });
    }
    $('#btn-export').addEventListener('click', exportGame);
    $('#btn-import-editor').addEventListener('click', () => {
      if (!fileInput) {
        fileInput = el('input', { type: 'file', accept: '.microgame,.json,application/json', style: { display: 'none' } });
        document.body.appendChild(fileInput);
        fileInput.addEventListener('change', handleEditorImport);
      }
      fileInput.value = '';
      fileInput.click();
    });
    $('#btn-editor-help').addEventListener('click', showHelp);

    $('#btn-add-object').addEventListener('click', openAddObject);
    $('#btn-add-zone').addEventListener('click', () => {
      setTool('zone');
      MI.toast('Arrastra sobre el escenario para dibujar una zona');
    });
    $('#btn-delete-object').addEventListener('click', deleteSelectedObject);

    MI.$$('.stage-toolbar .tool[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => { setTool(btn.dataset.tool); drawStage(); });
    });
    $('#snap-grid').addEventListener('change', (e) => {
      state.snap = e.target.checked;
      drawStage();
      MI.toast(state.snap ? 'Rejilla activada: todo se ajusta a la cuadrícula' : 'Rejilla desactivada: movimiento libre');
    });
    $('#btn-undo').addEventListener('click', undo);
    $('#btn-redo').addEventListener('click', redo);

    MI.$$('#inspector-tabs .tab').forEach(btn => {
      btn.addEventListener('click', () => setTab(btn.dataset.tab));
    });

    const canvas = $('#editor-canvas');
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('keydown', onKeyDown);
  }

  function onKeyDown(e) {
    if (!state.active) return;
    const screen = $('#screen-editor');
    if (!screen || !screen.classList.contains('active')) return;
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'select' || tag === 'textarea';
    if (e.key === 'Escape') {
      if (state.pick) { cancelPick(); e.preventDefault(); }
      return;
    }
    if (typing) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault(); redo(); return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (state.selectedObjectId) { e.preventDefault(); deleteSelectedObject(); }
      else if (state.selectedZoneId) { e.preventDefault(); deleteSelectedZone(); }
      return;
    }
    if (e.key.startsWith('Arrow')) {
      const o = selectedObject();
      const z = selectedZone();
      if (!o && !z) return;
      e.preventDefault();
      const step = e.shiftKey ? SNAP_STEP : 4;
      if (e.key === 'ArrowLeft') { if (o) o.x -= step; else z.x -= step; }
      if (e.key === 'ArrowRight') { if (o) o.x += step; else z.x += step; }
      if (e.key === 'ArrowUp') { if (o) o.y -= step; else z.y -= step; }
      if (e.key === 'ArrowDown') { if (o) o.y += step; else z.y += step; }
      drawStage();
      clearTimeout(onKeyDown._t);
      onKeyDown._t = setTimeout(() => { commit(); renderAll(); }, 260);
    }
  }

  function exitEditor() {
    if (state.dirty) MI.toast('Borrador guardado. Puedes continuar desde el menú.');
    E.close();
    if (state.onExit) state.onExit();
    else if (MI.app) MI.app.showScreen('menu');
  }
  E.exit = exitEditor;

  /* ============================================================
     INSPECTOR
     ============================================================ */
  function addField(parent, labelText, control, note) {
    const f = el('div', { class: 'field' });
    if (labelText) f.appendChild(el('label', { text: labelText }));
    f.appendChild(control);
    if (note) f.appendChild(el('p', { class: 'field-note', text: note }));
    parent.appendChild(f);
    return f;
  }

  function section(parent, text) {
    const s = el('div', { class: 'section-title', text });
    parent.appendChild(s);
    return s;
  }

  function mkSelect(options, value, onChange, cls, title) {
    const s = el('select', { class: 'select ' + (cls || ''), title: title || '' });
    const has = options.some(o => String(o.value) === String(value));
    if (!has) {
      s.appendChild(el('option', { value: value == null ? '' : String(value) }, '— Elegir —'));
    }
    options.forEach(o => {
      s.appendChild(el('option', { value: String(o.value), disabled: !!o.disabled }, o.label));
    });
    s.value = value == null ? '' : String(value);
    s.addEventListener('change', () => onChange(s.value, s));
    return s;
  }

  function mkNum(value, onChange, opts) {
    opts = opts || {};
    const i = el('input', {
      class: 'input ' + (opts.cls || ''), type: 'number',
      value: String(value), min: opts.min != null ? opts.min : null,
      max: opts.max != null ? opts.max : null, step: opts.step || 1,
      title: opts.title || ''
    });
    i.addEventListener('change', () => {
      let n = Number(i.value);
      if (!Number.isFinite(n)) n = opts.fallback != null ? opts.fallback : 0;
      if (opts.min != null) n = Math.max(opts.min, n);
      if (opts.max != null) n = Math.min(opts.max, n);
      i.value = String(Math.round(n));
      onChange(Math.round(n));
    });
    return i;
  }

  function mkText(value, onChange, placeholder) {
    const i = el('input', { class: 'input', type: 'text', value: value || '', placeholder: placeholder || '' });
    i.addEventListener('change', () => onChange(i.value));
    return i;
  }

  function checkRow(labelText, checked, onChange) {
    const wrap = el('label', { class: 'inline-check' });
    const cb = el('input', { type: 'checkbox', checked: !!checked });
    cb.addEventListener('change', () => onChange(cb.checked));
    wrap.appendChild(cb);
    wrap.appendChild(el('span', { text: labelText }));
    return wrap;
  }

  function smallBtn(labelText, onClick, cls) {
    return el('button', {
      class: 'btn btn-sm ' + (cls || 'btn-paper'),
      type: 'button', text: labelText,
      onclick: onClick
    });
  }

  function renderInspector() {
    const body = $('#inspector-body');
    if (!body || !state.game) return;
    const sc = body.scrollTop;
    body.innerHTML = '';
    state.animPreview = null;
    if (state.tab === 'object') renderObjectTab(body);
    else if (state.tab === 'anim') renderAnimTab(body);
    else if (state.tab === 'logic') renderLogicTab(body);
    else if (state.tab === 'game') renderGameTab(body);
    body.scrollTop = sc;
  }
  E.renderInspector = renderInspector;

  /* ----------------------------- pestaña OBJETO ----------------------------- */
  function renderObjectTab(body) {
    const obj = selectedObject();
    const zone = selectedZone();
    if (obj) return renderObjectInfo(body, obj);
    if (zone) return renderZoneInfo(body, zone);
    const empty = el('div', { class: 'empty-logic' }, [
      el('div', { class: 'big', text: '🧩' }),
      el('h4', { text: 'Selecciona un objeto' }),
      el('p', { text: 'Haz clic en un objeto del escenario o de la lista para editar su aspecto, tamaño, colocación y animación.' }),
      smallBtn('＋ Añadir objeto', openAddObject, 'btn-primary')
    ]);
    body.appendChild(empty);
    if (state.game.zones.length) {
      section(body, 'Zonas del escenario');
      state.game.zones.forEach(z => {
        const b = el('button', { class: 'btn btn-sm btn-paper', style: { width: '100%', justifyContent: 'space-between', marginBottom: '5px' } }, [
          el('span', { text: '⬚ ' + z.name }),
          el('span', { class: 'unit', text: Math.round(z.w) + '×' + Math.round(z.h) })
        ]);
        b.addEventListener('click', () => selectZone(z.id));
        body.appendChild(b);
      });
    }
  }

  function renderObjectInfo(body, obj) {
    const top = el('div', { class: 'obj-preview-row' });
    const prev = el('div', { class: 'obj-preview-big' });
    const pc = el('canvas', { width: 64, height: 64 });
    MI.sprites.thumb(pc, animFrameData(obj, state.animIndex, 0));
    prev.appendChild(pc);
    const meta = el('div', { style: { flex: '1', minWidth: '0' } });
    meta.appendChild(el('div', { class: 'micro-label', text: 'Nombre' }));
    meta.appendChild(mkText(obj.name, (v) => {
      obj.name = v.trim() || 'Objeto';
      commit(); renderAll();
    }));
    meta.appendChild(el('div', { style: { display: 'flex', gap: '5px', marginTop: '6px', flexWrap: 'wrap' } }, [
      el('span', { class: 'tag', text: 'Interruptor OFF' }),
      el('span', { class: 'tag', text: (obj.w) + '×' + (obj.h) })
    ]));
    top.appendChild(prev);
    top.appendChild(meta);
    body.appendChild(top);

    body.appendChild(el('p', {
      class: 'field-note',
      style: { marginBottom: '10px' },
      text: '🔌 Todos los objetos empiezan con el interruptor en OFF. Cámbialo durante el microjuego con activadores y acciones.'
    }));

    section(body, 'Tamaño y posición');
    body.appendChild(el('p', {
      class: 'field-note', style: { marginBottom: '7px' },
      text: 'Tamaño entre ' + OBJ_MIN + '×' + OBJ_MIN + ' y ' + OBJ_MAX + '×' + OBJ_MAX + ' px. También puedes arrastrar el tirador azul de la esquina inferior derecha en el escenario.'
    }));
    const sizeRow = el('div', { class: 'row row-2' });
    const wField = el('div', { class: 'field' }, [
      el('label', { text: 'Ancho (px)' }),
      mkNum(obj.w, (v) => { obj.w = U.clamp(v, OBJ_MIN, OBJ_MAX); commit(); renderAll(); }, { min: OBJ_MIN, max: OBJ_MAX })
    ]);
    const hField = el('div', { class: 'field' }, [
      el('label', { text: 'Alto (px)' }),
      mkNum(obj.h, (v) => { obj.h = U.clamp(v, OBJ_MIN, OBJ_MAX); commit(); renderAll(); }, { min: OBJ_MIN, max: OBJ_MAX })
    ]);
    sizeRow.appendChild(wField); sizeRow.appendChild(hField);
    body.appendChild(sizeRow);

    const presets = el('div', { class: 'btn-row size-presets' });
    [48, 64, 96, 128, 192, 256].forEach(n => {
      presets.appendChild(smallBtn(n + ' px', () => {
        obj.w = n; obj.h = n;
        commit(); renderAll();
        MI.audio.sfx('tick');
      }, obj.w === n && obj.h === n ? 'btn-primary' : 'btn-paper'));
    });
    body.appendChild(presets);

    const posRow = el('div', { class: 'row row-2' });
    posRow.appendChild(el('div', { class: 'field' }, [
      el('label', { text: 'X' }),
      mkNum(obj.x, (v) => { obj.x = U.clamp(v, BOUNDS.x0, BOUNDS.x1); commit(); renderAll(); }, { min: BOUNDS.x0, max: BOUNDS.x1 })
    ]));
    posRow.appendChild(el('div', { class: 'field' }, [
      el('label', { text: 'Y' }),
      mkNum(obj.y, (v) => { obj.y = U.clamp(v, BOUNDS.y0, BOUNDS.y1); commit(); renderAll(); }, { min: BOUNDS.y0, max: BOUNDS.y1 })
    ]));
    body.appendChild(posRow);

    section(body, 'Colocación al empezar');
    const seg = el('div', { class: 'btn-row' });
    seg.appendChild(el('button', {
      class: 'btn btn-sm ' + (obj.placement === 'point' ? 'btn-primary' : 'btn-paper'),
      type: 'button', text: '📍 Punto fijo',
      onclick: () => { obj.placement = 'point'; commit(); renderAll(); }
    }));
    seg.appendChild(el('button', {
      class: 'btn btn-sm ' + (obj.placement === 'zone' ? 'btn-primary' : 'btn-paper'),
      type: 'button', text: '🎲 Zona aleatoria',
      onclick: () => {
        obj.placement = 'zone';
        if (!obj.zone) obj.zone = { x: 320, y: 160, w: 640, h: 400 };
        commit(); renderAll();
      }
    }));
    body.appendChild(seg);

    if (obj.placement === 'point') {
      body.appendChild(el('div', { style: { marginTop: '7px' } }, [
        smallBtn('🎯 Elegir punto en el escenario', () => {
          startPick('point', (x, y) => {
            obj.x = Math.round(x - obj.w / 2);
            obj.y = Math.round(y - obj.h / 2);
            commit(); renderAll();
            MI.toast('Posición actualizada', 'ok');
          });
        })
      ]));
      body.appendChild(el('p', { class: 'field-note', text: 'El objeto aparecerá exactamente en este punto.' }));
    } else {
      const zr = el('div', { class: 'row row-2' });
      zr.appendChild(el('div', { class: 'field' }, [
        el('label', { text: 'Zona X' }),
        mkNum(obj.zone.x, (v) => { obj.zone.x = v; commit(); renderAll(); }, { min: BOUNDS.x0, max: BOUNDS.x1 })
      ]));
      zr.appendChild(el('div', { class: 'field' }, [
        el('label', { text: 'Zona Y' }),
        mkNum(obj.zone.y, (v) => { obj.zone.y = v; commit(); renderAll(); }, { min: BOUNDS.y0, max: BOUNDS.y1 })
      ]));
      body.appendChild(zr);
      const zr2 = el('div', { class: 'row row-2' });
      zr2.appendChild(el('div', { class: 'field' }, [
        el('label', { text: 'Zona ancho' }),
        mkNum(obj.zone.w, (v) => { obj.zone.w = Math.max(MIN_ZONE, v); commit(); renderAll(); }, { min: MIN_ZONE, max: MI.W * 3 })
      ]));
      zr2.appendChild(el('div', { class: 'field' }, [
        el('label', { text: 'Zona alto' }),
        mkNum(obj.zone.h, (v) => { obj.zone.h = Math.max(MIN_ZONE, v); commit(); renderAll(); }, { min: MIN_ZONE, max: MI.H * 3 })
      ]));
      body.appendChild(zr2);
      body.appendChild(smallBtn('⬚ Trazar zona aleatoria', () => {
        startPick('rect', (rect) => {
          obj.zone = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
          obj.placement = 'zone';
          commit(); renderAll();
          MI.toast('Zona aleatoria actualizada', 'ok');
        });
      }));
      body.appendChild(el('p', { class: 'field-note', text: 'El objeto aparecerá en un punto aleatorio dentro de esta zona. También puedes salir del escenario.' }));
    }

    section(body, 'Comportamiento');
    body.appendChild(checkRow('Visible al empezar', obj.visible, (v) => {
      obj.visible = v; commit(); renderAll();
    }));

    section(body, 'Animaciones');
    const animList = el('div', { class: 'anim-list' });
    MI.objectAnimations(obj).forEach((a, i) => {
      const b = el('button', {
        class: 'anim-chip' + (i === state.animIndex ? ' active' : ''),
        type: 'button',
        text: (i + 1) + '. ' + a.name + ' · ' + MI.animSpeed(a.speed).label
      });
      b.addEventListener('click', () => {
        state.animIndex = i;
        state.animFrame = 0;
        setTab('anim');
      });
      animList.appendChild(b);
    });
    body.appendChild(animList);
    body.appendChild(el('p', { class: 'field-note', text: 'Cada animación tiene nombre propio (máx. 12 caracteres), 4 celdas y velocidad de 1 a 5. Pulsa una para editarla.' }));
    const animRow = el('div', { class: 'btn-row', style: { marginTop: '6px' } });
    animRow.appendChild(smallBtn('🎞️ Editar animaciones', () => setTab('anim'), 'btn-cyan'));
    animRow.appendChild(smallBtn('💾 Guardar en Mis objetos', () => openSaveObjectModal(obj), 'btn-paper'));
    body.appendChild(animRow);

    section(body, 'Capa');
    const layerRow = el('div', { class: 'btn-row' });
    layerRow.appendChild(smallBtn('⬇ Enviar al fondo', () => {
      const i = state.game.objects.indexOf(obj);
      if (i > 0) { state.game.objects.splice(i, 1); state.game.objects.unshift(obj); commit(); renderAll(); }
    }));
    layerRow.appendChild(smallBtn('⬆ Traer al frente', () => {
      const i = state.game.objects.indexOf(obj);
      if (i >= 0 && i < state.game.objects.length - 1) {
        state.game.objects.splice(i, 1); state.game.objects.push(obj); commit(); renderAll();
      }
    }));
    body.appendChild(layerRow);

    const actionsRow = el('div', { class: 'btn-row', style: { marginTop: '10px' } });
    actionsRow.appendChild(smallBtn('🎞️ Editar animación', () => setTab('anim'), 'btn-cyan'));
    actionsRow.appendChild(smallBtn('🧠 Añadir regla', () => {
      addRule(obj.id);
      setTab('logic');
    }, 'btn-primary'));
    body.appendChild(actionsRow);

    const dupDel = el('div', { class: 'danger-zone' });
    dupDel.appendChild(smallBtn('⧉ Duplicar', () => duplicateObject(obj.id)));
    dupDel.appendChild(smallBtn('🗑 Eliminar', () => deleteSelectedObject(), 'btn-danger'));
    body.appendChild(dupDel);
  }

  function renderZoneInfo(body, zone) {
    body.appendChild(el('h3', { style: { fontFamily: 'var(--font-display)', fontSize: '15px', marginBottom: '4px' }, text: '⬚ ' + zone.name }));
    body.appendChild(el('p', { class: 'field-note', text: 'Zona del escenario. Puede usarse en contactos, saltos y movimientos de deambulación.' }));

    section(body, 'Propiedades');
    addField(body, 'Nombre', mkText(zone.name, (v) => {
      zone.name = v.trim() || 'Zona'; commit(); renderAll();
    }));
    const r1 = el('div', { class: 'row row-2' });
    r1.appendChild(el('div', { class: 'field' }, [
      el('label', { text: 'X' }), mkNum(zone.x, (v) => { zone.x = v; commit(); renderAll(); }, { min: BOUNDS.x0, max: BOUNDS.x1 })
    ]));
    r1.appendChild(el('div', { class: 'field' }, [
      el('label', { text: 'Y' }), mkNum(zone.y, (v) => { zone.y = v; commit(); renderAll(); }, { min: BOUNDS.y0, max: BOUNDS.y1 })
    ]));
    body.appendChild(r1);
    const r2 = el('div', { class: 'row row-2' });
    r2.appendChild(el('div', { class: 'field' }, [
      el('label', { text: 'Ancho' }), mkNum(zone.w, (v) => { zone.w = Math.max(MIN_ZONE, v); commit(); renderAll(); }, { min: MIN_ZONE, max: MI.W * 3 })
    ]));
    r2.appendChild(el('div', { class: 'field' }, [
      el('label', { text: 'Alto' }), mkNum(zone.h, (v) => { zone.h = Math.max(MIN_ZONE, v); commit(); renderAll(); }, { min: MIN_ZONE, max: MI.H * 3 })
    ]));
    body.appendChild(r2);
    body.appendChild(el('p', { class: 'field-note', text: 'Consejo: puedes dibujar zonas fuera del escenario. Arrastra más allá del borde o cambia los valores X/Y.' }));

    const uses = state.game.rules.filter(r =>
      (r.trigger.type === 'touch' || r.trigger.type === 'overlap') && r.trigger.zoneId === zone.id ||
      r.actions.some(a => a.zoneId === zone.id) ||
      (state.game.goal.zoneId === zone.id)
    ).length;
    body.appendChild(el('p', { class: 'field-note', text: 'Usada en ' + uses + ' regla(s) y objetivo.' }));

    const del = el('div', { class: 'danger-zone' });
    del.appendChild(smallBtn('🗑 Eliminar zona', () => deleteZone(zone.id), 'btn-danger'));
    body.appendChild(del);
  }

  /* ----------------------------- pestaña ANIMACIÓN ----------------------------- */
  function renderAnimTab(body) {
    const obj = selectedObject();
    if (!obj) {
      body.appendChild(el('div', { class: 'empty-logic' }, [
        el('div', { class: 'big', text: '🎞️' }),
        el('h4', { text: 'Sin objeto seleccionado' }),
        el('p', { text: 'Selecciona un objeto para editar sus animaciones: nombre, 4 celdas y velocidad.' })
      ]));
      return;
    }

    const animations = MI.objectAnimations(obj);
    if (!(state.animIndex >= 0 && state.animIndex < animations.length)) state.animIndex = 0;
    if (!(state.animFrame >= 0 && state.animFrame < 4)) state.animFrame = 0;
    const anim = animations[state.animIndex];
    const frames = anim.frames;
    const speed = MI.animSpeed(anim.speed);

    const box = el('div', { class: 'obj-preview-row' });
    const prev = el('div', { class: 'obj-preview-big', style: { width: '96px', height: '96px' } });
    const pc = el('canvas', { width: 128, height: 128, style: { width: '88px', height: '88px' } });
    prev.appendChild(pc);
    box.appendChild(prev);
    const info = el('div', { style: { flex: '1' } });
    info.appendChild(el('div', { class: 'micro-label', text: obj.name }));
    info.appendChild(el('div', { class: 'anim-title', text: (state.animIndex + 1) + '. ' + anim.name }));
    info.appendChild(el('p', { class: 'field-note', text: 'Velocidad ' + speed.value + ' · ' + speed.fps + ' fps · 4 celdas en bucle' }));
    box.appendChild(info);
    body.appendChild(box);
    state.animPreview = { canvas: pc, objectId: obj.id };

    section(body, 'Animaciones del objeto');
    const list = el('div', { class: 'anim-list' });
    animations.forEach((a, i) => {
      const b = el('button', {
        class: 'anim-chip' + (i === state.animIndex ? ' active' : ''),
        type: 'button',
        text: (i + 1) + '. ' + a.name
      });
      b.addEventListener('click', () => {
        state.animIndex = i;
        state.animFrame = 0;
        renderInspector();
        drawStage();
      });
      list.appendChild(b);
    });
    body.appendChild(list);
    body.appendChild(el('p', { class: 'field-note', text: 'Cada objeto tiene 4 animaciones. Puedes cambiar de animación también desde las acciones y los activadores.' }));

    const nameInput = el('input', {
      class: 'input', type: 'text', value: anim.name, maxlength: String(MI.MAX_ANIM_NAME),
      title: 'Nombre de la animación (máximo ' + MI.MAX_ANIM_NAME + ' caracteres)'
    });
    nameInput.addEventListener('change', () => {
      const clean = nameInput.value.replace(/\s+/g, ' ').trim().slice(0, MI.MAX_ANIM_NAME);
      anim.name = clean || ('Animación ' + (state.animIndex + 1));
      nameInput.value = anim.name;
      commit(); renderAll();
    });
    addField(body, 'Nombre de la animación', nameInput, 'Máximo ' + MI.MAX_ANIM_NAME + ' caracteres.');

    addField(body, 'Velocidad de la animación', mkSelect(
      MI.ANIM_SPEEDS.map(s => ({ value: s.value, label: s.label })),
      anim.speed,
      (v) => { anim.speed = U.clamp(Math.round(Number(v)), 1, 5); commit(); renderAll(); },
      '',
      '1 = más lento · 5 = más rápido'
    ), '1 es la más lenta y 5 la más rápida.');

    section(body, 'Celdas de «' + anim.name + '»');
    const grid = el('div', { class: 'frame-grid' });
    for (let i = 0; i < 4; i++) {
      const cell = el('button', { class: 'frame-cell' + (i === state.animFrame ? ' active' : ''), title: 'Editar celda ' + (i + 1), type: 'button' });
      const c = el('canvas', { width: 16, height: 16 });
      MI.sprites.thumb(c, frames[i]);
      cell.appendChild(c);
      cell.appendChild(el('span', { class: 'frame-num', text: String(i + 1) }));
      cell.appendChild(el('span', { class: 'frame-edit', text: '✎' }));
      cell.addEventListener('click', () => {
        state.animFrame = i;
        openPixelEditor(obj.id, state.animIndex, i);
      });
      grid.appendChild(cell);
    }
    body.appendChild(grid);

    const ops = el('div', { class: 'btn-row' });
    ops.appendChild(smallBtn('⧉ Copiar celda', () => {
      state.frameClipboard = frames[state.animFrame];
      MI.toast('Celda copiada', 'ok');
    }));
    ops.appendChild(smallBtn('📋 Pegar', () => {
      if (!state.frameClipboard) { MI.toast('No hay ninguna celda copiada', 'err'); return; }
      frames[state.animFrame] = state.frameClipboard;
      commit(); renderAll();
    }));
    body.appendChild(ops);
    const ops2 = el('div', { class: 'btn-row', style: { marginTop: '5px' } });
    ops2.appendChild(smallBtn('↔ Copiar a las 4', () => {
      for (let i = 0; i < 4; i++) frames[i] = frames[state.animFrame];
      commit(); renderAll();
      MI.toast('Celda copiada a las 4 posiciones', 'ok');
    }));
    ops2.appendChild(smallBtn('⌫ Limpiar', () => {
      frames[state.animFrame] = MI.sprites.empty();
      commit(); renderAll();
    }));
    body.appendChild(ops2);

    body.appendChild(el('p', { class: 'field-note', text: 'Haz clic en cualquier celda para editarla píxel a píxel.' }));

    section(body, 'Librería de sprites');
    const lib = el('div', { class: 'sprite-lib' });
    MI.sprites.keys().forEach(key => {
      const b = el('button', { type: 'button', title: MI.sprites.DISPLAY_NAMES[key] || key });
      const c = el('canvas', { width: 16, height: 16 });
      MI.sprites.thumb(c, MI.sprites.preset(key));
      b.appendChild(c);
      b.addEventListener('click', () => {
        frames[state.animFrame] = MI.sprites.preset(key);
        commit(); renderAll();
        MI.toast('Sprite aplicado a la celda ' + (state.animFrame + 1) + ' de «' + anim.name + '»', 'ok');
      });
      lib.appendChild(b);
    });
    body.appendChild(lib);

    body.appendChild(el('div', { style: { marginTop: '10px' } }, [
      smallBtn('🎨 Abrir editor de píxeles', () => openPixelEditor(obj.id, state.animIndex, state.animFrame), 'btn-cyan')
    ]));

    section(body, 'Mis objetos');
    body.appendChild(el('div', { class: 'btn-row' }, [
      smallBtn('💾 Guardar este objeto', () => openSaveObjectModal(obj), 'btn-paper')
    ]));
    body.appendChild(el('p', { class: 'field-note', text: 'Guardar el objeto (con sus 4 animaciones) en el navegador para reutilizarlo en otros microjuegos.' }));
  }

  function openPixelEditor(objId, animIndex, frame) {
    const obj = objById(objId);
    if (!obj) return;
    MI.pixelEditor.open(obj, animIndex, frame, (changed) => {
      if (changed) { commit(); renderAll(); }
    });
  }

  /* ----------------------------- pestaña JUEGO ----------------------------- */
  function renderGoalConditions(body) {
    ensureSwitchGoal(state.game.goal);
    const goal = state.game.goal;
    const groups = goal.groups;

    body.appendChild(el('p', { class: 'field-note', style: { marginBottom: '8px' }, text: 'Ganas cuando se cumple una de estas condiciones (O). Dentro de cada condición, todos los interruptores deben estar ON (Y). Puedes crear hasta ' + MI.MAX_GOAL_GROUPS + '.' }));

    if (!state.game.objects.length) {
      body.appendChild(el('p', { class: 'rule-warn', text: '⚠ Crea al menos un objeto para usarlo como interruptor.' }));
    }

    const list = el('div', { class: 'goal-conditions' });
    groups.forEach((group, gi) => {
      if (gi > 0) list.appendChild(el('div', { class: 'goal-or', text: 'O' }));
      const card = el('div', { class: 'goal-condition' });
      const head = el('div', { class: 'goal-condition-head' }, [
        el('span', { class: 'goal-condition-title', text: 'Condición ' + (gi + 1) }),
        el('span', { class: 'goal-condition-hint', text: group.length ? (group.length === 1 ? '1 interruptor ON' : group.length + ' interruptores ON') : 'Vacía' })
      ]);
      if (groups.length > 1) {
        head.appendChild(el('button', {
          class: 'goal-condition-del', type: 'button', text: '✕', title: 'Quitar condición',
          onclick: () => { groups.splice(gi, 1); commit(); renderAll(); }
        }));
      }
      card.appendChild(head);

      if (!group.length) {
        card.appendChild(el('p', { class: 'field-note', text: 'Elige al menos un objeto. Las condiciones vacías no cuentan.' }));
      } else {
        const chips = el('div', { class: 'goal-chips' });
        group.forEach((id, oi) => {
          if (oi > 0) chips.appendChild(el('span', { class: 'goal-and', text: 'Y' }));
          const o = objById(id);
          const chip = el('span', { class: 'goal-chip' }, [
            el('span', { text: (o ? o.name : 'Objeto eliminado') + ' · ON' }),
            el('button', {
              class: 'goal-chip-del', type: 'button', text: '✕', title: 'Quitar objeto de la condición',
              onclick: () => { group.splice(oi, 1); commit(); renderAll(); }
            })
          ]);
          chips.appendChild(chip);
        });
        card.appendChild(chips);
      }

      const avail = state.game.objects.filter(o => group.indexOf(o.id) < 0);
      if (avail.length) {
        card.appendChild(mkSelect(
          [{ value: '', label: '＋ Añadir objeto a la condición…', disabled: true }]
            .concat(avail.map(o => ({ value: o.id, label: o.name }))),
          '',
          (v) => { if (!v) return; group.push(v); commit(); renderAll(); },
          'goal-add-object'
        ));
      }
      list.appendChild(card);
    });
    body.appendChild(list);

    if (groups.length < MI.MAX_GOAL_GROUPS) {
      body.appendChild(el('button', {
        class: 'add-goal-condition', type: 'button', text: '＋ Añadir condición (O)',
        onclick: () => { groups.push([]); commit(); renderAll(); }
      }));
    }

    const active = groups.filter(gr => gr.length);
    body.appendChild(el('p', { class: 'field-note', style: { marginTop: '8px' }, text: active.length
      ? (active.length === 1 ? 'Hay 1 condición activa. ' : 'Hay ' + active.length + ' condiciones activas. ') + 'Si no se cumple ninguna al acabar el tiempo, pierdes.'
      : 'Sin condiciones configuradas, el microjuego se gana sobreviviendo hasta el final del tiempo.' }));
    body.appendChild(el('p', { class: 'field-note', text: 'Los objetos empiezan con el interruptor en OFF. Crea reglas en la pestaña Lógica que lo enciendan.' }));
  }

  function renderGameTab(body) {
    body.appendChild(el('p', { class: 'field-note', text: 'Ajustes generales del microjuego. La duración también se cambia en la barra superior.' }));

    section(body, 'Información');
    addField(body, 'Nombre', mkText(state.game.name, (v) => {
      state.game.name = v.trim() || 'Mi microjuego';
      const ni = $('#game-name'); if (ni) ni.value = state.game.name;
      commit(); renderAll();
    }));
    const hint = el('textarea', { class: 'textarea', maxlength: '20', placeholder: 'Máximo 20 caracteres' });
    hint.value = state.game.hint || '';
    const hintCount = el('span', { class: 'unit', id: 'hint-counter', text: hint.value.length + '/20' });
    hint.addEventListener('input', () => {
      if (hint.value.length > 20) hint.value = hint.value.slice(0, 20);
      hintCount.textContent = hint.value.length + '/20';
      state.game.hint = hint.value;
      markDirty();
    });
    hint.addEventListener('change', () => {
      state.game.hint = hint.value.slice(0, 20);
      hintCount.textContent = state.game.hint.length + '/20';
      commit();
    });
    const hintField = addField(body, 'Pista para el jugador', hint);
    hintField.appendChild(el('p', { class: 'field-note' }, [
      el('span', { text: 'Máximo 20 caracteres, incluidos espacios. Se muestra en grande sobre negro durante 1,5 s antes de empezar. ' }),
      hintCount
    ]));

    section(body, 'Música y sonido');
    const tracks = Object.keys(MI.audio.TRACKS).map(k => ({ value: k, label: MI.audio.TRACKS[k].name + ' — ' + MI.audio.TRACKS[k].mood }));
    addField(body, 'Música de fondo', mkSelect(tracks, state.game.music, (v) => {
      state.game.music = v; commit(); renderAll();
    }));
    const musicRow = el('div', { class: 'btn-row' });
    musicRow.appendChild(smallBtn('▶ Escuchar', () => {
      MI.audio.unlock();
      MI.audio.playMusic(state.game.music, { speed: 1 });
      MI.toast('Reproduciendo música');
    }, 'btn-cyan'));
    musicRow.appendChild(smallBtn('■ Parar', () => { MI.audio.stopMusic(); }, 'btn-paper'));
    body.appendChild(musicRow);
    body.appendChild(el('p', { class: 'field-note', text: 'Los sonidos de cada acción se eligen en la pestaña Lógica.' }));

    section(body, 'Fondo del escenario');
    const bgPrev = el('canvas', { width: 320, height: 180, class: 'bg-preview-mini' });
    MI.sprites.background(bgPrev.getContext('2d'), state.game.bg, 320, 180);
    addField(body, 'Vista previa', bgPrev);
    body.appendChild(el('div', { class: 'btn-row' }, [
      smallBtn('🖼️ Editor de fondos', openBackgroundEditor, 'btn-cyan')
    ]));
    addField(body, 'Color base', el('input', {
      type: 'color', class: 'input', value: state.game.bg.color,
      oninput: (e) => { state.game.bg.color = e.target.value; drawStage(); },
      onchange: () => { commit(); renderAll(); }
    }));
    addField(body, 'Patrón', mkSelect(MI.patterns.map(p => ({ value: p, label: MI.PATTERN_LABELS[p] || p })), state.game.bg.pattern, (v) => {
      state.game.bg.pattern = v; commit(); renderAll();
    }));
    addField(body, 'Color de acento', el('input', {
      type: 'color', class: 'input', value: state.game.bg.accent,
      oninput: (e) => { state.game.bg.accent = e.target.value; drawStage(); },
      onchange: () => { commit(); renderAll(); }
    }));

    section(body, 'Textos del escenario');
    body.appendChild(el('p', { class: 'field-note', style: { marginBottom: '7px' }, text: 'Los textos fijos se dibujan siempre, debajo de los objetos. También puedes crearlos desde la herramienta «T Texto» o con la acción «Añadir texto».' }));
    const textList = el('div', { class: 'text-list' });
    (state.game.texts || []).forEach(t => {
      const row = el('div', { class: 'text-list-item' });
      const swatch = el('span', { class: 'text-swatch', style: { background: t.color } });
      row.appendChild(swatch);
      row.appendChild(el('span', { class: 'text-list-name', text: t.text }));
      row.appendChild(el('span', { class: 'text-list-meta', text: t.size + ' px · ' + (MI.TEXT_ALIGNS.find(a => a.value === t.align) || {}).label }));
      row.appendChild(el('button', {
        class: 'mini-btn', type: 'button', title: 'Editar texto', text: '✎',
        onclick: () => openTextEditor(t.id)
      }));
      row.appendChild(el('button', {
        class: 'mini-btn', type: 'button', title: 'Eliminar texto', text: '🗑',
        onclick: () => {
          const i = state.game.texts.indexOf(t);
          if (i >= 0) state.game.texts.splice(i, 1);
          commit(); renderAll();
          MI.toast('Texto eliminado');
        }
      }));
      textList.appendChild(row);
    });
    if (!state.game.texts.length) {
      textList.appendChild(el('p', { class: 'field-note', text: 'Todavía no hay textos fijos.' }));
    }
    body.appendChild(textList);
    const textOps = el('div', { class: 'btn-row', style: { marginTop: '6px' } });
    textOps.appendChild(smallBtn('T Añadir texto', () => {
      if ((state.game.texts || []).length >= MI.MAX_TEXTS) {
        MI.toast('Máximo ' + MI.MAX_TEXTS + ' textos por escenario', 'err');
        return;
      }
      openTextEditor(null, { x: MI.W / 2, y: MI.H / 2 });
    }, 'btn-cyan'));
    textOps.appendChild(smallBtn('Colocar en el escenario', () => {
      setTab('object');
      setTool('text');
      MI.toast('Haz clic en el escenario para colocar el texto');
    }));
    body.appendChild(textOps);

    section(body, 'Objetivo de victoria');
    renderGoalConditions(body);

    section(body, 'Resumen');
    const stats = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' } });
    [
      ['📦 Objetos', state.game.objects.length],
      ['🧠 Reglas', state.game.rules.length],
      ['🔤 Textos', (state.game.texts || []).length],
      ['⏱️ Duración', state.game.duration ? U.msToSec(state.game.duration) + ' s' : '∞'],
      ['🎵 Música', (MI.audio.TRACKS[state.game.music] || {}).name || '—']
    ].forEach(([k, v]) => {
      const box = el('div', { style: { background: '#f4ead4', border: '2px solid rgba(27,35,64,.15)', borderRadius: '7px', padding: '6px 8px' } }, [
        el('div', { style: { fontSize: '9px', color: '#7b86a8', fontWeight: '800', textTransform: 'uppercase' }, text: k }),
        el('div', { style: { fontWeight: '900', fontSize: '12px' }, text: String(v) })
      ]);
      stats.appendChild(box);
    });
    body.appendChild(stats);

    const io = el('div', { class: 'btn-row', style: { marginTop: '12px' } });
    io.appendChild(smallBtn('📤 Exportar', exportGame));
    io.appendChild(smallBtn('📥 Importar', () => $('#btn-import-editor').click()));
    body.appendChild(io);
  }

  /* ----------------------------- textos del escenario ----------------------------- */
  function openTextEditor(textId, at) {
    const existing = textId ? textById(textId) : null;
    const draft = existing
      ? Object.assign({}, existing)
      : {
        id: U.uid('text'),
        text: 'Texto',
        x: Math.round(at && at.x != null ? at.x : MI.W / 2),
        y: Math.round(at && at.y != null ? at.y : MI.H / 2),
        size: 56,
        font: 'display',
        align: 'center',
        color: '#ffd23f'
      };

    const body = el('div');
    const preview = el('canvas', { width: 512, height: 288, class: 'text-preview' });
    const pctx = preview.getContext('2d');

    function paint() {
      const W = preview.width, H = preview.height;
      const k = W / MI.W;
      pctx.clearRect(0, 0, W, H);
      pctx.fillStyle = '#141c38';
      pctx.fillRect(0, 0, W, H);
      pctx.strokeStyle = 'rgba(255,255,255,.08)';
      pctx.lineWidth = 1;
      for (let x = 0; x <= W; x += W / 20) {
        pctx.beginPath(); pctx.moveTo(x + .5, 0); pctx.lineTo(x + .5, H); pctx.stroke();
      }
      for (let y = 0; y <= H; y += H / 12) {
        pctx.beginPath(); pctx.moveTo(0, y + .5); pctx.lineTo(W, y + .5); pctx.stroke();
      }
      pctx.save();
      pctx.font = '900 ' + Math.max(8, draft.size * k) + 'px ' + MI.fontCss(draft.font);
      pctx.textAlign = draft.align === 'left' ? 'left' : (draft.align === 'right' ? 'right' : 'center');
      pctx.textBaseline = 'middle';
      pctx.lineJoin = 'round';
      pctx.lineWidth = Math.max(2, draft.size * k * 0.14);
      pctx.strokeStyle = 'rgba(16,19,31,.92)';
      pctx.strokeText(draft.text || 'Texto', draft.x * k, draft.y * k);
      pctx.fillStyle = draft.color;
      pctx.fillText(draft.text || 'Texto', draft.x * k, draft.y * k);
      pctx.restore();
      pctx.fillStyle = 'rgba(255,248,232,.55)';
      pctx.font = 'bold 11px Consolas, monospace';
      pctx.textAlign = 'right';
      pctx.textBaseline = 'bottom';
      pctx.fillText('Vista previa del escenario', W - 10, H - 8);
    }

    const content = el('textarea', { class: 'textarea', maxlength: '80', rows: '2', placeholder: 'Escribe el texto' });
    content.value = draft.text;
    content.addEventListener('input', () => { draft.text = content.value; paint(); });
    addField(body, 'Texto (máximo 80 caracteres)', content);
    body.appendChild(preview);

    const row1 = el('div', { class: 'row row-2' });
    row1.appendChild(el('div', { class: 'field' }, [
      el('label', { text: 'Fuente' }),
      mkSelect(MI.FONTS.map(f => ({ value: f.value, label: f.label })), draft.font, (v) => {
        draft.font = v; paint();
      })
    ]));
    row1.appendChild(el('div', { class: 'field' }, [
      el('label', { text: 'Tamaño (px)' }),
      mkNum(draft.size, (v) => {
        draft.size = U.clamp(v, 10, 160);
        paint();
      }, { min: 10, max: 160, fallback: 56 })
    ]));
    body.appendChild(row1);

    const row2 = el('div', { class: 'row row-2' });
    row2.appendChild(el('div', { class: 'field' }, [
      el('label', { text: 'Alineación' }),
      mkSelect(MI.TEXT_ALIGNS, draft.align, (v) => {
        draft.align = v; paint();
      })
    ]));
    row2.appendChild(el('div', { class: 'field' }, [
      el('label', { text: 'Color' }),
      el('input', {
        type: 'color', class: 'input', value: draft.color,
        oninput: (e) => { draft.color = e.target.value; paint(); }
      })
    ]));
    body.appendChild(row2);

    const row3 = el('div', { class: 'row row-2' });
    row3.appendChild(el('div', { class: 'field' }, [
      el('label', { text: 'Posición X' }),
      mkNum(draft.x, (v) => { draft.x = U.clamp(v, BOUNDS.x0, BOUNDS.x1); paint(); }, { min: BOUNDS.x0, max: BOUNDS.x1 })
    ]));
    row3.appendChild(el('div', { class: 'field' }, [
      el('label', { text: 'Posición Y' }),
      mkNum(draft.y, (v) => { draft.y = U.clamp(v, BOUNDS.y0, BOUNDS.y1); paint(); }, { min: BOUNDS.y0, max: BOUNDS.y1 })
    ]));
    body.appendChild(row3);
    body.appendChild(el('p', { class: 'field-note', text: 'La alineación marca el punto de anclaje: izquierda, centro o derecha en la posición X.' }));

    const footer = [];
    if (existing) {
      footer.push({
        label: 'Eliminar', className: 'btn-danger', close: false,
        onClick: () => {
          const i = state.game.texts.indexOf(existing);
          if (i >= 0) state.game.texts.splice(i, 1);
          MI.modal.close();
          commit(); renderAll();
          MI.toast('Texto eliminado');
        }
      });
    }
    footer.push({ label: 'Cancelar', className: 'btn-paper' });
    footer.push({
      label: existing ? 'Guardar texto' : 'Añadir texto', className: 'btn-primary',
      onClick: () => {
        const clean = String(draft.text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        if (!clean) { MI.toast('Escribe algo de texto', 'err'); return false; }
        draft.text = clean;
        if (existing) Object.assign(existing, draft);
        else state.game.texts.push(draft);
        commit(); renderAll();
        MI.toast(existing ? 'Texto actualizado' : 'Texto añadido al escenario', 'ok');
      }
    });

    MI.modal.open({ title: existing ? 'Editar texto' : 'Añadir texto', wide: true, body, footer });
    paint();
  }
  E.openTextEditor = openTextEditor;

  /* ----------------------------- editor de fondos ----------------------------- */
  function openBackgroundEditor() {
    const bg = state.game.bg;
    const preview = el('canvas', { width: 512, height: 288, class: 'bg-preview-big' });
    const pctx = preview.getContext('2d');

    const thumbs = [];
    function paint() {
      MI.sprites.background(pctx, bg, 512, 288);
      thumbs.forEach(t => {
        MI.sprites.background(t.ctx, { color: bg.color, pattern: t.pattern, accent: bg.accent }, 160, 90);
      });
    }

    const body = el('div', { class: 'bg-editor' });
    const stageBox = el('div', { class: 'bg-preview-wrap' }, preview);
    body.appendChild(stageBox);

    const grid = el('div', { class: 'bg-pattern-grid' });
    MI.patterns.forEach(p => {
      const b = el('button', { class: 'bg-pattern' + (bg.pattern === p ? ' active' : ''), type: 'button', title: MI.PATTERN_LABELS[p] || p });
      const c = el('canvas', { width: 160, height: 90 });
      b.appendChild(c);
      b.appendChild(el('span', { class: 'bg-pattern-name', text: MI.PATTERN_LABELS[p] || p }));
      thumbs.push({ ctx: c.getContext('2d'), pattern: p });
      b.addEventListener('click', () => {
        bg.pattern = p;
        MI.$$('.bg-pattern', grid).forEach(x => x.classList.toggle('active', x === b));
        paint();
        drawStage();
        commit();
        MI.audio.sfx('tick');
      });
      grid.appendChild(b);
    });
    body.appendChild(el('div', { class: 'micro-label', text: 'Texturas predefinidas' }));
    body.appendChild(grid);

    const colors = el('div', { class: 'row row-2' });
    colors.appendChild(el('div', { class: 'field' }, [
      el('label', { text: 'Color base' }),
      el('input', {
        type: 'color', class: 'input', value: bg.color,
        oninput: (e) => { bg.color = e.target.value; paint(); drawStage(); },
        onchange: () => { commit(); renderAll(); }
      })
    ]));
    colors.appendChild(el('div', { class: 'field' }, [
      el('label', { text: 'Color de acento' }),
      el('input', {
        type: 'color', class: 'input', value: bg.accent,
        oninput: (e) => { bg.accent = e.target.value; paint(); drawStage(); },
        onchange: () => { commit(); renderAll(); }
      })
    ]));
    body.appendChild(colors);

    // Paletas rápidas para no tener que elegir colores a mano.
    const palettes = [
      ['#101a36', '#4fd1ff'], ['#1b2340', '#ffd23f'], ['#2a1240', '#ff86c8'],
      ['#06231f', '#8bd450'], ['#3a1208', '#ff8a3d'], ['#0b1020', '#ffffff']
    ];
    const paletteRow = el('div', { class: 'bg-palettes' });
    palettes.forEach(([base, accent]) => {
      const b = el('button', { class: 'bg-palette', type: 'button', title: 'Usar esta paleta', style: { background: 'linear-gradient(135deg, ' + base + ' 55%, ' + accent + ' 55%)' } });
      b.addEventListener('click', () => {
        bg.color = base;
        bg.accent = accent;
        paint();
        drawStage();
        commit();
        MI.toast('Paleta aplicada', 'ok');
      });
      paletteRow.appendChild(b);
    });
    body.appendChild(el('div', { class: 'micro-label', text: 'Paletas rápidas' }));
    body.appendChild(paletteRow);

    MI.modal.open({
      title: 'Editor de fondo de pantalla',
      wide: true,
      body,
      footer: [{ label: 'Hecho ✓', className: 'btn-lime', onClick: () => { commit(); renderAll(); } }]
    });
    paint();
  }
  E.openBackgroundEditor = openBackgroundEditor;

  /* ----------------------------- modales auxiliares ----------------------------- */
  function openAddObject() {
    const body = el('div');
    body.appendChild(el('p', { class: 'field-note', style: { marginBottom: '10px' }, text: 'Elige cómo empezar: dibuja un objeto desde cero, reutiliza uno de «Mis objetos» o parte de un sprite predefinido. Después podrás editar sus 4 animaciones.' }));

    const startRow = el('div', { class: 'btn-row' });
    startRow.appendChild(smallBtn('▢ Crear desde cero', () => {
      addObjectFromPreset('slime', true);
      MI.modal.close();
    }, 'btn-primary'));
    body.appendChild(startRow);

    const userObjs = MI.store.objects();
    section(body, 'Mis objetos' + (userObjs.length ? ' · ' + userObjs.length : ''));
    if (!userObjs.length) {
      body.appendChild(el('p', { class: 'field-note', text: 'Todavía no has guardado objetos. Crea o personaliza uno y pulsa «Guardar este objeto» en la pestaña Animación.' }));
    } else {
      const ugrid = el('div', { class: 'user-object-grid' });
      userObjs.forEach(u => {
        const tile = el('div', { class: 'user-object-tile' });
        const b = el('button', { class: 'sprite-btn', type: 'button', title: 'Añadir «' + u.name + '»' });
        const c = el('canvas', { width: 32, height: 32, style: { width: '44px', height: '44px' } });
        MI.sprites.thumb(c, (u.animations[0] && u.animations[0].frames[0]) || MI.sprites.empty());
        b.appendChild(c);
        b.appendChild(el('span', { style: { display: 'block', fontSize: '8px', fontWeight: '800', marginTop: '2px' }, text: u.name }));
        b.addEventListener('click', () => {
          addObjectFromTemplate(u);
          MI.modal.close();
        });
        const del = el('button', {
          class: 'user-object-del', type: 'button', text: '✕', title: 'Quitar de Mis objetos',
          onclick: () => MI.modal.confirm('Eliminar objeto', '¿Quitar «' + u.name + '» de Mis objetos? Los objetos ya colocados en microjuegos no cambian.', () => {
            MI.store.removeObject(u.id);
            MI.toast('Objeto eliminado de Mis objetos', 'ok');
            openAddObject();
          }, 'Eliminar', true)
        });
        tile.appendChild(b);
        tile.appendChild(del);
        ugrid.appendChild(tile);
      });
      body.appendChild(ugrid);
    }

    section(body, 'Sprites predefinidos');
    const grid = el('div', { class: 'sprite-lib', style: { gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' } });
    MI.sprites.keys().forEach(key => {
      const b = el('button', { class: 'sprite-btn', type: 'button', title: MI.sprites.DISPLAY_NAMES[key] || key, style: { padding: '4px' } });
      const c = el('canvas', { width: 32, height: 32, style: { width: '44px', height: '44px' } });
      MI.sprites.thumb(c, MI.sprites.preset(key));
      b.appendChild(c);
      b.appendChild(el('span', { style: { display: 'block', fontSize: '8px', fontWeight: '800', marginTop: '2px' }, text: MI.sprites.DISPLAY_NAMES[key] || key }));
      b.addEventListener('click', () => { addObjectFromPreset(key); MI.modal.close(); });
      grid.appendChild(b);
    });
    body.appendChild(grid);

    MI.modal.open({
      title: 'Añadir objeto', wide: true, body,
      footer: [{ label: 'Cancelar', className: 'btn-paper' }]
    });
  }
  E.openAddObject = openAddObject;

  function uniqueObjectName(baseName) {
    let name = baseName || 'Objeto', n = 2;
    while (state.game.objects.some(o => o.name === name)) { name = (baseName || 'Objeto') + ' ' + n; n++; }
    return name;
  }

  function placeNewObject(obj) {
    const offset = (state.game.objects.length % 4) * 32;
    obj.x = U.clamp((MI.W - obj.w) / 2 + offset, 16, MI.W - obj.w - 16);
    obj.y = U.clamp((MI.H - obj.h) / 2 + offset, 16, MI.H - obj.h - 16);
    state.game.objects.push(obj);
    state.selectedObjectId = obj.id;
    state.selectedZoneId = null;
    state.animIndex = 0;
    state.animFrame = 0;
    state.tab = 'object';
    MI.$$('#inspector-tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'object'));
    commit(); renderAll();
    MI.audio.sfx('power');
    MI.toast('Objeto «' + obj.name + '» añadido', 'ok');
    return obj;
  }

  function addObjectFromPreset(key, empty) {
    const obj = MI.sprites.makeObject(uniqueObjectName(empty ? 'Objeto' : (MI.sprites.DISPLAY_NAMES[key] || 'Objeto')), key, {
      w: 96, h: 96
    });
    if (empty) {
      obj.animations.forEach(a => {
        a.frames = [MI.sprites.empty(), MI.sprites.empty(), MI.sprites.empty(), MI.sprites.empty()];
      });
      MI.syncObjectAliases(obj);
    }
    placeNewObject(obj);
    if (empty) openPixelEditor(obj.id, 0, 0);
    return obj;
  }

  function addObjectFromTemplate(template) {
    if (!template) return null;
    const obj = MI.sprites.makeObject(uniqueObjectName(template.name || 'Mi objeto'), 'slime', {
      w: 96, h: 96,
      animations: U.deepClone(template.animations)
    });
    placeNewObject(obj);
    return obj;
  }

  function openSaveObjectModal(obj) {
    if (!obj) return;
    const nameInput = el('input', { class: 'input', type: 'text', value: obj.name, maxlength: '24' });
    const body = el('div');
    addField(body, 'Nombre en Mis objetos', nameInput, 'Se guardan las 4 animaciones con sus nombres, celdas y velocidades.');
    body.appendChild(el('p', { class: 'field-note', text: 'Se guarda en este navegador. Podrás usarlo al añadir objetos en cualquier microjuego.' }));
    MI.modal.open({
      title: 'Guardar objeto', narrow: true, body,
      footer: [
        { label: 'Cancelar', className: 'btn-paper' },
        {
          label: 'Guardar ✓', className: 'btn-lime',
          onClick: () => {
            const saved = MI.store.saveObject(obj, nameInput.value);
            MI.toast('«' + saved.name + '» guardado en Mis objetos', 'ok');
            MI.audio.sfx('power');
          }
        }
      ]
    });
  }
  E.openSaveObjectModal = openSaveObjectModal;

  function openZoneEditor(zoneId) {
    const z = zoneById(zoneId);
    if (!z) return;
    const name = el('input', { class: 'input', type: 'text', value: z.name, maxlength: '24' });
    const x = el('input', { class: 'input', type: 'number', value: String(z.x) });
    const y = el('input', { class: 'input', type: 'number', value: String(z.y) });
    const w = el('input', { class: 'input', type: 'number', value: String(z.w), min: '6' });
    const h = el('input', { class: 'input', type: 'number', value: String(z.h), min: '6' });
    const body = el('div');
    addField(body, 'Nombre de la zona', name);
    const r1 = el('div', { class: 'row row-2' });
    r1.appendChild(el('div', { class: 'field' }, [el('label', { text: 'X' }), x]));
    r1.appendChild(el('div', { class: 'field' }, [el('label', { text: 'Y' }), y]));
    body.appendChild(r1);
    const r2 = el('div', { class: 'row row-2' });
    r2.appendChild(el('div', { class: 'field' }, [el('label', { text: 'Ancho' }), w]));
    r2.appendChild(el('div', { class: 'field' }, [el('label', { text: 'Alto' }), h]));
    body.appendChild(r2);

    MI.modal.open({
      title: 'Editar zona', narrow: true, body,
      footer: [
        {
          label: 'Eliminar', className: 'btn-danger', close: false,
          onClick: () => { MI.modal.close(); deleteZone(zoneId); }
        },
        { label: 'Cancelar', className: 'btn-paper' },
        {
          label: 'Guardar', className: 'btn-primary',
          onClick: () => {
            z.name = name.value.trim() || 'Zona';
            z.x = Math.round(Number(x.value) || 0);
            z.y = Math.round(Number(y.value) || 0);
            z.w = Math.max(6, Math.round(Number(w.value) || 6));
            z.h = Math.max(6, Math.round(Number(h.value) || 6));
            commit(); renderAll();
          }
        }
      ]
    });
  }
  E.openZoneEditor = openZoneEditor;

  /* ----------------------------- duplicar / eliminar ----------------------------- */
  function duplicateObject(id) {
    const obj = objById(id);
    if (!obj) return;
    const copy = U.deepClone(obj);
    copy.id = U.uid('obj');
    copy.name = obj.name + ' copia';
    copy.x += 32; copy.y += 32;
    state.game.objects.push(copy);
    state.selectedObjectId = copy.id;
    state.selectedZoneId = null;
    commit(); renderAll();
    MI.toast('Objeto duplicado', 'ok');
  }

  function deleteSelectedObject() {
    const obj = selectedObject();
    if (!obj) return;
    MI.modal.confirm('Eliminar objeto',
      '¿Eliminar «' + obj.name + '»? También se eliminarán las reglas que lo usan como sujeto y las referencias a él.',
      () => deleteObject(obj.id), 'Eliminar', true);
  }

  function deleteObject(id) {
    const idx = state.game.objects.findIndex(o => o.id === id);
    if (idx < 0) return;
    state.game.objects.splice(idx, 1);
    state.game.rules = state.game.rules.filter(r => r.subject !== id);
    state.game.rules.forEach(r => {
      r.actions = r.actions.filter(a =>
        a.target !== id && a.objectId !== id && a.fromObjectId !== id
      );
    });
    state.game.rules = state.game.rules.filter(r => r.actions.length);
    if (Array.isArray(state.game.goal.groups)) {
      state.game.goal.groups.forEach(gr => {
        const gi = gr.indexOf(id);
        if (gi >= 0) gr.splice(gi, 1);
      });
    }
    if (state.game.goal.objectId === id) {
      state.game.goal.objectId = null;
      if (state.game.goal.type !== 'switches') state.game.goal.type = 'survive';
    }
    state.selectedObjectId = state.game.objects[0] ? state.game.objects[0].id : null;
    state.selectedZoneId = null;
    commit(); renderAll();
    MI.toast('Objeto eliminado');
  }

  function deleteSelectedZone() {
    const z = selectedZone();
    if (!z) return;
    deleteZone(z.id);
  }

  function deleteZone(id) {
    const idx = state.game.zones.findIndex(z => z.id === id);
    if (idx < 0) return;
    state.game.zones.splice(idx, 1);
    const zoneTrigger = (t) => !!(t && t.zoneId === id);
    state.game.rules = state.game.rules.filter(r =>
      !zoneTrigger(r.trigger) &&
      !(r.extraTriggers || []).some(e => zoneTrigger(e.trigger)) &&
      !r.actions.some(a => a.zoneId === id)
    );
    state.game.rules.forEach(r => { r.actions = r.actions.filter(a => a.zoneId !== id); });
    if (state.game.goal.zoneId === id) {
      state.game.goal.zoneId = null;
      if (state.game.goal.type === 'reach') state.game.goal.type = 'survive';
    }
    state.selectedZoneId = null;
    commit(); renderAll();
    MI.toast('Zona eliminada');
  }

  /* ----------------------------- guardar / probar / importar ----------------------------- */
  function sanitizeGoalGroups(goal) {
    if (!Array.isArray(goal.groups)) goal.groups = [];
    const cleaned = [];
    goal.groups.slice(0, MI.MAX_GOAL_GROUPS).forEach(gr => {
      const ids = [];
      (Array.isArray(gr) ? gr : []).forEach(id => {
        if (objById(id) && ids.indexOf(id) < 0) ids.push(id);
      });
      cleaned.push(ids);
    });
    goal.groups = cleaned;
  }

  function ensureSwitchGoal(goal) {
    if (!goal) return;
    if (!Array.isArray(goal.groups)) goal.groups = [];
    if (goal.type !== 'switches') {
      // Conversión best-effort de objetivos antiguos: solo se conserva el
      // objeto si alguna regla puede encender su interruptor.
      if (!goal.groups.length && goal.objectId && objById(goal.objectId)) {
        const id = goal.objectId;
        const canTurnOn = goal.type === 'switch' || (state.game.rules || []).some(r =>
          r.subject === id && (r.actions || []).some(a => a.type === 'switch' && a.value !== false &&
            (a.objectId === 'self' || a.objectId === id))
        );
        if (canTurnOn) goal.groups.push([id]);
      }
      goal.type = 'switches';
    }
    sanitizeGoalGroups(goal);
    goal.objectId = null;
    goal.zoneId = null;
  }
  E.ensureSwitchGoal = ensureSwitchGoal;

  function fixGoal() {
    ensureSwitchGoal(state.game.goal || (state.game.goal = { type: 'switches', groups: [], objectId: null, zoneId: null }));
  }
  E.fixGoal = fixGoal;

  function saveGame() {
    fixGoal();
    if (!state.game.objects.length) {
      MI.toast('Añade al menos un objeto antes de guardar', 'err');
      return;
    }
    if (!state.game.name.trim()) {
      state.game.name = 'Mi microjuego';
      const ni = $('#game-name'); if (ni) ni.value = state.game.name;
    }
    const g = U.deepClone(state.game);
    g.example = false;
    if (state.savedId) g.id = state.savedId;
    state.game.id = g.id;
    state.game.updatedAt = Date.now();
    g.updatedAt = state.game.updatedAt;
    MI.store.save(g);
    state.savedId = g.id;
    state.source = 'library';
    state.dirty = false;
    MI.store.clearDraft();
    updateSaveState('Guardado ✓', 'saved');
    MI.audio.sfx('power');
    MI.toast('Guardado en «Mis microjuegos»', 'ok');
  }
  E.save = saveGame;

  function testGame() {
    fixGoal();
    if (!state.game.objects.length) {
      MI.toast('Añade al menos un objeto antes de probar', 'err');
      return;
    }
    MI.store.setDraft({ game: U.deepClone(state.game), savedId: state.savedId, source: state.source });
    MI.audio.unlock();
    MI.player.open(U.deepClone(state.game), {
      mode: 'preview',
      from: 'editor',
      speed: state.previewSpeed,
      showSwitches: state.previewSwitches
    });
  }
  E.test = testGame;

  function exportGame() {
    fixGoal();
    const g = U.deepClone(state.game);
    g.example = false;
    MI.exportGame(g);
    MI.audio.sfx('select');
    MI.toast('Archivo .microgame exportado', 'ok');
  }
  E.exportGame = exportGame;

  async function handleEditorImport(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const imported = await MI.importFile(file);
      if (state.dirty) MI.store.setDraft({ game: U.deepClone(state.game), savedId: state.savedId, source: state.source });
      E.open(imported, { source: 'import', onExit: state.onExit });
      MI.toast('Microjuego importado: ' + imported.name, 'ok');
      MI.audio.sfx('power');
    } catch (err) {
      MI.toast(err.message || 'No se pudo importar el archivo', 'err');
    }
  }

  /* ----------------------------- ayuda ----------------------------- */
  function showHelp() {
    const html = `
      <div class="help-grid">
        <div class="help-card">
          <h3>1 · Coloca objetos</h3>
          <p>Pulsa <strong>＋</strong> en el panel de objetos y elige un sprite predefinido, empieza con un lienzo vacío o usa uno guardado en <strong>Mis objetos</strong>. Arrástralo por el escenario. Puedes hacerlo aparecer en un punto fijo o en una zona aleatoria que tú dibujes.</p>
        </div>
        <div class="help-card">
          <h3>2 · Dibuja zonas</h3>
          <p>Con la herramienta <strong>Zona</strong> traza un área. Las zonas sirven para contactos, saltos, deambular y metas. Pueden estar total o parcialmente fuera del escenario.</p>
        </div>
        <div class="help-card">
          <h3>3 · Crea reglas</h3>
          <p>En <strong>Lógica</strong>, cada regla es <em>cuando ocurre un activador → haz una o varias acciones</em>. Por ejemplo: «Tocar este objeto → reproducir sonido y activar interruptor».</p>
        </div>
        <div class="help-card">
          <h3>4 · Elige el objetivo</h3>
          <p>En <strong>Juego</strong> eliges qué interruptores deben estar ON para ganar. Dentro de una condición todos deben estar ON (<strong>Y</strong>); puedes crear varias condiciones y se cumple cualquiera de ellas (<strong>O</strong>). El microjuego siempre termina al acabar el tiempo, ¡ganes o pierdas!</p>
        </div>
      </div>
      <h3 style="font-family:var(--font-display);font-size:13px;margin:16px 0 7px">Activadores</h3>
      <div class="help-grid">
        <div class="help-card trigger"><h3>Tocar</h3><p>Este objeto o cualquier punto del escenario. Ideal para interacción directa con el ratón o el dedo.</p></div>
        <div class="help-card trigger"><h3>Contacto</h3><p>Tocar (bordes) u solaparse (superposición) con otro objeto o con una zona.</p></div>
        <div class="help-card trigger"><h3>Animación</h3><p>Cuando el objeto muestra una animación y celda concretas o cuando completa un ciclo de sus 4 celdas.</p></div>
        <div class="help-card trigger"><h3>Interruptor</h3><p>Cuando un objeto pasa a ON/OFF o mientras está ON/OFF. Todos empiezan en OFF.</p></div>
        <div class="help-card trigger"><h3>Tiempo</h3><p>En un punto exacto del tiempo total o durante un intervalo.</p></div>
        <div class="help-card trigger"><h3>Victoria / derrota</h3><p>En el instante de ganar, después de ganar, antes de ganar, o lo mismo con la derrota.</p></div>
        <div class="help-card trigger"><h3>Varios activadores (Y / O)</h3><p>Pulsa <strong>＋ Añadir activador</strong> para combinar condiciones. Cada activador extra se une al anterior con <strong>Y</strong> (ambos) u <strong>O</strong> (cualquiera).</p></div>
      </div>
      <h3 style="font-family:var(--font-display);font-size:13px;margin:16px 0 7px">Acciones</h3>
      <div class="help-grid">
        <div class="help-card action"><h3>Movimiento</h3><p>Línea recta en 8 direcciones, hacia un punto u otro objeto, saltos, deambular (meneo, bola de billar, moscardón, balón), detenerse, cambiar posiciones y acercarse a otro objeto.</p></div>
        <div class="help-card action"><h3>Estado y efectos</h3><p>Derrota, sonido, interruptor ON/OFF, cambiar a una animación concreta o detenerla, destello, confeti, temblor y congelar (invierte colores y bloquea los toques).</p></div>
        <div class="help-card action"><h3>Orden de las acciones</h3><p>Se ejecutan de arriba abajo. Arrastra el asa <strong>⋮⋮</strong> o usa <strong>▲ ▼</strong> para cambiar el orden; el número azul indica cuál va primero.</p></div>
      </div>
      <p class="field-note" style="margin-top:14px">Consejo: si una acción necesita otro objeto o una zona y aún no existe, el editor te avisa o crea una zona estándar. Puedes repetir una regla activando «Repetir».</p>
    `;
    MI.modal.open({
      title: 'Cómo crear microjuegos', wide: true,
      body: el('div', { html }),
      footer: [{ label: '¡Entendido!', className: 'btn-primary' }]
    });
  }
  E.showHelp = showHelp;

  /* ============================================================
     PESTAÑA LÓGICA — tarjetas de activador → acciones
     ============================================================ */
  const ACTION_LABELS = {
    moveDir: 'Movimiento · En línea recta (dirección fija)',
    moveRandom: 'Movimiento · En línea recta (dirección aleatoria)',
    moveTo: 'Movimiento · En línea recta hacia un punto',
    moveFrom: 'Movimiento · Línea recta desde otra ubicación',
    jumpPoint: 'Movimiento · Saltar a un punto',
    jumpZone: 'Movimiento · Saltar a una zona',
    jumpObject: 'Movimiento · Saltar a otro objeto',
    wander: 'Movimiento · Deambular',
    stop: 'Movimiento · Detenerse',
    swap: 'Movimiento · Cambiar posiciones',
    approach: 'Movimiento · Acercarse a otro objeto',
    lose: 'Derrota',
    sound: 'Sonido',
    switch: 'Interruptor',
    invisible: 'Objeto invisible',
    text: 'Añadir texto',
    anim: 'Animación',
    effect: 'Efecto'
  };

  const TRIGGER_LABELS = {
    tap: 'Tocar',
    touch: 'Contacto · Tocar',
    overlap: 'Contacto · Solapamiento',
    anim: 'Animación',
    time: 'Tiempo',
    switch: 'Interruptor',
    result: 'Victoria / derrota'
  };

  function ensureZoneSilent() {
    if (state.game.zones.length) return state.game.zones[0].id;
    const z = createZone({ x: 288, y: 168, w: 704, h: 384 }, 'Zona 1');
    return z.id;
  }

  function firstOtherId(excludeId) {
    const o = state.game.objects.find(x => x.id !== excludeId);
    return o ? o.id : null;
  }

  function addRule(subjectId) {
    const subject = subjectId || state.selectedObjectId || (state.game.objects[0] && state.game.objects[0].id) || 'stage';
    const trigger = subject === 'stage'
      ? { type: 'time', mode: 'point', at: Math.round((state.game.duration || 4000) / 2) }
      : { type: 'tap', where: 'self' };
    state.game.rules.push({
      id: U.uid('rule'),
      subject,
      trigger,
      extraTriggers: [],
      actions: [{ type: 'sound', soundId: 'blip', target: 'self' }],
      repeat: false,
      enabled: true
    });
    commit();
    setTab('logic');
    renderAll();
    setTimeout(() => {
      const body = $('#inspector-body');
      if (body) body.scrollTop = body.scrollHeight;
    }, 30);
  }

  function renderLogicTab(body) {
    const sel = selectedObject();
    const subject = sel ? sel.id : 'stage';
    const subjectName = sel ? sel.name : 'Escenario';
    const rules = state.game.rules.filter(r => r.subject === subject);

    const head = el('div', { class: 'logic-head' }, [
      el('h3', {}, [
        document.createTextNode('Lógica · ' + subjectName),
        el('span', { class: 'count', text: String(rules.length) })
      ]),
      smallBtn('＋ Nueva regla', () => addRule(subject), 'btn-primary')
    ]);
    body.appendChild(head);

    const note = el('div', { class: 'logic-filter-note' }, [
      el('span', { text: sel
        ? 'Mostrando solo las reglas de «' + sel.name + '». Selecciona otro objeto para ver las suyas.'
        : 'No hay ningún objeto seleccionado: se muestran las reglas del escenario.' })
    ]);
    if (state.ruleClipboard) {
      note.appendChild(el('button', {
        class: 'mini-btn paste-rule', type: 'button', text: '📋 Pegar regla…',
        title: 'Pegar la regla copiada en otro objeto',
        onclick: openPasteRule
      }));
    }
    body.appendChild(note);
    body.appendChild(el('p', { class: 'field-note', style: { marginBottom: '10px' }, text: 'Cada regla se lee: cuando ocurre el activador → se ejecutan las acciones. El orden importa.' }));

    if (!rules.length) {
      body.appendChild(el('div', { class: 'empty-logic' }, [
        el('div', { class: 'big', text: '🧠' }),
        el('h4', { text: sel ? 'Este objeto no tiene reglas' : 'El escenario no tiene reglas' }),
        el('p', { text: sel
          ? 'Crea una regla como «Tocar este objeto → activar interruptor» o copia una desde otro objeto.'
          : 'Crea una regla como «Tiempo en 2 s → mover objeto».' }),
        smallBtn('＋ Crear la primera regla', () => addRule(subject), 'btn-primary')
      ]));
      return;
    }

    const list = el('div', { class: 'rules' });
    rules.forEach((rule) => list.appendChild(renderRuleCard(rule, state.game.rules.indexOf(rule))));
    body.appendChild(list);
    body.appendChild(el('p', { class: 'field-note', style: { marginTop: '10px' }, text: 'Todos los interruptores empiezan en OFF. El microjuego termina al agotarse el tiempo aunque ya hayas ganado o perdido.' }));
  }

  function openPasteRule() {
    const clip = state.ruleClipboard;
    if (!clip) {
      MI.toast('Primero copia una regla con el botón ⧉', 'err');
      return;
    }
    const triggers = [clip.trigger].concat((clip.extraTriggers || []).map(e => e.trigger));
    const needsSubject = triggers.some(requiresSubject);
    const options = state.game.objects.map(o => ({ value: o.id, label: o.name }));
    if (!needsSubject) options.unshift({ value: 'stage', label: '🌐 Escenario' });
    if (!options.length) {
      MI.toast('Necesitas al menos un objeto para pegar la regla', 'err');
      return;
    }
    let target = state.selectedObjectId || options[0].value;
    if (needsSubject && target === 'stage') target = options[0].value;

    const body = el('div');
    const source = clip.subject && clip.subject !== 'stage' && objById(clip.subject)
      ? objById(clip.subject).name
      : 'Escenario';
    body.appendChild(el('p', { class: 'field-note', text: 'Regla copiada de «' + source + '» con ' + triggers.length + ' activador(es) y ' + clip.actions.length + ' acción(es). Elige el objeto destino.' }));
    addField(body, 'Objeto destino', mkSelect(options, target, (v) => { target = v; }));
    if (needsSubject) {
      body.appendChild(el('p', { class: 'field-note', text: 'Esta regla usa activadores que necesitan un objeto, así que no se puede pegar en el escenario.' }));
    }
    MI.modal.open({
      title: 'Pegar regla en otro objeto',
      narrow: true,
      body,
      footer: [
        { label: 'Cancelar', className: 'btn-paper' },
        {
          label: 'Pegar regla', className: 'btn-primary',
          onClick: () => {
            const copy = U.deepClone(clip);
            copy.id = U.uid('rule');
            copy.subject = target;
            state.game.rules.push(copy);
            if (target !== 'stage') state.selectedObjectId = target;
            state.selectedZoneId = null;
            commit();
            setTab('logic');
            renderAll();
            MI.toast('Regla pegada en «' + (target === 'stage' ? 'Escenario' : (objById(target) || {}).name) + '»', 'ok');
          }
        }
      ]
    });
  }

  function renderRuleCard(rule, index) {
    const card = el('div', { class: 'rule-card' + (rule.enabled ? '' : ' disabled'), dataset: { ruleId: rule.id } });
    if (!Array.isArray(rule.extraTriggers)) rule.extraTriggers = [];
    const cardTriggers = [rule.trigger].concat(rule.extraTriggers.map(e => e.trigger));
    const needs = cardTriggers.some(t => requiresSubject(t));

    const top = el('div', { class: 'rule-top' });
    top.appendChild(el('span', { class: 'rule-index', text: '#' + (index + 1) }));
    const subjOpts = [{ value: 'stage', label: '🌐 Escenario', disabled: needs }]
      .concat(state.game.objects.map(o => ({ value: o.id, label: o.name })));
    const subj = mkSelect(subjOpts, rule.subject, (v) => {
      rule.subject = v;
      if (v !== 'stage') { state.selectedObjectId = v; state.selectedZoneId = null; }
      if (v === 'stage') {
        cardTriggers.forEach(t => {
          if (requiresSubject(t)) {
            const next = { type: 'time', mode: 'point', at: Math.round((state.game.duration || 4000) / 2) };
            Object.keys(t).forEach(k => delete t[k]);
            Object.assign(t, next);
          }
        });
      }
      commit(); renderAll();
    }, '', 'Objeto que recibe el activador');
    subj.classList.add('rule-owner');
    top.appendChild(subj);
    const en = el('input', { type: 'checkbox', checked: rule.enabled, title: 'Activar / desactivar regla', style: { accentColor: 'var(--lime)' } });
    en.addEventListener('change', () => { rule.enabled = en.checked; commit(); renderAll(); });
    top.appendChild(en);
    top.appendChild(el('button', {
      class: 'icon-mini', title: 'Copiar regla para pegarla en otro objeto', text: '⧉',
      onclick: () => {
        state.ruleClipboard = U.deepClone(rule);
        MI.toast('Regla copiada. Selecciona el objeto destino y usa «Pegar regla».', 'ok');
        renderInspector();
      }
    }));
    top.appendChild(el('button', {
      class: 'icon-mini', title: 'Eliminar regla', text: '🗑',
      onclick: () => {
        const i = state.game.rules.indexOf(rule);
        if (i >= 0) state.game.rules.splice(i, 1);
        commit(); renderAll();
        MI.toast('Regla eliminada');
      }
    }));
    card.appendChild(top);

    const body = el('div', { class: 'rule-body' });

    /* ------------------------- activadores ------------------------- */
    const trigBlock = el('div', { class: 'rule-block trigger-block' });
    trigBlock.appendChild(el('div', { class: 'block-label' }, [
      el('span', { text: 'Cuando…' }),
      el('span', { text: (rule.extraTriggers.length ? 'ACTIVADORES · Y / O' : 'ACTIVADOR') })
    ]));
    trigBlock.appendChild(renderTriggerItem(rule, rule.trigger, -1));
    rule.extraTriggers.forEach((extra, i) => {
      trigBlock.appendChild(renderTriggerItem(rule, extra.trigger, i));
    });
    if (rule.extraTriggers.length < MI.MAX_EXTRA_TRIGGERS) {
      trigBlock.appendChild(el('button', {
        class: 'add-trigger', type: 'button', text: '＋ Añadir activador (Y / O)',
        onclick: () => {
          const extra = { logic: 'and', trigger: defaultExtraTrigger(rule) };
          if (requiresSubject(extra.trigger) && rule.subject === 'stage') {
            const first = state.game.objects[0];
            if (first) rule.subject = first.id;
          }
          rule.extraTriggers.push(extra);
          commit(); renderAll();
        }
      }));
    }
    body.appendChild(trigBlock);

    /* ------------------------- acciones ------------------------- */
    const actBlock = el('div', { class: 'rule-block action-block' });
    actBlock.appendChild(el('div', { class: 'block-label' }, [
      el('span', { text: 'Entonces…' }),
      el('span', { text: 'ACCIONES' })
    ]));
    const actionsList = el('div', { class: 'rule-actions-list' });
    rule.actions.forEach((action, i) => actionsList.appendChild(renderActionRow(rule, action, i)));
    actBlock.appendChild(actionsList);
    actBlock.appendChild(el('button', {
      class: 'add-action', type: 'button', text: '＋ Añadir acción',
      onclick: () => {
        rule.actions.push({ type: 'sound', soundId: 'blip', target: 'self' });
        commit(); renderAll();
      }
    }));
    body.appendChild(actBlock);
    card.appendChild(body);

    const foot = el('div', { class: 'rule-foot' });
    const rep = el('label', { class: 'rule-repeat' });
    const rcb = el('input', { type: 'checkbox', checked: rule.repeat });
    rcb.addEventListener('change', () => { rule.repeat = rcb.checked; commit(); });
    rep.appendChild(rcb);
    rep.appendChild(el('span', { text: 'Repetir mientras se cumpla' }));
    foot.appendChild(rep);
    foot.appendChild(el('span', { class: 'unit', text: rule.actions.length + ' acción(es)' }));
    card.appendChild(foot);

    if (needs && rule.subject === 'stage') {
      card.appendChild(el('p', { class: 'rule-warn', text: '⚠ Este activador necesita un objeto como sujeto. Elige uno arriba.' }));
    }
    cardTriggers.forEach((t) => {
      if (t.type === 'touch' || t.type === 'overlap') {
        if (t.mode === 'object' && !objById(t.objectId)) {
          card.appendChild(el('p', { class: 'rule-warn', text: '⚠ Elige otro objeto para el contacto.' }));
        }
        if (t.mode === 'zone' && !zoneById(t.zoneId)) {
          card.appendChild(el('p', { class: 'rule-warn', text: '⚠ Dibuja o elige una zona para el contacto.' }));
        }
      }
      if (t.type === 'anim' && rule.subject === 'stage') {
        card.appendChild(el('p', { class: 'rule-warn', text: '⚠ Selecciona el objeto cuya animación quieres escuchar.' }));
      }
    });
    return card;
  }

  function defaultTrigger(type, subject) {
    const other = firstOtherId(subject);
    const zoneId = state.game.zones[0] ? state.game.zones[0].id : null;
    switch (type) {
      case 'tap': return { type: 'tap', where: subject === 'stage' ? 'stage' : 'self' };
      case 'touch': return { type: 'touch', mode: other ? 'object' : 'zone', objectId: other, zoneId };
      case 'overlap': return { type: 'overlap', mode: other ? 'object' : 'zone', objectId: other, zoneId };
      case 'anim': return { type: 'anim', mode: 'specific', animation: 0, frame: 0 };
      case 'time': return { type: 'time', mode: 'point', at: Math.round((state.game.duration || 4000) / 2) };
      case 'switch': return { type: 'switch', objectId: 'self', mode: 'turnOn' };
      case 'result': return { type: 'result', mode: 'win' };
      default: return { type: 'time', mode: 'point', at: 1000 };
    }
  }

  function defaultAction(type, rule) {
    const actorId = rule.subject;
    const other = firstOtherId(actorId);
    const zoneId = state.game.zones[0] ? state.game.zones[0].id : null;
    const base = { type, target: 'self' };
    switch (type) {
      case 'moveDir': return Object.assign(base, { dir: 0, speedLevel: 3, speed: MI.moveSpeed(3) });
      case 'moveRandom': return Object.assign(base, { speedLevel: 3, speed: MI.moveSpeed(3) });
      case 'moveTo': return Object.assign(base, { x: MI.W / 2, y: MI.H / 2, speedLevel: 3, speed: MI.moveSpeed(3) });
      case 'moveFrom': return Object.assign(base, { fromMode: 'point', x: MI.W / 2, y: 40, fromObjectId: other, speedLevel: 3, speed: MI.moveSpeed(3) });
      case 'jumpPoint': return Object.assign(base, { x: MI.W / 2, y: MI.H / 2 });
      case 'jumpZone': return Object.assign(base, { zoneId: zoneId || ensureZoneSilent(), avoid: false });
      case 'jumpObject':
        if (!other) return null;
        return Object.assign(base, { objectId: other });
      case 'wander': return Object.assign(base, { mode: 'wobble', zoneId: zoneId || ensureZoneSilent(), avoid: false, speedLevel: 2, speed: MI.moveSpeed(2) });
      case 'stop': return base;
      case 'swap':
        if (!other) return null;
        return Object.assign(base, { objectId: other });
      case 'approach':
        if (!other) return null;
        return Object.assign(base, { objectId: other, distance: 0, speedLevel: 3, speed: MI.moveSpeed(3) });
      case 'lose': return { type: 'lose' };
      case 'sound': return { type: 'sound', soundId: 'blip' };
      case 'switch': return Object.assign(base, { objectId: 'self', value: true });
      case 'invisible': return Object.assign(base, { value: true });
      case 'text': return {
        type: 'text', text: '¡Bien!', x: Math.round(MI.W / 2), y: Math.round(MI.H / 2),
        size: 56, font: 'display', align: 'center', color: '#ffd23f', duration: 1600
      };
      case 'anim': return Object.assign(base, { mode: 'set', animation: 0, frame: 0 });
      case 'effect': return { type: 'effect', effect: 'flash', duration: 500 };
      default: return { type: 'sound', soundId: 'blip' };
    }
  }

  /* ------------------------- campos del activador ------------------------- */
  function defaultExtraTrigger(rule) {
    if (rule.subject === 'stage' && !state.game.objects.length) {
      return { type: 'time', mode: 'point', at: Math.round((state.game.duration || 4000) / 2) };
    }
    return { type: 'tap', where: 'self' };
  }

  function renderTriggerItem(rule, trigger, index) {
    const wrap = el('div', { class: 'trigger-item' + (index >= 0 ? ' trigger-extra' : '') });
    if (index >= 0) {
      const extra = rule.extraTriggers[index];
      const row = el('div', { class: 'trigger-connector' });
      row.appendChild(mkSelect([
        { value: 'and', label: 'Y' },
        { value: 'or', label: 'O' }
      ], extra.logic, (v) => {
        extra.logic = v === 'or' ? 'or' : 'and';
        commit(); renderAll();
      }, 'connector-select', 'Conector lógico entre activadores'));
      row.appendChild(el('span', {
        class: 'trigger-connector-note',
        text: index === 0 ? 'además de lo anterior…' : 'y con el activador anterior…'
      }));
      row.appendChild(el('button', {
        class: 'trigger-del', type: 'button', text: '✕', title: 'Quitar activador',
        onclick: () => {
          rule.extraTriggers.splice(index, 1);
          commit(); renderAll();
        }
      }));
      wrap.appendChild(row);
    } else {
      wrap.appendChild(el('span', { class: 'trigger-tag', text: 'Activador principal' }));
    }

    const typeOpts = Object.keys(TRIGGER_LABELS).map(k => ({ value: k, label: TRIGGER_LABELS[k] }));
    wrap.appendChild(mkSelect(typeOpts, trigger.type, (v) => {
      const next = defaultTrigger(v, rule.subject);
      Object.keys(trigger).forEach(k => delete trigger[k]);
      Object.assign(trigger, next);
      if (requiresSubject(trigger) && rule.subject === 'stage') {
        const first = state.game.objects[0];
        if (first) rule.subject = first.id;
      }
      commit(); renderAll();
    }, '', 'Tipo de activador'));
    const sub = el('div', { class: 'rule-sub' });
    renderTriggerFields(rule, sub, requiresSubject(trigger), trigger);
    wrap.appendChild(sub);
    return wrap;
  }

  function renderTriggerFields(rule, parent, needs, trig) {
    const t = trig || rule.trigger;
    const objects = state.game.objects;
    const currentSubject = rule.subject;

    if (t.type === 'tap') {
      const options = [{ value: 'stage', label: 'Cualquier punto del escenario' }];
      if (rule.subject !== 'stage') options.push({ value: 'self', label: 'Este objeto' });
      parent.appendChild(mkSelect(options, t.where, (v) => {
        t.where = v;
        if (v === 'self' && rule.subject === 'stage' && objects[0]) rule.subject = objects[0].id;
        commit(); renderAll();
      }));

    } else if (t.type === 'touch' || t.type === 'overlap') {
      const others = otherObjects(currentSubject);
      parent.appendChild(mkSelect([
        { value: 'object', label: 'Otro objeto', disabled: !others.length },
        { value: 'zone', label: 'Una zona', disabled: !state.game.zones.length }
      ], t.mode, (v) => {
        t.mode = v;
        if (v === 'object') t.objectId = others[0] ? others[0].id : null;
        if (v === 'zone') t.zoneId = state.game.zones[0] ? state.game.zones[0].id : null;
        commit(); renderAll();
      }));
      if (t.mode === 'object') {
        if (!others.length) {
          parent.appendChild(el('p', { class: 'field-note', text: 'No hay otros objetos para elegir. Esta opción está desactivada.' }));
        } else {
          parent.appendChild(mkSelect(others.map(o => ({ value: o.id, label: o.name })), t.objectId, (v) => {
            t.objectId = v; commit(); renderAll();
          }));
        }
      } else {
        parent.appendChild(zonePicker(t.zoneId, (id) => { t.zoneId = id; }));
        parent.appendChild(el('p', { class: 'field-note', text: t.type === 'touch' ? 'Se activa al tocar el borde de la zona.' : 'Se activa al solaparse con la zona.' }));
      }

    } else if (t.type === 'anim') {
      parent.appendChild(mkSelect([
        { value: 'specific', label: 'Se muestra una animación concreta' },
        { value: 'end', label: 'Si la animación finaliza' }
      ], t.mode, (v) => {
        t.mode = v; commit(); renderAll();
      }));
      if (t.mode === 'specific') {
        const subject = objById(rule.subject);
        parent.appendChild(mkSelect(animationOptions(subject), t.animation != null ? t.animation : 0, (v) => {
          t.animation = Number(v);
          t.frame = 0;
          commit(); renderAll();
        }, '', 'Animación del objeto'));
        parent.appendChild(mkSelect(cellOptions(), t.frame, (v) => {
          t.frame = Number(v); commit(); renderAll();
        }, '', 'Celda de la animación'));
      }

    } else if (t.type === 'time') {
      parent.appendChild(mkSelect([
        { value: 'point', label: 'En un punto del tiempo' },
        { value: 'interval', label: 'Durante un intervalo' }
      ], t.mode, (v) => {
        t.mode = v; commit(); renderAll();
      }));
      if (t.mode === 'point') {
        parent.appendChild(rangeControl(t, 'at', 'Momento'));
      } else {
        parent.appendChild(rangeControl(t, 'from', 'Desde'));
        parent.appendChild(rangeControl(t, 'to', 'Hasta'));
        if (t.from > t.to) { const tmp = t.from; t.from = t.to; t.to = tmp; }
        parent.appendChild(el('p', { class: 'field-note', text: 'De ' + U.msToSec(t.from) + ' s a ' + U.msToSec(t.to) + ' s.' }));
      }

    } else if (t.type === 'switch') {
      const opts = [{ value: 'self', label: 'Este objeto' }].concat(objects.map(o => ({ value: o.id, label: o.name })));
      parent.appendChild(mkSelect(opts, t.objectId, (v) => {
        t.objectId = v;
        if (v === 'self' && rule.subject === 'stage' && objects[0]) rule.subject = objects[0].id;
        commit(); renderAll();
      }));
      parent.appendChild(mkSelect([
        { value: 'turnOn', label: 'El interruptor pasa a ON' },
        { value: 'isOn', label: 'El interruptor está ON' },
        { value: 'turnOff', label: 'El interruptor pasa a OFF' },
        { value: 'isOff', label: 'El interruptor está OFF' }
      ], t.mode, (v) => {
        t.mode = v; commit(); renderAll();
      }));

    } else if (t.type === 'result') {
      parent.appendChild(mkSelect([
        { value: 'win', label: 'Victoria (instante exacto)' },
        { value: 'afterWin', label: 'Después de ganar' },
        { value: 'beforeWin', label: 'Antes de ganar' },
        { value: 'lose', label: 'Derrota (instante exacto)' },
        { value: 'afterLose', label: 'Después de perder' },
        { value: 'beforeLose', label: 'Antes de perder' }
      ], t.mode, (v) => {
        t.mode = v; commit(); renderAll();
      }));
    }
  }

  function rangeControl(trigger, key, label) {
    const wrap = el('div', { class: 'field', style: { marginBottom: '6px' } });
    // El mínimo de cualquier punto o intervalo de tiempo es 0,1 s.
    const MIN_MS = 100;
    let current = Number(trigger[key]);
    if (!Number.isFinite(current) || current < MIN_MS) current = MIN_MS;
    trigger[key] = current;
    const head = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      el('span', { class: 'micro-label', style: { margin: 0 }, text: label }),
      el('span', { class: 'unit', text: U.msToSec(current) + ' s' })
    ]);
    const max = Math.max(8000, state.game.duration || 12000, trigger.at || 0, trigger.from || 0, trigger.to || 0);
    const r = el('input', {
      type: 'range', min: MIN_MS, max: max, step: 100,
      value: String(current),
      style: { width: '100%', accentColor: 'var(--orange)' }
    });
    const readout = head.lastChild;
    r.addEventListener('input', () => {
      trigger[key] = Math.max(MIN_MS, Number(r.value));
      readout.textContent = U.msToSec(trigger[key]) + ' s';
    });
    r.addEventListener('change', () => { commit(); });
    wrap.appendChild(head);
    wrap.appendChild(r);
    wrap.appendChild(el('p', { class: 'field-note', style: { margin: '3px 0 0' }, text: 'Mínimo 0,1 s.' }));
    if (key === 'to' && trigger.from > Number(r.value)) {
      wrap.appendChild(el('p', { class: 'field-note', text: 'El final se ajustará para no ser menor que el inicio.' }));
    }
    return wrap;
  }

  function zonePicker(currentId, onSet) {
    const opts = state.game.zones.map(z => ({ value: z.id, label: z.name }));
    opts.push({ value: '__new', label: '＋ Dibujar nueva zona…' });
    if (!opts.some(o => o.value === currentId)) opts.unshift({ value: currentId || '', label: '— Elige una zona —', disabled: true });
    return mkSelect(opts, currentId || '', (v) => {
      if (v === '__new') {
        startPick('rect', (rect) => {
          const z = createZone(rect);
          onSet(z.id);
          commit(); renderAll();
          MI.toast('Zona «' + z.name + '» creada', 'ok');
        }, 'Arrastra para dibujar la zona del activador.');
      } else if (v) {
        onSet(v);
        commit(); renderAll();
      }
    });
  }

  /* ------------------------- campos de acciones ------------------------- */
  function actorControl(rule, action) {
    const opts = [{ value: 'self', label: 'Este objeto' }].concat(state.game.objects.map(o => ({ value: o.id, label: o.name })));
    return mkSelect(opts, action.target || 'self', (v) => {
      action.target = v;
      commit(); renderAll();
    }, '', 'Objeto que realiza la acción');
  }

  function destinationControl(rule, action) {
    const actorId = action.target === 'self' ? rule.subject : action.target;
    const opts = state.game.objects.filter(o => o.id !== actorId).map(o => ({ value: o.id, label: o.name }));
    if (!opts.length) {
      return el('p', { class: 'rule-warn', style: { padding: 0 }, text: '⚠ Necesitas otro objeto para esta acción.' });
    }
    opts.unshift({ value: action.objectId || '', label: '— Elige objeto —', disabled: true });
    return mkSelect(opts, action.objectId || '', (v) => {
      action.objectId = v; commit(); renderAll();
    });
  }

  function pointControl(rule, action, label) {
    const wrap = el('div', { class: 'rule-inline' });
    const x = el('input', { class: 'input num', type: 'number', value: String(action.x || 0), title: 'X del punto (centro)' });
    const y = el('input', { class: 'input num', type: 'number', value: String(action.y || 0), title: 'Y del punto (centro)' });
    x.addEventListener('change', () => { action.x = Number(x.value) || 0; commit(); });
    y.addEventListener('change', () => { action.y = Number(y.value) || 0; commit(); });
    wrap.appendChild(x); wrap.appendChild(y);
    wrap.appendChild(el('button', {
      class: 'mini-btn', type: 'button', text: '🎯 Elegir',
      onclick: () => {
        startPick('point', (px, py) => {
          action.x = Math.round(px); action.y = Math.round(py);
          commit(); renderAll();
          MI.toast('Punto elegido: ' + action.x + ', ' + action.y, 'ok');
        }, 'Haz clic en el escenario para elegir el ' + (label || 'punto') + '.');
      }
    }));
    return wrap;
  }

  function moveAction(rule, from, to) {
    if (from === to || to < 0 || to >= rule.actions.length) return;
    const moved = rule.actions.splice(from, 1)[0];
    rule.actions.splice(to, 0, moved);
    commit(); renderAll();
  }

  function clearActionDrop() {
    const nodes = document.querySelectorAll('.action-item.drop-before, .action-item.drop-after');
    for (let i = 0; i < nodes.length; i++) nodes[i].classList.remove('drop-before', 'drop-after');
  }

  function bindActionDrag(wrap, rule, index) {
    const grip = wrap.querySelector('.action-grip');
    if (!grip) return;
    grip.addEventListener('dragstart', (e) => {
      if (rule.actions.length < 2) { e.preventDefault(); return; }
      state.actionDrag = { rule, from: index };
      wrap.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', String(index));
          e.dataTransfer.setDragImage(wrap, 16, 16);
        } catch (err) { /* algunos navegadores no permiten la imagen */ }
      }
    });
    grip.addEventListener('dragend', () => {
      wrap.classList.remove('dragging');
      clearActionDrop();
      state.actionDrag = null;
    });
    wrap.addEventListener('dragover', (e) => {
      const drag = state.actionDrag;
      if (!drag || drag.rule !== rule) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const r = wrap.getBoundingClientRect();
      const after = (e.clientY - r.top) > r.height / 2;
      clearActionDrop();
      wrap.classList.add(after ? 'drop-after' : 'drop-before');
    });
    wrap.addEventListener('dragleave', () => {
      wrap.classList.remove('drop-before', 'drop-after');
    });
    wrap.addEventListener('drop', (e) => {
      const drag = state.actionDrag;
      if (!drag || drag.rule !== rule) return;
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      const after = (e.clientY - r.top) > r.height / 2;
      let to = index + (after ? 1 : 0);
      clearActionDrop();
      if (drag.from < to) to -= 1;
      state.actionDrag = null;
      moveAction(rule, drag.from, to);
    });
  }

  function renderActionRow(rule, action, index) {
    const wrap = el('div', { class: 'action-item', dataset: { actionIndex: String(index) } });

    const num = el('span', { class: 'action-num', text: String(index + 1), title: 'Orden de ejecución' });
    wrap.appendChild(num);

    const grip = el('button', {
      class: 'action-grip', type: 'button', text: '⋮⋮',
      title: rule.actions.length > 1 ? 'Arrastra para cambiar el orden' : 'Añade otra acción para reordenar',
      draggable: rule.actions.length > 1
    });
    wrap.appendChild(grip);

    const fields = el('div', { class: 'action-fields' });

    const typeOpts = Object.keys(ACTION_LABELS).map(k => ({ value: k, label: ACTION_LABELS[k] }));
    fields.appendChild(mkSelect(typeOpts, action.type, (v) => {
      if (v === action.type) return;
      const oldTarget = action.target;
      const next = defaultAction(v, rule);
      if (!next) {
        MI.toast('Para esta acción necesitas al menos otro objeto', 'err');
        renderAll();
        return;
      }
      Object.keys(action).forEach(k => delete action[k]);
      Object.assign(action, next);
      if (oldTarget) action.target = oldTarget;
      if (action.type === 'switch') action.objectId = action.objectId || 'self';
      commit(); renderAll();
    }));

    const detail = el('div', { class: 'rule-sub' });
    renderActionFields(rule, action, detail);
    fields.appendChild(detail);
    wrap.appendChild(fields);

    const tools = el('div', { class: 'action-tools' });
    tools.appendChild(el('button', {
      class: 'action-move', type: 'button', text: '▲', title: 'Subir acción',
      disabled: index === 0,
      onclick: () => moveAction(rule, index, index - 1)
    }));
    tools.appendChild(el('button', {
      class: 'action-move', type: 'button', text: '▼', title: 'Bajar acción',
      disabled: index === rule.actions.length - 1,
      onclick: () => moveAction(rule, index, index + 1)
    }));
    tools.appendChild(el('button', {
      class: 'action-del', type: 'button', text: '✕', title: 'Quitar acción',
      onclick: () => {
        const i = rule.actions.indexOf(action);
        if (i >= 0) rule.actions.splice(i, 1);
        commit(); renderAll();
      }
    }));
    wrap.appendChild(tools);

    bindActionDrag(wrap, rule, index);
    return wrap;
  }

  // Selector de velocidad de movimiento por niveles (1 lento · 5 rápido).
  // Internamente se guarda también el valor en px/s para el motor.
  function speedSelect(action, fallbackLevel) {
    const level = action.speedLevel != null
      ? U.clamp(Math.round(Number(action.speedLevel)), 1, 5)
      : MI.moveSpeedLevel(action.speed);
    return mkSelect(
      MI.MOVE_SPEEDS.map(s => ({ value: s.value, label: s.label })),
      level || fallbackLevel || 3,
      (v) => {
        action.speedLevel = U.clamp(Math.round(Number(v)), 1, 5);
        action.speed = MI.moveSpeed(action.speedLevel);
        commit(); renderAll();
      },
      '',
      'Velocidad de movimiento (1 = más lento, 5 = más rápido)'
    );
  }

  // Opciones de animación para selectores de activadores y acciones.
  function animationOptions(obj) {
    const animations = obj ? MI.objectAnimations(obj) : null;
    return [0, 1, 2, 3].map(i => ({
      value: i,
      label: animations ? ((i + 1) + '. ' + animations[i].name) : ('Animación ' + (i + 1))
    }));
  }

  function cellOptions() {
    return [0, 1, 2, 3].map(i => ({ value: i, label: 'Celda ' + (i + 1) }));
  }

  function actorWarning(rule, action, parent) {
    if (action.target === 'self' && rule.subject === 'stage') {
      parent.appendChild(el('p', { class: 'rule-warn', style: { padding: 0 }, text: '⚠ Elige un objeto para esta acción.' }));
    }
  }

  function renderActionFields(rule, action, parent) {
    const t = action.type;

    if (t !== 'lose' && t !== 'sound' && t !== 'effect' && t !== 'text' && t !== 'switch') {
      actorWarning(rule, action, parent);
      parent.appendChild(el('div', { class: 'rule-inline' }, [
        el('span', { class: 'micro-label', style: { margin: 0 }, text: 'Objeto' }),
        actorControl(rule, action)
      ]));
    }

    switch (t) {
      case 'moveDir': {
        const dirWrap = el('div', { style: { marginTop: '5px' } });
        dirWrap.appendChild(el('span', { class: 'micro-label', text: 'Dirección' }));
        const grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 26px)', gap: '3px' } });
        DIRS.forEach(d => {
          const b = el('button', {
            type: 'button',
            class: 'mini-btn',
            text: d.a,
            style: { width: '26px', height: '24px', padding: 0, background: action.dir === d.v ? 'var(--yellow)' : 'var(--paper)' },
            disabled: d.v === -1,
            onclick: () => { action.dir = d.v; commit(); renderAll(); }
          });
          grid.appendChild(b);
        });
        dirWrap.appendChild(grid);
        parent.appendChild(dirWrap);
        parent.appendChild(el('div', { class: 'rule-inline', style: { marginTop: '5px' } }, [
          el('span', { class: 'micro-label', style: { margin: 0 }, text: 'Velocidad' }),
          speedSelect(action, 3)
        ]));
        break;
      }
      case 'moveRandom': {
        parent.appendChild(el('div', { class: 'rule-inline' }, [
          el('span', { class: 'micro-label', style: { margin: 0 }, text: 'Velocidad' }),
          speedSelect(action, 3)
        ]));
        parent.appendChild(el('p', { class: 'field-note', text: 'Dirección al azar entre las 8 posibles.' }));
        break;
      }
      case 'moveTo': {
        parent.appendChild(el('span', { class: 'micro-label', text: 'Punto de destino (centro)' }));
        parent.appendChild(pointControl(rule, action));
        parent.appendChild(el('div', { class: 'rule-inline', style: { marginTop: '5px' } }, [
          el('span', { class: 'micro-label', style: { margin: 0 }, text: 'Velocidad' }),
          speedSelect(action, 3)
        ]));
        break;
      }
      case 'moveFrom': {
        parent.appendChild(mkSelect([
          { value: 'point', label: 'Desde una ubicación' },
          { value: 'object', label: 'Desde otro objeto' }
        ], action.fromMode, (v) => {
          action.fromMode = v; commit(); renderAll();
        }));
        if (action.fromMode === 'point') {
          parent.appendChild(pointControl(rule, action));
        } else {
          const others = otherObjects(action.target === 'self' ? rule.subject : action.target);
          parent.appendChild(mkSelect(others.map(o => ({ value: o.id, label: o.name })), action.fromObjectId, (v) => {
            action.fromObjectId = v; commit(); renderAll();
          }));
        }
        parent.appendChild(el('div', { class: 'rule-inline', style: { marginTop: '5px' } }, [
          el('span', { class: 'micro-label', style: { margin: 0 }, text: 'Velocidad' }),
          speedSelect(action, 3)
        ]));
        parent.appendChild(el('p', { class: 'field-note', text: 'El objeto aparece en ese origen y avanza en línea recta hacia su posición actual.' }));
        break;
      }
      case 'jumpPoint': {
        parent.appendChild(el('span', { class: 'micro-label', text: 'Punto de destino (centro)' }));
        parent.appendChild(pointControl(rule, action));
        break;
      }
      case 'jumpZone': {
        parent.appendChild(el('span', { class: 'micro-label', text: 'Zona de destino' }));
        parent.appendChild(zonePicker(action.zoneId, (id) => { action.zoneId = id; }));
        parent.appendChild(checkRow('Intentar no solapar', action.avoid, (v) => {
          action.avoid = v; commit(); renderAll();
        }));
        parent.appendChild(el('p', { class: 'field-note', text: 'Salta a un punto al azar dentro de la zona.' }));
        break;
      }
      case 'jumpObject': {
        parent.appendChild(el('span', { class: 'micro-label', text: 'Saltar al objeto' }));
        parent.appendChild(destinationControl(rule, action));
        break;
      }
      case 'wander': {
        parent.appendChild(mkSelect([
          { value: 'wobble', label: 'Meneo (vaivén por la zona)' },
          { value: 'billiard', label: 'Bola de billar (rebota)' },
          { value: 'fly', label: 'Moscardón (movimiento errático)' },
          { value: 'ball', label: 'Balón (bota con gravedad)' }
        ], action.mode, (v) => {
          action.mode = v; commit(); renderAll();
        }));
        parent.appendChild(el('span', { class: 'micro-label', text: 'Zona de deambulación' }));
        parent.appendChild(zonePicker(action.zoneId, (id) => { action.zoneId = id; }));
        parent.appendChild(el('div', { class: 'rule-inline', style: { marginTop: '5px' } }, [
          el('span', { class: 'micro-label', style: { margin: 0 }, text: 'Velocidad' }),
          speedSelect(action, 2)
        ]));
        parent.appendChild(checkRow('Intentar no solapar', action.avoid, (v) => {
          action.avoid = v; commit(); renderAll();
        }));
        break;
      }
      case 'stop':
        parent.appendChild(el('p', { class: 'field-note', text: 'Detiene cualquier movimiento y deja el objeto quieto.' }));
        break;
      case 'swap': {
        parent.appendChild(el('span', { class: 'micro-label', text: 'Intercambiar posición con' }));
        parent.appendChild(destinationControl(rule, action));
        break;
      }
      case 'approach': {
        parent.appendChild(el('span', { class: 'micro-label', text: 'Acercarse al objeto' }));
        parent.appendChild(destinationControl(rule, action));
        const r = el('div', { class: 'rule-inline', style: { marginTop: '5px' } });
        r.appendChild(el('span', { class: 'micro-label', style: { margin: 0 }, text: 'Distancia' }));
        r.appendChild(mkNum(action.distance, (v) => { action.distance = U.clamp(v, 0, 1200); commit(); renderAll(); }, { cls: 'num', min: 0, max: 1200 }));
        r.appendChild(el('span', { class: 'unit', text: 'px' }));
        parent.appendChild(r);
        parent.appendChild(el('div', { class: 'rule-inline', style: { marginTop: '5px' } }, [
          el('span', { class: 'micro-label', style: { margin: 0 }, text: 'Velocidad' }),
          speedSelect(action, 3)
        ]));
        break;
      }
      case 'lose':
        parent.appendChild(el('p', { class: 'field-note', text: 'Marca la partida como perdida. El microjuego continúa hasta que acabe el tiempo y mostrará el resultado final.' }));
        break;
      case 'sound': {
        const sounds = Object.keys(MI.audio.SOUNDS).map(k => ({ value: k, label: MI.audio.SOUNDS[k] }));
        const row = el('div', { class: 'rule-inline' });
        row.appendChild(mkSelect(sounds, action.soundId, (v) => {
          action.soundId = v; commit(); renderAll();
        }));
        row.appendChild(el('button', {
          class: 'mini-btn', type: 'button', text: '▶', title: 'Escuchar sonido',
          onclick: () => MI.audio.sfx(action.soundId)
        }));
        parent.appendChild(row);
        break;
      }
      case 'switch': {
        const opts = [{ value: 'self', label: 'Este objeto' }].concat(state.game.objects.map(o => ({ value: o.id, label: o.name })));
        parent.appendChild(el('span', { class: 'micro-label', text: 'Interruptor de' }));
        parent.appendChild(mkSelect(opts, action.objectId || 'self', (v) => {
          action.objectId = v; commit(); renderAll();
        }));
        parent.appendChild(mkSelect([
          { value: 'on', label: 'Cambiar interruptor a ON' },
          { value: 'off', label: 'Cambiar interruptor a OFF' }
        ], action.value ? 'on' : 'off', (v) => {
          action.value = v === 'on'; commit(); renderAll();
        }, '', 'Nuevo estado del interruptor'));
        break;
      }
      case 'invisible': {
        parent.appendChild(mkSelect([
          { value: 'hide', label: 'Ocultar el objeto' },
          { value: 'show', label: 'Volver a mostrar el objeto' }
        ], action.value === false ? 'show' : 'hide', (v) => {
          action.value = v !== 'show';
          commit(); renderAll();
        }));
        parent.appendChild(el('p', { class: 'field-note', text: 'Mientras está invisible no se puede tocar ni recibe movimientos ni cambios de animación. Su interruptor ON/OFF se conserva.' }));
        break;
      }
      case 'text': {
        const area = el('textarea', { class: 'textarea', rows: '2', maxlength: '80', placeholder: 'Texto que aparece en el escenario' });
        area.value = action.text || '';
        area.addEventListener('input', () => { action.text = area.value; });
        area.addEventListener('change', () => { action.text = area.value.slice(0, 80); commit(); });
        parent.appendChild(el('span', { class: 'micro-label', text: 'Texto' }));
        parent.appendChild(area);
        const styleRow = el('div', { class: 'rule-inline', style: { marginTop: '5px' } });
        styleRow.appendChild(mkSelect(MI.FONTS.map(f => ({ value: f.value, label: f.label })), action.font, (v) => {
          action.font = v; commit(); renderAll();
        }));
        styleRow.appendChild(mkNum(action.size, (v) => {
          action.size = U.clamp(v, 10, 160); commit(); renderAll();
        }, { cls: 'num', min: 10, max: 160, fallback: 56 }));
        styleRow.appendChild(el('span', { class: 'unit', text: 'px' }));
        parent.appendChild(styleRow);
        const alignRow = el('div', { class: 'rule-inline', style: { marginTop: '5px' } });
        alignRow.appendChild(mkSelect(MI.TEXT_ALIGNS, action.align, (v) => {
          action.align = v; commit(); renderAll();
        }));
        alignRow.appendChild(el('input', {
          type: 'color', class: 'input', title: 'Color del texto', value: action.color,
          style: { flex: '0 0 40px', padding: '2px' },
          onchange: (e) => { action.color = e.target.value; commit(); renderAll(); }
        }));
        parent.appendChild(alignRow);
        parent.appendChild(el('span', { class: 'micro-label', text: 'Punto de aparición (centro)' }));
        parent.appendChild(pointControl(rule, action, 'centro del texto'));
        parent.appendChild(el('div', { class: 'rule-inline', style: { marginTop: '5px' } }, [
          el('span', { class: 'micro-label', style: { margin: 0 }, text: 'Duración' }),
          mkNum(action.duration, (v) => { action.duration = U.clamp(v, 0, 10000); commit(); renderAll(); }, { cls: 'num', min: 0, max: 10000, fallback: 1600 }),
          el('span', { class: 'unit', text: 'ms' })
        ]));
        parent.appendChild(el('p', { class: 'field-note', text: '0 ms mantiene el texto hasta el final del microjuego.' }));
        break;
      }
      case 'anim': {
        parent.appendChild(mkSelect([
          { value: 'set', label: 'Cambiar a una animación' },
          { value: 'stop', label: 'Detener animación' }
        ], action.mode, (v) => {
          action.mode = v; commit(); renderAll();
        }));
        if (action.mode !== 'stop') {
          const targetObj = action.target === 'self' ? objById(rule.subject) : objById(action.target);
          parent.appendChild(mkSelect(animationOptions(targetObj), action.animation != null ? action.animation : 0, (v) => {
            action.animation = Number(v);
            action.frame = 0;
            commit(); renderAll();
          }, '', 'Animación del objeto'));
          parent.appendChild(mkSelect(cellOptions(), action.frame, (v) => {
            action.frame = Number(v); commit(); renderAll();
          }, '', 'Celda de la animación'));
        }
        break;
      }
      case 'effect': {
        parent.appendChild(mkSelect([
          { value: 'flash', label: 'Destello (pantalla blanca)' },
          { value: 'confetti', label: 'Confeti' },
          { value: 'shake', label: 'Temblor' },
          { value: 'freeze', label: 'Congelar (invierte colores y bloquea toques)' }
        ], action.effect, (v) => {
          action.effect = v; commit(); renderAll();
        }));
        if (action.effect !== 'confetti' && action.effect !== 'freeze') {
          parent.appendChild(el('div', { class: 'rule-inline', style: { marginTop: '4px' } }, [
            el('span', { class: 'micro-label', style: { margin: 0 }, text: 'Duración' }),
            mkNum(action.duration, (v) => { action.duration = U.clamp(v, 100, 5000); commit(); renderAll(); }, { cls: 'num', min: 100, max: 5000, fallback: 500 }),
            el('span', { class: 'unit', text: 'ms' })
          ]));
        }
        if (action.effect === 'freeze') {
          parent.appendChild(el('p', { class: 'field-note', text: 'Congelar permanente: no se puede tocar el escenario y los colores se inverten hasta que termine el tiempo del microjuego. Suena «Derrota» al activarse.' }));
        }
        break;
      }
    }
  }

})();
