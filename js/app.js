/* ============================================================
   MICROGAMES INC. — app.js
   Navegación, menú, galería, borradores e importación
   ============================================================ */
(function () {
  'use strict';

  const MI = window.MI;
  const U = MI.util;
  const $ = MI.$;
  const A = MI.app = {};

  const state = {
    screen: 'menu',
    filter: 'all',
    menuRaf: 0,
    menuLast: 0,
    menuTime: 0,
    fileInput: null
  };

  function node(id) { return document.getElementById(id); }

  /* ============================================================
     NAVEGACIÓN
     ============================================================ */
  A.showScreen = function (name) {
    if (!name) name = 'menu';
    state.screen = name;
    MI.$$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    document.body.dataset.screen = name;
    try { window.scrollTo(0, 0); } catch (e) { /* noop */ }

    if (name === 'menu') {
      refreshDraftButton();
      startMenuArt();
    } else {
      stopMenuArt();
    }
    if (name === 'gallery') renderGallery();
  };

  A.showGallery = function (filter) {
    state.filter = filter || 'all';
    A.showScreen('gallery');
  };

  /* ============================================================
     MENÚ
     ============================================================ */
  function renderMenuExamples() {
    const row = node('menu-examples');
    if (!row) return;
    row.innerHTML = '';

    (MI.EXAMPLES || []).forEach(game => {
      const wrap = MI.el('div', { class: 'example-wrap' });
      const card = MI.el('button', {
        class: 'example-card',
        type: 'button',
        title: 'Jugar «' + game.name + '»',
        'aria-label': 'Jugar ' + game.name,
        onclick: () => playGame(game, 'menu')
      });

      const thumb = MI.el('div', { class: 'example-thumb' });
      const canvas = MI.el('canvas', { width: 320, height: 180 });
      thumb.appendChild(canvas);
      MI.sprites.renderGameThumb(canvas, game);

      const meta = MI.el('div', { class: 'example-meta' }, [
        MI.el('div', { class: 'example-name', text: game.name }),
        MI.el('span', { class: 'example-tag', text: shortDuration(game.duration) + ' · ' + shortGoal(game) })
      ]);

      const play = MI.el('span', { class: 'example-play', text: '▶' });
      play.style.pointerEvents = 'none';

      card.appendChild(thumb);
      card.appendChild(meta);
      wrap.appendChild(card);
      wrap.appendChild(play);
      row.appendChild(wrap);
    });
  }

  function refreshDraftButton() {
    const actions = $('.menu-actions');
    if (!actions) return;
    let btn = node('btn-resume-draft');
    const draft = MI.store.getDraft();

    if (!draft || !draft.game) {
      if (btn) btn.remove();
      return;
    }

    if (!btn) {
      btn = MI.el('button', { class: 'btn btn-cyan btn-xl', id: 'btn-resume-draft', type: 'button' });
      btn.addEventListener('click', resumeDraft);
      const newBtn = node('btn-new');
      if (newBtn && newBtn.parentNode === actions) actions.insertBefore(btn, newBtn.nextSibling);
      else actions.appendChild(btn);
    }

    const name = String(draft.game.name || 'Borrador').slice(0, 24);
    btn.textContent = '📝 Continuar «' + name + '»';
    btn.title = draft.savedId ? 'Borrador de un microjuego guardado' : 'Borrador sin guardar';
  }

  function resumeDraft() {
    const draft = MI.store.getDraft();
    if (!draft || !draft.game) {
      MI.toast('No hay ningún borrador disponible', 'err');
      refreshDraftButton();
      return;
    }
    try {
      const game = MI.normalizeGame(draft.game, { keepId: true });
      MI.audio.sfx('select');
      A.showScreen('editor');
      MI.editor.open(game, {
        savedId: draft.savedId || null,
        source: draft.source || 'draft',
        onExit: () => A.showScreen('menu')
      });
      MI.toast('Borrador recuperado');
    } catch (err) {
      MI.store.clearDraft();
      refreshDraftButton();
      MI.toast(err.message || 'No se pudo recuperar el borrador', 'err');
    }
  }

  /* ============================================================
     GALERÍA
     ============================================================ */
  function allGames() {
    // Los ejemplos se definen en el formato antiguo 320×240 y se adaptan al
    // escenario actual antes de mostrarlos en la biblioteca o en las miniaturas.
    return (MI.EXAMPLES || []).map(g => {
      if (!g) return g;
      if ((Number(g.version) || 1) >= MI.VERSION) return g;
      try { return MI.normalizeGame(g, { keepId: true }); } catch (e) { return g; }
    });
  }

  function myGames() {
    return MI.store.list().slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  function renderGallery() {
    const grid = node('game-grid');
    const empty = node('gallery-empty');
    const title = node('gallery-title');
    if (!grid) return;

    const examples = allGames();
    const mine = myGames();
    let games;
    if (state.filter === 'examples') games = examples;
    else if (state.filter === 'mine') games = mine;
    else games = mine.concat(examples);

    if (title) {
      title.textContent = state.filter === 'examples'
        ? 'Microjuegos de ejemplo'
        : (state.filter === 'mine' ? 'Mis microjuegos' : 'Todos los microjuegos');
    }

    MI.$$('#gallery-filters .chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.filter === state.filter);
    });

    grid.innerHTML = '';
    games.forEach(game => grid.appendChild(gameCard(game)));
    if (empty) empty.classList.toggle('hidden', games.length > 0);

    const emptyTitle = empty && empty.querySelector('h3');
    const emptyText = empty && empty.querySelector('p');
    if (emptyTitle && emptyText) {
      if (state.filter === 'mine') {
        emptyTitle.textContent = 'Aún no tienes microjuegos';
        emptyText.textContent = 'Crea uno desde cero o importa un archivo .microgame.';
      } else {
        emptyTitle.textContent = 'Aún no hay nada aquí';
        emptyText.textContent = 'Crea tu primer microjuego o importa uno desde un archivo.';
      }
    }
  }

  function gameCard(game) {
    const card = MI.el('article', { class: 'game-card' });

    const thumb = MI.el('div', { class: 'game-card-thumb' });
    const canvas = MI.el('canvas', { width: 320, height: 180 });
    MI.sprites.renderGameThumb(canvas, game);
    const badge = MI.el('span', {
      class: 'game-card-badge' + (game.example ? '' : ' mine'),
      text: game.example ? 'EJEMPLO' : 'TUYO'
    });
    thumb.appendChild(canvas);
    thumb.appendChild(badge);

    const body = MI.el('div', { class: 'game-card-body' });
    body.appendChild(MI.el('h3', { class: 'game-card-title', text: game.name }));
    body.appendChild(MI.el('p', { class: 'game-card-sub', text: game.hint || '' }));

    const tags = MI.el('div', { class: 'game-card-tags' });
    tags.appendChild(MI.el('span', { class: 'tag', text: shortDuration(game.duration) }));
    tags.appendChild(MI.el('span', { class: 'tag', text: shortGoal(game) }));
    const track = MI.audio.TRACKS && MI.audio.TRACKS[game.music];
    if (track) tags.appendChild(MI.el('span', { class: 'tag', text: track.name }));
    body.appendChild(tags);

    const actions = MI.el('div', { class: 'game-card-actions' });
    const play = MI.el('button', {
      class: 'btn btn-lime', type: 'button', text: '▶ Jugar',
      onclick: () => playGame(game, 'gallery')
    });
    const edit = MI.el('button', {
      class: 'btn btn-paper', type: 'button', text: game.example ? '✏ Copiar' : '✏ Editar',
      title: game.example ? 'Editar una copia de este ejemplo' : 'Editar este microjuego',
      onclick: () => editGame(game)
    });
    const exportBtn = MI.el('button', {
      class: 'icon-mini', type: 'button', text: '📤', title: 'Exportar archivo .microgame',
      onclick: () => {
        MI.exportGame(game);
        MI.audio.sfx('select');
        MI.toast('Archivo .microgame exportado', 'ok');
      }
    });
    actions.appendChild(play);
    actions.appendChild(edit);
    actions.appendChild(exportBtn);

    if (!game.example) {
      const del = MI.el('button', {
        class: 'icon-mini', type: 'button', text: '🗑', title: 'Eliminar microjuego',
        onclick: () => deleteGame(game)
      });
      actions.appendChild(del);
    } else {
      const copy = MI.el('button', {
        class: 'icon-mini', type: 'button', text: '⧉', title: 'Duplicar en Mis microjuegos',
        onclick: () => copyExample(game)
      });
      actions.appendChild(copy);
    }

    body.appendChild(actions);
    card.appendChild(thumb);
    card.appendChild(body);
    return card;
  }

  function deleteGame(game) {
    MI.modal.confirm(
      'Eliminar microjuego',
      '¿Seguro que quieres eliminar «' + game.name + '»? Esta acción no se puede deshacer.',
      function () {
        MI.store.remove(game.id);
        const draft = MI.store.getDraft();
        if (draft && draft.savedId === game.id) MI.store.clearDraft();
        MI.audio.sfx('hit');
        MI.toast('Microjuego eliminado');
        renderGallery();
      },
      'Eliminar',
      true
    );
  }

  /* ============================================================
     JUGAR / EDITAR
     ============================================================ */
  function playGame(game, from) {
    MI.audio.unlock();
    MI.audio.sfx('select');
    const returnTo = from === 'gallery'
      ? { screen: 'gallery', filter: state.filter }
      : { screen: 'menu' };
    MI.player.open(U.deepClone(game), {
      mode: 'play',
      from: from || 'gallery',
      returnTo
    });
  }

  function editGame(game) {
    MI.audio.sfx('select');
    if (game.example) {
      const copy = U.deepClone(game);
      copy.id = U.uid('game');
      copy.example = false;
      copy.createdAt = Date.now();
      copy.updatedAt = Date.now();
      if (copy.name.length <= 32) copy.name += ' (copia)';
      A.showScreen('editor');
      MI.editor.open(copy, {
        savedId: null,
        source: 'example-copy',
        onExit: () => A.showGallery('examples')
      });
      MI.toast('Copia lista. Guarda para añadirla a Mis microjuegos.');
      return;
    }

    A.showScreen('editor');
    MI.editor.open(U.deepClone(game), {
      savedId: game.id,
      source: 'library',
      onExit: () => A.showGallery('mine')
    });
  }

  function copyExample(game) {
    const copy = U.deepClone(game);
    copy.id = U.uid('game');
    copy.example = false;
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();
    if (copy.name.length <= 32) copy.name += ' (copia)';
    MI.store.save(copy);
    MI.audio.sfx('power');
    MI.toast('Copia guardada en Mis microjuegos', 'ok');
    renderGallery();
  }

  function newGame() {
    MI.audio.sfx('select');
    const game = MI.newGame();
    A.showScreen('editor');
    MI.editor.open(game, {
      source: 'new',
      onExit: () => A.showScreen('menu')
    });
  }

  function startMarathon() {
    MI.audio.unlock();
    const pool = (MI.EXAMPLES || []).concat(MI.store.list());
    if (!pool.length) {
      MI.toast('No hay microjuegos para la maratón', 'err');
      return;
    }
    MI.audio.sfx('select');
    MI.player.startMarathon(pool);
  }

  /* ============================================================
     IMPORTAR
     ============================================================ */
  function ensureFileInput() {
    if (state.fileInput) return state.fileInput;
    const input = MI.el('input', {
      type: 'file',
      accept: '.microgame,.json,application/json',
      style: { display: 'none' }
    });
    input.addEventListener('change', handleImport);
    document.body.appendChild(input);
    state.fileInput = input;
    return input;
  }

  async function handleImport(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const game = await MI.importFile(file);
      game.example = false;
      game.createdAt = game.createdAt || Date.now();
      game.updatedAt = Date.now();
      MI.store.save(game);
      MI.audio.unlock();
      MI.audio.sfx('power');
      MI.toast('Importado: «' + game.name + '»', 'ok');
      if (state.screen === 'gallery') renderGallery();
    } catch (err) {
      MI.toast(err.message || 'No se pudo importar el archivo', 'err');
    } finally {
      e.target.value = '';
    }
  }

  function openImport() {
    const input = ensureFileInput();
    input.value = '';
    input.click();
  }

  /* ============================================================
     SONIDO GLOBAL
     ============================================================ */
  function updateSoundIcons() {
    const muted = MI.audio.muted;
    ['btn-mute', 'player-sound'].forEach(id => {
      const b = node(id);
      if (!b) return;
      b.textContent = muted ? '🔇' : '🔊';
      b.title = muted ? 'Activar sonido' : 'Silenciar sonido';
      b.setAttribute('aria-label', b.title);
    });
  }

  function toggleGlobalSound() {
    const muted = MI.audio.toggleMute();
    if (!muted) MI.audio.unlock();
    updateSoundIcons();
    MI.toast(muted ? 'Sonido silenciado' : 'Sonido activado');
  }

  MI.showChangelog = function () {
    const sections = (MI.CHANGELOG || []).map((entry, i) => {
      const items = entry.items.map(it => '<li>' + it + '</li>').join('');
      return '<section class="changelog-entry' + (i === 0 ? ' latest' : '') + '">' +
        '<div class="changelog-head"><span class="changelog-version">v' + entry.version + '</span>' +
        '<h3>' + entry.title + '</h3></div><ul>' + items + '</ul></section>';
    }).join('');
    const html = '<p class="field-note" style="margin-bottom:12px">Estas son las actualizaciones, mejoras y arreglos de Microgames Inc.</p>' +
      '<div class="changelog">' + sections + '</div>';
    MI.modal.open({
      title: 'Novedades · versión ' + MI.APP_VERSION,
      wide: true,
      body: MI.el('div', { html }),
      footer: [{ label: '¡Genial!', className: 'btn-primary' }]
    });
  };

  /* ============================================================
     AYUDA
     ============================================================ */
  MI.showHelp = function () {
    const html = `
      <div class="help-grid">
        <div class="help-card">
          <h3>🎮 Jugar</h3>
          <p>Elige un ejemplo o uno de tus microjuegos. En ordenador usa el <strong>ratón</strong>; en móvil y tablet, el <strong>dedo</strong>. Toca, arrastra o espera según te pida la pista.</p>
        </div>
        <div class="help-card">
          <h3>⏱️ Duración</h3>
          <p>Cada microjuego dura <strong>4 segundos</strong>, <strong>8 segundos</strong> o es <strong>infinito</strong>. En los de tiempo limitado, la partida termina siempre al agotarse el reloj, tanto si vas ganando como si vas perdiendo.</p>
        </div>
        <div class="help-card">
          <h3>🏁 Maratón</h3>
          <p>Una sucesión de microjuegos con tiempo limitado y <strong>4 vidas</strong>. Cada derrota resta un corazón; al quedarte sin vidas termina la partida. Cada <strong>5 rondas</strong> el tiempo y la música van más rápido. Los microjuegos infinitos se quedan para el modo libre.</p>
        </div>
        <div class="help-card">
          <h3>✏️ Editor</h3>
          <p>Crea objetos con 4 animaciones (nombre, 4 celdas y velocidad de 1 a 5), dibuja zonas y encadena reglas visuales: <em>activador → acciones</em>. Puedes guardar tus propios objetos en <strong>Mis objetos</strong>. No hace falta escribir código.</p>
        </div>
        <div class="help-card">
          <h3>🔘 Interruptores</h3>
          <p>Todos los interruptores empiezan en <strong>OFF</strong>. Puedes activarlos con reglas, tocando objetos o mediante otros objetos. Para ganar hay que cumplir una condición: todos sus interruptores ON (<strong>Y</strong>) o cualquiera de varias condiciones (<strong>O</strong>).</p>
        </div>
        <div class="help-card">
          <h3>🧪 Probar</h3>
          <p>Desde el editor elige la <strong>velocidad</strong> (0,5× a 3×) y pulsa <strong>▶ Probar</strong>. Durante la prueba verás el estado <strong>ON/OFF</strong> de cada objeto y podrás cambiar la velocidad en vivo. El borrador no se modifica.</p>
        </div>
        <div class="help-card">
          <h3>🔤 Textos</h3>
          <p>Añade textos fijos al escenario con la herramienta <strong>T Texto</strong> o desde la pestaña <strong>Juego</strong>: fuente, tamaño, color y alineación. La acción <strong>Añadir texto</strong> crea textos temporales durante la partida.</p>
        </div>
        <div class="help-card">
          <h3>🫥 Objetos invisibles</h3>
          <p>La acción <strong>Objeto invisible</strong> oculta un objeto: no se puede tocar ni le afectan reglas de contacto, movimiento o animación. Su interruptor ON/OFF se conserva y puede volver a mostrarse.</p>
        </div>
        <div class="help-card">
          <h3>📋 Reglas por objeto</h3>
          <p>La pestaña <strong>Lógica</strong> muestra solo las reglas del objeto seleccionado. Copia una regla con <strong>⧉</strong> y pégala en otro objeto eligiendo el destino.</p>
        </div>
        <div class="help-card">
          <h3>🎒 Mis objetos</h3>
          <p>En la pestaña <strong>Animación</strong>, pulsa <strong>Guardar este objeto</strong> para conservarlo en el navegador con sus 4 animaciones. Al añadir un objeto, elige uno de <strong>Mis objetos</strong> para reutilizarlo en cualquier microjuego.</p>
        </div>
        <div class="help-card">
          <h3>💾 Guardar y compartir</h3>
          <p>Tus microjuegos se guardan en este dispositivo. Exporta un archivo <code>.microgame</code> para compartirlo e impórtalo en otro equipo desde la biblioteca o el editor.</p>
        </div>
      </div>
      <h3 style="font-family:var(--font-display);font-size:13px;margin:16px 0 7px">Controles</h3>
      <div class="help-grid">
        <div class="help-card trigger"><h3>Ratón / dedo</h3><p>Tocar el escenario. El juego traduce la posición al área de 1280 × 720 píxeles.</p></div>
        <div class="help-card trigger"><h3>ESC / P</h3><p>Pausa o continúa. En la pausa puedes reiniciar, silenciar o salir.</p></div>
        <div class="help-card trigger"><h3>M</h3><p>Activa o silencia todo el sonido.</p></div>
        <div class="help-card trigger"><h3>Enter / Espacio</h3><p>Empezar, continuar o repetir desde las pantallas del jugador.</p></div>
      </div>
      <p class="field-note" style="margin-top:14px">Consejo: los microjuegos de ejemplo se pueden copiar y editar sin miedo; tus cambios no modifican el original.</p>
    `;
    MI.modal.open({
      title: 'Cómo se juega',
      wide: true,
      body: MI.el('div', { html }),
      footer: [{ label: '¡A jugar!', className: 'btn-primary' }]
    });
  };

  /* ============================================================
     ARTE ANIMADO DEL MENÚ
     ============================================================ */
  function startMenuArt() {
    if (state.menuRaf) return;
    state.menuLast = 0;
    state.menuRaf = requestAnimationFrame(menuLoop);
  }

  function stopMenuArt() {
    if (state.menuRaf) cancelAnimationFrame(state.menuRaf);
    state.menuRaf = 0;
  }

  function menuLoop(ts) {
    if (state.screen !== 'menu') {
      state.menuRaf = 0;
      return;
    }
    if (!state.menuLast) state.menuLast = ts;
    const dt = Math.min(60, ts - state.menuLast);
    state.menuLast = ts;
    state.menuTime += dt;
    drawMenuArt(state.menuTime);
    state.menuRaf = requestAnimationFrame(menuLoop);
  }

  function drawMenuArt(t) {
    const canvas = node('menu-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cw = canvas.width;
    const ch = canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cw, ch);

    const bg = (MI.EXAMPLES && MI.EXAMPLES[4] && MI.EXAMPLES[4].bg) ||
      { color: '#101a36', pattern: 'grid', accent: '#4fd1ff' };
    MI.sprites.background(ctx, bg, cw, ch);

    // Estrellas desplazándose.
    ctx.fillStyle = 'rgba(255,248,232,.55)';
    for (let i = 0; i < 26; i++) {
      const x = (i * 53 + t * 0.012 * (1 + i % 3)) % (cw + 20) - 10;
      const y = (i * 37) % (ch - 40) + 10;
      const s = i % 4 === 0 ? 2 : 1;
      ctx.fillRect(Math.round(x), Math.round(y), s, s);
    }

    // Escenario de demostración con sprites que flotan.
    const bob = (base, amp, speed, phase) => base + Math.sin(t / speed + (phase || 0)) * amp;
    const sprites = [
      { key: 'ninja', x: 38, y: bob(66, 9, 640, 0), w: 34, h: 34 },
      { key: 'star', x: 116, y: bob(40, 7, 470, 1.4), w: 24, h: 24 },
      { key: 'bomb', x: 202, y: bob(76, 8, 700, 2.1), w: 34, h: 34 },
      { key: 'slime', x: 78, y: bob(156, 7, 540, 3.2), w: 32, h: 32 },
      { key: 'coin', x: 246, y: bob(154, 10, 380, 0.7), w: 26, h: 26 },
      { key: 'ghost', x: 166, y: bob(142, 12, 800, 4.1), w: 32, h: 32 }
    ];

    sprites.forEach(sp => {
      if (!MI.sprites) return;
      MI.sprites.draw(ctx, MI.sprites.preset(sp.key), sp.x, sp.y, sp.w, sp.h);
    });

    // Suelo de píxeles.
    ctx.fillStyle = 'rgba(8,12,26,.6)';
    ctx.fillRect(0, ch - 24, cw, 24);
    ctx.fillStyle = 'rgba(79,209,255,.16)';
    for (let x = 0; x < cw; x += 16) ctx.fillRect(x, ch - 24, 8, 3);

    // Rótulo.
    ctx.textAlign = 'center';
    ctx.font = '900 16px "Arial Black", Impact, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#10131f';
    ctx.strokeText('MICROGAMES INC.', cw / 2, 30);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('MICROGAMES INC.', cw / 2, 30);

    ctx.font = '700 8px Consolas, monospace';
    ctx.fillStyle = '#4fd1ff';
    ctx.fillText('DEMO · 6 MICROJUEGOS DE EJEMPLO', cw / 2, 46);

    if (Math.floor(t / 620) % 2 === 0) {
      ctx.font = '900 9px Consolas, monospace';
      ctx.fillStyle = '#fff8e8';
      ctx.fillText('▶ TOCA UN EJEMPLO PARA JUGAR', cw / 2, ch - 33);
    }

    // Scanlines.
    ctx.fillStyle = 'rgba(0,0,0,.10)';
    for (let y = 0; y < ch; y += 3) ctx.fillRect(0, y, cw, 1);
  }

  /* ============================================================
     ARRANQUE
     ============================================================ */
  function shortDuration(ms) {
    if (!ms) return '∞';
    return (ms / 1000).toFixed(ms % 1000 ? 1 : 0).replace('.', ',') + ' s';
  }

  function shortGoal(game) {
    switch (game.goal && game.goal.type) {
      case 'switches': {
        const groups = (game.goal.groups || []).filter(g => Array.isArray(g) && g.length);
        return groups.length ? 'Interruptores' : 'Sobrevivir';
      }
      case 'switch': return 'Interruptor';
      case 'touch': return 'Tocar';
      case 'reach': return 'Alcanzar';
      default: return 'Sobrevivir';
    }
  }

  function bind() {
    const on = (id, ev, fn) => {
      const el = node(id);
      if (el) el.addEventListener(ev, fn);
    };

    on('btn-new', 'click', newGame);
    on('btn-new-gallery', 'click', newGame);
    on('btn-empty-create', 'click', newGame);
    on('btn-play-examples', 'click', () => {
      MI.audio.sfx('select');
      A.showGallery('examples');
    });
    on('btn-mygames', 'click', () => {
      MI.audio.sfx('select');
      A.showGallery('mine');
    });
    on('btn-marathon', 'click', startMarathon);
    on('btn-see-all', 'click', () => A.showGallery('examples'));
    on('btn-import-gallery', 'click', openImport);
    on('btn-mute', 'click', toggleGlobalSound);
    on('btn-changelog', 'click', () => {
      MI.audio.sfx('select');
      MI.showChangelog();
    });
    on('btn-menu-help', 'click', () => {
      MI.audio.sfx('select');
      MI.showHelp();
    });

    const back = $('.back-btn[data-nav="menu"]');
    if (back) back.addEventListener('click', () => {
      MI.audio.sfx('select');
      A.showScreen('menu');
    });

    MI.$$('#gallery-filters .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        state.filter = chip.dataset.filter || 'all';
        MI.audio.sfx('select');
        renderGallery();
      });
    });

    const menuCanvas = node('menu-canvas');
    if (menuCanvas) {
      menuCanvas.addEventListener('click', () => A.showGallery('examples'));
    }

    document.addEventListener('mi:mute', updateSoundIcons);

    document.addEventListener('keydown', function (e) {
      if (state.screen !== 'menu' || $('#modal-root.open')) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (e.key.toLowerCase() === 'm') toggleGlobalSound();
    });
  }

  function init() {
    bind();
    renderMenuExamples();
    updateSoundIcons();
    A.showScreen('menu');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
