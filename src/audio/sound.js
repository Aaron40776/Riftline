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
  // 3.3.0: the Overdrive attacks (they also sound the Overdrive alarm, bOverdrive)
  lockdown: "bLance",
  meltdown: "bStoke",
  whiteout: "bNova",
  plague: "bSummon",
  collapse: "bRain",
};
const RL_OVERDRIVE = new Set(["lockdown", "meltdown", "whiteout", "plague", "collapse"]);
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
    mutator: 0.12,
    bOverdrive: 0.1,
    evolve: 0.1,
    guardBreak: 0.08,
    thud: 0.08,
    grenadeBlast: 0.1,
    tsCrusher: 0.08,
    tsRift: 0.08,
    bSlam: 0.08,
    rail: 0.06,
    scatter: 0.05,
    rocket: 0.05,
  },
  /* 3.2.0: the room of the big sounds (send level to the sound reverb); its size follows the biome (SFX_ROOM_BIOME).
     The trap strikes stay dry: they have to be told apart from the blasts at once. */
  SFX_ROOM = {
    boom: 0.3,
    grenadeBlast: 0.35,
    nova: 0.3,
    bigkill: 0.35,
    die: 0.3,
    bossIntro: 0.35,
    bossDown: 0.4,
    bSlam: 0.3,
    enrage: 0.3,
    phase: 0.25,
    rocket: 0.15,
    rail: 0.15,
    thud: 0.25,
    evolve: 0.3,
    victory: 0.3,
    mutator: 0.35,
    bOverdrive: 0.3,
  },
  /* how much room each biome gives the sounds: the Cryo Vault and the Void Core are vast, the Toxin Marsh damp */
  SFX_ROOM_BIOME = { yard: 0.28, works: 0.38, vault: 0.5, marsh: 0.2, void: 0.55 },
  AMBIENCE_LEVEL = { meltdown: 0.11, whiteout: 0.085, bloom: 0.06, riftstorm: 0.055 },
  MAX_VOICES = 24,
  // 2.8.2: the music has its own budget; shots and other sounds can no longer take notes away from it
  // 3.2.0: 36 (was 20): the boss tracks double-track their guitars (two amps) and play blast beats
  MAX_MUSIC_VOICES = 36,
  MUSIC_RESERVE = 6,
  /* sounds that are never dropped in favour of others when the voice limit is reached */
  KEY_SOUNDS = new Set([
    "mutator",
    "bOverdrive",
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
/* 3.0.0: the sound of each trap skin: charge (floor), hum (beam), fuse (mine) when it warns, and the strike */
const RL_TRAP_SOUND = {
  plate: { warn: "tcPlate", fire: "tsPlate" },
  crusher: { warn: "tcCrusher", fire: "tsCrusher" },
  icespike: { warn: "tcIce", fire: "tsIce" },
  geyser: { warn: "tcGeyser", fire: "tsGeyser" },
  riftburst: { warn: "tcRift", fire: "tsRift" },
  laser: { warn: "tbLaser" },
  flame: { warn: "tbFlame" },
  rift: { warn: "tbRift" },
  mine: { warn: "tmMine", fire: "tsMine" },
  frost: { warn: "tmFrost", fire: "tsFrost" },
  spore: { warn: "tmSpore", fire: "tsSpore" },
  riftmine: { warn: "tmRift", fire: "tsRiftMine" },
};
/* the beeps of the mines per skin: pitch, wave, filter (and an end-pitch factor for a chirp) */
const RL_MINE_BEEP = {
  mine: { f: 1500, wave: "square", lp: 4e3 },
  frost: { f: 2400, wave: "triangle", lp: 6e3 },
  spore: { f: 700, wave: "sine", lp: 2e3, to: 0.8 },
  riftmine: { f: 900, wave: "sawtooth", lp: 2500 },
};
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
  grenade: [{}],
  gadgetReady: [{}],
  gadgetDeny: [{}],
  ping: [{ resist: true }],
  trapWarn: [
    { fam: "floor", skin: "plate", delay: 1 },
    { fam: "floor", skin: "crusher", delay: 1 },
    { fam: "floor", skin: "icespike", delay: 1 },
    { fam: "floor", skin: "geyser", delay: 1 },
    { fam: "floor", skin: "riftburst", delay: 1 },
    { fam: "beam", skin: "laser", delay: 1, dur: 2 },
    { fam: "beam", skin: "flame", delay: 1, dur: 2 },
    { fam: "beam", skin: "rift", delay: 1, dur: 2 },
    { fam: "mine", skin: "mine", delay: 0.45 },
    { fam: "mine", skin: "frost", delay: 0.45 },
    { fam: "mine", skin: "spore", delay: 0.45 },
    { fam: "mine", skin: "riftmine", delay: 0.45 },
  ],
  trapFire: [
    { skin: "plate" },
    { skin: "crusher" },
    { skin: "icespike" },
    { skin: "geyser" },
    { skin: "riftburst" },
    { skin: "mine" },
    { skin: "frost" },
    { skin: "spore" },
    { skin: "riftmine" },
  ],
  trapArm: [{ skin: "mine" }, { skin: "frost" }, { skin: "spore" }, { skin: "riftmine" }],
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
  "mutator", // 3.3.0: main.js plays its cue with the banner (after the biome card)
  "pop", // a bullet expiring: far too frequent
  "spark", // impact effect, covered by "dmg"
  "spawn", // one enemy appears: the "portal" group sound covers it
  "zap", // effect of the arc weapons, covered by their shot voice
]);

/* soft clipper curve: linear up to 0.7, then a smooth knee towards 0.98 (input is clamped to +-1, so
 the output never exceeds 0.93) */
/* 3.1.0: the curve of the distortion bus: a hard tanh with a little offset (even harmonics), unity at full drive */
function distortionCurve() {
  let n = 2049,
    curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let x = (i / (n - 1)) * 2 - 1;
    curve[i] = (Math.tanh(5 * (x + 0.08)) - Math.tanh(0.4)) / 0.97;
  }
  return curve;
}
/* 3.2.0: the curve of the two guitar amps: a hard, slightly asymmetric tanh (the drive comes from the input gain) */
function guitarCurve() {
  let n = 4097,
    curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(3.2 * (x + 0.04)) / Math.tanh(3.2) - Math.tanh(0.128) / Math.tanh(3.2);
  }
  return curve;
}
/* 3.2.0: the impulse of the music reverb: stereo noise that decays exponentially and gets darker as it decays */
const impulseCache = Object.create(null);
function roomImpulse(ctx, seconds) {
  // the same impulse serves every context of a sample rate (the tests build hundreds of engines)
  let key = ctx.sampleRate + ":" + seconds;
  if (impulseCache[key]) return impulseCache[key];
  let len = Math.round(ctx.sampleRate * seconds),
    buf = (impulseCache[key] = ctx.createBuffer(2, len, ctx.sampleRate));
  for (let ch = 0; ch < 2; ch++) {
    let data = buf.getChannelData(ch),
      lp = 0;
    for (let i = 0; i < len; i++) {
      let t = i / len,
        a = 0.55 + 0.42 * t;
      lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
      data[i] = lp * Math.pow(1 - t, 2.4) * (i < 90 ? i / 90 : 1) * 2.2;
    }
  }
  return buf;
}
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
      // 3.1.0: the music tracks (see MUSIC_TRACKS): what plays now, the preview of the settings screen, the boss
      // heat (0 calm, 1 after a phase change, 2 enraged), the stage buses and the counters of the voice budget
      this.pv = null;
      this.playKind = "off";
      this.playBiome = "yard";
      this.playPv = false;
      this.heat = 0;
      this.jump = false;
      this.fade = null;
      this.distIn = null;
      this.musicPeak = 0;
      this.musicShed = 0;
      this.musicLog = null;
      // 3.2.0: the music processing (see buildGraph) and the place of a track kept over a pause (held)
      this.glue = null;
      this.makeup = null;
      this.musLevel = null;
      this.pump = null;
      this.gtrL = null;
      this.gtrR = null;
      this.verbIn = null;
      this.mbed = null;
      this.held = null;
      this.resumeWanted = false;
      // 3.2.0: where the sounds are: the pan of the event being played (from its x relative to the listener) and
      // its room send (SFX_ROOM)
      this.curPan = 0;
      this.curRev = 0;
      this.sfxVerbIn = null;
      this.sfxVerbOut = null;
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
    /* opts.room: false leaves out the two reverbs (test engines that only count notes: every convolver holds the
       transform of its impulse, megabytes each) */
    buildGraph(ctx, opts = {}) {
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
      // 3.2.0: mus is the input of the music at unity; its volume is musLevel at the end of the music chain, so that
      // the glue compressor works the same at every volume setting
      this.mus = ctx.createGain();
      this.musLevel = ctx.createGain();
      this.musLevel.gain.value = this.musVol * 0.6;
      // 2.9.0: the music passes a gain stage of its own that dips briefly on big hits (duck)
      this.duckGain = ctx.createGain();
      // 3.1.0: a fade stage between the music and the duck (the calm theme fades back in after a boss), and one
      // WaveShaper bus for everything that has to be distorted (guitars, 808 sub, growl); it joins the music again
      this.fade = ctx.createGain();
      this.mus.connect(this.fade);
      // 3.2.0: fade -> glue compressor -> make-up gain -> volume -> duck (mixFor sets the glue per track kind)
      this.glue = ctx.createDynamicsCompressor();
      this.makeup = ctx.createGain();
      this.fade.connect(this.glue);
      this.glue.connect(this.makeup);
      this.makeup.connect(this.musLevel);
      this.musLevel.connect(this.duckGain);
      this.duckGain.connect(this.comp);
      this.mixFor("fight");
      // the pump: pads, bass, guitars and the distortion bus pass it; accented kicks dip it (a sidechain feel)
      this.pump = ctx.createGain();
      this.pump.connect(this.mus);
      this.distIn = ctx.createGain();
      this.dist = ctx.createWaveShaper();
      this.dist.curve = distortionCurve();
      this.dist.oversample = "2x";
      this.distLP = ctx.createBiquadFilter();
      this.distLP.type = "lowpass";
      this.distLP.frequency.value = 5200;
      this.distOut = ctx.createGain();
      this.distOut.gain.value = 0.55;
      this.distIn.connect(this.dist);
      this.dist.connect(this.distLP);
      this.distLP.connect(this.distOut);
      this.distOut.connect(this.pump);
      // 3.2.0: two guitar amps, panned left and right, for double-tracked riffs: drive, a tight low cut, a mid scoop,
      // some bite and a cabinet low-pass
      let amp = (pan) => {
        let input = ctx.createGain(),
          hp = ctx.createBiquadFilter(),
          shaper = ctx.createWaveShaper(),
          scoop = ctx.createBiquadFilter(),
          bite = ctx.createBiquadFilter(),
          cab = ctx.createBiquadFilter(),
          out = ctx.createGain();
        input.gain.value = 9;
        hp.type = "highpass";
        hp.frequency.value = 75;
        shaper.curve = guitarCurve();
        shaper.oversample = "2x";
        scoop.type = "peaking";
        scoop.frequency.value = 700;
        scoop.Q.value = 0.9;
        scoop.gain.value = -5;
        bite.type = "peaking";
        bite.frequency.value = 2400;
        bite.Q.value = 1.1;
        bite.gain.value = 4;
        cab.type = "lowpass";
        cab.frequency.value = 5200;
        cab.Q.value = 0.9;
        out.gain.value = 0.28;
        input.connect(hp);
        hp.connect(shaper);
        shaper.connect(scoop);
        scoop.connect(bite);
        bite.connect(cab);
        cab.connect(out);
        if (ctx.createStereoPanner) {
          let panner = ctx.createStereoPanner();
          panner.pan.value = pan;
          out.connect(panner);
          panner.connect(this.pump);
        } else out.connect(this.pump);
        return input;
      };
      this.gtrL = amp(-0.75);
      this.gtrR = amp(0.75);
      if (opts.room !== false) {
        // 3.2.0: the room of the music: a generated 2 s impulse; voices send to it with opts.rev
        this.verbIn = ctx.createGain();
        let verb = ctx.createConvolver();
        verb.buffer = roomImpulse(ctx, 2);
        let verbOut = ctx.createGain();
        verbOut.gain.value = 0.5;
        this.verbIn.connect(verb);
        verb.connect(verbOut);
        verbOut.connect(this.mus);
        // 3.2.0: the room of the big sounds (a shorter impulse); its level follows the biome (setMusic)
        this.sfxVerbIn = ctx.createGain();
        let sfxVerb = ctx.createConvolver();
        sfxVerb.buffer = roomImpulse(ctx, 1.4);
        this.sfxVerbOut = ctx.createGain();
        this.sfxVerbOut.gain.value = SFX_ROOM_BIOME.yard;
        this.sfxVerbIn.connect(sfxVerb);
        sfxVerb.connect(this.sfxVerbOut);
        this.sfxVerbOut.connect(this.sfx);
      }
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
    attach(ctx, opts) {
      this.offline = true;
      this.buildGraph(ctx, opts);
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
      this.musLevel.gain.setTargetAtTime(music * 0.6, now, 0.1);
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
    claim(pri, start, end, opt) {
      let now = this.nowT();
      // 2.8.2: music (priority 0) is counted apart from the sounds. It used to share the list, and every
      // shot or hit that found it full took the oldest music note: the music stuttered and dropped out
      // in heavy fights. Music never takes a voice from anyone and is skipped when its own list is full.
      // 3.1.0: the budget counts the voices that are alive at the start of the new one; a voice marked
      // optional (texture sounds) leaves MUSIC_RESERVE places to the kick, the bass and the other essentials
      if (pri === 0) {
        let music = this.musicVoiceList;
        if (music.length >= 12) {
          for (let i = music.length - 1; i >= 0; i--)
            if (music[i].end < now) {
              music[i] = music[music.length - 1];
              music.pop();
            }
        }
        if (end > this.maxEnd && end < 1e8) this.maxEnd = end;
        let live = 0;
        for (let i = 0; i < music.length; i++) if (music[i].end > start) live++;
        if (live >= MAX_MUSIC_VOICES - (opt ? MUSIC_RESERVE : 0)) {
          if (opt) this.musicShed++;
          else this.musicSkipped++;
          return null;
        }
        if (live + 1 > this.musicPeak) this.musicPeak = live + 1;
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
    /* opts: to (end pitch), detune, attack, hold (flat level after the attack), lp/q (low-pass; lpTo ends the
     sweep, lpCurve is a Float32Array of cut-offs over the whole note: wobble), env (Float32Array, 0..1: the whole
     level curve replaces the exponential envelope: tremolo), dest/at/pri, opt (an optional music voice) */
    tone(freq, dur, wave, vol, opts = {}) {
      let ctx = this.ctx,
        start = ctx.currentTime + (opts.at || 0),
        voice = this.claim(
          opts.pri != null ? opts.pri : opts.dest ? 0 : this.curPri,
          start,
          start + dur + 0.02,
          opts.opt,
        );
      if (!voice) return;
      this.logMusic(voice, "t", freq, vol, opts);
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
      this.envelope(amp, start, dur, vol, opts);
      let out = osc;
      if (opts.lp) {
        let filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = opts.lp;
        filter.Q.value = opts.q || 0.7;
        if (opts.lpCurve) filter.frequency.setValueCurveAtTime(opts.lpCurve, start, dur);
        else if (opts.lpTo) {
          filter.frequency.setValueAtTime(opts.lp, start);
          filter.frequency.exponentialRampToValueAtTime(opts.lpTo, start + dur);
        }
        out.connect(filter);
        out = filter;
      }
      out.connect(amp);
      this.route(amp, opts);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    }
    envelope(amp, start, dur, vol, opts) {
      let attack = opts.attack || 0.004;
      if (opts.env) {
        let env = opts.env,
          curve = new Float32Array(env.length);
        for (let i = 0; i < env.length; i++) curve[i] = env[i] * vol;
        amp.gain.setValueCurveAtTime(curve, start, dur);
        return;
      }
      amp.gain.setValueAtTime(1e-4, start);
      amp.gain.exponentialRampToValueAtTime(vol, start + attack);
      // 2.9.2: opts.hold keeps the level flat for that long after the attack (sustained sounds such as the
      // flame roar; the plain exponential decay drops 50 dB in a third of a second and pumps when repeated)
      if (opts.hold) amp.gain.setValueAtTime(vol, start + attack + opts.hold);
      amp.gain.exponentialRampToValueAtTime(1e-4, start + dur);
    }
    noise(dur, vol, opts = {}) {
      let ctx = this.ctx,
        start = ctx.currentTime + (opts.at || 0),
        voice = this.claim(
          opts.pri != null ? opts.pri : opts.dest ? 0 : this.curPri,
          start,
          start + dur + 0.02,
          opts.opt,
        );
      if (!voice) return;
      this.logMusic(voice, "n", opts.f || 2e3, vol, opts);
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
      this.envelope(amp, start, dur, vol, { ...opts, attack: opts.attack || 0.003 });
      src.connect(filter);
      filter.connect(amp);
      this.route(amp, opts);
      src.start(start, Math.random() * 0.5);
      src.stop(start + dur + 0.02);
    }
    /* 3.2.0: where a voice goes: its bus (opts.dest, the sounds by default), panned with opts.pan (-1..1) and sent to
       the music reverb with opts.rev (send level) */
    route(amp, opts) {
      // a sound (no bus of its own) takes the pan and the room of the event that is being played
      let dest = opts.dest || this.sfx,
        pan = opts.pan != null ? opts.pan : opts.dest ? 0 : this.curPan,
        rev = opts.rev != null ? opts.rev : opts.dest ? 0 : this.curRev,
        room = opts.dest ? this.verbIn : this.sfxVerbIn;
      if (pan && this.ctx.createStereoPanner) {
        let panner = this.ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        amp.connect(panner);
        panner.connect(dest);
      } else amp.connect(dest);
      if (rev && room) {
        let send = this.ctx.createGain();
        send.gain.value = rev;
        amp.connect(send);
        send.connect(room);
      }
    }
    /* 3.2.0: the glue of the music: gentle on the calm themes, hard and loud on the boss tracks (a dense wall) */
    mixFor(kind) {
      if (!this.glue) return;
      let boss = kind === "boss",
        g = this.glue,
        now = this.ctx.currentTime;
      g.threshold.setValueAtTime(boss ? -20 : -16, now);
      g.ratio.setValueAtTime(boss ? 5 : 2, now);
      g.knee.setValueAtTime(boss ? 3 : 10, now);
      g.attack.setValueAtTime(boss ? 0.004 : 0.02, now);
      g.release.setValueAtTime(boss ? 0.12 : 0.3, now);
      this.makeup.gain.cancelScheduledValues(now);
      this.makeup.gain.setValueAtTime(boss ? 2.1 : 1.1, now);
    }
    /* test hook: with musicLog set (an array) every music voice is recorded: kind, start, pitch, level, length,
       bus (m music, d delay, x distortion) */
    logMusic(voice, kind, pitch, vol, opts) {
      if (!this.musicLog || voice.pri !== 0) return;
      let dest = opts.dest;
      this.musicLog.push({
        kind,
        t: voice.start,
        pitch,
        vol,
        dur: voice.end - voice.start,
        bus:
          dest === this.delay
            ? "d"
            : dest === this.distIn
              ? "x"
              : dest === this.gtrL || dest === this.gtrR
                ? "g"
                : dest === this.pump
                  ? "p"
                  : "m",
      });
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
      this.curRev = SFX_ROOM[id] || 0;
      try {
        this._play(id, arg);
        if (MUSIC_DUCK[id]) this.duck(MUSIC_DUCK[id]);
      } catch (err) {
        this.fail(err);
      } finally {
        this.curPri = 1;
        this.curRev = 0;
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
          // flame jet: one continuous roar. The weapon fires 15 times a second, so every shot starts a
          // long, soft burst of filtered noise (slow 100 ms fade-in, long tail) that overlaps its
          // neighbours; the old 3 ms attacks made a ticking and the pops were clicks. A low rumble with
          // an airy hiss on every other shot and now and then a soft crackle, no pitched part at all.
          // About three bursts overlap (voice budget), the gate keeps the rate at 7 per second.
          if (this.gate(id, 0.14)) {
            this.flameN = (this.flameN || 0) + 1;
            this.noise(0.5, 0.045, { f: 1500, to: 800, q: 0.4, rate: 0.6 * pitch, attack: 0.08, hold: 0.22 });
            if (this.flameN % 2 === 0)
              this.noise(0.45, 0.014, {
                type: "bandpass",
                f: 2400 * pitch,
                to: 1800,
                q: 0.5,
                attack: 0.09,
                hold: 0.2,
              });
            if (Math.random() < 0.35)
              this.noise(0.06, 0.018, {
                type: "bandpass",
                f: 3200 + Math.random() * 1800,
                q: 1.2,
                attack: 0.012,
                at: Math.random() * 0.25,
              });
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
          // 2.9.1: while the flame is firing (it hits many enemies at once) the hit blips are rarer and
          // quieter; at 28 per second they added a clacking to the flame roar
          {
            const flaming = this.ctx.currentTime - (this.last.flame ?? -9) < 0.3;
            if (this.gate(id, flaming ? 0.12 : 0.035)) {
              this.tone(1300 * pitch, 0.03, "triangle", flaming ? 0.016 : 0.035);
            }
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
        case "bOverdrive": {
          // 3.3.0: the Overdrive alarm: a two-tone siren in the boss's timbre that climbs, a sub drop and its motif
          let b = BOSS_SOUND[arg] || BOSS_SOUND.warden,
            f = midiToFreq((BOSS_ROOT[arg] || 45) + 12);
          for (let i = 0; i < 4; i++)
            this.tone(f * (i % 2 ? 1.414 : 1) * (1 + i * 0.06), 0.2, b.wave, 0.07, {
              at: i * 0.2,
              lp: b.lp * 2.5,
              attack: 0.01,
              detune: b.det,
            });
          this.tone(110, 0.9, "sine", 0.4, { to: 30, at: 0.8 });
          this.noise(0.8, 0.12, { f: 300, to: 3500, attack: 0.75, q: 1.2 });
          this.noise(0.5, 0.12, { f: 1200, to: 150, at: 0.8 });
          this.bossMotif(arg, 0.05, 0.85);
          break;
        }
        case "mutator": {
          // 3.3.0: the rift mutates: a swell that rises into a low hit, a dissonant chord (a tritone over the root)
          // and a metallic ring
          this.noise(0.9, 0.08, { type: "bandpass", f: 400, to: 4000, q: 2, attack: 0.85 });
          this.tone(60, 0.9, "sawtooth", 0.05, { to: 240, lp: 900, attack: 0.85 });
          this.tone(90, 0.8, "sine", 0.4, { to: 32, at: 0.85 });
          this.noise(0.4, 0.14, { f: 900, to: 120, at: 0.85 });
          for (const [semi, det] of [
            [0, -8],
            [6, 0],
            [12, 8],
          ])
            this.tone(midiToFreq(38 + semi), 1, "sawtooth", 0.04, { at: 0.85, lp: 1200, detune: det, attack: 0.01 });
          this.tone(1870, 1.1, "sine", 0.025, { at: 0.86, attack: 0.002 });
          this.tone(1870 * 2.76, 0.6, "sine", 0.012, { at: 0.86, attack: 0.002 });
          break;
        }
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
          this.trapSound(id, arg);
          break;
      }
    }
    /* 3.0.0: a held tone (flat level between a soft attack and a short release, so that it ends cleanly), with
     an optional vibrato (wob: {rate, depth Hz}) and tremolo (trem: {rate, depth 0..0.9}). Used by the trap
     beams, which sound for as long as the beam lives. */
    hum(freq, dur, wave, vol, opts = {}) {
      let ctx = this.ctx,
        start = ctx.currentTime + (opts.at || 0),
        voice = this.claim(this.curPri, start, start + dur + 0.02);
      if (!voice) return;
      let osc = ctx.createOscillator(),
        amp = ctx.createGain(),
        attack = Math.min(opts.attack || 0.08, dur * 0.4),
        release = Math.min(opts.release || 0.15, dur * 0.4);
      voice.node = osc;
      voice.amp = amp;
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, start);
      if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), start + dur);
      amp.gain.setValueAtTime(1e-4, start);
      amp.gain.exponentialRampToValueAtTime(vol, start + attack);
      amp.gain.setValueAtTime(vol, start + dur - release);
      amp.gain.exponentialRampToValueAtTime(1e-4, start + dur);
      let out = osc;
      if (opts.lp) {
        let filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = opts.lp;
        out.connect(filter);
        out = filter;
      }
      out.connect(amp);
      amp.connect(this.sfx);
      osc.start(start);
      osc.stop(start + dur + 0.02);
      for (let [mod, param, depth] of [
        [opts.wob, osc.frequency, opts.wob && opts.wob.depth],
        [opts.trem, amp.gain, opts.trem && vol * opts.trem.depth],
      ]) {
        if (!mod) continue;
        let lfo = ctx.createOscillator(),
          lfoGain = ctx.createGain();
        lfo.frequency.value = mod.rate;
        lfoGain.gain.value = depth;
        lfo.connect(lfoGain);
        lfoGain.connect(param);
        lfo.start(start);
        lfo.stop(start + dur + 0.02);
      }
    }
    /* 3.0.0: the sounds of the grenade gadget and of the traps (see RL_TRAP_SOUND for the event mapping).
     Every biome has its own timbre: the Yard plate zaps, the Works crusher slams metal, the Vault ice
     cracks, the Marsh geyser gurgles, the Void sigil implodes. The warnings rise (charge) and end where
     the strike begins; strikes are loud but never reach full scale; the beams hum until they end. */
    trapSound(id, arg) {
      let r = Math.random,
        pitch = 1 + (r() - 0.5) * 0.06;
      // the time of a warning (arg: seconds, or {delay, dur} for a beam), kept within what the tests render
      let d = Math.max(0.3, Math.min(1.6, (arg && arg.delay) || arg || 1));
      switch (id) {
        // ---- grenade ----
        case "grenadeThrow":
          // pin clink (two metal ticks), the whoosh of the throw and a soft thump of the hand
          if (this.gate(id, 0.1)) {
            this.tone(3300, 0.05, "triangle", 0.05, { to: 3000 });
            this.tone(4700, 0.04, "sine", 0.035, { at: 0.035 });
            this.noise(0.03, 0.05, { type: "bandpass", f: 4200, q: 6, at: 0.01 });
            this.noise(0.3, 0.12, { type: "bandpass", f: 500, to: 2600, q: 1.1, attack: 0.1, at: 0.07 });
            this.tone(140, 0.12, "sine", 0.16, { to: 70, at: 0.07 });
          }
          break;
        case "grenadeBlast":
          // a punchy frag boom: a hard crack, a short mid body, a tight sub and a patter of debris
          if (this.gate(id, 0.05)) {
            this.noise(0.04, 0.22, { type: "highpass", f: 3500, attack: 0.001 });
            this.noise(0.38, 0.3, { f: 2400, to: 220, attack: 0.001 });
            this.tone(95 * pitch, 0.34, "sine", 0.38, { to: 34 });
            this.tone(260, 0.1, "square", 0.05, { to: 90, lp: 1500 });
            [0.1, 0.17, 0.22, 0.31, 0.38, 0.47].forEach((at, i) =>
              this.noise(0.035, 0.05 - i * 0.004, { type: "bandpass", f: 2200 + ((i * 1300) % 3400), q: 5, at }),
            );
            this.tone(1500, 0.18, "sine", 0.025, { to: 700, at: 0.04 });
          }
          break;
        case "gadgetReady":
          if (this.gate(id, 0.2)) {
            this.tone(1760, 0.07, "sine", 0.05);
            this.tone(2640, 0.09, "sine", 0.03, { at: 0.05 });
          }
          break;
        case "gadgetNo":
          // the grenade is not ready: a dull double buzz
          if (this.gate(id, 0.2)) {
            this.tone(96, 0.1, "square", 0.07, { lp: 480 });
            this.tone(88, 0.12, "square", 0.07, { lp: 420, at: 0.12 });
          }
          break;
        case "resist":
          // a hit the burst cap swallows: a quiet, dull metallic tink
          if (this.gate(id, 0.08)) {
            this.tone(1250 * pitch, 0.07, "triangle", 0.028, { lp: 3e3 });
            this.noise(0.025, 0.03, { type: "bandpass", f: 2300, q: 8 });
          }
          break;
        // ---- floor warnings: a rising charge in the biome's timbre ----
        case "tcPlate":
          if (this.gate(id, 0.12)) {
            this.tone(260, d + 0.05, "square", 0.035, { to: 1500, lp: 3500, attack: d * 0.92 });
            this.tone(130, d + 0.05, "sawtooth", 0.03, { to: 700, lp: 900, attack: d * 0.92 });
            for (let i = 0; i < 7; i++)
              this.tone(3e3 + r() * 3e3, 0.02, "square", 0.014, { at: d * (0.3 + (0.65 * i) / 7), lp: 7e3 });
          }
          break;
        case "tcCrusher":
          if (this.gate(id, 0.12)) {
            this.tone(55, d + 0.05, "sawtooth", 0.09, { to: 130, lp: 420, attack: d * 0.9 });
            this.noise(d, 0.05, { type: "bandpass", f: 300, to: 1100, q: 2, attack: d * 0.85 });
            this.tone(180, 0.06, "square", 0.03, { lp: 900, at: 0.12 });
            this.tone(210, 0.06, "square", 0.03, { lp: 900, at: d * 0.55 });
          }
          break;
        case "tcIce":
          if (this.gate(id, 0.12)) {
            this.tone(1500, d + 0.05, "sine", 0.035, { to: 3200, attack: d * 0.92 });
            this.tone(1512, d + 0.05, "sine", 0.03, { to: 3270, attack: d * 0.92 });
            this.noise(d, 0.02, { type: "highpass", f: 6e3, attack: d * 0.8 });
            for (let i = 0; i < 5; i++)
              this.tone(4e3 + r() * 2500, 0.03, "sine", 0.02, { at: d * (0.25 + (0.7 * i) / 5) });
          }
          break;
        case "tcGeyser":
          if (this.gate(id, 0.12)) {
            this.noise(d, 0.06, { f: 250, to: 900, attack: d * 0.9 });
            for (let i = 0; i < 7; i++) {
              let f = 180 + r() * 220;
              this.tone(f, 0.07, "sine", 0.05, { to: f * 1.9, lp: 900, at: d * Math.pow(i / 7, 0.8) });
            }
          }
          break;
        case "tcRift":
          // a reversed swell: the sound is drawn inwards
          if (this.gate(id, 0.12)) {
            this.noise(d, 0.06, { type: "bandpass", f: 200, to: 3e3, q: 1.5, attack: d * 0.95 });
            this.tone(1e3, d + 0.05, "sine", 0.035, { to: 150, attack: d * 0.9 });
            this.tone(1020, d + 0.05, "sine", 0.03, { to: 155, attack: d * 0.9 });
          }
          break;
        // ---- beams: a charging hum while it warns, then a sustained sound until it ends ----
        case "tbLaser":
        case "tbFlame":
        case "tbRift": {
          if (!this.gate(id, 0.2)) break;
          let on = Math.min(2.4, (arg && arg.dur) || 2);
          if (id === "tbLaser") {
            this.tone(400, d + 0.05, "sine", 0.04, { to: 1800, attack: d * 0.92 });
            this.tone(800, d + 0.05, "square", 0.012, { to: 3600, lp: 5e3, attack: d * 0.92 });
            this.hum(170, on, "sawtooth", 0.035, { at: d, lp: 650, attack: 0.05 });
            this.hum(2400, on, "sine", 0.014, { at: d, trem: { rate: 38, depth: 0.7 }, attack: 0.05 });
            this.noise(on, 0.02, { type: "highpass", f: 6500, hold: on - 0.3, attack: 0.05, at: d });
          } else if (id === "tbFlame") {
            this.noise(d, 0.07, { f: 300, to: 1300, attack: d * 0.9 });
            this.tone(70, d + 0.05, "sawtooth", 0.05, { to: 140, lp: 400, attack: d * 0.9 });
            this.noise(on, 0.12, { f: 1000, q: 0.6, hold: on - 0.35, attack: 0.08, at: d });
            this.hum(62, on, "sawtooth", 0.05, { at: d, lp: 300, trem: { rate: 9, depth: 0.5 } });
          } else {
            this.tone(220, d + 0.05, "sine", 0.04, { to: 440, attack: d * 0.92 });
            this.tone(224, d + 0.05, "sine", 0.035, { to: 450, attack: d * 0.92 });
            this.noise(d, 0.03, { type: "highpass", f: 4e3, attack: d * 0.9 });
            this.hum(150, on, "sine", 0.05, { at: d, wob: { rate: 5, depth: 14 } });
            this.hum(156, on, "sine", 0.04, { at: d, wob: { rate: 6.5, depth: 18 } });
            this.hum(620, on, "triangle", 0.018, { at: d, wob: { rate: 7, depth: 90 }, lp: 2e3 });
            this.noise(on, 0.02, { type: "highpass", f: 5e3, hold: on - 0.3, attack: 0.1, at: d });
          }
          break;
        }
        // ---- mines: arming and the fuse (beeps that speed up) ----
        case "tArm": {
          // the mine is live: two short beeps, the pitch and timbre of its skin
          if (!this.gate(id, 0.15)) break;
          let s = RL_MINE_BEEP[arg] || RL_MINE_BEEP.mine;
          this.tone(s.f, 0.06, s.wave, 0.03, { lp: s.lp });
          this.tone(s.f * 1.5, 0.08, s.wave, 0.03, { at: 0.09, lp: s.lp });
          break;
        }
        case "tmMine":
        case "tmFrost":
        case "tmSpore":
        case "tmRift": {
          // fuse: five beeps whose gaps shrink and whose pitch rises over the fuse time
          if (!this.gate(id, 0.15)) break;
          let s = RL_MINE_BEEP[{ tmMine: "mine", tmFrost: "frost", tmSpore: "spore", tmRift: "riftmine" }[id]],
            k = d / 0.45;
          [0, 0.14, 0.25, 0.33, 0.39].forEach((at, i) => {
            let f = s.f * (1 + i * 0.12);
            this.tone(f, 0.05 * Math.max(0.6, k), s.wave, 0.04, {
              at: at * k,
              lp: s.lp,
              to: s.to ? f * s.to : undefined,
            });
          });
          break;
        }
        // ---- strikes ----
        case "tsPlate":
          // electric zap and a dull thud
          if (this.gate(id, 0.05)) {
            this.noise(0.12, 0.2, { type: "highpass", f: 4e3, attack: 0.001 });
            this.tone(2800, 0.16, "square", 0.07, { to: 220, lp: 5e3 });
            this.tone(88, 0.3, "sine", 0.4, { to: 38 });
            this.tone(120, 0.22, "sawtooth", 0.07, { lp: 800, at: 0.02 });
            for (let i = 0; i < 4; i++)
              this.tone(2e3 + r() * 4e3, 0.02, "square", 0.025, { at: 0.04 + i * 0.045, lp: 7e3 });
          }
          break;
        case "tsCrusher":
          // piston slam: a heavy low hit, a short rubble roar and a ringing metal tail
          if (this.gate(id, 0.05)) {
            this.tone(62, 0.55, "sine", 0.5, { to: 26 });
            this.noise(0.35, 0.28, { f: 900, to: 100, attack: 0.002 });
            this.tone(170, 0.12, "square", 0.08, { to: 80, lp: 700 });
            [520, 783, 1247].forEach((f, i) => this.tone(f, 0.75 - i * 0.12, "sine", 0.045 - i * 0.01, { at: 0.02 }));
          }
          break;
        case "tsIce":
          // glass crack, then the shatter: a cloud of tiny high ticks
          if (this.gate(id, 0.05)) {
            this.noise(0.05, 0.14, { type: "highpass", f: 5e3, attack: 0.001 });
            this.tone(3200, 0.12, "sine", 0.08, { to: 1800 });
            this.tone(110, 0.2, "sine", 0.2, { to: 55 });
            for (let i = 0; i < 12; i++)
              this.tone(2600 + r() * 4800, 0.045, "sine", 0.03 * (1 - i / 16), { at: 0.06 + i * 0.035 + r() * 0.02 });
            this.noise(0.45, 0.03, { type: "highpass", f: 7e3, at: 0.08 });
          }
          break;
        case "tsGeyser":
          // a burst of water and mud, then wet gurgles
          if (this.gate(id, 0.05)) {
            this.noise(0.4, 0.2, { type: "bandpass", f: 500, to: 2200, q: 0.9, attack: 0.02 });
            this.tone(140, 0.28, "sine", 0.3, { to: 70 });
            for (let i = 0; i < 5; i++) {
              let f = 160 + r() * 140;
              this.tone(f, 0.09, "sine", 0.06, { to: f * 2.2, lp: 1000, at: 0.14 + i * 0.09 });
              this.noise(0.07, 0.03, { type: "bandpass", f: 900, q: 3, at: 0.14 + i * 0.09 });
            }
          }
          break;
        case "tsRift":
          // implosion: a reversed swell collapses into a deep thud
          if (this.gate(id, 0.05)) {
            this.noise(0.3, 0.12, { f: 200, to: 4e3, attack: 0.28 });
            this.tone(900, 0.3, "sine", 0.05, { to: 120, attack: 0.27 });
            this.tone(105, 0.55, "sine", 0.45, { to: 28, at: 0.3 });
            this.noise(0.25, 0.2, { f: 1500, to: 120, attack: 0.002, at: 0.3 });
            this.tone(300, 0.3, "sawtooth", 0.04, { to: 50, lp: 800, at: 0.3, detune: 30 });
          }
          break;
        case "tsMine":
          // a sharp mine blast: a crack, a hard body and a low rumble (no debris patter: that is the grenade)
          if (this.gate(id, 0.05)) {
            this.noise(0.04, 0.34, { type: "highpass", f: 2.4e3, attack: 0.001 });
            this.tone(1100, 0.16, "square", 0.08, { to: 300, lp: 3.5e3 });
            this.noise(0.55, 0.3, { f: 1100, to: 90, attack: 0.001 });
            this.tone(75, 0.5, "sine", 0.42, { to: 30 });
            this.tone(200, 0.2, "sawtooth", 0.07, { to: 60, lp: 900 });
          }
          break;
        case "tsFrost":
          // a cold blast: a low boom that cracks into a bright shatter and a fading whoosh of frost
          if (this.gate(id, 0.05)) {
            this.tone(100, 0.35, "sine", 0.34, { to: 40 });
            this.noise(0.04, 0.16, { type: "highpass", f: 6e3, attack: 0.001 });
            this.noise(0.6, 0.1, { type: "bandpass", f: 5e3, to: 1500, q: 1, attack: 0.03 });
            [0.05, 0.1, 0.16, 0.22, 0.3].forEach((at, i) =>
              this.tone(3e3 + i * 700, 0.1, "triangle", 0.03, { at, to: 2000 + i * 300 }),
            );
          }
          break;
        case "tsSpore":
          // a wet pop and a hissing spray of spores
          if (this.gate(id, 0.05)) {
            this.tone(320, 0.14, "sine", 0.3, { to: 70 });
            this.noise(0.12, 0.2, { type: "bandpass", f: 700, to: 300, q: 1.5, attack: 0.002 });
            this.noise(0.7, 0.09, { type: "bandpass", f: 3200, to: 1800, q: 0.8, attack: 0.05 });
            this.tone(200, 0.1, "sine", 0.07, { to: 450, at: 0.2 });
          }
          break;
        case "tsRiftMine":
          // a short implosion: a quick reversed swell, a deep thump and a detuned fall
          if (this.gate(id, 0.05)) {
            this.noise(0.12, 0.1, { f: 400, to: 3500, attack: 0.11 });
            this.tone(150, 0.4, "sine", 0.4, { to: 26, at: 0.12 });
            this.tone(500, 0.35, "sawtooth", 0.06, { to: 55, lp: 1200, at: 0.12 });
            this.tone(510, 0.35, "sawtooth", 0.05, { to: 58, lp: 1200, at: 0.12, detune: 40 });
          }
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
    /* listener: the player (3.2.0): a sound left or right of it is panned that way (16 m to the side: 80 %) */
    consume(events, listener) {
      if (!this.live()) return;
      let kills = 0;
      for (let ev of events) {
        this.curPan = listener && ev.x != null ? Math.max(-0.8, Math.min(0.8, (ev.x - listener.x) / 20)) : 0;
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
            // 3.0.0: the grenade and the traps have blasts of their own (grenadeBlast, trapFire)
            if (ev.kind === "trap") break;
            this.play(
              ev.kind === "grenade"
                ? "grenadeBlast"
                : ev.kind === "payload" || ev.kind === "pop"
                  ? "smallboom"
                  : "boom",
            );
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
          case "grenade":
            this.play("grenadeThrow");
            break;
          case "gadgetReady":
            this.play("gadgetReady");
            break;
          case "gadgetDeny":
            this.play("gadgetNo");
            break;
          case "ping":
            // the old ping (shield phase) stays silent; a hit the burst cap swallows tinks
            if (ev.resist) this.play("resist");
            break;
          case "trapWarn": {
            let voice = RL_TRAP_SOUND[ev.skin];
            if (voice) this.play(voice.warn, ev.fam === "beam" ? { delay: ev.delay, dur: ev.dur } : ev.delay);
            break;
          }
          case "trapFire": {
            let voice = RL_TRAP_SOUND[ev.skin];
            if (voice && voice.fire) this.play(voice.fire);
            break;
          }
          case "trapArm":
            this.play("tArm", ev.skin);
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
            if (RL_OVERDRIVE.has(ev.atk)) this.play("bOverdrive", ev.id);
            if (voice) this.play(voice, ev.id);
            break;
          }
          case "enrage":
            this.play("enrage", ev.id);
            this.bossPush(2);
            break;
          case "phase":
            this.play("phase");
            this.bossPush(1);
            break;
          case "bossDown":
            this.bossEnd();
            this.play("bossDown", ev.id);
            break;
        }
      }
      this.curPan = 0;
    }
    /* 3.1.0: mode "fight" is the calm theme of the biome, "boss" its boss track. The boss track starts on the
     spot (main.js calls this when the boss appears, at the camera pan), not with the wave. */
    /* resume: back from the pause menu (the track goes on where it was instead of starting again) */
    setMusic(mode, biome, resume) {
      if (mode === "boss" && !resume) this.bossOver = false;
      this.resumeWanted = !!resume;
      this.mode = mode;
      if (biome) {
        this.biome = biome;
        // 3.2.0: the room of the sounds is the room of the biome
        if (this.sfxVerbOut && SFX_ROOM_BIOME[biome])
          this.sfxVerbOut.gain.setTargetAtTime(SFX_ROOM_BIOME[biome], this.ctx.currentTime, 0.3);
      }
      // a preview of the settings screen ends when the game takes over the music
      if (mode !== "menu") this.pv = null;
      this.syncTrack();
      this.resumeWanted = false;
    }
    /* The boss is dead: the boss track resolves (a last hit) and the calm theme fades back in. */
    bossEnd() {
      this.bossOver = true;
      this.syncTrack();
    }
    /* the boss changes its phase or enrages: the track jumps back to its drop with more layers */
    bossPush(level) {
      if (this.playKind !== "boss" || level <= this.heat) return;
      this.heat = level;
      this.jump = true;
    }
    /* Settings screen: loop the calm theme (mode "fight") or the boss track (mode "boss") of a biome until
     stopPreview(). The first tap unlocks the audio on phones. */
    preview(mode, biome) {
      if (!this.ok) return false;
      this.unlock();
      this.pv = { kind: mode === "boss" ? "boss" : "fight", biome: musicChords[biome] ? biome : "yard" };
      this.syncTrack();
      return true;
    }
    stopPreview() {
      if (!this.pv) return;
      this.pv = null;
      this.syncTrack();
    }
    previewing() {
      return this.pv ? { mode: this.pv.kind, biome: this.pv.biome } : null;
    }
    /* what should play now: "off", "menu", "fight" (calm) or "boss" */
    wantKind() {
      if (this.pv) return this.pv.kind;
      if (this.mode === "boss") return this.bossOver ? "fight" : "boss";
      return this.mode;
    }
    wantBiome() {
      return this.pv ? this.pv.biome : musicChords[this.biome] ? this.biome : "yard";
    }
    /* Called when the wanted track changes: restarts the step counter on the spot, cuts the notes that were
     already scheduled for the old track and plays the transition: a crash and an impact when the boss track
     starts, a last hit when it resolves (the calm theme then fades back in over about 3 s). */
    syncTrack() {
      let kind = this.wantKind(),
        biome = this.wantBiome(),
        pv = !!this.pv;
      if (kind === this.playKind && biome === this.playBiome && pv === this.playPv) return;
      let from = this.playKind,
        fromPv = this.playPv,
        track = kind === "fight" || kind === "boss" ? musicTrack(kind, biome) : null;
      // 3.2.0: the pause menu keeps the place of a fight or boss track; resuming the run goes on from there
      if ((from === "fight" || from === "boss") && kind === "menu" && !fromPv && !pv)
        this.held = { kind: from, biome: this.playBiome, step: this.step, cycle: this.cycle, heat: this.heat };
      let held = this.held,
        resumed = !!held && this.resumeWanted && !pv && held.kind === kind && held.biome === biome;
      if (kind !== "menu") this.held = null;
      this.playKind = kind;
      this.playBiome = biome;
      this.playPv = pv;
      this.step = resumed ? held.step : 0;
      this.cycle = resumed ? held.cycle : 0;
      this.heat = resumed ? held.heat : 0;
      this.jump = false;
      let ctx = this.ctx;
      if (!ctx || !this.fade) return;
      try {
        let now = ctx.currentTime,
          gain = track ? track.gain : 1;
        this.cutScheduled(now);
        this.nextT = now + 0.03;
        this.fade.gain.cancelScheduledValues(now);
        this.mixFor(kind);
        this.stopMusicBed();
        if (track) this.startMusicBed(kind, biome);
        if (resumed) {
          this.fade.gain.setValueAtTime(0.0001, now);
          this.fade.gain.linearRampToValueAtTime(gain, now + 0.6);
        } else if (from === "boss" && kind === "fight" && !pv && !fromPv) {
          // resolve: the boss track ends on a last hit, then silence, then the calm theme fades in
          this.fade.gain.setValueAtTime(1.1, now);
          this.fade.gain.linearRampToValueAtTime(0.0001, now + 0.9);
          this.fade.gain.linearRampToValueAtTime(gain, now + 4.1);
          this.nextT = now + 0.9;
          if (this.live() && this.musVol > 0) musicResolve(this, biome, 0);
        } else {
          this.fade.gain.setValueAtTime(gain, now);
          if (kind === "boss" && (from === "fight" || pv) && this.live() && this.musVol > 0)
            musicImpact(this, biome, 0);
        }
      } catch (err) {
        this.fail(err);
      }
    }
    /* the notes that were scheduled ahead (the scheduler looks 0.14 s ahead) for a track that has just ended */
    cutScheduled(now) {
      if (this.pump) {
        this.pump.gain.cancelScheduledValues(now);
        this.pump.gain.setValueAtTime(1, now);
      }
      let list = this.musicVoiceList;
      for (let i = list.length - 1; i >= 0; i--) {
        let voice = list[i];
        if (voice.start > now + 0.005 && voice.node) {
          try {
            voice.amp.gain.cancelScheduledValues(now);
            voice.amp.gain.setValueAtTime(0, now);
            voice.node.stop(now);
          } catch {}
          list[i] = list[list.length - 1];
          list.pop();
        }
      }
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
    /* 3.2.0: the atmosphere of a music track: a loop that plays under the notes for as long as the track plays (wind in
       the Cryo Vault, insects and murk in the Toxin Marsh, furnace and machines in the Ember Works, rain and city hum in
       the Neon Yard, beating drones in the Void Core; see MUSIC_BEDS). It goes through the music chain (volume, fade,
       glue) and is not a voice of the budget. */
    startMusicBed(kind, biome, fadeIn = 1.5) {
      let ctx = this.ctx,
        recipe = MUSIC_BEDS[biome];
      if (!ctx || !recipe || (kind !== "fight" && kind !== "boss")) return;
      let now = ctx.currentTime,
        out = ctx.createGain(),
        nodes = [],
        osc = (type, freq) => {
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
        filt = (type, freq, q, from) => {
          let node = ctx.createBiquadFilter();
          node.type = type;
          node.frequency.value = freq;
          node.Q.value = q;
          from.connect(node);
          return node;
        },
        lfo = (freq, depth, param, type = "sine") => {
          let gain = ctx.createGain();
          gain.gain.value = depth;
          osc(type, freq).connect(gain);
          gain.connect(param);
        },
        level = (from, vol) => {
          let gain = ctx.createGain();
          gain.gain.value = vol;
          from.connect(gain);
          gain.connect(out);
          return gain;
        },
        root = midiToFreq((musicChords[biome] || musicChords.yard)[0][0]),
        bpm = musicTrack(kind, biome).bpm;
      out.gain.setValueAtTime(1e-4, now);
      out.gain.linearRampToValueAtTime(
        BED_LEVEL[kind] * recipe.gain * (kind === "boss" ? recipe.boss : 1),
        now + fadeIn,
      );
      out.connect(kind === "boss" ? this.pump : this.mus);
      recipe.build({ osc, loop, filt, lfo, level, root, bpm, boss: kind === "boss" });
      this.mbed = { out, nodes };
    }
    stopMusicBed(fade = 0.8) {
      let bed = this.mbed;
      if (!bed) return;
      this.mbed = null;
      try {
        let now = this.ctx.currentTime;
        bed.out.gain.cancelScheduledValues(now);
        bed.out.gain.setTargetAtTime(0, now, fade / 4);
        for (let node of bed.nodes) node.stop(now + fade + 0.1);
      } catch {}
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
      this.syncTrack();
      if (this.nextT < ctx.currentTime - 0.5) {
        this.nextT = ctx.currentTime + 0.05;
      }
      for (; this.nextT < ctx.currentTime + 0.14; ) {
        let info = trackInfo(this.playKind, this.playBiome);
        if (this.playKind !== "off" && this.musVol > 0) {
          this.note(this.step, this.nextT);
        }
        this.nextT += 60 / info.bpm / 4;
        this.step = (this.step + 1) % info.steps;
        if (this.jump && this.step % 16 === 0) {
          // phase change or enrage: back to the drop, with a crash and an impact
          this.jump = false;
          this.step = 0;
          if (this.musVol > 0) musicImpact(this, this.playBiome, this.nextT - ctx.currentTime);
        }
        if (this.step === 0) {
          this.cycle++;
        }
        this.intensity += (this.want - this.intensity) * 0.02;
      }
    }
    /* One step (a sixteenth) of the music at `time`: the track of the biome plays it. Menu music is the old
     slow pad theme. Everything it schedules goes through the music buses and its own voice list. */
    note(step, time) {
      let kind = this.playKind,
        biome = this.playBiome,
        chords = musicChords[biome] || musicChords.yard,
        at = time - this.ctx.currentTime;
      if (kind === "fight" || kind === "boss") {
        let track = musicTrack(kind, biome),
          bar = Math.floor(step / 16),
          [root, quality] = chords[bar % 4],
          level = kind === "boss" ? 1 : this.pv ? previewLevel(bar) : this.intensity,
          s = step,
          c = {
            s,
            bar,
            b: step % 16,
            at: track.swing && step % 2 === 1 ? at + track.swing * (60 / track.bpm / 4) : at,
            L: level,
            cycle: this.cycle,
            heat: this.heat,
            root,
            q: quality,
            ch: bar % 4,
            sec: kind === "boss" ? bossSection(bar) : bar >> 2,
            chord: [root, root + (quality === "m" ? 3 : 4), root + 7, root + 12],
            salt: biome.charCodeAt(0) * 7 + biome.charCodeAt(1),
            barSec: 240 / track.bpm,
            half: 30 / track.bpm / 4,
          };
        track.play(this, c);
        if (kind === "boss" && this.heat > 0) bossHeatLayer(this, c);
      } else if (kind === "menu") {
        let [root, quality] = chords[Math.floor(step / 16)],
          chord = [root, root + (quality === "m" ? 3 : 4), root + 7, root + 12],
          beat = step % 16,
          dest = this.mus;
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
    static catalog() {
      return rlSoundCatalog();
    }
    static trackInfo(kind, biome) {
      return trackInfo(kind, biome);
    }
    /* Test hook: schedules `loops` loops of a track (nothing is rendered) and returns the counters of the voice
       budget (musicPeak: most voices alive at once; musicSkipped and musicShed: notes the budget refused) and the
       log of every voice, so that two runs (for example with a flood of sounds) can be compared note by note.
       spec: music (fight|boss), biome, loops, intensity, heat, flood (sounds per step), pv (as a preview) */
    static musicBudget(spec) {
      let Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext,
        ctx = new Offline(1, 44100, 44100),
        engine = new SoundEngine(),
        info = trackInfo(spec.music, spec.biome),
        len = 60 / info.bpm / 4;
      engine.attach(ctx, { room: false });
      engine.sfxVol = 1;
      engine.mode = spec.music;
      engine.biome = spec.biome;
      engine.playKind = spec.music;
      engine.playBiome = spec.biome;
      engine.intensity = spec.intensity != null ? spec.intensity : 1;
      engine.heat = spec.heat || 0;
      engine.mixFor(spec.music);
      engine.musicLog = [];
      if (spec.pv) engine.pv = { kind: spec.music, biome: spec.biome };
      for (let n = 0; n < info.steps * (spec.loops || 1); n++) {
        engine.simT = n * len;
        engine.cycle = Math.floor(n / info.steps);
        engine.note(n % info.steps, engine.simT);
        for (let k = 0; k < (spec.flood || 0); k++) {
          engine.last = Object.create(null);
          let flood = RL_FLOOD[(n * 7 + k) % RL_FLOOD.length];
          engine.play(flood[0], flood[1]);
        }
      }
      engine.simT = null;
      return {
        steps: info.steps * (spec.loops || 1),
        seconds: info.steps * (spec.loops || 1) * len,
        scheduled: engine.musicScheduled,
        skipped: engine.musicSkipped,
        shed: engine.musicShed,
        peak: engine.musicPeak,
        dropped: engine.dropped,
        failed: !!engine.failed,
        log: engine.musicLog,
      };
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
      if (spec.burst)
        for (let i = 1; i < spec.burst.n; i++)
          ctx.suspend(0.25 + i * spec.burst.interval).then(() => {
            engine.play(spec.burst.id, spec.burst.arg);
            ctx.resume();
          });
      ctx.suspend(0.25).then(() => {
        base = ctx.currentTime;
        if (spec.bed) {
          engine.startBed(spec.bed);
          engine.stopBed(spec.bed, spec.stopAt || 1.2);
        } else if (spec.music) {
          // 3.1.0: `seconds` of a calm theme or boss track from bar `fromBar`, at intensity `intensity` (calm) and
          // heat `heat` (boss); musicLog (spec.log) records every music voice, `impact` plays the start of a boss track
          engine.mode = spec.music;
          engine.biome = spec.biome;
          engine.playKind = spec.music;
          engine.playBiome = spec.biome;
          engine.intensity = spec.intensity != null ? spec.intensity : 0.9;
          engine.heat = spec.heat || 0;
          if (spec.log) engine.musicLog = [];
          if (spec.preview) engine.pv = { kind: spec.music, biome: spec.biome };
          let info = trackInfo(spec.music, spec.biome),
            len = 60 / info.bpm / 4,
            first = (spec.fromBar || 0) * 16;
          engine.fade.gain.value = musicTrack(spec.music, spec.biome).gain;
          engine.mixFor(spec.music);
          if (!spec.noBed) engine.startMusicBed(spec.music, spec.biome, 0.05);
          if (spec.impact) musicImpact(engine, spec.biome, 0);
          for (let n = 0, t = 0; t < seconds - 0.25; n++, t += len) {
            engine.simT = base + t;
            engine.cycle = Math.floor((first + n) / info.steps);
            engine.note((first + n) % info.steps, base + t);
            // 2.9.0: a flood of sounds in every step; the music notes must all be scheduled anyway
            if (spec.flood)
              for (let k = 0; k < 30; k++) {
                engine.last = Object.create(null);
                let flood = RL_FLOOD[(n * 7 + k) % RL_FLOOD.length];
                engine.play(flood[0], flood[1]);
              }
          }
          engine.simT = null;
        } else if (spec.burst) {
          // 2.9.2: continuous fire of one sound: the first shot now, the others at times registered
          // before rendering starts (see below), so the rate gate and the voice limit behave as in the game
          engine.play(spec.burst.id, spec.burst.arg);
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
        musicShed: engine.musicShed,
        musicPeak: engine.musicPeak,
        musicLog: engine.musicLog,
        bpm: spec.music ? trackInfo(spec.music, spec.biome).bpm : 0,
        failed: !!engine.failed,
        samples: spec.wav ? Array.from(data.subarray(Math.round(base * 44100))) : null,
      };
    }
  };
/* ==========================================================================
 The music (3.1.0, reworked in 3.2.0). Every biome has a calm theme ("fight": 16 bars, four chords over four bars,
 four sections of four bars) and a boss track (22 bars: drop 8, variation 8, half-time breakdown 4, build 2); the boss
 track is the heavy sibling of the calm theme (same key and chords). A track is a tempo, a length and a play(engine, c)
 function that is called for every sixteenth step and schedules that step's notes (see SoundEngine.note for the fields
 of c). Under the notes a track has its atmosphere (MUSIC_BEDS: wind, insects, furnace, rain, drones), which is a loop
 and no voice of the budget.
 3.2.0: the calm themes are calmer and belong to their place (the Cryo Vault icy and windy, the Toxin Marsh damp and
 alive, the Ember Works a sleeping factory, the Neon Yard a rainy night drive, the Void Core dark and breathing); the
 boss tracks are hard and dense: double-tracked guitars through two real amp chains (left and right), metal kicks
 with a beater click, blast beats, breakdowns, a kick that pumps the pads and guitars, a room reverb, and a lot of
 noises of their biome. Rules that keep the music cheap and the same everywhere:
 - everything a step schedules is chosen by the step, the chord and the intensity, or by the deterministic hash
   rnd() (never Math.random), so the music is the same with and without a flood of sounds
 - the voices of the music are limited to MAX_MUSIC_VOICES; texture sounds are "opt" voices that the engine sheds
   first (never the kick, bass and chords); the tests check that nothing is ever shed
 - buses: m (music, dry), p (the pump: pads, bass, guitars), d (the echo: far away), x (distortion: 808, reese,
   wobble, leads), l and r (the two guitar amps); any voice can send to the room with opts.rev and be panned with
   opts.pan
 ========================================================================== */
function rnd(a, b, c) {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
const R = (c, n) => rnd(c.cycle * 4096 + c.s, n, c.salt),
  /* a hashed pan position between -w and w */
  P = (c, n, w = 0.7) => (R(c, n) * 2 - 1) * w,
  patCache = Object.create(null),
  /* "x" a hit, "X" an accent, "o" a ghost note, "." a rest */
  pat = (str) =>
    patCache[str] ||
    (patCache[str] = Array.from(str, (ch) => (ch === "x" ? 1 : ch === "X" ? 1.5 : ch === "o" ? 0.5 : 0))),
  curveCache = Object.create(null);
/* cut-off curve of a wobble bass: exponential between lo and hi, `period` seconds per cycle */
function wobbleCurve(lo, hi, period, dur, phase) {
  let key = `w${lo}:${hi}:${Math.round(period * 1e3)}:${Math.round(dur * 1e3)}:${phase}`;
  if (curveCache[key]) return curveCache[key];
  let n = Math.max(8, Math.ceil(dur * 120)),
    curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let t = (i / (n - 1)) * dur;
    curve[i] = lo * Math.pow(hi / lo, 0.5 + 0.5 * Math.sin((t / period) * 2 * Math.PI + phase));
  }
  return (curveCache[key] = curve);
}
/* level curve (0..1) of a tremolo (insect buzz, wobbling pad): `rate` Hz, `depth` 0..1, faded in and out */
function tremoloEnv(rate, depth, dur, fade) {
  let key = `t${rate}:${depth}:${Math.round(dur * 1e3)}:${fade}`;
  if (curveCache[key]) return curveCache[key];
  let n = Math.min(1600, Math.max(16, Math.ceil(dur * Math.max(100, rate * 10)))),
    env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let t = (i / (n - 1)) * dur,
      win = Math.min(1, t / fade, (dur - t) / fade);
    win = Math.sin((Math.max(0, win) * Math.PI) / 2) ** 2;
    env[i] = win * (1 - depth + depth * (0.5 + 0.5 * Math.sin(t * rate * 2 * Math.PI)));
  }
  return (curveCache[key] = env);
}
/* a swell that is faded in and out by `fade` seconds with a sin^2 window: voices that start every `span` seconds
   and last span + fade seconds cross-fade without a dip (pads and drones) */
const padEnv = (dur, fade) => tremoloEnv(0, 0, dur, fade),
  FLICKER = new Float32Array([0.9, 0.2, 1, 0.1, 0.8, 0.3, 1, 0.4, 0.2, 0]);
/* one scheduling kit per step: the buses (see above), each with t(one) for an oscillator and n(oise) */
function kit(e, c) {
  const base = c.at,
    bus = (dest) => ({
      t: (f, d, w, v, o) => e.tone(f, d, w, v, { ...o, dest, at: base + ((o && o.at) || 0) }),
      n: (d, v, o) => e.noise(d, v, { ...o, dest, at: base + ((o && o.at) || 0) }),
    });
  return {
    e,
    at: base,
    m: bus(e.mus),
    p: bus(e.pump),
    d: bus(e.delay),
    x: bus(e.distIn),
    l: bus(e.gtrL),
    r: bus(e.gtrR),
  };
}
/* the pump: the pads, bass and guitars dip to `depth` on an accented kick and come back with `rel` (seconds) */
const pumpDip = (k, at, depth, rel = 0.09) => {
    const gain = k.e.pump && k.e.pump.gain;
    if (!gain) return;
    const t = k.e.ctx.currentTime + k.at + at;
    gain.setTargetAtTime(depth, t, 0.004);
    gain.setTargetAtTime(1, t + 0.03, rel);
  },
  /* a kick: a sine that drops from f0 to f1; click adds the beater (a very short bright noise), pump dips the pump */
  kick = (k, v, o = {}) => {
    k.m.t(o.f0 || 150, o.dur || 0.14, "sine", v, { to: o.f1 || 42, at: o.at });
    if (o.click) k.m.n(0.007, v * o.click, { type: "highpass", f: 3000, attack: 0.0005, at: o.at });
    if (o.pump) pumpDip(k, o.at || 0, o.pump, o.rel);
  },
  /* the metal kick of the boss tracks: short, punchy, with a beater click */
  mkick = (k, v, o = {}) => kick(k, v, { f0: 210, f1: 52, dur: 0.075, click: 0.55, ...o }),
  clap = (k, v) => {
    k.m.n(0.018, v, { type: "bandpass", f: 1500, q: 1.2, attack: 0.001 });
    k.m.n(0.018, v * 0.9, { type: "bandpass", f: 1500, q: 1.2, attack: 0.001, at: 0.012 });
    k.m.n(0.14, v * 0.7, { type: "bandpass", f: 1400, q: 0.9, at: 0.024 });
  },
  hat = (k, v, dur = 0.025, f = 8500, pan = 0) => k.m.n(dur, v, { type: "highpass", f, pan }),
  /* the hats of the boss tracks are brighter (they have to cut through the guitars) */
  bhat = (k, v, dur, f, pan) => hat(k, v * 1.8, dur, f, pan),
  /* a snare: a band of noise and a falling body tone; crack adds the bright attack, rev the room */
  snare = (k, v, o = {}) => {
    k.m.n(o.dur || 0.15, v, { type: "bandpass", f: o.f || 1800, q: o.q || 0.8, at: o.at, rev: o.rev, pan: o.pan });
    k.m.t(o.bf || 190, 0.1, "triangle", v * 0.9, { to: (o.bf || 190) * 0.55, at: o.at });
    if (o.crack) k.m.n(0.03, v * o.crack, { type: "highpass", f: 4500, attack: 0.0008, at: o.at });
  },
  /* a rim click with a little room (the calm themes) */
  rim = (k, v, o = {}) => {
    k.m.n(0.014, v, { type: "bandpass", f: 2400, q: 5, rev: o.rev, pan: o.pan });
    k.m.t(1700, 0.025, "triangle", v * 0.4, { pan: o.pan });
  },
  /* a china cymbal: a trashy band of noise */
  china = (k, v, pan = 0) =>
    k.m.n(0.5, v * 1.6, { type: "bandpass", f: 5200, q: 1.2, attack: 0.001, pan, rev: 0.25, opt: true }),
  anvil = (k, f, v, pan = 0) => {
    k.m.n(0.09, v * 1.3, { type: "bandpass", f: 3200, q: 1.4, attack: 0.001, pan });
    k.m.t(f, 0.5, "sine", v, { attack: 0.001, pan, rev: 0.2 });
    k.m.t(f * 2.76, 0.3, "sine", v * 0.7, { attack: 0.001, pan });
  },
  /* a metal clang far away: inharmonic partials and a knock */
  clang = (bus, f, v, o = {}) => {
    bus.n(0.04, v * 1.2, { type: "bandpass", f: 3500, q: 2, attack: 0.001, ...o });
    bus.t(f, 1.1, "sine", v, { attack: 0.001, ...o });
    bus.t(f * 2.76, 0.55, "sine", v * 0.55, { attack: 0.001, ...o });
    bus.t(f * 5.4, 0.25, "sine", v * 0.3, { attack: 0.001, ...o });
  },
  /* a bell or a struck piece of ice: a sine and inharmonic partials that die away faster */
  bell = (bus, f, v, dur = 1.4, o = {}) => {
    bus.t(f, dur, "sine", v, { attack: 0.002, ...o });
    bus.t(f * 2.76, dur * 0.4, "sine", v * 0.35, { attack: 0.002, ...o });
    if (o.bright) bus.t(f * 5.4, dur * 0.18, "sine", v * 0.18, { attack: 0.002, ...o });
  },
  /* a vowel: two narrow bands of noise on its formants (whispers, choirs, vocal chops) */
  formant = (bus, f1, f2, dur, v, o = {}) => {
    bus.n(dur, v, { type: "bandpass", f: f1, q: 9, ...o });
    bus.n(dur, v * 0.85, { type: "bandpass", f: f2, q: 9, ...o });
  },
  /* a pad: one oscillator per note with a sin^2 swell (padEnv), alternately detuned */
  pad = (bus, notes, dur, v, o = {}) =>
    notes.forEach((n, i) =>
      bus.t(midiToFreq(n), dur, o.wave || "sawtooth", v, {
        lp: o.lp || 1200,
        env: padEnv(dur, o.fade || 0.3),
        detune: (i & 1 ? 1 : -1) * (o.det || 0),
        rev: o.rev,
      }),
    ),
  /* a double-tracked power chord: root and fifth (and the octave with oct) on the left and on the right amp, the right
     take detuned the other way (no delay between the takes: phones play mono, and a delay would comb-filter them). mute: palm-muted (dark and short), otherwise an open chord */
  gtr = (k, midi, dur, v, o = {}) => {
    const f = midiToFreq(midi),
      lp = o.lp || (o.mute ? 900 : 3200);
    for (const [side, det, dt] of [
      [k.l, -7, 0],
      [k.r, 7, 0],
    ]) {
      const at = (o.at || 0) + dt,
        opts = { lp, detune: det, at, hold: o.hold, attack: o.attack };
      side.t(f, dur, "sawtooth", v, opts);
      side.t(f * 1.4983, dur, "sawtooth", v * 0.8, opts);
      if (o.oct) side.t(f * 2, dur, "sawtooth", v * 0.55, { ...opts, detune: -det });
    }
  },
  crash = (k, v, dur = 1.2) => k.m.n(dur, v * 1.6, { type: "highpass", f: 5000, attack: 0.002, opt: true, rev: 0.2 }),
  /* the reversed cymbal: a noise that swells up to its end (before the next section) */
  reverseCymbal = (k, v) => k.m.n(0.65, v, { type: "highpass", f: 3000, to: 10000, attack: 0.55, opt: true }),
  /* a sub-bass note for chord root `root`: never below 29 (about 44 Hz), so that phones play it */
  subNote = (root) => {
    let base = root - 24;
    return midiToFreq(base < 29 ? base + 12 : base);
  };

/* ---------- the atmospheres ---------- */

/* level of the atmosphere of a calm theme and of a boss track (times the boss factor of the biome) */
/* gain: the level of the calm atmosphere, boss: the factor for the boss track (measured: a calm atmosphere alone at
   about -40 dB, the wind of the Cryo Vault about -33 dB; under a boss track about -36 to -40 dB) */
const BED_LEVEL = { fight: 1, boss: 1 },
  MUSIC_BEDS = {
    yard: {
      gain: 0.86,
      boss: 0.38,
      build({ osc, loop, filt, lfo, level }) {
        // rain: a bright hiss and a softer body; a far traffic swell; the hum of the transformers
        level(filt("highpass", 5000, 0.5, loop(1)), 0.03);
        level(filt("bandpass", 1600, 0.6, loop(0.8)), 0.018);
        const traffic = level(filt("lowpass", 420, 0.7, loop(0.5)), 0.05);
        lfo(0.05, 0.04, traffic.gain);
        level(filt("lowpass", 240, 0.8, osc("sawtooth", 50)), 0.03);
        level(osc("sine", 100), 0.008);
      },
    },
    works: {
      gain: 1.41,
      boss: 0.61,
      build({ loop, filt, lfo, level, bpm }) {
        // the furnace rumbles, the machines thump in quarter notes far away, steam hisses now and then
        level(filt("lowpass", 140, 0.9, loop(0.5)), 0.16);
        const machine = level(filt("bandpass", 900, 2.5, loop(0.7)), 0.03);
        lfo(bpm / 60, 0.03, machine.gain, "square");
        const steam = level(filt("highpass", 6000, 0.6, loop(1.4)), 0.006);
        lfo(0.07, 0.006, steam.gain);
      },
    },
    vault: {
      gain: 1.66,
      boss: 0.44,
      build({ loop, filt, lfo, level }) {
        // wind: a broad band that wanders and comes in gusts, a thin whistle above it, cold air
        const wind = filt("bandpass", 650, 0.8, loop(1));
        lfo(0.09, 380, wind.frequency);
        const gust = level(wind, 0.12);
        lfo(0.045, 0.08, gust.gain);
        const whistle = filt("bandpass", 1900, 9, loop(1.25));
        lfo(0.06, 700, whistle.frequency);
        const high = level(whistle, 0.05);
        lfo(0.033, 0.035, high.gain);
        level(filt("highpass", 7500, 0.5, loop(1.6)), 0.01);
      },
    },
    marsh: {
      gain: 1.5,
      boss: 0.5,
      build({ loop, filt, lfo, level }) {
        // insects: a band of noise that buzzes 31 times a second and swells slowly; murk that wobbles below
        const bugs = level(filt("bandpass", 4300, 5, loop(1.1)), 0.02);
        lfo(31, 0.012, bugs.gain);
        lfo(0.11, 0.008, bugs.gain);
        const murk = filt("lowpass", 260, 2, loop(0.4));
        lfo(0.4, 90, murk.frequency);
        level(murk, 0.1);
      },
    },
    void: {
      gain: 0.59,
      boss: 0.48,
      build({ osc, loop, filt, lfo, level, root }) {
        // two drones that beat against each other, a dark space wind, a high eerie tone that wavers
        level(osc("sine", root / 4), 0.045);
        level(osc("sine", root / 4 + 0.6), 0.045);
        level(filt("lowpass", 300, 0.7, osc("sawtooth", root / 2 + 0.3)), 0.012);
        const wind = filt("bandpass", 320, 1.1, loop(0.6));
        lfo(0.03, 160, wind.frequency);
        level(wind, 0.07);
        const eerie = osc("sine", root * 4);
        lfo(5, 6, eerie.frequency);
        const high = level(eerie, 0.004);
        lfo(0.07, 0.004, high.gain);
      },
    },
  };

/* ---------- calm themes ---------- */

/* Neon Yard, 96 BPM, A minor (Am F C G): a night drive in the rain. A soft kick on 1 and 3, a rim with room on 2 and
   4, a shaker that comes with the intensity, a round triangle bass whose pattern changes per section, a warm saw pad,
   a pluck arpeggio and a sine lead in the echo; the city: neon flicker, a far siren, data blips (rain and the hum of
   the transformers are the atmosphere) */
const YARD_CALM_BASS = ["x.....x...x.....", "x.....x.x...x...", "x..x....x.x.....", "x.....x...x..x.x"],
  YARD_BLIPS = [2093, 2637, 3136, 3951, 4699];
function yardCalm(e, c) {
  const { b, bar, L, chord, root, sec, cycle } = c,
    k = kit(e, c);
  if (b === 0 || b === 8) kick(k, 0.4, { f0: 125, f1: 45, dur: 0.2, pump: 0.7, rel: 0.12 });
  if (L > 0.55 && sec >= 2 && b === 11) kick(k, 0.26, { f0: 125, f1: 45, dur: 0.16 });
  if (b === 4 || b === 12) rim(k, 0.06 + 0.03 * L, { rev: 0.5 });
  if (L > 0.25) hat(k, b % 4 === 2 ? 0.03 : 0.012, b % 4 === 2 ? 0.05 : 0.02, 8500, b % 2 ? 0.35 : -0.35);
  if (pat(YARD_CALM_BASS[sec])[b]) {
    const f = midiToFreq(root - 24 + (sec === 3 && b === 10 ? 7 : 0));
    k.p.t(f, 0.34, "triangle", 0.12, { lp: 520 + 300 * L });
    k.p.t(f, 0.3, "sine", 0.08);
  }
  if (b === 0)
    pad(k.p, [chord[0] + 12, chord[1] + 12, chord[2] + 12], c.barSec + 0.4, 0.014, {
      lp: 900 + 500 * L,
      fade: 0.4,
      det: 7,
      rev: 0.45,
    });
  if (L > 0.3 && b % 2 === 0) {
    const p = arpPatterns[(cycle + sec) % 4];
    k.d.t(midiToFreq(chord[p[(b >> 1) % p.length]] + (sec === 3 ? 24 : 12)), 0.16, "triangle", 0.03, {
      lp: 1600 + 900 * L,
      rev: 0.25,
    });
  }
  if (L > 0.6 && (sec & 1) === 1) {
    const note = leadPatterns[bar & 3][b];
    if (note != null)
      k.d.t(midiToFreq(chord[note % 4] + 24 + (note >= 4 ? 12 : 0)), 0.32, "sine", 0.04, { attack: 0.02, rev: 0.4 });
  }
  if (b % 2 === 0 && R(c, 1) < 0.08)
    k.m.n(0.08, 0.025, { type: "bandpass", f: 2800 + R(c, 2) * 1200, q: 9, env: FLICKER, opt: true, pan: P(c, 3) });
  if (bar % 8 === 5 && b === 0) {
    k.d.t(640, 0.9, "triangle", 0.014, { to: 980, attack: 0.3, opt: true, rev: 0.6, pan: -0.5 });
    k.d.t(980, 0.9, "triangle", 0.012, { to: 640, at: 0.9, attack: 0.1, opt: true, rev: 0.6, pan: -0.5 });
  }
  if (b % 2 === 1 && R(c, 4) < 0.08 + 0.1 * L)
    k.d.t(YARD_BLIPS[(R(c, 5) * 5) | 0], 0.024, "square", 0.01, { lp: 6000, opt: true, pan: P(c, 6) });
}

/* Ember Works, 84 BPM, D minor (Dm Bb C Am): the factory sleeps. Pistons (a dull chuff and a low thump) on 1 and 3,
   the ticking of machines in eighths (its pattern changes per section), an anvil far away in the room, a chain
   ratchet and a burst of steam; a low drone of root and fifth, a square bass, a dark brass swell and a saw lead in
   the echo when it gets busy (the furnace and the far machines are the atmosphere) */
const WORKS_CALM_BASS = ["x.......x.......", "x.....x.x.......", "x.......x..x....", "x.....x.x..x..x."],
  WORKS_TICKS = ["x.x.x.x.x.x.x.x.", "x.xxx.x.x.xxx.x.", "x.x.x.xxx.x.x.xx", "xxx.x.x.xxx.x.x."];
function worksCalm(e, c) {
  const { b, bar, L, chord, root, sec } = c,
    k = kit(e, c);
  if (b === 0 || b === 8) {
    k.m.n(0.2, 0.14, { f: 300, to: 80, q: 1.2 });
    kick(k, 0.34, { f0: 90, f1: 38, dur: 0.22, pump: 0.8, rel: 0.15 });
  }
  if (pat(WORKS_TICKS[sec])[b])
    k.m.n(0.014, b % 4 === 0 ? 0.04 : 0.022, { type: "bandpass", f: 5600, q: 7, pan: b % 4 === 0 ? -0.3 : 0.4 });
  if (b === 4 && (bar & 1) === 1) clang(k.m, midiToFreq(chord[0] + 24), 0.045, { rev: 0.8, pan: -0.4 });
  if (L > 0.45 && sec >= 2 && b === 12) clang(k.m, midiToFreq(chord[2] + 24), 0.03, { rev: 0.8, pan: 0.5 });
  if (L > 0.3 && sec >= 1 && b === 6 && R(c, 1) < 0.5)
    for (let i = 0; i < 5; i++)
      k.m.n(0.012, 0.035, {
        type: "bandpass",
        f: 4200,
        q: 3,
        at: [0, 0.03, 0.063, 0.101, 0.146][i],
        opt: true,
        pan: -0.5,
      });
  if ((bar & 3) === 2 && b === 14)
    k.m.n(0.9, 0.035, { type: "highpass", f: 5500, to: 3500, attack: 0.05, opt: true, pan: 0.5, rev: 0.3 });
  if (b === 0 && (bar & 1) === 0)
    pad(k.p, [root - 24, root - 17], c.barSec * 2 + 0.6, 0.03, { lp: 320, fade: 0.6, det: 5 });
  if (pat(WORKS_CALM_BASS[sec])[b]) k.p.t(midiToFreq(root - 24), 0.4, "square", 0.07, { lp: 360 + 250 * L });
  if (L > 0.4 && b === 0)
    for (const i of [0, 1, 2])
      k.p.t(midiToFreq(chord[i]), c.barSec * 0.9, "sawtooth", 0.014, {
        lp: 300,
        lpTo: 1300 + 600 * L,
        attack: 0.5,
        hold: 0.6,
        detune: (i - 1) * 6,
        rev: 0.4,
      });
  if (L > 0.55 && (sec & 1) === 1) {
    const note = leadPatterns[bar & 3][b];
    if (note != null)
      k.d.t(midiToFreq(chord[note % 4] + 24 + (note >= 4 ? 12 : 0)), 0.3, "sawtooth", 0.022, {
        attack: 0.02,
        lp: 1500,
        rev: 0.3,
      });
  }
}

/* Cryo Vault, 72 BPM, E minor (Em C G D): an ice cavern. No beat at all until the intensity is high (then a slow
   heartbeat), bells of ice in the echo and the room whose pattern changes per section, a glass pad, a deep sub on
   every chord, ticks of ice, cracks, wind chimes and a creak (the wind, its gusts and its whistle are the
   atmosphere) */
const VAULT_BELLS = ["x..x..x...x..x..", "x.x...x.x...x.x.", "x..x.x...x..x...", "x.x..x.x..x.x..x"],
  VAULT_CHIME = [76, 79, 81, 83, 86, 88];
function vaultCalm(e, c) {
  const { b, bar, L, chord, root, sec } = c,
    k = kit(e, c);
  if (pat(VAULT_BELLS[sec])[b]) {
    const n = chord[[0, 2, 1, 3, 2, 1, 3][(bar * 7 + b) % 7]] + (R(c, 1) < 0.25 ? 36 : 24);
    bell(k.d, midiToFreq(n), 0.045, 1.4, { rev: 0.7, pan: P(c, 2, 0.6), bright: sec >= 2 });
  }
  if (b === 0)
    pad(k.p, [chord[0] + 12, chord[2] + 12, chord[1] + 24], c.barSec + 0.8, 0.018, {
      wave: "triangle",
      lp: 2200,
      fade: 0.8,
      det: 6,
      rev: 0.7,
    });
  if (b === 0) k.p.t(subNote(root), c.barSec * 0.95, "sine", 0.08, { attack: 0.3, hold: c.barSec * 0.5 });
  if (L > 0.5 && b === 0) kick(k, 0.3, { f0: 100, f1: 40, dur: 0.25 });
  if (L > 0.5 && b === 3) kick(k, 0.18, { f0: 100, f1: 40, dur: 0.2 });
  if (L > 0.2 && b % 2 === 1 && R(c, 3) < 0.25 + 0.3 * L)
    k.m.n(0.008, 0.035, { type: "highpass", f: 7500, pan: P(c, 4, 0.8), rev: 0.6 });
  if (b % 4 === 2 && R(c, 5) < 0.08) {
    k.m.n(0.02, 0.06, { type: "highpass", f: 5200, opt: true, pan: P(c, 6), rev: 0.4 });
    k.m.t(3800, 0.08, "sine", 0.025, { to: 900, opt: true, pan: P(c, 6) });
  }
  if (b % 2 === 0 && b > 0 && R(c, 7) < 0.04 + 0.05 * L)
    bell(k.d, midiToFreq(VAULT_CHIME[(R(c, 8) * 6) | 0]), 0.025, 1.7, { opt: true, rev: 0.5, pan: P(c, 9) });
  if ((bar & 3) === 1 && b === 9 && R(c, 10) < 0.6) {
    k.m.n(0.9, 0.03, { type: "bandpass", f: 260, to: 210, q: 9, attack: 0.3, opt: true });
    k.m.t(78, 0.9, "sawtooth", 0.008, { to: 70, lp: 300, attack: 0.3, opt: true });
  }
}

/* Toxin Marsh, 78 BPM, F minor (Fm Ab Eb Cm), swing: a foggy bayou dub. A soft kick on 1, a rim on 3 with an echo
   throw, a lazy shaker, a bubbling sine bass on the off-beats that bends up (a bloop), a wobbling pad, dub chord
   skanks and a kalimba melody of the F minor pentatonic in the echo; the swamp: rising bubbles, frog croaks, mud
   squelches (insects and the murk are the atmosphere) */
const MARSH_CALM_BASS = ["...x..x....x....", "...x..x...x...x.", "...x...x...x....", "...x..x....x..x."],
  MARSH_PENTA = [65, 68, 70, 72, 75, 77, 80];
function marshCalm(e, c) {
  const { b, bar, L, chord, root, sec } = c,
    k = kit(e, c);
  if (b === 0) kick(k, 0.42, { f0: 115, f1: 40, dur: 0.24, pump: 0.75, rel: 0.14 });
  if (L > 0.4 && b === 10) kick(k, 0.25, { f0: 115, f1: 40, dur: 0.2 });
  if (b === 8) {
    rim(k, 0.08, { rev: 0.4 });
    k.d.n(0.05, 0.04, { type: "bandpass", f: 2200, q: 3 });
  }
  if (L > 0.2 && b % 2 === 0) hat(k, b % 4 === 0 ? 0.02 : 0.012, 0.03, 7500, b % 4 ? 0.3 : -0.3);
  if (pat(MARSH_CALM_BASS[sec])[b]) {
    const f = midiToFreq(root - 24 + [0, 0, 7, 0][(bar + b) & 3]);
    k.p.t(f, 0.3, "sine", 0.15, { to: f * 1.06 });
    k.p.t(f * 2, 0.22, "triangle", 0.04, { lp: 500 });
  }
  if (b === 0) {
    const dur = c.barSec + 0.4,
      env = tremoloEnv(1.4, 0.5, dur, 0.4);
    k.p.t(midiToFreq(chord[1]), dur, "sawtooth", 0.017, { lp: 620, detune: 9, env, rev: 0.35 });
    k.p.t(midiToFreq(chord[2]), dur, "sawtooth", 0.017, { lp: 620, detune: -9, env, rev: 0.35 });
  }
  if (L > 0.3 && sec >= 1 && (b === 4 || b === 12))
    for (const i of [0, 1, 2]) k.d.t(midiToFreq(chord[i] + 12), 0.07, "triangle", 0.016, { lp: 1800 });
  if (L > 0.5 && b % 2 === 0 && R(c, 1) < 0.3) {
    const f = midiToFreq(MARSH_PENTA[(R(c, 2) * 7) | 0]);
    k.d.t(f, 0.3, "sine", 0.035, { attack: 0.002, rev: 0.3, pan: P(c, 3, 0.4) });
    k.d.t(f * 3, 0.08, "sine", 0.01, { attack: 0.002, pan: P(c, 3, 0.4) });
  }
  if (R(c, 4) < 0.08 + 0.05 * L) {
    const f = 170 + R(c, 5) * 500,
      pan = P(c, 6, 0.8);
    k.m.t(f, 0.09, "sine", 0.045, { to: f * 1.9, opt: true, pan });
    if (R(c, 7) < 0.25) k.m.t(f * 0.7, 0.07, "sine", 0.03, { to: f * 1.4, at: 0.07, opt: true, pan });
  }
  if (b % 2 === 1 && R(c, 8) < 0.035) {
    const f = 95 + R(c, 9) * 30,
      pan = P(c, 10, 0.8);
    k.m.t(f, 0.11, "square", 0.028, { to: f * 1.35, lp: 650, q: 6, opt: true, pan, rev: 0.3 });
    k.m.t(f * 1.1, 0.13, "square", 0.028, { to: f, lp: 650, q: 6, at: 0.15, opt: true, pan, rev: 0.3 });
  }
  if ((bar & 1) === 1 && b === 13 && R(c, 11) < 0.5) {
    k.m.n(0.16, 0.07, { f: 900, to: 150, q: 7, opt: true, pan: -0.4 });
    k.m.t(180, 0.14, "sine", 0.06, { to: 55, opt: true, pan: -0.4 });
  }
}

/* Void Core, 66 BPM, F# minor (F#m D A E): dark and breathing. A slow heartbeat (two thumps) in every bar, drops of
   water in the echo on the broken groups of the bar (3+3+2+3+3+2 sixteenths, higher in every section), detuned saw
   drones, a reversed swell before every fourth bar, whispers, long pings far away, a square arpeggio and lead on the
   group starts when it gets busy (the beating drones, the space wind and the eerie tone are the atmosphere) */
const VOID_GROUPS = [0, 3, 6, 8, 11, 14],
  VOID_FORMANTS = [
    [700, 1200],
    [300, 2300],
    [500, 1800],
  ];
function voidCalm(e, c) {
  const { b, bar, L, chord, root, sec } = c,
    k = kit(e, c),
    group = VOID_GROUPS.indexOf(b);
  if (b === 0) kick(k, 0.36, { f0: 90, f1: 32, dur: 0.35, pump: 0.7, rel: 0.2 });
  if (b === 3) kick(k, 0.28, { f0: 90, f1: 32, dur: 0.3 });
  if (L > 0.6 && sec >= 2 && b === 8) kick(k, 0.22, { f0: 90, f1: 32, dur: 0.3 });
  if (group > 0)
    k.d.n(0.015, 0.03, { type: "bandpass", f: 1800 + 400 * sec + 250 * group, q: 6, pan: P(c, 1, 0.6), rev: 0.5 });
  if (b === 0 && (bar & 1) === 0)
    pad(k.p, [root - 24, root - 24, root - 17], c.barSec * 2 + 1.2, 0.028, { lp: 300 + 200 * L, fade: 1.2, det: 10 });
  if ((bar & 3) === 3 && b === 6) {
    k.m.n(1.6, 0.05, { type: "highpass", f: 800, to: 7000, attack: 1.45, opt: true });
    k.m.t(200, 1.6, "sawtooth", 0.016, { to: 1200, attack: 1.5, lp: 2000, opt: true });
  }
  if (L > 0.2 && b % 2 === 0 && R(c, 2) < 0.07) {
    const [f1, f2] = VOID_FORMANTS[(R(c, 3) * 3) | 0];
    formant(k.d, f1, f2, 1.5, 0.03, { attack: 0.45, hold: 0.3, opt: true, pan: P(c, 4), rev: 0.5 });
  }
  if (b % 2 === 0 && R(c, 5) < 0.07)
    k.d.t(midiToFreq(chord[(R(c, 6) * 3) | 0] + (R(c, 7) < 0.5 ? 24 : 36)), 2.6, "sine", 0.03, {
      opt: true,
      rev: 0.7,
      pan: P(c, 8),
    });
  if (L > 0.3 && group >= 0) {
    const p = arpPatterns[(sec + bar) % 4];
    k.d.t(midiToFreq(chord[p[group % p.length]] + 12), 0.1, "square", 0.018, { lp: 2200, rev: 0.3 });
  }
  if (L > 0.6 && (sec & 1) === 1 && group >= 0)
    k.d.t(midiToFreq(chord[(b + bar) % 4] + 24), 0.3, "square", 0.02, { attack: 0.01, lp: 2600, rev: 0.5 });
  if (b === 0) k.p.t(midiToFreq(root - 24), 0.6, "sawtooth", 0.09, { lp: 380 });
  if (b === 11 && L > 0.4) k.p.t(midiToFreq(root - 17), 0.3, "sawtooth", 0.07, { lp: 380 });
}

/* ---------- boss tracks ---------- */
function bossSection(bar) {
  return bar < 8 ? 0 : bar < 16 ? 1 : bar < 20 ? 2 : 3;
}
/* snare roll of the build: bar 20 eighths, bar 21 sixteenths, rising; the last step stays empty */
function buildRoll(k, c) {
  const { bar, b } = c,
    on = bar === 20 ? b % 2 === 0 : b < 15;
  if (on)
    snare(k, 0.06 + 0.2 * (((bar - 20) * 16 + b) / 32), {
      f: 1800 + b * 90 + (bar - 20) * 600,
      dur: 0.07,
      bf: 220,
      crack: 0.4,
    });
}
function buildRiser(k, c, f0 = 400) {
  if (c.bar === 20 && c.b === 0) {
    k.m.n(2.7, 0.08, { type: "highpass", f: f0, to: 9000, q: 0.9, attack: 2.6, opt: true });
    k.m.t(180, 2.7, "sawtooth", 0.016, { to: 1800, lp: 3000, attack: 2.6, opt: true });
  }
}
/* the kicks of the build: eighths in bar 20, sixteenths in bar 21 */
function buildKicks(k, c, v = 0.45) {
  if (c.bar === 20 ? c.b % 2 === 0 : c.b < 15) mkick(k, v);
}

/* Neon Yard boss, 174 BPM, A minor: cyber breakcore metal. A chopped break (four kick and snare patterns, 32nd
   stutters, ghost snares, a fill in every fourth bar), a distorted reese and 808 sub, double-tracked guitar stabs on
   the syncopation (an open chord on the one of every second bar), an acid lead in the variation, glitch blips, vocal
   chops and a siren; breakdown: half time, the kick and the low chug hit together, a huge snare with room; build:
   kicks speed up, the guitars climb, snare roll, riser */
const YB_K = ["x.x.......x.....", "x.x...x...x.x...", "x.....x.x.x.....", "x.x...x.....x.x."],
  YB_S = ["....x..o.o..x..o", "....x.o..o..x.oo", "....x..o..o.x..o", "....x.o.o...x.o."],
  YB_STAB = ["x..x..x...x..x..", "x..x..x.x..x..x.", "x.....x.x..x....", "x..x..x...x.x.x."],
  YB_BREAK = "x..x..x.x..x.x..",
  ACID_SCALE = [57, 60, 62, 64, 67, 69, 72],
  ACID_GATE = ["x.x.x...x.x.x...", "xx.xx.x.xx.xx.x."];
function yardBoss(e, c) {
  const { b, bar, sec, root, chord } = c,
    k = kit(e, c),
    q = bar & 3,
    g = root - 12,
    f808 = subNote(root);
  if (c.cycle + bar > 0 && b === 0 && (bar === 0 || bar === 8 || bar === 16)) {
    crash(k, 0.12);
    china(k, 0.06, 0.5);
  }
  if (sec <= 1) {
    const K = pat(YB_K[(q + sec) & 3]),
      S = pat(q === 3 && b >= 12 ? "....x.......XXXX" : YB_S[(q + sec * 2) & 3]);
    if (K[b]) {
      mkick(k, 0.55, { pump: b === 0 ? 0.4 : 0.6 });
      if (R(c, 1) < 0.15) mkick(k, 0.32, { at: c.half });
    }
    if (S[b]) {
      snare(k, 0.17 * S[b], { f: 2300, bf: 215, dur: 0.11, crack: 0.7, rev: 0.25 });
      if (R(c, 2) < 0.14) snare(k, 0.07, { f: 2700, dur: 0.05, at: c.half });
    } else if (!K[b] && R(c, 3) < 0.12) snare(k, 0.045, { f: 2500, dur: 0.04 });
    bhat(k, b % 4 === 0 ? 0.05 : b % 2 === 0 ? 0.035 : 0.022, 0.025, 9000, b % 2 ? 0.4 : -0.2);
    if (sec === 1 && b % 4 === 2) k.m.n(0.18, 0.03, { type: "bandpass", f: 6200, q: 2, pan: 0.6, opt: true });
    if (b === 0 || b === 6 || b === 10) {
      const dur = b === 0 ? 0.5 : 0.28;
      for (const det of [-16, 16])
        k.x.t(midiToFreq(root - 24), dur, "sawtooth", 0.05, { lp: 650, detune: det, hold: dur * 0.6 });
      k.x.t(f808 * 1.35, dur + 0.1, "sine", 0.22, { to: f808, attack: 0.003 });
    }
    if (pat(YB_STAB[q])[b]) {
      const open = b === 0 && (bar & 1) === 0;
      gtr(k, g + (q === 3 && b >= 10 ? 3 : 0), open ? 0.42 : 0.09, 0.05, {
        mute: !open,
        oct: b === 0,
        hold: open ? 0.2 : 0,
      });
    }
    if (sec === 1 && pat(ACID_GATE[bar & 1])[b]) {
      const note = ACID_SCALE[(b * 3 + bar * 2 + (b >> 2)) % 7] + (R(c, 4) < 0.3 ? 12 : 0);
      k.x.t(midiToFreq(note), 0.085, "sawtooth", 0.045, { lp: 500, lpTo: R(c, 5) < 0.4 ? 3200 : 1400, q: 11 });
    }
    if (b % 2 === 1 && R(c, 6) < 0.18)
      k.d.t(2500 + R(c, 7) * 2500, 0.014, "square", 0.02, { lp: 7000, opt: true, pan: P(c, 8, 0.8) });
    if (b % 8 === 6 && R(c, 9) < 0.55) {
      const [f1, f2] = VOID_FORMANTS[(R(c, 10) * 3) | 0];
      formant(k.m, f1 * 1.3, f2 * 1.3, 0.07, 0.07, { attack: 0.004, pan: P(c, 11, 0.6), rev: 0.2 });
    }
    if (q === 1 && b === 0) {
      k.d.t(700, 0.6, "sawtooth", 0.012, { to: 1400, lp: 3000, opt: true, rev: 0.3 });
      k.d.t(1400, 0.6, "sawtooth", 0.01, { to: 700, at: 0.6, lp: 3000, opt: true, rev: 0.3 });
    }
    if (bar === 15 && b === 8) reverseCymbal(k, 0.08);
  } else if (sec === 2) {
    if (pat(YB_BREAK)[b]) {
      mkick(k, 0.6, { pump: 0.45 });
      gtr(k, g, 0.12, 0.06, { mute: true });
    }
    if (b === 8) {
      snare(k, 0.26, { f: 1900, bf: 180, dur: 0.22, crack: 0.8, rev: 0.6 });
      china(k, 0.07, -0.5);
    }
    if (b === 0) {
      crash(k, 0.08, 0.9);
      k.x.t(f808 * 1.5, 1.1, "sine", 0.26, { to: f808, attack: 0.003 });
      pad(k.p, [chord[0] + 12, chord[1] + 12, chord[2] + 12], c.barSec + 0.2, 0.012, {
        lp: 1600,
        fade: 0.2,
        det: 8,
        rev: 0.5,
      });
    }
    if (b % 4 === 2) bhat(k, 0.03, 0.05, 8000, 0.3);
    if (bar === 19 && b === 8) reverseCymbal(k, 0.08);
  } else {
    buildKicks(k, c);
    gtr(k, g + Math.floor(((bar - 20) * 16 + b) / 4), 0.07, 0.04, { mute: true });
    buildRoll(k, c);
    buildRiser(k, c);
  }
}

/* Ember Works boss, 160 BPM, D minor: industrial metal. Drop: a galloping palm-muted riff (it bends into F and Eb at
   the end of bars two and four), double-tracked, with the double kick on the gallop, an open chord on the one, the
   snare on 2 and 4, an anvil on 3, pipes ringing, hydraulic hiss; variation: kick on every sixteenth (a blast beat in
   its second half), tremolo-picked chords and a scream lead; breakdown: djent chugs with the kick in unison, china,
   a slow snare with room, a machine press and a dissonant chord ringing out; build: chromatic chugs, roll, riser */
const WORKS_GALLOP = "x.xxx.xxx.xxx.xx",
  WORKS_DJENT = "x..x.xx...x.x..x",
  WORKS_TREM = [0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 5, 5, 3, 3, 1, 1],
  WORKS_BUILD = [
    [0, 0, 0, 0, 1, 1, 1, 1, 3, 3, 3, 3, 5, 5, 5, 5],
    [5, 5, 6, 6, 7, 7, 8, 8, 10, 10, 11, 11, 12, 12, 13, 13],
  ];
function worksRiffSemi(bar, b) {
  const q = bar & 3;
  if (q === 1 && (b === 10 || b === 11)) return 3;
  if (q === 3 && (b === 10 || b === 11)) return 1;
  if (q === 3 && (b === 14 || b === 15)) return 3;
  return 0;
}
function worksBoss(e, c) {
  const { b, bar, sec, root, chord } = c,
    k = kit(e, c),
    g = root - 12;
  if (c.cycle + bar > 0 && b === 0 && (bar & 3) === 0) {
    crash(k, 0.11);
    china(k, 0.06, -0.5);
  }
  if (sec === 0) {
    if (b === 0) gtr(k, g, 0.42, 0.055, { oct: true, hold: 0.22 });
    else if (pat(WORKS_GALLOP)[b])
      gtr(k, g + worksRiffSemi(bar, b), 0.075, b % 4 === 0 ? 0.055 : 0.045, { mute: true });
    if (b === 0 || pat(WORKS_GALLOP)[b]) mkick(k, 0.45, { pump: b % 4 === 0 ? 0.55 : 0 });
    if (b === 4 || b === 12) snare(k, 0.22, { f: 2100, bf: 220, dur: 0.13, crack: 0.8, rev: 0.3 });
    if (b === 8) anvil(k, midiToFreq(chord[0] + 24), 0.08, 0.3);
    if (b === 14 && R(c, 1) < 0.6) clang(k.m, midiToFreq(chord[2] + 36), 0.025, { pan: 0.6, rev: 0.3, opt: true });
    if (b % 2 === 0) bhat(k, 0.045, 0.04, 7500, b % 4 ? 0.4 : -0.1);
    if ((bar & 1) === 1 && b === 12)
      k.m.n(0.4, 0.05, { type: "highpass", f: 7000, to: 2500, attack: 0.01, pan: -0.6, opt: true });
    if (b === 0 || b === 8) k.p.t(midiToFreq(root - 24), 0.55, "sine", 0.18, { hold: 0.2 });
  } else if (sec === 1) {
    const blast = (bar & 7) >= 4;
    mkick(k, b % 4 === 0 ? 0.48 : 0.36, { pump: b === 0 ? 0.5 : 0 });
    if (blast ? b % 2 === 1 : b === 4 || b === 12)
      snare(k, blast ? 0.13 : 0.22, { f: 2100, bf: 220, dur: blast ? 0.08 : 0.13, crack: 0.6, rev: 0.2 });
    if (b % 4 === 0) k.m.n(0.25, 0.035, { type: "bandpass", f: 5800, q: 2, pan: 0.5, opt: true });
    gtr(k, g + WORKS_TREM[b] * (bar & 1), 0.08, 0.04, { lp: 2200 });
    if (b === 0)
      k.x.t(midiToFreq(chord[[2, 3, 1, 3][bar & 3]] + 24), c.barSec * 0.9, "sawtooth", 0.035, {
        lp: 3000,
        attack: 0.04,
        hold: c.barSec * 0.6,
        rev: 0.4,
      });
    if (b === 8 && (bar & 1) === 0) anvil(k, midiToFreq(chord[0] + 24), 0.08, -0.3);
    if (b === 0 || b === 8) k.p.t(midiToFreq(root - 24), 0.5, "sine", 0.16, { hold: 0.2 });
  } else if (sec === 2) {
    if (pat(WORKS_DJENT)[b]) {
      mkick(k, 0.6, { pump: 0.45 });
      gtr(k, g - (b === 10 && (bar & 1) === 1 ? 1 : 0), 0.1, 0.06, { mute: true, lp: 700 });
    }
    if (b === 0) china(k, 0.08, -0.4);
    if (b === 8) {
      snare(k, 0.27, { f: 1800, bf: 180, dur: 0.24, crack: 0.8, rev: 0.7 });
      anvil(k, midiToFreq(chord[0] + 24), 0.1);
    }
    if (b === 12 && (bar & 1) === 1) gtr(k, g + 1, 0.6, 0.05, { oct: true, hold: 0.3 });
    if (b === 0 && (bar & 1) === 0) {
      k.m.n(0.4, 0.14, { f: 500, to: 60, q: 1 });
      k.m.t(55, 0.6, "sine", 0.4, { to: 30 });
    }
    if (b % 4 === 2) bhat(k, 0.03, 0.04, 7500, 0.3);
  } else {
    gtr(k, g + (WORKS_BUILD[bar - 20][b] || 0), 0.075, 0.05, { mute: true });
    buildKicks(k, c);
    buildRoll(k, c);
    buildRiser(k, c);
  }
}

/* Cryo Vault boss, 172 BPM, E minor: black metal of ice. Drop: a blast beat (the first four bars a double kick under
   2 and 4, then kick and snare alternate), tremolo-picked open chords on every sixteenth, an ice bell melody on top
   and shatters on the crashes; variation: a heavy two-step with a reese, big open chords, ice cracks and glass
   arps; breakdown: half time, frozen chords ring out, a blizzard gust, bells; build: the tremolo climbs, roll, riser */
const VAULT_MEL = [76, 79, 83, 81, 79, 76, 74, 76, 72, 76, 79, 78, 74, 78, 81, 79];
function vaultBoss(e, c) {
  const { b, bar, sec, root, chord } = c,
    k = kit(e, c),
    g = root - 12,
    shatter = () => {
      k.m.n(0.35, 0.09, { type: "highpass", f: 6000, attack: 0.001, rev: 0.5, opt: true, pan: -0.3 });
      bell(k.d, midiToFreq(chord[0] + 48), 0.02, 0.6, { bright: true, opt: true, pan: 0.4 });
    };
  if (c.cycle + bar > 0 && b === 0 && (bar === 0 || bar === 8 || bar === 16)) {
    crash(k, 0.11);
    shatter();
  }
  if (sec === 0) {
    const blast = (bar & 7) >= 4;
    if (!blast || b % 2 === 0) mkick(k, 0.4, { pump: b === 0 ? 0.55 : 0 });
    if (blast ? b % 2 === 1 : b === 4 || b === 12)
      snare(k, blast ? 0.12 : 0.24, { f: 2500, bf: 220, dur: blast ? 0.07 : 0.12, crack: 0.6, rev: 0.25 });
    if (b % 4 === 0) k.m.n(0.2, 0.03, { type: "bandpass", f: 6400, q: 2, pan: 0.5, opt: true });
    gtr(k, g + (b >= 12 && (bar & 1) === 1 ? 2 : 0), 0.09, 0.035, { lp: 3400, oct: b % 4 === 0 });
    if (b % 4 === 0)
      bell(k.d, midiToFreq(VAULT_MEL[((bar & 3) * 4 + (b >> 2)) % 16]), 0.05, 0.9, { rev: 0.5, bright: true });
    if (b === 0) k.p.t(subNote(root), c.barSec * 0.9, "sine", 0.2, { hold: c.barSec * 0.5 });
  } else if (sec === 1) {
    if (b === 0 || b === 10 || (b === 3 && R(c, 1) < 0.5)) mkick(k, 0.55, { pump: 0.45 });
    if (b === 4 || b === 12) snare(k, 0.28, { f: 2400, bf: 200, dur: 0.14, crack: 0.8, rev: 0.4 });
    else if ((b === 7 || b === 9 || b === 15) && R(c, 2) < 0.35) snare(k, 0.07, { f: 2600, dur: 0.05 });
    bhat(k, b % 2 === 0 ? 0.05 : 0.025, 0.025, 9500, b % 4 < 2 ? -0.4 : 0.4);
    if (b === 0 || b === 10) {
      const dur = b === 0 ? 1.3 : 0.5;
      for (const det of [-14, 14])
        k.x.t(midiToFreq(root - 24), dur, "sawtooth", 0.04, { lp: 500, hold: dur * 0.6, detune: det });
    }
    if (b === 0) gtr(k, g, 0.7, 0.05, { oct: true, hold: 0.45 });
    if (b === 10) gtr(k, g + ((bar & 1) === 1 ? 3 : -2), 0.35, 0.05, { oct: true, hold: 0.2 });
    if (b % 4 === 2 && R(c, 3) < 0.4) {
      const pan = P(c, 4, 0.8);
      k.m.n(0.02, 0.08, { type: "highpass", f: 5000, pan, opt: true });
      k.m.t(3600, 0.07, "sine", 0.03, { to: 800, pan, opt: true });
    }
    k.d.t(midiToFreq(chord[[0, 2, 1, 3, 2, 1, 3, 2][b % 8]] + 24 + (b % 8 === 7 ? 12 : 0)), 0.11, "sine", 0.03);
  } else if (sec === 2) {
    if (b === 0) {
      mkick(k, 0.6, { pump: 0.4 });
      gtr(k, g, c.barSec * 0.95, 0.045, { oct: true, hold: c.barSec * 0.6, lp: 2800 });
      k.p.t(subNote(root), 1.3, "sine", 0.28, { hold: 0.8 });
    }
    if (b === 8) snare(k, 0.28, { f: 2000, bf: 190, dur: 0.25, crack: 0.8, rev: 0.8 });
    if (b === 6 || b === 14) mkick(k, 0.35);
    if (b === 0 && (bar & 1) === 0)
      k.m.n(c.barSec * 1.8, 0.07, {
        type: "bandpass",
        f: 400,
        to: 1800,
        q: 1,
        attack: c.barSec,
        hold: 0.3,
        opt: true,
        rev: 0.3,
      });
    if (b % 2 === 0) k.d.t(midiToFreq(chord[[0, 2, 1, 3][(b >> 1) & 3]] + 24), 0.14, "sine", 0.04, { rev: 0.4 });
    if (bar === 19 && b === 8) reverseCymbal(k, 0.08);
  } else {
    gtr(k, g + (Math.floor(((bar - 20) * 16 + b) / 2) % 12), 0.08, 0.035, { lp: 3400 });
    buildKicks(k, c, 0.4);
    buildRoll(k, c);
    buildRiser(k, c, 600);
    if (bar === 21 && b === 12) shatter();
  }
}

/* Toxin Marsh boss, 140 BPM, F minor: sludge and wobble. Drop: half time, kick on 1 (a ghost on the "and" of 2), a
   distorted snare on 3, the wobble bass (a saw and a resonant square an octave up whose filters sweep in opposite
   phase, through the distortion), doom chords that ring for half a bar and muted chugs before the next, squelches
   and bubbles; variation: triplet chugs with the kick in unison, a faster wobble, a growl lead and distorted croaks;
   breakdown: a slow sub drone with a long wobble and a doom chord that rings for two bars; build: the wobble
   speeds up, roll, riser */
const MARSH_HALF = [
    [0, 0],
    [0, 0],
    [0, 5],
    [0, 3],
  ],
  MARSH_TRIP = "x..x..x..x..x.x.";
function marshBoss(e, c) {
  const { b, bar, sec, root, chord } = c,
    k = kit(e, c),
    g = root - 12,
    step = 60 / 140 / 4,
    wob = (b0, len, semi, period) => {
      if (b !== b0) return;
      const dur = len * step,
        base = root - 24 + semi,
        f = midiToFreq(base < 29 ? base + 12 : base);
      k.x.t(f, dur, "sawtooth", 0.1, {
        lp: 160,
        q: 5,
        lpCurve: wobbleCurve(160, 1500, period * step, dur, 0),
        hold: dur * 0.8,
      });
      k.x.t(f * 2, dur, "square", 0.045, {
        lp: 200,
        q: 9,
        lpCurve: wobbleCurve(200, 1800, period * step, dur, Math.PI),
        hold: dur * 0.8,
      });
    },
    squelch = (pan) => {
      k.m.n(0.16, 0.08, { f: 900, to: 150, q: 7, opt: true, pan });
      k.m.t(180, 0.14, "sine", 0.07, { to: 55, opt: true, pan });
    };
  if (c.cycle + bar > 0 && b === 0 && (bar === 0 || bar === 8 || bar === 16)) {
    crash(k, 0.11);
    china(k, 0.06, 0.4);
  }
  if (sec === 0) {
    if (b === 0) mkick(k, 0.6, { f0: 160, f1: 42, dur: 0.12, pump: 0.4 });
    if (b === 6) mkick(k, 0.35, { f0: 160, f1: 42, dur: 0.1 });
    if (b === 8) {
      snare(k, 0.26, { f: 900, bf: 140, dur: 0.24, crack: 0.5, rev: 0.45 });
      k.x.t(120, 0.22, "triangle", 0.1, { to: 60 });
    }
    bhat(k, b % 2 === 0 ? 0.045 : 0.02, b % 2 === 0 ? 0.03 : 0.015, b % 2 === 0 ? 8000 : 10000, b % 4 < 2 ? -0.3 : 0.3);
    wob(0, 8, MARSH_HALF[bar & 3][0], 4);
    wob(8, 8, MARSH_HALF[bar & 3][1], 4);
    if (b === 0 || b === 8)
      gtr(k, g + MARSH_HALF[bar & 3][b >> 3], c.barSec * 0.45, 0.05, { oct: true, hold: c.barSec * 0.3, lp: 2400 });
    if (b === 13 || b === 14) gtr(k, g, 0.08, 0.05, { mute: true });
    if (b === 6 && R(c, 1) < 0.4) squelch(P(c, 2));
    if (b % 2 === 1 && R(c, 3) < 0.08) {
      const f = 170 + R(c, 4) * 500;
      k.d.t(f, 0.09, "sine", 0.05, { to: f * 1.9, opt: true, pan: P(c, 5, 0.8) });
    }
  } else if (sec === 1) {
    if (pat(MARSH_TRIP)[b]) {
      mkick(k, 0.5, { f0: 170, f1: 45, pump: b === 0 ? 0.45 : 0 });
      gtr(k, g + (b >= 12 ? [3, 0, 5, 7][bar & 3] : 0), 0.1, 0.055, { mute: true });
    }
    if (b === 8) {
      snare(k, 0.26, { f: 900, bf: 140, dur: 0.22, crack: 0.6, rev: 0.4 });
      k.x.t(120, 0.2, "triangle", 0.1, { to: 60 });
    }
    bhat(k, 0.03, 0.02, 9000, b % 2 ? 0.4 : -0.4);
    wob(0, 6, 0, 2);
    wob(6, 6, 0, 2);
    wob(12, 4, [3, 0, 5, 7][bar & 3], 2);
    if (b === 0 || b === 10)
      k.x.t(midiToFreq(chord[(bar & 1) === 1 ? 2 : 0] + 24), 0.5, "square", 0.035, { lp: 1400, lpTo: 600, q: 6 });
    if (b === 15 && R(c, 6) < 0.5) k.x.t(95, 0.12, "square", 0.05, { to: 130, lp: 700, q: 6 });
    if (b === 6 && R(c, 7) < 0.4) squelch(P(c, 8));
  } else if (sec === 2) {
    if (b === 0) mkick(k, 0.6, { f0: 150, f1: 38, dur: 0.2, pump: 0.4 });
    if (b === 8) {
      snare(k, 0.26, { f: 800, bf: 130, dur: 0.25, crack: 0.5, rev: 0.6 });
      k.x.t(120, 0.25, "triangle", 0.12, { to: 55 });
    }
    if (b === 0) {
      const dur = 16 * step,
        base = root - 24,
        f = midiToFreq(base < 29 ? base + 12 : base);
      k.x.t(f, dur, "sawtooth", 0.1, {
        lp: 160,
        q: 5,
        lpCurve: wobbleCurve(160, 1200, 8 * step, dur, 0),
        hold: dur * 0.8,
      });
    }
    if (b === 0 && (bar & 1) === 0) gtr(k, g, c.barSec * 1.9, 0.045, { oct: true, hold: c.barSec * 1.4, lp: 2000 });
    if (b === 6 && (bar & 1) === 1) squelch(-0.4);
    if (b % 4 === 2) k.m.n(0.05, 0.04, { f: 400, to: 120, q: 4, opt: true, pan: P(c, 9) });
  } else {
    if (b === 0 || b === 8) wob(b, 8, 0, bar === 20 ? 2 : 1);
    buildKicks(k, c, 0.5);
    if (b % 2 === 0) gtr(k, g + (bar - 20) * 5 + (b >> 2), 0.08, 0.045, { mute: true });
    buildRoll(k, c);
    buildRiser(k, c, 300);
  }
}

/* Void Core boss, 150 BPM, F# minor: cosmic horror glitch metal. Drop: a tritone riff of muted chugs on the broken
   groups of the bar (double-tracked), broken kick and snare patterns with drop-outs and 32nd stutters, drones through
   the distortion, a dissonant choir, a tape stop every eighth bar; variation: a blast with a dissonant tremolo
   (root, minor second, tritone) and a screeching lead in the echo; breakdown: drones, whispers, a heartbeat kick,
   distorted sub hits and a tritone chord that rings; build: gated chugs that climb, roll, riser, tape stop */
const VOID_STAB = [
    ["x..x..x.x..x..x.", "x..x.....x..x.x.", "x..x..x.....x...", "x.....x.x.x..x.."],
    ["X..x..x.x.xx..x.", "x..x.x...x..xxx.", "x.xx..x.x...x.x.", "x..xx.x.x.x.xx.."],
  ],
  VOID_BREAK_K = ["x..x......x.....", "x.....x...x..x..", "x..x..x.....x...", "x.....x.x.x....."],
  VOID_BREAK_S = ["......x...x...x.", "........x..x..x.", "....x.....x...x.", "......x.x...x..."],
  VOID_TREM = [0, 0, 1, 1, 6, 6, 1, 1, 0, 0, 1, 1, 6, 6, 7, 6];
function voidBoss(e, c) {
  const { b, bar, sec, root, chord } = c,
    k = kit(e, c),
    q = bar & 3,
    g = root - 12,
    tapeStop = () => {
      k.x.t(midiToFreq(root + 12), 0.6, "sawtooth", 0.06, { to: midiToFreq(root + 12) * 0.1, lp: 2400 });
      k.x.t(midiToFreq(root + 18), 0.6, "sawtooth", 0.05, { to: midiToFreq(root + 18) * 0.1, lp: 2400 });
    },
    drone = (vol) => {
      for (const det of [-14, 14])
        k.x.t(midiToFreq(root - 24), c.barSec * 2 + 0.3, "sawtooth", vol, {
          lp: 360,
          env: padEnv(c.barSec * 2 + 0.3, 0.3),
          detune: det,
        });
    };
  if (c.cycle + bar > 0 && b === 0 && (bar === 0 || bar === 8 || bar === 16)) {
    crash(k, 0.11);
    china(k, 0.07, -0.4);
  }
  if (sec === 0) {
    if (b === 0 && (bar & 1) === 0) drone(0.035);
    const st = pat(VOID_STAB[0][q])[b];
    if (st)
      gtr(k, g + (b >= 12 ? 6 : b >= 8 && q === 3 ? 1 : 0), st > 1 ? 0.2 : 0.09, 0.05, { mute: st <= 1, oct: st > 1 });
    if (pat(VOID_BREAK_K[q])[b] && R(c, 1) > 0.1) mkick(k, 0.55, { f0: 190, f1: 40, pump: 0.5 });
    if (pat(VOID_BREAK_S[q])[b] && R(c, 2) > 0.12) {
      snare(k, 0.17, { f: 2600, bf: 240, dur: 0.09, crack: 0.7, rev: 0.3 });
      if (R(c, 3) < 0.2) snare(k, 0.07, { f: 2600, dur: 0.05, at: c.half });
    }
    if (R(c, 4) < 0.35) bhat(k, 0.025, 0.012, 12000, P(c, 5, 0.8));
    if (R(c, 6) < 0.06)
      for (let i = 0; i < 4; i++)
        k.m.n(0.012, 0.06, { type: "highpass", f: 7000, at: i * c.half * 0.5, opt: true, pan: P(c, 7) });
    if (b === 0 && (bar & 1) === 1) {
      const [f1, f2] = VOID_FORMANTS[q % 3];
      formant(k.m, f1, f2, c.barSec, 0.025, { attack: 0.3, hold: c.barSec * 0.4, opt: true, rev: 0.6, pan: -0.3 });
    }
    if ((bar & 7) === 7 && b === 12) tapeStop();
  } else if (sec === 1) {
    if (b === 0 && (bar & 1) === 0) drone(0.035);
    mkick(k, b % 4 === 0 ? 0.48 : 0.34, { f0: 190, f1: 40, pump: b === 0 ? 0.5 : 0 });
    if ((bar & 7) >= 4 ? b % 2 === 1 : b === 4 || b === 12)
      snare(k, (bar & 7) >= 4 ? 0.12 : 0.22, { f: 2600, bf: 240, dur: 0.08, crack: 0.6, rev: 0.25 });
    gtr(k, g + VOID_TREM[b], 0.08, 0.038, { lp: 2600 });
    if (b % 8 === 0)
      k.d.t(midiToFreq(root + 36), 0.45, "sine", 0.025, {
        to: midiToFreq(root + (b === 0 ? 42 : 35)),
        rev: 0.5,
        pan: P(c, 8),
      });
    if (R(c, 9) < 0.08) bhat(k, 0.04, 0.01, 12000, P(c, 10, 0.8));
  } else if (sec === 2) {
    if (b === 0 && (bar & 1) === 0) {
      drone(0.045);
      gtr(k, g + 6, c.barSec * 1.8, 0.04, { oct: true, hold: c.barSec * 1.2, lp: 2000 });
    }
    if (b === 0 || b === 3) mkick(k, b === 0 ? 0.55 : 0.35, { f0: 150, f1: 34, dur: 0.2 });
    if (b === 8 && (bar & 1) === 0) {
      k.m.n(0.35, 0.18, { type: "bandpass", f: 1200, q: 0.8, rev: 0.5 });
      k.x.t(70, 0.5, "sine", 0.3, { to: 30 });
    }
    if (b % 4 === 2 && R(c, 11) < 0.15) {
      const [f1, f2] = VOID_FORMANTS[(R(c, 12) * 3) | 0];
      formant(k.d, f1, f2, 1.4, 0.035, { attack: 0.4, hold: 0.3, opt: true, rev: 0.5, pan: P(c, 13) });
    }
    if (b % 4 === 0 && R(c, 14) < 0.1)
      k.d.t(midiToFreq(chord[(R(c, 15) * 3) | 0] + (R(c, 16) < 0.5 ? 24 : 36)), 2.6, "sine", 0.035, {
        opt: true,
        rev: 0.6,
      });
    if (bar === 19 && b === 4) {
      k.m.n(1.6, 0.07, { type: "highpass", f: 800, to: 7000, attack: 1.45, opt: true });
      k.m.t(200, 1.6, "sawtooth", 0.025, { to: 1200, attack: 1.5, lp: 2000, opt: true });
    }
  } else {
    const gate = bar === 20 ? b % 2 === 0 : b < 15,
      climb = (bar - 20) * 16 + b;
    if (gate) gtr(k, g + Math.floor(climb / 4), 0.07, 0.045 + climb * 0.0006, { mute: true });
    buildKicks(k, c);
    buildRoll(k, c);
    buildRiser(k, c, 500);
    if (bar === 21 && b === 12) tapeStop();
  }
}

/* what a phase change (heat 1) and the enrage (heat 2) add to every boss track: sixteenth hat ticks, a china every
   second bar; enraged: a double kick on the off sixteenths, an octave stab on the chord root every second beat and a
   rising siren every fourth bar */
function bossHeatLayer(e, c) {
  const k = kit(e, c);
  if (c.b % 2 === 1) bhat(k, 0.03, 0.02, 11000, c.b % 4 === 1 ? 0.5 : -0.5);
  if (c.b === 0 && (c.bar & 1) === 0) china(k, 0.07, 0.4);
  if (c.heat >= 2) {
    if (c.b % 2 === 1 && c.sec !== 2) mkick(k, 0.3);
    if (c.b % 8 === 0) k.x.t(midiToFreq(c.chord[0] + 24), 0.3, "sawtooth", 0.04, { lp: 3000 });
    if (c.b === 0 && (c.bar & 3) === 0)
      k.d.t(500, c.barSec, "sawtooth", 0.012, { to: 1500, lp: 2500, opt: true, rev: 0.3 });
  }
}

/* The crash and the impact when the boss track starts on the spot (also when a phase change or the enrage sends the
   track back to its drop): a crash, a sub drop, a burst and a huge open chord on both guitars. The last hit when the
   boss is dead: a crash, a sub boom and a power chord that rings out in the room. */
function musicImpact(e, biome, at) {
  const f = midiToFreq((musicChords[biome] || musicChords.yard)[0][0] - 12);
  e.noise(1.6, 0.16, { type: "highpass", f: 4500, attack: 0.002, dest: e.mus, at, rev: 0.4 });
  e.tone(95, 0.8, "sine", 0.6, { to: 28, dest: e.mus, at });
  e.noise(0.3, 0.22, { f: 900, to: 120, dest: e.mus, at });
  for (const [dest, det, dt] of [
    [e.gtrL, -8, 0],
    [e.gtrR, 8, 0],
  ]) {
    e.tone(f, 1.2, "sawtooth", 0.06, { lp: 3200, hold: 0.5, detune: det, dest, at: at + dt });
    e.tone(f * 1.4983, 1.2, "sawtooth", 0.05, { lp: 3200, hold: 0.5, detune: det, dest, at: at + dt });
  }
}
function musicResolve(e, biome, at) {
  const f = midiToFreq((musicChords[biome] || musicChords.yard)[0][0] - 12);
  e.noise(1.8, 0.14, { type: "highpass", f: 4500, attack: 0.002, dest: e.mus, at, rev: 0.5 });
  e.tone(80, 0.8, "sine", 0.55, { to: 30, dest: e.mus, at });
  e.tone(f / 2, 1.6, "sawtooth", 0.05, { lp: 900, hold: 0.6, dest: e.distIn, at });
  for (const [dest, det] of [
    [e.gtrL, -8],
    [e.gtrR, 8],
  ]) {
    e.tone(f, 1.8, "sawtooth", 0.05, { lp: 2600, hold: 0.7, detune: det, dest, at, rev: 0.4 });
    e.tone(f * 1.4983, 1.8, "sawtooth", 0.04, { lp: 2600, hold: 0.7, detune: det, dest, at, rev: 0.4 });
  }
}
/* the intensity of a preview: it swells and falls over the 16 bars, so that the quiet and the full side of a calm
   theme can both be heard */
function previewLevel(bar) {
  return 0.3 + 0.65 * (0.5 - 0.5 * Math.cos(((bar % 16) / 16) * 2 * Math.PI));
}

const MUSIC_TRACKS = {
  yard: {
    fight: { bpm: 96, bars: 16, swing: 0, gain: 1, play: yardCalm },
    boss: { bpm: 174, bars: 22, swing: 0, gain: 1, play: yardBoss },
  },
  works: {
    fight: { bpm: 84, bars: 16, swing: 0, gain: 1, play: worksCalm },
    boss: { bpm: 160, bars: 22, swing: 0, gain: 1, play: worksBoss },
  },
  vault: {
    fight: { bpm: 72, bars: 16, swing: 0, gain: 1, play: vaultCalm },
    boss: { bpm: 172, bars: 22, swing: 0, gain: 1, play: vaultBoss },
  },
  marsh: {
    fight: { bpm: 78, bars: 16, swing: 0.18, gain: 1, play: marshCalm },
    boss: { bpm: 140, bars: 22, swing: 0, gain: 1, play: marshBoss },
  },
  void: {
    fight: { bpm: 66, bars: 16, swing: 0, gain: 1, play: voidCalm },
    boss: { bpm: 150, bars: 22, swing: 0, gain: 1, play: voidBoss },
  },
};
function musicTrack(kind, biome) {
  return (MUSIC_TRACKS[biome] || MUSIC_TRACKS.yard)[kind];
}
/* tempo (BPM) and length in sixteenth steps of what plays */
function trackInfo(kind, biome) {
  if (kind === "fight" || kind === "boss") {
    const track = musicTrack(kind, biome);
    return { bpm: track.bpm, steps: track.bars * 16 };
  }
  return { bpm: 100, steps: 64 };
}

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
  // 3.0.0: grenade, resisted hits and traps
  ids(["grenadeThrow", "grenadeBlast", "gadgetReady", "gadgetNo", "resist"]);
  // 3.3.0: the Endless mutator
  ids(["mutator"], "volatile");
  ids(["tcPlate", "tcCrusher", "tcIce", "tcGeyser", "tcRift"], 1);
  for (const id of ["tbLaser", "tbFlame", "tbRift"]) add(id, { id, arg: { delay: 0.7, dur: 1.2 } });
  ids(["tmMine", "tmFrost", "tmSpore", "tmRift"], 0.45);
  for (const skin of ["mine", "frost", "spore", "riftmine"]) ids(["tArm"], skin);
  ids(["tsPlate", "tsCrusher", "tsIce", "tsGeyser", "tsRift", "tsMine", "tsFrost", "tsSpore", "tsRiftMine"]);
  for (const boss of Object.keys(BOSS_ROOT)) {
    ids(["bossIntro"], boss);
    for (const id of [
      "bWind",
      "bRing",
      "bSlam",
      "bSummon",
      "bNova",
      "bLance",
      "bStoke",
      "bRain",
      "bOverdrive",
      "enrage",
      "bossDown",
    ])
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
  MUSIC_TRACKS,
  trackInfo,
  SoundEngine,
  RL_DEATH_FAMILY,
  RL_ESHOT_VOICE,
  RL_CHARGE_VOICE,
  RL_DASH_VOICE,
  RL_BOSS_ATK,
  RL_SOUND_EVENTS,
  RL_SILENT_EVENTS,
  RL_TRAP_SOUND,
  MAX_VOICES,
  MUSIC_DUCK,
  BOSS_SOUND,
};
