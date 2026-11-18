// 生成时间表:镜头起止、口播位置、字幕、动画节点、音效事件。
// 镜头时长由口播音频的真实时长和已录片段的长度共同决定,所以替换配音只需要重跑,不用改动画。
// 输出 WORK/schedule.json、output/captions.srt、src/data/schedule.json。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, WORK } from './lib/studio.mjs';

export const BPM = 120;
const BEAT = 60 / BPM;
const SR = 48000;
const CPS = 4.5; // 没有任何音频时的占位估算:每秒 4.5 个字
const LINES = JSON.parse(fs.readFileSync(path.join(ROOT, 'pipeline/vo_lines.json'), 'utf8'));
const CLIPS = ['R0', 'R2', 'R3', 'R6', 'R7', 'R8']; // 第五版开头不再用 R1 做背景
const hBeat = (x) => Math.ceil(x / (BEAT / 2) - 1e-6) * (BEAT / 2); // 向上取到半拍(0.25 秒)
const strip = (s) => s.replace(/[\s，。、：；！？,.!?:;]/g, '');
const qBeat = (x) => Math.max(BEAT, Math.round(x / BEAT) * BEAT);
const cBeat = (x) => Math.ceil(x / BEAT - 1e-6) * BEAT;
const r3 = (x) => Math.round(x * 1000) / 1000;

/** 读一句口播:优先用你自己的录音 assets/audio/<id>.wav,其次是合成语音 WORK/tts/<id>.mp3,都没有就用静音占位。 */
function loadVoice(line) {
  const recording = path.join(ROOT, 'assets/audio', line.id + '.wav');
  const tts = path.join(WORK, 'tts', line.id + '.mp3');
  const file = fs.existsSync(recording) ? recording : fs.existsSync(tts) ? tts : null;
  const lens = line.chunks.map((c) => strip(c).length);
  const total = lens.reduce((s, v) => s + v, 0);
  const offs = lens.map((_, k) => lens.slice(0, k).reduce((s, v) => s + v, 0));
  if (!file) {
    const dur = r3(total / CPS);
    return { source: 'placeholder', file: null, t0: 0, dur, starts: offs.map((o) => r3((dur * o) / total)), voice: null };
  }
  const dec = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  const raw = dec.stdout;
  const pcm = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + (raw.length & ~3)));
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) if (Math.abs(pcm[i]) > peak) peak = Math.abs(pcm[i]);
  const th = Math.max(0.003, peak * 0.03);
  let a = 0;
  while (a < pcm.length && Math.abs(pcm[a]) < th) a++;
  let b = pcm.length - 1;
  while (b > a && Math.abs(pcm[b]) < th) b--;
  const t0 = Math.max(0, a / SR - 0.015); // 语音在文件里的起点
  const dur = Math.min(pcm.length / SR, b / SR + 0.08) - t0;
  let starts = null;
  let voice = null;
  const meta = tts.replace(/\.mp3$/, '.json');
  if (file === tts && fs.existsSync(meta)) {
    // 合成语音带逐词时间戳:每条字幕的起点取它第一个词的真实起点
    const info = JSON.parse(fs.readFileSync(meta, 'utf8'));
    voice = { name: info.voice, rate: info.rate };
    const wl = info.words.map((w) => strip(w.w).length);
    if (Math.abs(wl.reduce((s, v) => s + v, 0) - total) <= 2) {
      starts = offs.map((o) => {
        let cum = 0;
        for (let i = 0; i < wl.length; i++) {
          if (cum + wl[i] > o) return Math.max(0, info.words[i].t - t0);
          cum += wl[i];
        }
        return dur;
      });
      starts[0] = 0;
    }
  }
  if (!starts) starts = offs.map((o) => (dur * o) / total); // 没有时间戳时按字数比例分配
  return { source: file === recording ? 'recording' : 'tts', file, t0: r3(t0), dur: r3(dur), starts: starts.map(r3), voice };
}

function loadClip(name) {
  const file = path.join(ROOT, 'raw', name + '.meta.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (process.env.PROMO_STUB !== '1') throw new Error(`缺少录制片段 ${name},先运行 node build.mjs record`);
  // 只为在录制完成前调试示意动画用的替身
  return { name, frames: 300, marks: { 'sedan:a': 20, 'sedan:b': 80, 'suv:a': 120, 'suv:b': 180, 'micro:a': 220, 'micro:b': 280, end: 150, export: 80 }, events: [], meta: Array.from({ length: 300 }, () => [700, 400, 0]), stub: true };
}

export function buildSchedule() {
  const inv = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/stage0.json'), 'utf8'));
  const clips = Object.fromEntries(CLIPS.map((name) => [name, loadClip(name)]));
  fs.mkdirSync(path.join(WORK, 'audio'), { recursive: true });
  const V = Object.fromEntries(LINES.map((line) => [line.id, loadVoice(line)]));
  // 第五版节奏:前半段(口播一句接一句)把句间的空拍收紧到约 0.4 秒,镜头只取到半拍;
  // 后半段(网站录屏)口播晚半拍进,先让人看清画面再开口。口播本身的语速、音高一律不动。
  const LEAD = { s1: 0.2, s2: 0.18, s3: 0.18, s4: 0.18, s5a: 0.35, s5b: 0.5, s5c: 0.6, s5d: 0.6, s6: 0.5, s7: 0.45 };
  const need = (id, tail) => LEAD[id] + V[id].dur + tail;

  /* ---------- 镜头 ---------- */
  const whole = (clip) => ({ clip, from: 0, frames: clips[clip].frames });
  const downs = (c) => c.events.filter((e) => e.t === 'down').map((e) => e.f);
  const first = inv.templates[0].name;
  const shown = clips.R2.shown || [];
  const morphs = clips.R2.events.filter((e) => e.t === 'morph');
  const tplEvents = morphs.map((e, i) => ({ f: Math.max(0, e.f - 10), name: shown[i] || e.name }));
  const paintEvents = clips.R7.events.filter((e) => e.t === 'paint').map((e) => ({ f: Math.max(0, e.f - 16), name: e.name }));
  const end8 = clips.R8.marks.end;
  const m8 = clips.R8.marks;
  // 录制时记下的"重点按下":位置用于把镜头推近,时刻用于按压动效
  const ev8 = clips.R8.events;
  const press = ev8.filter((e) => e.t === 'press' && e.f < end8).map((e) => {
    const up = ev8.find((x) => x.t === 'up' && x.f > e.f);
    return { t: r3(e.f / 60), hold: r3(((up ? up.f : e.f + 8) - e.f) / 60), x: e.x, y: e.y, w: e.w, h: e.h, name: e.name };
  });
  const picked = (clip, type) => clips[clip].events.filter((e) => e.t === type).map((e) => ({ f: Math.max(0, e.f - 6), name: e.text }));

  const shots = [
    { id: 'A1', kind: '三维车身(只在开场亮相)', vo: 's1', dur: hBeat(need('s1', 0.3)) },
    { id: 'A2', kind: '情绪动画(不用车模型)', vo: 's2', dur: hBeat(need('s2', 0.3)) },
    { id: 'A3', kind: '线稿动画(不用车模型)', vo: 's3', dur: hBeat(need('s3', 0.25)) },
    { id: 'A4', kind: '三维线框', vo: 's4', dur: hBeat(need('s4', 0.4)) },
    { id: 'B2', kind: '真实', vo: 's5a', parts: [whole('R0')], min: need('s5a', 0.3), extra: [{ t: 2.1, text: '不用安装 · 不用登录' }] },
    { id: 'B6', kind: '真实', vo: 's5b', parts: [whole('R2')], min: need('s5b', 0.2), extra: [{ t: 0.3, text: '8 个标准车型' }],
      tag: { clip: 'R2', title: '基础方案', events: tplEvents, first, order: [...new Set([first, ...tplEvents.map((e) => e.name)])] } },
    { id: 'B4', kind: '真实', vo: 's5c', parts: [whole('R3')], min: need('s5c', 0.3), biasY: 110,
      tag: { clip: 'R3', title: '轮辋直径', events: picked('R3', 'rim') } },
    { id: 'B7', kind: '真实', vo: 's5d', parts: [whole('R6')], min: need('s5d', 0.3), biasY: 110,
      tag: { clip: 'R6', title: '前脸格栅', events: picked('R6', 'grille') } },
    { id: 'B8', kind: '真实', parts: [whole('R7')],
      tag: { clip: 'R7', title: '车身颜色', events: paintEvents, colors: Object.fromEntries(inv.full.paints.map((x) => [x.name, x.color])) } },
    { id: 'B9', kind: '真实', vo: 's6', parts: [{ clip: 'R8', from: 0, frames: end8 }], min: need('s6', 0.3),
      exportAt: m8.export / 60, press, file: clips.R8.download?.filename || '', toast: clips.R8.toast || '' },
    { id: 'B10', kind: '真实 + 包装', vo: 's7', parts: [{ clip: 'R8', from: end8, frames: clips.R8.frames - end8 }], min: Math.max(4.5, need('s7', 0.6)) },
  ];
  let t = 0;
  for (const sh of shots) {
    if (sh.parts) {
      sh.total = sh.parts.reduce((s, x) => s + x.frames, 0);
      sh.dur = Math.max(qBeat(sh.total / 60), cBeat(sh.min || 0));
      // 录制时打的标签 → 左上角说明文字(都是真实界面里的名称)
      const labels = [];
      let off = 0;
      for (const part of sh.parts) {
        for (const e of clips[part.clip].events) {
          if (e.t === 'label' && e.f >= part.from && e.f < part.from + part.frames) labels.push({ t: r3(Math.max(0.12, (off + e.f - part.from) / 60 - 0.1)), text: e.text });
        }
        off += part.frames;
      }
      sh.stickers = [...(sh.extra || []), ...labels].sort((x, y) => x.t - y.t);
    }
    sh.start = r3(t);
    sh.end = r3(t + sh.dur);
    t += sh.dur;
  }
  const duration = r3(t);
  const shot = (id) => shots.find((sh) => sh.id === id);

  /* ---------- 口播位置、字幕(单行短句)、示意动画的节点 ---------- */
  const vo = [];
  const captions = [];
  for (const line of LINES) {
    const v = V[line.id];
    const sh = shot(line.shot);
    const start = sh.start + LEAD[line.id]; // 语音真正开始的时刻
    vo.push({ id: line.id, line: line.line, shot: line.shot, source: v.source, file: v.file, t0: v.t0, dur: v.dur, start: r3(start), text: line.chunks.join(' / '), voice: v.voice });
    sh.cue = v.starts.map((s) => r3(LEAD[line.id] + s));
    line.chunks.forEach((text, k) => {
      const a = start + v.starts[k];
      const b = k + 1 < line.chunks.length ? start + v.starts[k + 1] : start + v.dur + 0.2;
      let html = text;
      for (const key of line.hl || []) html = html.split(key).join(`<b>${key}</b>`);
      captions.push({ id: line.line, vo: line.id, start: r3(Math.max(0, a - 0.04)), end: r3(b - 0.04), text, html });
    });
  }

  /* ---------- 音效事件:真实的鼠标按下 → 点击声;大字 → 砸声;切镜与变形 → 风声 ---------- */
  const sfx = [];
  const add = (time, type, gain = 1) => {
    if (time >= 0 && time < duration) sfx.push({ t: r3(time), type, gain });
  };
  for (const sh of shots) {
    if (sh.id !== 'A1') add(sh.start, 'whoosh', sh.id === 'B2' || sh.id === 'B10' ? 1 : 0.55);
    if (!sh.parts) continue;
    let offset = 0;
    for (const part of sh.parts) {
      const ev = clips[part.clip].events;
      ev.forEach((e, i) => {
        if (e.t !== 'down' || e.f < part.from || e.f >= part.from + part.frames) return;
        const up = ev.slice(i + 1).find((x) => x.t === 'up');
        const time = sh.start + (offset + e.f - part.from) / 60;
        if (time < sh.end) add(time, up && up.f - e.f <= 9 ? 'click' : 'grab', 1);
      });
      offset += part.frames;
    }
  }
  for (const c of shot('A1').cue) add(c, 'thud', 1);
  {
    // A2 情绪动画:钟越走越快 → 一张张"再来一版"砸下来 → 栽在键盘上 → 压力松开
    const s = shot('A2');
    const [c0, c1, c2, c3] = s.cue;
    const hit = c2 + 1.25;
    add(s.start + c0, 'pop', 0.6);
    add(s.start + c1, 'thud', 1.1);
    for (let x = c1 + 0.3, gap = 0.3; x < hit - 0.1; x += gap, gap = Math.max(0.09, gap * 0.86)) add(s.start + x, 'click', 0.55);
    [0.05, 0.35, 0.65, 0.95].forEach((d) => add(s.start + c2 + d, 'pop', 0.7));
    add(s.start + hit, 'thud', 1.35);
    add(s.start + c3, 'whoosh', 0.5);
    [0, 1, 2, 3, 4].forEach((k) => add(s.start + c3 + 0.3 + k * 0.13, 'pop', 0.5));
  }
  {
    // A3:时间条 → 翻牌(每张一声)→ 三根尺寸线 → 趋势线
    const s = shot('A3');
    const [c0, c1, c2, c3] = s.cue;
    add(s.start + c0 + 0.2, 'whoosh', 0.45);
    const gap = Math.min(0.45, (c2 - c1 - 0.5) / 3);
    [0, 1, 2, 3].forEach((k) => { add(s.start + c1 + 0.12 + k * gap, 'pop', 0.7); if (k) add(s.start + c1 + 0.17 + k * gap, 'thud', 0.5); });
    [0, 1, 2].forEach((k) => add(s.start + c2 + 0.08 + k * 0.26, 'click', 0.9));
    add(s.start + c3, 'whoosh', 0.5);
  }
  {
    const s = shot('A4');
    const [c0, c1, c2, c3, c4] = s.cue;
    add(s.start + c0, 'thud', 0.8); add(s.start + c1, 'pop', 0.8);
    [0.5, 1.4].forEach((d) => add(s.start + c1 + d, 'whoosh', 0.45));
    add(s.start + c2, 'pop', 0.8);
    add(s.start + c3, 'pop', 0.6); add(s.start + c3 + 0.12, 'pop', 0.6);
    add(s.start + c4, 'whoosh', 0.5);
    [0.35, 0.5, 0.65, 0.8].forEach((d) => add(s.start + c4 + d, 'pop', 0.45));
  }
  add(shot('B2').start - 1.0, 'riser', 1);
  add(shot('B2').start, 'thud', 0.7); // 接缝处不再重砸一下:画面是推过去的,声音也顺着走
  for (const e of tplEvents) add(shot('B6').start + e.f / 60, 'pop', 0.7);
  for (const e of paintEvents) add(shot('B8').start + e.f / 60, 'pop', 0.65);
  for (const p of press) add(shot('B9').start + p.t, 'thud', 0.6); // 按下去的那一下
  add(shot('B9').start + shot('B9').exportAt + 0.6, 'thud', 0.9);
  add(shot('B10').start - 1.0, 'riser', 1);
  add(shot('B10').start + 0.5, 'thud', 1.2);
  sfx.sort((x, y) => x.t - y.t);

  return { fps: 60, bpm: BPM, beat: BEAT, duration, shots, vo, captions, sfx, clips };
}

const srtTime = (x) => {
  const ms = Math.round(x * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};

if (process.argv[1] && process.argv[1].endsWith('schedule.mjs')) {
  const s = buildSchedule();
  fs.mkdirSync(path.join(ROOT, 'output'), { recursive: true });
  fs.writeFileSync(path.join(WORK, 'schedule.json'), JSON.stringify(s));
  fs.writeFileSync(path.join(ROOT, 'output/captions.srt'), s.captions.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n'));
  const sources = [...new Set(s.vo.map((v) => v.source))];
  const slim = {
    fps: s.fps, bpm: s.bpm, duration: s.duration,
    shots: s.shots.map((sh) => ({ id: sh.id, kind: sh.kind, start: sh.start, end: sh.end, vo: sh.vo || null, cue: sh.cue || null, clips: sh.parts ? sh.parts.map((x) => x.clip) : sh.cards ? ['R1'] : [] })),
    vo: s.vo.map((v) => ({ id: v.id, line: v.line, shot: v.shot, start: v.start, dur: v.dur, source: v.source, text: v.text })),
    voice: { sources, name: s.vo.find((v) => v.voice)?.voice?.name || null, rate: s.vo.find((v) => v.voice)?.voice?.rate || null, seconds: r3(s.vo.reduce((sum, v) => sum + v.dur, 0)) },
    captions: s.captions.map((c) => ({ id: c.id, start: c.start, end: c.end, text: c.text })),
    clips: Object.fromEntries(Object.entries(s.clips).map(([k, c]) => [k, { frames: c.frames, seconds: Number((c.frames / 60).toFixed(2)), sliders: c.sliders, shown: c.shown, paints: c.paints, tire: c.tire, toast: c.toast, download: c.download, exportClicked: c.exportClicked }])),
    picks: { rim: s.clips.R3.events.filter((e) => e.t === 'rim').map((e) => e.text), grille: s.clips.R6.events.filter((e) => e.t === 'grille').map((e) => e.text), press: s.shots.find((sh) => sh.id === 'B9').press.map((p) => p.name) },
    sfxCount: s.sfx.length,
  };
  fs.writeFileSync(path.join(ROOT, 'src/data/schedule.json'), JSON.stringify(slim));
  console.log('duration', s.duration, 's', '| voice', sources.join('+'), slim.voice.seconds + 's');
  for (const sh of s.shots) console.log(sh.id.padEnd(4), sh.start.toFixed(2).padStart(6), '→', sh.end.toFixed(2).padStart(6), (sh.parts || []).map((x) => `${x.clip}[${x.from}+${x.frames}]`).join(' '), sh.total ? `素材 ${(sh.total / 60).toFixed(2)}s` : '', sh.cue ? 'cue ' + sh.cue.join(',') : '');
  console.log('vo', s.vo.map((v) => `${v.id}@${v.start}+${v.dur}`).join(' '));
  console.log('captions', s.captions.length, 'sfx', s.sfx.length);
}
