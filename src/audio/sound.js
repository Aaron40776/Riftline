// Sound effects and procedural music (SoundEngine) with the music tables per biome.

import { logError } from "../core/diagnostics.js";
import { weaponDefs } from "../data/weapons.js";
import { upgradesById } from "../data/upgrades.js";
import { PLACE, PLACE_IDS, placeTick } from "./place.js";

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
    surge: 0.1,
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
    surge: 0.3,
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
  /* the open "ah" of the choir: band-passes on its formants (frequency, Q, level) and a little of the voice */
  CHOIR_VOWEL = [
    [760, 5, 1],
    [1180, 7, 0.6],
    [2700, 9, 0.18],
    [0, 0.7, 0.12],
  ],
  AMBIENCE_LEVEL = { blackout: 0.07, meltdown: 0.11, whiteout: 0.085, bloom: 0.06, riftstorm: 0.055 },
  // 3.9.0: the default of the Ambience slider; at it the atmospheres of the music play at the level they had before
  AMB_REF = 0.8,
  MAX_VOICES = 24,
  // 2.8.2: the music has its own budget; shots and other sounds can no longer take notes away from it
  // 3.2.0: 36 (was 20): the boss tracks double-track their guitars (two amps) and play blast beats; 3.5.0: 44, they
  // also carry the motif and the pad of the calm theme
  MAX_MUSIC_VOICES = 44,
  MUSIC_RESERVE = 8,
  /* sounds that are never dropped in favour of others when the voice limit is reached */
  KEY_SOUNDS = new Set([
    "mutator",
    "surge",
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
  stun: [{ skin: "plate" }, { skin: "riftburst" }],
  cleared: [{}, { boss: true }],
  combo: [{ n: 20 }],
  comboEnd: [{ n: 20 }],
  surge: [
    { n: 15, i: 1 },
    { n: 60, i: 5 },
  ],
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

/* a small seeded random generator (0..1) for the offline test renders */
function makeSeeded(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
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
/* 3.7.0: six seconds of pink (-3 dB per octave, Paul Kellet's filter) or brown (-6 dB per octave) noise, made once
   per sample rate. The music and its atmospheres use them instead of the white noise of the sounds: they are soft
   rather than hissy, and six seconds never sound like a loop (the one second of white noise did, as a faint pulse).
   The end flows into the start (a crossfade over 50 ms); the level is that of the white noise (rms about 0.58), so a
   low filter lets far more of brown and pink noise through than of white (the levels below were measured for that). */
const colorCache = Object.create(null);
function colorNoise(ctx, color) {
  const key = color + ":" + ctx.sampleRate;
  if (colorCache[key]) return colorCache[key];
  const len = Math.round(ctx.sampleRate * 6),
    fadeN = Math.round(ctx.sampleRate * 0.05),
    raw = new Float32Array(len + fadeN);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0,
    last = 0,
    sum = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = Math.random() * 2 - 1;
    if (color === "brown") {
      // leaky integration: the leak keeps it free of drift (no DC)
      last = (last + 0.02 * w) / 1.02;
      raw[i] = last;
    } else {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  }
  const buf = (colorCache[key] = ctx.createBuffer(1, len, ctx.sampleRate)),
    data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    // an equal-power crossfade (two unrelated stretches of noise: a linear one would dip by 3 dB at every pass)
    const t = i < fadeN ? i / fadeN : 1;
    data[i] = raw[i] * Math.sqrt(t) + (i < fadeN ? raw[len + i] * Math.sqrt(1 - t) : 0);
    sum += data[i] * data[i];
  }
  const gain = 0.58 / Math.sqrt(sum / len || 1);
  for (let i = 0; i < len; i++) data[i] *= gain;
  return buf;
}
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
    // 3.4.0: Blackout City: Am F Dm E (the E major pulls back to A minor: film noir)
    yard: [
      [57, "m"],
      [53, "M"],
      [50, "m"],
      [52, "M"],
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
      // 3.9.0: the sounds of the place have their own volume and bus (Settings > Ambience): the event beds, the hazards
      // and the far sounds of the biome (audio/place.js); the atmospheres of the music follow it too (atmos)
      this.ambVol = AMB_REF;
      this.ambBus = null;
      this.atmos = null;
      this.atmosPump = null;
      this.curBus = null;
      this.placeSt = null;
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
      this.musicPeak = 0;
      this.musicShed = 0;
      this.musicLog = null;
      // 3.2.0: the music processing (see buildGraph) and the place of a track kept over a pause (held)
      this.glue = null;
      this.makeup = null;
      this.musLevel = null;
      this.pump = null;
      this.choir = null;
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
      this.ambBus = ctx.createGain();
      this.ambBus.gain.value = this.ambVol;
      this.ambBus.connect(this.comp);
      // 3.2.0: mus is the input of the music at unity; its volume is musLevel at the end of the music chain, so that
      // the glue compressor works the same at every volume setting
      this.mus = ctx.createGain();
      this.musLevel = ctx.createGain();
      this.musLevel.gain.value = this.musVol * 0.6;
      // 2.9.0: the music passes a gain stage of its own that dips briefly on big hits (duck)
      this.duckGain = ctx.createGain();
      // 3.1.0: a fade stage between the music and the duck (the calm theme fades back in after a boss)
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
      // the pump: pads, bass, strings, brass and the choir pass it; accented kicks dip it (a sidechain feel)
      this.pump = ctx.createGain();
      this.pump.connect(this.mus);
      // 3.9.0: the atmospheres of the music pass these on their way into the music (calm) or the pump (boss)
      this.atmos = ctx.createGain();
      this.atmosPump = ctx.createGain();
      this.atmos.gain.value = this.atmosPump.gain.value = this.ambVol / AMB_REF;
      this.atmos.connect(this.mus);
      this.atmosPump.connect(this.pump);
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
      // the music and its atmospheres take pink or brown noise (opts.color, see colorNoise)
      this.pinkBuf = colorNoise(ctx, "pink");
      this.brownBuf = colorNoise(ctx, "brown");
      // the choir of the boss tracks: saw voices through the three formants of an open "ah" and a little of the
      // voice itself (CHOIR_VOWEL); it joins the pump like the pads
      this.choir = ctx.createGain();
      let choirOut = ctx.createGain();
      choirOut.gain.value = 1;
      for (let [f, q, g] of CHOIR_VOWEL) {
        let band = ctx.createBiquadFilter(),
          amp = ctx.createGain();
        band.type = f ? "bandpass" : "lowpass";
        band.frequency.value = f || 900;
        band.Q.value = q;
        amp.gain.value = g;
        this.choir.connect(band);
        band.connect(amp);
        amp.connect(choirOut);
      }
      choirOut.connect(this.pump);
      if (this.verbIn) {
        let send = ctx.createGain();
        send.gain.value = 0.6;
        choirOut.connect(send);
        send.connect(this.verbIn);
      }
    }
    /* the noise buffer of a colour ("pink", "brown"; anything else: the white noise of the sounds) */
    noiseOf(color) {
      return color === "pink" ? this.pinkBuf : color === "brown" ? this.brownBuf : this.noiseBuf;
    }
    /* a looping noise source of the beds, started somewhere in its buffer */
    noiseLoop(rate, color, now) {
      let node = this.ctx.createBufferSource();
      node.buffer = this.noiseOf(color);
      node.loop = true;
      node.playbackRate.value = rate;
      node.start(now, Math.random() * Math.max(0, node.buffer.duration - 0.5));
      return node;
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
    setVolumes(sfx, music, ambience = this.ambVol) {
      this.sfxVol = sfx;
      this.musVol = music;
      this.ambVol = ambience;
      if (!this.ctx) return;
      let now = this.ctx.currentTime;
      this.sfx.gain.setTargetAtTime(sfx, now, 0.05);
      this.musLevel.gain.setTargetAtTime(music * 0.6, now, 0.1);
      this.ambBus.gain.setTargetAtTime(ambience, now, 0.05);
      this.atmos.gain.setTargetAtTime(ambience / AMB_REF, now, 0.1);
      this.atmosPump.gain.setTargetAtTime(ambience / AMB_REF, now, 0.1);
    }
    /* 3.9.0: one sound of the place (audio/place.js) at level a.g and pan a.pan, on the ambience bus */
    placePlay(id, a) {
      if (!this.live() || this.ambVol <= 0 || !PLACE[id]) return;
      try {
        PLACE[id](this, a);
      } catch (err) {
        this.fail(err);
      }
    }
    /* 3.9.0: the sounds of the place of a running fight (main.js calls it every frame; see audio/place.js) */
    place(world, dt) {
      if (!this.live() || this.ambVol <= 0 || !world || !world.arena) return;
      try {
        placeTick(this, world, dt);
      } catch (err) {
        this.fail(err);
      }
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
     sweep), env (Float32Array, 0..1: the whole level curve replaces the exponential envelope: tremolo), dest/at/pri,
     opt (an optional music voice) */
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
        if (opts.lpTo) {
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
      // (never past the end: a hold that reaches beyond the note would come after its fade)
      if (opts.hold)
        amp.gain.setValueAtTime(vol, start + attack + Math.min(opts.hold, Math.max(0, dur * 0.95 - attack)));
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
      src.buffer = this.noiseOf(opts.color);
      // 2.9.1: the 1 s buffer is looped: a burst longer than what is left of it (it starts up to 0.5 s in)
      // used to be cut off; white noise has no audible seam (3.7.0: nor have the six seconds of pink and brown)
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
      src.start(start, Math.random() * Math.max(0, src.buffer.duration - 0.5));
      src.stop(start + dur + 0.02);
    }
    /* 3.2.0: where a voice goes: its bus (opts.dest, the sounds by default), panned with opts.pan (-1..1) and sent to
       the music reverb with opts.rev (send level) */
    route(amp, opts) {
      // a sound (no bus of its own) takes the pan and the room of the event that is being played
      // 3.9.0: the sounds of the place go to the ambience bus (opts.dest, or curBus while the accents of a biome event
      // play) and ring out in the room of the sounds, not in that of the music
      let dest = opts.dest || this.curBus || this.sfx,
        pan = opts.pan != null ? opts.pan : opts.dest ? 0 : this.curPan,
        rev = opts.rev != null ? opts.rev : opts.dest ? 0 : this.curRev,
        room = opts.dest && opts.dest !== this.ambBus ? this.verbIn : this.sfxVerbIn;
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
       bus (m music, d delay, p pump, c choir) */
    logMusic(voice, kind, pitch, vol, opts) {
      if (!this.musicLog || voice.pri !== 0) return;
      let dest = opts.dest;
      this.musicLog.push({
        kind,
        t: voice.start,
        pitch,
        vol,
        dur: voice.end - voice.start,
        bus: dest === this.delay ? "d" : dest === this.pump ? "p" : dest === this.choir ? "c" : "m",
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
        case "surge": {
          // Combo Surge: a deep thump, a swell of air that opens up, and a bright fifth that climbs a step with every
          // surge of the same combo (arg: the surge of the combo, 1 for the first)
          const lift = Math.min(10, Math.max(0, Math.round(arg || 1) - 1) * 2);
          this.tone(95, 0.42, "sine", 0.34, { to: 36 });
          this.noise(0.32, 0.1, { type: "bandpass", f: 420, to: 2800, q: 1.3, attack: 0.02 });
          [0, 0.045, 0.09].forEach((at, i) =>
            this.tone(midiToFreq(69 + lift + [0, 7, 12][i]), 0.34, "triangle", 0.055, { at, lp: 5200 }),
          );
          this.tone(midiToFreq(93 + lift), 0.5, "sine", 0.025, { at: 0.12 });
          break;
        }
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
          // 3.4.0: a live manhole of Blackout City arcs: a hard snap, crackles, a mains buzz and a falling zap
          if (this.biome === "yard") {
            if (this.gate(id, 0.25)) {
              this.noise(0.03, 0.22, { type: "highpass", f: 3000, attack: 0.001 });
              for (let i = 0; i < 6; i++)
                this.noise(0.02, 0.09, {
                  type: "bandpass",
                  f: 2500 + Math.random() * 5000,
                  q: 6,
                  at: 0.02 + i * 0.05 + Math.random() * 0.03,
                });
              this.tone(100, 0.6, "sawtooth", 0.06, { lp: 1400, attack: 0.01, hold: 0.35 });
              this.tone(101.5, 0.6, "square", 0.03, { lp: 900, attack: 0.01, hold: 0.35 });
              this.tone(3200, 0.3, "sawtooth", 0.035, { to: 260, lp: 5000, at: 0.02 });
            }
            break;
          }
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
        case "place":
          // 3.9.0: a sound of the place (the offline test plays them this way; the game through placePlay)
          if (arg && PLACE[arg.id]) PLACE[arg.id](this, { g: arg.g ?? 1, pan: arg.pan ?? 0 });
          break;
        case "chill":
          if (this.gate(id, 0.3)) {
            this.tone(2400, 0.2, "sine", 0.05, { to: 1200 });
          }
          break;
        case "stun":
          // 3.7.1: an electric trap stuns the drone: a dry snap, a short mains buzz that dies and a few crackles (the
          // rift burst buzzes lower and bends down, the city's plate is a hard 100 Hz hum)
          if (this.gate(id, 0.3)) {
            const rift = arg === "riftburst",
              f = rift ? 70 : 100;
            this.noise(0.025, 0.1, { type: "highpass", f: 3200, attack: 0.001 });
            this.tone(f, 0.3, "sawtooth", 0.045, { lp: 1200, to: rift ? f * 0.6 : f, attack: 0.004, hold: 0.12 });
            this.tone(f * 1.01, 0.3, "square", 0.02, { lp: 800, attack: 0.004, hold: 0.12 });
            for (let i = 0; i < 3; i++)
              this.noise(0.015, 0.05, { type: "bandpass", f: 2600 + i * 1300, q: 6, at: 0.04 + i * 0.06 });
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
            // 3.4.0: the metal is louder and clangs inharmonically (it was easy to mistake for a plain blast)
            this.tone(62, 0.55, "sine", 0.45, { to: 26 });
            this.noise(0.12, 0.1, { f: 900, to: 100, attack: 0.002 });
            this.noise(0.04, 0.2, { type: "bandpass", f: 2600, q: 3, attack: 0.001 });
            this.tone(170, 0.12, "square", 0.1, { to: 80, lp: 900 });
            // a ringing, inharmonic metal tail (the piston hits steel): partials at 1 : 2.76 : 5.4 : 8.9
            [420, 1160, 2270, 3740].forEach((f, i) =>
              this.tone(f, 1 - i * 0.18, "sine", 0.1 - i * 0.02, { at: 0.01, attack: 0.001 }),
            );
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
        case "blackout":
          // 3.4.0: the power dies: the mains hum sinks, the lights go out with three heavy clunks, a siren far away
          this.tone(120, 1.4, "sawtooth", 0.12, { to: 28, lp: 700, hold: 0.2 });
          this.tone(60, 1.4, "sine", 0.2, { to: 22 });
          [0.5, 0.75, 1.0].forEach((at, i) => {
            this.noise(0.05, 0.16 - i * 0.03, { type: "bandpass", f: 900 - i * 150, q: 2, at, attack: 0.001 });
            this.tone(140 - i * 20, 0.12, "triangle", 0.12, { to: 60, at });
          });
          this.tone(640, 0.45, "triangle", 0.02, { to: 960, at: 1.05, attack: 0.15 });
          this.tone(960, 0.45, "triangle", 0.018, { to: 640, at: 1.5, attack: 0.05 });
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
            // 3.0.0: the grenade and the traps have blasts of their own (grenadeBlast, trapFire); 3.6.0: so has the
            // Combo Surge ("surge")
            if (ev.kind === "trap" || ev.kind === "surge") break;
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
          case "stun":
            this.play("stun", ev.skin);
            break;
          case "championDown":
            this.play("bigkill");
            break;
          case "combo":
            this.play("combo", Math.round(Math.log2(ev.n / 10) * 3));
            break;
          case "surge":
            this.play("surge", ev.i);
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
     already scheduled for the old track and plays the transition: an impact when the boss track starts, a last
     hit when it resolves (the calm theme then fades back in over about 3 s). */
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
      // the drone's hum is an effect; the beds of the biome events are the place (3.9.0: ambience bus)
      gain.connect(name === "hum" ? this.sfx : this.ambBus);
      let osc = (type, freq) => {
          let node = ctx.createOscillator();
          node.type = type;
          node.frequency.value = freq;
          node.start(now);
          nodes.push(node);
          return node;
        },
        loop = (rate, color) => {
          let node = this.noiseLoop(rate, color, now);
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
        // 3.7.0: the event beds take pink and brown noise (no white hiss), like the atmospheres of the music
        case "meltdown": {
          let rumble = filter("lowpass", 170, 0.8, loop(0.6, "brown")),
            rumbleAmp = ctx.createGain();
          rumbleAmp.gain.value = 0.55;
          rumble.connect(rumbleAmp);
          rumbleAmp.connect(gain);
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
          let hiss = filter("bandpass", 1600, 0.7, loop(1.3, "pink")),
            hissAmp = ctx.createGain();
          hissAmp.gain.value = 0.06;
          hiss.connect(hissAmp);
          hissAmp.connect(gain);
          break;
        }
        case "whiteout": {
          // wind: band-passed noise whose centre wanders slowly
          let wind = filter("bandpass", 700, 0.7, loop(1, "pink")),
            lfo = osc("sine", 0.13),
            depth = ctx.createGain(),
            windAmp = ctx.createGain();
          depth.gain.value = 320;
          windAmp.gain.value = 0.75;
          lfo.connect(depth);
          depth.connect(wind.frequency);
          wind.connect(windAmp);
          windAmp.connect(gain);
          // 2.9.0: a thin second wind, higher and slower, that whistles
          let whistle = filter("bandpass", 1700, 12, loop(1.3, "pink")),
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
          let gurgle = filter("lowpass", 320, 1.5, loop(0.5, "brown")),
            gurgleAmp = ctx.createGain();
          gurgleAmp.gain.value = 0.25;
          gurgle.connect(gurgleAmp);
          gurgleAmp.connect(gain);
          // 2.9.0: a burbling band of noise whose pitch wobbles about twice a second
          let burble = filter("bandpass", 200, 3, loop(0.7, "brown")),
            wobble = osc("sine", 0.55),
            wobbleDepth = ctx.createGain(),
            burbleAmp = ctx.createGain();
          wobbleDepth.gain.value = 70;
          burbleAmp.gain.value = 0.25;
          wobble.connect(wobbleDepth);
          wobbleDepth.connect(burble.frequency);
          burble.connect(burbleAmp);
          burbleAmp.connect(gain);
          break;
        }
        case "blackout": {
          // 3.4.0: a dying transformer: a 50 Hz buzz that flickers, and a crackle that comes and goes
          let buzz = filter("lowpass", 400, 1.2, osc("sawtooth", 50)),
            buzzAmp = ctx.createGain(),
            flicker = osc("square", 5.3),
            flickerDepth = ctx.createGain();
          buzzAmp.gain.value = 0.5;
          flickerDepth.gain.value = 0.35;
          flicker.connect(flickerDepth);
          flickerDepth.connect(buzzAmp.gain);
          buzz.connect(buzzAmp);
          buzzAmp.connect(gain);
          let crackle = filter("bandpass", 2600, 4, loop(1.2, "pink")),
            crackleAmp = ctx.createGain(),
            swell = osc("sine", 0.23),
            swellDepth = ctx.createGain();
          crackleAmp.gain.value = 0.16;
          swellDepth.gain.value = 0.16;
          swell.connect(swellDepth);
          swellDepth.connect(crackleAmp.gain);
          crackle.connect(crackleAmp);
          crackleAmp.connect(gain);
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
    /* 3.2.0: the atmosphere of a music track: a loop that plays under the notes for as long as the track plays (a
       singing wind in the Cryo Vault, murk in the Toxin Marsh, the furnace in the Ember Works, soft rain and city hum
       in Blackout City, beating drones in the Void Core; see MUSIC_BEDS). It goes through the music chain (volume,
       fade, glue) and is not a voice of the budget. */
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
        loop = (rate, color) => {
          let node = this.noiseLoop(rate, color, now);
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
      out.connect(kind === "boss" ? this.atmosPump : this.atmos);
      recipe.build({ osc, loop, filt, lfo, level, root, bpm, boss: kind === "boss" });
      if (kind === "boss" && recipe.bossExtra) recipe.bossExtra({ osc, loop, filt, lfo, level, root, bpm });
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
        live = now - this.liveT < 0.8 && (this.mode === "fight" || this.mode === "boss"),
        hum = live && this.sfxVol > 0 && this.speed != null,
        amb = live && this.ambVol > 0 ? this.amb : null;
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
      this.curBus = this.ambBus;
      try {
        this.accentOf(name, now);
      } finally {
        this.curBus = null;
      }
    }
    accentOf(name, now) {
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
          this.noise(1.2, 0.04, { type: "bandpass", f: 500, to: 1400, q: 1, attack: 0.5, color: "pink" });
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
        case "blackout":
          // a snap of sparks somewhere in the dark, now and then a far siren or thunder
          this.accentT = now + 0.9 + Math.random() * 1.6;
          for (let i = 0; i < 3; i++)
            this.noise(0.02, 0.05, { type: "bandpass", f: 2500 + Math.random() * 4000, q: 5, at: i * 0.04 });
          if (Math.random() < 0.25) this.noise(2.2, 0.008, { f: 160, to: 60, attack: 0.3, q: 0.7, color: "brown" });
          else if (Math.random() < 0.3) this.tone(600, 0.8, "triangle", 0.012, { to: 900, attack: 0.3 });
          break;
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
            color: "pink",
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
          // phase change or enrage: back to the drop (its head brings the hit, see sectionHit)
          this.jump = false;
          this.step = 0;
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
      // with spec.seed the noise of the engine and the sound's own random choices are seeded (see below); spec.room
      // false leaves out the reverbs (the convolver of Chrome renders its tail on another thread, not quite the same
      // every time)
      const seeded = (fn) => {
        if (spec.seed == null) return fn();
        const random = Math.random;
        Math.random = makeSeeded(spec.seed);
        try {
          return fn();
        } finally {
          Math.random = random;
        }
      };
      seeded(() => engine.attach(ctx, { room: spec.room !== false }));
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
          // seeded: a comparison of sounds (tests/deep-test.mjs) gives the same result every time (the sounds vary
          // their pitch and noise at random); the whole sound is scheduled right here
          seeded(() => engine.play(spec.id, spec.arg));
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
 The music (3.1.0, reworked in 3.2.0, 3.5.0 and 3.7.0). Every biome has a calm theme ("fight": 16 bars, four chords
 over four bars, four sections of four bars) and a boss track (22 bars: drop 8, variation 8, half-time breakdown 4,
 build 2); the boss track is the dramatic sibling of the calm theme (same key, chords and motif). A track is a tempo, a
 length and a play(engine, c) function that is called for every sixteenth step and schedules that step's notes (see
 SoundEngine.note for the fields of c). Under the notes a track has its atmosphere (MUSIC_BEDS: a soft bed of pink or
 brown noise and tones), which is a loop and no voice of the budget.
 The calm themes belong to their place (the Cryo Vault icy and windy, the Toxin Marsh damp and alive, the Ember Works a
 sleeping factory, Blackout City a noir night in the rain, the Void Core dark and breathing); 3.7.0: the boss tracks
 are cinematic synth (taikos, strings, brass, choir, arpeggios, a pumping sub; no guitars and no cymbals), one style
 per boss. Rules that keep the music cheap and the same everywhere:
 - everything a step schedules is chosen by the step, the chord and the intensity, or by the deterministic hash
   rnd() (never Math.random), so the music is the same with and without a flood of sounds
 - the voices of the music are limited to MAX_MUSIC_VOICES; texture sounds are "opt" voices that the engine sheds
   first (never the kick, bass and chords); the tests check that nothing is ever shed
 - buses: m (music, dry: drums), p (the pump: pads, bass, strings, brass), d (the echo: far away), c (the choir: the
   formants of an "ah"); any voice can send to the room with opts.rev and be panned with opts.pan
 - noises of the music are pink or brown (opts.color), never the white noise of the sounds
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
      // the noises of the music are pink unless they ask for brown (never the white noise of the sounds)
      n: (d, v, o) => e.noise(d, v, { color: "pink", ...o, dest, at: base + ((o && o.at) || 0) }),
    });
  return {
    e,
    at: base,
    m: bus(e.mus),
    p: bus(e.pump),
    d: bus(e.delay),
    c: bus(e.choir),
  };
}
/* the pump: the pads, bass, strings, brass and choir dip to `depth` on an accented kick and come back with `rel` */
const pumpDip = (k, at, depth, rel = 0.09) => {
    const gain = k.e.pump && k.e.pump.gain;
    if (!gain) return;
    const t = k.e.ctx.currentTime + k.at + at;
    gain.setTargetAtTime(depth, t, 0.004);
    gain.setTargetAtTime(1, t + 0.03, rel);
  },
  /* a kick: a sine that drops from f0 to f1; pump dips the pump */
  kick = (k, v, o = {}) => {
    k.m.t(o.f0 || 150, o.dur || 0.14, "sine", v, { to: o.f1 || 42, at: o.at });
    if (o.pump) pumpDip(k, o.at || 0, o.pump, o.rel);
  },
  /* a clap: three quick bursts of pink noise */
  clap = (k, v, o = {}) => {
    k.m.n(0.018, v, { type: "bandpass", f: 1500, q: 1.2, color: "pink", attack: 0.001, at: o.at });
    k.m.n(0.018, v * 0.9, { type: "bandpass", f: 1500, q: 1.2, color: "pink", attack: 0.001, at: (o.at || 0) + 0.012 });
    k.m.n(0.14, v * 0.7, {
      type: "bandpass",
      f: 1400,
      q: 0.9,
      color: "pink",
      at: (o.at || 0) + 0.024,
      rev: o.rev ?? 0.3,
    });
  },
  /* an anvil: a hammer's knock and ringing partials */
  anvil = (k, f, v, pan = 0) => {
    k.m.n(0.06, v * 1.1, { type: "bandpass", f: 2600, q: 1.6, color: "pink", attack: 0.001, pan });
    k.m.t(f, 0.5, "sine", v, { attack: 0.001, pan, rev: 0.25 });
    k.m.t(f * 2.76, 0.3, "sine", v * 0.7, { attack: 0.001, pan });
  },
  /* a metal clang far away: inharmonic partials and a knock */
  clang = (bus, f, v, o = {}) => {
    bus.n(0.04, v * 1.2, { type: "bandpass", f: 3500, q: 2, color: "pink", attack: 0.001, ...o });
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
  /* a vowel: two narrow bands of noise on its formants (whispers, vocal chops) */
  formant = (bus, f1, f2, dur, v, o = {}) => {
    bus.n(dur, v, { type: "bandpass", f: f1, q: 9, color: "pink", ...o });
    bus.n(dur, v * 0.85, { type: "bandpass", f: f2, q: 9, color: "pink", ...o });
  },
  /* a pad: one oscillator per note with a sin^2 swell (padEnv), alternately detuned */
  pad = (bus, notes, dur, v, o = {}) =>
    notes.forEach((n, i) =>
      bus.t(midiToFreq(n), dur, o.wave || "sawtooth", v, {
        lp: o.lp || 1200,
        env: o.trem ? tremoloEnv(o.trem, 0.5, dur, o.fade || 0.3) : padEnv(dur, o.fade || 0.3),
        detune: (i & 1 ? 1 : -1) * (o.det || 0),
        rev: o.rev,
        at: o.at,
      }),
    ),
  /* the instruments of the boss tracks (cinematic synth, see the boss tracks below) */
  /* a taiko: a skin that drops in pitch, the knock of the stick (a short band of brown noise, never a hiss) and the
     room; deep adds the boom of a big drum an octave down */
  taiko = (k, v, o = {}) => {
    const f = o.f || 90,
      dur = o.dur || 0.45;
    k.m.t(f * 1.9, dur, "sine", v, { to: f, at: o.at, pan: o.pan, rev: o.rev ?? 0.35 });
    k.m.n(0.06, v * 0.25, { f: 700, color: "brown", attack: 0.001, at: o.at, pan: o.pan });
    // the boom stays above 44 Hz (phones play nothing lower, and the compressors would pump on it)
    if (o.deep) k.m.t(Math.max(52, f * 0.55), dur * 1.3, "sine", v * 0.7, { to: Math.max(44, f * 0.45), at: o.at });
  },
  /* a frame drum or tom: higher and shorter, with the slap of its skin */
  tom = (k, v, f, o = {}) => {
    k.m.t(f * 1.7, 0.2, "sine", v, { to: f, at: o.at, pan: o.pan, rev: 0.3 });
    k.m.n(0.025, v * 0.5, { type: "bandpass", f: f * 7, q: 1.5, color: "pink", attack: 0.001, at: o.at, pan: o.pan });
  },
  /* a hand drum: the slap of the palm and a short hollow tone */
  slap = (k, v, o = {}) => {
    k.m.n(0.04, v, { type: "bandpass", f: 1700, q: 2.2, color: "pink", attack: 0.001, at: o.at, pan: o.pan });
    k.m.t(330, 0.09, "triangle", v * 0.7, { to: 210, at: o.at, pan: o.pan, rev: 0.2 });
  },
  /* a soft shaker that keeps the time (the boss tracks have no cymbals) */
  shaker = (k, v, pan = 0, at) =>
    k.m.n(0.045, v, { type: "bandpass", f: 5200, q: 1.3, color: "pink", attack: 0.012, pan, at, opt: true }),
  /* a big snare: a body that drops and a band of pink noise in the room */
  bigSnare = (k, v, o = {}) => {
    const bf = o.bf || 200;
    k.m.t(bf, 0.12, "triangle", v, { to: bf * 0.55, at: o.at });
    k.m.n(o.dur || 0.18, v * 0.9, {
      type: "bandpass",
      f: o.f || 1400,
      q: 0.9,
      color: "pink",
      at: o.at,
      rev: o.rev ?? 0.45,
      pan: o.pan,
    });
  },
  /* staccato strings: two saws a few cents apart through a soft low-pass, short; oct adds the octave above, single
     plays one saw (the fast lines of the enrage) */
  strings = (k, midi, v, o = {}) => {
    const f = midiToFreq(midi),
      dur = o.dur || 0.14,
      lp = o.lp || 2200;
    if (o.single) return k.p.t(f, dur, "sawtooth", v * 1.4, { lp, attack: 0.008, at: o.at });
    k.p.t(f, dur, "sawtooth", v, { lp, detune: -7, attack: 0.008, at: o.at, pan: -0.3 });
    k.p.t(f, dur, "sawtooth", v, { lp, detune: 7, attack: 0.008, at: o.at, pan: 0.3 });
    if (o.oct) k.p.t(f * 2, dur, "sawtooth", v * 0.45, { lp, attack: 0.008, at: o.at });
  },
  /* strings in tremolo (a swarm): the notes tremble 13 times a second and swell; lpTo lets them rise */
  swarm = (k, notes, dur, v, o = {}) =>
    notes.forEach((n, i) =>
      k.p.t(midiToFreq(n), dur, "sawtooth", v, {
        lp: o.lp || 1400,
        lpTo: o.lpTo,
        detune: i & 1 ? 9 : -9,
        env: tremoloEnv(13, 0.6, dur, o.fade || 0.5),
        at: o.at,
        rev: 0.3,
      }),
    ),
  /* brass: root, fifth and octave as saws whose low-pass opens like a horn over the note (from lp to lpTo) */
  brass = (k, midi, dur, v, o = {}) => {
    const f = midiToFreq(midi);
    for (const [mul, vol, det] of [
      [1, 1, -6],
      [1.4983, 0.65, 6],
      [2, 0.45, 0],
    ])
      k.p.t(f * mul, dur, "sawtooth", v * vol, {
        lp: o.lp || 300,
        lpTo: o.lpTo || 2400,
        q: 1.2,
        detune: det,
        attack: o.attack || 0.035,
        hold: o.hold ?? dur * 0.45,
        at: o.at,
        rev: o.rev ?? 0.3,
      });
  },
  /* the choir: one voice per note through the "ah" of the choir bus (CHOIR_VOWEL), swelling in and out; the bus sends
     to the room after the vowel (a send of each voice would put a raw saw into the room) */
  choir = (k, notes, dur, v, o = {}) =>
    notes.forEach((n, i) =>
      k.c.t(midiToFreq(n), dur, "sawtooth", v, {
        env: padEnv(dur, o.fade || 0.4),
        detune: i & 1 ? 8 : -8,
        at: o.at,
      }),
    ),
  /* a plucked note in the echo (arpeggios) */
  pluck = (k, midi, v, o = {}) =>
    k.d.t(midiToFreq(midi), o.dur || 0.1, o.wave || "sawtooth", v, {
      lp: o.lp || 2600,
      attack: 0.003,
      at: o.at,
      pan: o.pan,
      rev: o.rev,
    }),
  /* a sub-bass note for chord root `root`: never below 29 (about 44 Hz), so that phones play it */
  subNote = (root) => {
    let base = root - 24;
    return midiToFreq(base < 29 ? base + 12 : base);
  },
  /* the sub bass of a chord, pumped by the kick */
  sub = (k, root, dur, v, o = {}) =>
    k.p.t(subNote(root), dur, "sine", v, { attack: o.attack || 0.01, hold: o.hold ?? dur * 0.6, at: o.at });

/* ---------- the atmospheres ---------- */

/* 3.7.0: the atmospheres hold no white noise any more. They were a one-second loop of white noise, filtered into rain,
   wind, insects and steam; on a phone speaker (nothing below about 200 Hz) that hiss was most of what one heard of a
   calm theme (Cryo Vault about three quarters, Toxin Marsh half, Blackout City a third). Now an atmosphere is a soft
   bed of pink or brown noise well below the music (low rumbles, a gentle band of rain, a wind that sings on the notes
   of the chord) and the sounds of the place are notes of the theme: drops, crickets, embers, ice (see the calm themes).
   gain: the level of the calm atmosphere, boss: the factor under the boss track */
const BED_LEVEL = { fight: 1, boss: 1 },
  MUSIC_BEDS = {
    yard: {
      gain: 0.48,
      boss: 0.4,
      build({ osc, loop, filt, lfo, level }) {
        // rain as a soft band of pink noise that swells and ebbs (the drops are notes of the theme), the far traffic as
        // a low brown rumble, the hum of the dead transformers
        const rain = level(filt("bandpass", 1100, 0.6, loop(1, "pink")), 0.012);
        lfo(0.05, 0.006, rain.gain);
        const traffic = level(filt("lowpass", 320, 0.7, loop(0.8, "brown")), 0.035);
        lfo(0.05, 0.02, traffic.gain);
        level(filt("lowpass", 240, 0.8, osc("sawtooth", 50)), 0.025);
        level(osc("sine", 100), 0.006);
      },
      // 3.4.0: over the boss fight a police helicopter circles (blades: low noise chopped 11 times a second)
      bossExtra({ loop, filt, lfo, level }) {
        const blades = level(filt("lowpass", 380, 1, loop(0.8, "brown")), 0.014);
        lfo(11, 0.012, blades.gain, "square");
        lfo(0.07, 0.005, blades.gain);
      },
    },
    works: {
      gain: 0.7,
      boss: 0.6,
      build({ loop, filt, lfo, level }) {
        // the furnace rumbles and breathes, a dull roar of fire above it (the machines, embers and steam are notes)
        const furnace = level(filt("lowpass", 150, 0.9, loop(0.8, "brown")), 0.05);
        lfo(0.11, 0.018, furnace.gain);
        const roar = level(filt("bandpass", 380, 0.8, loop(1, "pink")), 0.012);
        lfo(0.07, 0.007, roar.gain);
      },
    },
    vault: {
      gain: 0.95,
      boss: 0.6,
      build({ loop, filt, lfo, level, root }) {
        // a wind that sings: pink noise through two narrow band-passes on the root and the fifth two octaves up, which
        // wander a little and come in gusts, over a soft low draught (no broad hiss, no whistle)
        const low = level(filt("lowpass", 520, 0.6, loop(0.9, "pink")), 0.022);
        lfo(0.045, 0.014, low.gain);
        for (const [mul, q, vol, rate, wander] of [
          [4, 24, 0.09, 0.041, 0.07],
          [6, 30, 0.07, 0.029, 0.05],
        ]) {
          const band = filt("bandpass", root * mul, q, loop(1 + mul * 0.02, "pink"));
          lfo(rate * 1.3, root * wander, band.frequency);
          const gust = level(band, vol);
          lfo(rate, vol * 0.75, gust.gain);
        }
      },
    },
    marsh: {
      gain: 0.3,
      boss: 1.4,
      build({ loop, filt, lfo, level }) {
        // murk that wobbles below; the insects and frogs are notes of the theme (crickets as tones)
        const murk = filt("lowpass", 240, 1.8, loop(0.6, "brown"));
        lfo(0.4, 80, murk.frequency);
        level(murk, 0.11);
        const damp = level(filt("bandpass", 600, 0.7, loop(0.9, "pink")), 0.008);
        lfo(0.09, 0.005, damp.gain);
      },
    },
    void: {
      gain: 0.6,
      boss: 0.48,
      build({ osc, loop, filt, lfo, level, root }) {
        // two drones that beat against each other, a dark space wind, a high eerie tone that wavers
        level(osc("sine", root / 4), 0.045);
        level(osc("sine", root / 4 + 0.6), 0.045);
        level(filt("lowpass", 300, 0.7, osc("sawtooth", root / 2 + 0.3)), 0.012);
        const wind = filt("bandpass", 300, 1.1, loop(0.7, "brown"));
        lfo(0.03, 140, wind.frequency);
        level(wind, 0.09);
        const eerie = osc("sine", root * 4);
        lfo(5, 6, eerie.frequency);
        const high = level(eerie, 0.004);
        lfo(0.07, 0.004, high.gain);
      },
    },
  };

/* ---------- calm themes ---------- */

/* 3.5.0: the calm themes all follow the Cryo Vault: no beat at all until the intensity is high (then a slow heartbeat),
   a motif of struck notes in the echo and the room whose pattern changes per section, a soft pad, a deep sub on every
   chord, flakes of texture and the sounds of the place; each biome has an instrument of its own for the motif and its
   own pad. The boss tracks carry the same motif, so that they sound like the same place at its darkest. */
const CALM_MOTIF = ["x..x..x...x..x..", "x.x...x.x...x.x.", "x..x.x...x..x...", "x.x..x.x..x.x..x"],
  /* the instruments of the motif: (bus, frequency, level, options); options.lite leaves out the upper partials */
  VOICE = {
    // Blackout City: an electric piano, a sine with a bright tine that dies quickly
    piano: (bus, f, v, o) => {
      bus.t(f, o.lite ? 0.8 : 1.5, "sine", v, { attack: 0.003, rev: 0.7, ...o });
      if (o.lite) return;
      bus.t(f * 2, 0.6, "sine", v * 0.28, { attack: 0.002, ...o });
      bus.t(f * 7.1, 0.07, "sine", v * 0.12, { attack: 0.001, ...o });
    },
    // Ember Works: a struck pipe, warm and deep, a fifth and a minor tenth above it, a soft knock
    pipes: (bus, f, v, o) => {
      bus.t(f, o.lite ? 0.9 : 2, "sine", v, { attack: 0.002, rev: 0.8, ...o });
      bus.t(f * 1.505, o.lite ? 0.5 : 1.2, "sine", v * 0.45, { attack: 0.002, ...o });
      if (o.lite) return;
      bus.t(f * 2.41, 0.6, "sine", v * 0.2, { attack: 0.002, ...o });
      bus.n(0.03, v * 1.5, { type: "bandpass", f: 900, q: 3, color: "pink", attack: 0.001, ...o });
    },
    // Cryo Vault: ice bells
    ice: (bus, f, v, o) => bell(bus, f, v, o.lite ? 0.7 : 1.4, { rev: 0.7, ...o }),
    // Toxin Marsh: a kalimba, a short triangle with a ping on top and a wooden tick
    kalimba: (bus, f, v, o) => {
      bus.t(f, o.lite ? 0.6 : 1.1, "triangle", v, { attack: 0.002, rev: 0.5, ...o });
      if (o.lite) return;
      bus.t(f * 3.01, 0.18, "sine", v * 0.4, { attack: 0.001, ...o });
      bus.n(0.015, v * 1.2, { type: "bandpass", f: 1800, q: 4, color: "pink", attack: 0.001, ...o });
    },
    // Void Core: glass, two sines that beat slowly and a high inharmonic partial, a lot of room
    glass: (bus, f, v, o) => {
      bus.t(f, o.lite ? 1.2 : 2.6, "sine", v, { attack: 0.004, rev: 0.9, ...o });
      if (o.lite) return;
      bus.t(f * 1.004, 2.6, "sine", v * 0.8, { attack: 0.004, ...o });
      bus.t(f * 2.76, 0.9, "sine", v * 0.25, { attack: 0.002, ...o });
    },
  },
  /* the level of each instrument against the ice bells (the pipes, the kalimba and the glass are softer by nature) */
  VOICE_GAIN = { piano: 1.4, pipes: 1.6, ice: 1, kalimba: 1.5, glass: 1.5 },
  /* the pad of each biome: notes (from the step data), wave, low-pass, fade, detune, room, level, tremolo rate */
  CALM_PAD = {
    yard: {
      notes: (c) => [c.chord[0] + 12, c.chord[1] + 12, c.root + 22],
      wave: "triangle",
      lp: 1500,
      fade: 0.8,
      det: 6,
      rev: 0.7,
      vol: 0.017,
    },
    works: {
      notes: (c) => [c.root - 12, c.root - 5, c.chord[0]],
      wave: "sawtooth",
      lp: 480,
      fade: 0.9,
      det: 5,
      rev: 0.6,
      vol: 0.022,
    },
    vault: {
      notes: (c) => [c.chord[0] + 12, c.chord[2] + 12, c.chord[1] + 24],
      wave: "triangle",
      lp: 2200,
      fade: 0.8,
      det: 6,
      rev: 0.7,
      vol: 0.018,
    },
    marsh: {
      notes: (c) => [c.chord[1], c.chord[2], c.chord[0] + 12],
      wave: "sawtooth",
      lp: 620,
      fade: 0.5,
      det: 9,
      rev: 0.5,
      vol: 0.016,
      trem: 1.1,
    },
    void: {
      notes: (c) => [c.root - 24, c.root - 24, c.root - 17, c.root - 12],
      wave: "sawtooth",
      lp: 360,
      fade: 1.2,
      det: 10,
      rev: 0.6,
      vol: 0.022,
    },
  };
/* the motif of a biome on the chord tones (a fixed walk through them, an octave higher now and then) */
function calmMotif(k, c, voice, v = 1, lite = false) {
  const { b, bar, sec } = c;
  if (!pat(CALM_MOTIF[sec & 3])[b]) return;
  if (lite && R(c, 3) < 0.4) return;
  const n = c.chord[[0, 2, 1, 3, 2, 1, 3][(bar * 7 + b) % 7]] + (R(c, 1) < 0.25 ? 36 : 24);
  VOICE[voice](k.d, midiToFreq(n), 0.045 * v * VOICE_GAIN[voice], { pan: P(c, 2, 0.6), bright: sec >= 2, lite });
}
/* the pad of a biome, one swell per bar on the first step */
function calmPad(k, c, biome) {
  if (c.b !== 0) return;
  const cfg = CALM_PAD[biome];
  pad(k.p, cfg.notes(c), c.barSec + cfg.fade, cfg.vol, cfg);
}
/* the sub of a chord and, when it swells, a heartbeat: two soft thumps */
function calmFloor(k, c, beat) {
  const { b, L, root } = c;
  if (b === 0) k.p.t(subNote(root), c.barSec * 0.95, "sine", 0.08, { attack: 0.3, hold: c.barSec * 0.5 });
  if (L > 0.5 && b === 0) kick(k, 0.3, beat);
  if (L > 0.5 && b === 3) kick(k, 0.18, { ...beat, dur: 0.2 });
  if (L > 0.2 && b % 2 === 1 && R(c, 3) < 0.25 + 0.3 * L)
    k.m.n(0.008, 0.035, { type: "bandpass", f: 5200, q: 1.2, color: "pink", pan: P(c, 4, 0.8), rev: 0.6 });
}

/* Blackout City, 78 BPM, A minor (Am F Dm E): rain on empty streets. An electric piano motif, a soft pad, the sub; a
   far siren, thunder rolling in, radio chatter, rain drops and drips from a gutter (a soft band of rain and the hum of
   dead transformers are the atmosphere) */
function yardCalm(e, c) {
  const { b, bar, L, chord, root } = c,
    k = kit(e, c);
  calmMotif(k, c, "piano");
  calmPad(k, c, "yard");
  calmFloor(k, c, { f0: 100, f1: 40, dur: 0.25 });
  // a soft plucked bass on beat 3 when it swells
  if (L > 0.45 && b === 8) k.p.t(midiToFreq(root - 24 + [0, 7, 3, 7][c.sec]), 0.5, "triangle", 0.07, { lp: 600 });
  if (bar % 8 === 5 && b === 0) {
    k.d.t(640, 0.9, "triangle", 0.012, { to: 960, attack: 0.3, opt: true, rev: 0.7, pan: -0.6 });
    k.d.t(960, 0.9, "triangle", 0.01, { to: 640, at: 0.9, attack: 0.1, opt: true, rev: 0.7, pan: -0.6 });
  }
  if (bar % 8 === 2 && b === 0)
    k.m.n(2.6, 0.009, { f: 200, to: 50, attack: 0.25, q: 0.7, color: "brown", opt: true, rev: 0.3 });
  if (L > 0.3 && b % 2 === 0 && R(c, 5) < 0.05)
    for (let i = 0; i < 4; i++)
      k.d.n(0.05, 0.02, {
        type: "bandpass",
        f: 1400 + R(c, 6 + i) * 1600,
        q: 7,
        color: "pink",
        at: i * 0.07,
        opt: true,
        pan: 0.6,
      });
  if (b % 4 === 2 && R(c, 10) < 0.04) k.m.t(3400, 0.05, "sine", 0.02, { to: 800, opt: true, pan: P(c, 11) });
  // 3.7.0: the rain is drops now (no hiss): small plinks all around, more of them as it swells, and now and then a
  // drip from a gutter on a note of the chord that rings in the echo
  if (R(c, 12) < 0.35 + 0.3 * L) {
    const f = 1500 + R(c, 13) * 1700;
    k.m.t(f, 0.04, "sine", 0.016, { to: f * 0.55, opt: true, pan: P(c, 14, 0.9), rev: 0.25 });
  }
  if (b % 2 === 1 && R(c, 15) < 0.12)
    k.d.t(midiToFreq(chord[(R(c, 16) * 3) | 0] + 36), 0.12, "sine", 0.018, {
      to: midiToFreq(chord[0] + 31),
      opt: true,
      pan: P(c, 17, 0.8),
    });
}

/* Ember Works, 66 BPM, D minor (Dm Bb C Am): a sleeping foundry. A motif of struck pipes, a warm dark pad, the sub;
   in the dark a far anvil, a chain, a breath of steam, crackling embers (the furnace is the atmosphere) */
function worksCalm(e, c) {
  const { b, bar, L, chord } = c,
    k = kit(e, c);
  calmMotif(k, c, "pipes");
  calmPad(k, c, "works");
  // the heartbeat of the works is a piston: a chuff and a low thump
  calmFloor(k, c, { f0: 90, f1: 38, dur: 0.3 });
  if (L > 0.5 && b === 0) k.m.n(0.2, 0.014, { f: 300, to: 80, q: 1.2, color: "brown" });
  if (b === 4 && (bar & 3) === 1) clang(k.m, midiToFreq(chord[0] + 24), 0.04, { rev: 0.8, pan: -0.4 });
  if (L > 0.45 && c.sec >= 2 && b === 12 && (bar & 1) === 0)
    clang(k.m, midiToFreq(chord[2] + 24), 0.028, { rev: 0.8, pan: 0.5 });
  if (L > 0.3 && b === 6 && R(c, 1) < 0.18)
    for (let i = 0; i < 5; i++)
      k.m.n(0.012, 0.035, {
        type: "bandpass",
        f: 4200,
        q: 3,
        color: "pink",
        at: [0, 0.03, 0.063, 0.101, 0.146][i],
        opt: true,
        pan: -0.5,
      });
  // 3.7.0: the steam is a soft breath (no hiss); embers crackle now and then
  if ((bar & 3) === 2 && b === 14)
    k.m.n(0.9, 0.04, {
      type: "bandpass",
      f: 1800,
      to: 900,
      q: 0.8,
      color: "pink",
      attack: 0.08,
      opt: true,
      pan: 0.5,
      rev: 0.3,
    });
  if (R(c, 20) < 0.06 + 0.06 * L)
    for (let i = 0; i < 2; i++)
      k.m.n(0.006, 0.05, {
        type: "bandpass",
        f: 2000 + R(c, 21 + i) * 1500,
        q: 3,
        color: "pink",
        at: i * 0.03 + R(c, 23) * 0.05,
        opt: true,
        pan: P(c, 24, 0.9),
      });
}

/* Cryo Vault, 72 BPM, E minor (Em C G D): an ice cavern. No beat at all until the intensity is high (then a slow
   heartbeat), bells of ice in the echo and the room whose pattern changes per section, a glass pad, a deep sub on
   every chord, ticks of ice, cracks, wind chimes and a creak (a wind that sings on the chord is the atmosphere). The
   model of the other themes. */
const VAULT_CHIME = [76, 79, 81, 83, 86, 88];
function vaultCalm(e, c) {
  const { b, bar, L } = c,
    k = kit(e, c);
  calmMotif(k, c, "ice");
  calmPad(k, c, "vault");
  calmFloor(k, c, { f0: 100, f1: 40, dur: 0.25 });
  if (b % 4 === 2 && R(c, 5) < 0.08) {
    k.m.n(0.02, 0.06, { type: "bandpass", f: 4600, q: 1.4, color: "pink", opt: true, pan: P(c, 6), rev: 0.4 });
    k.m.t(3800, 0.08, "sine", 0.025, { to: 900, opt: true, pan: P(c, 6) });
  }
  if (b % 2 === 0 && b > 0 && R(c, 7) < 0.04 + 0.05 * L)
    bell(k.d, midiToFreq(VAULT_CHIME[(R(c, 8) * 6) | 0]), 0.025, 1.7, { opt: true, rev: 0.5, pan: P(c, 9) });
  if ((bar & 3) === 1 && b === 9 && R(c, 10) < 0.6) {
    k.m.n(0.9, 0.03, { type: "bandpass", f: 260, to: 210, q: 9, color: "pink", attack: 0.3, opt: true });
    k.m.t(78, 0.9, "sawtooth", 0.008, { to: 70, lp: 300, attack: 0.3, opt: true });
  }
}

/* Toxin Marsh, 69 BPM, F minor (Fm Ab Eb Cm): a foggy bayou at night. A kalimba motif, a soft wobbling pad, the sub;
   rising bubbles, frog croaks, mud squelches, crickets (the murk is the atmosphere) */
function marshCalm(e, c) {
  const { b, bar, L } = c,
    k = kit(e, c);
  calmMotif(k, c, "kalimba");
  calmPad(k, c, "marsh");
  calmFloor(k, c, { f0: 115, f1: 40, dur: 0.24 });
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
    k.m.n(0.16, 0.026, { f: 900, to: 150, q: 7, color: "brown", opt: true, pan: -0.4 });
    k.m.t(180, 0.14, "sine", 0.06, { to: 55, opt: true, pan: -0.4 });
  }
  // 3.7.0: the insects are crickets now (no buzzing band of noise): short trains of chirps on a high tone, here and
  // there in the dark, more of them as it swells
  if (b % 2 === 0 && R(c, 12) < 0.12 + 0.12 * L) {
    const f = 4000 + R(c, 13) * 900,
      pan = P(c, 14, 0.9),
      n = 2 + ((R(c, 15) * 3) | 0);
    for (let i = 0; i < n; i++) k.m.t(f, 0.022, "sine", 0.009, { at: i * 0.055, opt: true, pan, rev: 0.3 });
  }
}

/* Void Core, 60 BPM, F# minor (F#m D A E): dark and breathing. A glass motif, low detuned drones as the pad, the sub;
   a reversed swell before every fourth bar, whispers, long pings far away (the beating drones, the space wind and the
   eerie tone are the atmosphere) */
const VOID_FORMANTS = [
  [700, 1200],
  [300, 2300],
  [500, 1800],
];
function voidCalm(e, c) {
  const { b, bar, L, chord } = c,
    k = kit(e, c);
  calmMotif(k, c, "glass");
  calmPad(k, c, "void");
  calmFloor(k, c, { f0: 90, f1: 32, dur: 0.35 });
  if ((bar & 3) === 3 && b === 6) {
    k.m.n(1.6, 0.05, { type: "bandpass", f: 500, to: 2600, q: 0.9, color: "pink", attack: 1.45, opt: true });
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
  if (b === 11 && L > 0.4) k.p.t(midiToFreq(c.root - 17), 0.3, "sawtooth", 0.07, { lp: 380 });
}

/* ---------- boss tracks ---------- */

/* 3.7.0: the boss tracks were metal (double-tracked distorted guitars, blast beats, crash and china cymbals); in
   WebAudio the guitars were a fizz and the cymbals a hiss. They are cinematic synth now: taikos and big drums, staccato
   strings, brass that opens like a horn, a choir, arpeggios, a sub bass that pumps with the kick, and no cymbal at all
   (soft shakers keep the time). Each boss has a style of its own, and each track still carries the motif of its biome
   on the instrument of the calm theme, so a boss sounds like its place at its darkest. The sections stay: drop (bars
   0-7), variation (8-15), breakdown (16-19), build (20-21); a section opens with a deep taiko and a brass swell. */
function bossSection(bar) {
  return bar < 8 ? 0 : bar < 16 ? 1 : bar < 20 ? 2 : 3;
}
/* the hit at the head of the variation, the breakdown and every new round of the drop */
function sectionHit(k, c) {
  if (c.b !== 0 || !(c.bar === 8 || c.bar === 16 || (c.bar === 0 && c.cycle > 0))) return;
  taiko(k, 0.5, { f: 64, deep: true, dur: 0.7, rev: 0.6 });
  brass(k, c.root - 12, c.barSec * 0.9, 0.035, { lp: 200, lpTo: 1600 });
}
/* the build (bars 20 and 21): a taiko roll that thickens (eighths, then sixteenths) and swells */
function buildRoll(k, c, f = 110) {
  const n = (c.bar - 20) * 16 + c.b;
  if (c.bar === 20 ? c.b % 2 === 0 : c.b < 15) taiko(k, 0.12 + 0.3 * (n / 32), { f: f + n * 1.5, dur: 0.25, rev: 0.3 });
}
/* the riser of the build: two saws that glide up an octave while their filter opens, over a soft swell of pink noise */
function buildRiser(k, c) {
  if (c.bar !== 20 || c.b !== 0) return;
  const d = c.barSec * 2;
  for (const [semi, v] of [
    [0, 0.03],
    [7, 0.022],
  ])
    k.p.t(midiToFreq(c.root + semi), d, "sawtooth", v, {
      to: midiToFreq(c.root + semi + 12),
      lp: 500,
      lpTo: 4200,
      attack: d * 0.92,
      opt: true,
    });
  k.m.n(d, 0.035, { type: "bandpass", f: 300, to: 2400, q: 0.8, color: "pink", attack: d * 0.95, opt: true });
}

/* Blackout City boss (The Warden), 128 BPM, A minor (Am F Dm E): a cyberpunk chase. Drop: four on the floor that pumps a
   rolling sixteenth synth bass (root and octave), taikos on the off-beats, a big snare on 2 and 4, shakers, the siren of
   the calm theme as a gliding lead, the electric piano motif, staccato strings in the second half; variation: brass
   stabs on the chords, a sixteenth arpeggio in the echo, the choir in its last four bars; breakdown: half time, the
   choir and the piano, big taikos, a police siren far away; build: taiko roll, the bass climbs, riser */
const CHASE_BASS = ["x.xxx.xxx.xxx.xx", "xxxxx.xxxxxx.xxx"],
  CHASE_OCT = [0, 12, 0, 0, 12, 0, 0, 12, 0, 0, 12, 0, 0, 12, 0, 12];
function yardBoss(e, c) {
  const { b, bar, sec, root, chord } = c,
    k = kit(e, c);
  if (sec <= 2) calmMotif(k, c, "piano", sec === 2 ? 1.4 : 1.6, sec !== 2);
  sectionHit(k, c);
  if (sec <= 1) {
    if (b % 4 === 0) kick(k, 0.5, { f0: 150, f1: 45, dur: 0.16, pump: 0.5, rel: 0.11 });
    if (b === 4 || b === 12) bigSnare(k, 0.2, { f: 1500, bf: 190 });
    if (b === 10 || (b === 6 && (bar & 1) === 1)) taiko(k, 0.32, { f: 85, pan: b === 6 ? -0.3 : 0.3 });
    if (b % 4 === 2) shaker(k, 0.05, 0.4);
    else if (b % 2 === 1) shaker(k, 0.022, -0.4);
    if (pat(CHASE_BASS[sec])[b]) {
      k.p.t(midiToFreq(root - 24 + CHASE_OCT[b]), 0.11, "sawtooth", 0.06, { lp: 900, lpTo: 380, q: 2.5 });
      if (b % 4 === 0) sub(k, root, 0.2, 0.14);
    }
    // the siren of the calm theme as a lead: up and down a minor third, every second bar
    if (sec === 0 && (bar & 1) === 1 && (b === 0 || b === 8)) {
      const lo = midiToFreq(chord[0] + 24),
        hi = midiToFreq(chord[0] + 27);
      k.d.t(b === 0 ? lo : hi, c.barSec * 0.48, "square", 0.02, {
        to: b === 0 ? hi : lo,
        lp: 2400,
        attack: 0.03,
        rev: 0.3,
      });
    }
    if (sec === 0 && bar >= 4 && b % 2 === 0) strings(k, chord[[0, 2, 1, 2][(b >> 1) & 3]] + 12, 0.022, { lp: 1800 });
    if (sec === 1) {
      if (b === 0 || b === 10) brass(k, chord[0], b === 0 ? 0.5 : 0.3, 0.032, { lp: 400, lpTo: 2600, hold: 0.12 });
      const p = arpPatterns[(bar + 1) % 4];
      pluck(k, chord[p[b % p.length]] + 24, 0.022, { pan: b % 2 ? 0.4 : -0.4 });
      if (bar >= 12 && b === 0) choir(k, [chord[0] + 12, chord[2] + 12], c.barSec, 0.03);
    }
  } else if (sec === 2) {
    if (b === 0) {
      taiko(k, 0.55, { f: 70, deep: true, dur: 0.7 });
      sub(k, root, 1.2, 0.24);
      choir(k, [chord[0] + 12, chord[1] + 12, chord[2] + 12], c.barSec + 0.4, 0.03);
    }
    if (b === 8) bigSnare(k, 0.26, { f: 1300, bf: 170, dur: 0.28, rev: 0.8 });
    if (b === 6 || b === 14) taiko(k, 0.25, { f: 100, pan: b === 6 ? -0.4 : 0.4 });
    if (b % 4 === 2) shaker(k, 0.03, 0.3);
    // a police siren far away
    if (bar === 17 && b === 0) {
      k.d.t(640, 1.1, "triangle", 0.014, { to: 960, attack: 0.4, rev: 0.7, pan: -0.6, opt: true });
      k.d.t(960, 1.1, "triangle", 0.012, { to: 640, attack: 0.1, rev: 0.7, pan: -0.6, at: 1.1, opt: true });
    }
  } else {
    buildRoll(k, c, 100);
    if (b % 4 === 0) kick(k, 0.32 + 0.1 * (bar - 20), { f0: 150, f1: 45, dur: 0.14 });
    k.p.t(midiToFreq(root - 24 + Math.floor(((bar - 20) * 16 + b) / 2)), 0.09, "sawtooth", 0.05, { lp: 1200, q: 2 });
    buildRiser(k, c);
  }
}

/* Ember Works boss (The Crucible), 104 BPM, D minor (Dm Bb C Am): the forge. Drop: a taiko ensemble (deep drums on 1,
   the "and" of 2 and 3, middle drums answering, a run of small drums into every second bar), hammer blows on an anvil
   on 2 and 4, a low string ostinato, a brass swell every second bar, the struck pipes of the calm theme; variation: the
   brass walks the chord, small drums on the off-beats, the choir; breakdown: the choir, the anvil alone on every beat,
   a deep drum, a low brass pedal; build: the drums roll, the strings climb, the brass rises, riser */
const FORGE_DEEP = "x.....x...x.....",
  FORGE_MID = "...x....x....x..",
  FORGE_OSTINATO = [0, 0, 7, 0, 0, 7, 0, 12, 0, 0, 7, 0, 3, 5, 7, 10];
function worksBoss(e, c) {
  const { b, bar, sec, root, chord } = c,
    k = kit(e, c);
  if (sec <= 2) calmMotif(k, c, "pipes", 1.7, sec !== 2);
  sectionHit(k, c);
  if (sec <= 1) {
    if (pat(FORGE_DEEP)[b]) taiko(k, 0.5, { f: 72, deep: b === 0, pan: b === 6 ? -0.3 : b === 10 ? 0.3 : 0 });
    if (pat(FORGE_MID)[b]) taiko(k, 0.3, { f: 115, dur: 0.3, pan: 0.35 });
    if (b >= 12 && (bar & 1) === 1) tom(k, 0.1 + 0.04 * (b - 12), 160 + (b - 12) * 20, { pan: -0.4 + (b - 12) * 0.25 });
    if (b === 4 || b === 12) anvil(k, midiToFreq(chord[0] + 24), 0.07, b === 4 ? -0.3 : 0.3);
    if (b === 0) {
      kick(k, 0.4, { f0: 120, f1: 40, dur: 0.2, pump: 0.45 });
      sub(k, root, c.barSec * 0.9, 0.16);
    }
    if (b % 2 === 0) strings(k, root - 12 + FORGE_OSTINATO[b], 0.03, { lp: 1100, dur: 0.16 });
    // (not on the head of a section: its hit brings a brass swell of its own)
    if (b === 0 && (bar & 1) === 0 && bar % 8 !== 0)
      brass(k, root - 12, c.barSec * 1.5, 0.04, { lp: 200, lpTo: 2000, attack: 0.08 });
    if (b % 4 === 2) shaker(k, 0.03, 0.4);
    if (sec === 1) {
      if (b % 4 === 0)
        brass(k, chord[[0, 2, 1, 3][b >> 2]] + ((bar & 1) === 1 ? 12 : 0), 0.32, 0.026, {
          lp: 600,
          lpTo: 2800,
          hold: 0.1,
        });
      if (b % 2 === 1 && bar >= 12) tom(k, 0.08, 130, { pan: b % 4 === 1 ? -0.5 : 0.5 });
      if (bar >= 12 && b === 0) choir(k, [chord[0], chord[2]], c.barSec, 0.034);
    }
  } else if (sec === 2) {
    if (b === 0) {
      taiko(k, 0.55, { f: 66, deep: true, dur: 0.8 });
      choir(k, [chord[0], chord[1], chord[2]], c.barSec + 0.4, 0.034);
      brass(k, root - 24, c.barSec, 0.03, { lp: 180, lpTo: 900, attack: 0.2 });
    }
    if (b % 4 === 0) anvil(k, midiToFreq(chord[0] + 24), 0.06, (b - 6) / 8);
    if (b === 8) bigSnare(k, 0.2, { f: 1100, bf: 150, dur: 0.3, rev: 0.8 });
  } else {
    buildRoll(k, c, 90);
    if (b % 2 === 0) strings(k, root - 12 + Math.floor(((bar - 20) * 16 + b) / 4), 0.032, { lp: 1400 });
    if (bar === 20 && b === 0)
      brass(k, root - 12, c.barSec * 2, 0.04, { lp: 200, lpTo: 4000, attack: c.barSec * 1.6, hold: c.barSec * 0.3 });
    buildRiser(k, c);
  }
}

/* Cryo Vault boss (Frost Prism), 138 BPM, E minor (Em C G D): ice trance. Drop: a soft four on the floor that pumps
   everything, the bass on the off-beats, a glassy arpeggio in the echo, the ice bell melody, a clap on 2 and 4, shakers,
   a pumping pad; variation: the choir sings the chords, a lead doubles the bell melody, strings in eighths; breakdown:
   no beat, the choir, the bells and the arpeggio behind a closed filter, a gust of wind; build: the clap rolls, the
   kick doubles, riser */
const VAULT_MEL = [76, 79, 83, 81, 79, 76, 74, 76, 72, 76, 79, 78, 74, 78, 81, 79],
  ICE_ARP = [0, 1, 2, 3, 2, 1, 2, 3];
function vaultBoss(e, c) {
  const { b, bar, sec, root, chord } = c,
    k = kit(e, c),
    mel = VAULT_MEL[((bar & 3) * 4 + (b >> 2)) % 16];
  if (sec <= 2) calmMotif(k, c, "ice", 1.3, sec !== 2);
  sectionHit(k, c);
  if (sec <= 1) {
    if (b % 4 === 0) kick(k, 0.45, { f0: 130, f1: 44, dur: 0.18, pump: 0.4, rel: 0.12 });
    if (b % 4 === 2) k.p.t(midiToFreq(root - 12), 0.16, "sawtooth", 0.05, { lp: 600, q: 1.5 });
    if (b === 4 || b === 12) clap(k, 0.07);
    shaker(k, b % 2 ? 0.018 : 0.032, b % 4 < 2 ? -0.4 : 0.4);
    pluck(k, chord[ICE_ARP[b % 8]] + 24 + (b >= 8 && sec === 1 ? 12 : 0), 0.02, {
      wave: "triangle",
      lp: 4000,
      pan: b % 2 ? 0.5 : -0.5,
    });
    if (b % 4 === 0) bell(k.d, midiToFreq(mel), 0.045, 0.9, { rev: 0.5, bright: sec === 1 });
    if (b === 0) {
      pad(k.p, [chord[0] + 12, chord[2] + 12], c.barSec + 0.2, 0.014, {
        wave: "sawtooth",
        lp: 1600,
        fade: 0.2,
        det: 9,
      });
      sub(k, root, c.barSec * 0.9, 0.12);
    }
    if (sec === 1) {
      if (b === 0) choir(k, [chord[0] + 12, chord[1] + 12], c.barSec + 0.3, 0.03);
      if (b % 4 === 0) k.d.t(midiToFreq(mel - 12), 0.3, "square", 0.016, { lp: 2600, attack: 0.01, rev: 0.3 });
      if (b % 2 === 0) strings(k, chord[(b >> 1) % 3] + 12, 0.018, { lp: 2600 });
    }
  } else if (sec === 2) {
    if (b === 0) {
      choir(k, [chord[0] + 12, chord[1] + 12, chord[2] + 12], c.barSec + 0.4, 0.03);
      sub(k, root, c.barSec, 0.16);
    }
    if (b % 4 === 0) bell(k.d, midiToFreq(mel), 0.05, 1.2, { rev: 0.6, bright: true });
    pluck(k, chord[ICE_ARP[b % 8]] + 24, 0.016, { wave: "triangle", lp: 900 });
    if (b === 0 && (bar & 1) === 0)
      k.m.n(c.barSec * 1.8, 0.05, {
        type: "bandpass",
        f: 400,
        to: 1600,
        q: 1,
        color: "pink",
        attack: c.barSec,
        hold: 0.3,
        opt: true,
        rev: 0.3,
      });
  } else {
    const n = (bar - 20) * 16 + b;
    if (bar === 20 ? b % 4 === 0 : b % 2 === 0) kick(k, 0.4, { f0: 130, f1: 44, dur: 0.16 });
    if (bar === 21 || b % 2 === 0) clap(k, 0.025 + 0.06 * (n / 32));
    pluck(k, chord[ICE_ARP[b % 8]] + 24 + Math.floor(n / 8), 0.02, { wave: "triangle", lp: 1200 + n * 90 });
    buildRiser(k, c);
  }
}

/* Toxin Marsh boss (Hive Queen), 116 BPM, F minor (Fm Ab Eb Cm): tribal and acid. Drop: deep drums every six
   sixteenths over the four of the bar (three against four), hand drums answering, small drums as ghosts, an acid bass
   (a resonant filter that squelches on its accents), the kalimba motif, swarm strings (tremolo) every second bar;
   variation: the acid plays every sixteenth and opens up, the choir chants, shakers in sixteenths; breakdown: a deep
   drum, the swarm rises, bubbles and squelches, the kalimba; build: the hand drums roll, the acid opens, riser */
const TRIBE_DEEP = "x.....x.....x...",
  TRIBE_HAND = "...x.....x.....x",
  TRIBE_GHOST = "..x.x...x.x...x.",
  ACID = [0, 0, 12, 0, 3, 0, 15, 0, 0, 12, 0, 10, 0, 7, 12, 3],
  ACID_ACCENT = "x...x.x...x..x..";
function marshBoss(e, c) {
  const { b, bar, sec, root, chord } = c,
    k = kit(e, c),
    acid = (open) => {
      const accent = pat(ACID_ACCENT)[b],
        note = root - 24 + ACID[b],
        f = midiToFreq(note < 29 ? note + 12 : note);
      k.p.t(f, accent ? 0.2 : 0.12, "sawtooth", accent ? 0.06 : 0.045, {
        lp: accent ? 1400 + open : 450 + open * 0.3,
        lpTo: 220,
        q: 9,
      });
    };
  if (sec <= 2) calmMotif(k, c, "kalimba", 1.7, sec !== 2);
  sectionHit(k, c);
  if (sec <= 1) {
    if (pat(TRIBE_DEEP)[b]) taiko(k, 0.45, { f: 78, deep: b === 0, pan: b === 6 ? -0.25 : b === 12 ? 0.25 : 0 });
    if (pat(TRIBE_HAND)[b]) slap(k, 0.12, { pan: 0.4 });
    if (pat(TRIBE_GHOST)[b]) tom(k, 0.06, 180 + (b % 3) * 30, { pan: -0.4 });
    if (b === 0) {
      kick(k, 0.3, { f0: 120, f1: 42, dur: 0.18, pump: 0.5 });
      sub(k, root, c.barSec * 0.9, 0.14);
    }
    if (sec === 1 || b % 2 === 0) acid(sec === 1 ? 900 : 0);
    if (b === 0 && (bar & 1) === 0) swarm(k, [chord[0] + 12, chord[2] + 12], c.barSec * 2, 0.016);
    if (sec === 1) {
      shaker(k, b % 2 ? 0.018 : 0.03, b % 4 < 2 ? -0.5 : 0.5);
      if (b === 0) choir(k, [chord[0], chord[2]], c.barSec, 0.03);
    }
  } else if (sec === 2) {
    if (b === 0) {
      taiko(k, 0.5, { f: 70, deep: true, dur: 0.8 });
      sub(k, root, c.barSec, 0.18);
      if ((bar & 1) === 0)
        swarm(k, [chord[0] + 12, chord[1] + 12, chord[2] + 12], c.barSec * 2, 0.016, { lp: 700, lpTo: 2800 });
    }
    if (pat(TRIBE_HAND)[b]) slap(k, 0.08, { pan: -0.3 });
    if (b % 2 === 0 && R(c, 1) < 0.25) {
      const f = 200 + R(c, 2) * 400;
      k.m.t(f, 0.09, "sine", 0.04, { to: f * 1.9, opt: true, pan: P(c, 3, 0.8) });
    }
    if (b === 6 && (bar & 1) === 1) {
      k.m.n(0.16, 0.03, { f: 900, to: 150, q: 7, color: "brown", opt: true, pan: -0.4 });
      k.m.t(180, 0.14, "sine", 0.07, { to: 55, opt: true, pan: -0.4 });
    }
  } else {
    const n = (bar - 20) * 16 + b;
    if (bar === 20 ? b % 2 === 0 : true) slap(k, 0.05 + 0.12 * (n / 32), { pan: b % 2 ? 0.4 : -0.4 });
    if (b % 4 === 0) taiko(k, 0.3, { f: 80 });
    acid(n * 60);
    buildRiser(k, c);
  }
}

/* Void Core boss (Rift Core), 172 BPM, F# minor (F#m D A E): the finale, drum and bass with a choir. Drop: a breakbeat
   (kick on 1 and the "and" of 3, snare on 2 and 4, ghost snares), a reese bass (two saws a little apart under a
   low-pass) that pumps, the choir sings the chords, the glass motif; variation: the motifs of the other biomes come
   back, one bar each (electric piano, struck pipes, ice bells, kalimba), over the break with brass stabs; breakdown:
   half time, the choir alone with the glass, a deep drum, a heartbeat; build: the snare rolls, the choir climbs,
   riser */
const BREAK_K = ["x.........x.....", "x.........x..x.."],
  BREAK_GHOST = "......x..x....x.",
  QUOTES = ["piano", "pipes", "ice", "kalimba"];
function voidBoss(e, c) {
  const { b, bar, sec, root, chord } = c,
    k = kit(e, c),
    q = bar & 3;
  // the glass rings long: at 172 BPM always the short (lite) form
  if (sec === 0 || sec === 2) calmMotif(k, c, "glass", 1.6, true);
  else if (sec === 1) calmMotif(k, c, QUOTES[q], 1.6, true);
  sectionHit(k, c);
  if (sec <= 1) {
    if (pat(BREAK_K[q === 3 ? 1 : 0])[b]) kick(k, 0.5, { f0: 160, f1: 44, dur: 0.14, pump: 0.5 });
    if (b === 4 || b === 12) bigSnare(k, 0.2, { f: 1700, bf: 230, dur: 0.12, rev: 0.25 });
    else if (pat(BREAK_GHOST)[b] && R(c, 1) < 0.6) bigSnare(k, 0.05, { f: 1900, bf: 250, dur: 0.06, rev: 0.1 });
    shaker(k, b % 2 ? 0.018 : 0.03, P(c, 2, 0.6));
    if (b === 0 && (bar & 1) === 0)
      for (const det of [-12, 12])
        k.p.t(midiToFreq(root - 24), c.barSec * 2 + 0.1, "sawtooth", 0.05, {
          lp: 380,
          detune: det,
          attack: 0.02,
          hold: c.barSec * 1.6,
        });
    if (b === 0) choir(k, [chord[0] + 12, chord[1] + 12], c.barSec + 0.2, 0.028);
    if (sec === 1 && (b === 0 || b === 6 || b === 10))
      brass(k, chord[0], 0.22, 0.026, { lp: 700, lpTo: 2600, hold: 0.08 });
  } else if (sec === 2) {
    if (b === 0) {
      taiko(k, 0.55, { f: 62, deep: true, dur: 0.9 });
      choir(k, [chord[0] + 12, chord[1] + 12, chord[2] + 12], c.barSec + 0.5, 0.028);
      sub(k, root, c.barSec, 0.2);
    }
    if (b === 0 || b === 3) kick(k, b === 0 ? 0.4 : 0.25, { f0: 110, f1: 36, dur: 0.22 });
    if (b === 8) bigSnare(k, 0.24, { f: 1500, dur: 0.3, rev: 0.8 });
  } else {
    const n = (bar - 20) * 16 + b;
    if (bar === 20 ? b % 2 === 0 : b < 15)
      bigSnare(k, 0.05 + 0.15 * (n / 32), { f: 1600 + n * 20, dur: 0.07, rev: 0.2 });
    if (b % 4 === 0) kick(k, 0.4, { f0: 160, f1: 44, dur: 0.14 });
    if (b === 0) choir(k, [root + 12 + (bar - 20) * 5, root + 19 + (bar - 20) * 5], c.barSec, 0.03, { fade: 0.2 });
    buildRiser(k, c);
  }
}

/* what a phase change (heat 1) and the enrage (heat 2) add to every boss track: shakers on the off sixteenths and a
   taiko on the last beat; enraged: staccato strings in sixteenths on the root, a brass stab every second beat and a
   rising line of strings every fourth bar */
function bossHeatLayer(e, c) {
  const k = kit(e, c);
  if (c.b % 2 === 1) shaker(k, 0.025, c.b % 4 === 1 ? 0.5 : -0.5);
  if (c.b === 12 && c.sec !== 2) taiko(k, 0.3, { f: 100, pan: 0.2 });
  if (c.heat >= 2) {
    if (c.sec !== 2) strings(k, c.root - 12 + (c.b % 4 === 3 ? 12 : 0), 0.02, { dur: 0.09, lp: 1600, single: true });
    // (not on the head of a section: its own brass swell plays there)
    if (c.b % 8 === 0 && !(c.b === 0 && c.bar % 8 === 0))
      brass(k, c.chord[0] + 12, 0.25, 0.022, { lp: 900, lpTo: 3000, hold: 0.06 });
    if (c.b === 0 && (c.bar & 3) === 0)
      k.p.t(midiToFreq(c.root + 12), c.barSec, "sawtooth", 0.014, {
        to: midiToFreq(c.root + 24),
        lp: 2500,
        attack: c.barSec * 0.8,
        opt: true,
      });
  }
}

/* 3.7.0: the hit when the boss track starts on the spot: a deep taiko in the room, a sub that drops, a brass swell from
   below and a short choir (the crash of the metal tracks was a burst of hiss). The last hit when the boss is dead: a
   deep taiko, the brass on the root with a major third (the victory), a choir and the instrument of the biome once
   more. A phase change or the enrage jumps to the head of the drop, whose own hit (sectionHit) marks it. */
const BIOME_VOICE = { yard: "piano", works: "pipes", vault: "ice", marsh: "kalimba", void: "glass" };
function musicImpact(e, biome, at) {
  const root = (musicChords[biome] || musicChords.yard)[0][0],
    k = kit(e, { at });
  taiko(k, 0.7, { f: 58, deep: true, dur: 1.2, rev: 0.8 });
  k.m.t(95, 1.4, "sine", 0.45, { to: 28 });
  brass(k, root - 12, 1.6, 0.05, { lp: 180, lpTo: 2200, attack: 0.05, hold: 0.5, rev: 0.5 });
  choir(k, [root, root + 7, root + 12], 1.6, 0.03, { fade: 0.15 });
}
function musicResolve(e, biome, at) {
  const root = (musicChords[biome] || musicChords.yard)[0][0],
    k = kit(e, { at });
  // short: the music fades out over 0.9 s and the calm theme (minor) comes back; a long major third would clash
  taiko(k, 0.6, { f: 60, deep: true, dur: 1.1, rev: 0.9 });
  brass(k, root - 12, 1.2, 0.04, { lp: 300, lpTo: 2000, attack: 0.04, hold: 0.5, rev: 0.6 });
  k.p.t(midiToFreq(root + 4), 1.2, "sawtooth", 0.026, { lp: 300, lpTo: 2000, attack: 0.04, hold: 0.5, rev: 0.6 });
  choir(k, [root + 12, root + 16, root + 19], 1.2, 0.03, { fade: 0.3 });
  VOICE[BIOME_VOICE[biome] || "piano"](k.d, midiToFreq(root + 24), 0.06, { rev: 0.8, at: 0.3, lite: true });
}
/* the intensity of a preview: it swells and falls over the 16 bars, so that the quiet and the full side of a calm
   theme can both be heard */
function previewLevel(bar) {
  return 0.3 + 0.65 * (0.5 - 0.5 * Math.cos(((bar % 16) / 16) * 2 * Math.PI));
}

const MUSIC_TRACKS = {
  yard: {
    fight: { bpm: 78, bars: 16, swing: 0, gain: 1, play: yardCalm },
    boss: { bpm: 128, bars: 22, swing: 0, gain: 1.25, play: yardBoss },
  },
  works: {
    fight: { bpm: 66, bars: 16, swing: 0, gain: 1, play: worksCalm },
    boss: { bpm: 104, bars: 22, swing: 0, gain: 1, play: worksBoss },
  },
  vault: {
    fight: { bpm: 72, bars: 16, swing: 0, gain: 1, play: vaultCalm },
    boss: { bpm: 138, bars: 22, swing: 0, gain: 1, play: vaultBoss },
  },
  marsh: {
    fight: { bpm: 69, bars: 16, swing: 0, gain: 1, play: marshCalm },
    boss: { bpm: 116, bars: 22, swing: 0, gain: 1, play: marshBoss },
  },
  void: {
    fight: { bpm: 60, bars: 16, swing: 0, gain: 1, play: voidCalm },
    boss: { bpm: 172, bars: 22, swing: 0, gain: 1, play: voidBoss },
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
    "stun",
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
  // 3.9.0: the sounds of the place
  for (const placeId of PLACE_IDS) add("place:" + placeId, { id: "place", arg: { id: placeId } });
  ids(["stun"], "riftburst");
  ids(["combo"], 6);
  ids(["surge"], 1);
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
  for (const id of ["elite", "rain", "blackout", "meltdown", "whiteout", "bloom", "riftstorm"]) ids(["event"], id);
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
