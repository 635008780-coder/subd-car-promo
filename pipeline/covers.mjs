// 封面:先在线上网站拍 7 张真实截图(2 倍清晰度),再用 cover.html 排出 4 款不同版式的 16:9 封面。
// 输出 output/covers/cover_1..4.png(cover_1 同时另存为 output/cover_16x9.png)。
import fs from 'node:fs';
import path from 'node:path';
import { openSession, launch, ROOT, WORK, sleep, log } from './lib/studio.mjs';
import { SEL } from './lib/actions.mjs';

const dir = path.join(WORK, 'cover');
const out = path.join(ROOT, 'output/covers');
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(out, { recursive: true });
const CLIP = { x: 60, y: 134, width: 1026, height: 577 }; // 三维视口中间的 16:9 区域,避开界面浮层

// COVER_REUSE=1:截图已经拍过时只重新排版
const reuse = process.env.COVER_REUSE === '1' && fs.existsSync(path.join(dir, 'dims.json'));
let dims;
if (reuse) dims = JSON.parse(fs.readFileSync(path.join(dir, 'dims.json'), 'utf8'));
else {
const s = await openSession({ clock: false, dsf: 2 });
const page = s.page;
const shot = async (name) => {
  await page.mouse.move(700, 790);
  await sleep(2400);
  await page.screenshot({ path: path.join(dir, name + '.png'), clip: CLIP });
};
const click = async (sel, wait = 900) => { await page.locator(sel).first().click(); await sleep(wait); };
const setNum = async (label, v) => {
  if (v === 'min') v = await page.locator(SEL.range(label)).evaluate((el) => el.min);
  await page.fill(SEL.number(label), String(v));
  await page.press(SEL.number(label), 'Enter');
  await sleep(600);
};
await click(SEL.type('SUV')); await sleep(3500); await shot('suv');
await click(SEL.type('微型车')); await sleep(3500); await shot('micro');
await click(SEL.type('轿车')); await click(SEL.concept('运动溜背轿车')); await sleep(3500); await shot('cage');
await click(SEL.mode('光顺渲染')); await shot('surface');
// 调到成片里的最终状态(数值与 pipeline/record.mjs 一致),换深海蓝
for (const [k, v] of [['车长', 4880], ['车宽', 1920], ['轴距', 2960]]) await setNum(k, v);
await click(SEL.section('轮组与轮眉'), 500);
await setNum('前轮中心距车头', 900);
await click('[aria-label="轮辋尺寸"] button:nth-child(9)', 800);
await setNum('最小轮胎间隙', 20);
await setNum('轮眉半径', 'min');
await click(SEL.section('型面与腰线'), 500);
for (const [k, v] of [['腰线高度', 1000], ['腰线前后升降', 70], ['侧围趋势', 68], ['车门侧面凹塑', 58], ['曲面硬朗度', 70]]) await setNum(k, v);
await click('[role="group"][aria-label="前脸格栅 / 控制笼拓扑"] button:text-is("有格栅开口")');
await page.locator(SEL.panel).evaluate((el) => el.scrollTo(0, 0));
await click(SEL.paint('深海蓝'));
await sleep(3000); await shot('blue');
await click(SEL.mode('SubD 控制笼')); await click(SEL.view('左标准视图')); await shot('side');
// 左视图(正交相机)里车身和车轮的位置,用来在封面上画尺寸线;算法同 lib/actions.mjs 的 frontWheelInLeftView
const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('form-subd-workbench-v17')));
await s.browser.close();
const half = Math.max(cfg.height * 0.75, cfg.length / ((1026 / 744) * 1.75));
const k = (744 / (2 * half)) * (1920 / 1026); // 毫米 → 封面像素
const X = (mm) => Math.round(960 + (mm - cfg.length / 2) * k);
dims = { x0: X(0), x1: X(cfg.length), xf: X(cfg.frontAxleFromFront), xr: X(cfg.frontAxleFromFront + cfg.wheelbase), yg: Math.round((438 - 134 + 0.48 * cfg.height * (744 / (2 * half))) * (1920 / 1026)) };
fs.writeFileSync(path.join(dir, 'dims.json'), JSON.stringify(dims));
}

const img = (n) => 'file://' + path.join(dir, n + '.png');
const b = await launch({ url: 'file://' + path.join(ROOT, 'pipeline/cover.html'), viewport: { width: 1920, height: 1080 }, dsf: 1, gl: false });
for (const v of [1, 2, 3, 4]) {
  await b.page.evaluate((c) => window.init(c), { v, dims, surface: img('surface'), cage: img('cage'), blue: img('blue'), side: img('side'), suv: img('suv'), micro: img('micro') });
  await b.page.screenshot({ path: path.join(out, `cover_${v}.png`) });
}
await b.browser.close();
fs.copyFileSync(path.join(out, 'cover_1.png'), path.join(ROOT, 'output/cover_16x9.png'));
log('COVERS', JSON.stringify(dims));
