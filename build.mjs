#!/usr/bin/env node
// 一键重建。先执行 bash pipeline/setup.sh 准备环境。
//   node build.mjs all        录制 → 口播合成 → 时间表 → 混音 → 打包开场动画 → 渲染 → 封装 → 抽帧 → 内嵌到页面
//   node build.mjs schedule audio web sheets embed      只跑其中几步(按给出的顺序)
// 步骤:record | tts | schedule | audio | intro(打包 src/intro 给合成页)| web(1280×720 30 帧,页面内嵌用)| master(1920×1080 60 帧主版本)| cover | sheets | embed
//       webmux / mastermux:只重新封装(换了音频或压缩率时用)
// 环境变量:PROMO_WORK 中间文件目录;PROMO_DSF 录制像素比(默认 1,设 1.3333 录成 1920×1080);PROMO_GPU=1 使用真实显卡;
//           PROMO_VOICE / PROMO_VOICE_RATE 合成语音的音色与语速。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, WORK, run, log, pad5, launch, VF_709, X264_COLOR } from './pipeline/lib/studio.mjs';

const exec = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', env: process.env });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} → exit ${code}`))));
  });
const node = (args) => exec('node', args);
const schedule = () => JSON.parse(fs.readFileSync(path.join(WORK, 'schedule.json'), 'utf8'));
const OUT = path.join(ROOT, 'output');
fs.mkdirSync(OUT, { recursive: true });

const WEB = () => ({ name: 'web', fps: 30, scale: 2 / 3, crf: Number(process.env.WEB_CRF || 28), out: 'output/promo_web_720p.mp4', audio: '96k', preset: 'slow', level: '3.1' });
const HD = { name: 'hd', fps: 30, scale: 1, crf: Number(process.env.HD_CRF || 25), out: 'output/promo_hd_1080p.mp4', audio: '128k', preset: 'slow', level: '4.0' };
const MASTER = { name: 'master', fps: 60, scale: 1, crf: 18, out: 'output/promo_16x9.mp4', audio: '192k', preset: 'medium', level: '4.2' };

async function renderFrames({ name, fps, scale, workers = 2 }) {
  const s = schedule();
  fs.rmSync(path.join(WORK, 'render', name), { recursive: true, force: true });
  const base = ['pipeline/render.mjs', '--name', name, '--fps', String(fps), '--scale', String(scale)];
  // 两趟:开场(到网站登场的转场结束为止)要 WebGL 画三维车身;之后的录屏段关掉 GPU 渲染,快十几倍
  const glEnd = Math.round((s.shots.find((x) => x.id === 'B2').start + 0.75) * fps) / fps;
  for (const [from, to, gl] of [[0, glEnd, '1'], [glEnd, s.duration, '0']]) {
    const cut = Array.from({ length: workers + 1 }, (_, i) => Math.round((from + ((to - from) * i) / workers) * fps) / fps);
    await Promise.all(Array.from({ length: workers }, (_, i) => node([...base, '--gl', gl, '--from', String(cut[i]), '--to', String(cut[i + 1])])));
  }
}

function mux({ name, fps, crf, out, audio, preset, level }) {
  const s = schedule();
  const dir = path.join(WORK, 'render', name);
  run('ffmpeg', [
    '-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, '%05d.jpg'), '-i', path.join(WORK, 'audio/mix.wav'),
    // aq-mode=3:把码率多分一些给暗部,深色渐变背景不容易出色块
    '-vf', VF_709, ...X264_COLOR, '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-x264-params', 'aq-mode=3', '-profile:v', 'high', '-level', level, '-g', String(fps * 2),
    '-c:a', 'aac', '-b:a', audio, '-ar', '48000', '-movflags', '+faststart', '-t', String(s.duration), path.join(ROOT, out),
  ]);
  log('MUXED', out, fs.statSync(path.join(ROOT, out)).size, 'bytes');
}

const steps = {
  async record() {
    await Promise.all([node(['pipeline/record.mjs', 'A']), node(['pipeline/record.mjs', 'B'])]);
  },
  async tts() {
    // 口播合成(AI 神经网络语音,不是真人录音)。有你自己的录音 assets/audio/<id>.wav 时,时间表会优先用录音。
    await exec('python3', ['pipeline/tts.py', path.join(WORK, 'tts')]);
  },
  async schedule() {
    await node(['pipeline/schedule.mjs']);
  },
  async audio() {
    await node(['pipeline/audio.mjs']);
  },
  async intro() {
    // 开场四个镜头(src/intro/film.ts:三维车身、情绪动画、两派建模)打包给合成页逐帧调用
    await exec('npx', ['esbuild', 'src/intro/pipeline-entry.ts', '--bundle', '--format=iife', '--minify', '--target=chrome120', '--outfile=pipeline/timeline/intro.bundle.js', '--log-level=warning']);
  },
  async web() {
    await renderFrames(WEB());
    mux(WEB());
  },
  async webmux() {
    mux(WEB());
  },
  async master() {
    await renderFrames(MASTER);
    mux(MASTER);
  },
  async mastermux() {
    mux(MASTER);
  },
  async cover() {
    await node(['pipeline/covers.mjs']); // 四款封面 → output/covers/cover_1..4.png
  },
  async hd() {
    // 高清版:1920×1080 · 30 帧,体积适中,可以内嵌到页面里直接播放和下载 → output/promo_hd_1080p.mp4
    await renderFrames(HD);
    mux(HD);
  },
  async sheets() {
    // 自检用:成片每 0.5 秒一帧的总览;每段真实录屏 3 张抽帧
    const dir = path.join(WORK, 'sheets');
    fs.mkdirSync(dir, { recursive: true });
    const s = schedule();
    const src = fs.existsSync(path.join(WORK, 'render/master')) ? ['master', 60] : fs.existsSync(path.join(WORK, 'render/hd')) ? ['hd', 30] : ['web', 30];
    const rows = Math.ceil(Math.ceil(s.duration * 2) / 14);
    run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(src[1]), '-i', path.join(WORK, 'render', src[0], '%05d.jpg'),
      '-vf', `select='not(mod(n\\,${src[1] / 2}))',scale=176:99,tile=14x${rows}`, '-frames:v', '1', '-q:v', '6', path.join(dir, 'overview.jpg')]);
    const tmp = path.join(dir, 'rawpick');
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    const names = Object.keys(s.clips);
    let n = 0;
    for (const name of names) {
      const frames = s.clips[name].frames;
      for (const p of [0.15, 0.5, 0.85]) fs.copyFileSync(path.join(WORK, 'frames', name, pad5(Math.round((frames - 1) * p)) + '.jpg'), path.join(tmp, String(n++).padStart(2, '0') + '.jpg'));
    }
    run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(tmp, '%02d.jpg'), '-vf', `scale=368:207,tile=3x${names.length}`, '-frames:v', '1', '-q:v', '6', path.join(dir, 'raw.jpg')]);
    log('SHEETS', dir);
  },
  async embed() {
    await node(['pipeline/embed.mjs']);
  },
};

const wanted = process.argv.slice(2);
// 第五版默认只出页面内嵌的 720p 成片;要 1080p / 60 帧主版本,另外执行 node build.mjs hd master(embed 会自动带上 hd)
const list = wanted.includes('all') || !wanted.length ? ['record', 'tts', 'schedule', 'audio', 'intro', 'web', 'sheets', 'embed'] : wanted;
for (const name of list) {
  if (!steps[name]) throw new Error('未知步骤: ' + name);
  const t0 = Date.now();
  log('▶', name);
  await steps[name]();
  log('✔', name, ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
