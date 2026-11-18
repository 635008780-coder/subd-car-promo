// 构建后自检:打开 dist/index.html,确认视频能从文本分片还原并真正播放,检查控制台错误、破图、横向溢出,并截图。
import fs from 'node:fs';
import path from 'node:path';
import { launch, ROOT, sleep } from './lib/studio.mjs';

const OUT = process.env.SITE_SHOTS || path.join(ROOT, 'pipeline/out/site');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const { browser, page } = await launch({
  url: 'file://' + path.join(ROOT, 'dist/index.html'),
  viewport: { width: 1440, height: 900 },
  dsf: 1,
  gl: false,
  onPage: (p) => {
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
    p.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 200)));
  },
});
await sleep(1500);
const shot = (name) => page.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 74 });

const video = await page.evaluate(async () => {
  const v = document.querySelector('video');
  if (!v) return null;
  if (v.readyState < 1) {
    await new Promise((resolve) => {
      v.addEventListener('loadedmetadata', resolve, { once: true });
      setTimeout(resolve, 10000);
      v.load();
    });
  }
  v.muted = true;
  let played = 0;
  try {
    await v.play();
    await new Promise((resolve) => setTimeout(resolve, 1600));
    played = v.currentTime;
    v.pause();
  } catch (e) {
    played = -1;
  }
  v.currentTime = 20.1;
  await new Promise((resolve) => {
    v.addEventListener('seeked', resolve, { once: true });
    setTimeout(resolve, 5000);
  });
  return { src: v.src.slice(0, 5), readyState: v.readyState, duration: v.duration, size: `${v.videoWidth}x${v.videoHeight}`, playedSeconds: Number(played.toFixed(2)), error: v.error ? v.error.code : null };
});
await sleep(400);
const metrics = () =>
  page.evaluate(() => ({
    width: innerWidth,
    pageHeight: document.documentElement.scrollHeight,
    overflowX: document.documentElement.scrollWidth - innerWidth,
    images: document.images.length,
    brokenImages: [...document.images].filter((img) => img.complete && img.naturalWidth === 0).length,
    downloads: [...document.querySelectorAll('a[download]')].map((a) => `${a.getAttribute('download')}:${(a.getAttribute('href') || '').slice(0, 5)}`),
  }));
const desktop = await metrics();
await shot('01_player');
const scrollTo = async (y) => {
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
  await sleep(350);
};
await scrollTo(930);
await shot('02_checks');
await scrollTo(1800);
await shot('03_overview');
await scrollTo(desktop.pageHeight - 1500);
await shot('04_tables');
// 高清版:切到 1080p 后确认真的换了源、能解码
await scrollTo(0);
let hdCheck = null;
const hdBtn = page.locator('button:has-text("播放器切到高清 1080p")');
if (await hdBtn.count()) {
  await hdBtn.click();
  await sleep(2500);
  hdCheck = await page.evaluate(async () => {
    const v = document.querySelector('video');
    if (v.readyState < 1) await new Promise((r) => { v.addEventListener('loadedmetadata', r, { once: true }); setTimeout(r, 15000); });
    v.currentTime = 3.4;
    await new Promise((r) => { v.addEventListener('seeked', r, { once: true }); setTimeout(r, 8000); });
    return { size: `${v.videoWidth}x${v.videoHeight}`, duration: v.duration, error: v.error ? v.error.code : null, covers: document.querySelectorAll('a[download^="cover_"]').length, hdDownload: !!document.querySelector('a[download="FORM_promo_16x9_1080p.mp4"]') };
  });
  await shot('06_hd');
}
await page.setViewportSize({ width: 390, height: 844 });
await sleep(400);
await scrollTo(0);
const mobile = await metrics();
await shot('05_mobile');
await browser.close();
const size = fs.statSync(path.join(ROOT, 'dist/index.html')).size;
console.log(JSON.stringify({ distBytes: size, errors, video, hdCheck, desktop, mobile: { overflowX: mobile.overflowX, brokenImages: mobile.brokenImages } }, null, 1));
