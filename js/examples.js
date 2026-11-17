/* ============================================================
   MICROGAMES INC. — examples.js
   Microjuegos de ejemplo incluidos con el juego
   ============================================================ */
(function () {
  'use strict';
  const MI = window.MI;
  const U = MI.util;
  const S = MI.sprites;

  let ruleCounter = 0;

  function G(id, name, hint, duration, music, bg) {
    return {
      format: MI.FORMAT,
      // Los ejemplos se diseñaron en 320×240; normalizeGame los adapta a 1280×720.
      version: 1,
      id,
      name,
      hint,
      author: 'Microgames Inc.',
      duration,
      music,
      bg,
      goal: { type: 'survive', objectId: null, zoneId: null },
      objects: [],
      zones: [],
      rules: [],
      example: true,
      createdAt: 1731000000000,
      updatedAt: 1731000000000
    };
  }

  function Z(g, id, name, x, y, w, h) {
    g.zones.push({ id, name, x, y, w, h });
    return id;
  }

  function O(g, key, name, x, y, w, h, opts) {
    const o = S.makeObject(name, key, Object.assign({ x, y, w, h }, opts || {}));
    g.objects.push(o);
    return o;
  }

  function R(g, subject, trigger, actions, repeat) {
    g.rules.push({
      id: 'rule_' + (++ruleCounter),
      subject: subject ? subject.id || subject : 'stage',
      trigger,
      actions: actions.map(a => Object.assign({ target: 'self' }, a)),
      repeat: !!repeat,
      enabled: true
    });
  }

  /* ============================================================
     1 · NINJA ESCURRIDIZO — 4 s · tocar al objetivo
     ============================================================ */
  function ninja() {
    const g = G('ex_ninja', 'Ninja Escurridizo', '¡Toca al ninja!', 4000,
      'misterio', { color: '#1a1030', pattern: 'dots', accent: '#a45cff' });

    const mainZone = Z(g, 'z_ninja', 'Escondite', 50, 44, 220, 150);
    const decoZone = Z(g, 'z_deco', 'Zona de adornos', 16, 24, 288, 188);

    const ninjaObj = O(g, 'ninja', 'Ninja', 140, 100, 36, 36, {
      placement: 'zone', zone: { x: 50, y: 44, w: 220, h: 150 },
      fps: 5,
      frames: ['ninja', S.variant('ninja', 0, -1), 'ninja', S.variant('ninja', 1, 0)]
    });

    const star1 = O(g, 'star', 'Estrella', 60, 56, 20, 20, {
      fps: 6, frames: ['star', 'spark', 'star', 'spark'],
      placement: 'zone', zone: { x: 24, y: 38, w: 80, h: 50 }
    });
    const star2 = O(g, 'spark', 'Destello', 234, 160, 16, 16, {
      fps: 5, frames: ['spark', 'star', 'spark', 'star'],
      placement: 'zone', zone: { x: 220, y: 140, w: 60, h: 50 }
    });

    g.goal = { type: 'touch', objectId: ninjaObj.id, zoneId: null };

    // Los adornos flotan por su zona al empezar
    R(g, 'stage', { type: 'time', mode: 'point', at: 0 }, [
      { type: 'wander', mode: 'wobble', zoneId: decoZone, speed: 18, target: star1.id },
      { type: 'wander', mode: 'wobble', zoneId: decoZone, speed: 14, target: star2.id }
    ]);

    R(g, ninjaObj, { type: 'tap', where: 'self' }, [
      { type: 'switch', objectId: 'self', value: true },
      { type: 'sound', soundId: 'coin' },
      { type: 'jumpPoint', x: 160, y: 112 }
    ]);

    R(g, 'stage', { type: 'result', mode: 'win' }, [
      { type: 'effect', effect: 'confetti', duration: 1200 },
      { type: 'sound', soundId: 'win' }
    ]);

    return g;
  }

  /* ============================================================
     2 · BOMBA O PLÁTANO — 4 s · interruptor / derrota
     ============================================================ */
  function bombBanana() {
    const g = G('ex_bomba', 'Bomba o Plátano', '¡Bomba, no plátano!', 4000,
      'tenso', { color: '#2a1020', pattern: 'stripes', accent: '#ff4d5e' });

    const bomb = O(g, 'bomb', 'Bomba', 70, 100, 40, 40, {
      placement: 'zone', zone: { x: 34, y: 62, w: 100, h: 116 },
      fps: 6, frames: ['bomb', S.variant('bomb', 0, -1), 'bomb', S.variant('bomb', 1, 0)]
    });
    const banana = O(g, 'banana', 'Plátano', 210, 100, 40, 40, {
      placement: 'zone', zone: { x: 186, y: 62, w: 100, h: 116 },
      fps: 4, frames: ['banana', 'banana', S.variant('banana', 1, 0), 'banana']
    });

    g.goal = { type: 'switch', objectId: bomb.id, zoneId: null };

    R(g, bomb, { type: 'tap', where: 'self' }, [
      { type: 'switch', objectId: 'self', value: true },
      { type: 'sound', soundId: 'power' },
      { type: 'effect', effect: 'confetti', duration: 900 }
    ]);

    R(g, banana, { type: 'tap', where: 'self' }, [
      { type: 'lose' },
      { type: 'sound', soundId: 'hit' },
      { type: 'effect', effect: 'shake', duration: 500 }
    ]);

    R(g, 'stage', { type: 'result', mode: 'win' }, [
      { type: 'sound', soundId: 'win' },
      { type: 'effect', effect: 'flash', duration: 400 }
    ]);
    R(g, 'stage', { type: 'result', mode: 'lose' }, [
      { type: 'sound', soundId: 'lose' }
    ]);

    return g;
  }

  /* ============================================================
     3 · BOMBAS SALTARINAS — 8 s · sobrevivir + deambular
     ============================================================ */
  function bouncingBombs() {
    const g = G('ex_saltarinas', 'Bombas Saltarinas', 'Esquiva 8 segundos', 8000,
      'fiesta', { color: '#0e2233', pattern: 'checker', accent: '#4fd1ff' });

    const stageZone = Z(g, 'z_stage', 'Todo el escenario', 2, 2, 316, 236);
    const refuge = Z(g, 'z_refugio', 'Refugio', 8, 8, 304, 224);

    const hero = O(g, 'star', 'Estrella', 142, 112, 36, 36, { fps: 4, frames: ['star', 'spark', 'star', 'spark'] });

    const spots = [
      { x: 12, y: 10 }, { x: 268, y: 10 }, { x: 12, y: 190 }, { x: 268, y: 190 }
    ];
    const bombs = spots.map((s, i) => O(g, 'bomb', 'Bomba ' + (i + 1), s.x, s.y, 28, 28, {
      placement: 'zone', zone: { x: s.x, y: s.y, w: 40, h: 40 },
      fps: 8, frames: ['bomb', S.variant('bomb', 0, -1), 'bomb', S.variant('bomb', 0, 1)]
    }));

    g.goal = { type: 'survive' };

    bombs.forEach(b => {
      R(g, 'stage', { type: 'time', mode: 'point', at: 100 }, [
        { type: 'wander', mode: 'billiard', zoneId: stageZone, speed: U.randInt(38, 58), target: b.id }
      ]);
      R(g, b, { type: 'tap', where: 'self' }, [
        { type: 'jumpZone', zoneId: refuge, avoid: true },
        { type: 'sound', soundId: 'jump' },
        { type: 'switch', objectId: 'self', value: true }
      ]);
      R(g, b, { type: 'touch', mode: 'object', objectId: hero.id }, [
        { type: 'lose' },
        { type: 'sound', soundId: 'boom' },
        { type: 'effect', effect: 'shake', duration: 400 }
      ]);
    });

    R(g, 'stage', { type: 'result', mode: 'win' }, [
      { type: 'effect', effect: 'confetti', duration: 1500 },
      { type: 'sound', soundId: 'win' }
    ]);
    R(g, 'stage', { type: 'result', mode: 'lose' }, [
      { type: 'sound', soundId: 'lose' }
    ]);

    return g;
  }

  /* ============================================================
     4 · LLUVIA DE ESTRELLAS — 8 s · esquivar con toques
     ============================================================ */
  function starRain() {
    const g = G('ex_estrellas', 'Lluvia de Estrellas', 'Protege al gato', 8000,
      'carrera', { color: '#0c1a3a', pattern: 'grid', accent: '#4fd1ff' });

    const topZone = Z(g, 'z_cielo', 'Cielo', 0, -56, 320, 44);
    const cat = O(g, 'cat', 'Gato', 140, 186, 40, 40, {
      fps: 4, frames: ['cat', 'cat', S.variant('cat', 0, 1), 'cat']
    });

    g.goal = { type: 'survive' };

    const lanes = [40, 96, 152, 208, 264];
    const dirs = [1, 2, 3, 2, 1];
    const speeds = [56, 66, 50, 72, 60];
    const times = [120, 820, 1520, 2220, 2920];

    lanes.forEach((x, i) => {
      const star = O(g, 'star', 'Estrella ' + (i + 1), x, -40, 26, 26, {
        placement: 'zone', zone: { x: x - 12, y: -48, w: 50, h: 30 },
        fps: 6, frames: ['star', 'spark', 'star', 'spark']
      });
      R(g, 'stage', { type: 'time', mode: 'point', at: times[i] }, [
        { type: 'moveDir', dir: dirs[i], speed: speeds[i], target: star.id },
        { type: 'sound', soundId: 'whoosh' }
      ]);
      R(g, star, { type: 'tap', where: 'self' }, [
        { type: 'jumpZone', zoneId: topZone, avoid: true },
        { type: 'moveDir', dir: 2, speed: speeds[i] + 20 },
        { type: 'sound', soundId: 'jump' }
      ]);
      R(g, star, { type: 'touch', mode: 'object', objectId: cat.id }, [
        { type: 'lose' },
        { type: 'sound', soundId: 'hit' },
        { type: 'effect', effect: 'shake', duration: 450 }
      ]);
    });

    R(g, 'stage', { type: 'result', mode: 'win' }, [
      { type: 'effect', effect: 'confetti', duration: 1600 },
      { type: 'sound', soundId: 'win' }
    ]);
    R(g, 'stage', { type: 'result', mode: 'lose' }, [
      { type: 'sound', soundId: 'lose' }
    ]);

    return g;
  }

  /* ============================================================
     5 · COHETE AL ESPACIO — 8 s · llevar objeto a una zona
     ============================================================ */
  function rocketRace() {
    const g = G('ex_cohete', 'Cohete al Espacio', 'Toca el cohete', 8000,
      'jefe', { color: '#1b1035', pattern: 'dots', accent: '#4fd1ff' });

    const goalZone = Z(g, 'z_meta', 'Meta espacial', 0, 8, 320, 34);
    const skyZone = Z(g, 'z_asteroides', 'Cielo de asteroides', -6, -70, 332, 54);

    const rocket = O(g, 'rocket', 'Cohete', 144, 190, 32, 42, {
      fps: 8, frames: ['rocket', S.variant('rocket', 0, -1), 'rocket', S.variant('rocket', 0, 1)]
    });

    g.goal = { type: 'reach', objectId: rocket.id, zoneId: goalZone };

    R(g, rocket, { type: 'tap', where: 'self' }, [
      { type: 'moveDir', dir: 6, speed: 118 },
      { type: 'sound', soundId: 'whoosh' },
      { type: 'effect', effect: 'shake', duration: 300 }
    ]);

    const asteroids = [
      { x: 30, key: 'asteroid', dir: 2, speed: 44, at: 200 },
      { x: 150, key: 'asteroid', dir: 3, speed: 58, at: 600 },
      { x: 260, key: 'asteroid', dir: 1, speed: 52, at: 1000 }
    ].map((a, i) => {
      const obj = O(g, a.key, 'Asteroide ' + (i + 1), a.x, -40, 30, 30, {
        placement: 'zone', zone: { x: a.x - 10, y: -52, w: 60, h: 40 },
        fps: 5, frames: ['asteroid', S.variant('asteroid', 1, 0), 'asteroid', S.variant('asteroid', 0, 1)]
      });
      R(g, 'stage', { type: 'time', mode: 'point', at: a.at }, [
        { type: 'moveDir', dir: a.dir, speed: a.speed, target: obj.id }
      ]);
      R(g, obj, { type: 'tap', where: 'self' }, [
        { type: 'jumpZone', zoneId: skyZone, avoid: true },
        { type: 'moveDir', dir: 2, speed: a.speed + 12 },
        { type: 'sound', soundId: 'hit' }
      ]);
      R(g, obj, { type: 'touch', mode: 'object', objectId: rocket.id }, [
        { type: 'lose' },
        { type: 'sound', soundId: 'boom' },
        { type: 'effect', effect: 'shake', duration: 450 }
      ]);
      return obj;
    });

    // decoración: nube que deambula
    const cloud = O(g, 'cloud', 'Nube', 30, 120, 34, 26, {
      placement: 'zone', zone: { x: 16, y: 80, w: 90, h: 120 }, fps: 3
    });
    R(g, 'stage', { type: 'time', mode: 'point', at: 0 }, [
      { type: 'wander', mode: 'wobble', zoneId: skyZone, speed: 10, target: cloud.id }
    ]);

    R(g, 'stage', { type: 'result', mode: 'win' }, [
      { type: 'effect', effect: 'confetti', duration: 1400 },
      { type: 'sound', soundId: 'win' },
      { type: 'stop', target: rocket.id }
    ]);
    R(g, 'stage', { type: 'result', mode: 'lose' }, [
      { type: 'sound', soundId: 'lose' }
    ]);

    return g;
  }

  /* ============================================================
     6 · FIESTA INFINITA — tiempo infinito
     ============================================================ */
  function infiniteParty() {
    const g = G('ex_fiesta', 'Fiesta Infinita', 'Toca y disfruta', 0,
      'alegre', { color: '#241040', pattern: 'sunset', accent: '#ff86c8' });

    const stageZone = Z(g, 'z_fiesta', 'Fiesta', 6, 6, 308, 228);
    const topZone = Z(g, 'z_salto', 'Arriba', 0, -40, 320, 40);

    const cat = O(g, 'cat', 'Gato DJ', 40, 60, 36, 36, { fps: 5, frames: ['cat', S.variant('cat', 0, -1), 'cat', 'cat'] });
    const slime = O(g, 'slime', 'Gotita', 130, 100, 34, 34, { fps: 6, frames: ['slime', S.variant('slime', 0, -1), 'slime', S.variant('slime', 0, 1)] });
    const balloon = O(g, 'balloon', 'Globo', 230, 55, 32, 40, { fps: 4, frames: ['balloon', S.variant('balloon', 1, 0), 'balloon', S.variant('balloon', 0, 1)] });
    const ghost = O(g, 'ghost', 'Fantasma', 70, 170, 34, 34, { fps: 5, frames: ['ghost', S.variant('ghost', 0, -1), 'ghost', S.variant('ghost', 1, 0)] });
    const coin = O(g, 'coin', 'Moneda', 240, 165, 28, 28, { fps: 8, frames: ['coin', S.variant('coin', 0, 1), 'coin', S.variant('coin', 0, -1)] });

    const flower = O(g, 'flower', 'Flor', 160, 185, 30, 30, {
      fps: 3,
      frames: ['flower', S.variant('flower', 1, 0), 'flower', S.variant('flower', 0, -1)]
    });

    g.goal = { type: 'survive' };

    const guests = [cat, slime, balloon, ghost, coin];
    guests.forEach(o => {
      R(g, 'stage', { type: 'time', mode: 'point', at: 100 }, [
        { type: 'wander', mode: 'wobble', zoneId: stageZone, speed: U.randInt(18, 30), target: o.id }
      ]);
      R(g, o, { type: 'tap', where: 'self' }, [
        { type: 'switch', objectId: 'self', value: true },
        { type: 'jumpZone', zoneId: topZone, avoid: true },
        { type: 'sound', soundId: 'sparkle' },
        { type: 'effect', effect: 'confetti', duration: 500 }
      ]);
    });

    // La flor brilla al terminar cada animación (activador de animación)
    R(g, flower, { type: 'anim', mode: 'end' }, [
      { type: 'sound', soundId: 'sparkle' }
    ], true);

    // Al tocar la flor, cambia de animación y se detiene
    R(g, flower, { type: 'tap', where: 'self' }, [
      { type: 'anim', mode: 'set', frame: 3, target: flower.id },
      { type: 'sound', soundId: 'select' }
    ]);

    return g;
  }

  MI.EXAMPLES = [
    ninja(),
    bombBanana(),
    bouncingBombs(),
    starRain(),
    rocketRace(),
    infiniteParty()
  ].map(g => MI.normalizeGame(g, { keepId: true }));

})();
