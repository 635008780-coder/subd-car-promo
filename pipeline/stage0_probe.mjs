// 阶段 0 · 真实界面清单探测
// 在线上网站上读取每个按钮/滑块/面板/显示模式/视图/导出项的真实文字与定位方式,
// 逐个验证定位器,并与克隆下来的源码字符串交叉核对。输出 JSON + 截图。
import fs from 'node:fs';
import path from 'node:path';
import { launch, ROOT, SITE, sleep, run, CHROME_ARGS } from './lib/studio.mjs';

const OUT = path.join(ROOT, 'pipeline/out/stage0');
fs.mkdirSync(OUT, { recursive: true });
const SRC = process.env.FORM_SRC || '/tmp/form-cc-studio';
const started = Date.now();

const logs = [];
const { browser, context, page } = await launch({
  onPage: (p) => {
    p.on('console', (m) => {
      if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 160)}`);
    });
    p.on('pageerror', (e) => logs.push('pageerror: ' + String(e.message).slice(0, 160)));
  },
});
await page.waitForSelector('canvas', { timeout: 60000 });
await sleep(3000);
const shot = (name) => page.screenshot({ path: path.join(OUT, name + '.png') });

/* ---------- 页面内:抓取当前界面上的真实文字 ---------- */
const grab = () => {
  const T = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const R = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  };
  const all = (sel, root = document) => [...root.querySelectorAll(sel)];
  const q = (sel) => document.querySelector(sel);
  const sectionOf = (el) => T(el.closest('.parameter-group')?.querySelector('.section-title')) || null;
  return {
    topbar: {
      brand: T(q('.brand-name')),
      descriptor: T(q('.brand-descriptor')),
      kicker: T(q('.project-kicker')),
      project: T(q('.project-name')),
      save: T(q('.save-indicator')),
      reset: { text: T(q('.reset-button')), title: q('.reset-button')?.title, rect: R(q('.reset-button')) },
      export: { text: T(q('.export-button')), rect: R(q('.export-button')) },
    },
    rail: all('.tool-rail button').map((b) => ({ text: T(b), title: b.title, active: b.classList.contains('rail-active'), rect: R(b) })),
    railVersion: T(q('.rail-bottom span')),
    modes: all('.viewport-mode-switch button').map((b) => ({
      label: b.getAttribute('aria-label'),
      text: T(b.querySelector('.mode-full')),
      short: T(b.querySelector('.mode-short')),
      fullVisible: getComputedStyle(b.querySelector('.mode-full')).display !== 'none',
      selected: b.classList.contains('mode-selected'),
      rect: R(b),
    })),
    views: all('.camera-switch button').map((b) => ({ text: T(b), title: b.title, selected: b.classList.contains('camera-selected'), rect: R(b) })),
    viewport: {
      title: T(q('.viewport-title')),
      subtitle: T(q('.viewport-subtitle')),
      badge: T(q('.status-badge')),
      status: T(q('.viewport-model-status')),
      hint: T(q('.viewport-hint')),
      rect: R(q('.viewport')),
    },
    panel: { eyebrow: T(q('.panel-eyebrow')), h1: T(q('.parameter-panel h1')), rect: R(q('.parameter-panel')), footer: T(q('.panel-footer-copy')) },
    captions: all('.panel-section-caption').map(T),
    types: all('.vehicle-type-button').map((b) => ({ text: T(b), active: b.classList.contains('vehicle-type-active'), rect: R(b) })),
    concepts: all('.concept-option').map((b) => ({ name: T(b.querySelector('strong')), desc: T(b.querySelector('span')), active: b.classList.contains('concept-option-active') })),
    conceptNotes: all('.concept-note').map(T),
    paints: all('.paint-swatch').map((b) => ({ name: b.getAttribute('aria-label'), color: b.style.getPropertyValue('--swatch-color'), active: b.classList.contains('paint-swatch-active') })),
    sections: all('.section-header').map((b) => ({ title: T(b.querySelector('.section-title')), subtitle: T(b.querySelector('.section-subtitle')), open: b.classList.contains('is-open') })),
    fields: all('label.parameter-field').map((l) => {
      const n = l.querySelector('input[type=number]');
      const r = l.querySelector('input[type=range]');
      return { section: sectionOf(l), label: T(l.querySelector('.parameter-label')), value: n.value, unit: T(l.querySelector('.parameter-number span')), min: r.min, max: r.max, step: r.step, aria: r.getAttribute('aria-label') };
    }),
    choices: all('.choice-field').map((c) => ({
      section: sectionOf(c),
      label: T(c.querySelector('.parameter-label')),
      options: all('button', c).map((b) => ({ text: T(b), selected: b.classList.contains('choice-selected') })),
    })),
    wheel: {
      heading: T(q('.wheel-size-heading')),
      sizes: all('.wheel-size-options button').map((b) => ({ text: T(b), selected: b.classList.contains('wheel-size-selected') })),
      tires: all('.tire-style-options button').map((b) => ({ text: T(b), selected: b.classList.contains('tire-style-selected') })),
      spec: T(q('.tire-specification')),
    },
    notes: all('.inline-note').map((n) => ({ section: sectionOf(n), text: T(n) })),
    densityNote: T(q('.density-note')),
    toast: T(q('.toast-message.toast-visible')),
  };
};

/* ---------- 环境与页面事实 ---------- */
const env = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
  const cv = document.querySelector('canvas');
  const r = cv.getBoundingClientRect();
  const cs = getComputedStyle(document.documentElement);
  return {
    title: document.title,
    themeColor: document.querySelector('meta[name=theme-color]')?.content,
    description: document.querySelector('meta[name=description]')?.content,
    lang: document.documentElement.lang,
    webgl: gl
      ? { version: gl.getParameter(gl.VERSION), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null }
      : null,
    canvas: { w: cv.width, h: cv.height, cssW: Math.round(r.width), cssH: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) },
    rootFont: cs.fontFamily,
    rootVars: Object.fromEntries(
      ['--surface-0', '--surface-1', '--surface-2', '--line', '--line-soft', '--text', '--muted', '--muted-soft', '--accent', '--accent-soft'].map((k) => [k, cs.getPropertyValue(k).trim()]),
    ),
    storageKeys: Object.keys(localStorage),
    viewport: [innerWidth, innerHeight, devicePixelRatio],
  };
});

// 录制机上实际参与渲染的字体(CDP 读取,不是 CSS 声明)
const cdp = await context.newCDPSession(page);
await cdp.send('DOM.enable');
await cdp.send('CSS.enable');
const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
const fontsUsed = {};
for (const sel of ['.brand-name', '.brand-descriptor', '.parameter-panel h1', '.concept-option strong', '.parameter-label', '.viewport-title', '.parameter-number input', '.viewport-model-status']) {
  try {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    fontsUsed[sel] = fonts.map((f) => `${f.familyName} ×${f.glyphCount}`);
  } catch (e) {
    fontsUsed[sel] = ['?' + String(e.message).slice(0, 60)];
  }
}

const home = await page.evaluate(grab);
await shot('home');

// 托管平台注入的浮标(不在仓库源码里):查清它是什么元素、在不在 #root 里
const hostBadge = await page.evaluate(() => {
  const describe = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return {
      tag: e.tagName.toLowerCase(), id: e.id || null, cls: typeof e.className === 'string' ? e.className.slice(0, 80) : null,
      href: e.getAttribute('href'), position: cs.position, zIndex: cs.zIndex, shadow: !!e.shadowRoot,
      insideRoot: !!e.closest('#root'), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    };
  };
  const leaf = [...document.querySelectorAll('body *')].find(
    (e) => /Powered by/i.test(e.textContent || '') && [...e.children].every((c) => !/Powered by/i.test(c.textContent || '')),
  );
  const chain = [];
  for (let e = leaf; e && e !== document.body; e = e.parentElement) chain.push(describe(e));
  const outside = [...document.body.children].filter((e) => e.id !== 'root' && !['SCRIPT', 'STYLE', 'LINK'].includes(e.tagName)).map(describe);
  return { found: !!leaf, chain, bodyChildrenOutsideRoot: outside };
});

/* ---------- 展开全部参数分组 ---------- */
for (let i = 0; i < 12; i++) {
  const closed = page.locator('button.section-header:not(.is-open)');
  if (!(await closed.count())) break;
  await closed.first().click();
  await sleep(150);
}
const full = await page.evaluate(grab);

/* ---------- 遍历 4 个车型 × 各自的基础方案 ---------- */
const templates = [];
const liveFieldLabels = new Set(full.fields.map((f) => f.label));
const liveChoiceLabels = new Set(full.choices.map((c) => c.label));
for (let ti = 0; ti < full.types.length; ti++) {
  await page.locator('.vehicle-type-button').nth(ti).click();
  await sleep(900);
  const n = await page.locator('.concept-option').count();
  for (let ci = 0; ci < n; ci++) {
    if (ci > 0) {
      await page.locator('.concept-option').nth(ci).click();
      await sleep(900);
    }
    const g = await page.evaluate(grab);
    g.fields.forEach((f) => liveFieldLabels.add(f.label));
    g.choices.forEach((c) => liveChoiceLabels.add(c.label));
    const act = g.concepts.find((c) => c.active) || g.concepts[ci];
    const val = (label) => g.fields.find((f) => f.label === label)?.value;
    const sel = `[aria-label="选择基础方案"] button:has(strong:text-is("${act.name}"))`;
    templates.push({
      type: full.types[ti].text,
      how: ci === 0 ? `点车型「${full.types[ti].text}」即载入` : `车型「${full.types[ti].text}」下点选`,
      name: act.name,
      desc: act.desc,
      reference: g.conceptNotes[0],
      toast: g.toast,
      dims: { 车长: val('车长'), 车宽: val('车宽'), 车高: val('车高'), 轴距: val('轴距') },
      status: g.viewport.status,
      footer: g.panel.footer,
      sel,
      count: await page.locator(sel).count(),
      fieldCount: g.fields.length,
      fields: g.fields.map((f) => [f.section, f.label, f.value, f.unit, f.min, f.max, f.step]),
    });
    if (templates.length === 4 || templates.length === 8) await shot('tpl_' + templates.length);
  }
}
await page.locator('.vehicle-type-button').nth(0).click();
await sleep(900);

/* ---------- 条件字段:打开「有格栅开口」后才出现的滑块 ---------- */
const grilleSel = '[role="group"][aria-label="前脸格栅 / 控制笼拓扑"] button:text-is("有格栅开口")';
let conditional = null;
if (await page.locator(grilleSel).count()) {
  await page.locator(grilleSel).click();
  await sleep(1000);
  const g = await page.evaluate(grab);
  const before = new Set(full.fields.map((f) => f.label));
  const beforeChoices = new Set(full.choices.map((c) => c.label));
  conditional = {
    trigger: '机盖与前脸 › 前脸格栅 / 控制笼拓扑 › 有格栅开口',
    fields: g.fields.filter((f) => !before.has(f.label)),
    choices: g.choices.filter((c) => !beforeChoices.has(c.label)),
    status: g.viewport.status,
  };
  g.fields.forEach((f) => liveFieldLabels.add(f.label));
  g.choices.forEach((c) => liveChoiceLabels.add(c.label));
  await shot('grille_on');
  await page.locator('.vehicle-type-button').nth(0).click(); // 重新载入方案,恢复默认
  await sleep(900);
}

/* ---------- 定位器清单(稍后逐个在线上计数) ---------- */
const locators = [];
const add = (group, text, sel) => locators.push({ group, text, sel });
add('顶栏', full.topbar.export.text, 'button.export-button');
add('顶栏', full.topbar.reset.text, 'button.reset-button');
for (const b of full.rail) add('工具栏', b.text || b.title, `nav[aria-label="视口工具"] button[title="${b.title}"]`);
for (const m of full.modes) add('显示模式', m.label, `[aria-label="显示模式"] button[aria-label="${m.label}"]`);
for (const v of full.views) add('相机视图', v.text, `[aria-label="相机视图"] button[title="${v.title}"]`);
for (const t of full.types) add('车型', t.text, `[aria-label="选择车型"] button:has(span:text-is("${t.text}"))`);
for (const s of full.sections) add('参数分组', s.title, `button.section-header:has(.section-title:text-is("${s.title}"))`);
for (const f of full.fields) add('滑块', f.label, `input[type="range"][aria-label="${f.aria}"]`);
for (const c of full.choices) for (const o of c.options) add('选项', `${c.label} › ${o.text}`, `[role="group"][aria-label="${c.label}"] button:text-is("${o.text}")`);
for (const p of full.paints) add('车身颜色', p.name, `[aria-label="选择车漆颜色"] button[aria-label="${p.name}"]`);
for (const t of full.wheel.tires) add('轮胎', t.text, `[aria-label="轮胎类型"] button:text-is("${t.text}")`);
add('轮辋', '轮辋尺寸(每个英寸一个按钮)', '[aria-label="轮辋尺寸"]');
add('视口', '三维画布(拖拽旋转 / 滚轮缩放)', 'section.viewport canvas');
add('面板', '参数滚动区', '.parameter-scroll');
for (const l of locators) l.count = await page.locator(l.sel).count();

/* ---------- 导出菜单 + 下载事件 ---------- */
await page.locator('button.export-button').click();
await sleep(500);
const exportMenu = await page.evaluate(() => {
  const T = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const m = document.querySelector('.export-menu');
  const r = m.getBoundingClientRect();
  return {
    headings: [...m.querySelectorAll('.export-menu-heading')].map(T),
    options: [...m.querySelectorAll('.export-option')].map((b) => ({ strong: T(b.querySelector('strong')), small: T(b.querySelector('small')), primary: b.classList.contains('export-option-primary') })),
    unitLabel: T(m.querySelector('.export-unit-row > span')),
    units: [...m.querySelectorAll('.export-unit-row button')].map((b) => ({ text: T(b), active: b.classList.contains('export-unit-active') })),
    unitHint: T(m.querySelector('.export-unit-row small')),
    note: T(m.querySelector('.export-note')),
    rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
  };
});
await shot('export_menu');
const exportLocators = [];
for (const o of exportMenu.options) {
  const sel = `.export-menu button.export-option:has(strong:text-is("${o.strong}"))`;
  exportLocators.push({ group: '导出菜单', text: o.strong, sel, count: await page.locator(sel).count() });
}
for (const u of exportMenu.units) {
  const sel = `[aria-label="OBJ 单位"] button:text-is("${u.text}")`;
  exportLocators.push({ group: '导出菜单', text: 'OBJ 单位 › ' + u.text, sel, count: await page.locator(sel).count() });
}
locators.push(...exportLocators);

let download = null;
try {
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 40000 }),
    page.locator(exportLocators[0].sel).click(),
  ]);
  const file = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(file);
  await sleep(500);
  const toast = await page.evaluate(() => (document.querySelector('.toast-message.toast-visible')?.textContent || '').trim());
  let entries = [];
  try {
    entries = JSON.parse(run('python3', ['-c', 'import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps([[i.filename,i.file_size] for i in z.infolist()]))', file]));
  } catch {
    /* 没有 python 也不影响 */
  }
  download = { clicked: exportMenu.options[0].strong, filename: dl.suggestedFilename(), bytes: fs.statSync(file).size, toast, entries };
} catch (e) {
  download = { error: String(e.message).slice(0, 200) };
}

/* ---------- 5 种显示模式 ---------- */
const modeShots = [];
for (const m of full.modes) {
  await page.locator(`[aria-label="显示模式"] button[aria-label="${m.label}"]`).click();
  await sleep(1300);
  const info = await page.evaluate(() => ({
    subtitle: document.querySelector('.viewport-subtitle')?.textContent.trim(),
    badge: document.querySelector('.status-badge')?.textContent.trim(),
    selected: document.querySelector('.viewport-mode-switch .mode-selected')?.getAttribute('aria-label'),
  }));
  const file = 'mode_' + (modeShots.length + 1);
  await shot(file);
  modeShots.push({ label: m.label, short: m.short, file, ...info });
}
await page.locator('[aria-label="显示模式"] button').first().click();
await sleep(400);

/* ---------- 尺寸条与帮助提示 ---------- */
const dimSel = 'nav[aria-label="视口工具"] button[title="切换尺寸信息"]';
await page.locator(dimSel).click();
await sleep(400);
const dimension = await page.evaluate(() => [...document.querySelectorAll('.dimension-strip span')].map((s) => s.textContent.replace(/\s+/g, ' ').trim()));
await page.locator(dimSel).click();
await page.locator('.rail-help').click();
await sleep(400);
const helpToast = await page.evaluate(() => (document.querySelector('.toast-message.toast-visible')?.textContent || '').trim());

const chromiumVersion = browser.version();
await browser.close();

/* ---------- 源码交叉核对 ---------- */
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const app = read('src/App.tsx');
const lib = read('src/conceptLibrary.ts');
const css = read('src/index.css');
const scene = read('src/VehicleScene.tsx');
const uniq = (a) => [...new Set(a)];
const srcStrings = {
  显示模式: [...app.matchAll(/value: "(?:subd|surface|wire|boxmod|xray)", label: "([^"]+)"/g)].map((m) => m[1]),
  相机视图: [...app.matchAll(/value: "(?:perspective|rearPerspective|front|rear|left|right|top|bottom)", label: "([^"]+)"/g)].map((m) => m[1]),
  参数分组: [...app.matchAll(/SectionHeader title="([^"]+)"/g)].map((m) => m[1]),
  滑块: uniq([...app.matchAll(/ParameterField label="([^"]+)"/g)].map((m) => m[1])),
  选项组: uniq([...app.matchAll(/^\s*label="([^"]+)"\s*$/gm)].map((m) => m[1])),
  导出项: [...app.matchAll(/<span><strong>([^<]+)<\/strong>/g)].map((m) => m[1]),
  基础方案: [...lib.matchAll(/^\s*name: "([^"]+)"/gm)].map((m) => m[1]),
  车漆: [...app.matchAll(/\{ name: "([^"]+)", color: "#/g)].map((m) => m[1]),
};
const liveStrings = {
  显示模式: full.modes.map((m) => m.label),
  相机视图: full.views.map((v) => v.text),
  参数分组: full.sections.map((s) => s.title),
  滑块: [...liveFieldLabels],
  选项组: [...liveChoiceLabels],
  导出项: exportMenu.options.map((o) => o.strong),
  基础方案: templates.map((t) => t.name),
  车漆: full.paints.map((p) => p.name),
};
// 源码里有些标签是表达式拼出来的(例如「后窗倾角（当前 12.5°）」),去掉动态数字后再到源码里找。
const inSource = (s) => app.includes(s.replace(/当前 [\d.]+°）$/, '当前 '));
const sourceCheck = Object.keys(srcStrings).map((k) => {
  const missing = srcStrings[k].filter((s) => !liveStrings[k].includes(s));
  const dynamic = liveStrings[k].filter((s) => !srcStrings[k].includes(s) && inSource(s));
  const extra = liveStrings[k].filter((s) => !srcStrings[k].includes(s) && !inSource(s));
  return { group: k, source: srcStrings[k].length, live: liveStrings[k].length, missingOnLive: missing, dynamicLabels: dynamic, onlyOnLive: extra };
});
const html = await (await fetch(SITE)).text();
const storageKey = (app.match(/STORAGE_KEY = "([^"]+)"/) || [])[1];
const liveBuild = { htmlBytes: html.length, storageKey, storageKeyInLiveBundle: html.includes(storageKey) };
hostBadge.inServedHtml = /Powered by/i.test(html);
hostBadge.inRepoSource = /Powered by|netlify/i.test(app + css + scene + read('index.html') + read('src/main.tsx'));

/* ---------- 真实配色与字体(来自源码) ---------- */
const countHex = (text) => {
  const m = {};
  for (const h of text.match(/#[0-9a-fA-F]{6}\b/g) || []) m[h.toLowerCase()] = (m[h.toLowerCase()] || 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};
const palette = {
  rootVars: [...css.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]).filter(([k]) => !k.startsWith('--range') && !k.startsWith('--swatch')),
  cssTop: countHex(css).slice(0, 18),
  cssDistinct: countHex(css).length,
  scene: {
    cageOrange: (scene.match(/CAGE_ORANGE\s*=\s*"(#[0-9a-fA-F]{6})"/) || [])[1] || null,
    darkBackground: '#12191e',
    lightBackground: '#9a9c9b',
    creaseLine: '#ffd2a8',
    cagePoint: '#ffb37a',
  },
  exportPrimary: '#e07a3c',
  paints: full.paints,
  fontStacks: uniq([...css.matchAll(/font-family:\s*([^;]+);/g)].map((m) => m[1].trim())),
  webFonts: /@font-face|fonts\.googleapis/.test(css + read('index.html')),
};

const git = run('git', ['-C', SRC, 'log', '-1', '--format=%h|%ad|%s', '--date=short']).trim().split('|');
const pkg = JSON.parse(read('package.json'));
const versions = {
  node: process.version,
  playwright: JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/playwright/package.json'), 'utf8')).version,
  chromium: chromiumVersion,
  ffmpeg: run('ffmpeg', ['-version']).split('\n')[0].replace(/ Copyright.*/, ''),
  chromeArgs: CHROME_ARGS,
  fontMatch: {
    'sans-serif (zh-cn)': run('fc-match', ['sans-serif:lang=zh-cn']).trim(),
    Inter: run('fc-match', ['Inter']).trim(),
    'Liberation Mono': run('fc-match', ['Liberation Mono']).trim(),
  },
  repo: { url: 'https://github.com/635008780-coder/form-cc-studio', commit: git[0], date: git[1], subject: git.slice(2).join('|') },
  stack: Object.fromEntries(['react', 'three', '@react-three/fiber', '@react-three/drei', 'tailwindcss', 'vite', 'typescript'].map((k) => [k, pkg.dependencies?.[k] || pkg.devDependencies?.[k]])),
};

const result = {
  generatedAt: new Date().toISOString(),
  site: SITE,
  seconds: Math.round((Date.now() - started) / 1000),
  versions, env, fontsUsed, liveBuild,
  home: { topbar: home.topbar, viewport: home.viewport, sections: home.sections, modes: home.modes, views: home.views, rail: home.rail, panel: home.panel },
  full, templates, conditional, hostBadge, exportMenu, download, modeShots, dimension, helpToast,
  locators, sourceCheck, palette, logs: uniq(logs).slice(0, 12),
};
fs.writeFileSync(path.join(OUT, 'inventory.json'), JSON.stringify(result, null, 1));

// 给汇报页面用的精简版(去掉每个方案的完整字段表)
const slim = { ...result, templates: templates.map(({ fields, ...t }) => t) };
fs.mkdirSync(path.join(ROOT, 'src/data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'src/data/stage0.json'), JSON.stringify(slim));

/* ---------- 控制台摘要 ---------- */
const bad = locators.filter((l) => l.count !== 1);
console.log('WEBGL', JSON.stringify(env.webgl), 'canvas', JSON.stringify(env.canvas));
console.log('PAGE', env.title, '|', env.themeColor, '|', env.lang, '| storage', env.storageKeys.join(','), '| liveBuild', JSON.stringify(liveBuild));
console.log('FONTS', JSON.stringify(fontsUsed));
console.log('TOPBAR', JSON.stringify(home.topbar));
console.log('RAIL', full.rail.map((b) => `${b.text}[${b.title}]${b.active ? '*' : ''}`).join(' | '), '|', full.railVersion);
console.log('MODES', full.modes.map((m) => `${m.label}(${m.short})${m.selected ? '*' : ''}`).join(' | '), 'fullVisible=', full.modes[0].fullVisible);
console.log('VIEWS', full.views.map((v) => `${v.text}[${v.title}]${v.selected ? '*' : ''}`).join(' | '));
console.log('VIEWPORT', JSON.stringify(home.viewport));
console.log('PANEL', JSON.stringify(full.panel), full.captions.join(' ; '));
console.log('SECTIONS(home)', home.sections.map((s) => `${s.title}/${s.subtitle}${s.open ? '*' : ''}`).join(' | '));
console.log('FIELDS(sedan)', full.fields.length);
for (const s of full.sections) console.log('  ·', s.title, '→', full.fields.filter((f) => f.section === s.title).map((f) => `${f.label}=${f.value}${f.unit}[${f.min}..${f.max}/${f.step}]`).join(' ; '));
console.log('CHOICES', full.choices.map((c) => `${c.section || '-'}:${c.label}{${c.options.map((o) => o.text + (o.selected ? '*' : '')).join(',')}}`).join(' | '));
console.log('WHEEL', JSON.stringify(full.wheel));
console.log('PAINTS', full.paints.map((p) => p.name + (p.active ? '*' : '')).join(','), '| density note:', full.densityNote);
console.log('TEMPLATES');
for (const t of templates) console.log('  ·', t.type, '›', t.name, '|', t.desc, '|', t.reference, '|', JSON.stringify(t.dims), '|', t.status, '| toast:', t.toast, '| loc', t.count, '| fields', t.fieldCount);
console.log('EXPORT', JSON.stringify(exportMenu));
console.log('DOWNLOAD', JSON.stringify(download));
console.log('MODESHOTS', JSON.stringify(modeShots));
console.log('DIMENSION', dimension.join(' | '), '| HELP:', helpToast);
console.log('NOTES', full.notes.map((n) => `${n.section}:${n.text}`).join(' || '));
console.log('LOCATORS', locators.length, 'ok', locators.length - bad.length, 'bad', JSON.stringify(bad.map((l) => [l.text, l.sel, l.count])));
console.log('SOURCECHECK', JSON.stringify(sourceCheck));
console.log('PALETTE', JSON.stringify(palette.rootVars), JSON.stringify(palette.cssTop), palette.cssDistinct, JSON.stringify(palette.scene), JSON.stringify(palette.fontStacks), 'webFonts', palette.webFonts);
console.log('CONDITIONAL', JSON.stringify(conditional && { trigger: conditional.trigger, fields: conditional.fields.map((f) => `${f.label}=${f.value}${f.unit}[${f.min}..${f.max}/${f.step}]`), choices: conditional.choices, status: conditional.status }));
console.log('HOSTBADGE', JSON.stringify(hostBadge));
console.log('LOGS', JSON.stringify(result.logs));
console.log('DONE in', result.seconds, 's →', path.relative(ROOT, OUT));
