// Sound effects and procedural music (SoundEngine) with the music tables per biome.

import { logError } from "../core/diagnostics.js";
import { weaponDefs } from "../data/weapons.js";

/* The sound engine has seven weapon voices; newer weapons borrow the closest one. */
var RL_SFX_VOICES = ["pulse", "scatter", "tesla", "rail", "rocket", "disc", "flame"];
function rlShotSfx(id) {
  const def = weaponDefs[id];
  if (!def) return "pulse";
  if (RL_SFX_VOICES.includes(id)) return id;
  if (def.rail) return "rail";
  if (def.boomerang) return "disc";
  if (def.burn || def.drag) return "flame";
  if (def.explode) return "rocket";
  if (def.chain) return "tesla";
  if (def.count >= 5 || def.cone) return "scatter";
  return "pulse";
}
var musicChords = {
    yard: [
      [57, "m"],
      [53, "M"],
      [48, "M"],
      [55, "M"],
    ],
    works: [
      [50, "m"],
      [46, "M"],
      [48, "M"],
      [45, "m"],
    ],
    vault: [
      [52, "m"],
      [48, "M"],
      [55, "M"],
      [50, "M"],
    ],
    void: [
      [54, "m"],
      [50, "M"],
      [45, "M"],
      [52, "M"],
    ],
    marsh: [
      [53, "m"],
      [56, "M"],
      [51, "M"],
      [48, "m"],
    ],
  },
  musicVoices = {
    yard: { arp: "square", bass: "sawtooth", lp: 2200, lead: "triangle" },
    works: { arp: "sawtooth", bass: "square", lp: 1600, lead: "sawtooth" },
    vault: { arp: "sine", bass: "triangle", lp: 4200, lead: "sine" },
    void: { arp: "square", bass: "sawtooth", lp: 3e3, lead: "square" },
    marsh: { arp: "triangle", bass: "sawtooth", lp: 1200, lead: "triangle" },
  },
  midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12),
  arpPatterns = [
    [0, 1, 2, 3],
    [0, 2, 1, 3, 2, 1],
    [3, 2, 1, 0],
    [0, 2, 3, 1],
  ],
  leadPatterns = [
    [0, null, null, 2, null, null, 3, null, 4, null, 3, null, 2, null, null, null],
    [1, null, 2, null, null, null, 3, null, null, 2, null, 1, null, null, 0, null],
    [2, null, null, 3, null, 4, null, null, 5, null, 4, null, 3, null, null, null],
    [3, null, 2, null, 1, null, null, 0, null, null, 1, null, 2, null, 3, null],
  ],
  SoundEngine = class {
    constructor() {
      this.ctx = null;
      this.ok = typeof window < "u" && !!(window.AudioContext || window.webkitAudioContext);
      this.sfxVol = 0.8;
      this.musVol = 0.45;
      this.last = Object.create(null);
      this.mode = "off";
      this.biome = "yard";
      this.step = 0;
      this.nextT = 0;
      this.timer = null;
      this.combo = 0;
      this.comboT = 0;
      this.intensity = 0;
      this.want = 0;
      this.cycle = 0;
    }
    setIntensity(level) {
      this.want = Math.max(0, Math.min(1, level || 0));
    }
    unlock() {
      if (this.ok)
        try {
          if (!this.ctx) {
            this.init();
          }
          if (this.ctx.state !== "running") {
            this.ctx.resume().catch(() => {});
          }
        } catch (err) {
          this.fail(err);
        }
    }
    init() {
      try {
        if (navigator.audioSession) {
          navigator.audioSession.type = "ambient";
        }
      } catch {}
      let AudioCtx = window.AudioContext || window.webkitAudioContext,
        ctx = (this.ctx = new AudioCtx({ latencyHint: "interactive" }));
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.004;
      this.comp.release.value = 0.2;
      this.comp.connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.gain.value = this.sfxVol;
      this.sfx.connect(this.comp);
      this.mus = ctx.createGain();
      this.mus.gain.value = this.musVol * 0.6;
      this.mus.connect(this.comp);
      this.delay = ctx.createDelay(1);
      this.delay.delayTime.value = 0.28;
      this.fb = ctx.createGain();
      this.fb.gain.value = 0.32;
      this.delay.connect(this.fb);
      this.fb.connect(this.delay);
      this.delay.connect(this.mus);
      let len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      let data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      let unlocker = ctx.createBufferSource();
      unlocker.buffer = ctx.createBuffer(1, 1, 22050);
      unlocker.connect(ctx.destination);
      unlocker.start(0);
      this.startScheduler();
    }
    fail(err) {
      if (!this.failed) {
        logError("audio", err);
      }
      this.failed = true;
    }
    setVolumes(sfx, music) {
      this.sfxVol = sfx;
      this.musVol = music;
      if (!this.ctx) return;
      let now = this.ctx.currentTime;
      this.sfx.gain.setTargetAtTime(sfx, now, 0.05);
      this.mus.gain.setTargetAtTime(music * 0.6, now, 0.1);
    }
    suspend() {
      try {
        if (this.ctx && this.ctx.state === "running") {
          this.ctx.suspend();
        }
      } catch {}
    }
    resume() {
      try {
        if (this.ctx && this.ctx.state !== "running") {
          this.ctx.resume().catch(() => {});
        }
      } catch {}
    }
    tone(freq, dur, wave, vol, opts = {}) {
      let ctx = this.ctx,
        start = ctx.currentTime + (opts.at || 0),
        osc = ctx.createOscillator(),
        amp = ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, start);
      if (opts.to) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), start + dur);
      }
      if (opts.detune) {
        osc.detune.value = opts.detune;
      }
      let attack = opts.attack || 0.004;
      amp.gain.setValueAtTime(1e-4, start);
      amp.gain.exponentialRampToValueAtTime(vol, start + attack);
      amp.gain.exponentialRampToValueAtTime(1e-4, start + dur);
      let out = osc;
      if (opts.lp) {
        let filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = opts.lp;
        filter.Q.value = opts.q || 0.7;
        out.connect(filter);
        out = filter;
      }
      out.connect(amp);
      amp.connect(opts.dest || this.sfx);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    }
    noise(dur, vol, opts = {}) {
      let ctx = this.ctx,
        start = ctx.currentTime + (opts.at || 0),
        src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.playbackRate.value = opts.rate || 1;
      let filter = ctx.createBiquadFilter();
      filter.type = opts.type || "lowpass";
      filter.frequency.setValueAtTime(opts.f || 2e3, start);
      if (opts.to) {
        filter.frequency.exponentialRampToValueAtTime(opts.to, start + dur);
      }
      filter.Q.value = opts.q || 0.8;
      let amp = ctx.createGain();
      amp.gain.setValueAtTime(1e-4, start);
      amp.gain.exponentialRampToValueAtTime(vol, start + (opts.attack || 0.003));
      amp.gain.exponentialRampToValueAtTime(1e-4, start + dur);
      src.connect(filter);
      filter.connect(amp);
      amp.connect(opts.dest || this.sfx);
      src.start(start, Math.random() * 0.5);
      src.stop(start + dur + 0.02);
    }
    gate(key, gap) {
      let now = this.ctx.currentTime;
      return this.last[key] && now - this.last[key] < gap ? false : ((this.last[key] = now), true);
    }
    play(id, arg) {
      if (!(!this.ctx || this.ctx.state !== "running" || this.sfxVol <= 0))
        try {
          this._play(id, arg);
        } catch (err) {
          this.fail(err);
        }
    }
    _play(id, arg) {
      let pitch = 1 + (Math.random() - 0.5) * 0.08;
      switch (id) {
        case "pulse":
          if (this.gate(id, 0.05)) {
            this.tone(900 * pitch, 0.07, "square", 0.035, { to: 380, lp: 3500 });
          }
          break;
        case "scatter":
          if (this.gate(id, 0.08)) {
            this.noise(0.16, 0.22, { f: 2600, to: 500 });
            this.tone(140, 0.12, "sine", 0.25, { to: 50 });
          }
          break;
        case "tesla":
          if (this.gate(id, 0.06)) {
            this.tone(1500 * pitch, 0.06, "sawtooth", 0.025, { to: 700, lp: 5e3 });
            this.noise(0.05, 0.05, { type: "bandpass", f: 5e3 });
          }
          break;
        case "rail":
          if (this.gate(id, 0.1)) {
            this.tone(2200, 0.3, "sine", 0.12, { to: 180 });
            this.noise(0.18, 0.12, { f: 6e3, to: 800 });
          }
          break;
        case "rocket":
          if (this.gate(id, 0.08)) {
            this.noise(0.3, 0.12, { f: 900, to: 300 });
            this.tone(220, 0.18, "triangle", 0.08, { to: 110 });
          }
          break;
        case "disc":
          if (this.gate(id, 0.1)) {
            this.noise(0.22, 0.09, { type: "bandpass", f: 1800, to: 700, q: 3 });
            this.tone(620 * pitch, 0.12, "triangle", 0.05, { to: 900 });
          }
          break;
        case "flame":
          if (this.gate(id, 0.11)) {
            this.noise(0.16, 0.07, { type: "bandpass", f: 900 * pitch, q: 0.6, rate: 0.7 });
          }
          break;
        case "block":
          if (this.gate(id, 0.06)) {
            this.tone(2400 * pitch, 0.05, "square", 0.025, { lp: 5e3 });
          }
          break;
        case "guardBreak":
          this.noise(0.3, 0.2, { type: "highpass", f: 2500 });
          this.tone(900, 0.25, "sawtooth", 0.06, { to: 200, lp: 3e3 });
          break;
        case "shieldPop":
          this.tone(1600, 0.2, "sine", 0.07, { to: 500 });
          break;
        case "lob":
          if (this.gate(id, 0.1)) {
            this.tone(120, 0.18, "sine", 0.25, { to: 60 });
            this.noise(0.12, 0.08, { f: 700 });
          }
          break;
        case "blinkWarn":
          if (this.gate(id, 0.1)) {
            this.tone(500, 0.5, "sine", 0.05, { to: 1500, attack: 0.1 });
          }
          break;
        case "blink":
          if (this.gate(id, 0.08)) {
            this.noise(0.12, 0.08, { type: "bandpass", f: 3e3, to: 800, q: 2 });
          }
          break;
        case "combo":
          [0, 0.06, 0.12].forEach((at, i) =>
            this.tone(midiToFreq(76 + Math.min(12, arg || 0) + [0, 4, 7][i]), 0.14, "square", 0.035, {
              at,
              lp: 4e3,
            }),
          );
          break;
        case "heart":
          this.tone(62, 0.12, "sine", 0.35, { to: 45 });
          this.tone(58, 0.12, "sine", 0.25, { to: 42, at: 0.17 });
          break;
        case "evolve":
          [0, 0.09, 0.18, 0.27, 0.45].forEach((at, i) =>
            this.tone(midiToFreq(67 + [0, 4, 7, 11, 14][i]), 0.4, "triangle", 0.08, { at }),
          );
          this.noise(0.8, 0.06, { type: "highpass", f: 5e3, attack: 0.2 });
          break;
        case "hit":
          if (this.gate(id, 0.035)) {
            this.tone(1300 * pitch, 0.03, "triangle", 0.035);
          }
          break;
        case "crit":
          if (this.gate(id, 0.06)) {
            this.tone(2e3 * pitch, 0.06, "square", 0.03, { lp: 4e3 });
          }
          break;
        case "kill":
          if (this.gate(id, 0.03)) {
            let size = arg || 1;
            this.noise(0.14 + size * 0.04, 0.13 * Math.min(2, size), {
              type: "bandpass",
              f: (1500 / Math.sqrt(size)) * pitch,
              q: 1.2,
            });
            this.tone((320 * pitch) / Math.sqrt(size), 0.12, "square", 0.04, { to: 70, lp: 2e3 });
            if (size > 1.3) {
              this.tone(90, 0.22, "sine", 0.22, { to: 40 });
            }
          }
          break;
        case "bigkill":
          this.noise(0.4, 0.3, { f: 1600, to: 200 });
          this.tone(160, 0.35, "sawtooth", 0.12, { to: 40, lp: 900 });
          break;
        case "boom":
          if (this.gate(id, 0.05)) {
            this.noise(0.45, 0.28, { f: 700, to: 120 });
            this.tone(100, 0.35, "sine", 0.3, { to: 35 });
          }
          break;
        case "smallboom":
          if (this.gate(id, 0.05)) {
            this.noise(0.2, 0.12, { f: 1200, to: 300 });
          }
          break;
        case "hurt":
          this.tone(240, 0.22, "sawtooth", 0.15, { to: 90, lp: 1400 });
          this.noise(0.15, 0.2, { f: 900 });
          break;
        case "shield":
          this.tone(1400, 0.35, "sine", 0.1, { to: 700 });
          this.tone(2100, 0.25, "sine", 0.05);
          break;
        case "shieldUp":
          this.tone(700, 0.18, "sine", 0.06, { to: 1400 });
          break;
        case "dash":
          this.noise(0.18, 0.12, { type: "bandpass", f: 700, to: 3200, q: 1.5 });
          break;
        case "nova":
          this.tone(70, 0.9, "sine", 0.45, { to: 28 });
          this.noise(0.9, 0.3, { f: 3e3, to: 150 });
          this.tone(600, 0.5, "sawtooth", 0.06, { to: 60, lp: 2e3 });
          break;
        case "novaReady":
          this.tone(880, 0.12, "sine", 0.07);
          this.tone(1320, 0.2, "sine", 0.07, { at: 0.08 });
          break;
        case "shard": {
          let now = this.ctx.currentTime;
          this.combo = now - this.comboT < 0.4 ? Math.min(this.combo + 1, 14) : 0;
          this.comboT = now;
          if (this.gate(id, 0.03)) {
            this.tone(1100 * Math.pow(1.045, this.combo), 0.06, "sine", 0.04);
          }
          break;
        }
        case "heal":
          this.tone(660, 0.12, "sine", 0.08);
          this.tone(990, 0.2, "sine", 0.08, { at: 0.08 });
          break;
        case "eshot":
          if (this.gate(id, 0.07)) {
            this.tone(520 * pitch, 0.07, "square", 0.025, { to: 300, lp: 1800 });
          }
          break;
        case "snipe":
          this.tone(1700, 0.16, "sine", 0.07, { to: 900 });
          break;
        case "warn":
          if (this.gate(id, 0.15)) {
            this.tone(420, 0.3, "triangle", 0.05, { to: 900 });
          }
          break;
        case "fuse":
          if (this.gate(id, 0.1)) {
            this.tone(1200, 0.4, "square", 0.03, { to: 2400, lp: 3e3 });
          }
          break;
        case "spawn":
          if (this.gate(id, 0.12)) {
            this.noise(0.4, 0.05, { type: "bandpass", f: 400, to: 2400, q: 2 });
          }
          break;
        case "wave":
          [0, 0.14, 0.28].forEach((at, i) =>
            this.tone(midiToFreq(57 + [0, 3, 7][i]), 0.35, "sawtooth", 0.06, { at, lp: 1800 }),
          );
          break;
        case "cleared":
          [0, 0.1, 0.2, 0.3].forEach((at, i) =>
            this.tone(midiToFreq(69 + [0, 4, 7, 12][i]), 0.3, "triangle", 0.08, { at }),
          );
          break;
        case "boss":
          this.tone(55, 1.6, "sawtooth", 0.18, { lp: 400, attack: 0.3 });
          this.tone(82.4, 1.6, "sawtooth", 0.12, { lp: 500, attack: 0.3 });
          this.noise(1.4, 0.08, { f: 300, to: 2e3, attack: 0.5 });
          break;
        case "pick":
          [0, 0.07, 0.14].forEach((at, i) =>
            this.tone(midiToFreq(72 + [0, 4, 7][i]), 0.2, "square", 0.04, { at, lp: 3e3 }),
          );
          break;
        case "click":
          this.tone(1800, 0.03, "triangle", 0.04);
          break;
        case "event":
          [0, 0.12, 0.24].forEach((at, i) =>
            this.tone(midiToFreq(62 + [0, 6, 12][i]), 0.3, "sawtooth", 0.05, { at, lp: 2400 }),
          );
          break;
        case "erupt":
          if (this.gate(id, 0.25)) {
            this.noise(0.6, 0.16, { f: 600, to: 2400, attack: 0.05 });
            this.tone(70, 0.5, "sine", 0.18, { to: 40 });
          }
          break;
        case "warp":
          if (this.gate(id, 0.12)) {
            this.tone(420, 0.25, "sine", 0.07, { to: 1400 });
          }
          break;
        case "mend":
          if (this.gate(id, 0.3)) {
            this.tone(880, 0.3, "sine", 0.04, { to: 1320 });
          }
          break;
        case "chill":
          if (this.gate(id, 0.3)) {
            this.tone(2400, 0.2, "sine", 0.05, { to: 1200 });
          }
          break;
        case "champion":
          this.tone(90, 1, "sawtooth", 0.14, { lp: 500, attack: 0.2 });
          this.tone(135, 1, "sawtooth", 0.09, { lp: 600, attack: 0.2 });
          break;
        case "rumble":
          this.tone(55, 0.8, "sawtooth", 0.12, { to: 38, lp: 260, attack: 0.08 });
          this.noise(0.7, 0.12, { f: 400, to: 120, attack: 0.1 });
          break;
        case "ready":
          if (this.gate(id, 0.3)) {
            this.tone(1560, 0.07, "sine", 0.035, { to: 2100 });
          }
          break;
        case "buy":
          this.tone(880, 0.1, "square", 0.05, { lp: 3e3 });
          this.tone(1320, 0.18, "square", 0.05, { at: 0.07, lp: 3e3 });
          break;
        case "deny":
          this.tone(200, 0.15, "square", 0.05, { lp: 900 });
          break;
        case "die":
          this.tone(400, 1.2, "sawtooth", 0.15, { to: 40, lp: 1200 });
          this.noise(1, 0.25, { f: 2e3, to: 100 });
          break;
        case "victory":
          [0, 0.15, 0.3, 0.45, 0.75].forEach((at, i) =>
            this.tone(midiToFreq(64 + [0, 4, 7, 12, 16][i]), 0.5, "triangle", 0.09, { at }),
          );
          break;
        case "thud":
          if (this.gate(id, 0.1)) {
            this.tone(80, 0.3, "sine", 0.3, { to: 30 });
            this.noise(0.2, 0.15, { f: 500 });
          }
          break;
        case "beam":
          if (this.gate(id, 0.2)) {
            this.tone(300, 0.9, "sawtooth", 0.05, { to: 1200, lp: 2500, attack: 0.2 });
          }
          break;
      }
    }
    consume(events) {
      if (!this.ctx || this.ctx.state !== "running") return;
      let kills = 0;
      for (let ev of events)
        switch (ev.k) {
          case "shot":
            this.play(rlShotSfx(ev.w));
            break;
          case "dmg":
            if (!ev.burn) {
              this.play(ev.crit ? "crit" : "hit");
            }
            break;
          case "kill":
            if (ev.boss) {
              this.play("bigkill");
            } else {
              if (kills++ < 3) {
                this.play("kill", ev.elite ? 1.8 : Math.max(1, ev.r * 1.6));
              }
            }
            break;
          case "boom":
            this.play(ev.kind === "payload" || ev.kind === "pop" ? "smallboom" : "boom");
            break;
          case "nova":
            this.play("nova");
            break;
          case "novaReady":
            this.play("novaReady");
            break;
          case "hurt":
            this.play("hurt");
            break;
          case "shieldBreak":
            this.play("shield");
            break;
          case "shieldUp":
            this.play("shieldUp");
            break;
          case "dash":
            this.play("dash");
            break;
          case "edash":
            this.play("blink");
            break;
          case "mine":
            this.play("fuse");
            break;
          case "shard":
            this.play("shard");
            break;
          case "heal":
            this.play("heal");
            break;
          case "eshot":
            this.play(ev.type === "sniper" ? "snipe" : "eshot");
            break;
          case "aim":
          case "charge":
            this.play("warn");
            break;
          case "fuse":
            this.play("fuse");
            break;
          case "portal":
            this.play("spawn");
            break;
          case "wave":
            this.play(ev.boss ? "boss" : "wave");
            break;
          case "cleared":
            this.play("cleared");
            break;
          case "die":
            this.play("die");
            break;
          case "victory":
            this.play("victory");
            break;
          case "thud":
            this.play("thud");
            break;
          case "beamWarn":
            this.play("beam");
            break;
          case "revive":
            this.play("nova");
            break;
          case "pick":
            this.play(ev.evo ? "evolve" : "pick");
            break;
          case "block":
            this.play("block");
            break;
          case "guardBreak":
            this.play("guardBreak");
            break;
          case "shieldPop":
            this.play("shieldPop");
            break;
          case "lob":
            this.play("lob");
            break;
          case "blinkWarn":
            this.play("blinkWarn");
            break;
          case "blink":
            this.play("blink");
            break;
          case "erupt":
            this.play("erupt");
            break;
          case "warp":
            this.play("warp");
            break;
          case "mend":
          case "chill":
          case "champion":
            this.play(ev.k);
            break;
          case "championDown":
            this.play("bigkill");
            break;
          case "combo":
            this.play("combo", Math.round(Math.log2(ev.n / 10) * 3));
            break;
        }
    }
    setMusic(mode, biome) {
      this.mode = mode;
      if (biome) {
        this.biome = biome;
      }
    }
    startScheduler() {
      if (!this.timer) {
        this.nextT = this.ctx.currentTime + 0.1;
        this.timer = setInterval(() => {
          try {
            this.schedule();
          } catch (err) {
            this.fail(err);
            clearInterval(this.timer);
          }
        }, 30);
      }
    }
    schedule() {
      let ctx = this.ctx;
      if (!ctx || ctx.state !== "running") return;
      if (this.nextT < ctx.currentTime - 0.5) {
        this.nextT = ctx.currentTime + 0.05;
      }
      let stepLen = 60 / (this.mode === "boss" ? 134 : this.mode === "fight" ? 122 : 100) / 4;
      for (; this.nextT < ctx.currentTime + 0.14; ) {
        if (this.mode !== "off" && this.musVol > 0) {
          this.note(this.step, this.nextT);
        }
        this.nextT += stepLen;
        this.step = (this.step + 1) % 64;
        if (this.step === 0) {
          this.cycle++;
        }
        this.intensity += (this.want - this.intensity) * 0.02;
      }
    }
    note(step, time) {
      let chords = musicChords[this.biome] || musicChords.yard,
        bar = Math.floor(step / 16),
        beat = step % 16,
        [root, quality] = chords[bar],
        chord = [root, root + (quality === "m" ? 3 : 4), root + 7, root + 12],
        fight = this.mode === "fight" || this.mode === "boss",
        boss = this.mode === "boss",
        at = time - this.ctx.currentTime,
        dest = this.mus;
      if (fight) {
        let level = boss ? Math.max(0.7, this.intensity) : this.intensity,
          cycle = this.cycle,
          fill = cycle % 2 === 1 && bar === 3 && beat >= 12;
        if (beat % 4 === 0 && !(fill && beat > 12)) {
          this.tone(150, 0.14, "sine", 0.5, { to: 42, dest, at });
        }
        if (level > 0.62 && beat % 8 === 7) {
          this.tone(140, 0.1, "sine", 0.3, { to: 45, dest, at });
        }
        if (beat % 4 === 2) {
          this.noise(0.03, 0.07, { type: "highpass", f: 7500, dest, at });
        }
        if ((level > 0.32 || boss) && beat % 2 === 1) {
          this.noise(0.02, 0.03 + level * 0.02, { type: "highpass", f: 9e3, dest, at });
        }
        if (fill) {
          this.noise(0.08, 0.06 + (beat - 12) * 0.025, {
            type: "bandpass",
            f: 1500 + (beat - 12) * 250,
            q: 0.9,
            dest,
            at,
          });
        } else {
          if (beat === 4 || beat === 12) {
            this.noise(0.14, 0.14, { type: "bandpass", f: 1800, q: 0.8, dest, at });
          }
        }
        let voice = musicVoices[this.biome] || musicVoices.yard;
        if (beat % 2 === 0) {
          this.tone(midiToFreq(root - 24 + (beat % 8 === 6 ? 12 : 0)), 0.16, voice.bass, 0.11, {
            lp: (boss ? 700 : 520) + level * 380,
            dest,
            at,
          });
        }
        if (beat % 2 === 0 || boss || level > 0.8) {
          let pattern = arpPatterns[cycle % arpPatterns.length],
            idx = (beat / (boss || level > 0.8 ? 1 : 2)) | 0,
            midi = chord[pattern[idx % pattern.length]] + (cycle % 4 === 3 ? 24 : 12);
          this.tone(midiToFreq(midi), 0.1, voice.arp, voice.arp === "sine" ? 0.045 : 0.025, {
            lp: voice.lp + level * 1600,
            dest: this.delay,
            at,
          });
        }
        if ((level > 0.45 || boss) && cycle % 2 === 0) {
          let note = leadPatterns[bar % leadPatterns.length][beat];
          if (note != null) {
            this.tone(
              midiToFreq(chord[note % 4] + 24 + (note >= 4 ? 12 : 0)),
              0.22,
              voice.lead,
              voice.lead === "sawtooth" || voice.lead === "square" ? 0.028 : 0.045,
              { dest: this.delay, at, attack: 0.01, lp: 3e3 },
            );
          }
        }
      } else {
        if (beat === 0)
          for (let midi of chord.slice(0, 3)) {
            this.tone(midiToFreq(midi - 12), stepSeconds(100) * 16, "sawtooth", 0.025, {
              lp: 800,
              attack: 0.6,
              dest,
              at,
              detune: 7,
            });
            this.tone(midiToFreq(midi - 12), stepSeconds(100) * 16, "sawtooth", 0.02, {
              lp: 800,
              attack: 0.6,
              dest,
              at,
              detune: -7,
            });
          }
        if (beat % 4 === 0 && (step * 7) % 3 !== 0) {
          this.tone(midiToFreq(chord[((step / 4) % 4) | 0] + 12), 0.4, "triangle", 0.04, { dest: this.delay, at });
        }
        if (beat === 0) {
          this.tone(midiToFreq(root - 24), 1.6, "sine", 0.12, { dest, at, attack: 0.05 });
        }
      }
    }
  };
function stepSeconds(bpm) {
  return 60 / bpm / 4;
}

export { musicChords, RL_SFX_VOICES, rlShotSfx, musicVoices, SoundEngine };
