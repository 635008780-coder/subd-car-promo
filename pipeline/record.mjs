// 正式录制(线上网站的真实录屏)。用法:node pipeline/record.mjs A | B
//   A:R0 首页 → R2 基础方案连点 → R3 尺寸、前轮位置、轮辋与轮眉(同一会话);再开新会话录 R1(开头大字卡的背景);最后拍封面截图
//   B:R6 腰线、型面、前脸格栅 → R7 显示模式与车身颜色 → R8 导出 + 结尾转台(同一会话)
// 所有按钮、分组、滑块、颜色名称都取自 src/data/stage0.json(阶段 0 在线上页面读出的真实文字)。
// "把画面对到被调的部位"靠网站自己的操作完成:点视图按钮(左/顶/3D)、右键平移、滚轮缩放。
import fs from 'node:fs';
import path from 'node:path';
import { openSession, Recorder, ROOT, WORK, sleep, run, centerOf, encodeClip, log, pad5 } from './lib/studio.mjs';
import { SEL, clickOn, hoverOn, pressOn, scrollPanelTo, rotate, dragSlider, zoomSteps, pan, frontWheelInLeftView } from './lib/actions.mjs';

const which = process.argv[2] || 'A';
const inv = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/stage0.json'), 'utf8'));
const must = (list, key, value, what) => {
  if (!list.some((item) => item[key] === value)) throw new Error(`${what}不在真实界面清单里: ${value}`);
  return value;
};
const real = {
  type: (n) => must(inv.full.types, 'text', n, '车型'),
  tpl: (n) => must(inv.templates, 'name', n, '基础方案'),
  mode: (n) => must(inv.full.modes, 'label', n, '显示模式'),
  view: (n) => must(inv.full.views, 'title', n, '相机视图'),
  rail: (n) => must(inv.full.rail, 'title', n, '工具栏按钮'),
  section: (n) => must(inv.home.sections, 'title', n, '参数分组'),
  field: (n) => must(inv.full.fields, 'label', n, '滑块'),
  paint: (n) => must(inv.full.paints, 'name', n, '车身颜色'),
};
const EXPORT = inv.exportMenu.options.map((o) => o.strong);

// 调参目标:在「运动溜背轿车」基础上往更协调的方向微调(截图比对后选定,见 output/README.md)
const DIMS = { 车长: 4880, 车宽: 1920, 轴距: 2960 };
const FRONT = 900; // 前轮中心距车头:前轮前移,前悬变短
const RIM = 20; // 轮辋直径(英寸)
const GAP = 20; // 最小轮胎间隙
const TUNE = { 腰线高度: 1000, 腰线前后升降: 70, 侧围趋势: 68, 车门侧面凹塑: 58, 曲面硬朗度: 70 };
const RIM_SEL = `[aria-label="轮辋尺寸"] button:nth-child(${RIM - 11})`;
if (inv.full.wheel.sizes[RIM - 12]?.text !== `${RIM}in`) throw new Error('轮辋尺寸按钮与真实界面清单不一致');
const GRILLE = { group: '前脸格栅 / 控制笼拓扑', option: '有格栅开口' };
if (!inv.full.choices.some((c) => c.label === GRILLE.group && c.options.some((o) => o.text === GRILLE.option))) throw new Error('格栅选项不在真实界面清单里');
const GRILLE_GROUP = `[role="group"][aria-label="${GRILLE.group}"]`;
const GRILLE_ON = `${GRILLE_GROUP} button:text-is("${GRILLE.option}")`;

// 第五版节奏:后半段(网站录屏)原来太赶。光标移动放缓,每个参数调完多停约 0.2 秒,让人看清车身变了什么。
const two = { phases: [0.55, 1], approach: 360, phaseMs: 400, holdMs: 240, endHold: 360 }; // 拖一段停一下:停顿时模型才重算
const one = { phases: [1], approach: 360, phaseMs: 480, holdMs: 260, endHold: 360 };
const quick = { phases: [1], approach: 320, phaseMs: 380, holdMs: 200, endHold: 260 };
const done = [];

async function sessionA() {
  const s = await openSession();
  const page = s.page;
  const rec = new Recorder(page, 'R0');
  await rec.start();
  const cv = await centerOf(page, SEL.canvas);
  const pr = await page.locator(SEL.panel).boundingBox();

  // R0 首页:静置,光标入场,轻轻转一下再转回
  await rec.hold(700);
  await rec.moveTo(cv.x - 70, cv.y + 80, 800);
  await rec.down();
  await rec.moveTo(cv.x + 24, cv.y + 70, 700, { bend: 0.03 });
  await rec.moveTo(cv.x - 70, cv.y + 80, 700, { bend: 0.03 });
  await rec.up();
  await rec.hold(260);
  await rec.moveTo(pr.x + pr.width * 0.5, pr.y + pr.height * 0.55, 520);
  await rec.hold(300);

  // R2 基础方案连点:8 次点击走完其余 7 个方案并回到轿车
  rec.next('R2');
  const seq = [
    ['type', real.type('微型车')], ['concept', real.tpl('圆润都市两厢')],
    ['type', real.type('MPV')], ['concept', real.tpl('豪华商务 MPV')],
    ['type', real.type('SUV')], ['concept', real.tpl('现代硬派 SUV')],
    ['type', real.type('轿车')], ['concept', real.tpl('运动溜背轿车')],
  ];
  const shown = [];
  for (const [kind, name] of seq) {
    await clickOn(rec, SEL[kind](name), { move: 320, press: 70, after: 390 });
    rec.event('morph', { name });
    shown.push(await page.evaluate(() => document.querySelector('.concept-option-active strong')?.textContent || ''));
  }
  await rec.hold(400);

  // 不入镜的准备动作:打开「尺寸」显示、切到「左」视图、把面板滚到「车身比例」
  rec.next('X', { shown });
  await clickOn(rec, SEL.rail(real.rail('切换尺寸信息')), { move: 300, after: 80 });
  await clickOn(rec, SEL.view(real.view('左标准视图')), { move: 300, after: 120 });
  await scrollPanelTo(rec, SEL.section(real.section('车身比例')), 172, 260);
  await rec.hold(120);

  // R3 尺寸与轮组:左视图调车长 → 顶视图调车宽 → 左视图调轴距、前轮前移 → 平移并放大到前轮:换 20 寸轮辋、收紧轮眉
  rec.discardAndBegin('R3');
  const sliders = [];
  rec.label('车身比例');
  await rec.hold(200);
  sliders.push(await dragSlider(rec, real.field('车长'), DIMS.车长, two));
  await clickOn(rec, SEL.view(real.view('顶标准视图')), { move: 400, after: 300 });
  sliders.push(await dragSlider(rec, real.field('车宽'), DIMS.车宽, one));
  await clickOn(rec, SEL.view('左标准视图'), { move: 400, after: 300 });
  sliders.push(await dragSlider(rec, real.field('轴距'), DIMS.轴距, two));
  rec.label('轮组与轮眉');
  await scrollPanelTo(rec, SEL.section(real.section('轮组与轮眉')), 172, 340);
  await clickOn(rec, SEL.section('轮组与轮眉'), { move: 260, after: 300 });
  sliders.push(await dragSlider(rec, real.field('前轮中心距车头'), FRONT, one));
  const front = await frontWheelInLeftView(page);
  await pan(rec, front, { x: 520, y: 440 }, { ms: 620, move: 380, settle: 160 });
  await zoomSteps(rec, -14, 620);
  rec.mark('wheel');
  await scrollPanelTo(rec, SEL.section('轮组与轮眉'), 172, 280);
  await clickOn(rec, RIM_SEL, { move: 300, press: 70, after: 0 });
  rec.event('rim', { text: `${RIM} in` });
  await rec.hold(550);
  sliders.push(await dragSlider(rec, real.field('最小轮胎间隙'), GAP, quick));
  sliders.push(await dragSlider(rec, real.field('轮眉半径'), 'min', two)); // 收到当前间隙允许的最小值:轮眉贴住轮胎
  await rec.hold(600);
  const tire = (await page.locator('.tire-specification').innerText()).replace(/\s+/g, ' ');
  rec.save({ sliders, tire });
  done.push(...rec.done);
  await s.browser.close();
}

async function sessionR1() {
  const s = await openSession();
  const rec = new Recorder(s.page, 'R1');
  await rec.start();
  // R1 控制笼旋转:轿车 → SUV → 微型车,每个车型按住拖拽转一下(默认就是 SubD 控制笼显示)
  await rec.hold(150);
  await rotate(rec, 200, -10, { ms: 950, move: 380, settle: 140, mark: 'sedan' });
  await clickOn(rec, SEL.type(real.type('SUV')), { move: 420, after: 220 });
  await rotate(rec, -200, 12, { ms: 950, move: 420, settle: 140, mark: 'suv' });
  await clickOn(rec, SEL.type(real.type('微型车')), { move: 420, after: 220 });
  await rotate(rec, 200, -8, { ms: 950, move: 420, settle: 200, mark: 'micro' });
  rec.save();
  done.push(...rec.done);
  await s.browser.close();
}

async function cover() {
  // 封面:同一台车、同一机位的两张真实截图(2 倍清晰度,不接管时钟)
  const s = await openSession({ clock: false, dsf: 2 });
  await s.page.locator(SEL.concept(real.tpl('运动溜背轿车'))).click();
  await sleep(4200); // 等模型重算,并让"已载入"提示条消失
  const dir = path.join(WORK, 'cover');
  fs.mkdirSync(dir, { recursive: true });
  const clip = { x: 60, y: 134, width: 1026, height: 577 }; // 三维视口中间的 16:9 区域,避开界面浮层
  for (const [label, file] of [['光顺渲染', 'surface'], ['SubD 控制笼', 'cage']]) {
    await s.page.locator(SEL.mode(real.mode(label))).click();
    await s.page.mouse.move(700, 790);
    await sleep(2200);
    await s.page.screenshot({ path: path.join(dir, file + '.png'), clip });
  }
  await s.browser.close();
  log('cover shots done');
}

async function sessionB() {
  const s = await openSession();
  const page = s.page;
  // 开录前(不入镜):按会话 A 的同样顺序,把车调到 A 结束时的状态。数值取"滑块会落到的那一档",两段才接得上。
  const snap = async (label, target) => {
    const r = await page.locator(SEL.range(real.field(label))).evaluate((el) => ({ min: Number(el.min), max: Number(el.max), step: Number(el.step) || 1 }));
    const goal = target === 'min' ? r.min : Math.min(r.max, Math.max(r.min, r.min + Math.round((target - r.min) / r.step) * r.step));
    await page.fill(SEL.number(label), String(goal));
    await page.press(SEL.number(label), 'Enter');
    await sleep(600);
    return goal;
  };
  const preset = {};
  await page.locator(SEL.concept(real.tpl('运动溜背轿车'))).click();
  await sleep(900);
  for (const [label, value] of Object.entries(DIMS)) preset[label] = await snap(label, value);
  await page.locator(SEL.section(real.section('轮组与轮眉'))).click();
  await sleep(400);
  preset.前轮中心距车头 = await snap('前轮中心距车头', FRONT);
  await page.locator(RIM_SEL).click();
  await sleep(700);
  preset.最小轮胎间隙 = await snap('最小轮胎间隙', GAP);
  preset.轮眉半径 = await snap('轮眉半径', 'min');
  await page.locator(SEL.rail('切换尺寸信息')).click();
  await page.locator(SEL.view('左标准视图')).click();
  await page.locator(SEL.section(real.section('型面与腰线'))).click();
  await sleep(400);
  await page.evaluate((panelSel) => {
    const head = [...document.querySelectorAll('button.section-header')].find((b) => b.querySelector('.section-title')?.textContent === '型面与腰线');
    document.querySelector(panelSel).scrollTop += head.getBoundingClientRect().top - 172;
  }, SEL.panel);
  await page.mouse.move(1180, 470);
  await sleep(4500); // 等模型重算完,并让"已载入"提示条消失
  log('preset', JSON.stringify(preset));
  const rec = new Recorder(page, 'R6');
  rec.cur = { x: 1180, y: 470, down: false };
  await rec.start();

  // R6 腰线与型面:左视图看腰线高度和前后升降 → 回到 3D 并拉近,看侧围趋势、车门凹塑、曲面硬朗度 → 加上前脸格栅
  const sliders = [];
  rec.label('型面与腰线');
  await rec.hold(200);
  sliders.push(await dragSlider(rec, real.field('腰线高度'), TUNE.腰线高度, one));
  sliders.push(await dragSlider(rec, real.field('腰线前后升降'), TUNE.腰线前后升降, one));
  await clickOn(rec, SEL.view(real.view('3D 透视视图')), { move: 440, after: 260 });
  const cv = await centerOf(page, SEL.canvas);
  await rec.moveTo(cv.x + 60, cv.y + 40, 340);
  await zoomSteps(rec, -4, 400);
  sliders.push(await dragSlider(rec, real.field('侧围趋势'), TUNE.侧围趋势, one));
  sliders.push(await dragSlider(rec, real.field('车门侧面凹塑'), TUNE.车门侧面凹塑, one));
  sliders.push(await dragSlider(rec, real.field('曲面硬朗度'), TUNE.曲面硬朗度, one));
  rec.label('机盖与前脸');
  await scrollPanelTo(rec, GRILLE_GROUP, 420, 380);
  await clickOn(rec, GRILLE_ON, { move: 300, press: 70, after: 0 });
  rec.event('grille', { text: GRILLE.option });
  await rec.hold(550);
  await rotate(rec, 150, -12, { ms: 900, move: 380, settle: 300 });
  await rec.hold(300);

  // R7 显示模式与颜色:光顺渲染 → 连换三种车身颜色 → 转一下 → 曲面线框
  rec.next('R7', { sliders, preset });
  rec.label('光顺渲染');
  await clickOn(rec, SEL.mode(real.mode('光顺渲染')), { move: 500, after: 400 });
  rec.mark('surface');
  rec.label('车身颜色');
  await scrollPanelTo(rec, '.paint-section', 520, 480);
  const paints = ['赤陶红', '薄荷青', '深海蓝'].map(real.paint);
  for (const name of paints) {
    await clickOn(rec, SEL.paint(name), { move: 300, press: 70, after: 500 });
    rec.event('paint', { name });
  }
  await rotate(rec, 120, -8, { ms: 850, move: 400, settle: 300 });
  rec.label('曲面线框');
  await clickOn(rec, SEL.mode(real.mode('曲面线框')), { move: 460, after: 500 });
  rec.mark('wire');
  await rotate(rec, -100, 10, { ms: 760, move: 360, settle: 360 });

  // R8 导出:回到 SubD 控制笼 → 按下「导出模型」→ 悬停看几项 → 按下「细分工程包（推荐）」→ 结尾慢速转台
  rec.next('R8', { paints });
  rec.label('SubD 控制笼');
  await clickOn(rec, SEL.mode('SubD 控制笼'), { move: 440, after: 300 });
  rec.label(inv.full.topbar.export.text);
  await pressOn(rec, SEL.exportBtn, { move: 680, before: 300, press: 160, after: 500, name: 'button' });
  rec.mark('menu');
  await hoverOn(rec, SEL.exportItem(EXPORT[1]), 400);
  await rec.hold(240);
  await hoverOn(rec, SEL.exportItem(EXPORT[3]), 360);
  await rec.hold(240);
  await pressOn(rec, SEL.exportItem(EXPORT[0]), { move: 400, before: 360, press: 160, after: 0, name: 'item' });
  rec.mark('export');
  await rec.hold(800);
  const toast = await page.evaluate(() => (document.querySelector('.toast-message.toast-visible')?.textContent || '').trim());
  await rec.hold(650);
  const cv2 = await centerOf(page, SEL.canvas);
  await rec.moveTo(cv2.x - 150, cv2.y + 60, 600);
  rec.mark('end');
  await rec.down();
  await rec.moveTo(cv2.x + 170, cv2.y + 44, 3600, { bend: 0.02 });
  await rec.up();
  await rec.hold(900);
  await sleep(500);
  rec.save({ toast, download: s.downloads[0] || null, exportClicked: EXPORT[0] });
  done.push(...rec.done);
  await s.browser.close();
}

function sheet(name, frames) {
  const dir = path.join(WORK, 'sheets');
  fs.mkdirSync(dir, { recursive: true });
  const pick = [0.1, 0.37, 0.63, 0.97].map((p) => path.join(WORK, 'frames', name, pad5(Math.round((frames - 1) * p)) + '.jpg'));
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', pick[0], '-i', pick[1], '-i', pick[2], '-i', pick[3], '-filter_complex', '[0][1]hstack[a];[2][3]hstack[b];[a][b]vstack,scale=1920:-2', '-q:v', '5', path.join(dir, name + '.jpg')]);
}

const started = Date.now();
try {
  if (which === 'A') {
    await sessionA();
    if (process.env.PROMO_R1 === '1') await sessionR1(); // 第五版开头不再用 R1 做背景
    if (process.env.PROMO_COVER === '1') await cover();
  } else if (which === 'B') {
    await sessionB();
  } else throw new Error('用法: node pipeline/record.mjs A|B');
  for (const clip of done) {
    if (process.env.PROMO_RAW_MP4 === '1') encodeClip(clip.name); // raw/*.mp4 体积大,默认不出
    sheet(clip.name, clip.frames);
  }
  const summary = { which, minutes: Number(((Date.now() - started) / 60000).toFixed(1)), clips: done };
  fs.writeFileSync(path.join(ROOT, 'raw', `record_${which}.json`), JSON.stringify(summary, null, 1));
  log('DONE', JSON.stringify(summary));
} catch (error) {
  log('FAILED', error.stack || String(error));
  fs.writeFileSync(path.join(ROOT, 'raw', `record_${which}.json`), JSON.stringify({ which, error: String(error.stack || error), clips: done }, null, 1));
  process.exit(1);
}
