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
const RL_ESHOT_VOICE = {
  sniper: "snipe",
  turret: "eshotTurret",
  drone: "eshotDrone",
  boss: "eshotBoss",
  // 3.16.0: the weaver's rift shards and the carrier's homing pods
  weaver: "eshotWeaver",
  carrier: "eshotCarrier",
};
/* 3.16.0: the shots of each boss sound like what they are (eshotBoss stays for a boss without a voice of its own) */
const BOSS_ESHOT = {
  warden: "eshotWarden",
  queen: "eshotQueen",
  core: "eshotCore",
  prism: "eshotPrism",
  forge: "eshotForge",
  kingpin: "eshotKingpin",
};
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
  kingpin: "bWind",
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
  // 3.49.0: the Ash Tyrant's attacks (the cinder fan's eshots sound themselves; the charge and the
  // molotovs are covered by their own events)
  barrage: null,
  lastcall: "bSummon",
  // 3.56.0: the Glasswyrm's attacks (the rise's and mirage's blinkWarn/blink and thud sound
  // themselves, the lance's beamWarn does; the shard fans get the lance voice)
  rise: null,
  shards: "bLance",
  sunlance: null,
  mirage: null,
  // 3.3.0: the Overdrive attacks (they also sound the Overdrive alarm, bOverdrive)
  lockdown: "bLance",
  whiteout: "bNova",
  plague: "bSummon",
  collapse: "bRain",
  noon: "bRain",
};
// 3.33.0: the warning voice of a beam by its skin (the rest keep "beam" / "beamSmall")
const BEAM_VOICE = { cryo: "bwCryo", acid: "bwAcid", flame: "bwFlame", sun: "bwFlare" };
const RL_OVERDRIVE = new Set(["lockdown", "meltdown", "whiteout", "plague", "collapse", "lastcall", "noon"]);
/* 3.10.0: the voice of the blast of an attack zone, by its kind and, where the kind is shared, its maker (the same
   choice as the look in render/attacks-view.js); null: the generic explosion ("boom"). 3.32.0: a blast that chills (a
   Frost mortar's shell) cracks like ice whatever its kind */
function attackVoice(kind, src, biome, chill) {
  if (chill) return "aIce";
  switch (kind) {
    case "stomp":
    case "drill":
      return "aQuake";
    case "slag":
      return "aLava";
    case "frost":
    case "glacier":
      return "aIce";
    case "fire":
      return "aFire";
    case "shorted":
      return "aShort";
    case "mortar":
      return src === "forge" ? "aLava" : null;
    case "rain": {
      const who = src || { marsh: "queen", void: "core", club: "kingpin" }[biome];
      return who === "forge"
        ? "aLava"
        : who === "queen"
          ? "aAcid"
          : who === "core"
            ? "aRift"
            : who === "kingpin"
              ? "aFire"
              : null;
    }
    default:
      return null;
  }
}
const BOSS_ROOT = { warden: 45, forge: 38, prism: 52, queen: 41, core: 42, kingpin: 43, wyrm: 47 },
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
    // 3.47.0: the Kingpin: a smooth saw with a slow growl, the motif walks root - fifth - flat
    // seventh - octave (a man who owns the room)
    kingpin: { wave: "sawtooth", lp: 1100, det: 12, motif: [0, 7, 10, 12], gap: 0.09, chord: [0, 7, 10, 15] },
    // 3.56.0: the Glasswyrm: a glassy triangle with a wide detune (light through a flawed pane), the
    // motif rises root - fifth - octave - tenth (it comes up from below)
    wyrm: { wave: "triangle", lp: 5200, det: 22, motif: [0, 7, 12, 16], gap: 0.085, chord: [0, 4, 9, 14] },
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
    aQuake: 0.1,
    aRift: 0.1,
    aLava: 0.08,
    aIce: 0.08,
    guardBreak: 0.08,
    thud: 0.08,
    singCollapse: 0.1,
    bcHammer: 0.1,
    bcImplode: 0.1,
    tsCrusher: 0.08,
    tsRift: 0.08,
    bSlam: 0.08,
    rail: 0.06,
    scatter: 0.05,
    rocket: 0.05,
    tribute: 0.08,
  },
  /* 3.2.0: the room of the big sounds (send level to the sound reverb); its size follows the biome (SFX_ROOM_BIOME).
     The trap strikes stay dry: they have to be told apart from the blasts at once. */
  SFX_ROOM = {
    boom: 0.3,
    surge: 0.3,
    singCollapse: 0.35,
    singPull: 0.25,
    bcHammer: 0.3,
    bcImplode: 0.3,
    bcCage: 0.15,
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
    aQuake: 0.3,
    aLava: 0.25,
    aIce: 0.35,
    aAcid: 0.15,
    aRift: 0.35,
  },
  /* how much room each biome gives the sounds: the Aurora Shelf and the Shattered Core are vast, the Glowmarsh damp;
     3.49.0: the Ashfall Caldera is a crater bowl (rock all around) */
  SFX_ROOM_BIOME = { yard: 0.28, vault: 0.5, marsh: 0.2, void: 0.55, club: 0.32, flats: 0.3 },
  /* the open "ah" of the choir: band-passes on its formants (frequency, Q, level) and a little of the voice */
  CHOIR_VOWEL = [
    [760, 5, 1],
    [1180, 7, 0.6],
    [2700, 9, 0.18],
    [0, 0.7, 0.12],
  ],
  AMBIENCE_LEVEL = { blackout: 0.07, whiteout: 0.085, bloom: 0.06, riftstorm: 0.055, raid: 0.07 },
  /* 3.43.0: the room tone of each biome - the steady bed under everything, wherever the game is (home,
     upgrade, pause, fight). The events pile onto it: the whiteout storm rises out of the vault's calm wind.
     3.45.5: raised so the place stays audible while the music plays (the mix note above); the vault needs the
     most, its events are the sparsest. */
  ROOM_TONE_LEVEL = { yard: 0.038, vault: 0.046, marsh: 0.036, void: 0.038, club: 0.04, flats: 0.034 },
  /* 3.43.0: the event beds gather and pass instead of snapping on and off - a storm builds over about
     three seconds and dies away over about four, while the room tone stays underneath. */
  BED_ATTACK = { blackout: 0.6, whiteout: 1.2, bloom: 0.8, riftstorm: 1.2, raid: 1.0 },
  BED_RELEASE = { blackout: 0.5, whiteout: 1.4, bloom: 0.7, riftstorm: 1.1, raid: 0.9 },
  // 3.9.0: the default of the Ambience slider; at it the atmospheres of the music play at the level they had before
  AMB_REF = 0.8,
  /* 3.45.5: the mix balance (measured with scripts/rl-mix-probe.mjs, rms of 20 s offline renders at the default
     volumes). Before: the fight music sat 2 dB under the short-term level of the shots (it masked them) and the
     boss tracks towered 6.7 dB OVER the fight (the effects drowned). Now the music scale sits the fight theme
     clearly under the shots and the boss tracks keep their heat without the wall. The place is not lifted on the
     bus - the deep-test catalog caps the place sounds against single shots (3.13.0) and the beds already sat at
     two thirds of the cap - the room tone and the steady beds get louder instead (see ROOM_TONE_LEVEL and the
     bed levels in audio/place.js): the constant layers of the place are what the music must not hide. */
  MUSIC_SCALE = 0.44,
  MAX_VOICES = 24,
  // 2.8.2: the music has its own budget; shots and other sounds can no longer take notes away from it
  // 3.2.0: 36 (was 20): the boss tracks double-track their guitars (two amps) and play blast beats; 3.5.0: 44, they
  // also carry the motif and the pad of the calm theme
  MAX_MUSIC_VOICES = 44,
  MUSIC_RESERVE = 8,
  // 3.18.1: how long the notes of the old track take to fade out when the track changes (SoundEngine.quietOld)
  QUIET_FADE = 0.25,
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
  // 3.47.0: the stage pyro: gas hisses into the nozzle, then a golden burst
  pyro: { warn: "tcPyro", fire: "tsPyro" },
  // 3.53.0: the Flats' sunspike: glass creaks as the pressure builds, then the sheet bursts
  sunspike: { warn: "tcSun", fire: "tsSun" },
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
  beamWarn: [{}, { small: true }, { skin: "cryo" }, { small: true, skin: "acid" }, { small: true, skin: "flame" }],
  blink: [{}],
  blinkWarn: [{}],
  block: [{}],
  boom: [
    { kind: "boom" },
    { kind: "stomp", r: 4.8 },
    { kind: "slag", r: 1.4 },
    { kind: "glacier", r: 2.3 },
    { kind: "rain", src: "queen", r: 1.5 },
    { kind: "rain", src: "core", r: 2.2 },
    { kind: "fire", r: 1 },
    { kind: "mortar", src: "mortar", r: 2, chill: true },
    { kind: "shorted", src: "grunt", r: 1.6 },
  ],
  boss: [
    { id: "warden" },
    { id: "forge" },
    { id: "prism" },
    { id: "queen" },
    { id: "core" },
    { id: "kingpin" },
    { id: "wyrm" },
  ],
  bossAtk: [
    { id: "warden", atk: "ring" },
    { id: "kingpin", atk: "summon" },
  ],
  bossDown: [{ id: "warden" }, { id: "wyrm" }],
  bounce: [{}],
  bountyPulse: [{}],
  chain: [{}],
  champion: [{}],
  championDown: [{}],
  charge: [{ type: "brute" }],
  chill: [{}],
  stun: [{ skin: "plate" }, { skin: "riftburst" }],
  shortArm: [{ r: 1.6 }],
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
  enrage: [{ id: "warden" }, { id: "wyrm" }],
  erupt: [{}],
  // 3.53.0: a dust devil of the Flats bears down on the player
  devilNear: [{}],
  eshot: [
    { type: "gunner" },
    { type: "gunner", frost: true },
    { type: "turret" },
    { type: "drone" },
    { type: "boss" },
    { type: "sniper" },
    { type: "boss", boss: "warden" },
    { type: "boss", boss: "queen" },
    { type: "boss", boss: "core" },
    { type: "weaver" },
    { type: "carrier" },
    { type: "boss", boss: "kingpin" },
  ],
  freeze: [{}],
  fuse: [{}],
  guardBreak: [{}],
  guardUp: [{}],
  hatch: [{}, { big: true }],
  heal: [{}],
  maxed: [{ heal: 30, shards: 12 }],
  step: [
    { ground: "asphalt", foot: 0, v: 6 },
    { ground: "ice", foot: 1, v: 6 },
  ],
  land: [{ ground: "grate" }],
  lockdown: [{ r: 3.2 }],
  lockOn: [{ r: 3.2, n: 3 }],
  hammerReady: [{}],
  shatter: [{ r: 0.5 }],
  broodHatch: [{}],
  implode: [{ r: 9, t: 0.35 }],
  singularity: [{}],
  singOpen: [{ r: 5.8, dur: 1.5 }],
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
  "splinterHit", // 3.15.0: a Shard Field splinter hitting, covered by "dmg" and the shatter
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
  // 3.18.1: its own seeded noise (it was made from Math.random at the first use, so every run had another room and the
  // numbers of the deep test moved a little from run to run); the same kind of noise, the same for everyone
  let len = Math.round(ctx.sampleRate * seconds),
    random = makeSeeded(0x2b00 + Math.round(seconds * 100)),
    buf = (impulseCache[key] = ctx.createBuffer(2, len, ctx.sampleRate));
  for (let ch = 0; ch < 2; ch++) {
    let data = buf.getChannelData(ch),
      lp = 0;
    for (let i = 0; i < len; i++) {
      let t = i / len,
        a = 0.55 + 0.42 * t;
      lp = lp * a + (random() * 2 - 1) * (1 - a);
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
  // 3.18.1: seeded for the same reason as the room (roomImpulse)
  const len = Math.round(ctx.sampleRate * 6),
    fadeN = Math.round(ctx.sampleRate * 0.05),
    raw = new Float32Array(len + fadeN),
    random = makeSeeded(color === "brown" ? 0xb2057 : 0x91c4);
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
    const w = random() * 2 - 1;
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
    // 3.53.0: the Glass Flats: D A Bm G - bright open noon chords (the Crucible's own root, D, was
    // kept in BOSS_ROOT through the foundry's retirement)
    flats: [
      [50, "M"],
      [45, "M"],
      [47, "m"],
      [43, "M"],
    ],
    // 3.4.0: Blackout City: Am F Dm E (the E major pulls back to A minor: film noir)
    yard: [
      [57, "m"],
      [53, "M"],
      [50, "m"],
      [52, "M"],
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
    // 3.49.0: the Ashfall Caldera: Gm Eb F D (the D major pulls back to G minor: the mountain's
    // own fanfare, the same trick as the City and the old Club)
    club: [
      [43, "m"],
      [39, "M"],
      [41, "M"],
      [38, "M"],
    ],
  },
  musicVoices = {
    yard: { arp: "square", bass: "sawtooth", lp: 2200, lead: "triangle" },
    vault: { arp: "sine", bass: "triangle", lp: 4200, lead: "sine" },
    void: { arp: "square", bass: "sawtooth", lp: 3e3, lead: "square" },
    marsh: { arp: "triangle", bass: "sawtooth", lp: 1200, lead: "triangle" },
    club: { arp: "square", bass: "sawtooth", lp: 1500, lead: "sawtooth" },
    flats: { arp: "sine", bass: "triangle", lp: 3800, lead: "sine" },
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
      // 3.43.1: a bed whose build threw once is not rebuilt every tick (3.46.0: the value is the
      // audio time of the failure, so the bed gets one more try after 10 s)
      this.deadBeds = Object.create(null);
      // 3.46.0: same rule for the room tone (startTone)
      this.deadTone = Object.create(null);
      // 3.46.0: audio time of the last failed track start (syncTrack backs off 2 s before retrying)
      this.trackFailT = 0;
      this.schedFails = 0;
      this.liveT = -1e9;
      this.speed = null;
      this.amb = null;
      this.accentT = 0;
      this.accentFlip = false;
      // 2.9.0: music ducking and counters of the music notes (the tests check that none is dropped)
      this.duckGain = null;
      this.duckT = -1e9;
      this.duckDepth = 0;
      // 3.48.0: the last tick of every slider preview, per bus (see previewBus)
      this.previewT = {};
      this.musicScheduled = 0;
      this.musicSkipped = 0;
      // 3.1.0: the music tracks (see MUSIC_TRACKS): what plays now, the boss heat (0 calm, 1 after a phase change,
      // 2 enraged), the stage buses and the counters of the voice budget
      this.playKind = "off";
      this.playBiome = "yard";
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
      this.ping = null;
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
      try {
        this.buildGraph(ctx);
      } catch (err) {
        // 3.46.0: a half-built graph is worse than none (a missing bus would make every later
        // call throw): drop it so the next gesture retries init() from scratch, and close the
        // context. buildGraph sets this.ctx first, so it has to be cleared again here.
        this.ctx = null;
        try {
          ctx.close();
        } catch {}
        throw err;
      }
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
      // 3.42.0: the muffle: a lowpass between the buses and the limiter. A Whiteout closes it so the whole
      // world (shots, music, wind) sounds like behind a wall of snow; every other state keeps it open.
      this.muffle = ctx.createBiquadFilter();
      this.muffle.type = "lowpass";
      this.muffle.frequency.value = 18000;
      this.muffle.Q.value = 0.3;
      this.comp.disconnect();
      this.comp.connect(this.muffle);
      this.muffle.connect(this.limiter);
      this.sfx = ctx.createGain();
      this.sfx.gain.value = this.sfxVol;
      this.sfx.connect(this.comp);
      this.ambBus = ctx.createGain();
      this.ambBus.gain.value = this.ambVol;
      // 3.43.0: the room gives way to the big hits a little deeper than the music does (duck)
      this.ambDuck = ctx.createGain();
      this.ambBus.connect(this.ambDuck);
      this.ambDuck.connect(this.comp);
      // 3.2.0: mus is the input of the music at unity; its volume is musLevel at the end of the music chain, so that
      // the glue compressor works the same at every volume setting
      this.mus = ctx.createGain();
      this.musLevel = ctx.createGain();
      this.musLevel.gain.value = this.musVol * MUSIC_SCALE;
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
        // 3.46.0: two rooms built once and swapped (quietOld used to build a fresh convolver —
        // megabytes of impulse transform — on every track change). Both share one impulse.
        let impulse = roomImpulse(ctx, 2);
        this.verbPool = [];
        for (let i = 0; i < 2; i++) {
          let v = ctx.createConvolver();
          v.buffer = impulse;
          let vo = ctx.createGain();
          vo.gain.value = i === 0 ? 0.5 : 0;
          this.verbIn.connect(v);
          v.connect(vo);
          vo.connect(this.mus);
          this.verbPool.push({ conv: v, out: vo });
        }
        // 3.18.1: kept so that a track change can swap the room for a fresh one (quietOld)
        this.verb = this.verbPool[0].conv;
        this.verbOut = this.verbPool[0].out;
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
      // 3.19.0: the ping-pong echo of the ambient bloom (BLOOM): two delays that feed each other, one heard on the left
      // and one on the right, so that every note of the bloom wanders across the room; it ends in the music bus
      if (ctx.createStereoPanner) {
        this.ping = ctx.createGain();
        const dl = ctx.createDelay(1),
          dr = ctx.createDelay(1),
          fl = ctx.createGain(),
          fr = ctx.createGain(),
          pl = ctx.createStereoPanner(),
          pr = ctx.createStereoPanner();
        dl.delayTime.value = 0.43;
        dr.delayTime.value = 0.43;
        fl.gain.value = fr.gain.value = 0.42;
        pl.pan.value = -0.9;
        pr.pan.value = 0.9;
        this.ping.connect(this.mus);
        this.ping.connect(dl);
        dl.connect(pl);
        pl.connect(this.mus);
        dl.connect(fl);
        fl.connect(dr);
        dr.connect(pr);
        pr.connect(this.mus);
        dr.connect(fr);
        fr.connect(dl);
        // 3.28.1: the feedback of the echo, silenced for a moment when the music changes (quietOld)
        this.pingFb = [fl, fr];
      }
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
      this.musLevel.gain.setTargetAtTime(music * MUSIC_SCALE, now, 0.1);
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
              // 3.46.0: detached now — these used to rely on GC and piled up on Safari.
              // Never in the offline renders: there the whole graph is rendered after the
              // scheduling pass, so a detached voice's window would never sound at all.
              try {
                if (!this.offline && music[i].node) music[i].node.disconnect();
              } catch {}
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
            // 3.46.0: detached now — these used to rely on GC and piled up on Safari
            // (never offline: the render happens after the scheduling pass — see claim)
            try {
              if (!this.offline && list[i].node) list[i].node.disconnect();
            } catch {}
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
        // 3.46.0: detached now — the stolen voice used to rely on GC (piled up on Safari)
        // (never offline: the render happens after the scheduling pass — see claim)
        if (!this.offline) {
          old.node.disconnect();
          old.amp.disconnect();
        }
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
      this.makeup.gain.setValueAtTime(boss ? 1.3 : 1.1, now);
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
        bus:
          dest === this.delay
            ? "d"
            : dest === this.pump
              ? "p"
              : dest === this.choir
                ? "c"
                : dest === this.ping
                  ? "b"
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
    /* 3.48.0: the volume sliders of the Settings let the ear check what they set: every bus answers with
       one real sound of the game on that bus, at the level the slider just put in. Effects fire the shot
       of the weapon in hand, music plays the arrival braam of the biome, the ambience sounds one far
       voice of the place. A short throttle per bus keeps a drag from machine-gunning the sample, and the
       usual gates apply (no live context or a muted bus: nothing sounds, nothing throws). */
    previewBus(bus, weapon) {
      if (!this.live()) return;
      // the gate comes first: a muted bus answers nothing and its throttle stays clean, so turning
      // the volume back up is heard at once
      if (bus === "sfx" && this.sfxVol <= 0) return;
      if (bus === "music" && this.musVol <= 0) return;
      if (bus === "ambience" && this.ambVol <= 0) return;
      let now = this.nowT(),
        gap = bus === "music" ? 0.5 : 0.22;
      if (now - (this.previewT[bus] ?? -1e9) < gap) return;
      this.previewT[bus] = now;
      try {
        if (bus === "sfx") this.play(weapon || "pulse");
        else if (bus === "music") musicImpact(this, this.wantBiome(), 0);
        else if (bus === "ambience") this.placePlay(AMB_PREVIEW[this.wantBiome()] || "sparks", { g: 1, pan: 0 });
      } catch (err) {
        this.fail(err);
      }
    }
    /* 2.9.0: a light sidechain: the music gain dips by `depth` (at most 15 %) for about 80 ms and comes back
     (time constant 70 ms), so that a big hit is heard over the music. Nothing is stopped or skipped. */
    duck(depth) {
      let gain = this.duckGain;
      if (!gain) return;
      let now = this.ctx.currentTime;
      // 3.43.1: inside the gate a deeper press still goes through (a nova right after a boom used
      // to be swallowed whole); an equal or lighter one changes nothing, like before
      if (now - this.duckT < 0.1 && depth <= this.duckDepth) return;
      this.duckT = now;
      this.duckDepth = depth;
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setTargetAtTime(1 - Math.min(0.15, depth), now, 0.012);
        gain.gain.setTargetAtTime(1, now + 0.08, 0.07);
      } catch {}
      // 3.43.0: the room is pressed down a little deeper than the music, so a blast feels like it takes
      // the air of the place with it
      if (this.ambDuck) {
        let room = this.ambDuck.gain;
        room.cancelScheduledValues(now);
        room.setTargetAtTime(1 - Math.min(0.4, depth * 2.4), now, 0.014);
        room.setTargetAtTime(1, now + 0.1, 0.3);
      }
    }
    _play(id, arg) {
      let pitch = 1 + (Math.random() - 0.5) * 0.08;
      switch (id) {
        // 2.9.0: seven weapons, seven sound families (waveform, pitch range, envelope, tail)
        case "pulse":
          // 3.42.0: from the bright arcade "pew" (1500 Hz falling sine + square edge) to a weighty
          // "thoom": the drop an octave lower, a soft noise transient instead of the square, a sub thump
          if (this.gate(id, 0.06)) {
            this.tone(640 * pitch, 0.09, "sine", 0.055, { to: 170 });
            this.noise(0.05, 0.028, { type: "bandpass", f: 1400, q: 1.2, attack: 0.001 });
            this.tone(110 * pitch, 0.08, "sine", 0.04, { to: 48 });
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
          // 3.42.0: the crackle leaves the dog-whistle range (2.6-5.8 kHz squares -> 0.7-1.6 kHz, low-passed
          // hard) and a low arc hum carries it, so the arc sounds like current, not like a fly
          if (this.gate(id, 0.06)) {
            this.tone(700 + Math.random() * 500, 0.03, "square", 0.022, { lp: 2600 });
            this.tone(1000 + Math.random() * 600, 0.03, "square", 0.018, { at: 0.03, lp: 2600 });
            this.noise(0.09, 0.05, { type: "bandpass", f: 3200, q: 4 });
            this.tone(58, 0.14, "sine", 0.05, { to: 40 });
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
          // disc launcher: a metallic "shing" (two inharmonic partials, 3.42.0: an octave lower) and a
          // heavier two-note wub of the spinning blade
          if (this.gate(id, 0.1)) {
            this.tone(830 * pitch, 0.18, "sine", 0.04);
            this.tone(1395, 0.14, "sine", 0.024);
            this.tone(190 * pitch, 0.07, "triangle", 0.08, { to: 320 });
            this.tone(320 * pitch, 0.08, "triangle", 0.065, { to: 190, at: 0.06 });
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
        // ---- 3.17.0: the walker. A footstep of the ground it comes down on (arg.ground), short and quiet (they come up to
        // six a second), a faint servo whine in each; the landing after a dash is the same, heavier, with a thump ----
        case "step":
        case "land": {
          const land = id === "land",
            g = (arg && arg.ground) || "asphalt",
            pan = land ? 0 : arg && arg.foot ? 0.12 : -0.12,
            k = land ? 2.2 : 1;
          if (!this.gate(id, land ? 0.15 : 0.11)) break;
          const n = (dur, vol, o) => this.noise(dur, vol * k, { pan, ...o }),
            t = (f, dur, wave, vol, o) => this.tone(f * pitch, dur, wave, vol * k, { pan, ...o });
          switch (g) {
            case "grate":
              // a steel foot on a grating: a clank with an inharmonic ring
              t(210, 0.06, "square", 0.03, { lp: 1800, to: 150 });
              t(590, 0.07, "sine", 0.012);
              n(0.03, 0.03, { type: "bandpass", f: 2400, q: 4 });
              break;
            case "frost":
              // frozen ground and snow: a crunch of three short grains and a dull thud
              [0, 0.018, 0.04].forEach((at) => n(0.022, 0.035, { type: "bandpass", f: 2800 + at * 4e3, q: 1.2, at }));
              t(110, 0.07, "sine", 0.05, { to: 70 });
              break;
            case "ice":
              // a sheet of ice: a glassy scrape that slides and a tick
              n(0.1, 0.03, { type: "bandpass", f: 4200, to: 2600, q: 2, color: "pink" });
              t(1800, 0.025, "sine", 0.015, { to: 1300 });
              t(95, 0.06, "sine", 0.03, { to: 65 });
              break;
            case "mud":
              // the marsh: a wet squelch and a bubble
              n(0.09, 0.05, { type: "bandpass", f: 500, to: 260, q: 3, color: "brown" });
              t(120, 0.08, "sine", 0.038, { to: 70 });
              t(300, 0.04, "sine", 0.015, { at: 0.05, to: 600 });
              break;
            case "glass":
              // the Shattered Core: a glassy tick over a low hum
              t(1700, 0.035, "sine", 0.024, { to: 1100, rev: 0.3 });
              t(2600, 0.02, "sine", 0.012, { at: 0.004 });
              n(0.015, 0.02, { type: "highpass", f: 6e3 });
              break;
            case "crust":
              // 3.49.0: the cracked crust: a dry crunch with a low crumble under it
              n(0.05, 0.032, { type: "bandpass", f: 1500, to: 800, q: 1.1, color: "pink" });
              t(96, 0.06, "triangle", 0.03, { to: 62 });
              break;
            case "sandglass":
              // 3.53.0: the Flats: sand over sheet glass - a dry hiss and a squeak of glass under it
              n(0.07, 0.03, { type: "bandpass", f: 2200, to: 1200, q: 1.4, color: "pink" });
              t(2100, 0.045, "sine", 0.012, { to: 2700, at: 0.02 });
              t(88, 0.06, "triangle", 0.026, { to: 56 });
              break;
            case "acid":
              // in an acid pool: a splash with a sizzle
              n(0.15, 0.04, { type: "bandpass", f: 2600, to: 1400, q: 1.2, color: "pink" });
              t(220, 0.07, "sine", 0.035, { to: 120 });
              break;
            default:
              // wet asphalt: a soft slap, now and then a splash
              n(0.05, 0.03, { type: "bandpass", f: 900, to: 500, q: 1, color: "pink" });
              t(140, 0.05, "sine", 0.034, { to: 90 });
              if (Math.random() < 0.35) n(0.06, 0.012, { type: "highpass", f: 3500 });
          }
          // the servo of the leg
          n(0.05, 0.012, { type: "bandpass", f: 1500, to: 2500, q: 5, at: 0.02 });
          if (land) t(70, 0.18, "sine", 0.14, { to: 38 });
          break;
        }
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
        // ---- 3.16.0: the boss shots, each its own (a volley of rings or a fan, so each is one sound per volley) ----
        case "eshotWarden":
          // the Warden: a riot gun's hard crack with an electric snap and a short siren chirp up a minor third
          if (this.gate(id, 0.1)) {
            this.tone(110, 0.18, "sine", 0.2, { to: 55 });
            this.noise(0.07, 0.12, { type: "bandpass", f: 1800, q: 1.2 });
            this.tone(2400, 0.05, "square", 0.02, { lp: 5e3, to: 1200 });
            this.tone(640, 0.09, "sawtooth", 0.025, { at: 0.03, lp: 2400 });
            this.tone(760, 0.12, "sawtooth", 0.025, { at: 0.12, lp: 2400 });
          }
          break;
        case "eshotQueen":
          // the Hive Queen: a wet spit, a gurgle and the buzz of the swarm in it
          if (this.gate(id, 0.1)) {
            this.tone(220, 0.16, "sine", 0.14, { to: 90 });
            this.noise(0.12, 0.1, { type: "bandpass", f: 900, to: 400, q: 2 });
            this.hum(180, 0.22, "sawtooth", 0.02, { lp: 900, wob: { rate: 70, depth: 25 } });
          }
          break;
        case "eshotCore":
          // the Rift Core: a hollow glassy pulse that bends down, with a reversed shimmer before it
          if (this.gate(id, 0.1)) {
            this.noise(0.1, 0.05, { type: "bandpass", f: 3e3, to: 6e3, q: 3, attack: 0.09 });
            this.tone(70, 0.3, "sine", 0.18, { at: 0.08, to: 40 });
            this.tone(880, 0.3, "sine", 0.04, { at: 0.08, to: 620 });
            this.tone(1320, 0.22, "sine", 0.025, { at: 0.08, to: 930 });
          }
          break;
        case "eshotPrism":
          // the Frost Prism: a cold crystal chime over a soft thump
          if (this.gate(id, 0.1)) {
            this.tone(95, 0.16, "sine", 0.16, { to: 50 });
            [1, 2.76, 5.4].forEach((m, i) => this.tone(1180 * m, 0.25 - i * 0.05, "sine", 0.035 / (i + 1)));
            this.noise(0.05, 0.05, { type: "highpass", f: 5e3 });
          }
          break;
        case "eshotWeaver":
          // the weaver: three glassy zips through a narrow band, quickly one after another
          if (this.gate(id, 0.1)) {
            [0, 0.04, 0.08].forEach((at, i) =>
              this.noise(0.05, 0.05, { type: "bandpass", f: 2600 + i * 500, to: 5200, q: 6, at }),
            );
            this.tone(1500, 0.12, "triangle", 0.02, { to: 2300 });
          }
          break;
        case "eshotCarrier":
          // the carrier: three pods leave their tubes with a hollow pop and a short rocket hiss
          if (this.gate(id, 0.1)) {
            [0, 0.05, 0.1].forEach((at) => this.tone(190, 0.08, "sine", 0.08, { at, to: 110 }));
            this.noise(0.3, 0.05, { type: "bandpass", f: 1400, to: 3200, q: 1, at: 0.04, attack: 0.03 });
          }
          break;
        case "eshotForge":
          // the Crucible: a heavy glob of slag thrown out, a low roar and a hiss
          if (this.gate(id, 0.1)) {
            this.tone(75, 0.3, "sine", 0.22, { to: 40 });
            this.noise(0.22, 0.1, { type: "lowpass", f: 1200, to: 300 });
            this.noise(0.35, 0.03, { type: "highpass", f: 3e3, at: 0.05, attack: 0.05 });
          }
          break;
        case "eshotKingpin":
          // the Tyrant: a dry, hard crack of a molten slug with a heavier thump under it - no siren, no
          // shimmer, just the gun
          if (this.gate(id, 0.1)) {
            this.tone(120, 0.2, "sine", 0.2, { to: 60 });
            this.noise(0.05, 0.14, { type: "bandpass", f: 2400, q: 1.6 });
            this.tone(1750, 0.06, "square", 0.018, { lp: 4200, to: 900 });
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
          // 3.42.0: a warm low blip instead of the 1.8 kHz tick
          this.tone(900, 0.035, "triangle", 0.035);
          break;
        case "event":
          this.eventCue(arg);
          break;
        case "devilNear":
          // 3.53.0: a dust devil bears down on the player: a rising wind that howls past (the event's
          // own position pans it, like every world event's voice)
          if (this.gate(id, 0.3)) {
            const f = 500 + Math.random() * 260;
            this.noise(1.1, 0.09, { type: "bandpass", f, to: f * 1.9, q: 1.6, color: "pink", attack: 0.35 });
            this.noise(0.8, 0.05, { type: "bandpass", f: f * 2.6, to: f * 3.4, q: 3, at: 0.1 });
            this.tone(84, 0.9, "sawtooth", 0.02, { lp: 380, attack: 0.4 });
          }
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
        case "tribute":
          // 3.49.0: the Tyrant's Tithe: two embers crack and a small chime rings out
          this.tone(1720, 0.1, "sine", 0.045, { lp: 6e3 });
          this.tone(2280, 0.16, "sine", 0.04, { at: 0.07, lp: 7e3 });
          this.noise(0.03, 0.035, { type: "bandpass", f: 3200, q: 2.2 });
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
          // tiny swarmers: a bubble that drops fast (3.42.0: half the pitch, less bird-like)
          if (this.gate(id, 0.03)) {
            this.tone(560 * pitch, 0.08, "sine", 0.05 * size, { to: 160 });
            this.noise(0.025, 0.035, { type: "highpass", f: 3500 });
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
          // short circuit: the power sags away, two soft ticks and a dying hum (3.42.0: everything an octave
          // lower and low-passed harder, so machines die with a growl, not a whistle; the hum keeps the family
          // far from the metal clang next door)
          if (this.gate(id, 0.035)) {
            this.tone(1200 * pitch, 0.2, "sawtooth", 0.05 * size, { to: 70, lp: 1100 });
            this.tone(64, 0.24, "sine", 0.09, { to: 38 });
            this.tone(430, 0.025, "square", 0.024, { lp: 1400, at: 0.05 });
            this.tone(560, 0.025, "square", 0.02, { lp: 1400, at: 0.09 });
            this.noise(0.05, 0.04, { type: "bandpass", f: 1800, q: 3 });
          }
          break;
        case "dGhost":
          // ghostly: a detuned pair of sines falling slowly, a thin sigh of noise, no hard edge at all
          // (3.42.0: the pair starts an octave lower, so the fall ends inside the mix instead of above it)
          if (this.gate(id, 0.04)) {
            this.tone(1300 * pitch, 0.34, "sine", 0.04 * size, { to: 180, attack: 0.05 });
            this.tone(1312 * pitch, 0.34, "sine", 0.03, { to: 172, attack: 0.05 });
            this.noise(0.28, 0.035, { type: "bandpass", f: 2400, to: 600, q: 8, attack: 0.06 });
          }
          break;
        case "dClang":
          // metal: a ringing triangle pair and a short low knock (3.42.0: the ring a fourth lower)
          if (this.gate(id, 0.035)) {
            this.tone(830 * pitch, 0.24, "triangle", 0.05 * size);
            this.tone(1210 * pitch, 0.18, "triangle", 0.032);
            this.tone(110, 0.12, "sine", 0.09, { to: 55 });
            this.noise(0.03, 0.05, { type: "bandpass", f: 2400 });
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
          // glass: a burst of noise and three random chimes (3.42.0: the whole thing an octave lower)
          if (this.gate(id, 0.04)) {
            this.noise(0.22, 0.08 * size, { type: "highpass", f: 2600, attack: 0.001 });
            for (let i = 0; i < 3; i++) {
              this.tone((1600 + Math.random() * 1600) * pitch, 0.07, "sine", 0.024, { at: 0.02 + i * 0.035 });
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
            // 3.17.0: the shell cracks first
            this.noise(0.03, 0.06, { type: "bandpass", f: 3000, q: 3 });
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
        // 3.33.0: the voices of the beams by their skin (the size is 0.6 for a sentinel's, 1 for a boss's)
        case "bwCryo":
          // a lance of ice: a glassy shimmer that rises, crackling frost, and a cold hollow tone underneath
          if (this.gate(id, 0.2)) {
            this.tone(1500, 0.55, "sine", 0.03 * size, { to: 3800, attack: 0.12 });
            this.tone(2250, 0.5, "triangle", 0.014 * size, { to: 5200, attack: 0.18 });
            this.noise(0.45, 0.05 * size, { type: "highpass", f: 5200, to: 2600, attack: 0.1 });
            this.tone(190, 0.6, "sine", 0.05 * size, { to: 260, attack: 0.2 });
          }
          break;
        case "bwAcid":
          // a jet of bile: a wet gurgle that builds into a hiss
          if (this.gate(id, 0.2)) {
            this.tone(140, 0.5, "sawtooth", 0.075 * size, { to: 70, lp: 600, attack: 0.1 });
            this.noise(0.55, 0.13 * size, { type: "bandpass", f: 900, to: 3200, q: 2, attack: 0.25 });
            this.tone(420, 0.3, "sine", 0.045 * size, { to: 900, attack: 0.05 });
          }
          break;
        case "bwFlame":
          // a flame jet lighting: a soft whump and a rushing roar
          if (this.gate(id, 0.2)) {
            this.tone(110, 0.3, "sine", 0.095 * size, { to: 55 });
            this.noise(0.6, 0.085 * size, { type: "lowpass", f: 600, to: 1800, attack: 0.15 });
          }
          break;
        case "bwFlare":
          // 3.56.0: the Glasswyrm's sun lance: the noon bends - a bright shimmer that leans up, a
          // hot band of air, and a low swell under it (light, not fire)
          if (this.gate(id, 0.2)) {
            this.tone(2100, 0.5, "sine", 0.028 * size, { to: 4400, attack: 0.1 });
            this.tone(3150, 0.45, "sine", 0.016 * size, { to: 5200, attack: 0.16 });
            this.noise(0.6, 0.055 * size, { type: "bandpass", f: 3600, to: 6200, q: 1.6, attack: 0.14 });
            this.tone(120, 0.6, "sine", 0.06 * size, { to: 180, attack: 0.22 });
          }
          break;
        case "eshotFrost":
          // the glassy chime on a Frost enemy's shot
          if (this.gate(id, 0.08)) {
            this.tone(2600 * pitch, 0.18, "sine", 0.022, { to: 2300 });
            this.tone(3900 * pitch, 0.12, "triangle", 0.01, { to: 3500 });
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
            this.tone(880, 0.035, "sine", 0.016);
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
    /* 3.0.0: the sounds of the gadget (3.12.0: the Singularity) and of the traps (see RL_TRAP_SOUND for the event mapping).
     Every biome has its own timbre: the Yard plate zaps, the Works crusher slams metal, the Vault ice
     cracks, the Marsh geyser gurgles, the Void sigil implodes. The warnings rise (charge) and end where
     the strike begins; strikes are loud but never reach full scale; the beams hum until they end. */
    trapSound(id, arg) {
      let r = Math.random,
        pitch = 1 + (r() - 0.5) * 0.06;
      // the time of a warning (arg: seconds, or {delay, dur} for a beam), kept within what the tests render
      let d = Math.max(0.3, Math.min(1.6, (arg && arg.delay) || arg || 1));
      switch (id) {
        // ---- 3.12.0: the Singularity (it replaced the grenade) ----
        case "singThrow":
          // a quick flick: an airy sweep up, a glassy chirp and a soft push of the hand
          if (this.gate(id, 0.1)) {
            this.noise(0.18, 0.1, { type: "bandpass", f: 600, to: 3200, q: 1.4, attack: 0.04 });
            this.tone(900, 0.12, "sine", 0.04, { to: 1900 });
            this.tone(2800, 0.06, "sine", 0.02, { at: 0.05, to: 3600 });
            this.tone(130, 0.1, "sine", 0.12, { to: 75 });
          }
          break;
        case "singPull":
          // the rift opens and pulls for 1.5 s: a suction that rises, a low hum that swells and wobbles, a thin whine
          // that climbs towards the collapse
          if (this.gate(id, 0.2)) {
            this.noise(1.45, 0.11, { type: "bandpass", f: 260, to: 1500, q: 1.6, attack: 0.9 });
            this.tone(52, 1.45, "sine", 0.13, { to: 78, attack: 0.5 });
            this.tone(104, 1.4, "triangle", 0.035, { to: 150, attack: 0.6, lp: 600 });
            this.tone(330, 1.4, "sine", 0.018, { to: 880, attack: 1.0 });
            [0.25, 0.55, 0.85, 1.1].forEach((at, i) =>
              this.tone(46 + i * 6, 0.22, "sine", 0.05, { at, to: 60 + i * 6 }),
            );
          }
          break;
        case "singCollapse":
          // the collapse: a short in-suck, then a deep soft thump (no crack) and a hollow ring that fades
          if (this.gate(id, 0.05)) {
            this.noise(0.09, 0.08, { type: "bandpass", f: 900, to: 4200, q: 2, attack: 0.08 });
            this.tone(70 * pitch, 0.55, "sine", 0.42, { to: 30, at: 0.08 });
            this.noise(0.45, 0.2, { type: "lowpass", f: 900, to: 120, attack: 0.01, at: 0.08 });
            this.tone(392, 0.8, "sine", 0.045, { at: 0.1, to: 380 });
            this.tone(587, 0.65, "sine", 0.03, { at: 0.11, to: 570 });
            this.tone(196, 0.5, "triangle", 0.05, { at: 0.09, to: 150, lp: 900 });
          }
          break;
        // ---- 3.15.0: the boss cards ----
        case "bcCage":
          // Lockdown Grid: four pylons hit the floor one after another, a servo whine rises as the beams charge
          if (this.gate(id, 0.2)) {
            [0, 0.06, 0.12, 0.18].forEach((at, i) => {
              this.tone(180 - i * 12, 0.09, "square", 0.05, { at, to: 90, lp: 1400 });
              this.noise(0.05, 0.06, { type: "bandpass", f: 2400, q: 3, at });
            });
            this.tone(400, 0.4, "sawtooth", 0.02, { at: 0.05, to: 1300, lp: 2600 });
          }
          break;
        case "bcLock":
          // the beams light: a laser buzz that holds, with a bright zap on top
          if (this.gate(id, 0.2)) {
            this.hum(110, 0.9, "sawtooth", 0.035, { lp: 900, wob: { rate: 30, depth: 4 } });
            this.tone(220, 0.8, "square", 0.012, { lp: 1600, attack: 0.02 });
            this.noise(0.12, 0.08, { type: "highpass", f: 3e3 });
            this.tone(2600, 0.12, "sine", 0.03, { to: 1800 });
          }
          break;
        case "bcHammer":
          // Crucible Hammer: an anvil clang (inharmonic partials), a deep thump and the hiss of the slag
          if (this.gate(id, 0.1)) {
            this.tone(60 * pitch, 0.5, "sine", 0.36, { to: 32 });
            this.noise(0.18, 0.18, { type: "lowpass", f: 1400, to: 200 });
            [1, 2.76, 5.4, 8.9].forEach((m, i) =>
              this.tone(330 * m * pitch, 0.7 - i * 0.12, "sine", 0.05 / (i + 1), { at: 0.005 }),
            );
            this.noise(0.9, 0.05, { type: "highpass", f: 2500, attack: 0.1, at: 0.1 });
          }
          break;
        case "bcReady":
          // the hammer is ready again: a small bright ting
          if (this.gate(id, 0.3)) {
            this.tone(1320, 0.25, "sine", 0.035);
            this.tone(1320 * 2.76, 0.12, "sine", 0.01);
          }
          break;
        case "bcShatter":
          // Shard Field: glass that breaks, a handful of high crystal pings
          if (this.gate(id, 0.06)) {
            this.noise(0.12, 0.07, { type: "highpass", f: 3500 });
            for (let i = 0; i < 4; i++)
              this.tone((2200 + r() * 2400) * pitch, 0.18, "sine", 0.018, { at: i * 0.025 + r() * 0.02 });
          }
          break;
        case "bcHatch":
          // Brood: a wet crack of the shell and a short insect chirp
          if (this.gate(id, 0.15)) {
            this.noise(0.06, 0.08, { type: "bandpass", f: 900, q: 2 });
            this.tone(1800, 0.05, "square", 0.012, { at: 0.04, lp: 3e3 });
            this.tone(2100, 0.05, "square", 0.012, { at: 0.1, lp: 3e3 });
            this.hum(220, 0.25, "sawtooth", 0.012, { at: 0.04, lp: 700, wob: { rate: 60, depth: 20 } });
          }
          break;
        case "bcBurst":
          // a larva bursts: a soft wet pop and a fizz of poison
          if (this.gate(id, 0.08)) {
            this.tone(160 * pitch, 0.14, "sine", 0.14, { to: 70 });
            this.noise(0.08, 0.09, { type: "bandpass", f: 700, q: 1.5 });
            this.noise(0.5, 0.035, { type: "bandpass", f: 3200, q: 1.2, attack: 0.05, at: 0.05 });
          }
          break;
        case "bcImplode":
          // Event Collapse: everything is pulled in, a reversed swell that rises into the Nova
          if (this.gate(id, 0.3)) {
            this.noise(0.36, 0.14, { type: "bandpass", f: 2400, to: 300, q: 1.4, attack: 0.33 });
            this.tone(40, 0.36, "sine", 0.18, { to: 90, attack: 0.3 });
            this.tone(880, 0.34, "sine", 0.03, { to: 220, attack: 0.3 });
          }
          break;
        case "gadgetReady":
          if (this.gate(id, 0.2)) {
            this.tone(1760, 0.07, "sine", 0.05);
            this.tone(2640, 0.09, "sine", 0.03, { at: 0.05 });
          }
          break;
        case "gadgetNo":
          // the gadget is not ready: a dull double buzz
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
        case "tcPyro":
          // 3.47.0: the stage pyro primes: gas rushing into the nozzle, a rising bright hiss with
          // two little knocks of the valve
          if (this.gate(id, 0.12)) {
            this.noise(d, 0.055, { type: "bandpass", f: 1200, to: 3400, q: 1.1, attack: d * 0.9 });
            this.tone(2200, 0.06, "triangle", 0.03, { to: 1600, at: d * 0.35 });
            this.tone(2200, 0.06, "triangle", 0.03, { to: 1600, at: d * 0.7 });
          }
          break;
        case "tcSun":
          // 3.53.0: the sunspike primes: the fused sheet creaks and ticks as the pressure builds
          if (this.gate(id, 0.12)) {
            this.tone(1800 + Math.random() * 500, 0.1, "sine", 0.028, { to: 2400, at: 0.02 });
            this.tone(2600, 0.07, "sine", 0.02, { at: d * 0.45, to: 2100 });
            this.noise(d, 0.03, { type: "highpass", f: 5200, attack: d * 0.9 });
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
        case "tsPyro":
          // 3.47.0: the jet: a golden whoomph and a shower of sparks
          if (this.gate(id, 0.05)) {
            this.noise(0.35, 0.2, { type: "bandpass", f: 900, to: 2600, q: 0.8, attack: 0.015 });
            this.tone(110, 0.26, "sine", 0.26, { to: 55 });
            for (let i = 0; i < 6; i++)
              this.tone(1900 + r() * 1600, 0.08, "sine", 0.03, { to: 700, at: 0.05 + i * 0.06 });
          }
          break;
        case "tsSun":
          // 3.53.0: the sheet bursts: a glassy snap, shards ringing out, sand hissing down
          if (this.gate(id, 0.05)) {
            this.noise(0.12, 0.14, { type: "highpass", f: 2400, attack: 0.002 });
            this.tone(2400, 0.16, "sine", 0.05, { to: 3200 });
            this.tone(3600, 0.12, "sine", 0.035, { at: 0.03, to: 2900 });
            this.noise(0.5, 0.07, { type: "bandpass", f: 1600, to: 700, q: 1.2, at: 0.05, color: "pink" });
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
          // a sharp mine blast: a crack, a hard body and a low rumble (no debris patter: that was the grenade)
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
        // ---- 3.10.0: the blasts of the attacks of enemies and bosses (arg: the radius of the zone; bigger is deeper)
        case "aQuake": {
          // the ground breaks: a dull crunch (no sharp crack: that is a mine), a deep thud, a long rumble that rolls
          // away and gravel that keeps crumbling after it
          if (!this.gate(id, 0.06)) break;
          const big = Math.min(1.4, Math.max(0.6, (arg || 2) / 3));
          this.noise(0.09, 0.12, { type: "bandpass", f: 420, q: 1.2, attack: 0.002 });
          this.tone(64 * pitch, 0.45 * big, "sine", 0.24, { to: 26 });
          // the rumble rolls on for over a second, whatever the size (a blast is short)
          this.noise(1.0 + 0.3 * big, 0.17, { f: 240, to: 50, color: "brown", attack: 0.04, hold: 0.35 });
          this.tone(42, 1.0 + 0.3 * big, "triangle", 0.07, { to: 32, lp: 180, attack: 0.06, hold: 0.35 });
          for (let i = 0; i < 6; i++)
            this.noise(0.04, 0.03 - i * 0.003, { type: "bandpass", f: 300 + r() * 500, q: 3, at: 0.1 + i * 0.1 });
          break;
        }
        case "aLava":
          // lava bursts: a roar that opens and falls, a deep push, a sizzle and blobs that pop
          if (!this.gate(id, 0.06)) break;
          this.noise(0.5, 0.15, { f: 1800, to: 280, color: "brown", attack: 0.01 });
          this.tone(82 * pitch, 0.35, "sine", 0.17, { to: 38 });
          this.noise(0.45, 0.045, { type: "bandpass", f: 3800, q: 1.2, at: 0.06, attack: 0.03 });
          for (let i = 0; i < 3; i++) {
            const f = 110 + r() * 110;
            this.tone(f, 0.12, "sine", 0.05, { to: f * 2.1, at: 0.12 + i * 0.09 });
          }
          break;
        case "aIce":
          // ice bursts out of the floor and shatters: a sharp crack, a falling glassy body, splinters, a tinkle
          if (!this.gate(id, 0.06)) break;
          this.noise(0.02, 0.14, { type: "highpass", f: 3500, attack: 0.001 });
          this.tone(110 * pitch, 0.3, "sine", 0.2, { to: 45 });
          this.tone(320, 0.22, "triangle", 0.1, { to: 120, lp: 2500 });
          for (let i = 0; i < 6; i++)
            this.tone(2200 + r() * 2500, 0.09, "sine", 0.03, { to: 1400 + r() * 600, at: 0.02 + i * 0.035 });
          for (let i = 0; i < 4; i++) this.tone(3000 + r() * 2200, 0.4, "sine", 0.014, { at: 0.5 + i * 0.07 });
          break;
        case "aShort":
          // 3.34.0: a Shorted enemy's spot arcs: a dry snap, a short mains buzz (the 100 Hz of the city's manholes)
          // that dies, a falling zap and a few crackles
          if (!this.gate(id, 0.08)) break;
          this.noise(0.025, 0.16, { type: "highpass", f: 3200, attack: 0.001 });
          this.tone(100, 0.28, "sawtooth", 0.045, { lp: 1300, attack: 0.004, hold: 0.1 });
          this.tone(101.5, 0.28, "square", 0.02, { lp: 900, attack: 0.004, hold: 0.1 });
          this.tone(2600 * pitch, 0.2, "sawtooth", 0.03, { to: 240, lp: 5000, at: 0.01 });
          for (let i = 0; i < 4; i++)
            this.noise(0.018, 0.05, { type: "bandpass", f: 2600 + r() * 4500, q: 6, at: 0.03 + i * 0.05 });
          break;
        case "shortFizz":
          // 3.34.0: the warning of a Shorted enemy's spot: a thin crackling fizz that swells over the second before it
          // arcs, a faint rising buzz under it
          if (!this.gate(id, 0.12)) break;
          for (let i = 0; i < 7; i++)
            this.noise(0.015, 0.012 + i * 0.004, { type: "bandpass", f: 3000 + r() * 4000, q: 7, at: i * 0.13 });
          this.tone(100, 1.0, "sawtooth", 0.012, { lp: 900, to: 120, attack: 0.7 });
          break;
        case "aAcid":
          // a wet splash: a slap of water, blobs that rise, a thump under it and a sizzle that lingers
          if (!this.gate(id, 0.06)) break;
          this.noise(0.25, 0.2, { type: "bandpass", f: 1300, to: 420, q: 0.9, attack: 0.003 });
          this.tone(95 * pitch, 0.2, "sine", 0.2, { to: 50 });
          for (let i = 0; i < 3; i++) {
            const f = 240 + r() * 260;
            this.tone(f, 0.08, "sine", 0.05, { to: f * 2.3, at: 0.05 + i * 0.07 });
          }
          this.noise(0.6, 0.05, { type: "bandpass", f: 3600, q: 1.4, at: 0.1, attack: 0.05 });
          break;
        case "aRift":
          // a bolt out of the tear: a zap that falls from high to low, a crack and a deep boom with a shimmer
          if (!this.gate(id, 0.06)) break;
          this.tone(2600, 0.28, "sawtooth", 0.05, { to: 110, lp: 3200 });
          this.tone(1300, 0.1, "sine", 0.07, { to: 90 });
          this.noise(0.02, 0.1, { type: "highpass", f: 3e3, attack: 0.001 });
          this.tone(62 * pitch, 0.4, "sine", 0.3, { to: 26, at: 0.02 });
          this.noise(0.35, 0.09, { type: "bandpass", f: 3000, to: 600, q: 2, at: 0.02 });
          this.tone(1800, 0.6, "sine", 0.012, { at: 0.12, detune: 25 });
          break;
        case "aFire":
          // burning ground flares up: a soft whoomph
          if (!this.gate(id, 0.08)) break;
          this.noise(0.3, 0.1, { f: 900, to: 300, color: "brown", attack: 0.02 });
          this.tone(120, 0.12, "sine", 0.08, { to: 60 });
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
        case 6:
          // 3.15.0: a boss card: a war drum hit, a dark minor brass chord that opens to major and a gold shimmer
          this.tone(midiToFreq(33), 1.1, "sine", 0.2, { attack: 0.01, to: midiToFreq(31) });
          this.noise(0.25, 0.1, { type: "lowpass", f: 500, to: 120 });
          [0, 3, 7].forEach((n) => this.tone(midiToFreq(55 + n), 0.45, "sawtooth", 0.035, { lp: 1600, attack: 0.03 }));
          [0, 4, 7, 12].forEach((n) =>
            this.tone(midiToFreq(55 + n), 0.9, "sawtooth", 0.03, { at: 0.35, lp: 2200, attack: 0.05, detune: 7 }),
          );
          [0, 0.08, 0.16, 0.24].forEach((at, i) =>
            this.tone(midiToFreq(86 + [0, 4, 7, 12][i]), 0.5, "sine", 0.045, { at: 0.35 + at }),
          );
          this.noise(0.7, 0.04, { type: "highpass", f: 4e3, attack: 0.4, at: 0.3 });
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
        case "raid":
          // 3.49.0: ASHFALL: the mountain shudders awake (a heavy crack), the evacuation siren, then
          // every fumarole primes with one rising hiss
          this.noise(0.06, 0.18, { type: "bandpass", f: 700, q: 2, attack: 0.001 });
          this.tone(90, 0.9, "sine", 0.2, { to: 36 });
          this.tone(2300, 0.3, "triangle", 0.05, { to: 2900, at: 0.35 });
          this.tone(2900, 0.35, "triangle", 0.05, { to: 2300, at: 0.67 });
          this.noise(1.1, 0.1, { f: 300, to: 2600, attack: 0.8, at: 0.4 });
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
        case "kingpin":
          // the caldera: three deep thuds under the ground, then the crust splits - a low horn out of
          // the dark and a long breath of escaping gas
          [0, 0.22, 0.44].forEach((at, i) => this.tone(60 - i * 7, 0.3, "sine", 0.09, { at: d + at, to: 32 }));
          this.tone(midiToFreq(31), 0.9, "sawtooth", 0.09, { lp: 420, at: d + 0.66, attack: 0.1 });
          this.tone(midiToFreq(38), 0.55, "sawtooth", 0.06, { lp: 480, at: d + 0.92, attack: 0.06 });
          this.noise(0.6, 0.04, { type: "bandpass", f: 2400, q: 1.2, attack: 0.25, at: d + 0.7 });
          break;
        case "wyrm":
          // the glass below: the sand hums, then it comes up - a rising shimmer of pure tones (the
          // inverse of the Prism's falling glass) over a sub that swells from under the floor
          this.tone(48, 1.1, "sine", 0.2, { to: 64, at: d, attack: 0.7 });
          this.noise(0.9, 0.05, { type: "bandpass", f: 900, to: 2800, q: 1.4, attack: 0.6, at: d + 0.1 });
          [52, 59, 64, 68, 71].forEach((m, i) => {
            this.tone(midiToFreq(m), 0.5, "sine", 0.045, { at: d + 0.55 + i * 0.1 });
            this.tone(midiToFreq(m) * 1.005, 0.5, "sine", 0.035, { at: d + 0.55 + i * 0.1 });
          });
          this.tone(midiToFreq(35), 0.7, "triangle", 0.1, { lp: 900, at: d + 1.05, attack: 0.05 });
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
            // 3.0.0: the traps have blasts of their own (trapFire), 3.12.0: so has the Singularity (singCollapse);
            // 3.6.0: so has the
            // Combo Surge ("surge")
            if (ev.kind === "trap" || ev.kind === "surge") break;
            // 3.10.0: the attacks of enemies and bosses sound like what they are
            if (attackVoice(ev.kind, ev.src, this.biome, ev.chill)) {
              this.play(attackVoice(ev.kind, ev.src, this.biome, ev.chill), ev.r);
              break;
            }
            // 3.15.0: the boss cards: the Crucible Hammer's slam, a larva of the Brood bursting
            if (ev.kind === "hammer" || ev.kind === "brood") {
              this.play(ev.kind === "hammer" ? "bcHammer" : "bcBurst");
              break;
            }
            this.play(
              ev.kind === "singularity"
                ? "singCollapse"
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
          // 3.17.0: the walker: a foot comes down on the ground of the biome (or on ice or acid), the landing after a dash
          case "step":
            this.play("step", { ground: ev.ground, foot: ev.foot, v: ev.v });
            break;
          case "land":
            this.play("land", { ground: ev.ground });
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
            this.play((ev.type === "boss" && BOSS_ESHOT[ev.boss]) || RL_ESHOT_VOICE[ev.type] || "eshot");
            // 3.33.0: a Frost enemy's shot rings with a glassy chime on top (its shot slows the drone it hits)
            if (ev.frost) this.play("eshotFrost");
            break;
          case "beamWarn":
            // 3.33.0: the beams of the Cryo Vault, the Toxin Marsh and the Ember Works sound like what they are; the
            // laser and the rift ribbon keep the whine of 2.x
            this.play(BEAM_VOICE[ev.skin] || (ev.small ? "beamSmall" : "beam"), ev.small ? 0.6 : 1);
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
          case "revive":
            this.play("nova");
            break;
          case "pick":
            this.play("pick", ev.evo ? 5 : (upgradesById[ev.id] && upgradesById[ev.id].rarity) || 1);
            break;
          // 3.15.0: the boss cards
          case "lockdown":
            this.play("bcCage");
            break;
          case "lockOn":
            this.play("bcLock");
            break;
          case "hammerReady":
            this.play("bcReady");
            break;
          case "shatter":
            this.play("bcShatter");
            break;
          case "broodHatch":
            this.play("bcHatch");
            break;
          case "implode":
            this.play("bcImplode");
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
          case "singularity":
            this.play("singThrow");
            break;
          case "singOpen":
            this.play("singPull");
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
          case "devilNear":
            // 3.53.0: a dust devil of the Flats bears down on the player (the consume pan carried its spot)
            this.play("devilNear");
            break;
          case "warp":
            this.play("warp");
            break;
          case "mend":
          case "chill":
          case "champion":
            this.play(ev.k);
            break;
          case "tribute":
            this.play("tribute");
            break;
          case "stun":
            this.play("stun", ev.skin);
            break;
          case "shortArm":
            this.play("shortFizz");
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
      // 3.42.0: leaving the fight opens the Whiteout muffle (the storm belongs to the fight alone)
      if (this.ctx && this.muffle && mode !== "fight" && mode !== "boss")
        this.muffle.frequency.setTargetAtTime(18000, this.ctx.currentTime, 0.3);
      if (biome) {
        this.biome = biome;
        // 3.2.0: the room of the sounds is the room of the biome
        if (this.sfxVerbOut && SFX_ROOM_BIOME[biome])
          this.sfxVerbOut.gain.setTargetAtTime(SFX_ROOM_BIOME[biome], this.ctx.currentTime, 0.3);
      }
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
    /* what should play now: "off", "menu", "fight" (calm) or "boss" */
    wantKind() {
      if (this.mode === "boss") return this.bossOver ? "fight" : "boss";
      return this.mode;
    }
    wantBiome() {
      return musicChords[this.biome] ? this.biome : "yard";
    }
    /* Called when the wanted track changes: restarts the step counter on the spot, cuts the notes that were
     already scheduled for the old track and plays the transition: an impact when the boss track starts, a last
     hit when it resolves (the calm theme then fades back in over about 3 s). */
    syncTrack() {
      // 3.43.1: the guard comes first - a setMusic before init() used to commit the track state and
      // skip the audio half, and every later sync saw "no change" and never started the track
      let ctx = this.ctx;
      if (!ctx || !this.fade) return;
      let kind = this.wantKind(),
        biome = this.wantBiome();
      if (kind === this.playKind && biome === this.playBiome) return;
      // 3.46.0: after a failed track start, back off 2 s before retrying (the 30 ms tick would
      // otherwise rebuild the bed — and swap the room — over and over)
      if (this.trackFailT && ctx.currentTime - this.trackFailT < 2) return;
      let from = this.playKind,
        track = kind === "fight" || kind === "boss" ? musicTrack(kind, biome) : null;
      // 3.2.0: the pause menu keeps the place of a fight or boss track; resuming the run goes on from there
      if ((from === "fight" || from === "boss") && kind === "menu")
        this.held = { kind: from, biome: this.playBiome, step: this.step, cycle: this.cycle, heat: this.heat };
      let held = this.held,
        resumed = !!held && this.resumeWanted && held.kind === kind && held.biome === biome;
      // 3.46.0: the old state is kept — if the change fails midway, it is put back so the next
      // tick (after the backoff) retries the whole change instead of a committed-but-silent track
      let prev = {
        kind: this.playKind,
        biome: this.playBiome,
        step: this.step,
        cycle: this.cycle,
        heat: this.heat,
        jump: this.jump,
        held: this.held,
      };
      if (kind !== "menu") this.held = null;
      this.playKind = kind;
      this.playBiome = biome;
      this.step = resumed ? held.step : 0;
      this.cycle = resumed ? held.cycle : 0;
      this.heat = resumed ? held.heat : 0;
      this.jump = false;
      try {
        let now = ctx.currentTime,
          gain = track ? track.gain : 1;
        this.cutScheduled(now);
        this.quietOld(now);
        this.nextT = now + 0.03;
        this.fade.gain.cancelScheduledValues(now);
        this.mixFor(kind);
        this.stopMusicBed();
        if (track) this.startMusicBed(kind, biome);
        if (resumed) {
          this.fade.gain.setValueAtTime(0.0001, now);
          this.fade.gain.linearRampToValueAtTime(gain, now + 0.6);
        } else if (from === "boss" && kind === "fight") {
          // resolve: the boss track ends on a last hit, then silence, then the calm theme fades in
          this.fade.gain.setValueAtTime(1.1, now);
          this.fade.gain.linearRampToValueAtTime(0.0001, now + 0.9);
          this.fade.gain.linearRampToValueAtTime(gain, now + 4.1);
          this.nextT = now + 0.9;
          if (this.live() && this.musVol > 0) musicResolve(this, biome, 0);
        } else {
          this.fade.gain.setValueAtTime(gain, now);
          if (kind === "boss" && from === "fight" && this.live() && this.musVol > 0) musicImpact(this, biome, 0);
        }
        this.trackFailT = 0;
      } catch (err) {
        // 3.46.0: roll the track state back and back off before retrying
        this.playKind = prev.kind;
        this.playBiome = prev.biome;
        this.step = prev.step;
        this.cycle = prev.cycle;
        this.heat = prev.heat;
        this.jump = prev.jump;
        this.held = prev.held;
        this.trackFailT = ctx.currentTime;
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
            // 3.46.0: detached now instead of relying on GC
            // (never offline: the render happens after the scheduling pass — see claim)
            if (!this.offline) {
              voice.node.disconnect();
              voice.amp.disconnect();
            }
          } catch {}
          list[i] = list[list.length - 1];
          list.pop();
        }
      }
    }
    /* 3.18.1: the old track does not ring on under the new one. A track change used to cut only the notes that were still
     to come: the pads and bells already sounding (some for several seconds), the echoes of the delay and the tail of the
     room played on, so the calm theme was heard under the first bars of a boss and the boss under the calm theme after it.
     Now the sounding notes fade out over QUIET_FADE, the echo line is emptied and the room is swapped for a fresh one
     (the old one fades out and goes). */
    quietOld(now) {
      let ctx = this.ctx,
        end = now + QUIET_FADE,
        list = this.musicVoiceList;
      for (let voice of list) {
        if (!voice.node || voice.start > now + 0.005 || voice.end <= now + 0.01) continue;
        try {
          let gain = voice.amp.gain;
          if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
          else {
            let at = gain.value;
            gain.cancelScheduledValues(now);
            gain.setValueAtTime(at, now);
          }
          gain.linearRampToValueAtTime(0, end);
          voice.node.stop(end + 0.01);
          voice.end = end;
        } catch {}
      }
      try {
        // the echo line: nothing is fed back while it empties (0.28 s a round), then it works again
        this.fb.gain.cancelScheduledValues(now);
        this.fb.gain.setValueAtTime(0, now);
        this.fb.gain.setValueAtTime(0.32, now + 0.7);
        // 3.28.1: the ping-pong echo of the bloom empties too (it rang about two seconds into the next track)
        for (const g of this.pingFb || []) {
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(0, now);
          g.gain.setValueAtTime(0.42, now + 1);
        }
        if (this.verbIn && this.verbPool) {
          // 3.46.0: swap between the two pre-built rooms instead of building a fresh convolver
          // (megabytes of impulse transform) on every track change; the outgoing one fades as before
          let old = this.verb,
            oldOut = this.verbOut,
            next = this.verbPool.find((v) => v.out !== oldOut) || this.verbPool[0];
          next.out.gain.cancelScheduledValues(now);
          next.out.gain.setValueAtTime(oldOut.gain.value, now);
          this.verbIn.disconnect(old);
          this.verbIn.connect(next.conv);
          oldOut.gain.cancelScheduledValues(now);
          oldOut.gain.setValueAtTime(oldOut.gain.value, now);
          oldOut.gain.linearRampToValueAtTime(0, end);
          this.verb = next.conv;
          this.verbOut = next.out;
        }
      } catch (err) {
        this.fail(err);
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
      // 3.42.0: a Whiteout muffles the world behind the storm; anything else (and every non-fight state)
      // opens the muffle again. setMusic lifts it too, so a pause or the Home never stays muffled.
      if (this.muffle) {
        const want = this.amb === "whiteout" && speed != null ? 850 : 18000;
        this.muffle.frequency.setTargetAtTime(want, this.ctx.currentTime, want < 2000 ? 0.5 : 0.35);
      }
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
      // 3.43.1: idempotent - a bed that is already up never builds a second copy on top
      if (this.beds[name]) return;
      let ctx = this.ctx,
        now = ctx.currentTime,
        gain = ctx.createGain(),
        nodes = [],
        parts = {},
        level = name === "hum" ? 0.02 : AMBIENCE_LEVEL[name] || 0.03;
      gain.gain.setValueAtTime(1e-4, now);
      // 3.43.0: an event bed gathers (the whiteout storm builds over about three seconds), it does not snap on
      gain.gain.setTargetAtTime(level, now, BED_ATTACK[name] || 0.35);
      // the drone's hum is an effect; the beds of the biome events are the place (3.9.0: ambience bus)
      gain.connect(name === "hum" ? this.sfx : this.ambBus);
      let bed = { name, gain, nodes, parts };
      this.beds[name] = bed;
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
      // 3.43.1: registered before the build - if the build throws midway, the catch below stops the
      // loops that already started (they used to be orphaned forever, and the scheduler retried the
      // build every tick, stacking a new orphan set each time)
      try {
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
          case "raid": {
            // 3.49.0: ASHFALL: the fumaroles prime (a hiss that never quite lets go) over a deep
            // rock-rumble, and the hot wind rises and falls behind it
            let prime = filter("bandpass", 1900, 0.9, loop(1.1, "pink")),
              primeAmp = ctx.createGain();
            primeAmp.gain.value = 0.22;
            prime.connect(primeAmp);
            primeAmp.connect(gain);
            let rumble = filter("lowpass", 130, 0.9, loop(0.7, "brown")),
              rumbleAmp = ctx.createGain();
            rumbleAmp.gain.value = 0.5;
            rumble.connect(rumbleAmp);
            rumbleAmp.connect(gain);
            let gust = filter("bandpass", 520, 0.9, loop(0.9, "pink")),
              gustAmp = ctx.createGain(),
              swell = osc("sine", 0.17),
              swellDepth = ctx.createGain();
            gustAmp.gain.value = 0.3;
            swellDepth.gain.value = 0.14;
            swell.connect(swellDepth);
            swellDepth.connect(gustAmp.gain);
            gust.connect(gustAmp);
            gustAmp.connect(gain);
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
      } catch (err) {
        // back out cleanly: stop what started, leave the registry (a dead bed, the
        // scheduler will not rebuild it every tick — 3.46.0: it gets one more try after
        // 10 s), and report like the rest of the engine
        this.stopBed(name, 0, 0.02);
        this.deadBeds[name] = now;
        this.fail(err);
        return;
      }
      for (let node of nodes) {
        this.voices.push({ node: node, amp: gain, pri: 3, start: now, end: 1e9, loop: true, bed: bed });
      }
    }
    stopBed(name, at = 0, rel) {
      let bed = this.beds[name];
      if (!bed) return;
      let ctx = this.ctx,
        now = ctx.currentTime + at,
        // 3.43.0: the bed passes instead of cutting (the storm dies away over about four seconds)
        fade = rel != null ? rel : BED_RELEASE[name] || 0.08,
        end = now + Math.max(0.4, fade * 3);
      try {
        bed.gain.gain.cancelScheduledValues(now);
        bed.gain.gain.setTargetAtTime(0, now, fade);
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
       singing wind on the Aurora Shelf, murk in the Glowmarsh, soft rain and city hum
       in Blackout City, beating drones in the Shattered Core; see MUSIC_BEDS). It goes through the music chain (volume,
       fade, glue) and is not a voice of the budget. */
    startMusicBed(kind, biome, fadeIn = 1.5) {
      let ctx = this.ctx,
        recipe = MUSIC_BEDS[biome];
      if (!ctx || !recipe || (kind !== "fight" && kind !== "boss")) return;
      // 3.43.1: same hardening as the beds - an atmosphere that is still up goes before a new one
      if (this.mbed) this.stopMusicBed();
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
      // 3.46.0: registered before the build — if the build throws midway, the catch below stops
      // the loops that already started through stopMusicBed (they used to be orphaned forever,
      // out of reach of stopMusicBed, with the track state already committed)
      this.mbed = { out, nodes };
      try {
        recipe.build({ osc, loop, filt, lfo, level, root, bpm, boss: kind === "boss" });
        if (kind === "boss" && recipe.bossExtra) recipe.bossExtra({ osc, loop, filt, lfo, level, root, bpm });
      } catch (err) {
        this.stopMusicBed(0.05);
        throw err;
      }
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
    /* 3.43.0: the room tone - the quiet, steady bed of a biome. It plays wherever the game is (home,
       upgrade, pause, fight): the world is never dead silence. It sits on the ambience bus under the
       place and the music and takes no voice of the budget (like the atmospheres of the music). */
    startTone(name) {
      let ctx = this.ctx;
      if (!ctx || this.toneBed) return;
      // 3.46.0: same hardening as the beds (3.43.1) — registered before the build: if the build
      // throws midway, the catch below stops the loops that already started (they used to be
      // orphaned forever while syncTone retried the build every 30 ms tick, stacking a new
      // orphan set each time). A tone that failed gets one more try after 10 s.
      let dead = this.deadTone[name];
      if (dead && ctx.currentTime - dead < 10) return;
      let now = ctx.currentTime,
        gain = ctx.createGain(),
        nodes = [],
        level = ROOM_TONE_LEVEL[name] || 0.028;
      this.toneBed = { name, gain, nodes, boss: false };
      try {
        // the room arrives slowly (a new biome breathes in, it does not switch on)
        gain.gain.setValueAtTime(1e-4, now);
        gain.gain.setTargetAtTime(level, now, 1.2);
        gain.connect(this.ambBus);
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
          },
          amp = (from, vol) => {
            let node = ctx.createGain();
            node.gain.value = vol;
            from.connect(node);
            node.connect(gain);
            return node;
          },
          // a slow wander of a filter or a level: the room never stands still, but it never moves fast
          drift = (param, freq, depth) => {
            let lfo = osc("sine", freq),
              depthGain = ctx.createGain();
            depthGain.gain.value = depth;
            lfo.connect(depthGain);
            depthGain.connect(param);
          };
        switch (name) {
          case "yard": {
            // Blackout City: the wash of far traffic under a rain that never quite reaches, a transformer hum
            let wash = filter("lowpass", 240, 0.6, loop(0.5, "brown")),
              washAmp = amp(wash, 0.6);
            drift(washAmp.gain, 0.05, 0.22);
            drift(wash.frequency, 0.031, 60);
            let hum = filter("lowpass", 300, 1.1, osc("sawtooth", 50));
            amp(hum, 0.11);
            break;
          }
          case "vault": {
            // The Aurora Shelf: a thin high wind that wanders (the calm cousin of the whiteout storm) and the
            // faint glassy sheen of the ice
            let wind = filter("bandpass", 520, 0.7, loop(1, "pink"));
            amp(wind, 0.6);
            drift(wind.frequency, 0.09, 180);
            let sheen = filter("bandpass", 1900, 6, loop(1.4, "pink")),
              sheenAmp = amp(sheen, 0.16);
            drift(sheenAmp.gain, 0.045, 0.12);
            let ring = osc("sine", 1320),
              ringAmp = amp(ring, 0.03);
            drift(ringAmp.gain, 0.037, 0.02);
            break;
          }
          case "marsh": {
            // The Glowmarsh (3.50.0): a heavy drone over water that laps against the peat, and a faint
            // glassy sheen far above - the bioluminescence humming to itself
            let drone = filter("lowpass", 190, 0.8, loop(0.5, "brown"));
            amp(drone, 0.55);
            let deep = osc("sine", 55);
            amp(deep, 0.1);
            let lap = filter("bandpass", 300, 2, loop(0.8, "brown")),
              lapAmp = amp(lap, 0.3);
            drift(lapAmp.gain, 0.12, 0.16);
            drift(lap.frequency, 0.07, 90);
            let sheen = filter("bandpass", 2100, 5, loop(1.2, "pink")),
              sheenAmp = amp(sheen, 0.06);
            drift(sheenAmp.gain, 0.09, 0.03);
            drift(sheen.frequency, 0.04, 300);
            break;
          }
          case "void": {
            // The Shattered Core: a slow sub throb and a shimmering sheen far above it
            let throb = amp(osc("sine", 44), 0.5),
              fifth = amp(osc("sine", 66), 0.18);
            drift(throb.gain, 0.1, 0.2);
            drift(fifth.gain, 0.1, 0.08);
            let shimmer = filter("bandpass", 2400, 6, loop(1.3, "pink")),
              shimmerAmp = amp(shimmer, 0.08);
            drift(shimmerAmp.gain, 0.06, 0.06);
            drift(shimmer.frequency, 0.05, 600);
            break;
          }
          case "flats": {
            // 3.53.0: the Glass Flats: the noon hiss - hot air over the glass, a low sand drone and
            // the far tick of the sheets settling (the amps stay well over the tone gate: the first
            // CI round measured 0.0008 - the club's silent-tone lesson)
            const hiss = amp(filter("bandpass", 3400, 1.4, loop(1.3, "pink")), 0.05);
            drift(hiss.gain, 0.14, 0.012);
            const drone = amp(filter("lowpass", 130, 0.8, osc("sine", 48)), 0.075);
            drift(drone.gain, 0.08, 0.02);
            const tick = amp(filter("highpass", 5200, 1, loop(1.7, "pink")), 0.009);
            drift(tick.gain, 0.06, 0.004);
            break;
          }
          case "club": {
            // 3.49.0: the Ashfall Caldera: the crater breathes - the rumble under everything, the
            // crackle of the cooling crust, the far hiss of gas. The mountain's slow pulse swells
            // the rumble. (No music-bus bed: the march owns the music bus alone - a copy of the
            // rumble there only painted a flat skirt across the band the phone test measures.)
            const drone = amp(filter("lowpass", 160, 0.8, osc("sawtooth", 42)), 0.075);
            drift(drone.gain, 0.06, 0.015);
            const rumble = amp(filter("lowpass", 120, 0.9, loop(0.7, "brown")), 0.04);
            drift(rumble.gain, 0.09, 0.015);
            const crackle = amp(filter("bandpass", 2200, 6, loop(0.7, "pink")), 0.008);
            drift(crackle.gain, 0.11, 0.005);
            const hiss = amp(filter("highpass", 4800, 1, loop(1.1, "pink")), 0.004);
            drift(hiss.gain, 0.05, 0.003);
            break;
          }
        }
      } catch (err) {
        // back out cleanly: stop what started (stopTone also detaches the nodes and the gain),
        // mark the tone dead for 10 s, and report like the rest of the engine
        this.stopTone(name, 0, 0.05);
        this.deadTone[name] = ctx.currentTime;
        this.fail(err);
        return;
      }
    }
    stopTone(name, at = 0, fade = 1.2) {
      let tone = this.toneBed;
      if (!tone || (name && tone.name !== name)) return;
      this.toneBed = null;
      let now = this.ctx.currentTime + at,
        end = now + Math.max(0.3, fade * 2.5);
      try {
        tone.gain.gain.cancelScheduledValues(now);
        tone.gain.gain.setTargetAtTime(0, now, fade * 0.5);
        for (let node of tone.nodes) node.stop(end);
        // 3.46.0: the nodes are detached instead of relying on GC — after the fade (an immediate
        // detach used to cut it), and never in the offline renders (the render happens after the
        // scheduling pass: a detached node's window would never sound)
        if (!this.offline)
          setTimeout(
            () => {
              try {
                for (let node of tone.nodes) node.disconnect();
                tone.gain.disconnect();
              } catch {}
            },
            Math.max(0, end - this.ctx.currentTime) * 1000 + 150,
          );
      } catch {}
    }
    /* Runs with the scheduler: keeps the room tone of the current biome alive (menu, upgrade, pause and
       fight alike), crossfades it on a biome change and dips it a little while a boss carries the track. */
    syncTone() {
      let ctx = this.ctx;
      if (!ctx) return;
      let want = this.mode !== "off" && this.ambVol > 0 ? this.wantBiome() : null;
      if (this.toneBed && (!want || this.toneBed.name !== want)) this.stopTone();
      // 3.46.0: a tone whose build threw gets one more try after 10 s (was: dead for the session)
      if (want && !this.toneBed) {
        let dead = this.deadTone[want];
        if (!dead || ctx.currentTime - dead >= 10) this.startTone(want);
      }
      if (this.toneBed) {
        let boss = this.playKind === "boss";
        if (boss !== this.toneBed.boss) {
          this.toneBed.boss = boss;
          try {
            let now = ctx.currentTime,
              level = ROOM_TONE_LEVEL[this.toneBed.name] || 0.028;
            this.toneBed.gain.gain.setTargetAtTime(boss ? level * 0.55 : level, now, 0.9);
          } catch {}
        }
      }
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
      // 3.46.0: a bed whose build threw gets one more try after 10 s (was: dead for the session)
      let dead = amb ? this.deadBeds[amb] : 0;
      if (amb && !this.beds[amb] && (!dead || now - dead >= 10)) this.startBed(amb);
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
      // 3.31.1: the sounds of a biome event give way to the fight like the sounds of the place (they took voices from it)
      this.curPri = 0.5;
      this.curBus = this.ambBus;
      try {
        this.accentOf(name, now);
      } finally {
        this.curPri = 1;
        this.curBus = null;
      }
    }
    accentOf(name, now) {
      switch (name) {
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
            this.schedFails = 0;
          } catch (err) {
            // 3.46.0: one throw used to clear the interval for the whole session — music, beds,
            // the hum, the room tone and the voice pruning all died silently. Report, release
            // the timer and re-arm with a growing backoff; the note loop is guarded per step.
            this.fail(err);
            clearInterval(this.timer);
            this.timer = null;
            if (this.ctx && !this.offline) {
              this.schedFails = (this.schedFails || 0) + 1;
              if (this.schedFails <= 5) {
                setTimeout(() => {
                  if (this.ctx && !this.timer) this.startScheduler();
                }, 1000 * this.schedFails);
              }
            }
          }
        }, 30);
      }
    }
    schedule() {
      let ctx = this.ctx;
      if (!ctx || ctx.state !== "running") return;
      try {
        this.syncAudio();
        this.syncTone();
      } catch (err) {
        this.fail(err);
      }
      this.syncTrack();
      if (this.nextT < ctx.currentTime - 0.5) {
        this.nextT = ctx.currentTime + 0.05;
      }
      for (; this.nextT < ctx.currentTime + 0.14; ) {
        let info = trackInfo(this.playKind, this.playBiome);
        try {
          if (this.playKind !== "off" && this.musVol > 0) {
            this.note(this.step, this.nextT);
          }
        } catch (err) {
          // 3.46.0: one bad note must not kill the whole tick — the step still advances
          this.fail(err);
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
          // 3.46.0: a biome can let its chords breathe over more than one bar (chordBars): the Works, the
          // Vault and the Core change their chord every second bar (the drone of the place), the City and
          // the Marsh keep one chord per bar. The boss tracks stay at one chord per bar: the drama.
          [root, quality] = chords[Math.floor(bar / (track.chordBars || 1)) % 4],
          level = kind === "boss" ? 1 : this.intensity,
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
            ch: Math.floor(bar / (track.chordBars || 1)) % 4,
            sec: kind === "boss" ? bossSection(bar) : bar >> 2,
            chord: [root, root + (quality === "m" ? 3 : 4), root + 7, root + 12],
            salt: biome.charCodeAt(0) * 7 + biome.charCodeAt(1),
            barSec: 240 / track.bpm,
            half: 30 / track.bpm / 4,
          };
        track.play(this, c);
        // 3.19.0: the ambient bloom lies on every calm theme (this.bloom = false switches it off for a test)
        if (kind === "fight" && this.bloom !== false) calmBloom(kit(this, c), c, biome);
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
       spec: music (fight|boss), biome, loops, intensity, heat, flood (sounds per step) */
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
        // 3.19.0 (test): spec.stereo renders two channels (samples is the left one, samplesR the right one); spec.bloom
        // false leaves out the ambient bloom
        ctx = new Offline(spec.stereo ? 2 : 1, Math.ceil(44100 * (seconds + 0.35)), 44100),
        engine = new SoundEngine(),
        base = 0;
      if (spec.bloom === false) engine.bloom = false;
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
      // balance probe (scripts/rl-mix-probe.mjs): spec.vol sets the three bus volumes the way the game
      // would have them (the forced sfxVol = 1 above stays for every other caller)
      if (spec.vol) engine.setVolumes(spec.vol.sfx ?? 1, spec.vol.mus ?? engine.musVol, spec.vol.amb ?? engine.ambVol);
      if (spec.burst)
        for (let i = 1; i < spec.burst.n; i++)
          ctx.suspend(0.25 + i * spec.burst.interval).then(() => {
            engine.play(spec.burst.id, spec.burst.arg);
            ctx.resume();
          });
      if (spec.quietAt != null)
        ctx.suspend(0.25 + spec.quietAt).then(() => {
          engine.quietOld(ctx.currentTime);
          ctx.resume();
        });
      ctx.suspend(0.25).then(() => {
        base = ctx.currentTime;
        if (spec.bed) {
          engine.startBed(spec.bed);
          engine.stopBed(spec.bed, spec.stopAt || 1.2, spec.stopRel);
        } else if (spec.tone) {
          // 3.43.0: a short take of a room tone, with a quick test fade (the real one breathes slower)
          engine.startTone(spec.tone);
          engine.stopTone(spec.tone, spec.stopAt || 1.0, spec.fade || 0.25);
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
          let info = trackInfo(spec.music, spec.biome),
            len = 60 / info.bpm / 4,
            first = (spec.fromBar || 0) * 16;
          engine.fade.gain.value = musicTrack(spec.music, spec.biome).gain;
          engine.mixFor(spec.music);
          // 3.18.1: with spec.seed the random choices of the music (its notes, its atmosphere) are seeded as well, so that
          // the numbers of the deep test do not change from run to run
          seeded(() => {
            if (!spec.noBed) engine.startMusicBed(spec.music, spec.biome, 0.05);
            if (spec.impact) musicImpact(engine, spec.biome, 0);
            // 3.18.1 (test): the track ends at spec.musicEnd s and spec.quietAt s is the moment of a track change
            for (
              let n = 0, t = 0;
              t < Math.min(seconds - 0.25, spec.musicEnd != null ? spec.musicEnd : 1e9);
              n++, t += len
            ) {
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
          });
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
        samplesR:
          spec.wav && spec.stereo ? Array.from(buffer.getChannelData(1).subarray(Math.round(base * 44100))) : null,
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
 The calm themes belong to their place (the Aurora Shelf icy and windy, the Glowmarsh damp and alive, the Caldera a
 sleeping mountain, Blackout City a noir night in the rain, the Shattered Core dark and breathing); 3.7.0: the boss tracks
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
    // 3.19.0: the ping-pong bus of the ambient bloom (null where the browser has no stereo panner)
    g: e.ping ? bus(e.ping) : null,
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
   calm theme (Cryo Vault about three quarters, the Glowmarsh half, Blackout City a third). Now an atmosphere is a soft
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
    // 3.53.0: the Glass Flats: the heat shimmer - a wide hot band that sings against the notes, and
    // the low sand drone under it. Under the boss track the shimmer thins (boss 0.55): the hammer
    // carries the fight, and the broadband bed would floor the track's flatness (the club lesson)
    flats: {
      gain: 0.34,
      boss: 0.55,
      build({ osc, loop, filt, lfo, level, root }) {
        const shimmer = filt("bandpass", 2900, 4.5, loop(1.2, "pink"));
        lfo(0.05, 260, shimmer.frequency);
        level(shimmer, 0.05);
        const drone = level(osc("sine", root / 4), 0.05);
        lfo(0.07, 0.012, drone.gain);
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
    // (the Ashfall Caldera has no music bed of its own: its rumble and crackle live on the ambience
    // bus - the scape's calderaRumble and the crater's room tone - and a music-bus copy only painted
    // a flat skirt across the band the phone test measures. The march owns the music bus alone.)
  };

/* ---------- calm themes ---------- */

/* 3.5.0: the calm themes all followed the Cryo Vault: no beat at all until the intensity is high (then a slow heartbeat),
   a motif of struck notes in the echo and the room whose pattern changes per section, a soft pad, a deep sub on every
   chord, flakes of texture and the sounds of the place; each biome has an instrument of its own for the motif and its
   own pad. The boss tracks carry the same motif, so that they sound like the same place at its darkest.
   3.46.0: the themes still share that skeleton, but each place now walks out of it with a gait of its own: the City
   swings (noir), the Glowmarsh drags (bayou), the Works, the Vault and the Core let their chords breathe over two bars,
   and every theme carries one signature voice of its own (a comping chord, a machine bass, a glass run, a dub answer,
   a chant). */
const CALM_MOTIF = ["x..x..x...x..x..", "x.x...x.x...x.x.", "x..x.x...x..x...", "x.x..x.x..x.x..x"],
  /* the instruments of the motif: (bus, frequency, level, options); options.lite leaves out the upper partials */
  VOICE = {
    // Blackout City: an electric piano, a sine with a bright tine that dies quickly
    piano: (bus, f, v, o) => {
      bus.t(f, o.lite ? 0.8 : 1.5, "sine", v, { attack: 0.003, rev: 0.7, ...o });
      if (o.lite) return;
      bus.t(f * 2, 0.6, "sine", v * 0.28, { attack: 0.002, ...o });
      // 3.18.2: the tine of a note in the high octave lay above 20 kHz (24992 Hz at the top: the browser clamped it to the
      // limit of the sampling rate and warned): no one hears it, so it is left out
      if (f * 7.1 < 16000) bus.t(f * 7.1, 0.07, "sine", v * 0.12, { attack: 0.001, ...o });
    },
    // a struck pipe, warm and deep, a fifth and a minor tenth above it, a soft knock (the foundry's
    // voice once; the Rift Core's choir still quotes it)
    pipes: (bus, f, v, o) => {
      bus.t(f, o.lite ? 0.9 : 2, "sine", v, { attack: 0.002, rev: 0.8, ...o });
      bus.t(f * 1.505, o.lite ? 0.5 : 1.2, "sine", v * 0.45, { attack: 0.002, ...o });
      if (o.lite) return;
      bus.t(f * 2.41, 0.6, "sine", v * 0.2, { attack: 0.002, ...o });
      bus.n(0.03, v * 1.5, { type: "bandpass", f: 900, q: 3, color: "pink", attack: 0.001, ...o });
    },
    // The Aurora Shelf (3.51.0): a music box - the ice bell with a tine's metallic ping on top
    ice: (bus, f, v, o) => {
      bell(bus, f, v, o.lite ? 0.7 : 1.4, { rev: 0.7, ...o });
      if (o.lite) return;
      bus.t(f * 3.94, 0.3, "sine", v * 0.28, { attack: 0.001, ...o });
    },
    // The Glowmarsh: a kalimba, a short triangle with a ping on top and a wooden tick
    kalimba: (bus, f, v, o) => {
      bus.t(f, o.lite ? 0.6 : 1.1, "triangle", v, { attack: 0.002, rev: 0.5, ...o });
      if (o.lite) return;
      bus.t(f * 3.01, 0.18, "sine", v * 0.4, { attack: 0.001, ...o });
      bus.n(0.015, v * 1.2, { type: "bandpass", f: 1800, q: 4, color: "pink", attack: 0.001, ...o });
    },
    // The Shattered Core: glass, two sines that beat slowly and a high inharmonic partial, a lot of room
    glass: (bus, f, v, o) => {
      bus.t(f, o.lite ? 1.2 : 2.6, "sine", v, { attack: 0.004, rev: 0.9, ...o });
      if (o.lite) return;
      bus.t(f * 1.004, 2.6, "sine", v * 0.8, { attack: 0.004, ...o });
      bus.t(f * 2.76, 0.9, "sine", v * 0.25, { attack: 0.002, ...o });
    },
    // the old Club's vibraphone (kept for the record; the Caldera strikes obsidian instead)
    // (the 9.2 partial carries the piano's 16 kHz guard: on the G-major bar the motif runs high)
    vibes: (bus, f, v, o) => {
      bus.t(f, o.lite ? 1 : 2.2, "sine", v, { attack: 0.002, rev: 0.65, ...o });
      bus.t(f * 4.01, o.lite ? 0.2 : 0.5, "sine", v * 0.22, { attack: 0.001, ...o });
      if (o.lite) return;
      bus.t(f * 1.004, 2.2, "sine", v * 0.5, { attack: 0.002, ...o });
      if (f * 9.2 < 16000) bus.t(f * 9.2, 0.14, "sine", v * 0.1, { attack: 0.001, ...o });
    },
    // 3.53.0: the Glass Flats: glassine - a struck glass harmonic (a sine with the glass's 2.76
    // partial) and a hot ping on top: noon light on sheet glass
    glassine: (bus, f, v, o) => {
      bus.t(f, o.lite ? 0.8 : 1.6, "sine", v, { attack: 0.002, rev: 0.75, ...o });
      bus.t(f * 2.76, o.lite ? 0.4 : 0.9, "sine", v * 0.3, { attack: 0.002, ...o });
      if (o.lite) return;
      bus.t(f * 5.4, 0.35, "sine", v * 0.12, { attack: 0.001, ...o });
      bus.t(f * 7.9, 0.12, "sine", v * 0.22, { attack: 0.001, ...o });
    },
    // Ashfall Caldera: a struck obsidian shard - a dark fundamental, a cold inharmonic ring, a rocky
    // knock and one far shimmer partial (the 9.2 plants tonal peaks across the band the phone test
    // measures, the same medicine as the vibes'; the 16 kHz guard applies to both)
    cinder: (bus, f, v, o) => {
      bus.t(f, o.lite ? 0.9 : 2, "triangle", v, { attack: 0.002, rev: 0.4, ...o });
      bus.t(f * 2.76, o.lite ? 0.18 : 0.45, "sine", v * 0.22, { attack: 0.001, ...o });
      if (o.lite) return;
      bus.t(f * 1.005, 1.8, "sine", v * 0.4, { attack: 0.002, ...o });
      if (f * 9.2 < 16000) bus.t(f * 9.2, 0.3, "sine", v * 0.13, { attack: 0.001, ...o });
      bus.n(0.03, v * 1.2, { type: "bandpass", f: 640, q: 2.4, color: "pink", attack: 0.001, ...o });
    },
  },
  /* the level of each instrument against the ice bells (the pipes, the kalimba, the glass and the vibes are
     softer by nature) */
  // 3.53.0: the Flats' glassine joins the voices
  VOICE_GAIN = { piano: 1.4, pipes: 1.6, ice: 1, kalimba: 1.5, glass: 1.5, vibes: 1.35, cinder: 1.45, glassine: 1.4 },
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
    // 3.53.0: the Flats: a wide bright pad, an octave up, the fifth under it - noon air
    flats: {
      notes: (c) => [c.chord[0] + 12, c.chord[1] + 12, c.chord[2] + 12],
      wave: "triangle",
      lp: 2000,
      fade: 0.9,
      det: 7,
      rev: 0.7,
      vol: 0.018,
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
    // 3.49.0: the Caldera: a hot-metal pad - low on the root, the fifth hollow above it, bright
    // enough that its own harmonics own the band the phone test measures (the Vault's lesson)
    club: {
      notes: (c) => [c.root - 12, c.chord[0] + 12, c.root + 7],
      wave: "triangle",
      lp: 2000,
      fade: 0.9,
      det: 6,
      rev: 0.3,
      vol: 0.026,
    },
  };
/* the motif of a biome on the chord tones (a fixed walk through them, an octave higher now and then) */
function calmMotif(k, c, voice, v = 1, lite = false, heroic = false) {
  const { b, bar, sec } = c;
  if (!pat(CALM_MOTIF[sec & 3])[b]) return;
  if (lite && R(c, 3) < 0.4) return;
  const n = c.chord[[0, 2, 1, 3, 2, 1, 3][(bar * 7 + b) % 7]] + (R(c, 1) < 0.25 ? 36 : 24);
  VOICE[voice](k.d, midiToFreq(n), 0.045 * v * VOICE_GAIN[voice], { pan: P(c, 2, 0.6), bright: sec >= 2, lite });
  // 3.46.0: the boss tracks state the theme of their place in two octaves (the heroic form: the same
  // note an octave down, softer, on the other side of the stereo field - darker and bigger than a
  // top-octave doubling, and under the 2-12 kHz band the phone-speaker tests measure)
  if (heroic)
    VOICE[voice](k.m, midiToFreq(n - 12), 0.016 * v * VOICE_GAIN[voice], {
      pan: -P(c, 2, 0.6),
      bright: false,
      lite: true,
      rev: 0.15,
    });
}
/* the pad of a biome, one swell per bar on the first step */
/* 3.19.0: the ambient bloom (the direction of the owner: "Osmos": a subtle melody and soft effects, noticeable and nice,
   distinct for each biome, in stereo). On top of every calm theme single notes bloom now and then and ring out for
   seconds: each biome has its own voice (felt piano, struck pipes, glass, kalimba, inharmonic sine bells), its own
   notes (the notes of the chord and what colours it in that place), its own register and its own density; every note
   has its place in the room (a hashed pan) and wanders on through the ping-pong echo and the room. They are most
   present when it is quiet and step back as the fight swells. */
const BLOOM = {
  // Blackout City: a felt piano a little above the electric piano motif, the colour is the ninth and the sixth
  yard: { voice: "felt", extra: [14, 9], low: 12, span: 1, rate: 0.62, vol: 0.05, len: 3.4, width: 0.85, echo: 0.6 },
  // The Aurora Shelf: glass, high, the colour is the sharp eleventh (the Lydian fourth) and the ninth
  vault: { voice: "glass", extra: [18, 14], low: 24, span: 1, rate: 0.7, vol: 0.036, len: 4.8, width: 0.95, echo: 0.8 },
  // 3.53.0: the Glass Flats: the glassine, bright and close - the colour is the major seventh and
  // the ninth (the noon glare); the register sits under the Shelf's glass, above the marsh
  flats: { voice: "glassine", extra: [14, 11], low: 19, span: 1, rate: 0.66, vol: 0.04, len: 4, width: 0.9, echo: 0.7 },
  // The Glowmarsh: a kalimba, plucked and a little out of tune, the colour is the flat seventh and the fourth
  marsh: {
    voice: "kalimba",
    extra: [10, 5],
    low: 12,
    span: 1,
    rate: 0.75,
    vol: 0.058,
    len: 1.8,
    width: 0.9,
    echo: 0.55,
  },
  // The Shattered Core: sine bells that sing in a fifth and fall away, the colour is the tritone and the major seventh
  void: { voice: "ether", extra: [6, 11], low: 12, span: 2, rate: 0.45, vol: 0.04, len: 6, width: 1, echo: 0.9 },
  // Ashfall Caldera: a hot shard pings and cools, the colour is the fifth and the octave
  club: { voice: "ember", extra: [7, 12], low: 12, span: 1, rate: 0.55, vol: 0.04, len: 2.6, width: 0.9, echo: 0.7 },
};
const BLOOM_VOICE = {
  felt: (g, f, v, len, o) => {
    g.t(f, len, "sine", v, { attack: 0.012, lp: 2400, ...o });
    g.t(f * 2, len * 0.5, "triangle", v * 0.22, { attack: 0.01, lp: 1800, ...o });
    g.t(f * 4.02, 0.16, "sine", v * 0.07, { attack: 0.002, ...o });
  },
  glass: (g, f, v, len, o) => {
    g.t(f, len, "sine", v, { attack: 0.003, ...o });
    g.t(f * 1.003, len * 0.8, "sine", v * 0.5, { attack: 0.003, ...o });
    g.t(f * 2.76, len * 0.3, "sine", v * 0.3, { attack: 0.002, ...o });
    if (f * 5.4 < 12000) g.t(f * 5.4, len * 0.12, "sine", v * 0.1, { attack: 0.002, ...o });
  },
  kalimba: (g, f, v, len, o) => {
    g.t(f, len, "triangle", v, { attack: 0.004, lp: 3000, ...o });
    g.t(f * 5.2, 0.12, "sine", v * 0.14, { attack: 0.002, ...o });
    g.t(f * 0.5, len * 0.6, "sine", v * 0.25, { attack: 0.004, ...o });
  },
  // 3.53.0: the Flats' bloom: the glassine with a hotter ping (the noon glare rings off the sheets)
  glassine: (g, f, v, len, o) => {
    g.t(f, len, "sine", v, { attack: 0.003, ...o });
    g.t(f * 2.76, len * 0.35, "sine", v * 0.32, { attack: 0.002, ...o });
    if (f * 5.4 < 12000) g.t(f * 5.4, len * 0.12, "sine", v * 0.1, { attack: 0.002, ...o });
    if (f * 7.9 < 12000) g.t(f * 7.9, 0.1, "sine", v * 0.18, { attack: 0.001, ...o });
  },
  ether: (g, f, v, len, o) => {
    g.t(f, len, "sine", v, { attack: 0.35, to: f * 0.992, ...o });
    g.t(f * 1.5, len * 0.8, "sine", v * 0.42, { attack: 0.5, detune: 7, to: f * 1.5 * 0.99, ...o });
    g.t(f * 2.7, len * 0.4, "sine", v * 0.1, { attack: 0.3, ...o });
  },
  // 3.47.0: the Club's bloom: a struck vibraphone bar, smooth, with the metallic partials dying fast
  // (the 9.2 partial carries the same 16 kHz guard as the motif voice)
  vibe: (g, f, v, len, o) => {
    g.t(f, len, "sine", v, { attack: 0.004, ...o });
    g.t(f * 4.01, len * 0.25, "sine", v * 0.18, { attack: 0.002, ...o });
    if (f * 9.2 < 16000) g.t(f * 9.2, 0.12, "sine", v * 0.08, { attack: 0.001, ...o });
  },
  // 3.49.0: the Caldera's bloom: a hot shard pings and cools fast, one cold partial under the guard
  ember: (g, f, v, len, o) => {
    g.t(f, len, "triangle", v, { attack: 0.003, ...o });
    g.t(f * 2.76, len * 0.3, "sine", v * 0.16, { attack: 0.002, ...o });
    if (f * 6.3 < 16000) g.t(f * 6.3, 0.1, "sine", v * 0.06, { attack: 0.001, ...o });
  },
};
function calmBloom(k, c, biome) {
  const cfg = BLOOM[biome];
  if (!cfg || !k.g) return;
  // the places in the bar where a note may bloom: the first beat, the off-beat before the third and the last sixteenth
  const slot = c.b === 0 ? 0 : c.b === 6 ? 1 : c.b === 10 ? 2 : c.b === 14 ? 3 : -1;
  if (slot < 0) return;
  // most present when quiet, thinner as the fight swells (never silent: it is part of the place)
  const chance = cfg.rate * (0.55 - 0.3 * c.L) * (slot === 0 ? 1.2 : 0.7);
  if (R(c, 31 + slot) >= chance) return;
  const pool = [c.chord[0], c.chord[1], c.chord[2], c.chord[0] + cfg.extra[0], c.chord[0] + cfg.extra[1]],
    midi =
      pool[Math.floor(R(c, 35 + slot) * pool.length)] + cfg.low + 12 * Math.floor(R(c, 39 + slot) * (cfg.span + 1));
  BLOOM_VOICE[cfg.voice](
    k.g,
    midiToFreq(midi),
    cfg.vol * (0.7 + 0.3 * R(c, 43 + slot)),
    cfg.len * (0.8 + 0.4 * R(c, 47 + slot)),
    {
      pan: P(c, 51 + slot, cfg.width),
      rev: cfg.echo,
      opt: true,
    },
  );
}
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

/* The Glass Flats, 92 BPM, D major (D A Bm G): noon over the sheet glass. A glassine motif, a wide
   bright pad, the sub; the heat shimmers in two slow bands that sing against the chords, glass pings
   ring off the chord tones and the dust hisses on the off beats as it swells */
function glassCalm(e, c) {
  const { b, bar, L, chord, root } = c,
    k = kit(e, c);
  calmMotif(k, c, "glassine");
  calmPad(k, c, "flats");
  calmFloor(k, c, { f0: 110, f1: 44, dur: 0.26 });
  // the signature: the heat shimmer - two slow bands that hold through the bar and bend against
  // each chord (the band's tonal floor, like the Caldera's pedal but wide)
  if (b === 0) {
    k.d.t(midiToFreq(chord[0] + 24), c.barSec * 1.06, "sine", 0.012, { lp: 5200, attack: 0.2, pan: -0.3, rev: 0.2 });
    k.d.t(midiToFreq(chord[2] + 24), c.barSec * 1.06, "sine", 0.009, {
      lp: 6200,
      attack: 0.24,
      pan: 0.32,
      det: 4,
      rev: 0.2,
    });
  }
  // glass pings ring off the chord every other beat (high, against the shimmer)
  if (b % 2 === 0 && b % 8 !== 0)
    VOICE.glassine(k.d, midiToFreq(chord[[1, 2, 0][(b >> 1) % 3]] + 24), 0.008, { lite: true, pan: 0.34 });
  // sand hisses on the off beats as the fight swells
  if (L > 0.3 && b % 4 === 3)
    k.m.n(0.012, 0.004, { type: "bandpass", f: 2600, to: 1500, q: 1.3, color: "pink", pan: P(c, 6, 0.7) });
  // the ground breathes: a low drum walks the down-beats late in the fight (root, fifth, root, a step up)
  if (L > 0.45 && b % 4 === 0) {
    const walk = [root - 24, root - 17, root - 24, root - 14][b >> 2];
    k.p.t(midiToFreq(walk), 0.4, "triangle", 0.05, { lp: 560, attack: 0.004 });
  }
  // a far devil moans under every fourth bar's head (the scape carries the rest)
  if (L > 0.2 && (bar & 3) === 3 && b === 0 && R(c, 30) < 0.5)
    k.d.t(midiToFreq(chord[1] - 12), c.barSec * 1.3, "sawtooth", 0.006, { lp: 420, attack: 0.5, pan: -0.4 });
}

/* The Glass Flats' own boss (the Glasswyrm, 134 BPM): it comes up from below. Drop: a hot four on the
   floor, glass shard plucks answering the snare, the glassine motif over it, a brass line; variation:
   the shimmer bands bend against the chord and the glass runs in sixteenths under the choir;
   breakdown: the shimmer alone, then the roll builds the surface burst */
function glassBoss(e, c) {
  const { b, bar, sec, root, chord } = c,
    k = kit(e, c);
  if (sec <= 2) calmMotif(k, c, "glassine", sec === 2 ? 1.4 : 1.7, sec !== 2, sec !== 2);
  sectionHit(k, c);
  bossFill(k, c);
  bossCycle(k, c);
  if (sec <= 1) {
    // the surface run: a hot four, the sand drum on the "and" of two and four
    if (b === 0 || b === 10) kick(k, 0.5, { f0: 130, f1: 42, dur: 0.16, pump: 0.5 });
    if (b === 8) kick(k, 0.3, { f0: 120, f1: 40, dur: 0.14, pump: 0.4 });
    if (b % 4 === 0) taiko(k, 0.24, { f: 98, pan: b === 0 ? -0.12 : 0.12 });
    if (b === 4 || b === 12) {
      bigSnare(k, 0.2, { f: 1500, bf: 185 });
      shardPluck(k, c, 0.036, { pan: b === 4 ? -0.32 : 0.32 });
    }
    if (b === 6 || b === 14) taiko(k, 0.28, { f: 88, pan: b === 6 ? -0.3 : 0.3 });
    if (pat(CHUG_BASS)[b]) {
      k.p.t(midiToFreq(root - 24 + CHUG_OCT[b]), 0.12, "sawtooth", 0.05, { lp: 950, lpTo: 420, q: 2.2 });
      if (b % 8 === 0) sub(k, root, 0.2, 0.12);
    }
    // the brass stabs up the chord while the surface walks
    if (b === 2 && (bar & 1) === 0) brass(k, chord[0], 0.18, 0.028, { lp: 500, lpTo: 2500, hold: 0.08 });
    if (sec === 1) {
      if (b === 0 || b === 8) brass(k, chord[[0, 2][(bar >> 1) & 1]], 0.38, 0.03, { lp: 460, lpTo: 2700, hold: 0.13 });
      if (b % 2 === 0 && bar >= 12) strings(k, chord[[0, 2, 1, 2][(b >> 1) & 3]] + 12, 0.019, { lp: 2000 });
      if (bar >= 12 && b === 0) choir(k, [chord[0] + 12, chord[2] + 12], c.barSec, 0.028);
    }
  } else if (sec === 2) {
    if (b === 0) {
      taiko(k, 0.52, { f: 64, deep: true, dur: 0.75 });
      sub(k, root, 1.05, 0.2);
      choir(k, [chord[0] + 12, chord[1] + 12, chord[2] + 12], c.barSec + 0.35, 0.028);
    }
    if (b === 8) bigSnare(k, 0.22, { f: 1300, bf: 175, dur: 0.26, rev: 0.8 });
    if (b % 4 === 2) shardPluck(k, c, 0.024, { pan: P(c, 20, 0.8) });
    // the glass runs: a fast shimmer line up the chord late in the variation
    if (bar >= 14 && b % 2 === 0)
      k.d.t(midiToFreq(chord[[0, 1, 2, 3][(b >> 1) & 3]] + 24), 0.3, "sine", 0.008, { lp: 7000, pan: P(c, 30, 0.8) });
  } else {
    buildRoll(k, c, 84);
    if (b % 4 === 0) kick(k, 0.3 + 0.1 * (bar - 20), { f0: 130, f1: 44, dur: 0.15 });
    k.p.t(midiToFreq(root - 24 + Math.floor(((bar - 20) * 16 + b) / 2)), 0.09, "sawtooth", 0.048, { lp: 1000, q: 2 });
    // the surface burst climbs over the last two bars: a shimmer line rising with the roll
    buildRiser(k, c);
    if (bar >= 20 && b % 2 === 0)
      k.d.t(midiToFreq(chord[0] + 24 + ((bar - 20) * 8 + b) / 2), 0.22, "sine", 0.007, {
        lp: 7200,
        pan: P(c, 24, 0.8),
      });
  }
}
// the shard pluck (the flats' boss percussion: a glassy ping and a short grain of sand - the anvil
// slot of the hammer track, revoiced for the open noon)
function shardPluck(k, c, vol, o = {}) {
  k.d.n(0.025, vol * 1.3, { type: "bandpass", f: 3400, q: 4.5, color: "pink", attack: 0.001, ...o });
  k.d.t(1976, 0.12, "sine", vol, { at: 0.003, ...o, lp: 7400 });
  k.d.t(2637, 0.09, "sine", vol * 0.6, { at: 0.005, ...o, lp: 8000 });
}

/* The Crucible's hammer track (126 BPM, D major): built when the foundry golem carried the Flats for
   a season (3.53.0); the golem is benched again (3.56.0) and the track stays defined and tested with
   it. Drop: a heavy four on the floor with the forge's anvil answering, the glassine motif over it, a
   hot brass line; variation: the glass runs in sixteenths and the choir sings the chord; breakdown:
   the shimmer alone, then the hammer builds it back */
function forgeBoss(e, c) {
  const { b, bar, sec, root, chord } = c,
    k = kit(e, c);
  if (sec <= 2) calmMotif(k, c, "glassine", sec === 2 ? 1.4 : 1.7, sec !== 2, sec !== 2);
  sectionHit(k, c);
  bossFill(k, c);
  bossCycle(k, c);
  if (sec <= 1) {
    // the hammer: a heavy four, the anvil on the "and" of two and four
    if (b === 0 || b === 8) kick(k, 0.5, { f0: 120, f1: 44, dur: 0.16, pump: 0.5 });
    if (b === 4 || b === 12) {
      bigSnare(k, 0.2, { f: 1500, bf: 185 });
      forgeKnock(k, c, 0.04, { pan: b === 4 ? -0.32 : 0.32 });
    }
    if (b % 4 === 2) taiko(k, 0.22, { f: 92, pan: b === 2 ? -0.28 : 0.28 });
    if (pat(CHUG_BASS)[b]) {
      k.p.t(midiToFreq(root - 24 + CHUG_OCT[b]), 0.12, "sawtooth", 0.05, { lp: 900, lpTo: 420, q: 2.2 });
      if (b % 8 === 0) sub(k, root, 0.2, 0.12);
    }
    // the brass stabs up the chord while the hammer walks
    if (b === 6 && (bar & 1) === 0) brass(k, chord[2], 0.16, 0.028, { lp: 480, lpTo: 2500, hold: 0.08 });
    if (sec === 1) {
      if (b === 0 || b === 8) brass(k, chord[[0, 2][(bar >> 1) & 1]], 0.38, 0.03, { lp: 460, lpTo: 2700, hold: 0.13 });
      if (b % 2 === 0 && bar >= 12) strings(k, chord[[0, 2, 1, 2][(b >> 1) & 3]] + 12, 0.019, { lp: 2000 });
      if (bar >= 12 && b === 0) choir(k, [chord[0] + 12, chord[2] + 12], c.barSec, 0.028);
    }
  } else if (sec === 2) {
    if (b === 0) {
      taiko(k, 0.52, { f: 64, deep: true, dur: 0.75 });
      sub(k, root, 1.05, 0.2);
      choir(k, [chord[0] + 12, chord[1] + 12, chord[2] + 12], c.barSec + 0.35, 0.028);
    }
    if (b === 8) bigSnare(k, 0.22, { f: 1300, bf: 175, dur: 0.26, rev: 0.8 });
    if (b % 4 === 2) forgeKnock(k, c, 0.024, { pan: P(c, 20, 0.8) });
    // the glass runs: a fast shimmer line up the chord late in the variation
    if (bar >= 14 && b % 2 === 0)
      k.d.t(midiToFreq(chord[[0, 1, 2, 3][(b >> 1) & 3]] + 24), 0.3, "sine", 0.008, { lp: 7000, pan: P(c, 30, 0.8) });
  } else {
    buildRoll(k, c, 84);
    if (b % 4 === 0) kick(k, 0.3 + 0.1 * (bar - 20), { f0: 120, f1: 44, dur: 0.15 });
    k.p.t(midiToFreq(root - 24 + Math.floor(((bar - 20) * 16 + b) / 2)), 0.09, "sawtooth", 0.048, { lp: 1000, q: 2 });
    // the heat riser over the last two bars (the same slow burn the march's eruption had)
    eruptionRiser(k, c);
    buildRiser(k, c);
  }
}
// the hammer's knock (the anvil of the old works, revoiced for the open sand - shorter, hotter; the
// noise share stays near the caldera knock's so the boss track keeps its tonal floor)
function forgeKnock(k, c, vol, o = {}) {
  k.d.n(0.03, vol * 1.6, { type: "bandpass", f: 3100, q: 5, color: "pink", attack: 0.001, ...o });
  k.d.t(1244, 0.14, "sine", vol, { at: 0.004, ...o, lp: 6200 });
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
  // 3.46.0: the club under the rain: a piano comp on the "and" of the first and the third beat, a short
  // seventh chord in the echo that answers the walking bass (the swing of the track carries the rest)
  if (L > 0.35 && (b === 2 || b === 10) && R(c, 30) < 0.8) {
    const pan = b === 2 ? -0.35 : 0.35;
    VOICE.piano(k.d, midiToFreq(chord[1] + 12), 0.018 * VOICE_GAIN.piano, { pan, lite: true });
    VOICE.piano(k.d, midiToFreq(chord[0] + 22), 0.014 * VOICE_GAIN.piano, { pan, lite: true, at: 0.012 });
  }
  // 3.14.0: noir. As it swells, a walking bass on every beat (root, fifth, third, a step towards the next chord) and
  // brushes: a soft sweep on 2 and 4, light taps on the eighths
  if (L > 0.3 && b % 4 === 0) {
    const walk = [root - 24, chord[2] - 24, chord[1] - 24, root - 22][b >> 2];
    k.p.t(midiToFreq(walk), 0.42, "triangle", 0.06, { lp: 520, attack: 0.004 });
  }
  if (L > 0.25 && (b === 4 || b === 12))
    k.m.n(0.2, 0.014, { type: "bandpass", f: 3200, to: 2400, q: 0.8, attack: 0.06, pan: 0.2, rev: 0.3 });
  if (L > 0.4 && b % 2 === 0 && b !== 4 && b !== 12)
    k.m.n(0.03, 0.005, { type: "highpass", f: 5200, attack: 0.002, pan: -0.2 });
  // the far siren sings on the chord (up and down a minor third from its root)
  if (bar % 8 === 5 && b === 0) {
    const lo = midiToFreq(chord[0] + 24),
      hi = midiToFreq(chord[0] + 27);
    k.d.t(lo, 0.9, "triangle", 0.012, { to: hi, attack: 0.3, opt: true, rev: 0.7, pan: -0.6 });
    k.d.t(hi, 0.9, "triangle", 0.01, { to: lo, at: 0.9, attack: 0.1, opt: true, rev: 0.7, pan: -0.6 });
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

/* The Aurora Shelf, 72 BPM, E minor (Em C G D, the chords breathe over two bars): an ice cavern. No beat at all until the
   intensity is high (then a slow heartbeat), bells of ice in the echo and the room whose pattern changes per section,
   a glass pad, a deep sub on every chord, ticks of ice, cracks, wind chimes and a creak (a wind that sings on the chord
   is the atmosphere). The model of the other themes. Every eighth bar a run of glass slides down the chord and rings
   out in the echo (the harmonica of the cavern). */
const VAULT_CHIME = [76, 79, 81, 83, 86, 88];
function vaultCalm(e, c) {
  const { b, bar, L } = c,
    k = kit(e, c);
  calmMotif(k, c, "ice");
  calmPad(k, c, "vault");
  calmFloor(k, c, { f0: 100, f1: 40, dur: 0.25 });
  // 3.46.0: the harmonica of the cavern: on every eighth bar a slow run of glass slides down the chord
  // (five tones over the bar, wide in the room), the sound of a breath on the frozen walls
  if ((bar & 7) === 3 && b % 3 === 0) {
    const i = b / 3,
      f = midiToFreq(c.chord[[3, 2, 1, 0, 2, 1][i]] + 36);
    k.d.t(f, 1.1, "sine", 0.011, { to: f * 0.985, attack: 0.09, pan: (i - 2) * 0.35, rev: 0.8, opt: true });
  }
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
  // 3.17.0: the vault keeps time as it swells (like the other places since 3.14.0): icicles tick on the off-beats in
  // a falling figure on the chord, the ice creaks on 2 and 4, and a gust of wind breathes in over every fourth bar
  if (L > 0.35 && b % 4 === 2) {
    const f = midiToFreq(c.chord[[2, 1, 0, 1][b >> 2]] + 36);
    k.m.t(f, 0.05, "sine", 0.014, { to: f * 0.97, pan: b % 8 === 2 ? -0.45 : 0.45, rev: 0.5 });
  }
  if (L > 0.5 && (b === 4 || b === 12))
    k.m.n(0.05, 0.012, { type: "bandpass", f: 2600, to: 1500, q: 3, color: "pink", attack: 0.002, pan: 0.2 });
  if (L > 0.45 && (bar & 3) === 3 && b === 0)
    k.m.n(c.barSec, 0.02, {
      type: "bandpass",
      f: 500,
      to: 1400,
      q: 1.2,
      color: "pink",
      attack: c.barSec * 0.8,
      opt: true,
    });
}

const LOG_DRUM = "x..x..x...x.x...";
/* The Glowmarsh, 69 BPM, F minor (Fm Ab Eb Cm): a foggy bayou at night. A kalimba motif, a soft wobbling pad, the sub;
   a dub answer of the kalimba in the low octave (the echo carries it); rising bubbles, frog croaks, mud squelches,
   crickets (the murk is the atmosphere) */
function marshCalm(e, c) {
  const { b, bar, L, chord } = c,
    k = kit(e, c);
  calmMotif(k, c, "kalimba");
  calmPad(k, c, "marsh");
  calmFloor(k, c, { f0: 115, f1: 40, dur: 0.24 });
  // 3.46.0: the dub answer: on the last off-beat of the bar the kalimba drops an octave and the echo
  // carries the note into the next one (lazy, out of the swamp)
  if (L > 0.25 && (b === 7 || b === 15) && R(c, 20) < 0.55)
    VOICE.kalimba(k.d, midiToFreq(chord[b === 7 ? 0 : 2] - 12), 0.026 * VOICE_GAIN.kalimba, {
      pan: b === 7 ? 0.4 : -0.4,
    });
  if (R(c, 4) < 0.08 + 0.05 * L) {
    const f = 170 + R(c, 5) * 500,
      pan = P(c, 6, 0.8);
    k.m.t(f, 0.09, "sine", 0.045, { to: f * 1.9, opt: true, pan });
    if (R(c, 7) < 0.25) k.m.t(f * 0.7, 0.07, "sine", 0.03, { to: f * 1.4, at: 0.07, opt: true, pan });
  }
  // 3.14.0: bayou. As it swells, a log drum on the root and fifth in a lazy syncopation, and the frogs croak in time
  // (on the "and" of 2 and 4) instead of anywhere
  if (L > 0.3 && pat(LOG_DRUM)[b]) {
    const f = midiToFreq((b % 8 === 6 ? chord[2] : chord[0]) - 12);
    k.p.t(f, 0.2, "sine", 0.05, { to: f * 0.86, attack: 0.002 });
    k.m.n(0.012, 0.012, { type: "bandpass", f: 1400, q: 3, attack: 0.001 });
  }
  if ((b === 6 || b === 14) && R(c, 8) < 0.2 + 0.35 * L) {
    const f = Math.max(90, Math.min(130, midiToFreq(chord[0] - 12))),
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

/* The Shattered Core, 60 BPM, F# minor (F#m D A E, the chords breathe over two bars): dark and breathing. A glass motif, low
   detuned drones as the pad, the sub; a whisper chant on the head of every second bar; a reversed swell before every
   fourth bar, long pings far away (the beating drones, the space wind and the eerie tone are the atmosphere) */
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
  // 3.46.0: the chant of the core: a whisper on the head of every second bar, a vowel that walks the
  // formants and leans to the other side each time (something is in there, and it is breathing)
  if ((bar & 1) === 0 && b === 0 && L > 0.15) {
    const [f1, f2] = VOID_FORMANTS[(bar >> 1) % 3];
    formant(k.d, chord[0] < 50 ? f1 : f1 * 1.12, f2, c.barSec * 0.7, 0.014, {
      attack: 0.25,
      pan: (bar >> 1) & 1 ? 0.5 : -0.5,
      rev: 0.6,
      opt: true,
    });
  }
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
  // 3.14.0: a choir swells at the head of every fourth bar as it grows, and glitches stutter in time at the end of
  // every second bar (three sixteenths on a chord tone, high and short)
  if (L > 0.3 && (bar & 3) === 0 && b === 0) choir(k, [chord[0] + 12, chord[2] + 12], c.barSec * 2, 0.016);
  if (L > 0.35 && (bar & 1) === 1 && b === 13)
    for (let i = 0; i < 3; i++)
      k.m.t(midiToFreq(chord[i % 3] + 36), 0.025, "square", 0.007, {
        lp: 3200,
        at: (i * c.barSec) / 16,
        opt: true,
        pan: P(c, 20 + i, 0.7),
      });
}

/* ---- Ashfall Caldera, 84 BPM, G minor (Gm Eb F D): the mountain keeps its own slow time. A struck
   obsidian motif, a dark pad, the sub; the crust cracks on a fixed sparse pattern (the signature of
   the place - fixed, because a flood of noise grains would own the 2-12 kHz band's windows) and a
   deep drum walks under it; a horn answers from far up the slope every fourth bar and gas hisses
   through the cracks (the rumble and the pulse of the mountain are the atmosphere). 3.49.0. ---- */
const CALDERA_CRACK = ".x...x...x...x..";
/* the crust cracking: two grains of filtered noise, the second lower, the pan wanders with the slope */
function calderaKnock(k, c, v, o = {}) {
  k.m.n(0.02, v, { type: "bandpass", f: 520, q: 4.2, attack: 0.001, pan: o.pan ?? 0.15, at: o.at });
  k.m.n(0.014, v * 0.6, {
    type: "bandpass",
    f: 340,
    q: 3.4,
    attack: 0.001,
    at: (o.at || 0) + 0.006,
    pan: (o.pan ?? 0.15) * -0.8,
  });
}
function calderaCalm(e, c) {
  const { b, bar, L, chord, root } = c,
    k = kit(e, c);
  calmMotif(k, c, "cinder");
  calmPad(k, c, "club");
  calmFloor(k, c, { f0: 92, f1: 36, dur: 0.3 });
  // the signature: the crust cracks on the off-beats, a little harder as the fight swells
  if (L > 0.2 && pat(CALDERA_CRACK)[b]) calderaKnock(k, c, 0.009 + 0.006 * L, { pan: (b & 2) * 0.2 - 0.1 });
  // a deep drum walks the down-beats as it swells (root, fifth, root, a step down)
  if (L > 0.3 && b % 4 === 0) {
    const walk = [root - 24, root - 17, root - 24, root - 26][b >> 2];
    k.p.t(midiToFreq(walk), 0.42, "triangle", 0.055, { lp: 520, attack: 0.004 });
  }
  // embers ring off the chord every other beat (tones high in the band, against the floor)
  if (b % 2 === 0 && b % 8 !== 0)
    VOICE.cinder(k.d, midiToFreq(chord[[1, 2, 0][(b >> 1) % 3]] + 24), 0.009, { lite: true, pan: 0.35 });
  // the heat shimmer: a quiet high pedal that holds through the bar - the band's tonal floor
  if (b === 0) {
    k.d.t(midiToFreq(chord[1] + 24), c.barSec * 1.05, "triangle", 0.011, {
      lp: 2400,
      attack: 0.18,
      rev: 0.15,
      pan: -0.25,
    });
    k.d.t(midiToFreq(chord[1] + 36), c.barSec * 1.05, "sine", 0.005, {
      lp: 6000,
      attack: 0.22,
      rev: 0.1,
      pan: 0.3,
    });
  }
  // the mountain inhales: a slow two-note pressure on the "and" of one every other bar
  if (L > 0.45 && b === 2 && (bar & 1) === 0 && R(c, 30) < 0.7)
    VOICE.cinder(k.d, midiToFreq(chord[2] + 12), 0.014, { lite: true, pan: -0.3 });
  // brushes of ash on 2 and 4, light
  if (L > 0.35 && (b === 4 || b === 12))
    k.m.n(0.2, 0.005, { type: "bandpass", f: 1700, to: 1100, q: 1.2, attack: 0.07, pan: 0.25, rev: 0.3 });
  // the horn up the slope: every fourth bar a brassy line opens over the chord and sighs down
  if ((bar & 3) === 2 && b === 0) {
    const n = chord[[0, 2, 1][(bar >> 3) % 3]] + 12;
    k.d.t(midiToFreq(n), c.barSec * 1.1, "sawtooth", 0.013, {
      to: midiToFreq(n - 2),
      lp: 1600,
      attack: 0.22,
      rev: 0.3,
      pan: -0.5,
      opt: true,
    });
  }
}

/* ---------- boss tracks ---------- */

/* 3.7.0: the boss tracks were metal (double-tracked distorted guitars, blast beats, crash and china cymbals); in
   WebAudio the guitars were a fizz and the cymbals a hiss. They are cinematic synth now: taikos and big drums, staccato
   strings, brass that opens like a horn, a choir, arpeggios, a sub bass that pumps with the kick, and no cymbal at all
   (soft shakers keep the time). Each boss has a style of its own, and each track still carries the motif of its biome
   on the instrument of the calm theme, so a boss sounds like its place at its darkest. The sections stay: drop (bars
   0-7), variation (8-15), breakdown (16-19), build (20-21); a section opens with a deep taiko and a brass swell.
   3.46.0: the boss tracks are epic now, not just loud: the theme of the place rings out in two octaves (the heroic
   motif), a choir pedal breathes under the drop from the first bar, tom fills walk into every section change, the
   hits land with a sub drop of their own, and a long fight grows - from the second loop a string counter-line walks
   above the drop. The arrival itself (musicImpact below) is a braam now. */
function bossSection(bar) {
  return bar < 8 ? 0 : bar < 16 ? 1 : bar < 20 ? 2 : 3;
}
/* the hit at the head of the variation, the breakdown and every new round of the drop */
function sectionHit(k, c) {
  if (c.b !== 0 || !(c.bar === 8 || c.bar === 16 || (c.bar === 0 && c.cycle > 0))) return;
  taiko(k, 0.5, { f: 64, deep: true, dur: 0.7, rev: 0.6 });
  // 3.46.0: the sections land harder: a sub drops with the hit under the brass
  sub(k, c.root, 0.9, 0.16);
  brass(k, c.root - 12, c.barSec * 0.9, 0.035, { lp: 200, lpTo: 1600 });
}
/* 3.46.0: a tom fill walks the last three sixteenths of bars 7 and 15 into every section change */
function bossFill(k, c) {
  if ((c.bar === 7 || c.bar === 15) && c.b >= 13)
    tom(k, 0.14 + 0.04 * (c.b - 13), 150 + (c.b - 13) * 55, { pan: (c.b - 14) * 0.5 });
}
/* 3.46.0: a long fight grows: from the second loop of a boss track a quiet string counter-line walks the chord one
   bar in four, two octaves up (short notes, so the voice budget of the drop never fills) */
function bossCycle(k, c) {
  if (c.cycle > 0 && c.sec <= 1 && c.b % 4 === 0)
    strings(k, c.chord[[0, 2, 1, 2][(c.b >> 2) & 3]] + 24, 0.013, { lp: 2400, dur: 0.08, single: true });
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
  if (sec <= 2) calmMotif(k, c, "piano", sec === 2 ? 1.4 : 1.6, sec !== 2, sec !== 2);
  sectionHit(k, c);
  bossFill(k, c);
  bossCycle(k, c);
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

/* The Aurora Shelf boss (Frost Prism), 138 BPM, E minor (Em C G D): ice trance. Drop: a soft four on the floor that pumps
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
    if (b === 4 || b === 12) {
      clap(k, 0.07);
      // 3.17.0: the place in the drums: an ice crack doubles the clap
      k.m.n(0.06, 0.03, { type: "bandpass", f: 3200, to: 1600, q: 2.5, color: "pink", attack: 0.002, pan: 0.15 });
    }
    // and icicles fall on the last sixteenths of every second bar
    if ((bar & 1) === 1 && b >= 13) {
      const f = midiToFreq(chord[(16 - b) % 3] + 36);
      k.m.t(f, 0.06, "sine", 0.022, { to: f * 0.96, pan: (b - 14) * 0.4, rev: 0.4 });
    }
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
    // 3.46.0: the bells of the vault run down the chord into the drop (the cascade before the wall)
    if (b % 4 === 0)
      bell(k.d, midiToFreq(chord[[3, 2, 1, 0, 0, 1, 2, 3][(bar - 20) * 4 + (b >> 2)]] + 24), 0.04, 0.8, { rev: 0.6 });
    if (bar === 20 ? b % 4 === 0 : b % 2 === 0) kick(k, 0.4, { f0: 130, f1: 44, dur: 0.16 });
    if (bar === 21 || b % 2 === 0) clap(k, 0.025 + 0.06 * (n / 32));
    pluck(k, chord[ICE_ARP[b % 8]] + 24 + Math.floor(n / 8), 0.02, { wave: "triangle", lp: 1200 + n * 90 });
    buildRiser(k, c);
  }
}

/* The Glowmarsh boss (Hive Queen), 116 BPM, F minor (Fm Ab Eb Cm): tribal and acid. Drop: deep drums every six
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
  if (sec <= 2) calmMotif(k, c, "kalimba", 1.7, sec !== 2, sec !== 2);
  sectionHit(k, c);
  bossFill(k, c);
  bossCycle(k, c);
  if (sec <= 1) {
    if (pat(TRIBE_DEEP)[b]) taiko(k, 0.45, { f: 78, deep: b === 0, pan: b === 6 ? -0.25 : b === 12 ? 0.25 : 0 });
    if (pat(TRIBE_HAND)[b]) {
      slap(k, 0.12, { pan: 0.4 });
      // 3.17.0: the place in the drums: a frog croaks with the hand drum on the root of the chord (every second bar)
      if ((bar & 1) === 0) {
        const f = midiToFreq(root - 12);
        k.m.t(f, 0.07, "square", 0.02, { lp: 900, to: f * 0.8, pan: 0.5 });
        k.m.t(f, 0.07, "square", 0.016, { lp: 900, to: f * 0.8, at: 0.09, pan: 0.5 });
      }
    }
    if (pat(TRIBE_GHOST)[b]) {
      tom(k, 0.06, 180 + (b % 3) * 30, { pan: -0.4 });
      // and the acid bubbles pop on the ghost notes
      const f = 300 + (b % 3) * 90;
      k.m.t(f, 0.06, "sine", 0.03, { to: f * 2, pan: -0.5 });
    }
    if (b === 0) {
      kick(k, 0.3, { f0: 120, f1: 42, dur: 0.18, pump: 0.5 });
      sub(k, root, c.barSec * 0.9, 0.14);
    }
    if (sec === 1 || b % 2 === 0) acid(sec === 1 ? 900 : 0);
    if (b === 0 && (bar & 1) === 0) swarm(k, [chord[0] + 12, chord[2] + 12], c.barSec * 2, 0.016);
    if (sec === 1) {
      shaker(k, b % 2 ? 0.018 : 0.03, b % 4 < 2 ? -0.5 : 0.5);
      // 3.46.0: the war chant gets its horns: the brass answers every deep drum of the chant
      if (pat(TRIBE_DEEP)[b]) brass(k, chord[0] + 12, 0.22, 0.02, { lp: 500, lpTo: 2400, hold: 0.06 });
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

/* The Shattered Core boss (Rift Core), 172 BPM, F# minor (F#m D A E): the finale, drum and bass with a choir. Drop: a breakbeat
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
  // the glass rings long: at 172 BPM always the short (lite) form (the four quotes of the variation carry the theme)
  if (sec === 0 || sec === 2) calmMotif(k, c, "glass", 1.6, true);
  else if (sec === 1) calmMotif(k, c, QUOTES[q], 1.6, true);
  sectionHit(k, c);
  bossFill(k, c);
  if (sec <= 1) {
    if (pat(BREAK_K[q === 3 ? 1 : 0])[b]) kick(k, 0.5, { f0: 160, f1: 44, dur: 0.14, pump: 0.5 });
    if (b === 4 || b === 12) bigSnare(k, 0.2, { f: 1700, bf: 230, dur: 0.12, rev: 0.25 });
    else if (pat(BREAK_GHOST)[b] && R(c, 1) < 0.6) bigSnare(k, 0.05, { f: 1900, bf: 250, dur: 0.06, rev: 0.1 });
    // 3.17.0: the place in the drums: the rift glitches in time at the end of every second bar (three stuttered
    // chord tones), and a reversed swell pulls into every fourth bar
    if ((bar & 1) === 1 && b >= 13)
      k.m.t(midiToFreq(chord[(b - 13) % 3] + 36), 0.03, "square", 0.012, { lp: 3500, pan: (b - 14) * 0.5 });
    if ((bar & 3) === 3 && b === 8)
      k.m.n(c.barSec * 0.5, 0.03, {
        type: "bandpass",
        f: 600,
        to: 3600,
        q: 1.5,
        color: "pink",
        attack: c.barSec * 0.48,
      });
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
      // 3.46.0: the breakdown choir takes the octave too (the hall sings above the glass)
      taiko(k, 0.55, { f: 62, deep: true, dur: 0.9 });
      choir(k, [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 24], c.barSec + 0.5, 0.028);
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

/* Ashfall Caldera boss (The Ash Tyrant), 132 BPM, G minor: the mountain marches. Drop: a heavy taiko
   on the head of every fourth sixteenth, a chugging eighth-note bass that will not let go (an octave or
   a fifth on top now and then), kick on 1 and the "and" of 3, big snare on 2 and 4 with the crust
   doubling it, taikos on the off-beats, brass stabs between, the obsidian motif, strings walking the
   chord late in the drop; variation: brass takes the chord, the strings answer, the choir in the last
   four bars; breakdown: half time, the choir and the obsidian, big taikos, the mountain cracks wide
   open; build: the taiko roll, the bass climbs, the ERUPTION rises over it all, riser. */
const CHUG_BASS = "x.x.x.x.x.x.x.x.",
  CHUG_OCT = [0, 0, 12, 0, 7, 0, 0, 12, 0, 0, 12, 0, 3, 0, 10, 12];
/* the ERUPTION of the build: two detuned saws glide up a fifth while a formant band sweeps (a growl
   that turns into a roar) - a synthesised voice, all the Caldera's own, that breaks into the drop */
function eruptionRiser(k, c) {
  if (c.bar !== 20 || c.b !== 0) return;
  const d = c.barSec * 2,
    f0 = midiToFreq(c.root + 12);
  for (const det of [-11, 11])
    k.d.t(f0, d, "sawtooth", 0.016, {
      to: f0 * 1.5,
      detune: det,
      lp: 900,
      lpTo: 3400,
      attack: d * 0.55,
      hold: d * 0.1,
      opt: true,
      pan: det < 0 ? -0.2 : 0.2,
    });
  k.d.n(d, 0.02, { type: "bandpass", f: 700, to: 2100, q: 6, color: "pink", attack: d * 0.5, opt: true });
}
function calderaBoss(e, c) {
  const { b, bar, sec, root, chord } = c,
    k = kit(e, c);
  if (sec <= 2) calmMotif(k, c, "cinder", sec === 2 ? 1.4 : 1.7, sec !== 2, sec !== 2);
  sectionHit(k, c);
  bossFill(k, c);
  bossCycle(k, c);
  if (sec <= 1) {
    // the march: a heavy taiko on every fourth sixteenth, kick under 1 and the "and" of 3
    if (b === 0 || b === 10) kick(k, 0.5, { f0: 130, f1: 42, dur: 0.17, pump: 0.5 });
    if (b === 8) kick(k, 0.3, { f0: 120, f1: 40, dur: 0.14, pump: 0.4 });
    if (b % 4 === 0) taiko(k, 0.24, { f: 96, pan: b === 0 ? -0.12 : 0.12 });
    if (b === 4 || b === 12) {
      bigSnare(k, 0.2, { f: 1400, bf: 175 });
      // the crust doubles the snare: two short grains
      calderaKnock(k, c, 0.042, { pan: b === 4 ? -0.35 : 0.35 });
    }
    if (b === 6 || b === 14) taiko(k, 0.3, { f: 84, pan: b === 6 ? -0.3 : 0.3 });
    if (pat(CHUG_BASS)[b]) {
      k.p.t(midiToFreq(root - 24 + CHUG_OCT[b]), 0.12, "sawtooth", 0.052, { lp: 950, lpTo: 380, q: 2.4 });
      if (b % 8 === 0) sub(k, root, 0.2, 0.13);
    }
    // a brass stab on the "and" of every first beat while the march walks
    if (b === 2 && (bar & 1) === 0) brass(k, chord[0], 0.18, 0.03, { lp: 500, lpTo: 2400, hold: 0.08 });
    if (sec === 1) {
      if (b === 0 || b === 8) brass(k, chord[[0, 2][(bar >> 1) & 1]], 0.4, 0.032, { lp: 420, lpTo: 2600, hold: 0.14 });
      if (b % 2 === 0 && bar >= 12) strings(k, chord[[0, 2, 1, 2][(b >> 1) & 3]] + 12, 0.02, { lp: 1900 });
      if (bar >= 12 && b === 0) choir(k, [chord[0] + 12, chord[2] + 12], c.barSec, 0.03);
    }
  } else if (sec === 2) {
    if (b === 0) {
      taiko(k, 0.55, { f: 62, deep: true, dur: 0.8 });
      sub(k, root, 1.1, 0.22);
      choir(k, [chord[0] + 12, chord[1] + 12, chord[2] + 12], c.barSec + 0.4, 0.03);
    }
    if (b === 8) bigSnare(k, 0.24, { f: 1200, bf: 165, dur: 0.28, rev: 0.8 });
    if (b % 4 === 2) calderaKnock(k, c, 0.026, { pan: P(c, 20, 0.8) });
    // the mountain cracks wide open
    if (bar === 17 && b === 0) {
      k.d.n(0.06, 0.02, { type: "bandpass", f: 2600, q: 2, color: "pink", opt: true, pan: -0.7 });
      k.d.n(0.4, 0.014, { type: "bandpass", f: 4600, to: 2200, q: 1, color: "pink", at: 0.05, opt: true, pan: -0.7 });
      k.d.t(64, 0.7, "sine", 0.014, { to: 30, at: 0.02, opt: true, pan: -0.7 });
    }
  } else {
    buildRoll(k, c, 88);
    if (b % 4 === 0) kick(k, 0.3 + 0.1 * (bar - 20), { f0: 130, f1: 42, dur: 0.16 });
    k.p.t(midiToFreq(root - 24 + Math.floor(((bar - 20) * 16 + b) / 2)), 0.09, "sawtooth", 0.05, { lp: 1050, q: 2 });
    // the ERUPTION rises over the last two bars and breaks into the drop
    eruptionRiser(k, c);
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
const BIOME_VOICE = { yard: "piano", vault: "ice", marsh: "kalimba", void: "glass", club: "cinder", flats: "glassine" };
/* 3.48.0: the ambience preview of the Settings slider — one far sound that says "this is the place":
   the City sparks a broken lamp, icicles fall in the Vault, the Glowmarsh answers with frogs, the
   Core shimmers and the Caldera grumbles far away (3.49.0). */
const AMB_PREVIEW = {
  yard: "sparks",
  vault: "icicles",
  marsh: "frogs",
  void: "shimmer",
  club: "farBoom",
  flats: "devilMoan",
};
function musicImpact(e, biome, at) {
  const root = (musicChords[biome] || musicChords.yard)[0][0],
    k = kit(e, { at });
  // 3.46.0: the arrival is a braam now: two detuned saws two octaves down open into the hall under the
  // brass, a second taiko answers the deep one and the choir takes the octave
  taiko(k, 0.75, { f: 48, deep: true, dur: 1.4, rev: 0.8 });
  taiko(k, 0.45, { f: 92, dur: 0.45, rev: 0.4 });
  k.m.t(95, 1.4, "sine", 0.45, { to: 28 });
  for (const det of [-9, 9])
    k.p.t(midiToFreq(root - 24), 2.4, "sawtooth", 0.055, { lp: 130, lpTo: 850, detune: det, attack: 0.02, hold: 0.9 });
  brass(k, root - 12, 1.6, 0.05, { lp: 180, lpTo: 2200, attack: 0.05, hold: 0.5, rev: 0.5 });
  choir(k, [root, root + 7, root + 12, root + 24], 1.6, 0.03, { fade: 0.15 });
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

const MUSIC_TRACKS = {
  // 3.46.0: each calm theme now moves like the place it is: the City swings (noir), the Marsh drags (bayou),
  // the Works, the Vault and the Core let their chords breathe over two bars (chordBars). The boss tracks
  // stay straight and keep one chord per bar (the drama). The gains are the measured ones of 3.45.5 (see
  // the mix note at MUSIC_SCALE) - the epic and the identity come from the notes, not from the level.
  yard: {
    fight: { bpm: 78, bars: 16, swing: 0.26, gain: 1, play: yardCalm },
    boss: { bpm: 128, bars: 22, swing: 0, gain: 1.1, play: yardBoss },
  },
  vault: {
    fight: { bpm: 72, bars: 16, swing: 0, chordBars: 2, gain: 1, play: vaultCalm },
    boss: { bpm: 138, bars: 22, swing: 0, gain: 1, play: vaultBoss },
  },
  marsh: {
    fight: { bpm: 69, bars: 16, swing: 0.17, gain: 1, play: marshCalm },
    boss: { bpm: 116, bars: 22, swing: 0, gain: 1, play: marshBoss },
  },
  void: {
    fight: { bpm: 60, bars: 16, swing: 0, chordBars: 2, gain: 1, play: voidCalm },
    // 3.45.5: the mix note above trimmed the boss make-up; the Shattered Core's boss keeps a step of its own
    // (the deep-test wants every boss track clearly louder than its calm theme; the glue compressor
    // eats part of a track-gain raise, so this one goes to 1.25)
    boss: { bpm: 172, bars: 22, swing: 0, gain: 1.25, play: voidBoss },
  },
  // 3.49.0: the Ashfall Caldera: the calm theme keeps the mountain's slow time (84, straight - the
  // only place that neither swings nor breathes its chords), the boss track is a heavier march (132).
  // The boss gain keeps the versus rule clear of the line (measured with the probe; the glue
  // compressor eats part of a raise, the same as the Core's).
  club: {
    fight: { bpm: 84, bars: 16, swing: 0, gain: 1, play: calderaCalm },
    boss: { bpm: 132, bars: 22, swing: 0, gain: 1.2, play: calderaBoss },
  },
  // 3.53.0: the Glass Flats: the calm theme keeps noon's even walk (92, straight). 3.56.0: the boss
  // track is the wyrm's own (134 - it comes up from below, the glass shard plucks answer the snare);
  // the Crucible's hammer went back to the bench with it. The boss gain keeps the versus rule clear
  // (the glue compressor eats part of a raise - the same note as the Core's and the Caldera's).
  flats: {
    fight: { bpm: 92, bars: 16, swing: 0, gain: 1, play: glassCalm },
    boss: { bpm: 134, bars: 22, swing: 0, gain: 1.2, play: glassBoss },
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
    "eshotWarden",
    "eshotQueen",
    "eshotCore",
    "eshotPrism",
    "eshotForge",
    "eshotKingpin",
    "eshotWeaver",
    "eshotCarrier",
    "eshotFrost",
    "tcPyro",
    "tsPyro",
    "tribute",
    "bwCryo",
    "bwAcid",
    "bwFlame",
    "bwFlare",
    "warn",
    "fuse",
    "spawn",
    "wave",
    "boss",
    "click",
    "erupt",
    "devilNear",
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
  // 3.0.0: the gadget (3.12.0: the Singularity), resisted hits and traps
  ids(["singThrow", "singPull", "singCollapse", "gadgetReady", "gadgetNo", "resist"]);
  // 3.3.0: the Endless mutator
  ids(["mutator"], "volatile");
  // 3.53.0: the sunspike joins the trap families (warn and fire of its own)
  ids(["tcPlate", "tcCrusher", "tcIce", "tcGeyser", "tcRift", "tcSun"], 1);
  for (const id of ["tbLaser", "tbFlame", "tbRift"]) add(id, { id, arg: { delay: 0.7, dur: 1.2 } });
  ids(["tmMine", "tmFrost", "tmSpore", "tmRift"], 0.45);
  for (const skin of ["mine", "frost", "spore", "riftmine"]) ids(["tArm"], skin);
  ids(["tsPlate", "tsCrusher", "tsIce", "tsGeyser", "tsRift", "tsMine", "tsFrost", "tsSpore", "tsRiftMine", "tsSun"]);
  // 3.10.0: the blasts of the attacks of enemies and bosses
  ids(["aQuake", "aLava", "aIce", "aAcid", "aRift"], 2);
  ids(["aFire"], 1);
  // 3.34.0: a Shorted enemy's spot arcs, and its warning
  ids(["aShort"], 1.6);
  ids(["shortFizz"]);
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
  for (const rarity of [1, 2, 3, 4, 5, 6]) ids(["pick"], rarity);
  // 3.17.0: the walker: a footstep on every ground, the landing after a dash
  for (const ground of ["asphalt", "grate", "frost", "ice", "mud", "glass", "acid", "sandglass"])
    add("step:" + ground, { id: "step", arg: { ground } });
  add("land:grate", { id: "land", arg: { ground: "grate" } });
  // 3.15.0: the boss cards
  ids(["bcCage", "bcLock", "bcHammer", "bcReady", "bcShatter", "bcHatch", "bcBurst", "bcImplode"]);
  for (const id of ["elite", "rain", "blackout", "whiteout", "bloom", "riftstorm", "devils"]) ids(["event"], id);
  for (const bed of ["hum", ...Object.keys(AMBIENCE_LEVEL)]) add("bed:" + bed, { bed, stopAt: 1.1, stopRel: 0.1 });
  // 3.43.0: the room tones render too (a short take of each, the real attack is slower than the test fade)
  for (const biome of Object.keys(ROOM_TONE_LEVEL)) add("tone:" + biome, { tone: biome, stopAt: 1.0, fade: 0.25 });
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
  attackVoice,
  AMB_PREVIEW,
};
