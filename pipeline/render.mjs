// 逐帧渲染时间轴:打开合成页,对每一帧调用 seek(t) 后截图。
// 用法:node pipeline/render.mjs --name web --fps 30 --scale 0.66667 [--from 0 --to 35] [--gl 0]   → WORK/render/<name>/%05d.jpg
//       node pipeline/render.mjs --stills 0.3,2.1,5.2 --name check                         → WORK/render/<name>/t_*.jpg
import fs from 'node:fs';
import path from 'node:path';
import { launch, ROOT, WORK, pad5, log } from './lib/studio.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 ? process.argv[i + 1] : d;
};
const name = arg('name', 'main');
const fps = Number(arg('fps', 60));
const scale = Number(arg('scale', 1));
const stills = arg('stills', '');
const quality = Number(arg('q', 93));
const sched = JSON.parse(fs.readFileSync(path.join(WORK, 'schedule.json'), 'utf8'));
const from = Number(arg('from', 0));
const to = Math.min(sched.duration, Number(arg('to', sched.duration)));
const outDir = path.join(WORK, 'render', name);
fs.mkdirSync(outDir, { recursive: true });

const viewport = { width: Math.round(1920 * scale), height: Math.round(1080 * scale) };
const { browser, context, page } = await launch({ url: 'file://' + path.join(ROOT, 'pipeline/timeline/index.html'), viewport, dsf: 1, gl: arg('gl', '1') !== '0' });
// --gl 1:开场的三维车身要 WebGL(无显卡时走 SwiftShader,约 0.6 秒/帧);
// --gl 0:录屏段是纯 2D 合成,关掉 GPU 快十几倍。build.mjs 会按"开场 / 录屏"分两趟渲染。
page.on('pageerror', (e) => log('pageerror', String(e.message).slice(0, 300)));
const cfg = {
  fps: sched.fps, scale, framesBase: 'file://' + path.join(WORK, 'frames') + '/',
  shots: sched.shots, captions: sched.captions,
  clips: Object.fromEntries(Object.entries(sched.clips).map(([k, c]) => [k, { frames: c.frames, rows: c.meta }])),
};
await page.evaluate((c) => window.init(c), cfg);
const cdp = await context.newCDPSession(page);
const shoot = async (t, file) => {
  await page.evaluate((x) => window.seek(x), t);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality, optimizeForSpeed: true });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
};

const t0 = Date.now();
if (stills) {
  for (const s of stills.split(',')) await shoot(Number(s), path.join(outDir, `t_${Number(s).toFixed(2).padStart(6, '0')}.jpg`));
  log('stills done', stills);
} else {
  const a = Math.round(from * fps);
  const b = Math.round(to * fps);
  for (let i = a; i < b; i++) {
    await shoot(i / fps, path.join(outDir, pad5(i) + '.jpg'));
    if ((i - a) % 150 === 149) log(name, `${i - a + 1}/${b - a}`, Math.round((Date.now() - t0) / (i - a + 1)), 'ms/frame');
  }
  log('RENDERED', name, a, '→', b, Math.round((Date.now() - t0) / Math.max(1, b - a)), 'ms/frame');
}
await browser.close();
