/* ============================================================
   MICROGAMES INC. — player.js
   Reproducción de microjuegos, pausa, resultados y maratón
   ============================================================ */
(function () {
  'use strict';

  const MI = window.MI;
  const U = MI.util;
  const $ = MI.$;
  const P = MI.player = {};

  const W = MI.W;
  const H = MI.H;
  const INTRO_MS = 1500;
  const MARATHON_LIVES = 4;
  const AUTO_NEXT_WIN_MS = 1600;
  const AUTO_NEXT_LOSE_MS = 1900;

  let S = null;          // sesión actual
  let bound = false;

  function node(id) { return document.getElementById(id); }

  function safeScreen(name) {
    if (MI.app && MI.app.showScreen) MI.app.showScreen(name);
    else MI.$$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
  }

  function show(el) { if (el) el.classList.remove('hidden'); }
  function hide(el) { if (el) el.classList.add('hidden'); }

  function hideOverlays() {
    hide(node('player-intro'));
    hide(node('player-result'));
    hide(node('player-pause-overlay'));
    hide(node('preview-hud'));
  }

  function fmtSpeed(v) {
    return 'x' + (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
  }

  function marathonSpeed(round) {
    // La velocidad sube un 15 % cada 5 microjuegos (rondas 6, 11, 16...).
    return Math.min(2.5, 1 + Math.floor(Math.max(0, round - 1) / 5) * 0.15);
  }

  function durationText(ms) {
    if (!ms) return 'Tiempo infinito';
    return (ms / 1000).toFixed(1).replace('.', ',') + ' segundos';
  }

  function goalText(game) {
    switch (game.goal && game.goal.type) {
      case 'switches': {
        const groups = (game.goal.groups || []).filter(g => Array.isArray(g) && g.length);
        if (!groups.length) return 'Sobrevive hasta el final';
        const nameOf = id => {
          const o = (game.objects || []).find(x => x.id === id);
          return o ? o.name : 'un objeto';
        };
        if (groups.length === 1 && groups[0].length === 1) {
          return 'Activa el interruptor de ' + nameOf(groups[0][0]);
        }
        return groups.length > 1 ? 'Enciende los interruptores (una de varias combinaciones)' : 'Enciende todos los interruptores';
      }
      case 'switch': return 'Activa el interruptor';
      case 'touch': return 'Toca el objetivo';
      case 'reach': return 'Lleva el objeto a la zona';
      default: return 'Sobrevive hasta el final';
    }
  }

  function heartRow(lives, max, extraClass) {
    const row = MI.el('div', { class: 'hearts ' + (extraClass || '') });
    for (let i = 0; i < max; i++) {
      row.appendChild(MI.el('span', {
        class: 'heart' + (i < lives ? '' : ' empty'),
        text: '♥',
        'aria-hidden': 'true'
      }));
    }
    row.setAttribute('aria-label', lives + ' de ' + max + ' vidas');
    return row;
  }

  function renderLivesBadge() {
    const box = node('player-lives');
    if (!box) return;
    if (!S || !S.marathon) { hide(box); return; }
    box.innerHTML = '';
    box.appendChild(heartRow(S.marathon.lives, S.marathon.maxLives, 'small'));
    show(box);
  }

  /* ============================================================
     API PÚBLICA
     ============================================================ */
  P.open = function (game, opts) {
    opts = opts || {};
    if (S) teardown();

    let def;
    try {
      def = MI.normalizeGame(game, { keepId: true });
    } catch (err) {
      MI.toast(err.message || 'No se pudo abrir el microjuego', 'err');
      return;
    }

    const marathon = opts.marathon || null;
    S = {
      game: def,
      opts,
      marathon,
      phase: 'intro',
      engine: null,
      raf: 0,
      introTimer: null,
      autoTimer: null,
      lastTs: 0,
      speed: marathon ? marathonSpeed(marathon.round || 1) : (opts.speed || 1),
      attempt: 1,
      result: null,
      hudSig: ''
    };

    MI.audio.unlock();
    safeScreen('player');
    bindUI();
    hideOverlays();
    updateHeader();
    startRound();
  };

  P.startMarathon = function (games) {
    let all = (games || []).filter(g => g && Array.isArray(g.objects) && g.objects.length);
    if (!all.length) all = (MI.EXAMPLES || []).slice();
    if (!all.length) {
      MI.toast('No hay microjuegos para la maratón', 'err');
      return;
    }

    // Las partidas infinitas no pueden encadenarse en una maratón: sin reloj
    // nunca llegarían a su pantalla de resultado. Se reservan para el modo libre.
    let pool = all.filter(g => Number(g.duration) > 0);
    const forceDuration = pool.length === 0;
    if (forceDuration) pool = all;

    pool = U.shuffle(pool.map(g => {
      const copy = U.deepClone(g);
      if (forceDuration) copy.duration = 8000;
      return copy;
    }));
    const marathon = {
      pool,
      index: 0,
      round: 1,
      wins: 0,
      lives: MARATHON_LIVES,
      maxLives: MARATHON_LIVES,
      games: all.map(g => U.deepClone(g))
    };
    P.open(pool[0], {
      mode: 'marathon',
      from: 'menu',
      marathon,
      returnTo: { screen: 'menu' }
    });
  };

  P.onEscape = function () {
    if (!S) return;
    const screen = node('screen-player');
    if (!screen || !screen.classList.contains('active')) return;
    if (S.phase === 'intro' || S.phase === 'result') return;
    if (S.phase === 'playing') pause();
    else if (S.phase === 'paused') resume();
  };

  P.isActive = function () { return !!S; };

  /* ============================================================
     CABECERA / INTERFAZ
     ============================================================ */
  function updateHeader() {
    if (!S) return;
    const badge = node('player-badge');
    const name = node('player-game-name');
    const hint = node('player-hint');
    const mode = node('player-mode-note');
    const speedBadge = node('speed-badge');
    const footer = node('marathon-progress');

    if (name) name.textContent = S.game.name;
    if (hint) hint.textContent = S.game.hint || 'Toca lo que pida';

    if (badge) {
      badge.className = 'player-badge' + (S.marathon ? ' marathon' : (S.game.example ? '' : ' mine'));
      badge.textContent = S.marathon ? 'MARATÓN' : (S.opts.mode === 'preview' ? 'PRUEBA' : (S.game.example ? 'EJEMPLO' : 'TU MICROJUEGO'));
    }

    if (speedBadge) {
      const showSpeed = Math.abs(S.speed - 1) > 0.001;
      speedBadge.classList.toggle('hidden', !showSpeed);
      speedBadge.textContent = fmtSpeed(S.speed);
    }

    if (mode) {
      if (S.marathon) {
        mode.textContent = 'Velocidad ' + fmtSpeed(S.speed) + ' · sube cada 5 microjuegos';
      } else if (S.opts.mode === 'preview') {
        mode.textContent = 'Prueba · ' + fmtSpeed(S.speed) +
          (S.opts.showSwitches ? ' · interruptores en vivo' : '');
      } else {
        mode.textContent = durationText(S.game.duration) + ' · ' + goalText(S.game);
      }
    }

    if (footer) {
      if (S.marathon) {
        footer.textContent = 'Maratón · Ronda ' + S.marathon.round + ' · ' +
          S.marathon.wins + (S.marathon.wins === 1 ? ' acierto' : ' aciertos') +
          ' · ' + fmtSpeed(S.speed);
      } else if (S.opts.mode === 'preview') {
        footer.textContent = 'Prueba · velocidad ' + fmtSpeed(S.speed) + ' · el borrador no se modifica';
      } else {
        footer.textContent = S.game.example ? 'Microjuego de ejemplo' : 'Microjuego de la biblioteca';
      }
    }

    renderLivesBadge();
    updatePreviewHud();
  }

  function setPreviewSpeed(v) {
    if (!S) return;
    const next = [0.5, 1, 2, 3].indexOf(Number(v)) >= 0 ? Number(v) : 1;
    if (S.speed === next) return;
    S.speed = next;
    if (S.engine) S.engine.speed = next;
    MI.audio.setSpeed(next);
    S.hudSig = '';
    updateHeader();
    updatePreviewHud();
  }

  function updatePreviewHud() {
    const hud = node('preview-hud');
    if (!hud) return;
    const active = S && S.opts.showSwitches && S.engine && S.phase !== 'intro' && S.phase !== 'result';
    if (!active) { hide(hud); return; }

    const objects = S.engine.objects || [];
    const sig = objects.map(o => o.id + ':' + (o.switch ? 1 : 0) + ':' + (o.visible === false ? 1 : 0)).join('|') +
      '|' + S.speed + '|' + (S.phase === 'paused' ? 'p' : 'r');
    if (S.hudSig === sig && !hud.classList.contains('hidden')) return;
    S.hudSig = sig;

    hud.innerHTML = '';
    const head = MI.el('div', { class: 'preview-hud-head' }, [
      MI.el('span', { class: 'preview-hud-title', text: 'Interruptores' }),
      MI.el('span', { class: 'preview-hud-note', text: S.phase === 'paused' ? 'en pausa' : 'en vivo' })
    ]);
    hud.appendChild(head);

    const list = MI.el('div', { class: 'preview-hud-list' });
    if (!objects.length) {
      list.appendChild(MI.el('span', { class: 'preview-hud-empty', text: 'Sin objetos' }));
    }
    objects.forEach(o => {
      const row = MI.el('div', { class: 'preview-hud-row' + (o.visible === false ? ' is-hidden' : '') });
      row.appendChild(MI.el('span', { class: 'preview-hud-led' + (o.switch ? ' on' : '') }));
      row.appendChild(MI.el('span', { class: 'preview-hud-name', text: o.name }));
      if (o.visible === false) row.appendChild(MI.el('span', { class: 'preview-hud-tag', text: 'invisible' }));
      row.appendChild(MI.el('span', { class: 'preview-hud-state' + (o.switch ? ' on' : ''), text: o.switch ? 'ON' : 'OFF' }));
      list.appendChild(row);
    });
    hud.appendChild(list);

    const speed = MI.el('div', { class: 'preview-hud-speed' });
    speed.appendChild(MI.el('span', { class: 'preview-hud-label', text: 'Velocidad' }));
    [0.5, 1, 2, 3].forEach(v => {
      speed.appendChild(MI.el('button', {
        class: 'preview-speed-btn' + (Math.abs(S.speed - v) < 0.001 ? ' active' : ''),
        type: 'button', text: fmtSpeed(v),
        onclick: () => setPreviewSpeed(v)
      }));
    });
    hud.appendChild(speed);
    show(hud);
  }

  function updateTimer() {
    if (!S || !S.engine) return;
    const fill = node('timer-fill');
    const text = node('timer-text');
    if (!fill || !text) return;

    const dur = S.game.duration;
    let pct = 1;
    let label = '∞';

    if (dur > 0) {
      const remaining = Math.max(0, dur - S.engine.t);
      pct = U.clamp(remaining / dur, 0, 1);
      label = (remaining / 1000).toFixed(1).replace('.', ',');
    }

    fill.style.transform = 'scaleX(' + pct + ')';
    fill.classList.toggle('infinite', dur === 0);
    fill.classList.toggle('low', dur > 0 && pct <= 0.25);
    fill.classList.toggle('mid', dur > 0 && pct > 0.25 && pct <= 0.5);
    text.textContent = label;
  }

  /* ============================================================
     CICLO DE UNA RONDA
     ============================================================ */
  function startRound() {
    if (!S) return;
    stopIntro();
    clearAutoNext();
    if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
    MI.audio.stopMusic();

    S.phase = 'intro';
    S.result = null;
    S.lastTs = 0;

    S.engine = new MI.Game(S.game, {
      speed: S.speed,
      onSound: function (id) { MI.audio.sfx(id); },
      onFinish: onEngineFinish
    });

    hideOverlays();
    updateHeader();
    updateTimer();
    buildIntro();
    renderFrame();

    // Solo la pista del jugador, en grande, sobre fondo negro, durante 1,5 s.
    show(node('player-intro'));
    MI.audio.unlock();
    MI.audio.sfx('hint');
    S.introTimer = setTimeout(startPlay, INTRO_MS);
  }

  function buildIntro() {
    const box = node('player-intro');
    if (!box) return;
    box.className = 'overlay intro hint-only';
    box.innerHTML = '';
    const hint = MI.el('p', { class: 'intro-hint' });
    hint.textContent = S.game.hint || 'Toca lo que pida';
    box.appendChild(hint);
  }

  function stopIntro() {
    if (S && S.introTimer) {
      clearTimeout(S.introTimer);
      S.introTimer = null;
    }
  }

  function startPlay() {
    if (!S || S.phase !== 'intro') return;
    stopIntro();
    S.phase = 'playing';
    hide(node('player-intro'));
    if (!MI.audio.muted) MI.audio.playMusic(S.game.music, { speed: S.speed });
    MI.audio.setSpeed(S.speed);
    S.lastTs = 0;
    updateTimer();
    if (S.raf) cancelAnimationFrame(S.raf);
    S.raf = requestAnimationFrame(loop);
  }

  function loop(ts) {
    if (!S || S.phase !== 'playing') return;
    if (!S.lastTs) S.lastTs = ts;
    let dt = ts - S.lastTs;
    S.lastTs = ts;
    if (dt < 0) dt = 0;
    if (dt > 70) dt = 70;

    try {
      S.engine.update(dt);
    } catch (err) {
      console.error('Error en el motor del microjuego', err);
      MI.toast('El microjuego ha encontrado un error', 'err');
      if (S) { S.phase = 'result'; }
      return;
    }

    renderFrame();
    updateTimer();

    if (S && S.phase === 'playing') S.raf = requestAnimationFrame(loop);
  }

  function renderFrame() {
    if (!S || !S.engine) return;
    const canvas = node('player-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    S.engine.render(ctx);
    updatePreviewHud();
  }

  function onEngineFinish(result) {
    if (!S) return;
    S.phase = 'result';
    S.result = result;
    if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
    MI.audio.stopMusic();
    MI.audio.sfx(result.won ? 'win' : 'lose');

    if (S.marathon) {
      if (result.won) {
        S.marathon.wins++;
      } else {
        S.marathon.lives = Math.max(0, S.marathon.lives - 1);
      }
      updateHeader();
    }

    updateTimer();
    showResult(result);
  }

  /* ============================================================
     RESULTADO
     ============================================================ */
  function showResult(result) {
    const box = node('player-result');
    if (!box) return;
    clearAutoNext();
    box.innerHTML = '';
    box.className = 'overlay result-overlay';
    box.classList.toggle('is-marathon', !!S.marathon);
    box.classList.toggle('is-gameover', !!S.marathon && S.marathon.lives <= 0);

    const marathonOver = !!(S.marathon && S.marathon.lives <= 0);

    const stamp = MI.el('div', {
      class: 'result-stamp ' + (marathonOver ? 'lose' : (result.won ? 'win' : 'lose')),
      text: marathonOver ? 'FIN DE LA PARTIDA' : (result.won ? '¡GANASTE!' : '¡PERDISTE!')
    });
    box.appendChild(stamp);

    if (S.marathon) {
      // Corazones grandes: se muestran al ganar y al perder cada microjuego.
      box.appendChild(heartRow(S.marathon.lives, S.marathon.maxLives, 'big'));
      box.appendChild(MI.el('p', {
        class: 'result-lives-label',
        text: marathonOver
          ? 'Te has quedado sin vidas'
          : (result.won ? '¡Vida intacta!' : 'Has perdido una vida')
      }));
    }

    if (result.reason) box.appendChild(MI.el('p', { class: 'result-reason', text: result.reason }));

    const sub = MI.el('p', { class: 'result-sub' });
    if (S.marathon) {
      sub.textContent = 'Ronda ' + S.marathon.round + ' · ' + S.marathon.wins +
        (S.marathon.wins === 1 ? ' acierto' : ' aciertos') + ' · ' + fmtSpeed(S.speed);
    } else if (S.game.duration === 0) {
      sub.textContent = 'Tiempo infinito · partida terminada';
    } else {
      sub.textContent = 'Tiempo: ' + (result.time / 1000).toFixed(1).replace('.', ',') + ' s';
    }
    box.appendChild(sub);

    if (S.marathon && !marathonOver) {
      // Sin botones: una breve pausa y carga automática del siguiente microjuego.
      box.appendChild(MI.el('p', {
        class: 'result-next',
        text: result.won ? 'Siguiente microjuego…' : 'Siguiente microjuego…'
      }));
      S.autoTimer = setTimeout(nextMarathon, result.won ? AUTO_NEXT_WIN_MS : AUTO_NEXT_LOSE_MS);
    } else {
      const actions = MI.el('div', { class: 'result-actions' });
      const btn = (label, cls, fn) => {
        const b = MI.el('button', { class: 'btn ' + cls, type: 'button', text: label, onclick: fn });
        actions.appendChild(b);
        return b;
      };

      if (S.marathon) {
        btn('↻ Reiniciar maratón', 'btn-lime', restartMarathon);
        btn('Salir', 'btn-paper', exit);
      } else if (S.opts.from === 'editor' || S.opts.mode === 'preview') {
        btn('Repetir', 'btn-cyan', retry);
        btn('Volver al editor', 'btn-lime', exit);
      } else {
        btn('Repetir', 'btn-cyan', retry);
        btn('Salir', 'btn-paper', exit);
      }
      box.appendChild(actions);
    }

    show(box);
  }

  function retry() {
    if (!S) return;
    S.attempt++;
    startRound();
  }

  function clearAutoNext() {
    if (S && S.autoTimer) {
      clearTimeout(S.autoTimer);
      S.autoTimer = null;
    }
  }

  function nextMarathon() {
    if (!S || !S.marathon) return;
    const m = S.marathon;
    if (m.lives <= 0) return;
    clearAutoNext();
    const previousSpeed = S.speed;

    m.round++;
    m.index++;
    if (!m.pool.length) m.pool = (MI.EXAMPLES || []).map(g => U.deepClone(g));
    if (m.index >= m.pool.length) {
      m.pool = U.shuffle(m.pool);
      m.index = 0;
      // Evita repetir el mismo microjuego justo después de cerrar el ciclo.
      if (m.pool.length > 1 && m.pool[0] && S.game && m.pool[0].id === S.game.id) {
        m.pool.push(m.pool.shift());
      }
    }

    const next = m.pool[m.index];
    if (!next) { exit(); return; }

    S.game = MI.normalizeGame(U.deepClone(next), { keepId: true });
    S.speed = marathonSpeed(m.round);
    S.attempt = 1;

    if (S.speed > previousSpeed + 0.001) {
      MI.toast('¡Más rápido! Velocidad ' + fmtSpeed(S.speed), 'ok');
      MI.audio.sfx('power');
    }

    updateHeader();
    startRound();
  }

  function restartMarathon() {
    if (!S || !S.marathon) return;
    const games = S.marathon.games && S.marathon.games.length ? S.marathon.games : (MI.EXAMPLES || []);
    const saved = games.map(g => U.deepClone(g));
    teardown();
    P.startMarathon(saved);
  }

  /* ============================================================
     PAUSA
     ============================================================ */
  function pause() {
    if (!S || S.phase !== 'playing') return;
    S.phase = 'paused';
    if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
    stopIntro();
    MI.audio.pauseMusic();
    renderFrame();
    updateTimer();
    showPause();
  }

  function showPause() {
    const box = node('player-pause-overlay');
    if (!box) return;
    box.innerHTML = '';
    box.className = 'overlay pause-overlay';

    const title = MI.el('h2', { text: 'Pausa' });
    const note = MI.el('p', {
      class: 'result-reason',
      text: S.game.duration === 0
        ? 'Este microjuego es infinito. Puedes terminarlo cuando quieras.'
        : 'El tiempo y la música están detenidos.'
    });
    const actions = MI.el('div', { class: 'pause-actions' });
    const add = (label, cls, fn) => actions.appendChild(
      MI.el('button', { class: 'btn ' + cls, type: 'button', text: label, onclick: fn })
    );

    add('▶ Continuar', 'btn-lime', resume);
    if (!S.marathon) add('↻ Reiniciar', 'btn-cyan', retry);
    add(MI.audio.muted ? '🔇 Sonido: OFF' : '🔊 Sonido: ON', 'btn-paper', toggleSound);
    if (S.game.duration === 0) add('■ Terminar microjuego', 'btn-primary', finishNow);
    add('← Salir', 'btn-paper', exit);

    box.appendChild(title);
    box.appendChild(note);
    box.appendChild(actions);
    show(box);
  }

  function resume() {
    if (!S || S.phase !== 'paused') return;
    S.phase = 'playing';
    hide(node('player-pause-overlay'));
    if (!MI.audio.muted) {
      if (MI.audio.music && MI.audio.music.paused) MI.audio.resumeMusic();
      else MI.audio.playMusic(S.game.music, { speed: S.speed });
    }
    S.lastTs = 0;
    if (S.raf) cancelAnimationFrame(S.raf);
    S.raf = requestAnimationFrame(loop);
  }

  function finishNow() {
    if (!S || !S.engine) return;
    if (S.phase === 'paused' || S.phase === 'playing') {
      hide(node('player-pause-overlay'));
      if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
      S.engine.finish();
    }
  }

  /* ============================================================
     SONIDO Y SALIDA
     ============================================================ */
  function toggleSound() {
    const muted = MI.audio.toggleMute();
    if (!muted) {
      MI.audio.unlock();
      if (S && S.phase === 'playing') {
        MI.audio.playMusic(S.game.music, { speed: S.speed });
      }
    }
    updateSoundIcons();
    if (S && S.phase === 'paused') showPause();
    MI.toast(muted ? 'Sonido silenciado' : 'Sonido activado');
  }

  function updateSoundIcons() {
    const muted = MI.audio.muted;
    ['btn-mute', 'player-sound'].forEach(id => {
      const b = node(id);
      if (!b) return;
      b.textContent = muted ? '🔇' : '🔊';
      b.title = muted ? 'Activar sonido' : 'Silenciar sonido';
    });
  }

  function exit() {
    if (!S) return;
    const opts = S.opts;
    teardown();
    if (opts.from === 'editor' || opts.mode === 'preview') {
      safeScreen('editor');
    } else if (opts.returnTo && opts.returnTo.screen === 'gallery' && MI.app) {
      MI.app.showGallery(opts.returnTo.filter || 'all');
    } else {
      safeScreen((opts.returnTo && opts.returnTo.screen) || 'menu');
    }
  }

  function teardown() {
    if (S) {
      stopIntro();
      clearAutoNext();
      if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
    }
    MI.audio.stopMusic();
    hideOverlays();
    S = null;
  }

  /* ============================================================
     ENTRADA
     ============================================================ */
  function bindUI() {
    if (bound) return;
    bound = true;

    const canvas = node('player-canvas');
    if (canvas) {
      canvas.addEventListener('pointerdown', function (e) {
        if (!S || !S.engine) return;
        e.preventDefault();
        MI.audio.unlock();
        if (S.phase !== 'playing') return;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = (e.clientX - rect.left) * W / rect.width;
        const y = (e.clientY - rect.top) * H / rect.height;
        S.engine.pointerDown(U.clamp(x, 0, W), U.clamp(y, 0, H));
      }, { passive: false });
      canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    const back = node('player-back');
    if (back) back.addEventListener('click', function () {
      if (!S) { safeScreen('menu'); return; }
      if (S.phase === 'playing') pause();
      else exit();
    });

    const pauseBtn = node('player-pause');
    if (pauseBtn) pauseBtn.addEventListener('click', function () {
      if (!S) return;
      if (S.phase === 'playing') pause();
      else if (S.phase === 'paused') resume();
    });

    const sound = node('player-sound');
    if (sound) sound.addEventListener('click', toggleSound);

    document.addEventListener('keydown', function (e) {
      if (!S) return;
      const screen = node('screen-player');
      if (!screen || !screen.classList.contains('active')) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

      if (e.key === 'Enter' || e.key === ' ') {
        if (S.phase === 'paused') { e.preventDefault(); resume(); }
        else if (S.phase === 'result' && !S.marathon) {
          e.preventDefault();
          retry();
        }
      } else if (e.key.toLowerCase() === 'p') {
        if (S.phase === 'playing') { e.preventDefault(); pause(); }
        else if (S.phase === 'paused') { e.preventDefault(); resume(); }
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleSound();
      }
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && S && S.phase === 'playing') pause();
    });

    document.addEventListener('mi:mute', updateSoundIcons);
    updateSoundIcons();
  }

})();
