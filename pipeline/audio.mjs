// 混音:代码合成的音乐(120 BPM)+ 音效 + 口播。口播出现时音乐压低 11 dB,最后归一到 -14 LUFS / 真峰值 ≤ -1 dBTP。
// 口播来源见 pipeline/schedule.mjs:你的录音 > 合成语音 > 静音占位。音乐目前由这里合成(没有 assets/music/track.mp3)。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { WORK, run, log } from './lib/studio.mjs';

const SR = 48000;
const sched = JSON.parse(fs.readFileSync(path.join(WORK, 'schedule.json'), 'utf8'));
const DUR = sched.duration; // 与画面等长,结尾 0.5 秒淡出
const N = Math.round(DUR * SR);
const bus = () => [new Float32Array(N), new Float32Array(N)];
const music = bus(), arp = bus(), fx = bus(), voice = bus();
let seed = 20260105;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1; // 固定种子,可复现
const put = (b, i, l, r) => { if (i >= 0 && i < N) { b[0][i] += l; b[1][i] += r; } };
const TAU = 2 * Math.PI;

/* ---------- 乐器 ---------- */
function kick(b, t, g = 1) {
  const s0 = Math.round(t * SR); let ph = 0;
  for (let i = 0; i < SR * 0.32; i++) { const x = i / SR; ph += (TAU * (44 + 110 * Math.exp(-x * 28))) / SR; const v = g * (0.9 * Math.sin(ph) * Math.exp(-x * 11) + 0.22 * rnd() * Math.exp(-x * 400)); put(b, s0 + i, v, v); }
}
function clap(b, t, g = 1) {
  const s0 = Math.round(t * SR); let b1 = 0, b2 = 0;
  for (let i = 0; i < SR * 0.17; i++) { const x = i / SR; b1 += 0.45 * (rnd() - b1); b2 += 0.12 * (b1 - b2); const env = Math.exp(-x * 28) * (x < 0.03 ? 0.55 + 0.45 * Math.abs(Math.sin(x * 330)) : 1); const v = g * 0.55 * (b1 - b2) * env; put(b, s0 + i, v * 0.9, v * 1.1); }
}
function hat(b, t, g = 1, pan = 0) {
  const s0 = Math.round(t * SR); let lp = 0;
  for (let i = 0; i < SR * 0.045; i++) { const x = i / SR; const n = rnd(); lp += 0.6 * (n - lp); const v = g * 0.2 * (n - lp) * Math.exp(-x * 110); put(b, s0 + i, v * (1 - pan), v * (1 + pan)); }
}
function bass(b, t, f, len = 0.22, g = 1) {
  const s0 = Math.round(t * SR); let ph = 0, lp = 0;
  for (let i = 0; i < SR * len; i++) {
    const x = i / SR; ph += f / SR; const fr = ph % 1;
    lp += (0.04 + 0.1 * Math.exp(-x * 14)) * (0.6 * (2 * fr - 1) + 0.4 * (fr < 0.5 ? 1 : -1) - lp);
    const env = Math.min(1, x * 200) * Math.exp(-x * 4) * Math.min(1, (len - x) / 0.02);
    const v = g * (0.42 * lp + 0.36 * Math.sin(TAU * ph)) * env; put(b, s0 + i, v, v);
  }
}
function pad(b, t, freqs, len, g = 1) {
  const s0 = Math.round(t * SR);
  const osc = freqs.flatMap((f) => [f * 0.996, f, f * 1.004]).map((f, k) => ({ f, p: k * 0.37 }));
  let lpL = 0, lpR = 0;
  for (let i = 0; i < SR * len; i++) {
    const x = i / SR; let l = 0, r = 0;
    for (let k = 0; k < osc.length; k++) { const o = osc[k]; o.p += o.f / SR; const s = 2 * (o.p % 1) - 1; if (k % 3 === 0) l += s; else if (k % 3 === 2) r += s; else { l += s * 0.7; r += s * 0.7; } }
    const env = Math.min(1, x / 0.45) * Math.min(1, (len - x) / 0.5);
    const cut = 0.036 + 0.018 * Math.sin(x * 0.9);
    lpL += cut * (l - lpL); lpR += cut * (r - lpR);
    put(b, s0 + i, g * 0.075 * lpL * env, g * 0.075 * lpR * env);
  }
}
function pluck(b, t, f, g = 1, pan = 0) {
  const s0 = Math.round(t * SR); let ph = 0;
  for (let i = 0; i < SR * 0.3; i++) { const x = i / SR; ph += f / SR; const tri = 2 * Math.abs(2 * (ph % 1) - 1) - 1; const v = g * 0.15 * (0.7 * tri + 0.3 * Math.sin(2 * TAU * ph)) * Math.exp(-x * 13) * Math.min(1, x * 400); put(b, s0 + i, v * (1 - pan), v * (1 + pan)); }
}
/* ---------- 音效 ---------- */
function thud(b, t, g = 1) { // 大字"砸"声:正弦下扫 + 噪声瞬态
  const s0 = Math.round(t * SR); let ph = 0, lp = 0;
  for (let i = 0; i < SR * 0.5; i++) { const x = i / SR; ph += (TAU * (42 + 130 * Math.exp(-x * 22))) / SR; lp += 0.25 * (rnd() - lp); const v = g * (0.85 * Math.sin(ph) * Math.exp(-x * 8) + 0.4 * lp * Math.exp(-x * 55)); put(b, s0 + i, v, v); }
}
function click(b, t, g = 1) {
  const s0 = Math.round(t * SR);
  for (let i = 0; i < SR * 0.05; i++) { const x = i / SR; const v = g * (0.3 * Math.sin(TAU * 2100 * x) * Math.exp(-x * 160) + 0.2 * rnd() * Math.exp(-x * 900)); put(b, s0 + i, v, v); }
}
function grab(b, t, g = 1) {
  const s0 = Math.round(t * SR);
  for (let i = 0; i < SR * 0.06; i++) { const x = i / SR; const v = g * (0.22 * Math.sin(TAU * 900 * x) * Math.exp(-x * 110) + 0.1 * rnd() * Math.exp(-x * 700)); put(b, s0 + i, v, v); }
}
function pop(b, t, g = 1) {
  const s0 = Math.round(t * SR); let ph = 0;
  for (let i = 0; i < SR * 0.09; i++) { const x = i / SR; ph += (TAU * (520 + (520 * x) / 0.09)) / SR; const v = g * 0.26 * Math.sin(ph) * Math.exp(-x * 38) * Math.min(1, x * 600); put(b, s0 + i, v * 0.85, v * 1.15); }
}
function whoosh(b, t, g = 1, len = 0.5) { // 风声:带通噪声,频率上扫,左右掠过
  const s0 = Math.round((t - len * 0.45) * SR); let b1 = 0, b2 = 0;
  for (let i = 0; i < SR * len; i++) { const u = i / (SR * len); const a = Math.min(0.9, (TAU * (400 + 2800 * u)) / SR); b1 += a * (rnd() - b1); b2 += a * 0.5 * (b1 - b2); const v = g * 0.55 * (b1 - b2) * Math.sin(Math.PI * u) ** 2; put(b, s0 + i, v * (1 - 0.5 * u), v * (0.5 + 0.5 * u)); }
}
function riser(b, t, g = 1, len = 1.0) {
  const s0 = Math.round(t * SR); let b1 = 0, b2 = 0, ph = 0;
  for (let i = 0; i < SR * len; i++) { const u = i / (SR * len); const a = Math.min(0.9, (TAU * (300 + 5000 * u * u)) / SR); b1 += a * (rnd() - b1); b2 += a * 0.4 * (b1 - b2); ph += (TAU * (180 + 620 * u * u)) / SR; const v = g * u * u * (0.42 * (b1 - b2) + 0.1 * Math.sin(ph)); put(b, s0 + i, v, v); }
}

/* ---------- 编曲:Am – F – C – G,每小节 2 秒。段落跟着镜头走,每段的小节线从该段起点算起 ---------- */
const at = (id) => sched.shots.find((s) => s.id === id).start;
const T = { A2: at('A2'), A4: at('A4'), B2: at('B2'), B9: at('B9'), B10: at('B10'), END: sched.duration };
const PROG = [
  { bass: 55.0, notes: [220.0, 261.63, 329.63] },
  { bass: 43.65, notes: [174.61, 220.0, 261.63] },
  { bass: 65.41, notes: [196.0, 261.63, 329.63] },
  { bass: 49.0, notes: [196.0, 246.94, 293.66] },
];
const STEP = 0.125; // 十六分音符
const ARP = [0, 1, 2, 1, 2, 1, 0, 2];
function section(from, to, fn) {
  for (let m = 0; from + m * STEP < to - 1e-6; m++) {
    const t = from + m * STEP;
    const s16 = m % 16;
    const bar = Math.floor(m / 16);
    const chord = PROG[bar % 4];
    if (s16 === 0) pad(music, t, chord.notes, Math.min(2.4, to + 0.4 - t), 0.9);
    fn({ t, m, s16, bar, chord, beat: s16 % 4 === 0, off: s16 % 4 === 2, left: to - t });
  }
}
// 开头三张大字卡:只留越来越密的镲,把空间让给砸声和口播
for (let m = 0; m * STEP < T.A2; m++) {
  const t = m * STEP;
  if (t >= 1 && m % 4 === 2) hat(music, t, 0.5 + 0.25 * (t / T.A2));
  if (t >= 2.5 && m % 2 === 1) hat(music, t, 0.3, 0.3);
}
// 第五版:原来问题介绍用半拍速、网站一登场就切到完整律动外加十六分琶音,前慢后快的"断层"有一半是音乐造成的。
// 现在全片同一个速度、同一套律动:问题介绍段就用四分底鼓 + 八分贝斯往前推(画面切得快,音乐也在走);
// 网站登场的第一小节把底鼓抽掉,让画面"落"下来;演示段回到同样的律动,琶音从十六分减成八分,不再催着人看。
section(T.A2, T.B2, ({ t, m, s16, chord, beat, off, left }) => {
  if (left > 1 && beat) kick(music, t, 0.8);
  if (left > 1 && (s16 === 4 || s16 === 12)) clap(music, t, 0.7);
  if (s16 % 2 === 0) bass(music, t, chord.bass, 0.2, off ? 0.85 : 0.7);
  if (off) hat(music, t, 0.5);
  if (s16 % 2 === 0 && !off) hat(music, t, 0.28, -0.2);
  if (s16 % 2 === 0) pluck(arp, t, chord.notes[ARP[(m >> 1) % 8]] * 2, 0.5, (m >> 1) % 2 ? 0.3 : -0.3);
  if (t >= T.A4 && s16 % 4 === 3) hat(music, t, 0.22, 0.3); // 讲到两派时多一层镲,往接缝处加一点劲
  if (left <= 1) clap(music, t, 0.25 + 0.4 * (1 - left));
});
section(T.B2, T.B9, ({ t, m, s16, bar, chord, beat, off }) => {
  const open = bar === 0; // 登场的第一小节:只留铺底、贝斯和琶音
  if (beat && !open) kick(music, t, 0.9);
  if (!open && (s16 === 4 || s16 === 12)) clap(music, t, 0.75);
  if (bar % 4 === 3 && (s16 === 14 || s16 === 15)) clap(music, t, 0.4);
  if (off) hat(music, t, 0.6, 0.15);
  if (beat) bass(music, t, chord.bass, 0.4, 0.85);
  if (off) bass(music, t, chord.bass * (s16 === 14 ? 1.5 : 1), 0.2, 0.7);
  if (s16 % 2 === 0) pluck(arp, t, chord.notes[ARP[(m >> 1) % 8]] * 2, 0.62, (m >> 1) % 2 ? 0.35 : -0.35);
});
// 导出:抽掉鼓,留铺底和琶音,最后一秒滚奏
section(T.B9, T.B10, ({ t, s16, chord, off, left }) => {
  if (s16 % 2 === 0) pluck(arp, t, chord.notes[[0, 1, 2, 1][(s16 / 2) % 4]] * 2, 0.8, s16 % 4 === 0 ? -0.3 : 0.3);
  if (off) hat(music, t, 0.45);
  if (s16 === 0) bass(music, t, chord.bass, 1.2, 0.8);
  if (left <= 1) clap(music, t, 0.3 + 0.55 * (1 - left));
});
// 结尾:律动回来(同样是八分琶音),最后一秒收住
section(T.B10, T.END, ({ t, m, s16, chord, beat, off, left }) => {
  if (left <= 1) return;
  if (beat) kick(music, t, 0.95);
  if (s16 === 4 || s16 === 12) clap(music, t, 0.85);
  if (s16 % 2 === 0) hat(music, t, off ? 0.7 : 0.35);
  if (s16 % 2 === 0) bass(music, t, chord.bass, 0.2, 0.85);
  if (s16 % 2 === 0) pluck(arp, t, chord.notes[ARP[(m >> 1) % 8]] * 2, 0.62, (m >> 1) % 2 ? 0.35 : -0.35);
});
kick(music, T.B2, 0.85);
kick(music, T.B10, 1.1);
bass(music, T.END - 1, 55, 1.4, 0.9);
// 琶音加一个附点八分的乒乓回声
{
  const d = Math.round(0.375 * SR);
  for (let i = d; i < N; i++) { arp[0][i] += 0.34 * arp[1][i - d]; arp[1][i] += 0.34 * arp[0][i - d]; }
  for (let i = 0; i < N; i++) { music[0][i] += arp[0][i]; music[1][i] += arp[1][i]; }
}

/* ---------- 音效 ---------- */
const FX = { thud, click, grab, pop, whoosh, riser };
for (const e of sched.sfx) FX[e.type](fx, e.t, e.gain);

/* ---------- 口播:去掉低频轰声,统一响度,放到时间表指定的位置;同时记下要压低音乐的区间 ---------- */
const DUCK = Math.pow(10, -11 / 20);
const duckTarget = new Float32Array(N).fill(1);
const sources = { recording: [], tts: [], placeholder: [] };
for (const v of sched.vo) {
  sources[v.source].push(v.id);
  if (!v.file) continue;
  const dec = spawnSync('ffmpeg', ['-v', 'error', '-i', v.file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  const raw = dec.stdout;
  const pcm = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + (raw.length & ~3)));
  const a = Math.round(v.t0 * SR);
  const n = Math.max(0, Math.min(pcm.length - a, Math.round((v.dur + 0.1) * SR)));
  const hp = new Float32Array(n);
  const alpha = 1 / (1 + (TAU * 85) / SR); // 85 Hz 高通
  let rms = 0;
  for (let i = 1; i < n; i++) { hp[i] = alpha * (hp[i - 1] + pcm[a + i] - pcm[a + i - 1]); rms += hp[i] * hp[i]; }
  rms = Math.sqrt(rms / Math.max(1, n));
  const g = Math.min(10, 0.15 / (rms || 1e-6));
  const fade = Math.round(0.008 * SR);
  const s0 = Math.round(v.start * SR);
  for (let i = 0; i < n; i++) { const x = hp[i] * g * Math.min(1, i / fade, (n - i) / fade); put(voice, s0 + i, x, x); }
  duckTarget.fill(DUCK, Math.max(0, s0 - Math.round(0.1 * SR)), Math.min(N, s0 + n + Math.round(0.12 * SR)));
}
const att = 1 - Math.exp(-1 / (0.1 * SR)), rel = 1 - Math.exp(-1 / (0.35 * SR));
let duck = 1;
let sumVoice = 0, sumBack = 0; // 口播区间里人声与背景(音乐 + 音效)的能量,用来实测人声高出多少
const out = bus();
for (let i = 0; i < N; i++) {
  duck += (duckTarget[i] < duck ? att : rel) * (duckTarget[i] - duck);
  const fxDuck = 0.5 + (0.5 * (duck - DUCK)) / (1 - DUCK); // 音效在口播处也让一半(约 -6 dB)
  const fade = Math.min(1, (N - i) / (0.5 * SR));
  if (duckTarget[i] < 1) {
    const back = music[0][i] * 0.64 * duck + fx[0][i] * 0.72 * fxDuck;
    sumVoice += voice[0][i] * voice[0][i];
    sumBack += back * back;
  }
  for (let c = 0; c < 2; c++) {
    const x = (music[c][i] * 0.64 * duck + fx[c][i] * 0.72 * fxDuck + voice[c][i]) * fade;
    out[c][i] = Math.tanh(x * 1.15) / 1.15; // 软限幅,控制峰值
  }
}
function writeWav(file, [L, R]) {
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  const q = (x) => Math.round(Math.max(-1, Math.min(1, x)) * 32767);
  for (let i = 0; i < N; i++) { buf.writeInt16LE(q(L[i]), 44 + i * 4); buf.writeInt16LE(q(R[i]), 46 + i * 4); }
  fs.writeFileSync(file, buf);
}
const dir = path.join(WORK, 'audio');
fs.mkdirSync(dir, { recursive: true });
const rawMix = path.join(dir, 'mix_raw.wav');
const mix = path.join(dir, 'mix.wav');
writeWav(rawMix, out);

/* ---------- 响度:增益 + 限幅器,实测后微调。目标 -14 LUFS;真峰值压到约 -2.6 dBTP,因为 AAC 编码会让峰值再涨约 1 dB ---------- */
function measure(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const tail = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  return { lufs: Number((tail.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]), lra: Number((tail.match(/LRA:\s+(-?[\d.]+) LU/) || [])[1]), truePeak: Number((tail.match(/Peak:\s+(-?[\d.]+) dBFS/) || [])[1]) };
}
const before = measure(rawMix);
let gain = -14 - before.lufs + 0.4;
let after = before;
for (let pass = 0; pass < 4; pass++) {
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', rawMix, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.74:attack=2:release=60:level=false`, '-ar', String(SR), mix]);
  after = measure(mix);
  if (Math.abs(after.lufs + 14) <= 0.15) break;
  gain += -14 - after.lufs;
}
const voiced = sched.vo.find((v) => v.voice);
const report = {
  bpm: sched.bpm, seconds: Number(DUR.toFixed(2)), music: '代码合成(无 assets/music/track.mp3)',
  voice: { ...sources, name: voiced?.voice?.name || null, rate: voiced?.voice?.rate || null, seconds: Number(sched.vo.reduce((s, v) => s + v.dur, 0).toFixed(1)) },
  ducking: sources.recording.length + sources.tts.length ? '-11 dB(起 0.10 秒,落 0.35 秒)' : '未触发(口播是静音占位)',
  voiceOverBackgroundDb: sumBack > 0 && sumVoice > 0 ? Number((10 * Math.log10(sumVoice / sumBack)).toFixed(1)) : null,
  sfx: sched.sfx.length, gainDb: Number(gain.toFixed(2)), before, after,
};
fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 1));
log('AUDIO', JSON.stringify(report));
