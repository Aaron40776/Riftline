// 3.13.0: listen to the soundscapes without playing. For every biome: 30 s of the real scheduler of audio/place.js
// (steady layer, far sounds at their rates, the hazards of the arena), then every far sound of the biome once, two
// seconds apart. Rendered offline in stereo with the rooms; WAV files in tests/shots/scapes/, and MP3 next to them
// when ffmpeg is installed. Usage: node tools/qa.js scape-preview [biome]
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const URL = process.argv[2] || "http://localhost:8124/index.html",
  ONLY = process.argv[3] || "",
  OUT = "tests/shots/scapes";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
await page.goto(URL);
await page.waitForFunction(() => window.__riftTest && window.__riftTest.game, null, { timeout: 90000 });
const biomes = ["yard", "works", "vault", "marsh", "void"].filter((b) => !ONLY || b === ONLY);
for (const biome of biomes) {
  const wav = await page.evaluate(async (biome) => {
    const T = window.__riftTest,
      E = T.game.sound.constructor,
      SR = 44100,
      LIVE = 30,
      far = T.scape[biome].far.map((f) => f.id),
      seconds = LIVE + far.length * 2 + 2,
      ctx = new OfflineAudioContext(2, SR * seconds, SR),
      engine = new E();
    engine.attach(ctx, { room: true });
    engine.biome = biome;
    engine.setVolumes(0.8, 0, 0.8);
    engine.live = () => true;
    const world = new T.World({ seed: 0x3130, weapon: "pulse", threat: 0, ws: {} }),
      index = world.route.indexOf(biome);
    world.startWave(2 + 5 * Math.max(0, index));
    world.state = "fight";
    for (let t = 0.1; t < LIVE; t += 0.1)
      ctx.suspend(t).then(() => {
        world.waveT += 0.1;
        engine.place(world, 0.1);
        ctx.resume();
      });
    far.forEach((id, i) =>
      ctx.suspend(LIVE + 0.5 + i * 2).then(() => {
        engine.placePlay(id, { g: 0.85, pan: i % 2 ? 0.5 : -0.5 });
        ctx.resume();
      }),
    );
    const buf = await ctx.startRendering(),
      L = buf.getChannelData(0),
      R = buf.getChannelData(1),
      n = L.length,
      out = new DataView(new ArrayBuffer(44 + n * 4)),
      text = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    text(0, "RIFF");
    out.setUint32(4, 36 + n * 4, true);
    text(8, "WAVEfmt ");
    out.setUint32(16, 16, true);
    out.setUint16(20, 1, true);
    out.setUint16(22, 2, true);
    out.setUint32(24, SR, true);
    out.setUint32(28, SR * 4, true);
    out.setUint16(32, 4, true);
    out.setUint16(34, 16, true);
    text(36, "data");
    out.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) {
      out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
      out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
    }
    let s = "";
    const bytes = new Uint8Array(out.buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, biome);
  const file = `${OUT}/${biome}.wav`;
  fs.writeFileSync(file, Buffer.from(wav, "base64"));
  const mp3 = spawnSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    file,
    "-b:a",
    "160k",
    file.replace(".wav", ".mp3"),
  ]);
  console.log(biome, file, mp3.status === 0 ? "+ mp3" : "(no ffmpeg: wav only)");
}
await browser.close();
