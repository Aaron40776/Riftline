// Sound effects and procedural music (SoundEngine) with the music tables per biome.

import { logError } from "../core/diagnostics.js";
import { weaponDefs } from "../data/weapons.js";

/* The sound engine has seven weapon voices; newer weapons borrow the closest one. */
var RL_SFX_VOICES = ["pulse", "scatter", "tesla", "rail", "rocket", "disc", "flame"];
function rlShotSfx(id) {
  const d = weaponDefs[id];
  if (!d) return "pulse";
  if (RL_SFX_VOICES.includes(id)) return id;
  if (d.rail) return "rail";
  if (d.boomerang) return "disc";
  if (d.burn || d.drag) return "flame";
  if (d.explode) return "rocket";
  if (d.chain) return "tesla";
  if (d.count >= 5 || d.cone) return "scatter";
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
  midiToFreq = (i) => 440 * Math.pow(2, (i - 69) / 12),
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
      ((this.ctx = null),
        (this.ok = typeof window < "u" && !!(window.AudioContext || window.webkitAudioContext)),
        (this.sfxVol = 0.8),
        (this.musVol = 0.45),
        (this.last = Object.create(null)),
        (this.mode = "off"),
        (this.biome = "yard"),
        (this.step = 0),
        (this.nextT = 0),
        (this.timer = null),
        (this.combo = 0),
        (this.comboT = 0),
        (this.intensity = 0),
        (this.want = 0),
        (this.cycle = 0));
    }
    setIntensity(t) {
      this.want = Math.max(0, Math.min(1, t || 0));
    }
    unlock() {
      if (this.ok)
        try {
          (this.ctx || this.init(), this.ctx.state !== "running" && this.ctx.resume().catch(() => {}));
        } catch (t) {
          this.fail(t);
        }
    }
    init() {
      try {
        navigator.audioSession && (navigator.audioSession.type = "ambient");
      } catch {}
      let t = window.AudioContext || window.webkitAudioContext,
        e = (this.ctx = new t({ latencyHint: "interactive" }));
      ((this.comp = e.createDynamicsCompressor()),
        (this.comp.threshold.value = -14),
        (this.comp.ratio.value = 4),
        (this.comp.attack.value = 0.004),
        (this.comp.release.value = 0.2),
        this.comp.connect(e.destination),
        (this.sfx = e.createGain()),
        (this.sfx.gain.value = this.sfxVol),
        this.sfx.connect(this.comp),
        (this.mus = e.createGain()),
        (this.mus.gain.value = this.musVol * 0.6),
        this.mus.connect(this.comp),
        (this.delay = e.createDelay(1)),
        (this.delay.delayTime.value = 0.28),
        (this.fb = e.createGain()),
        (this.fb.gain.value = 0.32),
        this.delay.connect(this.fb),
        this.fb.connect(this.delay),
        this.delay.connect(this.mus));
      let n = e.sampleRate;
      this.noiseBuf = e.createBuffer(1, n, e.sampleRate);
      let s = this.noiseBuf.getChannelData(0);
      for (let a = 0; a < n; a++) s[a] = Math.random() * 2 - 1;
      let r = e.createBufferSource();
      ((r.buffer = e.createBuffer(1, 1, 22050)), r.connect(e.destination), r.start(0), this.startScheduler());
    }
    fail(t) {
      (this.failed || logError("audio", t), (this.failed = !0));
    }
    setVolumes(t, e) {
      if (((this.sfxVol = t), (this.musVol = e), !this.ctx)) return;
      let n = this.ctx.currentTime;
      (this.sfx.gain.setTargetAtTime(t, n, 0.05), this.mus.gain.setTargetAtTime(e * 0.6, n, 0.1));
    }
    suspend() {
      try {
        this.ctx && this.ctx.state === "running" && this.ctx.suspend();
      } catch {}
    }
    resume() {
      try {
        this.ctx && this.ctx.state !== "running" && this.ctx.resume().catch(() => {});
      } catch {}
    }
    tone(t, e, n, s, r = {}) {
      let a = this.ctx,
        o = a.currentTime + (r.at || 0),
        c = a.createOscillator(),
        h = a.createGain();
      ((c.type = n),
        c.frequency.setValueAtTime(t, o),
        r.to && c.frequency.exponentialRampToValueAtTime(Math.max(20, r.to), o + e),
        r.detune && (c.detune.value = r.detune));
      let l = r.attack || 0.004;
      (h.gain.setValueAtTime(1e-4, o),
        h.gain.exponentialRampToValueAtTime(s, o + l),
        h.gain.exponentialRampToValueAtTime(1e-4, o + e));
      let u = c;
      if (r.lp) {
        let d = a.createBiquadFilter();
        ((d.type = "lowpass"), (d.frequency.value = r.lp), (d.Q.value = r.q || 0.7), u.connect(d), (u = d));
      }
      (u.connect(h), h.connect(r.dest || this.sfx), c.start(o), c.stop(o + e + 0.02));
    }
    noise(t, e, n = {}) {
      let s = this.ctx,
        r = s.currentTime + (n.at || 0),
        a = s.createBufferSource();
      ((a.buffer = this.noiseBuf), (a.playbackRate.value = n.rate || 1));
      let o = s.createBiquadFilter();
      ((o.type = n.type || "lowpass"),
        o.frequency.setValueAtTime(n.f || 2e3, r),
        n.to && o.frequency.exponentialRampToValueAtTime(n.to, r + t),
        (o.Q.value = n.q || 0.8));
      let c = s.createGain();
      (c.gain.setValueAtTime(1e-4, r),
        c.gain.exponentialRampToValueAtTime(e, r + (n.attack || 0.003)),
        c.gain.exponentialRampToValueAtTime(1e-4, r + t),
        a.connect(o),
        o.connect(c),
        c.connect(n.dest || this.sfx),
        a.start(r, Math.random() * 0.5),
        a.stop(r + t + 0.02));
    }
    gate(t, e) {
      let n = this.ctx.currentTime;
      return this.last[t] && n - this.last[t] < e ? !1 : ((this.last[t] = n), !0);
    }
    play(t, e) {
      if (!(!this.ctx || this.ctx.state !== "running" || this.sfxVol <= 0))
        try {
          this._play(t, e);
        } catch (n) {
          this.fail(n);
        }
    }
    _play(t, e) {
      let n = 1 + (Math.random() - 0.5) * 0.08;
      switch (t) {
        case "pulse":
          this.gate(t, 0.05) && this.tone(900 * n, 0.07, "square", 0.035, { to: 380, lp: 3500 });
          break;
        case "scatter":
          this.gate(t, 0.08) &&
            (this.noise(0.16, 0.22, { f: 2600, to: 500 }), this.tone(140, 0.12, "sine", 0.25, { to: 50 }));
          break;
        case "tesla":
          this.gate(t, 0.06) &&
            (this.tone(1500 * n, 0.06, "sawtooth", 0.025, { to: 700, lp: 5e3 }),
            this.noise(0.05, 0.05, { type: "bandpass", f: 5e3 }));
          break;
        case "rail":
          this.gate(t, 0.1) &&
            (this.tone(2200, 0.3, "sine", 0.12, { to: 180 }), this.noise(0.18, 0.12, { f: 6e3, to: 800 }));
          break;
        case "rocket":
          this.gate(t, 0.08) &&
            (this.noise(0.3, 0.12, { f: 900, to: 300 }), this.tone(220, 0.18, "triangle", 0.08, { to: 110 }));
          break;
        case "disc":
          this.gate(t, 0.1) &&
            (this.noise(0.22, 0.09, { type: "bandpass", f: 1800, to: 700, q: 3 }),
            this.tone(620 * n, 0.12, "triangle", 0.05, { to: 900 }));
          break;
        case "flame":
          this.gate(t, 0.11) && this.noise(0.16, 0.07, { type: "bandpass", f: 900 * n, q: 0.6, rate: 0.7 });
          break;
        case "block":
          this.gate(t, 0.06) && this.tone(2400 * n, 0.05, "square", 0.025, { lp: 5e3 });
          break;
        case "guardBreak":
          (this.noise(0.3, 0.2, { type: "highpass", f: 2500 }),
            this.tone(900, 0.25, "sawtooth", 0.06, { to: 200, lp: 3e3 }));
          break;
        case "shieldPop":
          this.tone(1600, 0.2, "sine", 0.07, { to: 500 });
          break;
        case "lob":
          this.gate(t, 0.1) && (this.tone(120, 0.18, "sine", 0.25, { to: 60 }), this.noise(0.12, 0.08, { f: 700 }));
          break;
        case "blinkWarn":
          this.gate(t, 0.1) && this.tone(500, 0.5, "sine", 0.05, { to: 1500, attack: 0.1 });
          break;
        case "blink":
          this.gate(t, 0.08) && this.noise(0.12, 0.08, { type: "bandpass", f: 3e3, to: 800, q: 2 });
          break;
        case "combo":
          [0, 0.06, 0.12].forEach((s, r) =>
            this.tone(midiToFreq(76 + Math.min(12, e || 0) + [0, 4, 7][r]), 0.14, "square", 0.035, { at: s, lp: 4e3 }),
          );
          break;
        case "heart":
          (this.tone(62, 0.12, "sine", 0.35, { to: 45 }), this.tone(58, 0.12, "sine", 0.25, { to: 42, at: 0.17 }));
          break;
        case "evolve":
          ([0, 0.09, 0.18, 0.27, 0.45].forEach((s, r) =>
            this.tone(midiToFreq(67 + [0, 4, 7, 11, 14][r]), 0.4, "triangle", 0.08, { at: s }),
          ),
            this.noise(0.8, 0.06, { type: "highpass", f: 5e3, attack: 0.2 }));
          break;
        case "hit":
          this.gate(t, 0.035) && this.tone(1300 * n, 0.03, "triangle", 0.035);
          break;
        case "crit":
          this.gate(t, 0.06) && this.tone(2e3 * n, 0.06, "square", 0.03, { lp: 4e3 });
          break;
        case "kill":
          if (this.gate(t, 0.03)) {
            let s = e || 1;
            (this.noise(0.14 + s * 0.04, 0.13 * Math.min(2, s), {
              type: "bandpass",
              f: (1500 / Math.sqrt(s)) * n,
              q: 1.2,
            }),
              this.tone((320 * n) / Math.sqrt(s), 0.12, "square", 0.04, { to: 70, lp: 2e3 }),
              s > 1.3 && this.tone(90, 0.22, "sine", 0.22, { to: 40 }));
          }
          break;
        case "bigkill":
          (this.noise(0.4, 0.3, { f: 1600, to: 200 }), this.tone(160, 0.35, "sawtooth", 0.12, { to: 40, lp: 900 }));
          break;
        case "boom":
          this.gate(t, 0.05) &&
            (this.noise(0.45, 0.28, { f: 700, to: 120 }), this.tone(100, 0.35, "sine", 0.3, { to: 35 }));
          break;
        case "smallboom":
          this.gate(t, 0.05) && this.noise(0.2, 0.12, { f: 1200, to: 300 });
          break;
        case "hurt":
          (this.tone(240, 0.22, "sawtooth", 0.15, { to: 90, lp: 1400 }), this.noise(0.15, 0.2, { f: 900 }));
          break;
        case "shield":
          (this.tone(1400, 0.35, "sine", 0.1, { to: 700 }), this.tone(2100, 0.25, "sine", 0.05));
          break;
        case "shieldUp":
          this.tone(700, 0.18, "sine", 0.06, { to: 1400 });
          break;
        case "dash":
          this.noise(0.18, 0.12, { type: "bandpass", f: 700, to: 3200, q: 1.5 });
          break;
        case "nova":
          (this.tone(70, 0.9, "sine", 0.45, { to: 28 }),
            this.noise(0.9, 0.3, { f: 3e3, to: 150 }),
            this.tone(600, 0.5, "sawtooth", 0.06, { to: 60, lp: 2e3 }));
          break;
        case "novaReady":
          (this.tone(880, 0.12, "sine", 0.07), this.tone(1320, 0.2, "sine", 0.07, { at: 0.08 }));
          break;
        case "shard": {
          let s = this.ctx.currentTime;
          ((this.combo = s - this.comboT < 0.4 ? Math.min(this.combo + 1, 14) : 0),
            (this.comboT = s),
            this.gate(t, 0.03) && this.tone(1100 * Math.pow(1.045, this.combo), 0.06, "sine", 0.04));
          break;
        }
        case "heal":
          (this.tone(660, 0.12, "sine", 0.08), this.tone(990, 0.2, "sine", 0.08, { at: 0.08 }));
          break;
        case "eshot":
          this.gate(t, 0.07) && this.tone(520 * n, 0.07, "square", 0.025, { to: 300, lp: 1800 });
          break;
        case "snipe":
          this.tone(1700, 0.16, "sine", 0.07, { to: 900 });
          break;
        case "warn":
          this.gate(t, 0.15) && this.tone(420, 0.3, "triangle", 0.05, { to: 900 });
          break;
        case "fuse":
          this.gate(t, 0.1) && this.tone(1200, 0.4, "square", 0.03, { to: 2400, lp: 3e3 });
          break;
        case "spawn":
          this.gate(t, 0.12) && this.noise(0.4, 0.05, { type: "bandpass", f: 400, to: 2400, q: 2 });
          break;
        case "wave":
          [0, 0.14, 0.28].forEach((s, r) =>
            this.tone(midiToFreq(57 + [0, 3, 7][r]), 0.35, "sawtooth", 0.06, { at: s, lp: 1800 }),
          );
          break;
        case "cleared":
          [0, 0.1, 0.2, 0.3].forEach((s, r) =>
            this.tone(midiToFreq(69 + [0, 4, 7, 12][r]), 0.3, "triangle", 0.08, { at: s }),
          );
          break;
        case "boss":
          (this.tone(55, 1.6, "sawtooth", 0.18, { lp: 400, attack: 0.3 }),
            this.tone(82.4, 1.6, "sawtooth", 0.12, { lp: 500, attack: 0.3 }),
            this.noise(1.4, 0.08, { f: 300, to: 2e3, attack: 0.5 }));
          break;
        case "pick":
          [0, 0.07, 0.14].forEach((s, r) =>
            this.tone(midiToFreq(72 + [0, 4, 7][r]), 0.2, "square", 0.04, { at: s, lp: 3e3 }),
          );
          break;
        case "click":
          this.tone(1800, 0.03, "triangle", 0.04);
          break;
        case "event":
          [0, 0.12, 0.24].forEach((s, r) =>
            this.tone(midiToFreq(62 + [0, 6, 12][r]), 0.3, "sawtooth", 0.05, { at: s, lp: 2400 }),
          );
          break;
        case "erupt":
          this.gate(t, 0.25) &&
            (this.noise(0.6, 0.16, { f: 600, to: 2400, attack: 0.05 }), this.tone(70, 0.5, "sine", 0.18, { to: 40 }));
          break;
        case "warp":
          this.gate(t, 0.12) && this.tone(420, 0.25, "sine", 0.07, { to: 1400 });
          break;
        case "mend":
          this.gate(t, 0.3) && this.tone(880, 0.3, "sine", 0.04, { to: 1320 });
          break;
        case "chill":
          this.gate(t, 0.3) && this.tone(2400, 0.2, "sine", 0.05, { to: 1200 });
          break;
        case "champion":
          (this.tone(90, 1, "sawtooth", 0.14, { lp: 500, attack: 0.2 }),
            this.tone(135, 1, "sawtooth", 0.09, { lp: 600, attack: 0.2 }));
          break;
        case "rumble":
          (this.tone(55, 0.8, "sawtooth", 0.12, { to: 38, lp: 260, attack: 0.08 }),
            this.noise(0.7, 0.12, { f: 400, to: 120, attack: 0.1 }));
          break;
        case "ready":
          this.gate(t, 0.3) && this.tone(1560, 0.07, "sine", 0.035, { to: 2100 });
          break;
        case "buy":
          (this.tone(880, 0.1, "square", 0.05, { lp: 3e3 }),
            this.tone(1320, 0.18, "square", 0.05, { at: 0.07, lp: 3e3 }));
          break;
        case "deny":
          this.tone(200, 0.15, "square", 0.05, { lp: 900 });
          break;
        case "die":
          (this.tone(400, 1.2, "sawtooth", 0.15, { to: 40, lp: 1200 }), this.noise(1, 0.25, { f: 2e3, to: 100 }));
          break;
        case "victory":
          [0, 0.15, 0.3, 0.45, 0.75].forEach((s, r) =>
            this.tone(midiToFreq(64 + [0, 4, 7, 12, 16][r]), 0.5, "triangle", 0.09, { at: s }),
          );
          break;
        case "thud":
          this.gate(t, 0.1) && (this.tone(80, 0.3, "sine", 0.3, { to: 30 }), this.noise(0.2, 0.15, { f: 500 }));
          break;
        case "beam":
          this.gate(t, 0.2) && this.tone(300, 0.9, "sawtooth", 0.05, { to: 1200, lp: 2500, attack: 0.2 });
          break;
      }
    }
    consume(t) {
      if (!this.ctx || this.ctx.state !== "running") return;
      let e = 0;
      for (let n of t)
        switch (n.k) {
          case "shot":
            this.play(rlShotSfx(n.w));
            break;
          case "dmg":
            n.burn || this.play(n.crit ? "crit" : "hit");
            break;
          case "kill":
            n.boss ? this.play("bigkill") : e++ < 3 && this.play("kill", n.elite ? 1.8 : Math.max(1, n.r * 1.6));
            break;
          case "boom":
            this.play(n.kind === "payload" || n.kind === "pop" ? "smallboom" : "boom");
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
            this.play(n.type === "sniper" ? "snipe" : "eshot");
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
            this.play(n.boss ? "boss" : "wave");
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
            this.play(n.evo ? "evolve" : "pick");
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
            this.play(n.k);
            break;
          case "championDown":
            this.play("bigkill");
            break;
          case "combo":
            this.play("combo", Math.round(Math.log2(n.n / 10) * 3));
            break;
        }
    }
    setMusic(t, e) {
      ((this.mode = t), e && (this.biome = e));
    }
    startScheduler() {
      this.timer ||
        ((this.nextT = this.ctx.currentTime + 0.1),
        (this.timer = setInterval(() => {
          try {
            this.schedule();
          } catch (t) {
            (this.fail(t), clearInterval(this.timer));
          }
        }, 30)));
    }
    schedule() {
      let t = this.ctx;
      if (!t || t.state !== "running") return;
      this.nextT < t.currentTime - 0.5 && (this.nextT = t.currentTime + 0.05);
      let n = 60 / (this.mode === "boss" ? 134 : this.mode === "fight" ? 122 : 100) / 4;
      for (; this.nextT < t.currentTime + 0.14; )
        (this.mode !== "off" && this.musVol > 0 && this.note(this.step, this.nextT),
          (this.nextT += n),
          (this.step = (this.step + 1) % 64),
          this.step === 0 && this.cycle++,
          (this.intensity += (this.want - this.intensity) * 0.02));
    }
    note(t, e) {
      let n = musicChords[this.biome] || musicChords.yard,
        s = Math.floor(t / 16),
        r = t % 16,
        [a, o] = n[s],
        h = [a, a + (o === "m" ? 3 : 4), a + 7, a + 12],
        l = this.mode === "fight" || this.mode === "boss",
        u = this.mode === "boss",
        d = e - this.ctx.currentTime,
        f = this.mus;
      if (l) {
        let p = u ? Math.max(0.7, this.intensity) : this.intensity,
          x = this.cycle,
          m = x % 2 === 1 && s === 3 && r >= 12;
        (r % 4 === 0 && !(m && r > 12) && this.tone(150, 0.14, "sine", 0.5, { to: 42, dest: f, at: d }),
          p > 0.62 && r % 8 === 7 && this.tone(140, 0.1, "sine", 0.3, { to: 45, dest: f, at: d }),
          r % 4 === 2 && this.noise(0.03, 0.07, { type: "highpass", f: 7500, dest: f, at: d }),
          (p > 0.32 || u) &&
            r % 2 === 1 &&
            this.noise(0.02, 0.03 + p * 0.02, { type: "highpass", f: 9e3, dest: f, at: d }),
          m
            ? this.noise(0.08, 0.06 + (r - 12) * 0.025, {
                type: "bandpass",
                f: 1500 + (r - 12) * 250,
                q: 0.9,
                dest: f,
                at: d,
              })
            : (r === 4 || r === 12) && this.noise(0.14, 0.14, { type: "bandpass", f: 1800, q: 0.8, dest: f, at: d }));
        let g = musicVoices[this.biome] || musicVoices.yard;
        if (
          (r % 2 === 0 &&
            this.tone(midiToFreq(a - 24 + (r % 8 === 6 ? 12 : 0)), 0.16, g.bass, 0.11, {
              lp: (u ? 700 : 520) + p * 380,
              dest: f,
              at: d,
            }),
          r % 2 === 0 || u || p > 0.8)
        ) {
          let M = arpPatterns[x % arpPatterns.length],
            b = (r / (u || p > 0.8 ? 1 : 2)) | 0,
            v = h[M[b % M.length]] + (x % 4 === 3 ? 24 : 12);
          this.tone(midiToFreq(v), 0.1, g.arp, g.arp === "sine" ? 0.045 : 0.025, {
            lp: g.lp + p * 1600,
            dest: this.delay,
            at: d,
          });
        }
        if ((p > 0.45 || u) && x % 2 === 0) {
          let M = leadPatterns[s % leadPatterns.length][r];
          M != null &&
            this.tone(
              midiToFreq(h[M % 4] + 24 + (M >= 4 ? 12 : 0)),
              0.22,
              g.lead,
              g.lead === "sawtooth" || g.lead === "square" ? 0.028 : 0.045,
              { dest: this.delay, at: d, attack: 0.01, lp: 3e3 },
            );
        }
      } else {
        if (r === 0)
          for (let p of h.slice(0, 3))
            (this.tone(midiToFreq(p - 12), stepSeconds(100) * 16, "sawtooth", 0.025, {
              lp: 800,
              attack: 0.6,
              dest: f,
              at: d,
              detune: 7,
            }),
              this.tone(midiToFreq(p - 12), stepSeconds(100) * 16, "sawtooth", 0.02, {
                lp: 800,
                attack: 0.6,
                dest: f,
                at: d,
                detune: -7,
              }));
        (r % 4 === 0 &&
          (t * 7) % 3 !== 0 &&
          this.tone(midiToFreq(h[((t / 4) % 4) | 0] + 12), 0.4, "triangle", 0.04, { dest: this.delay, at: d }),
          r === 0 && this.tone(midiToFreq(a - 24), 1.6, "sine", 0.12, { dest: f, at: d, attack: 0.05 }));
      }
    }
  };
function stepSeconds(i) {
  return 60 / i / 4;
}

export { musicChords, RL_SFX_VOICES, rlShotSfx, musicVoices, SoundEngine };
