// 录制用的操作积木:点击、悬停、拖拽旋转、滚轮、拖滑块。全部走真实鼠标事件,坐标在动作发生时现查。
import { centerOf } from './studio.mjs';

export const SEL = {
  canvas: 'section.viewport canvas',
  panel: '.parameter-scroll',
  exportBtn: 'button.export-button',
  mode: (label) => `[aria-label="显示模式"] button[aria-label="${label}"]`,
  view: (title) => `[aria-label="相机视图"] button[title="${title}"]`,
  type: (name) => `[aria-label="选择车型"] button:has(span:text-is("${name}"))`,
  concept: (name) => `[aria-label="选择基础方案"] button:has(strong:text-is("${name}"))`,
  section: (title) => `button.section-header:has(.section-title:text-is("${title}"))`,
  range: (label) => `input[type="range"][aria-label="${label}滑块"]`,
  number: (label) => `input[type="number"][aria-label="${label}"]`,
  exportItem: (strong) => `.export-menu button.export-option:has(strong:text-is("${strong}"))`,
  rail: (title) => `nav[aria-label="视口工具"] button[title="${title}"]`,
  paint: (name) => `[aria-label="选择车漆颜色"] button[aria-label="${name}"]`,
};

/**
 * 滚轮缩放三维视口。网站用的轨道控制器每个滚轮事件固定缩放 5%(与滚动量无关),
 * 所以用事件个数控制倍数:steps<0 放大,steps>0 缩小,倍数 = 1.0526^|steps|。光标必须在画布上。
 */
export async function zoomSteps(rec, steps, ms = 500) {
  const n = Math.abs(steps);
  const frames = Math.max(n, Math.round((ms / 1000) * rec.fps));
  let sent = 0;
  for (let i = 1; i <= frames; i++) {
    const want = Math.round(n * easeInOut(i / frames));
    while (sent < want) {
      await rec.page.mouse.wheel(0, steps < 0 ? -100 : 100);
      sent++;
    }
    await rec.tick();
  }
}

/** 右键拖拽平移三维视口:from 处的模型会跟着光标移到 to(正交视图里是 1:1)。 */
export async function pan(rec, from, to, { ms = 600, move = 320, settle = 150 } = {}) {
  await rec.moveTo(from.x, from.y, move);
  await rec.down('right');
  await rec.moveTo(to.x, to.y, ms, { bend: 0.02 });
  await rec.up();
  if (settle) await rec.hold(settle);
}

/**
 * 「左」视图(正交相机)里前轮中心的屏幕位置。相机参数取自网站源码 VehicleScene.tsx 的 CameraRig:
 * 视口半高 = max(车高×0.75, 车长÷(宽高比×1.75)),目标点高度 = 车高×0.48。
 * 车长、车高、前悬、轮胎外径读自网站自己存在 localStorage 里的当前参数(只读)。已用截图验证,误差几个像素。
 */
export async function frontWheelInLeftView(page) {
  const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('form-subd-workbench-v17')));
  const box = await page.locator(SEL.canvas).boundingBox();
  const L = cfg.length;
  const H = cfg.height;
  const front = cfg.frontAxleFromFront;
  const dia = cfg.tireDiameter;
  const half = Math.max(H * 0.75, L / ((box.width / box.height) * 1.75));
  const ppm = box.height / (2 * half); // 每毫米多少像素
  return {
    x: box.x + box.width / 2 + (-L / 2 + front) * ppm,
    y: box.y + box.height / 2 + (0.48 * H - dia / 2) * ppm,
    ppm,
    center: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  };
}

const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const THUMB = 9; // 滑块圆点宽度,来自网站 index.css 的 ::-webkit-slider-thumb

export async function hoverOn(rec, selector, move = 350, { dx = 0, dy = 0 } = {}) {
  const c = await centerOf(rec.page, selector);
  await rec.moveTo(c.x + dx, c.y + dy, move);
  return c;
}

export async function clickOn(rec, selector, { move = 350, press = 70, after = 120, dx = 0, dy = 0 } = {}) {
  await hoverOn(rec, selector, move, { dx, dy });
  await rec.clickHere(press);
  if (after) await rec.hold(after);
}

/**
 * 重点按钮的点击:记下被按下元素的位置(成片里据此把镜头推近,并叠加"按下去"的包装动效),
 * 按住时间稍长,让按钮自己的按下状态也看得到。
 */
export async function pressOn(rec, selector, { move = 450, before = 120, press = 130, after = 300, name } = {}) {
  const c = await centerOf(rec.page, selector);
  await rec.moveTo(c.x, c.y, move);
  if (before) await rec.hold(before);
  rec.event('press', { name, x: Math.round(c.box.x), y: Math.round(c.box.y), w: Math.round(c.box.width), h: Math.round(c.box.height) });
  await rec.clickHere(press);
  if (after) await rec.hold(after);
}

/** 滚轮:总量 total 按缓动曲线分到每一帧(浏览器已关闭平滑滚动,所以缓动由这里给出)。 */
export async function wheel(rec, total, ms = 400) {
  const n = Math.max(2, Math.round((ms / 1000) * rec.fps));
  let sent = 0;
  for (let i = 1; i <= n; i++) {
    const want = Math.round(total * easeInOut(i / n));
    const d = want - sent;
    sent = want;
    if (d) await rec.page.mouse.wheel(0, d);
    await rec.tick();
  }
}

/** 把参数面板滚到让 selector 的顶边落在 targetY(视口坐标)。光标不在面板上时先移过去。 */
export async function scrollPanelTo(rec, selector, targetY, ms = 320) {
  const page = rec.page;
  const pr = await page.locator(SEL.panel).boundingBox();
  const inside = rec.cur.x > pr.x + 8 && rec.cur.x < pr.x + pr.width - 8 && rec.cur.y > pr.y + 8 && rec.cur.y < pr.y + pr.height - 8;
  if (!inside) await rec.moveTo(pr.x + pr.width * 0.5, pr.y + pr.height * 0.56, 260);
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error('找不到元素: ' + selector);
  const st = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return { top: el.scrollTop, max: el.scrollHeight - el.clientHeight };
  }, SEL.panel);
  let delta = Math.round(box.y - targetY);
  delta = Math.max(-st.top, Math.min(st.max - st.top, delta));
  if (Math.abs(delta) > 2) await wheel(rec, delta, ms);
  return delta;
}

/** 在三维画布上按住拖拽旋转。dx>0 向右拖,dy>0 向下拖。 */
export async function rotate(rec, dx, dy, { ms = 700, move = 320, settle = 220, mark, ox = 0, oy = 30 } = {}) {
  const c = await centerOf(rec.page, SEL.canvas);
  const sx = c.x - dx / 2 + ox;
  const sy = c.y - dy / 2 + oy;
  await rec.moveTo(sx, sy, move);
  await rec.down();
  if (mark) rec.mark(mark + ':a');
  await rec.moveTo(sx + dx, sy + dy, ms, { bend: 0.03 });
  await rec.up();
  if (mark) rec.mark(mark + ':b');
  if (settle) await rec.hold(settle);
}

/**
 * 按住拖动真实滑块到 target。phases 是分段比例:每段之后停一下。
 * 网站对参数有 60 ms 防抖,数值停住后模型才重算,所以"拖一段停一下"才能看到车身逐步变形。
 */
export async function dragSlider(rec, label, target, { phases = [0.5, 1], approach = 300, phaseMs = 280, holdMs = 140, endHold = 160 } = {}) {
  const page = rec.page;
  const sel = SEL.range(label);
  const read = () =>
    page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const unit = el.closest('label')?.querySelector('.parameter-number span')?.textContent?.trim() || '';
      return { x: r.x, y: r.y, w: r.width, h: r.height, min: Number(el.min), max: Number(el.max), value: Number(el.value), unit };
    }, sel);
  let g = await read();
  if (!g) throw new Error('找不到滑块: ' + label);
  const pr = await page.locator(SEL.panel).boundingBox();
  if (g.y < pr.y + 24 || g.y > pr.y + pr.height - 40) {
    await scrollPanelTo(rec, sel, pr.y + pr.height * 0.42, 280);
    g = await read();
  }
  const clamp = (v) => Math.min(g.max, Math.max(g.min, v));
  const xOf = (v) => g.x + THUMB / 2 + ((clamp(v) - g.min) / (g.max - g.min)) * (g.w - THUMB);
  const y = g.y + g.h / 2;
  const from = g.value;
  if (target === 'min') target = g.min; // 拖到滑块当前允许的最小值(例如轮眉半径贴住轮胎间隙)
  if (target === 'max') target = g.max;
  rec.watch = SEL.number(label);
  rec.bubble = { l: label, u: g.unit };
  await rec.moveTo(xOf(from), y, approach);
  await rec.down();
  await rec.hold(50);
  for (const p of phases) {
    await rec.moveTo(xOf(from + (target - from) * p), y, phaseMs, { bend: 0 });
    await rec.hold(holdMs);
  }
  await rec.up();
  rec.event('slider', { label });
  await rec.hold(endHold);
  const after = await read();
  rec.watch = null;
  rec.bubble = null;
  return { label, from, to: after?.value, unit: g.unit, min: g.min, max: g.max };
}
