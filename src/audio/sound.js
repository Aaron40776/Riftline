// Sound effects and procedural music (SoundEngine) with the music tables per biome.

import { logError } from "../core/diagnostics.js";
import { weaponDefs } from "../data/weapons.js";
import { upgradesById } from "../data/upgrades.js";

/* The sound engine has seven weapon voices; newer weapons borrow the closest one. */
const RL_SFX_VOICES = ["pulse", "scatter", "tesla", "rail", "rocket", "disc", "flame"];
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
/* 2.7.0: each of the 25 enemy types dies with a voice of its family. 2.9.0: nine families (was six), so that
 machines, flesh, armour and ghosts no longer share a sound: bip pop (tiny swarmers), wet squelch, flesh and
 bone crunch, heavy armour, electric short circuit, ghostly fade, metal clang, hollow rattle, glass shatter.
 Bosses and champions keep "bigkill". */
const RL_DEATH_FAMILY = {
  swarmer: "dPop",
  mite: "dPop",
  splitter: "dSquelch",
  hive: "dSquelch",
  leaper: "dSquelch",
  mender: "dSquelch",
  brute: "dCrunch",
  striker: "dCrunch",
  bulwark: "dArmor",
  driller: "dArmor",
  mortar: "dArmor",
  drone: "dZap",
  sentinel: "dZap",
  turret: "dZap",
  phantom: "dGhost",
  weaver: "dGhost",
  grunt: "dClang",
  gunner: "dClang",
  sapper: "dClang",
  bomber: "dRattle",
  charger: "dRattle",
  carrier: "dRattle",
  minebot: "dRattle",
  sniper: "dShatter",
  beacon: "dShatter",
};
/* 2.9.0: the shot of an enemy by type (default "eshot", the gunner); the sniper has its own lock-on sound */
const RL_ESHOT_VOICE = { sniper: "snipe", turret: "eshotTurret", drone: "eshotDrone", boss: "eshotBoss" };
/* wind-up voices of the "charge" event (enemy types and the bosses that charge) */
const RL_CHARGE_VOICE = {
  brute: "windHeavy",
  charger: "windWhine",
  striker: "windSlash",
  driller: "windDrill",
  leaper: "windLeap",
  warden: "bWind",
  prism: "bWind",
  forge: "bWind",
};
/* the "edash" event: the lunge itself */
const RL_DASH_VOICE = { charger: "ram", striker: "ram", driller: "ramDrill", phantom: "blink" };
/* boss attack telegraphs (event "bossAtk"); null: another event of the same attack already sounds
 (charge, beamWarn, blinkWarn, lob, erupt, thud) */
const RL_BOSS_ATK = {
  charge: null,
  ring: "bRing",
  stomp: "bSlam",
  summon: "bSummon",
  spiral: "bRing",
  burst: "bRing",
  eggs: "bSummon",
  frostbeam: null,
  teleport: null,
  frostnova: "bNova",
  icelances: "bLance",
  glacier: "bSlam",
  iceshards: "bLance",
  cross: "bRing",
  rain: "bRain",
  hammer: "bSlam",
  slag: null,
  eruption: null,
  furnace: "bSummon",
  stoke: "bStoke",
};
const BOSS_ROOT = { warden: 45, forge: 38, prism: 52, queen: 41, core: 42 },
  /* 2.9.0: every boss has a timbre (wave, filter) and a short motif (semitones above the root, two octaves up)
   that its telegraphs, roar and death share, so that the ear knows who is attacking: the Warden stern and
   square (a fifth), the Crucible a saw with an anvil ring, the Prism falling glass, the Queen a wet chromatic
   wobble, the Core a void tritone. */
  BOSS_SOUND = {
    warden: { wave: "square", lp: 900, det: 0, motif: [0, 0, 7], gap: 0.1, chord: [0, 7, 12, 19] },
    forge: { wave: "sawtooth", lp: 800, det: 0, motif: [0, 3, 5, 3], gap: 0.09, chord: [0, 4, 7, 12] },
    prism: { wave: "sine", lp: 9e3, det: 6, motif: [12, 7, 4, 0], gap: 0.08, chord: [0, 4, 7, 11] },
    queen: { wave: "triangle", lp: 1400, det: 35, motif: [0, -1, 0, -1], gap: 0.1, chord: [0, 3, 7, 10] },
    core: { wave: "sawtooth", lp: 1e3, det: 18, motif: [0, 6, 0, 6], gap: 0.11, chord: [0, 7, 14, 19] },
  },
  /* 2.9.0: how far the music dips for the big hits (gain factor 1 - x, about 100 ms; the music goes on) */
  MUSIC_DUCK = {
    nova: 0.15,
    die: 0.15,
    boom: 0.1,
    bigkill: 0.12,
    hurt: 0.1,
    bossDown: 0.15,
    enrage: 0.12,
    phase: 0.1,
    boss: 0.1,
    bossIntro: 0.12,
    evolve: 0.1,
    guardBreak: 0.08,
    thud: 0.08,
    bSlam: 0.08,
    rail: 0.06,
    scatter: 0.05,
    rocket: 0.05,
  },
  /* boss wave music: tempo per biome (the fight theme runs at 122) and the stab voice */
  BOSS_BPM = { yard: 138, works: 132, vault: 142, void: 146, marsh: 136 },
  BOSS_STAB = { yard: "square", works: "sawtooth", vault: "triangle", void: "square", marsh: "sawtooth" },
  AMBIENCE_LEVEL = { meltdown: 0.11, whiteout: 0.085, bloom: 0.06, riftstorm: 0.055 },
  MAX_VOICES = 24,
  // 2.8.2: the music has its own budget; shots and other sounds can no longer take notes away from it
  MAX_MUSIC_VOICES = 20,
  /* sounds that are never dropped in favour of others when the voice limit is reached */
  KEY_SOUNDS = new Set([
    "hurt",
    "die",
    "victory",
    "boss",
    "bossIntro",
    "bossDown",
    "enrage",
    "phase",
    "nova",
    "guardBreak",
    "cleared",
    "bossCleared",
    "evolve",
    "bigkill",
    "heart",
    "pick",
  ]);
/* Event kinds that sound (with sample payloads, used by the self-test to check that the consumer
 really reacts to each) and the ones that stay silent on purpose. Every kind of RL_EVENT_KINDS is in
 exactly one of the two. */
const RL_SOUND_EVENTS = {
  aim: [{}, { type: "turret" }],
  barrier: [{}],
  beamWarn: [{}, { small: true }],
  blink: [{}],
  blinkWarn: [{}],
  block: [{}],
  boom: [{ kind: "boom" }],
  boss: [{ id: "warden" }, { id: "forge" }, { id: "prism" }, { id: "queen" }, { id: "core" }],
  bossAtk: [{ id: "warden", atk: "ring" }],
  bossDown: [{ id: "warden" }],
  bounce: [{}],
  bountyPulse: [{}],
  chain: [{}],
  champion: [{}],
  championDown: [{}],
  charge: [{ type: "brute" }],
  chill: [{}],
  cleared: [{}, { boss: true }],
  combo: [{ n: 20 }],
  comboEnd: [{ n: 20 }],
  dash: [{}],
  dmg: [{}],
  edash: [{ type: "charger" }],
  die: [{}],
  enrage: [{ id: "warden" }],
  erupt: [{}],
  eshot: [{ type: "gunner" }, { type: "turret" }, { type: "drone" }, { type: "boss" }, { type: "sniper" }],
  freeze: [{}],
  fuse: [{}],
  guardBreak: [{}],
  guardUp: [{}],
  hatch: [{}, { big: true }],
  heal: [{}],
  maxed: [{ heal: 30, shards: 12 }],
  hurt: [{}],
  kill: [{ type: "grunt", r: 0.5 }],
  kit: [{}],
  lob: [{}],
  mend: [{}],
  mine: [{}],
  nova: [{}],
  novaReady: [{}],
  offer: [{}],
  phase: [{ n: 2 }],
  pick: [{ id: "dmg" }],
  portal: [{}],
  reroll: [{}],
  revive: [{}],
  shard: [{}],
  shieldBreak: [{}],
  shieldPop: [{}],
  shieldUp: [{}],
  shot: [{ w: "pulse" }],
  supplyDrop: [{}],
  thud: [{}],
  victory: [{}],
  warp: [{ who: "weaver" }],
  wave: [{ n: 2 }],
  wingShot: [{}],
};
const RL_SILENT_EVENTS = new Set([
  "ping", // damage marker, "hit" already sounds
  "pop", // a bullet expiring: far too frequent
  "spark", // impact effect, covered by "dmg"
  "spawn", // one enemy appears: the "portal" group sound covers it
  "zap", // effect of the arc weapons, covered by their shot voice
]);

/* soft clipper curve: linear up to 0.7, then a smooth knee towards 0.98 (input is clamped to +-1, so
 the output never exceeds 0.93) */
function softClipCurve() {
  let n = 2049,
    curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let x = (i / (n - 1)) * 2 - 1,
      a = Math.abs(x);
    curve[i] = Math.sign(x) * (a <= 0.7 ? a : 0.7 + 0.28 * Math.tanh((a - 0.7) / 0.28));
  }
  return curve;
}

const musicChords = {
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
      // 2.7.0: voice registry (limit), boss music mix, engine hum and event ambience
      this.voices = [];
      this.musicVoiceList = [];
      this.curPri = 1;
      this.simT = null;
      this.maxEnd = 0;
      this.dropped = 0;
      this.offline = false;
      this.bossMix = 0;
      this.bossOver = false;
      this.beds = Object.create(null);
      this.liveT = -1e9;
      this.speed = null;
      this.amb = null;
      this.accentT = 0;
      this.accentFlip = false;
      // 2.9.0: music ducking and counters of the music notes (the tests check that none is dropped)
      this.duckGain = null;
      this.duckT = -1e9;
      this.musicScheduled = 0;
      this.musicSkipped = 0;
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
        ctx = new AudioCtx({ latencyHint: "interactive" });
      this.buildGraph(ctx);
      let unlocker = ctx.createBufferSource();
      unlocker.buffer = ctx.createBuffer(1, 1, 22050);
      unlocker.connect(ctx.destination);
      unlocker.start(0);
      this.startScheduler();
    }
    /* The master chain: sfx and music -> compressor -> limiter -> soft clipper -> output. The soft
     clipper keeps the signal below 0.93 whatever the mix does. */
    buildGraph(ctx) {
      this.ctx = ctx;
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.004;
      this.comp.release.value = 0.2;
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -3;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.001;
      this.limiter.release.value = 0.08;
      this.clip = ctx.createWaveShaper();
      this.clip.curve = softClipCurve();
      this.comp.connect(this.limiter);
      this.master = ctx.createGain();
      this.master.gain.value = 0.82;
      this.limiter.connect(this.master);
      this.master.connect(this.clip);
      this.clip.connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.gain.value = this.sfxVol;
      this.sfx.connect(this.comp);
      this.mus = ctx.createGain();
      this.mus.gain.value = this.musVol * 0.6;
      // 2.9.0: the music passes a gain stage of its own that dips briefly on big hits (duck)
      this.duckGain = ctx.createGain();
      this.mus.connect(this.duckGain);
      this.duckGain.connect(this.comp);
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
    }
    /* Test hook: run the engine on an OfflineAudioContext (no scheduler, always "running"). */
    attach(ctx) {
      this.offline = true;
      this.buildGraph(ctx);
    }
    live() {
      return !!this.ctx && (this.offline || this.ctx.state === "running");
    }
    nowT() {
      return this.simT != null ? this.simT : this.ctx.currentTime;
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
    /* Voice limit: at most MAX_VOICES oscillators/sources are alive. A new voice that finds the list
     full takes the place of the oldest voice of lower (or, for sounds, equal) priority; music (0)
     never drops anything and is skipped instead, loops (beds) are never dropped. */
    claim(pri, start, end) {
      let now = this.nowT();
      // 2.8.2: music (priority 0) is counted apart from the sounds. It used to share the list, and every
      // shot or hit that found it full took the oldest music note: the music stuttered and dropped out
      // in heavy fights. Music never takes a voice from anyone and is skipped when its own list is full.
      if (pri === 0) {
        let music = this.musicVoiceList;
        if (music.length >= MAX_MUSIC_VOICES) {
          for (let i = music.length - 1; i >= 0; i--)
            if (music[i].end < now) {
              music[i] = music[music.length - 1];
              music.pop();
            }
        }
        if (end > this.maxEnd && end < 1e8) this.maxEnd = end;
        if (music.length >= MAX_MUSIC_VOICES) {
          this.musicSkipped++;
          return null;
        }
        let voice = { node: null, amp: null, pri: 0, start: start, end: end, loop: false };
        music.push(voice);
        this.musicScheduled++;
        return voice;
      }
      let list = this.voices;
      if (list.length >= MAX_VOICES) {
        for (let i = list.length - 1; i >= 0; i--)
          if (list[i].end < now) {
            list[i] = list[list.length - 1];
            list.pop();
          }
      }
      let voice = { node: null, amp: null, pri: pri, start: start, end: end, loop: false };
      if (end > this.maxEnd && end < 1e8) this.maxEnd = end;
      if (list.length < MAX_VOICES) {
        list.push(voice);
        return voice;
      }
      let victim = -1;
      for (let i = 0; i < list.length; i++) {
        let other = list[i];
        if (other.loop || other.pri > pri || (other.pri === pri && pri < 1)) continue;
        if (
          victim < 0 ||
          other.pri < list[victim].pri ||
          (other.pri === list[victim].pri && other.start < list[victim].start)
        )
          victim = i;
      }
      if (victim < 0) {
        this.dropped++;
        return null;
      }
      let old = list[victim];
      try {
        old.amp.gain.cancelScheduledValues(now);
        old.amp.gain.setTargetAtTime(0, now, 0.004);
        old.node.stop(now + 0.03);
      } catch {}
      list[victim] = voice;
      this.dropped++;
      return voice;
    }
    tone(freq, dur, wave, vol, opts = {}) {
      let ctx = this.ctx,
        start = ctx.currentTime + (opts.at || 0),
        voice = this.claim(opts.pri != null ? opts.pri : opts.dest ? 0 : this.curPri, start, start + dur + 0.02);
      if (!voice) return;
      let osc = ctx.createOscillator(),
        amp = ctx.createGain();
      voice.node = osc;
      voice.amp = amp;
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
        voice = this.claim(opts.pri != null ? opts.pri : opts.dest ? 0 : this.curPri, start, start + dur + 0.02);
      if (!voice) return;
      let src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      // 2.9.1: the 1 s buffer is looped: a burst longer than what is left of it (it starts up to 0.5 s in)
      // used to be cut off; white noise has no audible seam
      src.loop = true;
      src.playbackRate.value = opts.rate || 1;
      let filter = ctx.createBiquadFilter();
      filter.type = opts.type || "lowpass";
      filter.frequency.setValueAtTime(opts.f || 2e3, start);
      if (opts.to) {
        filter.frequency.exponentialRampToValueAtTime(opts.to, start + dur);
      }
      filter.Q.value = opts.q || 0.8;
      let amp = ctx.createGain();
      voice.node = src;
      voice.amp = amp;
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
      if (this.last[key] && now - this.last[key] < gap) return false;
      this.last[key] = now;
      return true;
    }
    play(id, arg) {
      if (!this.live() || this.sfxVol <= 0) return;
      this.curPri = KEY_SOUNDS.has(id) ? 2 : 1;
      try {
        this._play(id, arg);
        if (MUSIC_DUCK[id]) this.duck(MUSIC_DUCK[id]);
      } catch (err) {
        this.fail(err);
      } finally {
        this.curPri = 1;
      }
    }
    /* 2.9.0: a light sidechain: the music gain dips by `depth` (at most 15 %) for about 80 ms and comes back
     (time constant 70 ms), so that a big hit is heard over the music. Nothing is stopped or skipped. */
    duck(depth) {
      let gain = this.duckGain;
      if (!gain) return;
      let now = this.ctx.currentTime;
      if (now - this.duckT < 0.1) return;
      this.duckT = now;
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setTargetAtTime(1 - Math.min(0.15, depth), now, 0.012);
        gain.gain.setTargetAtTime(1, now + 0.08, 0.07);
      } catch {}
    }
    _play(id, arg) {
      let pitch = 1 + (Math.random() - 0.5) * 0.08;
      switch (id) {
        // 2.9.0: seven weapons, seven sound families (waveform, pitch range, envelope, tail)
        case "pulse":
          // bright sci-fi "pew": a fast falling sine with a thin square edge, all above 400 Hz, no tail
          if (this.gate(id, 0.05)) {
            this.tone(1500 * pitch, 0.075, "sine", 0.05, { to: 420 });
            this.tone(2300 * pitch, 0.028, "square", 0.012, { to: 900, lp: 5e3 });
          }
          break;
        case "scatter":
          // shotgun: a wide noise blast, a low thump and the click of the pump a moment later
          if (this.gate(id, 0.08)) {
            this.noise(0.2, 0.26, { f: 3200, to: 350, attack: 0.001 });
            this.tone(150, 0.16, "sine", 0.3, { to: 42 });
            this.noise(0.03, 0.06, { type: "bandpass", f: 2600, q: 3, at: 0.17 });
          }
          break;
        case "tesla":
          // arc: a stuttering electric crackle, two random square ticks and a hissing spark, no low end
          if (this.gate(id, 0.06)) {
            this.tone(2600 + Math.random() * 2400, 0.022, "square", 0.02, { lp: 7e3 });
            this.tone(3200 + Math.random() * 2600, 0.022, "square", 0.016, { at: 0.03, lp: 7e3 });
            this.noise(0.08, 0.06, { type: "bandpass", f: 6500, q: 6 });
          }
          break;
        case "rail":
          // railgun: a sharp crack, a supersonic drop from 3.2 kHz, a sub recoil and a ringing metal tail
          if (this.gate(id, 0.1)) {
            this.noise(0.04, 0.2, { type: "highpass", f: 4e3, attack: 0.001 });
            this.tone(3200, 0.28, "sine", 0.14, { to: 70 });
            this.tone(55, 0.3, "sine", 0.17, { to: 35 });
            this.tone(1320, 0.6, "triangle", 0.06, { at: 0.03 });
            this.tone(1990, 0.5, "triangle", 0.04, { at: 0.03 });
          }
          break;
        case "rocket":
          // rocket: the launch "foomp", then a long rising whoosh over a rough motor
          if (this.gate(id, 0.08)) {
            this.tone(120, 0.14, "sine", 0.2, { to: 55 });
            this.noise(0.5, 0.2, { type: "bandpass", f: 350, to: 1800, q: 0.8, attack: 0.12 });
            this.tone(80, 0.45, "sawtooth", 0.05, { to: 150, lp: 350, attack: 0.1 });
          }
          break;
        case "disc":
          // disc launcher: a metallic "shing" (two inharmonic partials) and a two-note wub of the spinning blade
          if (this.gate(id, 0.1)) {
            this.tone(1245, 0.16, "sine", 0.035);
            this.tone(2093, 0.12, "sine", 0.022);
            this.tone(300 * pitch, 0.06, "triangle", 0.07, { to: 500 });
            this.tone(500 * pitch, 0.07, "triangle", 0.06, { to: 300, at: 0.06 });
          }
          break;
        case "flame":
          // flame jet: a soft low roar of filtered noise with random crackle pops, no pitched part at all
          if (this.gate(id, 0.11)) {
            this.noise(0.22, 0.1, { f: 1200, to: 400, q: 0.5, rate: 0.5 * pitch });
            this.noise(0.04, 0.05, { type: "highpass", f: 5e3, at: Math.random() * 0.12 });
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
          // mortar: the thump of the launch and a thin whistle of the shell going up
          if (this.gate(id, 0.1)) {
            this.tone(120, 0.18, "sine", 0.25, { to: 60 });
            this.noise(0.12, 0.08, { f: 700 });
            this.tone(420, 0.5, "sine", 0.02, { to: 1100, at: 0.08, attack: 0.15 });
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
          this.tone(midiToFreq(43), 0.9, "sine", 0.12, { at: 0.27 });
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
          // gunner: a dull low square "pok", clearly darker than the player's pew
          if (this.gate(id, 0.07)) {
            this.tone(330 * pitch, 0.09, "square", 0.028, { to: 170, lp: 1100 });
            this.noise(0.04, 0.03, { type: "bandpass", f: 1500, q: 2 });
          }
          break;
        case "eshotDrone":
          // drone: a tiny rising chirp
          if (this.gate(id, 0.08)) {
            this.tone(900 * pitch, 0.06, "triangle", 0.025, { to: 1400 });
          }
          break;
        case "eshotTurret":
          // turret: a mechanical clack with a short muzzle thump
          if (this.gate(id, 0.08)) {
            this.noise(0.03, 0.06, { type: "bandpass", f: 2200, q: 4 });
            this.tone(180, 0.06, "square", 0.04, { to: 90, lp: 600 });
          }
          break;
        case "eshotBoss":
          // boss cannon: a heavy thump and a rough sawtooth growl
          if (this.gate(id, 0.1)) {
            this.tone(90, 0.25, "sine", 0.22, { to: 45 });
            this.tone(140, 0.2, "sawtooth", 0.05, { to: 70, lp: 500 });
            this.noise(0.18, 0.07, { f: 700, to: 200 });
          }
          break;
        case "snipe":
          this.tone(1700, 0.16, "sine", 0.07, { to: 900 });
          this.noise(0.1, 0.05, { type: "highpass", f: 4e3 });
          break;
        case "warn":
          if (this.gate(id, 0.15)) {
            this.tone(420, 0.3, "triangle", 0.05, { to: 900 });
          }
          break;
        case "fuse":
          // bomber: four beeps that get faster
          if (this.gate(id, 0.1)) {
            [0, 0.1, 0.18, 0.24].forEach((at, i) => this.tone(1300 + i * 260, 0.06, "square", 0.028, { at, lp: 3e3 }));
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
        case "cleared": {
          // wave clear: rising arpeggio with a bell on top; a flawless wave adds a sparkle
          [0, 0.1, 0.2, 0.3].forEach((at, i) =>
            this.tone(midiToFreq(69 + [0, 4, 7, 12][i]), 0.3, "triangle", 0.08, { at }),
          );
          this.tone(midiToFreq(93), 0.5, "sine", 0.03, { at: 0.3 });
          this.tone(midiToFreq(45), 0.5, "sine", 0.1, { at: 0.3 });
          if (arg) {
            [0.42, 0.5, 0.58].forEach((at, i) => this.tone(midiToFreq(96 + i * 4), 0.25, "sine", 0.03, { at }));
          }
          break;
        }
        case "boss":
          // "WARNING": a low two-tone alarm (the boss motif follows with the boss card)
          this.tone(55, 0.9, "sawtooth", 0.14, { lp: 400, attack: 0.2 });
          this.tone(82.4, 0.9, "sawtooth", 0.1, { lp: 500, attack: 0.2 });
          this.noise(0.8, 0.06, { f: 300, to: 2e3, attack: 0.3 });
          break;
        case "click":
          this.tone(1800, 0.03, "triangle", 0.04);
          break;
        case "event":
          this.eventCue(arg);
          break;
        case "erupt":
          // vent eruption: hiss and a low swell, then the burst
          if (this.gate(id, 0.25)) {
            this.noise(0.6, 0.16, { f: 600, to: 2400, attack: 0.05 });
            this.tone(70, 0.5, "sine", 0.18, { to: 40 });
            this.noise(0.25, 0.1, { type: "bandpass", f: 3e3, to: 900, q: 1.5, at: 0.05 });
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
          // boss beam: a rising whine with a growl underneath
          if (this.gate(id, 0.2)) {
            this.tone(300, 0.9, "sawtooth", 0.05, { to: 1200, lp: 2500, attack: 0.2 });
            this.tone(60, 0.9, "sawtooth", 0.06, { to: 110, lp: 300, attack: 0.3 });
          }
          break;
        default:
          this._play270(id, arg, pitch);
      }
    }
    /* Sounds new in 2.7.0. Recipes are kept short: at most 4 to 6 voices, deaths and wind-ups 2 to 3. */
    _play270(id, arg, pitch) {
      let size = Math.min(1.6, arg || 1);
      switch (id) {
        // ---- enemy deaths: short, quiet, pitch-randomised ----
        case "dPop":
          // tiny swarmers: a high "bip", a bubble that drops fast
          if (this.gate(id, 0.03)) {
            this.tone(1100 * pitch, 0.06, "sine", 0.05 * size, { to: 300 });
            this.noise(0.025, 0.04, { type: "highpass", f: 6e3 });
          }
          break;
        case "dSquelch":
          // wet: a blobby glide up and back down and a narrow gurgle
          if (this.gate(id, 0.035)) {
            this.tone(180 * pitch, 0.06, "sine", 0.07 * size, { to: 460 });
            this.tone(460 * pitch, 0.11, "sine", 0.06, { to: 110, at: 0.05 });
            this.noise(0.14, 0.05, { type: "bandpass", f: 500, to: 250, q: 6 });
          }
          break;
        case "dCrunch":
          // flesh and bone: a crushing noise, a bone crack and a dull thump
          if (this.gate(id, 0.04)) {
            this.noise(0.18, 0.12 * size, { f: 1400, to: 200 });
            this.noise(0.02, 0.07, { type: "bandpass", f: 2200, q: 3, at: 0.03 });
            this.tone(95 * pitch, 0.16, "sine", 0.12 * size, { to: 45 });
          }
          break;
        case "dArmor":
          // heavy plating: a deep boom, a low inharmonic clang that rings a little and a dull rattle
          if (this.gate(id, 0.04)) {
            this.tone(70, 0.25, "sine", 0.2 * size, { to: 35 });
            this.tone(310 * pitch, 0.18, "triangle", 0.035);
            this.tone(467 * pitch, 0.14, "triangle", 0.025);
            this.noise(0.1, 0.07, { type: "bandpass", f: 600, to: 300, q: 2 });
          }
          break;
        case "dZap":
          // short circuit: two square ticks, a falling saw and a spark of noise
          if (this.gate(id, 0.035)) {
            this.tone(3200 * pitch, 0.1, "sawtooth", 0.035 * size, { to: 150, lp: 6e3 });
            this.tone(1100, 0.02, "square", 0.025, { lp: 4e3, at: 0.05 });
            this.tone(1500, 0.02, "square", 0.02, { lp: 4e3, at: 0.08 });
            this.noise(0.06, 0.08, { type: "bandpass", f: 6e3, q: 3 });
          }
          break;
        case "dGhost":
          // ghostly: a detuned pair of sines falling slowly, a thin sigh of noise, no hard edge at all
          if (this.gate(id, 0.04)) {
            this.tone(2400 * pitch, 0.3, "sine", 0.04 * size, { to: 320, attack: 0.05 });
            this.tone(2424 * pitch, 0.3, "sine", 0.03, { to: 300, attack: 0.05 });
            this.noise(0.28, 0.035, { type: "bandpass", f: 4e3, to: 800, q: 8, attack: 0.06 });
          }
          break;
        case "dClang":
          // metal: a ringing triangle pair and a short low knock
          if (this.gate(id, 0.035)) {
            this.tone(1240 * pitch, 0.22, "triangle", 0.05 * size);
            this.tone(1810 * pitch, 0.16, "triangle", 0.032);
            this.tone(120, 0.1, "sine", 0.09, { to: 60 });
            this.noise(0.03, 0.05, { type: "bandpass", f: 3e3 });
          }
          break;
        case "dRattle":
          // hollow casing: a short falling knock and two dry ticks of loose parts
          if (this.gate(id, 0.035)) {
            this.tone(380 * pitch, 0.12, "triangle", 0.06 * size, { to: 170 });
            this.noise(0.03, 0.09, { type: "bandpass", f: 1500, q: 4, at: 0.02 });
            this.noise(0.03, 0.08, { type: "bandpass", f: 2000, q: 4, at: 0.07 });
          }
          break;
        case "dShatter":
          // glass: a burst of high noise and three random high chimes
          if (this.gate(id, 0.04)) {
            this.noise(0.22, 0.08 * size, { type: "highpass", f: 4500, attack: 0.001 });
            for (let i = 0; i < 3; i++) {
              this.tone((3e3 + Math.random() * 3e3) * pitch, 0.06, "sine", 0.022, { at: 0.02 + i * 0.035 });
            }
          }
          break;
        // ---- enemy telegraphs ----
        case "windHeavy":
          if (this.gate(id, 0.15)) {
            this.tone(70, 0.45, "sawtooth", 0.08, { to: 165, lp: 500, attack: 0.15 });
            this.noise(0.4, 0.05, { type: "bandpass", f: 300, to: 900, q: 1.2, attack: 0.15 });
          }
          break;
        case "windWhine":
          if (this.gate(id, 0.15)) {
            this.tone(300, 0.5, "sawtooth", 0.04, { to: 1400, lp: 3e3, attack: 0.3 });
            this.tone(150, 0.5, "square", 0.02, { to: 700, lp: 1500, attack: 0.3 });
          }
          break;
        case "windSlash":
          if (this.gate(id, 0.15)) {
            this.noise(0.25, 0.07, { type: "bandpass", f: 1e3, to: 4500, q: 3 });
            this.tone(500, 0.25, "triangle", 0.04, { to: 1800 });
          }
          break;
        case "windDrill":
          if (this.gate(id, 0.15)) {
            this.tone(140, 0.5, "square", 0.03, { to: 320, lp: 1500, attack: 0.1 });
            this.tone(147, 0.5, "square", 0.03, { to: 336, lp: 1500, attack: 0.1 });
            this.noise(0.4, 0.04, { type: "highpass", f: 3e3, attack: 0.2 });
          }
          break;
        case "windLeap":
          if (this.gate(id, 0.12)) {
            this.tone(210, 0.16, "sine", 0.07, { to: 100 });
            this.tone(150, 0.14, "sine", 0.06, { to: 430, at: 0.15 });
          }
          break;
        case "lock":
          // sniper: three pings that speed up, then a long one
          if (this.gate(id, 0.15)) {
            [0, 0.12, 0.21, 0.28].forEach((at, i) =>
              this.tone(1800 + i * 450, i === 3 ? 0.2 : 0.05, "sine", 0.045, { at }),
            );
          }
          break;
        case "servo":
          // turret: servo ticks and a lock blip
          if (this.gate(id, 0.15)) {
            [0, 0.07, 0.14].forEach((at, i) => this.tone(200 + i * 60, 0.05, "triangle", 0.035, { at, to: 330 }));
            this.tone(900, 0.06, "square", 0.02, { at: 0.24, lp: 2e3 });
          }
          break;
        case "plant":
          // minebot/sapper: a thunk and a beep
          if (this.gate(id, 0.1)) {
            this.tone(350, 0.1, "sine", 0.1, { to: 170 });
            this.tone(1000, 0.05, "square", 0.025, { at: 0.08, lp: 3e3 });
          }
          break;
        case "hatch":
          if (this.gate(id, 0.08)) {
            this.tone(320 * pitch, 0.12, "sine", 0.08, { to: 120 });
            this.noise(0.12, 0.05, { type: "bandpass", f: 600, to: 250, q: 4 });
            if (arg) {
              this.tone(95, 0.35, "sine", 0.16, { to: 45 });
            }
          }
          break;
        case "guardUp":
          if (this.gate(id, 0.2)) {
            this.tone(520, 0.12, "triangle", 0.05);
            this.tone(830, 0.14, "triangle", 0.04, { at: 0.05 });
            this.noise(0.06, 0.05, { type: "bandpass", f: 2500 });
          }
          break;
        case "ram":
          if (this.gate(id, 0.1)) {
            this.noise(0.3, 0.1, { type: "bandpass", f: 400, to: 1500, q: 1.2 });
            this.tone(90, 0.3, "sine", 0.12, { to: 55 });
          }
          break;
        case "ramDrill":
          if (this.gate(id, 0.1)) {
            this.noise(0.3, 0.08, { type: "bandpass", f: 1800, to: 600, q: 2 });
            this.tone(180, 0.3, "square", 0.03, { to: 90, lp: 1200 });
          }
          break;
        case "beamSmall":
          if (this.gate(id, 0.2)) {
            this.tone(800, 0.5, "sine", 0.04, { to: 2400, attack: 0.15 });
            this.tone(1200, 0.5, "sine", 0.02, { to: 3600, attack: 0.15 });
          }
          break;
        case "freeze":
          if (this.gate(id, 0.12)) {
            this.tone(3200, 0.12, "sine", 0.03, { to: 1800 });
            this.noise(0.05, 0.04, { type: "highpass", f: 6e3 });
          }
          break;
        case "chain":
          if (this.gate(id, 0.08)) {
            this.tone(2400 * pitch, 0.08, "sawtooth", 0.018, { to: 600, lp: 6e3 });
            this.noise(0.04, 0.03, { type: "bandpass", f: 5e3 });
          }
          break;
        case "wing":
          if (this.gate(id, 0.1)) {
            this.tone(1100 * pitch, 0.05, "triangle", 0.015, { to: 800 });
          }
          break;
        case "bounce":
          if (this.gate(id, 0.1)) {
            this.tone(210, 0.08, "sine", 0.05, { to: 120 });
          }
          break;
        case "supply":
          [0, 0.07, 0.14].forEach((at, i) => this.tone(midiToFreq(76 + [0, 4, 7][i]), 0.18, "triangle", 0.05, { at }));
          break;
        case "bounty":
          this.tone(1568, 0.1, "sine", 0.05);
          this.tone(2093, 0.22, "sine", 0.05, { at: 0.07 });
          break;
        case "comboEnd":
          if (this.gate(id, 0.3)) {
            this.tone(660, 0.14, "sine", 0.03, { to: 440 });
          }
          break;
        // ---- boss telegraphs (arg: boss id) ----
        case "bWind":
          if (this.gate(id, 0.2)) {
            let f = midiToFreq(BOSS_ROOT[arg] || 45),
              b = BOSS_SOUND[arg] || BOSS_SOUND.warden;
            this.tone(f, 0.7, b.wave, 0.12, { to: f * 2.6, lp: 700, attack: 0.3, detune: b.det });
            this.noise(0.6, 0.08, { type: "bandpass", f: 300, to: 1500, q: 1.2, attack: 0.3 });
            this.bossMotif(arg, 0.03, 0.4);
          }
          break;
        case "bRing":
          if (this.gate(id, 0.2)) {
            let f = midiToFreq(BOSS_ROOT[arg] || 45),
              b = BOSS_SOUND[arg] || BOSS_SOUND.warden;
            this.tone(f * 4, 0.55, b.wave, 0.05, { to: f * 10, lp: 2200, attack: 0.3, detune: b.det });
            this.noise(0.5, 0.07, { type: "bandpass", f: 800, to: 3e3, q: 1.5, attack: 0.25 });
            this.bossMotif(arg, 0.03, 0.3);
          }
          break;
        case "bSlam":
          if (this.gate(id, 0.2)) {
            let f = midiToFreq(BOSS_ROOT[arg] || 45),
              b = BOSS_SOUND[arg] || BOSS_SOUND.warden;
            this.tone(f, 0.55, "sine", 0.2, { to: f * 2, attack: 0.3 });
            this.tone(f * 2, 0.5, b.wave === "sine" ? "triangle" : b.wave, 0.04, {
              to: f * 4,
              lp: 600,
              attack: 0.3,
              detune: b.det,
            });
            this.noise(0.5, 0.05, { f: 200, to: 900, attack: 0.3 });
          }
          break;
        case "bSummon":
          if (this.gate(id, 0.2)) {
            let f = midiToFreq((BOSS_ROOT[arg] || 45) + 36),
              b = BOSS_SOUND[arg] || BOSS_SOUND.warden;
            this.tone(f, 0.7, "sine", 0.05, { attack: 0.35 });
            this.tone(f * 1.006, 0.7, "sine", 0.05, { attack: 0.35, detune: b.det });
            this.tone(f * 1.5, 0.7, "sine", 0.03, { attack: 0.4 });
            this.noise(0.6, 0.05, { type: "bandpass", f: 500, to: 2600, q: 2, attack: 0.3 });
            this.bossMotif(arg, 0.025, 0.3);
          }
          break;
        case "bNova":
          if (this.gate(id, 0.2)) {
            this.noise(0.8, 0.09, { type: "bandpass", f: 6e3, to: 500, q: 1.2, attack: 0.5 });
            this.tone(midiToFreq(BOSS_ROOT[arg] || 52) * 2, 0.8, "sine", 0.08, {
              to: midiToFreq(BOSS_ROOT[arg] || 52) * 0.5,
              attack: 0.4,
            });
          }
          break;
        case "bLance":
          if (this.gate(id, 0.2)) {
            [0, 0.09, 0.18].forEach((at, i) =>
              this.tone(2400 + i * 500, 0.14, "triangle", 0.035, { at, to: 3600 + i * 400 }),
            );
            this.noise(0.3, 0.04, { type: "highpass", f: 5e3, attack: 0.15 });
          }
          break;
        case "bStoke":
          if (this.gate(id, 0.2)) {
            this.tone(80, 0.8, "sawtooth", 0.1, { to: 220, lp: 700, attack: 0.4 });
            this.noise(0.8, 0.08, { f: 400, to: 2500, attack: 0.4 });
          }
          break;
        case "bRain":
          if (this.gate(id, 0.2)) {
            for (let i = 0; i < 5; i++) {
              this.noise(0.1, 0.05, { type: "bandpass", f: 1500 + Math.random() * 2500, q: 2, at: i * 0.07 });
            }
            this.tone(140, 0.4, "sine", 0.06, { to: 90, attack: 0.15 });
          }
          break;
        case "enrage": {
          // a roar on the boss's own pitch and timbre, then its motif once more
          let b = BOSS_SOUND[arg] || BOSS_SOUND.warden,
            f = midiToFreq((BOSS_ROOT[arg] || 45) - 8),
            wave = b.wave === "sine" ? "sawtooth" : b.wave;
          this.tone(f, 1, wave, 0.14, { to: f * 2.15, lp: 900, attack: 0.15 });
          this.tone(f * 1.057, 1, wave, 0.12, { to: f * 2.27, lp: 900, attack: 0.15, detune: b.det });
          this.noise(0.9, 0.1, { type: "bandpass", f: 350, to: 1600, q: 1.5, attack: 0.1 });
          this.tone(f * 0.65, 0.8, "sine", 0.25, { to: f * 0.43 });
          this.bossMotif(arg, 0.045, 0.55);
          break;
        }
        case "phase":
          // Rift Core changes phase: a downward sweep into a fifth
          this.tone(2400, 0.7, "sine", 0.07, { to: 180 });
          this.tone(midiToFreq(42), 0.8, "sawtooth", 0.09, { lp: 700, at: 0.5, attack: 0.05 });
          this.tone(midiToFreq(49), 0.8, "sawtooth", 0.07, { lp: 700, at: 0.5, attack: 0.05 });
          this.noise(0.6, 0.08, { type: "bandpass", f: 4e3, to: 300, q: 2 });
          break;
        case "bossDown": {
          // aftermath of the kill: falling debris, a last boom, a resolving chord of the boss's own colour and
          // its motif as a farewell
          let b = BOSS_SOUND[arg] || BOSS_SOUND.warden,
            root = (BOSS_ROOT[arg] || 45) + 12;
          for (let i = 0; i < 4; i++) {
            this.noise(0.25, 0.14 - i * 0.02, { f: 1200 - i * 200, to: 150, at: i * 0.22 });
          }
          this.tone(90, 0.9, "sine", 0.25, { to: 30, at: 0.3 });
          b.chord.forEach((n, i) =>
            this.tone(midiToFreq(root + n), 1, b.wave === "sine" ? "sine" : "triangle", 0.05, {
              at: 0.8 + i * 0.06,
              attack: 0.05,
              detune: b.det,
            }),
          );
          this.bossMotif(arg, 0.035, 1.05);
          break;
        }
        case "bossIntro":
          this.bossIntro(arg);
          break;
        case "bossCleared":
          // boss wave clear: a short fanfare
          [0, 0.12, 0.24, 0.36, 0.6].forEach((at, i) =>
            this.tone(midiToFreq(62 + [0, 7, 12, 16, 19][i]), i === 4 ? 0.9 : 0.35, "sawtooth", 0.05, { at, lp: 2600 }),
          );
          [0, 0.12, 0.24, 0.36, 0.6].forEach((at, i) =>
            this.tone(midiToFreq(74 + [0, 7, 12, 16, 19][i]), i === 4 ? 0.9 : 0.35, "triangle", 0.05, { at }),
          );
          this.tone(midiToFreq(38), 1, "sine", 0.14, { at: 0.6 });
          break;
        // ---- upgrades and interface ----
        case "pick":
          this.pickSound(arg);
          break;
        case "hover":
          if (this.gate(id, 0.05)) {
            this.tone(1500, 0.03, "sine", 0.02);
          }
          break;
        case "reroll":
          [0, 0.05, 0.1].forEach((at, i) => this.tone(700 + i * 260, 0.05, "square", 0.025, { at, lp: 3e3 }));
          this.noise(0.25, 0.05, { type: "bandpass", f: 900, to: 3e3, q: 1.5 });
          break;
        case "offer":
          this.noise(0.4, 0.05, { type: "bandpass", f: 500, to: 3500, q: 1.5, attack: 0.15 });
          this.tone(880, 0.2, "sine", 0.04, { at: 0.15 });
          break;
        default:
          break;
      }
    }
    /* 2.9.0: the signature motif of a boss (3 to 4 short notes), quiet; `at` seconds from now */
    bossMotif(id, vol, at = 0) {
      let b = BOSS_SOUND[id];
      if (!b) return;
      let root = (BOSS_ROOT[id] || 45) + 24;
      b.motif.forEach((n, i) =>
        this.tone(midiToFreq(root + n), 0.11, b.wave, vol, {
          at: at + i * b.gap,
          lp: Math.min(6e3, b.lp * 2),
          detune: b.det,
        }),
      );
    }
    pickSound(rarity) {
      switch (rarity) {
        case 1:
          // common: two soft sine notes, a rising fourth: small and friendly
          this.tone(midiToFreq(76), 0.14, "sine", 0.06);
          this.tone(midiToFreq(81), 0.2, "sine", 0.06, { at: 0.07 });
          break;
        case 2:
          // rare: a bright square arpeggio (major triad) with a click
          [0, 0.07, 0.14].forEach((at, i) =>
            this.tone(midiToFreq(72 + [0, 4, 7][i]), 0.2, "square", 0.04, { at, lp: 3e3 }),
          );
          this.tone(midiToFreq(91), 0.3, "triangle", 0.03, { at: 0.2 });
          this.noise(0.02, 0.05, { type: "highpass", f: 6e3 });
          break;
        case 3:
          // epic: a saw chord under a bell arpeggio (inharmonic partials) and a sparkle
          [0, 4, 7].forEach((n) => this.tone(midiToFreq(67 + n), 0.5, "sawtooth", 0.03, { lp: 2500, attack: 0.02 }));
          [0, 0.07, 0.14, 0.21].forEach((at, i) => {
            let f = midiToFreq(79 + [0, 4, 7, 12][i]);
            this.tone(f, 0.3, "triangle", 0.05, { at });
            this.tone(f * 2.76, 0.12, "sine", 0.012, { at });
          });
          this.noise(0.4, 0.04, { type: "highpass", f: 6e3, attack: 0.1 });
          break;
        case 4:
          // legendary: a sub boom, a wide major-seventh pad with detuned octaves, a high run and a rising shimmer
          this.tone(midiToFreq(36), 1, "sine", 0.16, { attack: 0.02, to: midiToFreq(34) });
          [0, 4, 7, 11].forEach((n) => {
            this.tone(midiToFreq(60 + n), 0.9, "sawtooth", 0.03, { lp: 1800, attack: 0.05 });
            this.tone(midiToFreq(72 + n), 0.8, "sawtooth", 0.018, { lp: 2400, attack: 0.08, detune: 9 });
          });
          [0, 0.1, 0.2, 0.3, 0.4].forEach((at, i) =>
            this.tone(midiToFreq(84 + [0, 4, 7, 12, 16][i]), 0.5, "sine", 0.05, { at }),
          );
          this.noise(0.8, 0.05, { type: "highpass", f: 3e3, attack: 0.5 });
          break;
        case 5:
          this._play("evolve");
          break;
        default:
          // no rarity: the card select click (also used by the reroll button and the volume test)
          this.tone(1568, 0.06, "square", 0.03, { lp: 4e3 });
          this.tone(2093, 0.1, "square", 0.03, { at: 0.05, lp: 4e3 });
      }
    }
    /* The cue when an event banner shows (arg: event id). */
    eventCue(id) {
      switch (id) {
        case "elite":
          [0, 0.1, 0.2].forEach((at, i) =>
            this.tone(midiToFreq(50 + [0, 7, 12][i]), 0.35, "sawtooth", 0.05, { at, lp: 2400 }),
          );
          this.tone(1450, 0.4, "triangle", 0.04, { at: 0.2 });
          this.noise(0.35, 0.05, { type: "bandpass", f: 2e3, to: 6e3, q: 2, at: 0.2 });
          break;
        case "rain":
          for (let i = 0; i < 8; i++) {
            this.tone(midiToFreq([84, 88, 91, 93, 96, 91, 88, 100][i]), 0.16, "sine", 0.03, { at: i * 0.08 });
          }
          this.noise(0.9, 0.04, { type: "highpass", f: 6e3, attack: 0.3 });
          break;
        case "meltdown":
          this.noise(1.6, 0.2, { f: 200, to: 2500, attack: 0.9 });
          this.tone(40, 1.6, "sawtooth", 0.2, { to: 72, lp: 200, attack: 0.8 });
          this.tone(36, 1.6, "sine", 0.28, { attack: 0.5 });
          this.noise(0.3, 0.12, { type: "highpass", f: 2500, at: 1.3 });
          break;
        case "whiteout":
          this.noise(1.8, 0.16, { type: "bandpass", f: 300, to: 2200, q: 1.2, attack: 0.8 });
          this.noise(1.4, 0.04, { type: "bandpass", f: 4500, q: 1, attack: 0.6 });
          this.tone(2637, 0.6, "sine", 0.03, { at: 1 });
          this.tone(3136, 0.6, "sine", 0.025, { at: 1.12 });
          break;
        case "bloom":
          for (let i = 0; i < 7; i++) {
            let f = 180 + Math.random() * 320;
            this.tone(f, 0.09, "sine", 0.06, { to: f * 2.2, at: i * 0.09 + Math.random() * 0.04 });
          }
          this.tone(90, 0.6, "sine", 0.15, { to: 55, at: 0.5 });
          this.noise(0.6, 0.05, { type: "bandpass", f: 500, q: 4, at: 0.4 });
          break;
        case "riftstorm":
          this.tone(200, 1.2, "sine", 0.06, { to: 2400, attack: 0.5 });
          this.tone(205, 1.2, "sine", 0.05, { to: 2500, attack: 0.5 });
          this.tone(3000, 0.9, "sine", 0.04, { to: 300, at: 0.5 });
          this.noise(1, 0.07, { type: "bandpass", f: 800, to: 4e3, q: 2, attack: 0.4 });
          this.tone(60, 0.7, "sine", 0.2, { to: 30, at: 1.2 });
          break;
        default:
          [0, 0.12, 0.24].forEach((at, i) =>
            this.tone(midiToFreq(62 + [0, 6, 12][i]), 0.3, "sawtooth", 0.05, { at, lp: 2400 }),
          );
      }
    }
    /* Boss card motif, one per boss. Length below 2 s. */
    bossIntro(id) {
      let d = 0.25;
      switch (id) {
        case "warden":
          // three hammer blows and a rising fifth
          [0, 0.22, 0.44].forEach((at) => {
            this.tone(midiToFreq(33), 0.3, "square", 0.14, { at: d + at, lp: 500, to: midiToFreq(31) });
            this.noise(0.12, 0.12, { f: 800, to: 200, at: d + at });
          });
          this.tone(midiToFreq(45), 0.9, "sawtooth", 0.09, { at: d + 0.7, lp: 900, attack: 0.05 });
          this.tone(midiToFreq(52), 0.9, "sawtooth", 0.07, { at: d + 0.7, lp: 900, attack: 0.05 });
          break;
        case "forge":
          // anvil strikes and a furnace roar
          [0, 0.3, 0.6].forEach((at, i) => {
            this.tone(1200 - i * 100, 0.4, "triangle", 0.06, { at: d + at });
            this.tone(1780 - i * 140, 0.3, "triangle", 0.04, { at: d + at });
            this.tone(midiToFreq(38), 0.3, "sine", 0.18, { at: d + at, to: 45 });
            this.noise(0.08, 0.1, { type: "bandpass", f: 3e3, at: d + at });
          });
          this.noise(0.8, 0.14, { f: 300, to: 2400, attack: 0.5, at: d + 0.9 });
          this.tone(midiToFreq(38), 0.8, "sawtooth", 0.1, { lp: 500, at: d + 0.9, attack: 0.3 });
          break;
        case "prism":
          // glass: a falling shimmer of pure tones
          [88, 84, 79, 76, 71, 64].forEach((m, i) => {
            this.tone(midiToFreq(m), 0.5, "sine", 0.05, { at: d + i * 0.14 });
            this.tone(midiToFreq(m) * 1.004, 0.5, "sine", 0.04, { at: d + i * 0.14 });
          });
          this.tone(midiToFreq(40), 1, "sine", 0.12, { at: d + 0.6, attack: 0.2 });
          this.noise(0.9, 0.04, { type: "highpass", f: 6e3, attack: 0.3, at: d + 0.2 });
          break;
        case "queen":
          // wet: a wobbling low glide and bubbles
          this.tone(midiToFreq(41), 0.9, "sawtooth", 0.1, { to: midiToFreq(44), lp: 350, at: d });
          this.tone(midiToFreq(41) * 1.02, 0.9, "sawtooth", 0.08, { to: midiToFreq(44), lp: 350, at: d });
          this.tone(midiToFreq(48), 0.7, "triangle", 0.06, { to: midiToFreq(51), at: d + 0.5, attack: 0.1 });
          for (let i = 0; i < 6; i++) {
            let f = 200 + Math.random() * 300;
            this.tone(f, 0.08, "sine", 0.05, { to: f * 2, at: d + 0.2 + i * 0.13 });
          }
          break;
        case "core":
          // void: a rising tritone drone with a reversed sweep and a sub drop
          this.tone(midiToFreq(30), 1.3, "sawtooth", 0.09, { lp: 600, to: midiToFreq(36), attack: 0.5, at: d });
          this.tone(midiToFreq(36), 1.3, "sawtooth", 0.07, { lp: 600, to: midiToFreq(42), attack: 0.5, at: d });
          this.tone(200, 0.9, "sine", 0.05, { to: 3000, attack: 0.6, at: d });
          this.noise(0.9, 0.09, { type: "bandpass", f: 400, to: 5e3, q: 2, attack: 0.6, at: d });
          this.tone(70, 0.5, "sine", 0.25, { to: 28, at: d + 1.2 });
          break;
        default:
          this._play("boss");
      }
    }
    consume(events) {
      if (!this.live()) return;
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
                this.play(RL_DEATH_FAMILY[ev.type] || "kill", ev.elite ? 1.8 : Math.max(1, ev.r * 1.6));
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
          case "barrier":
            this.play("shieldUp");
            break;
          case "dash":
            this.play("dash");
            break;
          case "edash":
            this.play(RL_DASH_VOICE[ev.type] || "blink");
            break;
          case "mine":
            this.play("plant");
            break;
          case "shard":
            this.play("shard");
            break;
          case "heal":
            this.play("heal");
            break;
          case "eshot":
            this.play(RL_ESHOT_VOICE[ev.type] || "eshot");
            break;
          case "aim":
            this.play(ev.type === "turret" ? "servo" : "lock");
            break;
          case "charge":
            this.play(RL_CHARGE_VOICE[ev.type] || "windHeavy", ev.type);
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
            this.play(ev.boss ? "bossCleared" : "cleared", ev.flawless);
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
            this.play(ev.small ? "beamSmall" : "beam");
            break;
          case "revive":
            this.play("nova");
            break;
          case "pick":
            this.play("pick", ev.evo ? 5 : (upgradesById[ev.id] && upgradesById[ev.id].rarity) || 1);
            break;
          case "kit":
            this.play("pick", 2);
            break;
          case "reroll":
            this.play("reroll");
            break;
          case "offer":
            this.play("offer");
            break;
          case "maxed":
            this.play("heal");
            break;
          case "block":
            this.play("block");
            break;
          case "guardBreak":
            this.play("guardBreak");
            break;
          case "guardUp":
            this.play("guardUp");
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
          case "comboEnd":
            this.play("comboEnd");
            break;
          case "bounty":
          case "bountyPulse":
            this.play("bounty");
            break;
          case "supplyDrop":
            this.play("supply");
            break;
          case "hatch":
            this.play("hatch", ev.big ? 1 : 0);
            break;
          case "freeze":
            this.play("freeze");
            break;
          case "chain":
            this.play("chain");
            break;
          case "wingShot":
            this.play("wing");
            break;
          case "bounce":
            this.play("bounce");
            break;
          // bosses
          case "boss":
            this.play("bossIntro", ev.id);
            break;
          case "bossAtk": {
            let voice = RL_BOSS_ATK[ev.atk];
            if (voice) this.play(voice, ev.id);
            break;
          }
          case "enrage":
            this.play("enrage", ev.id);
            break;
          case "phase":
            this.play("phase");
            break;
          case "bossDown":
            this.bossOver = true;
            this.play("bossDown", ev.id);
            break;
        }
    }
    setMusic(mode, biome) {
      if (mode === "boss" && this.mode !== "boss") {
        this.bossOver = false;
      }
      this.mode = mode;
      if (biome) {
        this.biome = biome;
      }
    }
    /* The boss is dead: the boss variant of the music fades back into the fight theme. */
    bossEnd() {
      this.bossOver = true;
    }
    /* Called every frame of a running world: `speed` (0..1, null: no engine hum) drives the drone
     hum, `ambience` is the id of the biome event that is on (or null). Everything here stops by
     itself when this is not called for 0.8 s (pause, menus) or the music mode is not a fight. */
    setState(speed, ambience) {
      if (!this.ctx) return;
      this.liveT = this.ctx.currentTime;
      this.speed = speed;
      this.amb = AMBIENCE_LEVEL[ambience] ? ambience : null;
      let hum = this.beds.hum;
      if (hum && speed != null) {
        let now = this.ctx.currentTime;
        hum.parts.a.frequency.setTargetAtTime(50 + 26 * speed, now, 0.08);
        hum.parts.b.frequency.setTargetAtTime(100 + 60 * speed, now, 0.08);
        hum.parts.lp.frequency.setTargetAtTime(160 + 260 * speed, now, 0.08);
      }
    }
    /* Beds are the quiet loops: the drone hum and the biome event ambience. */
    startBed(name) {
      let ctx = this.ctx,
        now = ctx.currentTime,
        gain = ctx.createGain(),
        nodes = [],
        parts = {},
        level = name === "hum" ? 0.02 : AMBIENCE_LEVEL[name] || 0.03;
      gain.gain.setValueAtTime(1e-4, now);
      gain.gain.setTargetAtTime(level, now, 0.35);
      gain.connect(this.sfx);
      let osc = (type, freq) => {
          let node = ctx.createOscillator();
          node.type = type;
          node.frequency.value = freq;
          node.start(now);
          nodes.push(node);
          return node;
        },
        loop = (rate) => {
          let node = ctx.createBufferSource();
          node.buffer = this.noiseBuf;
          node.loop = true;
          node.playbackRate.value = rate;
          node.start(now, Math.random() * 0.5);
          nodes.push(node);
          return node;
        },
        filter = (type, freq, q, from) => {
          let node = ctx.createBiquadFilter();
          node.type = type;
          node.frequency.value = freq;
          node.Q.value = q;
          from.connect(node);
          return node;
        };
      switch (name) {
        case "hum": {
          // two thruster voices, pitch follows the speed (setState)
          parts.a = osc("sawtooth", 50);
          parts.b = osc("sine", 100);
          parts.lp = filter("lowpass", 160, 0.7, parts.a);
          let mix = ctx.createGain();
          mix.gain.value = 0.5;
          parts.b.connect(mix);
          mix.connect(gain);
          parts.lp.connect(gain);
          break;
        }
        case "meltdown": {
          let rumble = filter("lowpass", 170, 0.8, loop(0.5));
          rumble.connect(gain);
          let sub = osc("sine", 41),
            amp = ctx.createGain();
          amp.gain.value = 0.7;
          sub.connect(amp);
          amp.connect(gain);
          // 2.9.0: a rough saw under it and the hiss of hot air
          let grind = filter("lowpass", 120, 0.8, osc("sawtooth", 41.2)),
            grindAmp = ctx.createGain();
          grindAmp.gain.value = 0.3;
          grind.connect(grindAmp);
          grindAmp.connect(gain);
          let hiss = filter("highpass", 3500, 0.7, loop(1.7)),
            hissAmp = ctx.createGain();
          hissAmp.gain.value = 0.12;
          hiss.connect(hissAmp);
          hissAmp.connect(gain);
          break;
        }
        case "whiteout": {
          // wind: band-passed noise whose centre wanders slowly
          let wind = filter("bandpass", 700, 0.7, loop(1)),
            lfo = osc("sine", 0.13),
            depth = ctx.createGain();
          depth.gain.value = 320;
          lfo.connect(depth);
          depth.connect(wind.frequency);
          wind.connect(gain);
          // 2.9.0: a thin second wind, higher and slower, that whistles
          let whistle = filter("bandpass", 1700, 5, loop(1.3)),
            lfo2 = osc("sine", 0.07),
            depth2 = ctx.createGain(),
            whistleAmp = ctx.createGain();
          depth2.gain.value = 600;
          whistleAmp.gain.value = 0.35;
          lfo2.connect(depth2);
          depth2.connect(whistle.frequency);
          whistle.connect(whistleAmp);
          whistleAmp.connect(gain);
          break;
        }
        case "bloom": {
          // low gurgle under the bubbles
          let gurgle = filter("lowpass", 320, 1.5, loop(0.35));
          gurgle.connect(gain);
          // 2.9.0: a burbling band of noise whose pitch wobbles about twice a second
          let burble = filter("bandpass", 200, 3, loop(0.6)),
            wobble = osc("sine", 0.55),
            wobbleDepth = ctx.createGain(),
            burbleAmp = ctx.createGain();
          wobbleDepth.gain.value = 70;
          burbleAmp.gain.value = 0.9;
          wobble.connect(wobbleDepth);
          wobbleDepth.connect(burble.frequency);
          burble.connect(burbleAmp);
          burbleAmp.connect(gain);
          break;
        }
        case "riftstorm": {
          // two close low tones that beat
          let a = osc("sine", 55),
            b = osc("sine", 57.5),
            c = osc("sine", 110),
            d = osc("sine", 113.5),
            upper = ctx.createGain();
          a.connect(gain);
          b.connect(gain);
          // 2.9.0: the same beat an octave higher
          upper.gain.value = 0.4;
          c.connect(upper);
          d.connect(upper);
          upper.connect(gain);
          break;
        }
        default:
          break;
      }
      let bed = { name, gain, nodes, parts };
      this.beds[name] = bed;
      for (let node of nodes) {
        this.voices.push({ node: node, amp: gain, pri: 3, start: now, end: 1e9, loop: true, bed: bed });
      }
    }
    stopBed(name, at = 0) {
      let bed = this.beds[name];
      if (!bed) return;
      let ctx = this.ctx,
        now = ctx.currentTime + at,
        end = now + 0.4;
      try {
        bed.gain.gain.cancelScheduledValues(now);
        bed.gain.gain.setTargetAtTime(0, now, 0.08);
        for (let node of bed.nodes) node.stop(end);
      } catch {}
      for (let voice of this.voices)
        if (voice.bed === bed) {
          voice.loop = false;
          voice.end = end;
        }
      if (end > this.maxEnd) this.maxEnd = end;
      delete this.beds[name];
    }
    /* Runs with the scheduler: starts and stops the beds by the state set with setState and plays the
     periodic accents of the biome events. */
    syncAudio() {
      let ctx = this.ctx,
        now = ctx.currentTime,
        live = now - this.liveT < 0.8 && (this.mode === "fight" || this.mode === "boss") && this.sfxVol > 0,
        hum = live && this.speed != null,
        amb = live ? this.amb : null;
      if (hum !== !!this.beds.hum) {
        if (hum) this.startBed("hum");
        else this.stopBed("hum");
      }
      for (let name of Object.keys(this.beds)) {
        if (name !== "hum" && name !== amb) this.stopBed(name);
      }
      if (amb && !this.beds[amb]) this.startBed(amb);
      if (amb && now >= this.accentT) this.accent(amb, now);
      if (this.voices.length > 8) {
        for (let i = this.voices.length - 1; i >= 0; i--)
          if (this.voices[i].end < now) {
            this.voices[i] = this.voices[this.voices.length - 1];
            this.voices.pop();
          }
      }
    }
    accent(name, now) {
      this.curPri = 1;
      switch (name) {
        case "meltdown":
          // a low groan of the furnace with a couple of crackles
          this.accentT = now + 0.9 + Math.random() * 1.4;
          this.tone(70 + Math.random() * 30, 0.4, "sine", 0.07, { to: 40 });
          this.noise(0.3, 0.05, { f: 300, to: 120 });
          this.noise(0.025, 0.05, { type: "highpass", f: 4e3, at: Math.random() * 0.25 });
          this.noise(0.025, 0.04, { type: "highpass", f: 5e3, at: Math.random() * 0.25 });
          break;
        case "whiteout":
          // a gust of wind and a high icy ring
          this.accentT = now + 1.8 + Math.random() * 2.2;
          this.noise(1.2, 0.06, { type: "bandpass", f: 500, to: 1400, q: 1, attack: 0.5 });
          this.tone(2200 + Math.random() * 800, 0.6, "sine", 0.016, { attack: 0.2 });
          break;
        case "bloom": {
          // bubbles, close together
          this.accentT = now + 0.08 + Math.random() * 0.25;
          let f = 200 + Math.random() * 500;
          this.tone(f, 0.08, "sine", 0.045, { to: f * 1.8 });
          if (Math.random() < 0.4) this.tone(f * 0.6, 0.06, "sine", 0.03, { to: f * 1.1, at: 0.05 });
          break;
        }
        case "riftstorm":
          // the sweep up or down, and a dry tick of a far discharge
          this.accentT = now + 2.4 + Math.random() * 1.2;
          this.accentFlip = !this.accentFlip;
          this.tone(this.accentFlip ? 300 : 2000, 0.9, "sine", 0.045, {
            to: this.accentFlip ? 2000 : 300,
            attack: 0.4,
          });
          this.noise(0.9, 0.04, {
            type: "bandpass",
            f: this.accentFlip ? 1000 : 3500,
            to: this.accentFlip ? 3500 : 1000,
            q: 2,
            attack: 0.4,
          });
          this.tone(3800 + Math.random() * 1500, 0.03, "square", 0.015, { at: 0.3 + Math.random() * 0.4, lp: 6e3 });
          break;
        default:
          this.accentT = now + 5;
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
      try {
        this.syncAudio();
      } catch (err) {
        this.fail(err);
      }
      if (this.nextT < ctx.currentTime - 0.5) {
        this.nextT = ctx.currentTime + 0.05;
      }
      for (; this.nextT < ctx.currentTime + 0.14; ) {
        // the boss variant eases in with the boss and out again after it (about 3 s)
        this.bossMix += ((this.mode === "boss" && !this.bossOver ? 1 : 0) - this.bossMix) * 0.08;
        if (this.bossMix < 0.01) this.bossMix = 0;
        let fightish = this.mode === "boss" || this.mode === "fight",
          bpm = fightish ? 122 + ((BOSS_BPM[this.biome] || 134) - 122) * this.bossMix : 100;
        if (this.mode !== "off" && this.musVol > 0) {
          this.note(this.step, this.nextT);
        }
        this.nextT += 60 / bpm / 4;
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
        mix = this.bossMix,
        fight = this.mode === "fight" || this.mode === "boss",
        boss = mix > 0.5,
        at = time - this.ctx.currentTime,
        dest = this.mus;
      if (fight) {
        let level = Math.max(this.intensity, 0.7 * mix),
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
        if (mix > 0.25) {
          this.bossLayer(beat, bar, root, chord, voice, at, dest, mix);
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
    /* What the boss variant adds to the fight theme of its biome (same chords): syncopated chord
     stabs, an octave pulse, an extra kick, a riser at the end of the phrase and one voice of its
     own per biome. `mix` (0..1) fades everything in and out. */
    bossLayer(beat, bar, root, chord, voice, at, dest, mix) {
      if ((21577 >> beat) & 1) {
        let wave = BOSS_STAB[this.biome] || "square";
        this.tone(midiToFreq(chord[0] + 12), 0.09, wave, 0.018 * mix, { lp: voice.lp + 1200, dest: this.delay, at });
        this.tone(midiToFreq(chord[2] + 12), 0.09, wave, 0.014 * mix, { lp: voice.lp + 1200, dest: this.delay, at });
      }
      if (beat % 4 === 3) {
        this.tone(midiToFreq(root - 12), 0.1, voice.bass, 0.05 * mix, { lp: 600, dest, at });
      }
      if (beat % 8 === 6) {
        this.tone(150, 0.1, "sine", 0.3 * mix, { to: 45, dest, at });
      }
      if (bar === 3 && (beat === 8 || beat === 12)) {
        this.noise(0.22, 0.05 * mix, { type: "bandpass", f: 1500 + beat * 200, to: 7e3, q: 1, dest, at });
      }
      switch (this.biome) {
        case "works":
          if (beat === 8) {
            this.noise(0.1, 0.08 * mix, { type: "bandpass", f: 1400, dest, at });
            this.tone(260, 0.1, "triangle", 0.03 * mix, { dest, at });
          }
          break;
        case "vault":
          if (beat % 2 === 0) {
            this.tone(midiToFreq(chord[3] + 24), 0.05, "sine", 0.014 * mix, { dest: this.delay, at });
          }
          break;
        case "void":
          if (beat === 0) {
            this.tone(midiToFreq(root + 18), 0.3, "square", 0.014 * mix, { dest: this.delay, at, lp: 2500 });
          }
          break;
        case "marsh":
          if (beat % 4 === 0) {
            this.tone(midiToFreq(root - 12), 0.18, "sawtooth", 0.05 * mix, { lp: 400, detune: 12, dest, at });
          }
          break;
        default:
          break;
      }
    }
    static catalog() {
      return rlSoundCatalog();
    }
    /* Test hook: render one sound (or a bed, or a stretch of music) offline: mono, 44.1 kHz. The sound
     starts 0.25 s into the render (like in the game, where the compressors are already running). */
    static async renderOffline(spec, seconds = 2) {
      let Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext,
        ctx = new Offline(1, Math.ceil(44100 * (seconds + 0.35)), 44100),
        engine = new SoundEngine(),
        base = 0;
      engine.attach(ctx);
      engine.sfxVol = 1;
      ctx.suspend(0.25).then(() => {
        base = ctx.currentTime;
        if (spec.bed) {
          engine.startBed(spec.bed);
          engine.stopBed(spec.bed, spec.stopAt || 1.2);
        } else if (spec.music) {
          engine.mode = spec.music;
          engine.biome = spec.biome;
          engine.bossMix = spec.music === "boss" ? 1 : 0;
          engine.intensity = 0.9;
          let bpm = spec.music === "boss" ? BOSS_BPM[spec.biome] : 122,
            len = 60 / bpm / 4;
          for (let step = 0, t = 0; t < seconds - 0.25; step++, t += len) {
            engine.simT = base + t;
            engine.note(step % 64, base + t);
            // 2.9.0: a flood of sounds in every step; the music notes must all be scheduled anyway
            if (spec.flood)
              for (let k = 0; k < 30; k++) {
                engine.last = Object.create(null);
                let flood = RL_FLOOD[(step * 7 + k) % RL_FLOOD.length];
                engine.play(flood[0], flood[1]);
              }
          }
          engine.simT = null;
        } else if (spec.noise) {
          // 2.9.1: a raw noise burst (tests that long bursts are not cut off)
          engine.noise(spec.noise.dur, spec.noise.vol, spec.noise.opts || {});
        } else {
          engine.play(spec.id, spec.arg);
        }
        ctx.resume();
      });
      let buffer = await ctx.startRendering(),
        data = buffer.getChannelData(0),
        peak = 0,
        sum = 0,
        finite = true;
      for (let i = 0; i < data.length; i++) {
        let v = data[i];
        if (!Number.isFinite(v)) {
          finite = false;
          break;
        }
        peak = Math.max(peak, Math.abs(v));
        sum += v * v;
      }
      let last = 0;
      for (let i = data.length - 1; i >= 0; i--)
        if (Math.abs(data[i]) > 1e-3) {
          last = i / 44100 - base;
          break;
        }
      return {
        finite,
        peak,
        rms: Math.sqrt(sum / data.length),
        length: data.length / 44100 - base,
        lastAudible: last,
        maxEnd: engine.maxEnd - base,
        dropped: engine.dropped,
        musicScheduled: engine.musicScheduled,
        musicSkipped: engine.musicSkipped,
        failed: !!engine.failed,
        samples: spec.wav ? Array.from(data.subarray(Math.round(base * 44100))) : null,
      };
    }
  };
/* 2.9.0: what the music flood test throws at the engine (sound id, argument): every weapon, deaths, blasts */
const RL_FLOOD = [
  ...RL_SFX_VOICES.map((id) => [id]),
  ["boom"],
  ["hurt"],
  ["nova"],
  ["hit"],
  ["crit"],
  ["kill", 1.8],
  ["dCrunch", 1.6],
  ["dClang", 1.6],
  ["dShatter", 1.6],
  ["bigkill"],
  ["bSlam", "warden"],
  ["eshotBoss"],
];
function stepSeconds(bpm) {
  return 60 / bpm / 4;
}
/* Every sound the engine can make, as render specs for the offline test (SoundEngine.renderOffline). */
function rlSoundCatalog() {
  const list = [],
    add = (name, spec) => list.push({ name, spec }),
    ids = (names, arg) => names.forEach((id) => add(id + (arg !== undefined ? ":" + arg : ""), { id, arg }));
  ids(RL_SFX_VOICES);
  ids([
    "block",
    "guardBreak",
    "shieldPop",
    "lob",
    "blinkWarn",
    "blink",
    "heart",
    "evolve",
    "hit",
    "crit",
    "bigkill",
    "boom",
    "smallboom",
    "hurt",
    "shield",
    "shieldUp",
    "dash",
    "nova",
    "novaReady",
    "shard",
    "heal",
    "eshot",
    "snipe",
    "eshotDrone",
    "eshotTurret",
    "eshotBoss",
    "warn",
    "fuse",
    "spawn",
    "wave",
    "boss",
    "click",
    "erupt",
    "warp",
    "mend",
    "chill",
    "champion",
    "rumble",
    "ready",
    "buy",
    "deny",
    "die",
    "victory",
    "thud",
    "beam",
    "hover",
    "reroll",
    "offer",
    "pick",
    "cleared",
    "bossCleared",
  ]);
  ids(["kill"], 1.8);
  ids(["combo"], 6);
  ids(["cleared"], true);
  for (const id of new Set(Object.values(RL_DEATH_FAMILY))) ids([id], 1.6);
  ids([
    "windHeavy",
    "windWhine",
    "windSlash",
    "windDrill",
    "windLeap",
    "lock",
    "servo",
    "plant",
    "guardUp",
    "ram",
    "ramDrill",
    "beamSmall",
    "freeze",
    "chain",
    "wing",
    "bounce",
    "supply",
    "bounty",
    "comboEnd",
    "enrage",
    "phase",
    "bossDown",
  ]);
  ids(["hatch"], 0);
  ids(["hatch"], 1);
  for (const boss of Object.keys(BOSS_ROOT)) {
    ids(["bossIntro"], boss);
    for (const id of ["bWind", "bRing", "bSlam", "bSummon", "bNova", "bLance", "bStoke", "bRain", "enrage", "bossDown"])
      ids([id], boss);
  }
  for (const rarity of [1, 2, 3, 4, 5]) ids(["pick"], rarity);
  for (const id of ["elite", "rain", "meltdown", "whiteout", "bloom", "riftstorm"]) ids(["event"], id);
  for (const bed of ["hum", ...Object.keys(AMBIENCE_LEVEL)]) add("bed:" + bed, { bed });
  for (const biome of Object.keys(musicChords))
    for (const music of ["fight", "boss"]) add(`music:${biome}:${music}`, { music, biome });
  return list;
}

export {
  rlSoundCatalog,
  musicChords,
  RL_SFX_VOICES,
  rlShotSfx,
  musicVoices,
  SoundEngine,
  RL_DEATH_FAMILY,
  RL_ESHOT_VOICE,
  RL_CHARGE_VOICE,
  RL_DASH_VOICE,
  RL_BOSS_ATK,
  RL_SOUND_EVENTS,
  RL_SILENT_EVENTS,
  MAX_VOICES,
  MUSIC_DUCK,
  BOSS_SOUND,
};
