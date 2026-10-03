import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
await page.goto(process.argv[2] || "http://localhost:8124/index.html");
await page.waitForFunction(() => window.__riftTest && window.__riftTest.game, null, { timeout: 60000 });
const res = await page.evaluate(() => {
  const r = window.__riftTest.selftest();
  return {
    ok: r.ok,
    ms: r.ms,
    fail: r.fail,
    x21: r.expansion21?.fail,
    x22: r.expansion22?.fail,
    x23: r.expansion23,
    v240: r.v240?.fail,
    v246: r.v246?.fail,
    v250A: r.v250A?.fail,
    v250B: r.v250B?.fail,
    v250C: r.v250C?.fail,
    v250D: r.v250D?.fail,
    v260: r.v260?.fail,
    v270Sound: r.v270Sound?.fail,
    v280: r.v280?.fail,
    v291: r.v291?.fail,
    v300: r.v300?.fail,
    v330: r.v330?.fail,
    v360: r.v360?.fail,
  };
});
// 2.7.0: render every sound offline (mono, 44.1 kHz, at most 2 s): no exception, finite samples, not silent,
// below full scale, and every voice has ended when the render does (nothing stays alive)
const sound = await page.evaluate(async (FLAME_CV_MAX) => {
  const engine = window.__riftTest.game.sound.constructor,
    fail = [],
    catalog = engine.catalog();
  let maxPeak = 0,
    longest = 0;
  for (const { name, spec } of catalog) {
    try {
      const r = await engine.renderOffline(spec);
      maxPeak = Math.max(maxPeak, r.peak);
      longest = Math.max(longest, r.lastAudible);
      if (!r.finite) fail.push(name + ": non-finite samples");
      else if (!(r.peak > 0.001 && r.rms > 1e-5)) fail.push(`${name}: silent (peak ${r.peak})`);
      if (r.peak >= 0.95) fail.push(`${name}: clipping (peak ${r.peak})`);
      if (r.maxEnd > 2.05 && !spec.music) fail.push(`${name}: a voice ends after ${r.maxEnd.toFixed(2)} s`);
      if (r.failed) fail.push(name + ": engine error");
    } catch (err) {
      fail.push(`${name}: ${err && err.message}`);
    }
  }
  // 2.9.1: a 1.9 s noise burst (longer than the 1 s noise buffer) must still be audible until its envelope
  // has faded: with the old one-shot buffer it was cut after 0.5-1 s
  for (const rate of [1, 0.5]) {
    const r = await engine.renderOffline({ noise: { dur: 1.9, vol: 0.2, opts: { type: "lowpass", f: 4000, rate } } });
    if (!(r.lastAudible > 1.2)) fail.push(`long noise (rate ${rate}) cut off at ${r.lastAudible.toFixed(2)} s`);
  }
  // 2.9.2: continuous fire must sound continuous. Ember Jet fires 15 times a second; rendered offline for
  // 2 s, the loudness in 40 ms windows between 0.5 s and 1.5 s must not pulse (a ticking sound has a high
  // spread of the window levels relative to their mean; a steady roar a low one)
  const flame = await engine.renderOffline({ burst: { id: "flame", n: 26, interval: 1 / 15 }, wav: true });
  const win = 1764,
    levels = [];
  for (let t = Math.round(0.5 * 44100); t + win <= Math.round(1.5 * 44100); t += win) {
    let sum = 0;
    for (let i = 0; i < win; i++) sum += flame.samples[t + i] ** 2;
    levels.push(Math.sqrt(sum / win));
  }
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length,
    flameCv = Math.sqrt(levels.reduce((a, b) => a + (b - mean) ** 2, 0) / levels.length) / (mean || 1);
  if (!(mean > 0.003)) fail.push(`flame fire is silent (mean level ${mean})`);
  if (!(flameCv < FLAME_CV_MAX))
    fail.push(`flame fire pulses: loudness spread ${flameCv.toFixed(2)} (max ${FLAME_CV_MAX})`);
  return { count: catalog.length, maxPeak, longest, flameCv, fail };
}, 0.3);
res.soundRender = sound;
// 2.9.0: the sounds must differ from each other. Every weapon shot (strict), every death family and every boss
// intro (softer) is rendered and described by four numbers (spectral centroid, duration, zero-crossing rate,
// share of energy below 300 Hz); the distance between every two sounds of a group has to stay above a minimum.
// Also: the music schedules exactly the same notes with and without a flood of sounds (none dropped, none
// skipped), the flood stays below full scale and the voice list of the sounds really was full.
const distinct = await page.evaluate(async () => {
  const engine = window.__riftTest.game.sound.constructor,
    SR = 44100,
    N = 16384;
  const fft = (re, im) => {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      for (let i = 0; i < n; i += len)
        for (let k = 0; k < len / 2; k++) {
          const wr = Math.cos(ang * k),
            wi = Math.sin(ang * k),
            a = i + k,
            b = i + k + len / 2,
            xr = re[b] * wr - im[b] * wi,
            xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
    }
  };
  const features = (x) => {
    let peak = 0;
    for (const v of x) peak = Math.max(peak, Math.abs(v));
    // duration: the last 5 ms window whose rms is above 3 % of the loudest window (the tail counts);
    // attack: the start of the loudest window
    const win = 220,
      rms = [];
    for (let i = 0; i + win <= x.length; i += win) {
      let e = 0;
      for (let k = 0; k < win; k++) e += x[i + k] * x[i + k];
      rms.push(Math.sqrt(e / win));
    }
    const top = Math.max(...rms);
    let last = 0;
    rms.forEach((v, i) => {
      if (v > 0.03 * top) last = i + 1;
    });
    const attack = (rms.indexOf(top) * win) / SR;
    const dur = (last * win) / SR,
      active = Math.min(x.length, Math.max(win, last * win));
    let zc = 0;
    for (let i = 1; i < active; i++) if (x[i - 1] < 0 !== x[i] < 0) zc++;
    const re = new Float64Array(N),
      im = new Float64Array(N);
    for (let i = 0; i < Math.min(N, x.length); i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    let sum = 0,
      weighted = 0,
      low = 0;
    for (let k = 1; k < N / 2; k++) {
      const f = (k * SR) / N,
        p = re[k] * re[k] + im[k] * im[k];
      sum += p;
      weighted += p * f;
      if (f < 300) low += p;
    }
    return { centroid: weighted / sum, dur, zcr: zc / active, low: low / sum, peak, attack };
  };
  const vec = (f) => [
    Math.log2(f.attack + 0.01) * 0.4,
    Math.log2(f.centroid) * 0.9,
    Math.log2(f.dur + 0.03) * 0.8,
    Math.log2(f.zcr + 0.01) * 0.5,
    f.low * 3,
  ];
  const group = async (list) => {
    const feats = [];
    for (const { name, spec } of list) {
      const r = await engine.renderOffline({ ...spec, wav: true });
      feats.push({ name, f: features(r.samples) });
    }
    let min = 1e9,
      pair = "";
    for (let i = 0; i < feats.length; i++)
      for (let j = i + 1; j < feats.length; j++) {
        const a = vec(feats[i].f),
          b = vec(feats[j].f),
          d = Math.hypot(...a.map((v, k) => v - b[k]));
        if (d < min) {
          min = d;
          pair = feats[i].name + " / " + feats[j].name;
        }
      }
    return { min, pair, feats: feats.map((e) => ({ name: e.name, ...e.f })) };
  };
  const catalog = engine.catalog(),
    byName = (names) => names.map((n) => catalog.find((e) => e.name === n));
  const out = { fail: [] };
  out.weapons = await group(byName(["pulse", "scatter", "tesla", "rail", "rocket", "disc", "flame"]));
  out.deaths = await group(
    byName(
      ["dPop", "dSquelch", "dCrunch", "dArmor", "dZap", "dGhost", "dClang", "dRattle", "dShatter"].map(
        (n) => n + ":1.6",
      ),
    ),
  );
  out.bosses = await group(byName(["warden", "forge", "prism", "queen", "core"].map((n) => "bossIntro:" + n)));
  // 3.0.0: every trap strike, the grenade blast and the two big old blasts; the trap warnings of the floor and
  // beam families (the mines' fuse beeps are compared on their own)
  out.strikes = await group(
    byName([
      "tsPlate",
      "tsCrusher",
      "tsIce",
      "tsGeyser",
      "tsRift",
      "tsMine",
      "tsFrost",
      "tsSpore",
      "tsRiftMine",
      "grenadeBlast",
      "nova",
      "boom",
    ]),
  );
  out.warns = await group(
    byName(["tcPlate:1", "tcCrusher:1", "tcIce:1", "tcGeyser:1", "tcRift:1", "tbLaser", "tbFlame", "tbRift"]),
  );
  out.fuses = await group(byName(["tmMine:0.45", "tmFrost:0.45", "tmSpore:0.45", "tmRift:0.45"]));
  out.strikes.min < 0.4 && out.fail.push(`strikes too similar: ${out.strikes.pair} (${out.strikes.min.toFixed(2)})`);
  out.warns.min < 0.3 && out.fail.push(`trap warnings too similar: ${out.warns.pair} (${out.warns.min.toFixed(2)})`);
  out.fuses.min < 0.3 && out.fail.push(`mine fuses too similar: ${out.fuses.pair} (${out.fuses.min.toFixed(2)})`);
  out.weapons.min < 0.6 &&
    out.fail.push(`weapon shots too similar: ${out.weapons.pair} (${out.weapons.min.toFixed(2)})`);
  out.deaths.min < 0.5 &&
    out.fail.push(`death families too similar: ${out.deaths.pair} (${out.deaths.min.toFixed(2)})`);
  out.bosses.min < 0.35 && out.fail.push(`boss intros too similar: ${out.bosses.pair} (${out.bosses.min.toFixed(2)})`);
  out.music = [];
  for (const biome of ["yard", "works", "vault", "void", "marsh"])
    for (const music of ["fight", "boss"]) {
      const calm = await engine.renderOffline({ music, biome }, 4),
        busy = await engine.renderOffline({ music, biome, flood: true }, 4);
      out.music.push({ biome, music, notes: calm.musicScheduled, skipped: busy.musicSkipped, floodPeak: busy.peak });
      if (!calm.musicScheduled) out.fail.push(`${biome}:${music}: no music notes`);
      if (busy.musicScheduled !== calm.musicScheduled || busy.musicSkipped || calm.musicSkipped)
        out.fail.push(
          `${biome}:${music}: music notes dropped in a flood (${calm.musicScheduled} vs ${busy.musicScheduled}, skipped ${busy.musicSkipped})`,
        );
      if (!busy.dropped) out.fail.push(`${biome}:${music}: the flood never filled the voice list`);
      if (!busy.finite || busy.peak >= 0.95) out.fail.push(`${biome}:${music}: flood peak ${busy.peak}`);
    }
  return out;
});
// 3.1.0: the music. (1) The voice budget of the music (its own list of 36 voices since 3.2.0): every calm theme and boss track
// over four loops at several intensities and boss heats never skips or sheds a note, peaks well below the limit,
// schedules exactly the same notes, note by note, with and without a flood of sounds, and the sections of a track
// differ from each other (nothing repeats every four bars). (2) Every track is rendered offline (six bars,
// mono 44.1 kHz) and described by numbers (loudness, spectral centroid, onsets per second and the onset pattern on
// the sixteenth grid of its bar); the five calm themes differ pairwise, the five boss tracks too, and every boss
// track is clearly louder than the calm theme of its biome and not thinner. The tempo of each is the BPM of its track.
const music = await page.evaluate(async () => {
  const E = window.__riftTest.game.sound.constructor,
    SR = 44100,
    N = 4096,
    BIOMES = ["yard", "works", "vault", "marsh", "void"],
    fail = [],
    out = { budget: [], tracks: {}, calmPairs: [], bossPairs: [], versus: [] };
  // ---- (1) the voice budget
  const signature = (log, info, bar0, bars) => {
    const barSec = 240 / info.bpm,
      parts = [];
    for (const v of log) {
      const bar = Math.floor(v.t / barSec + 1e-6);
      if (bar >= bar0 && bar < bar0 + bars) parts.push(`${bar - bar0}:${v.kind}${Math.round(v.pitch)}${v.bus}`);
    }
    return parts.join(",");
  };
  for (const biome of BIOMES) {
    for (const [kind, heat, intensity] of [
      ["fight", 0, 1],
      ["fight", 0, 0.5],
      ["fight", 0, 0.1],
      ["boss", 0, 1],
      ["boss", 1, 1],
      ["boss", 2, 1],
    ]) {
      const name = `${biome}:${kind}:heat${heat}:L${intensity}`,
        a = E.musicBudget({ music: kind, biome, loops: 4, heat, intensity }),
        flooded = intensity === 1 && heat !== 1,
        // a flood of sounds in every step (the sounds are expensive to build: one loop of the two busiest cases)
        b = flooded ? E.musicBudget({ music: kind, biome, loops: 1, heat, intensity, flood: 24 }) : null,
        a1 = flooded ? E.musicBudget({ music: kind, biome, loops: 1, heat, intensity }) : null;
      out.budget.push({ name, peak: a.peak, voices: a.scheduled, perSec: +(a.scheduled / a.seconds).toFixed(1) });
      if (a.failed || (b && b.failed)) fail.push(`${name}: engine error`);
      if (!a.scheduled) fail.push(`${name}: no notes`);
      if (a.skipped || a.shed || (b && (b.skipped || b.shed)))
        fail.push(`${name}: the budget refused notes (${a.skipped}/${a.shed})`);
      if (a.peak > 36) fail.push(`${name}: ${a.peak} voices alive at once (budget 44, essentials keep 8 spare)`);
      if (b) {
        if (a1.scheduled !== b.scheduled || JSON.stringify(a1.log) !== JSON.stringify(b.log))
          fail.push(`${name}: notes differ with a flood of sounds (${a1.scheduled} vs ${b.scheduled})`);
        if (!b.dropped) fail.push(`${name}: the flood never filled the voice list of the sounds`);
      }
    }
    // the sections differ: four calm sections, the boss drop / variation / breakdown / build
    const info = E.trackInfo("fight", biome),
      calm = E.musicBudget({ music: "fight", biome, loops: 1, intensity: 0.9 }),
      sigs = [0, 4, 8, 12].map((bar) => signature(calm.log, info, bar, 4));
    if (new Set(sigs).size !== 4) fail.push(`${biome}: calm sections repeat each other`);
    const boss = E.musicBudget({ music: "boss", biome, loops: 1 }),
      binfo = E.trackInfo("boss", biome),
      bsigs = [0, 8, 16, 20].map((bar, i) => signature(boss.log, binfo, bar, i < 2 ? 4 : 2));
    if (new Set(bsigs).size !== 4) fail.push(`${biome}: boss sections repeat each other`);
    // a boss track is longer than a calm one and stays the same length
    if (boss.steps !== 22 * 16 || calm.steps !== 16 * 16) fail.push(`${biome}: wrong track length`);
    // more heat, more notes
    const h0 = E.musicBudget({ music: "boss", biome, loops: 1, heat: 0 }).scheduled,
      h1 = E.musicBudget({ music: "boss", biome, loops: 1, heat: 1 }).scheduled,
      h2 = E.musicBudget({ music: "boss", biome, loops: 1, heat: 2 }).scheduled;
    if (!(h0 < h1 && h1 < h2)) fail.push(`${biome}: boss heat does not add notes (${h0}, ${h1}, ${h2})`);
    // the intensity of the calm theme adds notes too (but never below a bare beat)
    const l0 = E.musicBudget({ music: "fight", biome, loops: 1, intensity: 0 }).scheduled,
      l1 = E.musicBudget({ music: "fight", biome, loops: 1, intensity: 1 }).scheduled;
    if (!(l0 > 100 && l1 > l0)) fail.push(`${biome}: calm intensity (${l0} -> ${l1} notes)`);
  }
  // ---- (2) offline renders and their numbers
  const fft = (re, im) => {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      for (let i = 0; i < n; i += len)
        for (let k = 0; k < len / 2; k++) {
          const wr = Math.cos(ang * k),
            wi = Math.sin(ang * k),
            a = i + k,
            b = i + k + len / 2,
            xr = re[b] * wr - im[b] * wi,
            xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
    }
  };
  const describe = (x, bpm, voices) => {
    const len = 60 / bpm / 4,
      w = 220,
      n = Math.floor(x.length / w),
      db = new Float64Array(n);
    let sum = 0,
      peak = 0;
    for (let i = 0; i < x.length; i++) {
      sum += x[i] * x[i];
      peak = Math.max(peak, Math.abs(x[i]));
    }
    for (let i = 0; i < n; i++) {
      let e = 0;
      for (let k = 0; k < w; k++) e += x[i * w + k] ** 2;
      db[i] = 10 * Math.log10(e / w + 1e-12);
    }
    const onsets = [];
    let last = -99;
    for (let i = 1; i < n; i++)
      if (db[i] - db[i - 1] > 6 && db[i] > -62 && i - last > 6) {
        onsets.push((i * w) / SR);
        last = i;
      }
    const grid = new Array(16).fill(0);
    for (const t of onsets) grid[((Math.round(t / len) % 16) + 16) % 16]++;
    const total = grid.reduce((p, q) => p + q, 0) || 1;
    let cs = 0,
      cn = 0,
      lowSum = 0,
      allSum = 0,
      flatSum = 0,
      flatN = 0;
    for (let at = 0; at + N <= x.length; at += N * 2) {
      const re = new Float64Array(N),
        im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = x[at + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      fft(re, im);
      let p = 0,
        pw = 0,
        logSum = 0,
        bandSum = 0,
        bandN = 0;
      for (let k = 1; k < N / 2; k++) {
        const e = re[k] * re[k] + im[k] * im[k],
          f = (k * SR) / N;
        p += e;
        pw += e * f;
        if (f < 200) lowSum += e;
        allSum += e;
        // 3.7.0: how much the band a phone speaker plays best (2–12 kHz) sounds like noise: the spectral flatness
        // (1 for pure noise, near 0 for tones)
        if (f >= 2000 && f <= 12000) {
          logSum += Math.log(e + 1e-20);
          bandSum += e;
          bandN++;
        }
      }
      if (p > 1e-9) {
        cs += pw / p;
        cn++;
      }
      if (bandSum > 1e-12) {
        flatSum += Math.exp(logSum / bandN) / (bandSum / bandN);
        flatN++;
      }
    }
    return {
      rms: Math.sqrt(sum / x.length),
      peak,
      onsetsPerSec: onsets.length / (x.length / SR),
      centroid: cs / Math.max(1, cn),
      low: lowSum / (allSum || 1),
      flat: flatSum / Math.max(1, flatN),
      // the power above 200 Hz (what a phone speaker plays)
      high: ((allSum - lowSum) / (allSum || 1)) * (sum / x.length),
      grid: grid.map((v) => v / total),
      voicesPerSec: voices / (x.length / SR),
      bpm,
    };
  };
  for (const biome of BIOMES)
    for (const kind of ["fight", "boss"]) {
      const info = E.trackInfo(kind, biome),
        seconds = (6 * 240) / info.bpm,
        r = await E.renderOffline(
          { music: kind, biome, fromBar: kind === "fight" ? 4 : 0, intensity: 0.9, wav: true, log: true },
          seconds,
        ),
        d = describe(r.samples, info.bpm, r.musicLog.length),
        name = `${biome}:${kind}`;
      out.tracks[name] = { ...d, grid: d.grid.map((v) => +v.toFixed(2)) };
      d.name = name;
      out.tracks[name].raw = d;
      if (!r.finite) fail.push(`${name}: non-finite samples`);
      if (r.peak >= 0.95) fail.push(`${name}: clipping (peak ${r.peak})`);
      if (!(d.rms > 0.004)) fail.push(`${name}: silent (rms ${d.rms})`);
      if (r.musicSkipped || r.musicShed) fail.push(`${name}: notes refused while rendering`);
      if (r.failed) fail.push(`${name}: engine error`);
      // 3.7.0: no loud noise. The 2–12 kHz band of every track is mostly tones (flatness below FLAT_MAX), and the
      // atmosphere of a calm theme stays a background: at most BED_MAX of what a phone speaker plays (above 200 Hz;
      // measured as the theme with its atmosphere against the same theme without it). Before 3.7.0 the flatness was
      // 0.12–0.47 and the atmospheres made up to three quarters of it (Cryo Vault).
      const FLAT_MAX = 0.12,
        BED_MAX = 0.25;
      if (d.flat > FLAT_MAX) fail.push(`${name}: noisy (flatness ${d.flat.toFixed(3)} over ${FLAT_MAX})`);
      if (kind === "fight") {
        const bare = await E.renderOffline(
            { music: kind, biome, fromBar: 4, intensity: 0.9, wav: true, noBed: true },
            seconds,
          ),
          db = describe(bare.samples, info.bpm, 0),
          share = Math.max(0, 1 - db.high / d.high);
        out.tracks[name].bed = +share.toFixed(2);
        if (share > BED_MAX) fail.push(`${name}: the atmosphere is ${Math.round(share * 100)} % of the sound`);
      }
    }
  const T = (name) => out.tracks[name].raw,
    gridDist = (a, b) => a.grid.reduce((p, v, i) => p + Math.abs(v - b.grid[i]), 0) / 2,
    pairs = (kind, list) => {
      for (let i = 0; i < BIOMES.length; i++)
        for (let j = i + 1; j < BIOMES.length; j++) {
          const a = T(`${BIOMES[i]}:${kind}`),
            b = T(`${BIOMES[j]}:${kind}`),
            row = {
              pair: `${BIOMES[i]} / ${BIOMES[j]}`,
              tempo: +Math.abs(Math.log2(a.bpm / b.bpm)).toFixed(3),
              rhythm: +gridDist(a, b).toFixed(3),
              centroid: +Math.abs(Math.log2(a.centroid / b.centroid)).toFixed(3),
              density: +Math.abs(Math.log2(a.onsetsPerSec / b.onsetsPerSec)).toFixed(3),
            };
          list.push(row);
        }
    };
  pairs("fight", out.calmPairs);
  pairs("boss", out.bossPairs);
  // the tempos of the calm themes differ by at least 5 % (the boss tracks are free: Yard 175 and Vault 172 BPM are
  // two different genres); and either the rhythm pattern, the tone colour or the busyness differs clearly as well (the pattern distance is between 0 and 1: 0.1 is one tenth of the hits on other steps)
  for (const [label, list] of [
    ["calm", out.calmPairs],
    ["boss", out.bossPairs],
  ])
    for (const row of list) {
      if (label === "calm" && row.tempo < 0.05) fail.push(`${label} ${row.pair}: tempos too close (${row.tempo})`);
      if (!(row.rhythm >= 0.1 || row.centroid >= 0.2 || row.density >= 0.25))
        fail.push(
          `${label} ${row.pair}: too similar (rhythm ${row.rhythm}, colour ${row.centroid}, busyness ${row.density})`,
        );
    }
  for (const biome of BIOMES) {
    const c = T(`${biome}:fight`),
      b = T(`${biome}:boss`),
      row = {
        biome,
        loudness: +(b.rms / c.rms).toFixed(2),
        voices: +(b.voicesPerSec / c.voicesPerSec).toFixed(2),
        bass: +(b.low / c.low).toFixed(2),
      };
    out.versus.push(row);
    if (row.loudness < 1.5)
      fail.push(`${biome}: the boss track is not clearly louder than the calm theme (${row.loudness}x)`);
    if (row.voices < 0.9) fail.push(`${biome}: the boss track is thinner than the calm theme (${row.voices}x notes)`);
  }
  for (const name of Object.keys(out.tracks)) delete out.tracks[name].raw;
  return { ...out, fail };
});
res.music = { fail: music.fail, tracks: Object.keys(music.tracks).length, budgets: music.budget.length };
if (process.env.SOUND_DETAIL) console.error(JSON.stringify(music, null, 1));
if (music.fail.length) res.ok = false;
res.soundDistinct = {
  weapons: { min: distinct.weapons.min, pair: distinct.weapons.pair },
  deaths: { min: distinct.deaths.min, pair: distinct.deaths.pair },
  bosses: { min: distinct.bosses.min, pair: distinct.bosses.pair },
  strikes: { min: distinct.strikes.min, pair: distinct.strikes.pair },
  warns: { min: distinct.warns.min, pair: distinct.warns.pair },
  fuses: { min: distinct.fuses.min, pair: distinct.fuses.pair },
  musicFlood: distinct.music.length,
  fail: distinct.fail,
};
if (process.env.SOUND_DETAIL) console.error(JSON.stringify(distinct, null, 1));
if (distinct.fail.length) res.ok = false;
if (sound.fail.length) res.ok = false;
console.log(JSON.stringify(res, null, 1));
console.log(res.ok ? "DEEP TEST: ok" : "DEEP TEST: FAIL");
await browser.close();
process.exitCode = res.ok ? 0 : 1;
