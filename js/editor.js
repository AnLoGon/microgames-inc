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
    animFrame: 0,
    frameClipboard: null,
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
      : 'Arrastra los objetos para colocarlos. Haz clic en un objeto o zona para editarlo.');
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

  function frameFor(o) {
    const fps = Math.max(1, o.fps || 6);
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
      const frame = frameFor(o);
      ctx.save();
      if (!o.visible) ctx.globalAlpha = 0.32;
      MI.sprites.draw(ctx, o.anims[frame] || o.anims[0], o.x, o.y, o.w, o.h);
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
    drawZones(ctx);
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
    const s = Math.min(size - 12, size - 12);
    MI.sprites.draw(ctx, obj.anims[frame] || obj.anims[0], (size - s) / 2, (size - s) / 2, s, s);
  }

  /* ----------------------------- puntero ----------------------------- */
  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    if (!state.game) return;
    const p = stageCoords(e);
    const canvas = e.currentTarget;
    canvas.focus({ preventScroll: true });
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
      z.x = Math.round(d.ox + (p.x - d.startX));
      z.y = Math.round(d.oy + (p.y - d.startY));
      d.moved = true;
      drawStage();
    } else if (d.kind === 'zoneResize') {
      const z = zoneById(d.zoneId);
      if (!z) return;
      z.w = Math.max(MIN_ZONE, Math.round(d.ow + (p.x - d.startX)));
      z.h = Math.max(MIN_ZONE, Math.round(d.oh + (p.y - d.startY)));
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
      const rect = U.rectFromPoints(drag.x0, drag.y0, drag.x1, drag.y1);
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
      const rect = U.rectFromPoints(drag.x0, drag.y0, drag.x1, drag.y1);
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
    state.selectedObjectId = id;
    state.selectedZoneId = null;
    if (state.tab !== 'object' && state.tab !== 'anim') state.tab = 'object';
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
      MI.sprites.thumb(c, o.anims[0]);
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
      const t = rule.trigger;
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
    $('#snap-grid').addEventListener('change', (e) => { state.snap = e.target.checked; });
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
    MI.sprites.thumb(pc, obj.anims[0]);
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
    addField(body, 'Velocidad de animación (fps)', mkNum(obj.fps, (v) => {
      obj.fps = U.clamp(v, 1, 30); commit(); renderAll();
    }, { min: 1, max: 30 }), 'Cada objeto recorre sus 4 celdas de animación en bucle.');

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
        el('p', { text: 'Selecciona un objeto para editar sus 4 celdas de animación.' })
      ]));
      return;
    }

    const box = el('div', { class: 'obj-preview-row' });
    const prev = el('div', { class: 'obj-preview-big', style: { width: '96px', height: '96px' } });
    const pc = el('canvas', { width: 128, height: 128, style: { width: '88px', height: '88px' } });
    prev.appendChild(pc);
    box.appendChild(prev);
    const info = el('div', { style: { flex: '1' } });
    info.appendChild(el('div', { class: 'micro-label', text: obj.name }));
    info.appendChild(el('p', { class: 'field-note', text: '4 celdas editables. La animación recorre las celdas en bucle.' }));
    info.appendChild(el('p', { class: 'field-note', text: 'Celda actual: ' + (state.animFrame + 1) + ' · ' + obj.fps + ' fps' }));
    box.appendChild(info);
    body.appendChild(box);
    state.animPreview = { canvas: pc, objectId: obj.id };

    section(body, 'Celdas de animación');
    const grid = el('div', { class: 'frame-grid' });
    for (let i = 0; i < 4; i++) {
      const cell = el('button', { class: 'frame-cell' + (i === state.animFrame ? ' active' : ''), title: 'Editar celda ' + (i + 1), type: 'button' });
      const c = el('canvas', { width: 16, height: 16 });
      MI.sprites.thumb(c, obj.anims[i]);
      cell.appendChild(c);
      cell.appendChild(el('span', { class: 'frame-num', text: String(i + 1) }));
      cell.appendChild(el('span', { class: 'frame-edit', text: '✎' }));
      cell.addEventListener('click', () => {
        state.animFrame = i;
        openPixelEditor(obj.id, i);
      });
      grid.appendChild(cell);
    }
    body.appendChild(grid);

    addField(body, 'Velocidad (fps)', mkNum(obj.fps, (v) => {
      obj.fps = U.clamp(v, 1, 30); commit(); renderAll();
    }, { min: 1, max: 30 }), 'Más fps = animación más rápida.');

    const ops = el('div', { class: 'btn-row' });
    ops.appendChild(smallBtn('⧉ Copiar celda', () => {
      state.frameClipboard = obj.anims[state.animFrame];
      MI.toast('Celda copiada', 'ok');
    }));
    ops.appendChild(smallBtn('📋 Pegar', () => {
      if (!state.frameClipboard) { MI.toast('No hay ninguna celda copiada', 'err'); return; }
      obj.anims[state.animFrame] = state.frameClipboard;
      commit(); renderAll();
    }));
    body.appendChild(ops);
    const ops2 = el('div', { class: 'btn-row', style: { marginTop: '5px' } });
    ops2.appendChild(smallBtn('↔ Copiar a las 4', () => {
      for (let i = 0; i < 4; i++) obj.anims[i] = obj.anims[state.animFrame];
      commit(); renderAll();
      MI.toast('Animación copiada a las 4 celdas', 'ok');
    }));
    ops2.appendChild(smallBtn('⌫ Limpiar', () => {
      obj.anims[state.animFrame] = MI.sprites.empty();
      commit(); renderAll();
    }));
    body.appendChild(ops2);

    body.appendChild(el('p', { class: 'field-note', text: 'Haz clic en cualquier celda para abrir el editor de píxeles.' }));

    section(body, 'Librería de sprites');
    const lib = el('div', { class: 'sprite-lib' });
    MI.sprites.keys().forEach(key => {
      const b = el('button', { type: 'button', title: MI.sprites.DISPLAY_NAMES[key] || key });
      const c = el('canvas', { width: 16, height: 16 });
      MI.sprites.thumb(c, MI.sprites.preset(key));
      b.appendChild(c);
      b.addEventListener('click', () => {
        obj.anims[state.animFrame] = MI.sprites.preset(key);
        commit(); renderAll();
        MI.toast('Sprite aplicado a la celda ' + (state.animFrame + 1), 'ok');
      });
      lib.appendChild(b);
    });
    body.appendChild(lib);

    body.appendChild(el('div', { style: { marginTop: '10px' } }, [
      smallBtn('🎨 Abrir editor de píxeles', () => openPixelEditor(obj.id, state.animFrame), 'btn-cyan')
    ]));
  }

  function openPixelEditor(objId, frame) {
    const obj = objById(objId);
    if (!obj) return;
    MI.pixelEditor.open(obj, frame, (changed) => {
      if (changed) { commit(); renderAll(); }
    });
  }

  /* ----------------------------- pestaña JUEGO ----------------------------- */
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

    section(body, 'Objetivo de victoria');
    addField(body, '¿Cómo se gana?', mkSelect(Object.keys(MI.GOALS).map(k => ({ value: k, label: MI.GOALS[k] })), state.game.goal.type, (v) => {
      state.game.goal.type = v;
      if (v === 'switch' || v === 'touch' || v === 'reach') {
        if (!objById(state.game.goal.objectId)) state.game.goal.objectId = state.game.objects[0] ? state.game.objects[0].id : null;
      }
      if (v === 'reach' && !zoneById(state.game.goal.zoneId) && state.game.zones[0]) {
        state.game.goal.zoneId = state.game.zones[0].id;
      }
      commit(); renderAll();
    }), state.game.goal.type === 'survive'
      ? 'Sobrevive hasta que se acabe el tiempo sin activar ninguna derrota.'
      : 'La partida sigue hasta el final del tiempo; este objetivo determina si ganas.');

    if (state.game.goal.type !== 'survive') {
      addField(body, 'Objeto del objetivo', mkSelect(state.game.objects.map(o => ({ value: o.id, label: o.name })), state.game.goal.objectId, (v) => {
        state.game.goal.objectId = v; commit(); renderAll();
      }));
    }
    if (state.game.goal.type === 'reach') {
      if (!state.game.zones.length) {
        body.appendChild(el('p', { class: 'field-note', text: 'Necesitas una zona de meta.' }));
        body.appendChild(smallBtn('Crear zona de meta', () => {
          const z = createZone({ x: 0, y: 24, w: MI.W, h: 120 }, 'Meta');
          state.game.goal.zoneId = z.id;
          commit(); renderAll();
        }, 'btn-cyan'));
      } else {
        addField(body, 'Zona de meta', mkSelect(state.game.zones.map(z => ({ value: z.id, label: z.name })), state.game.goal.zoneId, (v) => {
          state.game.goal.zoneId = v; commit(); renderAll();
        }));
      }
    }

    section(body, 'Resumen');
    const stats = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' } });
    [
      ['📦 Objetos', state.game.objects.length],
      ['🧠 Reglas', state.game.rules.length],
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
    body.appendChild(el('p', { class: 'field-note', style: { marginBottom: '10px' }, text: 'Elige un sprite para el nuevo objeto. Después podrás editar sus 4 celdas píxel a píxel.' }));
    const grid = el('div', { class: 'sprite-lib', style: { gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' } });
    MI.sprites.keys().forEach(key => {
      const b = el('button', { type: 'button', title: MI.sprites.DISPLAY_NAMES[key] || key, style: { padding: '4px' } });
      const c = el('canvas', { width: 32, height: 32, style: { width: '44px', height: '44px' } });
      MI.sprites.thumb(c, MI.sprites.preset(key));
      b.appendChild(c);
      b.appendChild(el('span', { style: { display: 'block', fontSize: '8px', fontWeight: '800', marginTop: '2px' }, text: MI.sprites.DISPLAY_NAMES[key] || key }));
      b.addEventListener('click', () => { addObjectFromPreset(key); MI.modal.close(); });
      grid.appendChild(b);
    });
    body.appendChild(grid);
    body.appendChild(el('div', { style: { marginTop: '12px' } }, [
      smallBtn('▢ Lienzo vacío (dibujar desde cero)', () => {
        addObjectFromPreset('slime', true);
        MI.modal.close();
      }, 'btn-paper')
    ]));
    MI.modal.open({
      title: 'Añadir objeto', wide: true, body,
      footer: [{ label: 'Cancelar', className: 'btn-paper' }]
    });
  }
  E.openAddObject = openAddObject;

  function addObjectFromPreset(key, empty) {
    const baseName = empty ? 'Objeto' : (MI.sprites.DISPLAY_NAMES[key] || 'Objeto');
    let name = baseName, n = 2;
    while (state.game.objects.some(o => o.name === name)) { name = baseName + ' ' + n; n++; }
    const offset = (state.game.objects.length % 4) * 32;
    const obj = MI.sprites.makeObject(name, key, {
      x: U.clamp((MI.W - 96) / 2 + offset, 16, MI.W - 112),
      y: U.clamp((MI.H - 96) / 2 + offset, 16, MI.H - 112),
      w: 96, h: 96
    });
    if (empty) obj.anims = [MI.sprites.empty(), MI.sprites.empty(), MI.sprites.empty(), MI.sprites.empty()];
    state.game.objects.push(obj);
    state.selectedObjectId = obj.id;
    state.selectedZoneId = null;
    state.animFrame = 0;
    state.tab = 'object';
    MI.$$('#inspector-tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'object'));
    commit(); renderAll();
    MI.audio.sfx('power');
    MI.toast('Objeto «' + name + '» añadido', 'ok');
  }

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
    if (state.game.goal.objectId === id) {
      state.game.goal.objectId = null;
      state.game.goal.type = 'survive';
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
    state.game.rules = state.game.rules.filter(r =>
      r.trigger.zoneId !== id && !r.actions.some(a => a.zoneId === id)
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
  function fixGoal() {
    const g = state.game;
    if (!g.goal) g.goal = { type: 'survive', objectId: null, zoneId: null };
    if (['switch', 'touch', 'reach'].indexOf(g.goal.type) >= 0) {
      if (!objById(g.goal.objectId)) g.goal.type = 'survive';
      if (g.goal.type === 'reach' && !zoneById(g.goal.zoneId)) g.goal.type = 'survive';
    }
    if (g.goal.type === 'survive') { g.goal.objectId = null; g.goal.zoneId = null; }
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
    MI.player.open(U.deepClone(state.game), { mode: 'preview', from: 'editor' });
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
          <p>Pulsa <strong>＋</strong> en el panel de objetos y elige un sprite. Arrástralo por el escenario. Puedes hacerlo aparecer en un punto fijo o en una zona aleatoria que tú dibujes.</p>
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
          <p>En <strong>Juego</strong> decides cómo se gana: sobrevivir, activar un interruptor, tocar un objeto o llevar un objeto a una zona. El microjuego siempre termina al acabar el tiempo, ¡ganes o pierdas!</p>
        </div>
      </div>
      <h3 style="font-family:var(--font-display);font-size:13px;margin:16px 0 7px">Activadores</h3>
      <div class="help-grid">
        <div class="help-card trigger"><h3>Tocar</h3><p>Este objeto o cualquier punto del escenario. Ideal para interacción directa con el ratón o el dedo.</p></div>
        <div class="help-card trigger"><h3>Contacto</h3><p>Tocar (bordes) u solaparse (superposición) con otro objeto o con una zona.</p></div>
        <div class="help-card trigger"><h3>Animación</h3><p>Cuando el objeto muestra una celda concreta o cuando completa un ciclo de sus 4 celdas.</p></div>
        <div class="help-card trigger"><h3>Interruptor</h3><p>Cuando un objeto pasa a ON/OFF o mientras está ON/OFF. Todos empiezan en OFF.</p></div>
        <div class="help-card trigger"><h3>Tiempo</h3><p>En un punto exacto del tiempo total o durante un intervalo.</p></div>
        <div class="help-card trigger"><h3>Victoria / derrota</h3><p>En el instante de ganar, después de ganar, antes de ganar, o lo mismo con la derrota.</p></div>
      </div>
      <h3 style="font-family:var(--font-display);font-size:13px;margin:16px 0 7px">Acciones</h3>
      <div class="help-grid">
        <div class="help-card action"><h3>Movimiento</h3><p>Línea recta en 8 direcciones, hacia un punto u otro objeto, saltos, deambular (meneo, bola de billar, moscardón, balón), detenerse, cambiar posiciones y acercarse a otro objeto.</p></div>
        <div class="help-card action"><h3>Estado y efectos</h3><p>Derrota, sonido, interruptor ON/OFF, cambiar o detener animación, destello, confeti, temblor y congelar.</p></div>
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
    const head = el('div', { class: 'logic-head' }, [
      el('h3', {}, [
        document.createTextNode('Lógica del juego'),
        el('span', { class: 'count', text: String(state.game.rules.length) })
      ]),
      smallBtn('＋ Nueva regla', () => addRule(), 'btn-primary')
    ]);
    body.appendChild(head);
    body.appendChild(el('p', { class: 'field-note', style: { marginBottom: '10px' }, text: 'Cada regla se lee: cuando ocurre el activador → se ejecutan las acciones. El orden importa.' }));

    if (!state.game.rules.length) {
      body.appendChild(el('div', { class: 'empty-logic' }, [
        el('div', { class: 'big', text: '🧠' }),
        el('h4', { text: 'Todavía no hay reglas' }),
        el('p', { text: 'Crea una regla como «Tocar este objeto → activar interruptor» o «Tiempo en 2 s → mover objeto».' }),
        smallBtn('＋ Crear mi primera regla', () => addRule(), 'btn-primary')
      ]));
      return;
    }

    const list = el('div', { class: 'rules' });
    state.game.rules.forEach((rule, i) => list.appendChild(renderRuleCard(rule, i)));
    body.appendChild(list);
    body.appendChild(el('p', { class: 'field-note', style: { marginTop: '10px' }, text: 'Todos los interruptores empiezan en OFF. El microjuego termina al agotarse el tiempo aunque ya hayas ganado o perdido.' }));
  }

  function renderRuleCard(rule, index) {
    const card = el('div', { class: 'rule-card' + (rule.enabled ? '' : ' disabled'), dataset: { ruleId: rule.id } });
    const needs = requiresSubject(rule.trigger);

    const top = el('div', { class: 'rule-top' });
    top.appendChild(el('span', { class: 'rule-index', text: '#' + (index + 1) }));
    const subjOpts = [{ value: 'stage', label: '🌐 Escenario', disabled: needs }]
      .concat(state.game.objects.map(o => ({ value: o.id, label: o.name })));
    const subj = mkSelect(subjOpts, rule.subject, (v) => {
      rule.subject = v;
      if (v === 'stage' && requiresSubject(rule.trigger)) {
        rule.trigger = { type: 'time', mode: 'point', at: Math.round((state.game.duration || 4000) / 2) };
      }
      commit(); renderAll();
    }, '', 'Objeto que recibe el activador');
    subj.classList.add('rule-owner');
    top.appendChild(subj);
    const en = el('input', { type: 'checkbox', checked: rule.enabled, title: 'Activar / desactivar regla', style: { accentColor: 'var(--lime)' } });
    en.addEventListener('change', () => { rule.enabled = en.checked; commit(); renderAll(); });
    top.appendChild(en);
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

    /* ------------------------- activador ------------------------- */
    const trigBlock = el('div', { class: 'rule-block trigger-block' });
    trigBlock.appendChild(el('div', { class: 'block-label' }, [
      el('span', { text: 'Cuando…' }),
      el('span', { text: 'ACTIVADOR' })
    ]));
    const typeOpts = Object.keys(TRIGGER_LABELS).map(k => ({ value: k, label: TRIGGER_LABELS[k] }));
    trigBlock.appendChild(mkSelect(typeOpts, rule.trigger.type, (v) => {
      rule.trigger = defaultTrigger(v, rule.subject);
      if (requiresSubject(rule.trigger) && rule.subject === 'stage') {
        const first = state.game.objects[0];
        if (first) rule.subject = first.id;
      }
      commit(); renderAll();
    }));
    const sub = el('div', { class: 'rule-sub' });
    renderTriggerFields(rule, sub, needs);
    trigBlock.appendChild(sub);
    body.appendChild(trigBlock);

    /* ------------------------- acciones ------------------------- */
    const actBlock = el('div', { class: 'rule-block action-block' });
    actBlock.appendChild(el('div', { class: 'block-label' }, [
      el('span', { text: 'Entonces…' }),
      el('span', { text: 'ACCIONES' })
    ]));
    const actionsList = el('div', { class: 'rule-actions-list' });
    rule.actions.forEach((action) => actionsList.appendChild(renderActionRow(rule, action)));
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
    if ((rule.trigger.type === 'touch' || rule.trigger.type === 'overlap')) {
      if (rule.trigger.mode === 'object' && !objById(rule.trigger.objectId)) {
        card.appendChild(el('p', { class: 'rule-warn', text: '⚠ Elige otro objeto para el contacto.' }));
      }
      if (rule.trigger.mode === 'zone' && !zoneById(rule.trigger.zoneId)) {
        card.appendChild(el('p', { class: 'rule-warn', text: '⚠ Dibuja o elige una zona para el contacto.' }));
      }
    }
    if (rule.trigger.type === 'anim' && rule.subject === 'stage') {
      card.appendChild(el('p', { class: 'rule-warn', text: '⚠ Selecciona el objeto cuya animación quieres escuchar.' }));
    }
    return card;
  }

  function defaultTrigger(type, subject) {
    const other = firstOtherId(subject);
    const zoneId = state.game.zones[0] ? state.game.zones[0].id : null;
    switch (type) {
      case 'tap': return { type: 'tap', where: subject === 'stage' ? 'stage' : 'self' };
      case 'touch': return { type: 'touch', mode: other ? 'object' : 'zone', objectId: other, zoneId };
      case 'overlap': return { type: 'overlap', mode: other ? 'object' : 'zone', objectId: other, zoneId };
      case 'anim': return { type: 'anim', mode: 'specific', frame: 0 };
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
      case 'moveDir': return Object.assign(base, { dir: 0, speed: 240 });
      case 'moveRandom': return Object.assign(base, { speed: 240 });
      case 'moveTo': return Object.assign(base, { x: MI.W / 2, y: MI.H / 2, speed: 240 });
      case 'moveFrom': return Object.assign(base, { fromMode: 'point', x: MI.W / 2, y: 40, fromObjectId: other, speed: 240 });
      case 'jumpPoint': return Object.assign(base, { x: MI.W / 2, y: MI.H / 2 });
      case 'jumpZone': return Object.assign(base, { zoneId: zoneId || ensureZoneSilent(), avoid: false });
      case 'jumpObject':
        if (!other) return null;
        return Object.assign(base, { objectId: other });
      case 'wander': return Object.assign(base, { mode: 'wobble', zoneId: zoneId || ensureZoneSilent(), avoid: false, speed: 200 });
      case 'stop': return base;
      case 'swap':
        if (!other) return null;
        return Object.assign(base, { objectId: other });
      case 'approach':
        if (!other) return null;
        return Object.assign(base, { objectId: other, distance: 0, speed: 240 });
      case 'lose': return { type: 'lose' };
      case 'sound': return { type: 'sound', soundId: 'blip' };
      case 'switch': return Object.assign(base, { objectId: 'self', value: true });
      case 'anim': return Object.assign(base, { mode: 'set', frame: 0 });
      case 'effect': return { type: 'effect', effect: 'flash', duration: 500 };
      default: return { type: 'sound', soundId: 'blip' };
    }
  }

  /* ------------------------- campos del activador ------------------------- */
  function renderTriggerFields(rule, parent, needs) {
    const t = rule.trigger;
    const objects = state.game.objects;
    const currentSubject = rule.subject;

    if (t.type === 'tap') {
      parent.appendChild(mkSelect([
        { value: 'self', label: 'Este objeto' },
        { value: 'stage', label: 'Cualquier punto del escenario' }
      ], t.where, (v) => {
        rule.trigger.where = v;
        if (v === 'self' && rule.subject === 'stage' && objects[0]) rule.subject = objects[0].id;
        commit(); renderAll();
      }));

    } else if (t.type === 'touch' || t.type === 'overlap') {
      const others = otherObjects(currentSubject);
      parent.appendChild(mkSelect([
        { value: 'object', label: 'Otro objeto', disabled: !others.length },
        { value: 'zone', label: 'Una zona', disabled: !state.game.zones.length }
      ], t.mode, (v) => {
        rule.trigger.mode = v;
        if (v === 'object') rule.trigger.objectId = others[0] ? others[0].id : null;
        if (v === 'zone') rule.trigger.zoneId = state.game.zones[0] ? state.game.zones[0].id : null;
        commit(); renderAll();
      }));
      if (t.mode === 'object') {
        if (!others.length) {
          parent.appendChild(el('p', { class: 'field-note', text: 'No hay otros objetos para elegir. Esta opción está desactivada.' }));
        } else {
          parent.appendChild(mkSelect(others.map(o => ({ value: o.id, label: o.name })), t.objectId, (v) => {
            rule.trigger.objectId = v; commit(); renderAll();
          }));
        }
      } else {
        parent.appendChild(zonePicker(t.zoneId, (id) => { rule.trigger.zoneId = id; }));
        parent.appendChild(el('p', { class: 'field-note', text: t.type === 'touch' ? 'Se activa al tocar el borde de la zona.' : 'Se activa al solaparse con la zona.' }));
      }

    } else if (t.type === 'anim') {
      parent.appendChild(mkSelect([
        { value: 'specific', label: 'Se muestra una animación concreta' },
        { value: 'end', label: 'Si la animación finaliza' }
      ], t.mode, (v) => {
        rule.trigger.mode = v; commit(); renderAll();
      }));
      if (t.mode === 'specific') {
        parent.appendChild(mkSelect([0, 1, 2, 3].map(i => ({ value: i, label: 'Celda ' + (i + 1) })), t.frame, (v) => {
          rule.trigger.frame = Number(v); commit(); renderAll();
        }));
      }

    } else if (t.type === 'time') {
      parent.appendChild(mkSelect([
        { value: 'point', label: 'En un punto del tiempo' },
        { value: 'interval', label: 'Durante un intervalo' }
      ], t.mode, (v) => {
        rule.trigger.mode = v; commit(); renderAll();
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
        rule.trigger.objectId = v; commit(); renderAll();
      }));
      parent.appendChild(mkSelect([
        { value: 'turnOn', label: 'El interruptor pasa a ON' },
        { value: 'isOn', label: 'El interruptor está ON' },
        { value: 'turnOff', label: 'El interruptor pasa a OFF' },
        { value: 'isOff', label: 'El interruptor está OFF' }
      ], t.mode, (v) => {
        rule.trigger.mode = v; commit(); renderAll();
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
        rule.trigger.mode = v; commit(); renderAll();
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

  function renderActionRow(rule, action) {
    const wrap = el('div', { class: 'action-item' });
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
    wrap.appendChild(el('button', {
      class: 'action-del', type: 'button', text: '✕', title: 'Quitar acción',
      onclick: () => {
        const i = rule.actions.indexOf(action);
        if (i >= 0) rule.actions.splice(i, 1);
        commit(); renderAll();
      }
    }));
    return wrap;
  }

  function actorWarning(rule, action, parent) {
    if (action.target === 'self' && rule.subject === 'stage') {
      parent.appendChild(el('p', { class: 'rule-warn', style: { padding: 0 }, text: '⚠ Elige un objeto para esta acción.' }));
    }
  }

  function renderActionFields(rule, action, parent) {
    const t = action.type;

    if (t !== 'lose' && t !== 'sound' && t !== 'effect') {
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
          mkNum(action.speed, (v) => { action.speed = U.clamp(v, 16, 1600); commit(); renderAll(); }, { cls: 'num', min: 16, max: 1600, fallback: 240 }),
          el('span', { class: 'unit', text: 'px/s' })
        ]));
        break;
      }
      case 'moveRandom': {
        parent.appendChild(el('div', { class: 'rule-inline' }, [
          el('span', { class: 'micro-label', style: { margin: 0 }, text: 'Velocidad' }),
          mkNum(action.speed, (v) => { action.speed = U.clamp(v, 16, 1600); commit(); renderAll(); }, { cls: 'num', min: 16, max: 1600, fallback: 240 }),
          el('span', { class: 'unit', text: 'px/s' })
        ]));
        parent.appendChild(el('p', { class: 'field-note', text: 'Dirección al azar entre las 8 posibles.' }));
        break;
      }
      case 'moveTo': {
        parent.appendChild(el('span', { class: 'micro-label', text: 'Punto de destino (centro)' }));
        parent.appendChild(pointControl(rule, action));
        parent.appendChild(el('div', { class: 'rule-inline', style: { marginTop: '5px' } }, [
          el('span', { class: 'micro-label', style: { margin: 0 }, text: 'Velocidad' }),
          mkNum(action.speed, (v) => { action.speed = U.clamp(v, 16, 1600); commit(); renderAll(); }, { cls: 'num', min: 16, max: 1600, fallback: 240 }),
          el('span', { class: 'unit', text: 'px/s' })
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
          mkNum(action.speed, (v) => { action.speed = U.clamp(v, 16, 1600); commit(); renderAll(); }, { cls: 'num', min: 16, max: 1600, fallback: 240 }),
          el('span', { class: 'unit', text: 'px/s' })
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
          mkNum(action.speed, (v) => { action.speed = U.clamp(v, 24, 1200); commit(); renderAll(); }, { cls: 'num', min: 24, max: 1200, fallback: 200 }),
          el('span', { class: 'unit', text: 'px/s' })
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
        r.appendChild(mkNum(action.speed, (v) => { action.speed = U.clamp(v, 16, 1200); commit(); renderAll(); }, { cls: 'num', min: 16, max: 1200, fallback: 240 }));
        r.appendChild(el('span', { class: 'unit', text: 'px/s' }));
        parent.appendChild(r);
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
      case 'anim': {
        parent.appendChild(mkSelect([
          { value: 'set', label: 'Cambiar a una animación' },
          { value: 'stop', label: 'Detener animación' }
        ], action.mode, (v) => {
          action.mode = v; commit(); renderAll();
        }));
        if (action.mode !== 'stop') {
          parent.appendChild(mkSelect([0, 1, 2, 3].map(i => ({ value: i, label: 'Celda ' + (i + 1) })), action.frame, (v) => {
            action.frame = Number(v); commit(); renderAll();
          }));
        }
        break;
      }
      case 'effect': {
        parent.appendChild(mkSelect([
          { value: 'flash', label: 'Destello (pantalla blanca)' },
          { value: 'confetti', label: 'Confeti' },
          { value: 'shake', label: 'Temblor' },
          { value: 'freeze', label: 'Congelar objetos y reloj' }
        ], action.effect, (v) => {
          action.effect = v; commit(); renderAll();
        }));
        if (action.effect !== 'confetti') {
          parent.appendChild(el('div', { class: 'rule-inline', style: { marginTop: '4px' } }, [
            el('span', { class: 'micro-label', style: { margin: 0 }, text: 'Duración' }),
            mkNum(action.duration, (v) => { action.duration = U.clamp(v, 100, 5000); commit(); renderAll(); }, { cls: 'num', min: 100, max: 5000, fallback: 500 }),
            el('span', { class: 'unit', text: 'ms' })
          ]));
        }
        break;
      }
    }
  }

})();
