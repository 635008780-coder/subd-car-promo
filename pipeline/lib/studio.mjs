// 录制与渲染共享库:启动 Chromium · 接管时钟逐帧推进 · 光标覆盖层 · 逐帧截图 · 编码
// 所有"真实"镜头都通过这里录制线上网站。页面只做两件事:最上层叠一个光标层;隐藏托管平台注入的浮标。
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const WORK = process.env.PROMO_WORK || path.join(ROOT, '.work');
export const SITE = 'https://form-cc-studio.netlify.app/';
export const FPS = 60;
export const VIEWPORT = { width: 1440, height: 810 };
// 设备像素比。默认 4/3:1440×810 CSS 像素 → 1920×1080 设备像素,1080p 成片里不需要放大。
// PROMO_DSF=1 时按 1440×810 录制,走最快的截图路径(无显卡的机器上快一倍以上)。
export const DSF = Number(process.env.PROMO_DSF || 1);
export const PAGE_MS = 16; // Playwright 假时钟的 rAF 栅格
export const BADGE = '#nl-badge-frame'; // 托管平台注入的 "Powered by Netlify" 浮标,不在产品源码里

// 没有显卡时用 SwiftShader 软件渲染 WebGL;有显卡的机器设 PROMO_GPU=1 走真实 GPU。
const SW_GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const HW_GL = ['--enable-gpu', '--use-angle=default'];
const BASE = ['--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text', '--disable-smooth-scrolling'];
export const chromeArgs = (gl = true) =>
  gl ? [...(process.env.PROMO_GPU === '1' ? HW_GL : SW_GL), '--ignore-gpu-blocklist', '--enable-webgl', ...BASE] : [...BASE, '--disable-gpu'];
export const CHROME_ARGS = chromeArgs(true);

// RGB → H.264:显式按 bt709 / 有限范围转换并打标签,保证 #11171a 这类深色不偏色。
export const X264_COLOR = [
  '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
];
export const VF_709 = 'scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
export const pad5 = (n) => String(n).padStart(5, '0');
export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ').slice(0, 400)}\n${r.stderr || r.stdout}`);
  return r.stdout;
}

/** 打开一个页面。clock=true 时在导航前接管时间。gl=false 用于纯 2D 的合成页(更快)。 */
export async function launch({ url = SITE, viewport = VIEWPORT, dsf = DSF, clock = false, onPage, gl = true } = {}) {
  const browser = await chromium.launch({ headless: process.env.PROMO_HEADED !== '1', args: chromeArgs(gl) });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: dsf,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    colorScheme: 'dark',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  if (onPage) onPage(page);
  if (clock) await page.clock.install({ time: new Date('2026-01-05T10:00:00+08:00') });
  await page.goto(url, { waitUntil: url.startsWith('file:') ? 'load' : 'networkidle', timeout: 90000 });
  return { browser, context, page };
}

/** 打开线上网站准备录制:等画布出现、隐藏托管浮标、让页面按真实时间稳定下来。下载用事件接住,不弹对话框。 */
export async function openSession({ dsf = DSF, clock = true, hideBadge = true } = {}) {
  const downloads = [];
  const { browser, context, page } = await launch({
    clock,
    dsf,
    onPage: (p) =>
      p.on('download', (d) => {
        const item = { filename: d.suggestedFilename() };
        downloads.push(item);
        const dir = path.join(WORK, 'downloads');
        fs.mkdirSync(dir, { recursive: true });
        d.saveAs(path.join(dir, item.filename))
          .then(() => {
            item.bytes = fs.statSync(path.join(dir, item.filename)).size;
          })
          .catch(() => {});
      }),
  });
  await page.waitForSelector('canvas', { timeout: 60000 });
  if (hideBadge) await page.addStyleTag({ content: `${BADGE}{display:none !important}` });
  await sleep(3500);
  return { browser, context, page, downloads };
}

export async function centerOf(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error('找不到元素: ' + selector);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

/* ---------- 在页面里执行的函数 ---------- */

// 光标覆盖层:白色箭头 + 细黑边 + 点击涟漪。pointer-events:none,下面始终是真实界面。
function installCursorInPage() {
  if (window.__promoCursor) return;
  const root = document.createElement('div');
  root.id = '__promo_cursor_layer';
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;overflow:hidden;';
  const ring = document.createElement('div');
  ring.style.cssText =
    'position:absolute;left:-26px;top:-26px;width:52px;height:52px;border-radius:50%;' +
    'border:2px solid rgba(255,255,255,.92);box-shadow:0 0 0 1px rgba(0,0,0,.35);opacity:0;';
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrow.setAttribute('width', '26');
  arrow.setAttribute('height', '30');
  arrow.setAttribute('viewBox', '0 0 26 30');
  arrow.style.cssText =
    'position:absolute;left:0;top:0;overflow:visible;transform-origin:2px 2px;' +
    'filter:drop-shadow(0 2px 2.5px rgba(0,0,0,.5));';
  arrow.innerHTML =
    '<path d="M2 2 L2 22.5 L7.4 17.6 L11.2 26.2 L14.8 24.6 L11.1 16.2 L18.6 16.2 Z" ' +
    'fill="#ffffff" stroke="#0b0d0e" stroke-width="1.4" stroke-linejoin="round"/>';
  root.append(ring, arrow);
  document.documentElement.appendChild(root);
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  window.__promoCursor = {
    update(c) {
      arrow.style.transform = `translate(${c.x - 2}px, ${c.y - 2}px) scale(${c.down ? 0.86 : 1})`;
      if (c.ring) {
        ring.style.opacity = String(Math.max(0, 1 - c.ring.p));
        ring.style.transform = `translate(${c.ring.x}px, ${c.ring.y}px) scale(${0.25 + 0.95 * easeOut(c.ring.p)})`;
      } else ring.style.opacity = '0';
    },
  };
}

// 每一帧在页面内做三件事:
// 1) 让出几个宏任务,等 React 调度器(MessageChannel,不受假时钟控制)把渲染提交完;
// 2) CSS 过渡/动画不受假时钟控制 → 用 Web Animations API 暂停并按帧步进,保证确定性;
// 3) 更新光标覆盖层,并读回被"监视"的真实控件数值(给数值气泡用,只读)。
async function stepInPage({ dt, cur, watch }) {
  const yieldTask = () =>
    new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => resolve();
      ch.port2.postMessage(0);
    });
  for (let i = 0; i < 4; i++) await yieldTask();
  for (const a of document.getAnimations()) {
    try {
      if (a.playState === 'finished' || a.playState === 'idle') continue;
      const end = a.effect ? a.effect.getComputedTiming().endTime : Infinity;
      let t;
      if (!a.__promoHeld) {
        a.__promoHeld = true;
        a.pause();
        t = dt;
      } else t = Number(a.currentTime || 0) + dt;
      if (Number.isFinite(end) && t >= end) a.finish();
      else a.currentTime = t;
    } catch {
      /* 忽略单个动画的异常 */
    }
  }
  if (window.__promoCursor) window.__promoCursor.update(cur);
  if (!watch) return null;
  const el = document.querySelector(watch);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const v = el instanceof HTMLInputElement ? el.value : (el.textContent || '').replace(/\s+/g, ' ').trim();
  return { v, x: r.x, y: r.y, w: r.width, h: r.height };
}

/* ---------- 逐帧录制器 ---------- */

const minJerk = (u) => u * u * u * (10 - 15 * u + 6 * u * u);
const bez = (a, b, c, d, u) => {
  const m = 1 - u;
  return m * m * m * a + 3 * m * m * u * b + 3 * m * u * u * c + u * u * u * d;
};

export class Recorder {
  constructor(page, name, { fps = FPS } = {}) {
    this.page = page;
    this.fps = fps;
    this.cur = { x: -40, y: 470, down: false };
    this.click = null;
    this.watch = null; // 被监视的真实输入框(数值气泡的数据来源)
    this.bubble = null; // { l: 参数名, u: 单位 }
    this.bend = 1;
    this.total = 0;
    this.wall = [];
    this.done = [];
    this._begin(name);
  }

  _begin(name) {
    this.name = name;
    this.framesDir = path.join(WORK, 'frames', name);
    fs.rmSync(this.framesDir, { recursive: true, force: true });
    fs.mkdirSync(this.framesDir, { recursive: true });
    this.frame = 0;
    this.meta = [];
    this.marks = {};
    this.events = [];
    this.clipWall = [];
  }

  /** 注入光标层并冻结页面时钟。此后页面时间只在 tick() 里前进。 */
  async start() {
    this.cdp = await this.page.context().newCDPSession(this.page);
    await this.page.evaluate(installCursorInPage);
    // 机器慢时,取到 now 再发 pauseAt 的往返可能超过 34 ms(报 "Cannot fast-forward to the past"),所以逐级放宽余量重试
    for (const ahead of [34, 250, 1000, 4000]) {
      try {
        const now = await this.page.evaluate(() => Date.now());
        await this.page.clock.pauseAt(new Date(now + ahead));
        break;
      } catch (error) {
        if (ahead === 4000) throw error;
      }
    }
    // 假时钟的 rAF 落在 16 ms 栅格上(16 - ticks % 16,且 performance.now() === ticks)。
    // 先把相位对齐到栅格中点;之后每帧推进 16 ms → 每个视频帧恰好触发一次 rAF,可复现。
    const ph = await this.page.evaluate(() => performance.now() % 16);
    await this.page.clock.runFor(Math.round((24 - ph) % 16) || 16);
    this.phase = await this.page.evaluate(() => performance.now() % 16);
  }

  mark(name) {
    this.marks[name] = this.frame;
  }

  event(type, extra) {
    this.events.push({ f: this.frame, t: type, ...(extra || {}) });
  }

  /** 录一帧:页面 JS 时间前进 16 ms(= 一次 rAF),CSS 动画按 1/60 s 步进,然后截图。 */
  async tick() {
    const t0 = performance.now();
    await this.page.clock.runFor(PAGE_MS);
    let ring = null;
    if (this.click) {
      const p = (this.total - this.click.n) / 26;
      if (p <= 1) ring = { x: this.click.x, y: this.click.y, p };
      else this.click = null;
    }
    const w = await this.page.evaluate(stepInPage, {
      dt: 1000 / this.fps,
      cur: { x: this.cur.x, y: this.cur.y, down: this.cur.down, ring },
      watch: this.watch,
    });
    // 必须带 clip.scale = 设备像素比,才按设备像素输出(1440×810 CSS 像素 × 4/3 = 1920×1080);
    // 不带 clip 或 scale=1 得到的是 CSS 尺寸(实测)。
    const shot = { format: 'jpeg', quality: 95, optimizeForSpeed: true };
    if (DSF !== 1) Object.assign(shot, { captureBeyondViewport: false, clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height, scale: DSF } });
    const { data } = await this.cdp.send('Page.captureScreenshot', shot);
    fs.writeFileSync(path.join(this.framesDir, pad5(this.frame) + '.jpg'), Buffer.from(data, 'base64'));
    const row = [Math.round(this.cur.x * 10) / 10, Math.round(this.cur.y * 10) / 10, this.cur.down ? 1 : 0];
    if (this.bubble && w) row.push({ l: this.bubble.l, u: this.bubble.u, v: w.v, x: Math.round(w.x + w.w / 2), y: Math.round(w.y + w.h / 2) });
    this.meta.push(row);
    this.frame++;
    this.total++;
    const ms = performance.now() - t0;
    this.wall.push(ms);
    this.clipWall.push(ms);
  }

  async hold(ms) {
    const n = Math.max(1, Math.round((ms / 1000) * this.fps));
    for (let i = 0; i < n; i++) await this.tick();
  }

  /** 沿三次贝塞尔曲线移动(最小加加速度缓动,起停速度为 0),真实鼠标事件与覆盖层同步。 */
  async moveTo(x, y, ms = 600, { bend = 0.14 } = {}) {
    const n = Math.max(2, Math.round((ms / 1000) * this.fps));
    const p0 = { x: this.cur.x, y: this.cur.y };
    const dx = x - p0.x;
    const dy = y - p0.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.bend = -this.bend;
    const off = bend * dist * this.bend;
    const nx = -dy / dist;
    const ny = dx / dist;
    const c1 = { x: p0.x + dx * 0.3 + nx * off, y: p0.y + dy * 0.3 + ny * off };
    const c2 = { x: p0.x + dx * 0.72 + nx * off * 0.45, y: p0.y + dy * 0.72 + ny * off * 0.45 };
    for (let i = 1; i <= n; i++) {
      const u = minJerk(i / n);
      this.cur.x = bez(p0.x, c1.x, c2.x, x, u);
      this.cur.y = bez(p0.y, c1.y, c2.y, y, u);
      await this.page.mouse.move(this.cur.x, this.cur.y);
      await this.tick();
    }
  }

  /** 按下鼠标。button='right' 用于在三维视口里平移(轨道控制器的默认操作)。 */
  async down(button = 'left') {
    await this.page.mouse.down({ button });
    this.button = button;
    this.cur.down = true;
    this.click = { n: this.total, x: this.cur.x, y: this.cur.y };
    this.event('down', button === 'left' ? undefined : { button });
  }

  async up() {
    await this.page.mouse.up({ button: this.button || 'left' });
    this.cur.down = false;
    this.event('up');
  }

  /** 给成片左上角的说明标签打点(文字用真实界面里的名称)。 */
  label(text) {
    this.event('label', { text });
  }

  async clickHere(holdMs = 80) {
    await this.down();
    await this.hold(holdMs);
    await this.up();
  }

  /** 写出当前片段的元数据(光标轨迹、事件、标记、气泡数值)。 */
  save(extra) {
    const dir = path.join(ROOT, 'raw');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, this.name + '.meta.json'),
      JSON.stringify({
        name: this.name, fps: this.fps, frames: this.frame, viewport: VIEWPORT, dsf: DSF, hidden: [BADGE],
        marks: this.marks, events: this.events, ...(extra || {}), meta: this.meta,
      }),
    );
    const item = { name: this.name, frames: this.frame, seconds: Number((this.frame / this.fps).toFixed(2)), msPerFrame: Math.round(avg(this.clipWall)) };
    this.done.push(item);
    log('clip', JSON.stringify(item), JSON.stringify(this.marks));
    return item;
  }

  /** 同一个页面会话里接着录下一个片段:画面状态连续,只是换一个输出文件。 */
  next(name, extra) {
    const item = this.save(extra);
    this._begin(name);
    return item;
  }

  /** 丢弃当前片段(用于不入镜的准备动作,例如切视图、滚动面板),开始录下一个片段。 */
  discardAndBegin(name) {
    fs.rmSync(this.framesDir, { recursive: true, force: true });
    this._begin(name);
  }
}

/** 把一个片段的帧序列编码成 raw/<name>.mp4。 */
export function encodeClip(name, { crf = 17 } = {}) {
  const out = path.join(ROOT, 'raw', name + '.mp4');
  run('ffmpeg', [
    '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(WORK, 'frames', name, '%05d.jpg'),
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2:in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p',
    ...X264_COLOR, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-movflags', '+faststart', out,
  ]);
  return out;
}
