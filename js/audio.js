/* ============================================================
   MICROGAMES INC. — audio.js
   Sintetizador 8-bit (Web Audio) + secuenciador de música
   ============================================================ */
(function () {
  'use strict';
  const MI = window.MI;

  const SOUNDS = {
    blip: 'Blip', select: 'Seleccionar', coin: 'Moneda', jump: 'Salto',
    hit: 'Golpe', boom: 'Explosión', power: 'Poder', laser: 'Láser',
    pop: 'Pop', win: 'Victoria', lose: 'Derrota', switch: 'Interruptor',
    whoosh: 'Silbido', sparkle: 'Destello', hint: 'Pista'
  };

  const TRACKS = {
    alegre: {
      name: 'Día soleado', mood: 'Alegre · 138 BPM', bpm: 138, wave: 'square',
      lead: [76, 79, 84, 79, 76, 72, 74, 76, 77, 81, 84, 81, 79, 76, 74, 72,
        76, 79, 84, 86, 84, 79, 76, 74, 72, 74, 76, 79, 81, 79, 76, 72],
      bass: [48, 0, 55, 0, 53, 0, 55, 0, 50, 0, 57, 0, 55, 0, 48, 0],
      drums: 'k.h.s.h.k.h.s.hh'
    },
    tenso: {
      name: 'Alerta roja', mood: 'Tenso · 152 BPM', bpm: 152, wave: 'square',
      lead: [69, 72, 76, 72, 69, 72, 76, 79, 77, 74, 71, 74, 69, 72, 76, 72,
        69, 72, 76, 81, 79, 76, 72, 71, 69, 72, 71, 69, 67, 71, 74, 79],
      bass: [45, 0, 45, 52, 45, 0, 45, 52, 43, 0, 43, 50, 43, 0, 43, 50],
      drums: 'khskhskhk.hskhsk'
    },
    misterio: {
      name: 'Noche rara', mood: 'Misterio · 100 BPM', bpm: 100, wave: 'triangle',
      lead: [57, 0, 60, 0, 63, 0, 60, 0, 58, 0, 61, 0, 65, 0, 61, 0,
        57, 0, 60, 0, 63, 0, 67, 0, 65, 0, 63, 0, 60, 0, 58, 0],
      bass: [33, 0, 0, 0, 34, 0, 0, 0, 31, 0, 0, 0, 29, 0, 0, 0],
      drums: '..h...h...h...h.'
    },
    carrera: {
      name: 'Turbo', mood: 'Rápida · 174 BPM', bpm: 174, wave: 'square',
      lead: [72, 76, 79, 84, 72, 76, 79, 84, 74, 77, 81, 86, 74, 77, 81, 86,
        76, 79, 84, 88, 76, 79, 84, 88, 77, 81, 84, 89, 84, 81, 77, 74],
      bass: [48, 48, 55, 48, 48, 48, 55, 48, 50, 50, 57, 50, 50, 50, 57, 50],
      drums: 'khkhshkhkhkhshkh'
    },
    fiesta: {
      name: 'Fiesta píxel', mood: 'Fiestera · 160 BPM', bpm: 160, wave: 'square',
      lead: [72, 0, 76, 79, 0, 76, 72, 0, 74, 0, 77, 81, 0, 77, 74, 0,
        76, 0, 79, 84, 0, 79, 76, 0, 79, 77, 76, 74, 72, 0, 67, 0],
      bass: [48, 0, 48, 55, 0, 48, 48, 0, 50, 0, 50, 57, 0, 50, 50, 0],
      drums: 'k.hks.hkk.hks.hk'
    },
    jefe: {
      name: 'Jefe final', mood: 'Épica · 180 BPM', bpm: 180, wave: 'sawtooth',
      lead: [64, 64, 67, 64, 70, 69, 67, 64, 64, 64, 67, 70, 72, 70, 67, 64,
        65, 65, 68, 65, 71, 70, 68, 65, 67, 67, 70, 73, 75, 73, 70, 67],
      bass: [40, 40, 40, 40, 36, 36, 36, 36, 38, 38, 38, 38, 35, 35, 35, 35],
      drums: 'khkkhskhkhkkhskh'
    },
    reloj: {
      name: 'Cuenta atrás', mood: 'Urgente · 190 BPM', bpm: 190, wave: 'square',
      lead: [81, 0, 81, 0, 81, 0, 84, 0, 83, 0, 83, 0, 83, 0, 81, 0,
        81, 0, 81, 0, 81, 0, 78, 0, 79, 0, 79, 0, 79, 0, 76, 0],
      bass: [45, 45, 45, 45, 45, 45, 45, 45, 44, 44, 44, 44, 44, 44, 44, 44],
      drums: 'hhshhhshhhshhhsh'
    }
  };

  function midiFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  const A = {
    ctx: null,
    master: null,
    muted: (MI.store && MI.store.settings().muted) || false,
    music: null,
    speed: 1,
    unlocked: false,

    ensure() {
      if (this.ctx) return this.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.9;
        this.master.connect(this.ctx.destination);
        this.noiseBuffer = this.makeNoise();
      } catch (e) {
        console.warn('Audio no disponible', e);
        this.ctx = null;
      }
      return this.ctx;
    },
    unlock() {
      const ctx = this.ensure();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      this.unlocked = true;
    },
    makeNoise() {
      const ctx = this.ctx;
      const len = ctx.sampleRate * 0.5;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    },
    setMuted(m) {
      this.muted = !!m;
      MI.store.setSettings({ muted: this.muted });
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
      }
      if (this.muted) this.stopMusic();
      document.dispatchEvent(new CustomEvent('mi:mute', { detail: this.muted }));
      return this.muted;
    },
    toggleMute() { return this.setMuted(!this.muted); },

    /* ------------------------- síntesis ------------------------- */
    tone(opts) {
      const ctx = this.ensure();
      if (!ctx || this.muted) return;
      const t0 = (opts.when || ctx.currentTime);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = opts.type || 'square';
      osc.frequency.setValueAtTime(Math.max(20, opts.freq || 440), t0);
      if (opts.slide) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t0 + (opts.dur || 0.1));
      }
      const vol = (opts.vol == null ? 0.14 : opts.vol);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (opts.dur || 0.1));
      osc.connect(g);
      g.connect(opts.dest || this.master);
      osc.start(t0);
      osc.stop(t0 + (opts.dur || 0.1) + 0.03);
    },
    noise(opts) {
      const ctx = this.ensure();
      if (!ctx || this.muted || !this.noiseBuffer) return;
      const t0 = opts.when || ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = opts.filter || 'highpass';
      filter.frequency.setValueAtTime(opts.freq || 1200, t0);
      if (opts.sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(40, opts.sweep), t0 + (opts.dur || 0.1));
      const g = ctx.createGain();
      const vol = opts.vol == null ? 0.1 : opts.vol;
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (opts.dur || 0.12));
      src.connect(filter); filter.connect(g); g.connect(opts.dest || this.master);
      src.start(t0);
      src.stop(t0 + (opts.dur || 0.12) + 0.03);
    },

    sfx(id) {
      const ctx = this.ensure();
      if (!ctx || this.muted) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      switch (id) {
        case 'blip':
          this.tone({ freq: 880, slide: 1320, dur: 0.07, vol: 0.1 });
          break;
        case 'select':
          this.tone({ freq: 660, dur: 0.05, vol: 0.09 });
          this.tone({ freq: 990, dur: 0.07, vol: 0.09, when: now + 0.055 });
          break;
        case 'coin':
          this.tone({ freq: 988, dur: 0.06, vol: 0.11 });
          this.tone({ freq: 1319, dur: 0.16, vol: 0.11, when: now + 0.06 });
          break;
        case 'jump':
          this.tone({ freq: 280, slide: 880, dur: 0.14, vol: 0.1 });
          break;
        case 'hit':
          this.noise({ freq: 2600, sweep: 600, dur: 0.16, vol: 0.14 });
          this.tone({ freq: 160, slide: 80, dur: 0.16, vol: 0.12, type: 'square' });
          break;
        case 'boom':
          this.noise({ freq: 1200, sweep: 90, dur: 0.45, vol: 0.2, filter: 'lowpass' });
          this.tone({ freq: 90, slide: 40, dur: 0.4, vol: 0.14, type: 'triangle' });
          break;
        case 'power':
          [523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, dur: 0.08, vol: 0.09, when: now + i * 0.055 }));
          break;
        case 'laser':
          this.tone({ freq: 2100, slide: 220, dur: 0.18, vol: 0.09, type: 'sawtooth' });
          break;
        case 'pop':
          this.tone({ freq: 400, slide: 120, dur: 0.07, vol: 0.11, type: 'sine' });
          break;
        case 'win':
          [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ freq: f, dur: 0.13, vol: 0.11, when: now + i * 0.09 }));
          break;
        case 'lose':
          [392, 330, 262, 196].forEach((f, i) => this.tone({ freq: f, dur: 0.16, vol: 0.12, when: now + i * 0.12, type: 'square' }));
          break;
        case 'switch':
          this.tone({ freq: 1200, dur: 0.025, vol: 0.08 });
          this.tone({ freq: 800, dur: 0.04, vol: 0.08, when: now + 0.03 });
          break;
        case 'whoosh':
          this.noise({ freq: 3000, sweep: 200, dur: 0.3, vol: 0.08, filter: 'bandpass' });
          break;
        case 'sparkle':
          [1319, 1568, 2093, 2637].forEach((f, i) => this.tone({ freq: f, dur: 0.07, vol: 0.06, when: now + i * 0.035, type: 'triangle' }));
          break;
        case 'hint':
          this.tone({ freq: 523, dur: 0.09, vol: 0.1, when: now + 0.02 });
          this.tone({ freq: 784, dur: 0.11, vol: 0.1, when: now + 0.12 });
          this.tone({ freq: 1047, slide: 1568, dur: 0.22, vol: 0.11, when: now + 0.24, type: 'triangle' });
          this.tone({ freq: 2093, dur: 0.18, vol: 0.045, when: now + 0.3, type: 'sine' });
          break;
        case 'tick':
          this.tone({ freq: 1400, dur: 0.02, vol: 0.06 });
          break;
        default:
          this.tone({ freq: 700, dur: 0.06, vol: 0.08 });
      }
    },

    /* ------------------------- música ------------------------- */
    setSpeed(s) {
      this.speed = Math.max(0.3, Math.min(3, s || 1));
      if (this.music) this.music.speed = this.speed;
    },
    playMusic(trackId, opts) {
      opts = opts || {};
      const ctx = this.ensure();
      if (!ctx || this.muted) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const track = TRACKS[trackId] || TRACKS.alegre;
      this.stopMusic();
      this.speed = Math.max(0.3, Math.min(3, opts.speed || 1));
      const music = {
        track, step: 0, next: ctx.currentTime + 0.08, timer: null,
        speed: this.speed, playing: true, token: Math.random()
      };
      this.music = music;
      const tick = () => {
        if (!this.music || this.music.token !== music.token) return;
        const now = ctx.currentTime;
        const stepDur = (60 / track.bpm / 4) / music.speed;
        if (music.next < now - 0.3) music.next = now;
        while (music.next < now + 0.14) {
          this.scheduleStep(track, music.step, music.next, stepDur);
          music.step++;
          music.next += stepDur;
        }
      };
      tick();
      music.timer = setInterval(tick, 45);
      this.music = music;
    },
    scheduleStep(track, step, when, stepDur) {
      const lead = track.lead[step % track.lead.length];
      if (lead) {
        this.tone({
          freq: midiFreq(lead), dur: Math.max(0.04, stepDur * 1.55),
          type: track.wave, vol: 0.055, when
        });
        if (track.wave === 'square') {
          this.tone({
            freq: midiFreq(lead) / 2, dur: Math.max(0.03, stepDur * 1.3),
            type: 'triangle', vol: 0.028, when
          });
        }
      }
      if (step % 2 === 0) {
        const bass = track.bass[(step / 2) % track.bass.length];
        if (bass) {
          this.tone({ freq: midiFreq(bass) / 2, dur: stepDur * 1.7, type: 'triangle', vol: 0.09, when });
        }
      }
      const d = track.drums[step % track.drums.length];
      if (d === 'k') {
        this.tone({ freq: 150, slide: 45, dur: 0.12, type: 'sine', vol: 0.15, when });
      } else if (d === 's') {
        this.noise({ freq: 1600, dur: 0.09, vol: 0.055, when });
      } else if (d === 'h') {
        this.noise({ freq: 7000, dur: 0.03, vol: 0.028, when, filter: 'highpass' });
      }
    },
    stopMusic() {
      if (this.music) {
        this.music.playing = false;
        if (this.music.timer) clearInterval(this.music.timer);
        this.music = null;
      }
    },
    pauseMusic() {
      if (this.music) {
        if (this.music.timer) clearInterval(this.music.timer);
        this.music.paused = true;
        this.music.playing = false;
      }
    },
    resumeMusic() {
      if (this.music && this.music.paused) {
        this.music.paused = false;
        this.music.playing = true;
        this.music.next = (this.ctx ? this.ctx.currentTime : 0) + 0.06;
        const m = this.music;
        const tick = () => {
          if (!this.music || this.music !== m || !m.playing) return;
          const now = this.ctx.currentTime;
          const stepDur = (60 / m.track.bpm / 4) / m.speed;
          while (m.next < now + 0.14) {
            this.scheduleStep(m.track, m.step, m.next, stepDur);
            m.step++;
            m.next += stepDur;
          }
        };
        m.timer = setInterval(tick, 45);
      }
    }
  };

  document.addEventListener('pointerdown', () => A.unlock(), { once: true });
  document.addEventListener('keydown', () => A.unlock(), { once: true });

  MI.audio = A;
  MI.audio.SOUNDS = SOUNDS;
  MI.audio.TRACKS = TRACKS;

})();
