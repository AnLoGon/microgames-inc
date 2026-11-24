/* ============================================================
   MICROGAMES INC. — engine.js
   Motor de microjuegos: objetos, reglas, movimiento y efectos
   ============================================================ */
(function () {
  'use strict';
  const MI = window.MI;
  const U = MI.util;

  const NS = MI.W;
  const NM = MI.H;
  const PX = NS / 320; // factor de escala respecto al diseño original

  function rect(o) { return { x: o.x, y: o.y, w: o.w, h: o.h }; }

  class Game {
    constructor(def, opts) {
      opts = opts || {};
      this.def = JSON.parse(JSON.stringify(def));
      this.speed = opts.speed || 1;
      this.duration = this.def.duration || 0;
      this.onSound = opts.onSound || null;
      this.onFinish = opts.onFinish || null;
      this.onWin = opts.onWin || null;
      this.reset();
    }

    reset() {
      this.t = 0;
      this.ended = false;
      this.won = false;
      this.lost = false;
      this.winThisFrame = false;
      this.loseThisFrame = false;
      this.finishReason = '';
      this.taps = [];
      this.ruleState = {};
      this.effects = {
        flash: 0, flashMax: 0, shake: 0, shakeMax: 0, freeze: 0, freezeMax: 0,
        particles: [], ripples: [], winFlash: 0, loseFlash: 0
      };
      this.objects = this.def.objects.map(o => {
        let x = o.x, y = o.y;
        if (o.placement === 'zone' && o.zone) {
          x = o.zone.x + Math.random() * Math.max(0, o.zone.w - o.w);
          y = o.zone.y + Math.random() * Math.max(0, o.zone.h - o.h);
        }
        return {
          id: o.id, def: o, name: o.name,
          x, y, w: o.w, h: o.h,
          vx: 0, vy: 0, motion: null,
          switch: false, turnedOn: false, turnedOff: false,
          visible: o.visible !== false,
          anim: 0, frame: 0, animTime: 0, animating: true, lastLoop: false, frameChanged: false,
          alpha: 1, flashSwitch: 0
        };
      });
      this.zones = (this.def.zones || []).slice();
      this.stageTexts = (this.def.texts || []).map(t => Object.assign({}, t));
      this.dynamicTexts = [];
    }

    getObject(id) {
      if (!id) return null;
      return this.objects.find(o => o.id === id) || null;
    }
    getZone(id) {
      if (!id) return null;
      return this.zones.find(z => z.id === id) || null;
    }

    /* ------------------------------ entrada ------------------------------ */
    pointerDown(x, y) {
      if (this.ended) return;
      let hit = null;
      for (let i = this.objects.length - 1; i >= 0; i--) {
        const o = this.objects[i];
        if (!o.visible) continue;
        if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) { hit = o; break; }
      }
      this.taps.push({ x, y, id: hit ? hit.id : null, obj: hit });
      this.effects.ripples.push({ x, y, life: 380, max: 380 });
      if (this.onSound) this.onSound('tick');
      else MI.audio.sfx('tick');
    }

    /* ------------------------------ ciclo ------------------------------ */
    update(realDt) {
      if (this.ended) return;
      const real = Math.min(realDt || 16, 80);
      const dt = real * this.speed;
      const frozen = this.effects.freeze > 0;
      // El efecto «congelar» detiene objetos, animaciones y reloj.
      if (!frozen) this.t += dt;
      this.winThisFrame = false;
      this.loseThisFrame = false;

      for (const o of this.objects) {
        o.turnedOn = false;
        o.turnedOff = false;
        o.lastLoop = false;
        o.frameChanged = false;
      }

      if (!frozen) {
        for (const o of this.objects) this.updateObject(o, dt);
        for (let i = this.dynamicTexts.length - 1; i >= 0; i--) {
          const tx = this.dynamicTexts[i];
          if (tx.life > 0) {
            tx.life -= dt;
            if (tx.life <= 0) this.dynamicTexts.splice(i, 1);
          }
        }
      }
      this.updateEffects(dt);

      this.checkGoal();
      this.evalRules(dt);
      this.checkGoal();

      if (this.duration > 0 && this.t >= this.duration) {
        this.finish();
      }
      this.taps.length = 0;
    }

    updateObject(o, dt) {
      if (!o.visible) return;
      // animación de la animación activa (0-3)
      const def = o.def;
      const animations = MI.objectAnimations(def);
      const anim = animations[o.anim] || animations[0];
      const frames = (anim && anim.frames) || [];
      const frameMs = 1000 / Math.max(1, MI.animFps(anim && anim.speed));
      if (o.animating && frames.length) {
        o.animTime += dt;
        while (o.animTime >= frameMs) {
          o.animTime -= frameMs;
          const prev = o.frame;
          o.frame = (o.frame + 1) % frames.length;
          o.frameChanged = o.frame !== prev;
          if (o.frame === 0 && o.frameChanged) o.lastLoop = true;
        }
      }
      // movimiento
      if (!o.motion) {
        if (o.vx || o.vy) {
          o.x += o.vx * dt / 1000;
          o.y += o.vy * dt / 1000;
        }
        return;
      }
      const m = o.motion;
      const sec = dt / 1000;
      switch (m.type) {
        case 'straight': {
          o.x += o.vx * sec;
          o.y += o.vy * sec;
          if (m.target) {
            const dx = m.target.x - o.x, dy = m.target.y - o.y;
            if (Math.abs(dx) <= 6 && Math.abs(dy) <= 6) { o.vx = 0; o.vy = 0; o.motion = null; }
          }
          break;
        }
        case 'seek': {
          const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
          const dx = m.x - cx, dy = m.y - cy;
          const dist = Math.hypot(dx, dy);
          if (dist < 8) { o.vx = 0; o.vy = 0; o.motion = null; break; }
          o.vx = (dx / dist) * m.speed;
          o.vy = (dy / dist) * m.speed;
          o.x += o.vx * sec; o.y += o.vy * sec;
          break;
        }
        case 'approach': {
          const other = this.getObject(m.objectId);
          if (!other) { o.motion = null; break; }
          const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
          const tx = other.x + other.w / 2, ty = other.y + other.h / 2;
          const dx = tx - cx, dy = ty - cy;
          const dist = Math.hypot(dx, dy);
          if (dist <= m.distance + 6) { o.vx = 0; o.vy = 0; o.motion = null; break; }
          o.vx = (dx / dist) * m.speed;
          o.vy = (dy / dist) * m.speed;
          o.x += o.vx * sec; o.y += o.vy * sec;
          break;
        }
        case 'wobble': {
          const z = this.getZone(m.zoneId);
          if (!z) { o.motion = null; break; }
          m.timer -= dt;
          if (!m.tx || m.timer <= 0) {
            const p = this.pickPointInZone(z, o, m.avoid, m.avoid ? this.objects : null);
            m.tx = p.x; m.ty = p.y;
            m.timer = U.rand(420, 800);
          }
          const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
          const dx = m.tx - cx, dy = m.ty - cy;
          const dist = Math.hypot(dx, dy) || 1;
          o.vx = (dx / dist) * m.speed;
          o.vy = (dy / dist) * m.speed + Math.sin(this.t / 110 + (o.x + o.y) * 0.02) * 12 * PX;
          o.x += o.vx * sec; o.y += o.vy * sec;
          this.keepInZone(o, z, true);
          break;
        }
        case 'billiard': {
          const z = this.getZone(m.zoneId);
          if (!z) { o.motion = null; break; }
          o.x += o.vx * sec;
          o.y += o.vy * sec;
          this.bounceInZone(o, z);
          break;
        }
        case 'fly': {
          const z = this.getZone(m.zoneId);
          if (!z) { o.motion = null; break; }
          m.timer -= dt;
          if (m.timer <= 0) {
            const a = Math.random() * Math.PI * 2;
            o.vx = Math.cos(a) * m.speed;
            o.vy = Math.sin(a) * m.speed;
            m.timer = U.rand(110, 260);
          }
          o.x += o.vx * sec;
          o.y += o.vy * sec;
          this.bounceInZone(o, z);
          break;
        }
        case 'ball': {
          const z = this.getZone(m.zoneId);
          if (!z) { o.motion = null; break; }
          o.vy += 900 * PX * sec;
          o.x += o.vx * sec;
          o.y += o.vy * sec;
          const left = z.x, right = z.x + z.w - o.w, top = z.y, bottom = z.y + z.h - o.h;
          if (o.x < left) { o.x = left; o.vx = Math.abs(o.vx) * 0.82; }
          if (o.x > right) { o.x = right; o.vx = -Math.abs(o.vx) * 0.82; }
          if (o.y < top) { o.y = top; o.vy = Math.abs(o.vy) * 0.7; }
          if (o.y > bottom) {
            o.y = bottom;
            o.vy = -Math.abs(o.vy) * 0.72;
            if (Math.abs(o.vy) < 40 * PX) o.vy = 0;
            o.vx *= 0.985;
          }
          break;
        }
      }
    }

    keepInZone(o, z, soft) {
      const left = z.x, right = z.x + z.w - o.w, top = z.y, bottom = z.y + z.h - o.h;
      if (o.x < left) { o.x = left; if (soft) o.vx = Math.abs(o.vx); }
      if (o.x > right) { o.x = Math.max(left, right); if (soft) o.vx = -Math.abs(o.vx); }
      if (o.y < top) { o.y = top; if (soft) o.vy = Math.abs(o.vy); }
      if (o.y > bottom) { o.y = Math.max(top, bottom); if (soft) o.vy = -Math.abs(o.vy); }
    }
    bounceInZone(o, z) {
      const left = z.x, right = z.x + z.w - o.w, top = z.y, bottom = z.y + z.h - o.h;
      if (o.x < left) { o.x = left; o.vx = Math.abs(o.vx); }
      else if (o.x > right) { o.x = Math.max(left, right); o.vx = -Math.abs(o.vx); }
      if (o.y < top) { o.y = top; o.vy = Math.abs(o.vy); }
      else if (o.y > bottom) { o.y = Math.max(top, bottom); o.vy = -Math.abs(o.vy); }
    }

    pickPointInZone(zone, obj, avoid, others) {
      const maxX = zone.x + Math.max(0, zone.w - obj.w);
      const maxY = zone.y + Math.max(0, zone.h - obj.h);
      let best = { x: U.rand(zone.x, maxX), y: U.rand(zone.y, maxY) };
      if (!avoid || !others) return best;
      for (let i = 0; i < 18; i++) {
        const p = { x: U.rand(zone.x, maxX), y: U.rand(zone.y, maxY) };
        const r = { x: p.x, y: p.y, w: obj.w, h: obj.h };
        let overlap = false;
        for (const other of others) {
          if (other === obj || !other.visible) continue;
          if (U.rectsOverlap(r, rect(other))) { overlap = true; break; }
        }
        if (!overlap) return p;
        best = p;
      }
      return best;
    }

    /* ------------------------------ objetivo ------------------------------ */
    checkGoal() {
      if (!this.def.goal) return;
      const g = this.def.goal;
      if (g.type === 'switches') {
        // Cada grupo es una condición AND de interruptores; los grupos se
        // combinan con OR: basta con que uno esté completo para ganar.
        const groups = Array.isArray(g.groups) ? g.groups : [];
        for (const group of groups) {
          if (!Array.isArray(group) || !group.length) continue;
          if (group.every(id => {
            const o = this.getObject(id);
            return !!(o && o.switch);
          })) {
            this.win('switches');
            break;
          }
        }
      } else if (g.type === 'switch' && g.objectId) {
        const o = this.getObject(g.objectId);
        if (o && o.switch) this.win('switch');
      } else if (g.type === 'touch' && g.objectId) {
        for (const tap of this.taps) {
          if (tap.id === g.objectId) { this.win('touch'); break; }
        }
      } else if (g.type === 'reach' && g.objectId && g.zoneId) {
        const o = this.getObject(g.objectId);
        const z = this.getZone(g.zoneId);
        if (o && z && U.overlapRatio(rect(o), z) > 0.25) this.win('reach');
      }
    }

    win(reason) {
      if (this.won || this.lost) return;
      this.won = true;
      this.winThisFrame = true;
      this.finishReason = reason || 'goal';
      this.effects.winFlash = 600;
      if (this.onWin) this.onWin(this);
    }
    lose() {
      if (this.lost || this.won) return;
      this.lost = true;
      this.loseThisFrame = true;
      this.effects.loseFlash = 600;
    }

    finish() {
      if (this.ended) return;
      const g = this.def.goal || { type: 'survive' };
      // Sin condiciones de interruptores configuradas, el microjuego se gana
      // sobreviviendo hasta el final (comportamiento seguro por defecto).
      const noSwitchGroups = g.type === 'switches' &&
        (!Array.isArray(g.groups) || !g.groups.some(gr => Array.isArray(gr) && gr.length));
      if (!this.lost && !this.won && (g.type === 'survive' || noSwitchGroups)) {
        this.won = true;
        this.winThisFrame = true;
        this.finishReason = 'survive';
      }
      if (!this.won) this.lost = true;
      this.ended = true;
      this.result = {
        won: this.won,
        lost: this.lost,
        reason: this.winReasonText(),
        time: this.t
      };
      if (this.onFinish) this.onFinish(this.result);
    }

    winReasonText() {
      if (!this.won) return 'No conseguiste el objetivo a tiempo.';
      switch (this.def.goal && this.def.goal.type) {
        case 'switches': return '¡Interruptores activados!';
        case 'switch': return '¡Interruptor activado!';
        case 'touch': return '¡Has tocado el objetivo!';
        case 'reach': return '¡Objetivo alcanzado!';
        default: return '¡Has sobrevivido hasta el final!';
      }
    }

    /* ------------------------------ reglas ------------------------------ */
    evalRules(dt) {
      for (const rule of this.def.rules || []) {
        if (!rule.enabled) continue;
        const cond = this.triggerState(rule);
        const st = this.ruleState[rule.id] || (this.ruleState[rule.id] = { fired: false });
        if (cond && (!st.fired || rule.repeat)) {
          st.fired = true;
          for (const action of rule.actions || []) {
            try { this.runAction(action, rule); } catch (e) { console.warn('Acción con error', action, e); }
          }
        }
        if (!cond) st.fired = false;
      }
    }

    triggerState(rule) {
      let result = this.triggerStateOne(rule, rule.trigger);
      // Cadena de activadores: se evalúa de izquierda a derecha con el
      // conector Y/O indicado en cada activador adicional.
      for (const extra of rule.extraTriggers || []) {
        if (!extra || !extra.trigger) continue;
        const value = this.triggerStateOne(rule, extra.trigger);
        result = extra.logic === 'or' ? (result || value) : (result && value);
      }
      return result;
    }

    triggerStateOne(rule, trig) {
      if (!trig) return false;
      const subject = this.getObject(rule.subject);
      // Un objeto invisible no puede tocarse, ni solaparse, ni activar reglas
      // de contacto o animación. Su interruptor sí sigue existiendo.
      if (subject && !subject.visible &&
          ['tap', 'touch', 'overlap', 'anim'].indexOf(trig.type) >= 0) return false;
      switch (trig.type) {
        case 'tap': {
          if (trig.where === 'stage') return this.taps.length > 0;
          if (!subject) return false;
          return this.taps.some(t => t.id === subject.id);
        }
        case 'touch': {
          if (!subject) return false;
          const other = trig.mode === 'zone' ? this.getZone(trig.zoneId) : this.getObject(trig.objectId);
          if (!other) return false;
          if (other.visible === false) return false;
          return U.rectsTouch(rect(subject), other, 8);
        }
        case 'overlap': {
          if (!subject) return false;
          const other = trig.mode === 'zone' ? this.getZone(trig.zoneId) : this.getObject(trig.objectId);
          if (!other || other.visible === false) return false;
          const inter = U.overlapRatio(rect(subject), other);
          return inter >= 0.45;
        }
        case 'anim': {
          if (!subject) return false;
          if (trig.mode === 'end') return !!subject.lastLoop;
          if (trig.animation != null && subject.anim !== trig.animation) return false;
          if (trig.frame != null && subject.frame !== trig.frame) return false;
          return true;
        }
        case 'time': {
          if (trig.mode === 'interval') return this.t >= trig.from && this.t < trig.to;
          return this.t >= trig.at;
        }
        case 'switch': {
          const obj = trig.objectId === 'self' ? subject : this.getObject(trig.objectId);
          if (!obj) return false;
          if (trig.mode === 'turnOn') return obj.turnedOn;
          if (trig.mode === 'turnOff') return obj.turnedOff;
          if (trig.mode === 'isOn') return obj.switch;
          return !obj.switch;
        }
        case 'result': {
          switch (trig.mode) {
            case 'win': return this.winThisFrame;
            case 'afterWin': return this.won;
            case 'beforeWin': return !this.won;
            case 'lose': return this.loseThisFrame;
            case 'afterLose': return this.lost;
            case 'beforeLose': return !this.lost;
          }
          return false;
        }
      }
      return false;
    }

    actorFor(action, rule) {
      if (action.target && action.target !== 'self') return this.getObject(action.target);
      return this.getObject(rule.subject);
    }

    runAction(action, rule) {
      const actor = this.actorFor(action, rule);
      // Las reglas no modifican objetos invisibles: no se pueden mover, saltar,
      // cambiar de animación, etc. Se exceptúan el interruptor (que se conserva),
      // la propia visibilidad y los efectos globales/sonidos.
      const hiddenOk = ['switch', 'invisible', 'lose', 'sound', 'effect', 'text'];
      if (actor && actor.visible === false && hiddenOk.indexOf(action.type) < 0) return;
      switch (action.type) {
        case 'moveDir': {
          if (!actor) break;
          const a = (action.dir % 8) * Math.PI / 4;
          actor.motion = { type: 'straight' };
          actor.vx = Math.cos(a) * action.speed;
          actor.vy = Math.sin(a) * action.speed;
          break;
        }
        case 'moveRandom': {
          if (!actor) break;
          const a = Math.random() * Math.PI * 2;
          actor.motion = { type: 'straight' };
          actor.vx = Math.cos(a) * action.speed;
          actor.vy = Math.sin(a) * action.speed;
          break;
        }
        case 'moveTo': {
          if (!actor) break;
          actor.motion = { type: 'seek', x: action.x, y: action.y, speed: action.speed };
          break;
        }
        case 'moveFrom': {
          if (!actor) break;
          let sx, sy;
          if (action.fromMode === 'object') {
            const from = this.getObject(action.fromObjectId);
            if (!from) break;
            sx = from.x + from.w / 2; sy = from.y + from.h / 2;
          } else {
            sx = action.x; sy = action.y;
          }
          const ox = actor.x + actor.w / 2, oy = actor.y + actor.h / 2;
          actor.x = sx - actor.w / 2;
          actor.y = sy - actor.h / 2;
          const dx = ox - sx, dy = oy - sy;
          const dist = Math.hypot(dx, dy);
          if (dist < 1) {
            actor.motion = null; actor.vx = 0; actor.vy = 0;
          } else {
            actor.motion = { type: 'straight' };
            actor.vx = (dx / dist) * action.speed;
            actor.vy = (dy / dist) * action.speed;
          }
          break;
        }
        case 'jumpPoint': {
          if (!actor) break;
          actor.motion = null; actor.vx = 0; actor.vy = 0;
          actor.x = action.x - actor.w / 2;
          actor.y = action.y - actor.h / 2;
          break;
        }
        case 'jumpZone': {
          if (!actor) break;
          const z = this.getZone(action.zoneId);
          if (!z) break;
          const p = this.pickPointInZone(z, actor, action.avoid, this.objects);
          actor.motion = null; actor.vx = 0; actor.vy = 0;
          actor.x = p.x; actor.y = p.y;
          break;
        }
        case 'jumpObject': {
          if (!actor) break;
          const dest = this.getObject(action.objectId);
          if (!dest) break;
          actor.motion = null; actor.vx = 0; actor.vy = 0;
          actor.x = dest.x + dest.w / 2 - actor.w / 2;
          actor.y = dest.y + dest.h / 2 - actor.h / 2;
          break;
        }
        case 'wander': {
          if (!actor) break;
          const z = this.getZone(action.zoneId);
          if (!z) break;
          actor.motion = {
            type: action.mode === 'billiard' ? 'billiard' : (action.mode === 'fly' ? 'fly' : (action.mode === 'ball' ? 'ball' : 'wobble')),
            zoneId: action.zoneId, speed: action.speed, avoid: !!action.avoid,
            timer: 0, tx: 0, ty: 0
          };
          actor.x = U.clamp(actor.x, z.x, z.x + Math.max(0, z.w - actor.w));
          actor.y = U.clamp(actor.y, z.y, z.y + Math.max(0, z.h - actor.h));
          if (action.mode === 'billiard') {
            const a = Math.random() * Math.PI * 2;
            actor.vx = Math.cos(a) * action.speed;
            actor.vy = Math.sin(a) * action.speed;
          } else if (action.mode === 'ball') {
            actor.vx = U.rand(-60, 60);
            actor.vy = 0;
          } else {
            actor.vx = U.rand(-action.speed, action.speed);
            actor.vy = U.rand(-action.speed, action.speed);
          }
          break;
        }
        case 'stop': {
          if (!actor) break;
          actor.motion = null; actor.vx = 0; actor.vy = 0;
          break;
        }
        case 'swap': {
          if (!actor) break;
          const other = this.getObject(action.objectId);
          if (!other || other === actor) break;
          const ax = actor.x, ay = actor.y;
          actor.x = other.x; actor.y = other.y;
          other.x = ax; other.y = ay;
          actor.motion = null; other.motion = null;
          actor.vx = actor.vy = 0;
          other.vx = other.vy = 0;
          break;
        }
        case 'approach': {
          if (!actor) break;
          const other = this.getObject(action.objectId);
          if (!other || other === actor) break;
          actor.motion = { type: 'approach', objectId: action.objectId, distance: action.distance, speed: action.speed };
          break;
        }
        case 'lose':
          this.lose();
          break;
        case 'sound': {
          if (this.onSound) this.onSound(action.soundId);
          else MI.audio.sfx(action.soundId);
          break;
        }
        case 'switch': {
          const obj = action.objectId === 'self' ? actor : (this.getObject(action.objectId) || actor);
          if (!obj) break;
          if (action.value && !obj.switch) { obj.switch = true; obj.turnedOn = true; obj.flashSwitch = 400; }
          if (!action.value && obj.switch) { obj.switch = false; obj.turnedOff = true; obj.flashSwitch = 400; }
          break;
        }
        case 'invisible': {
          if (!actor) break;
          if (action.value) {
            actor.visible = false;
            actor.motion = null;
            actor.vx = 0;
            actor.vy = 0;
          } else {
            actor.visible = true;
          }
          break;
        }
        case 'text': {
          this.dynamicTexts.push({
            text: action.text,
            x: action.x,
            y: action.y,
            size: action.size,
            font: action.font,
            align: action.align,
            color: action.color,
            life: action.duration || 0,
            max: action.duration || 0
          });
          break;
        }
        case 'anim': {
          const obj = action.target === 'self' ? actor : (this.getObject(action.target) || actor);
          if (!obj) break;
          if (action.mode === 'stop') obj.animating = false;
          else {
            if (action.animation != null) obj.anim = U.clamp(action.animation | 0, 0, 3);
            obj.frame = action.frame != null ? U.clamp(action.frame | 0, 0, 3) : 0;
            obj.animTime = 0;
            obj.animating = true;
          }
          break;
        }
        case 'effect':
          this.addEffect(action.effect, action.duration);
          break;
      }
    }

    addEffect(effect, duration) {
      const d = duration || 500;
      switch (effect) {
        case 'flash':
          this.effects.flash = d;
          this.effects.flashMax = d;
          break;
        case 'shake':
          this.effects.shake = d;
          this.effects.shakeMax = d;
          break;
        case 'freeze':
          this.effects.freeze = d;
          this.effects.freezeMax = d;
          break;
        case 'confetti': {
          const colors = ['#ffd23f', '#ff4d5e', '#4fd1ff', '#8bd450', '#ff86c8', '#a45cff', '#ff8a3d'];
          for (let i = 0; i < 90; i++) {
            this.effects.particles.push({
              x: U.rand(40, NS - 40), y: U.rand(-60, NM * 0.4),
              vx: U.rand(-300, 300), vy: U.rand(-720, -140),
              life: U.rand(900, 1900), max: 1900,
              color: U.choice(colors), size: U.rand(6, 12), spin: U.rand(-8, 8), rot: 0
            });
          }
          break;
        }
      }
    }

    updateEffects(dt) {
      if (this.effects.flash > 0) this.effects.flash = Math.max(0, this.effects.flash - dt);
      if (this.effects.shake > 0) this.effects.shake = Math.max(0, this.effects.shake - dt);
      if (this.effects.freeze > 0) this.effects.freeze = Math.max(0, this.effects.freeze - dt);
      if (this.effects.winFlash > 0) this.effects.winFlash = Math.max(0, this.effects.winFlash - dt);
      if (this.effects.loseFlash > 0) this.effects.loseFlash = Math.max(0, this.effects.loseFlash - dt);
      const sec = dt / 1000;
      const ps = this.effects.particles;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life -= dt;
        if (p.life <= 0) { ps.splice(i, 1); continue; }
        p.vy += 420 * sec;
        p.x += p.vx * sec;
        p.y += p.vy * sec;
        p.rot += p.spin * sec;
        if (p.y > NM + 20) ps.splice(i, 1);
      }
      const rs = this.effects.ripples;
      for (let i = rs.length - 1; i >= 0; i--) {
        rs[i].life -= dt;
        if (rs[i].life <= 0) rs.splice(i, 1);
      }
    }

    /* ------------------------------ render ------------------------------ */
    drawText(ctx, t, alpha) {
      if (!t || !t.text) return;
      const a = alpha == null ? 1 : alpha;
      if (a <= 0) return;
      ctx.save();
      ctx.globalAlpha = a;
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

    render(ctx) {
      const fx = this.effects;
      let shakeX = 0, shakeY = 0;
      if (fx.shake > 0) {
        const amp = 18 * (fx.shake / Math.max(1, fx.shakeMax));
        shakeX = U.rand(-amp, amp);
        shakeY = U.rand(-amp, amp);
      }
      ctx.save();
      ctx.clearRect(0, 0, NS, NM);
      MI.sprites.background(ctx, this.def.bg, NS, NM);
      // Textos fijos del escenario (debajo de los objetos).
      for (const t of this.stageTexts) this.drawText(ctx, t, 1);
      ctx.translate(shakeX, shakeY);
      ctx.imageSmoothingEnabled = false;
      for (const o of this.objects) {
        if (!o.visible) continue;
        const anim = MI.objectAnimations(o.def)[o.anim] || MI.objectAnimations(o.def)[0];
        const data = (anim && anim.frames[o.frame]) || (anim && anim.frames[0]);
        if (o.flashSwitch > 0) o.flashSwitch = Math.max(0, o.flashSwitch - 16);
        MI.sprites.draw(ctx, data, o.x, o.y, o.w, o.h);
      }
      // Textos creados por la acción «Añadir texto» (encima de los objetos).
      for (const t of this.dynamicTexts) {
        let a = 1;
        if (t.life > 0 && t.max > 0) a = U.clamp(t.life / Math.min(320, t.max), 0, 1);
        this.drawText(ctx, t, a);
      }
      // ondas de toque
      for (const r of fx.ripples) {
        const k = 1 - r.life / r.max;
        ctx.globalAlpha = (1 - k) * 0.6;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 12 + k * 52, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // confeti
      for (const p of fx.particles) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life / 400);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.4);
        ctx.restore();
      }
      ctx.restore();

      if (fx.flash > 0) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.75 * fx.flash / Math.max(1, fx.flashMax)) + ')';
        ctx.fillRect(0, 0, NS, NM);
      }
      if (fx.freeze > 0) {
        ctx.fillStyle = 'rgba(79,209,255,0.18)';
        ctx.fillRect(0, 0, NS, NM);
        ctx.strokeStyle = 'rgba(200,245,255,0.6)';
        ctx.lineWidth = 6;
        ctx.strokeRect(6, 6, NS - 12, NM - 12);
      }
      if (fx.winFlash > 0) {
        ctx.fillStyle = 'rgba(139,212,80,' + (0.3 * fx.winFlash / 600) + ')';
        ctx.fillRect(0, 0, NS, NM);
      }
      if (fx.loseFlash > 0) {
        ctx.fillStyle = 'rgba(255,77,94,' + (0.35 * fx.loseFlash / 600) + ')';
        ctx.fillRect(0, 0, NS, NM);
      }
    }

    renderTo(canvas) {
      const ctx = canvas.getContext('2d');
      this.render(ctx);
    }
  }

  MI.Game = Game;
  MI.engine = { W: NS, H: NM };

})();
