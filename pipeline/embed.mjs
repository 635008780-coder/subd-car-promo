// 把成片、封面、抽帧转成 base64 文本分片,写进 src/generated/。
// 原因:这个平台只保留项目里的文本文件,二进制(mp4 / png / jpg)不会被带到下一次构建;
// 页面如果直接 import 二进制文件,文件一丢构建就失败。所以页面只依赖文本,运行时再还原成 Blob 播放和下载。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, WORK, run, log } from './lib/studio.mjs';

const GEN = path.join(ROOT, 'src/generated');
fs.rmSync(GEN, { recursive: true, force: true });
fs.mkdirSync(GEN, { recursive: true });
const CHUNK = 96000; // 每个文本分片不超过 96 KB(平台上已验证能保留的文本文件约 100 KB),且是 4 的倍数,分片可独立解码

const probe = (file) => {
  const j = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,profile,level,pix_fmt,width,height,r_frame_rate,nb_frames,sample_rate,channels,color_space,bit_rate:format=duration,size,bit_rate', '-of', 'json', file]));
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  const [n, d] = v.r_frame_rate.split('/').map(Number);
  return {
    bytes: Number(j.format.size), duration: Number(Number(j.format.duration).toFixed(3)), kbps: Math.round(Number(j.format.bit_rate) / 1000),
    video: { codec: v.codec_name, profile: v.profile, level: v.level, pix_fmt: v.pix_fmt, width: v.width, height: v.height, fps: n / d, frames: Number(v.nb_frames), color: v.color_space },
    audio: a && { codec: a.codec_name, profile: a.profile, sample_rate: Number(a.sample_rate), channels: a.channels },
  };
};
const loud = (file) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const tail = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  return { lufs: Number((tail.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]), truePeak: Number((tail.match(/Peak:\s+(-?[\d.]+) dBFS/) || [])[1]) };
};
const jpg = (src, dst, width, q) => run('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', `scale=${width}:-2:flags=lanczos`, '-q:v', String(q), dst]);
const b64of = (file) => fs.readFileSync(file).toString('base64');
// 每个资源写成 <name>_000.ts、<name>_001.ts …;页面用通配方式加载并按序拼接,缺了哪个都不会导致构建失败
const writeChunks = (name, text) => {
  const n = Math.ceil(text.length / CHUNK);
  for (let i = 0; i < n; i++) {
    fs.writeFileSync(path.join(GEN, `${name}_${String(i).padStart(3, '0')}.ts`), `// 自动生成(pipeline/embed.mjs),不要手改\nexport default ${JSON.stringify(text.slice(i * CHUNK, (i + 1) * CHUNK))};\n`);
  }
  return n;
};

/* ---------- 视频 → 文本分片 ---------- */
const web = path.join(ROOT, 'output/promo_web_720p.mp4');
const b64 = b64of(web);
const count = writeChunks('video', b64);
writeChunks('srt', fs.readFileSync(path.join(ROOT, 'output/captions.srt'), 'utf8'));

/* ---------- 图片 ---------- */
const tmp = path.join(WORK, 'embed');
fs.mkdirSync(tmp, { recursive: true });
const sched = JSON.parse(fs.readFileSync(path.join(WORK, 'schedule.json'), 'utf8'));
const posterAt = sched.shots.find((s) => s.id === 'B10').start + 2.2;
run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(posterAt), '-i', web, '-frames:v', '1', '-q:v', '5', path.join(tmp, 'poster.jpg')]);
writeChunks('poster', b64of(path.join(tmp, 'poster.jpg')));
const images = {};
// 四款封面:每款一组文本分片 cover1 … cover4(页面上可分别下载)
images.covers = 0;
for (const i of [1, 2, 3, 4]) {
  const cover = path.join(ROOT, `output/covers/cover_${i}.png`);
  if (!fs.existsSync(cover)) continue;
  jpg(cover, path.join(tmp, `cover${i}.jpg`), 1920, 4);
  writeChunks('cover' + i, b64of(path.join(tmp, `cover${i}.jpg`)));
  images.covers++;
}
// 高清版(1920×1080 · 30 帧)也切成文本分片 hd_000 …,页面按需还原
const hd = path.join(ROOT, 'output/promo_hd_1080p.mp4');
const hdChunks = fs.existsSync(hd) ? writeChunks('hd', b64of(hd)) : 0;
for (const name of ['overview', 'raw']) {
  const src = path.join(WORK, 'sheets', name + '.jpg');
  if (fs.existsSync(src)) writeChunks(name, b64of(src));
  images[name] = fs.existsSync(src);
}

/* ---------- 事实数据:全部来自实测 ---------- */
const master = path.join(ROOT, 'output/promo_16x9.mp4');
const audioReport = JSON.parse(fs.readFileSync(path.join(WORK, 'audio/report.json'), 'utf8'));
const rec = ['A', 'B'].map((w) => JSON.parse(fs.readFileSync(path.join(ROOT, 'raw', `record_${w}.json`), 'utf8')));
const facts = {
  generatedAt: new Date().toISOString(),
  web: { ...probe(web), loudness: loud(web), chunks: count, base64Chars: b64.length },
  master: fs.existsSync(master) ? { ...probe(master), loudness: loud(master) } : null,
  hd: hdChunks ? { ...probe(hd), loudness: loud(hd), chunks: hdChunks } : null,
  audio: audioReport,
  images,
  record: { dsf: Number(process.env.PROMO_DSF || 1), viewport: '1440×810', minutes: rec.map((r) => r.minutes), clips: rec.flatMap((r) => r.clips) },
};
fs.writeFileSync(path.join(GEN, 'facts.json'), JSON.stringify(facts));
log('EMBED', JSON.stringify({ chunks: count, videoBytes: facts.web.bytes, master: !!facts.master, web: facts.web.loudness, images }));
