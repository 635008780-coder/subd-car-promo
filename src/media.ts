// 成片以 base64 文本分片的形式放在 src/generated/(pipeline/embed.mjs 生成),这里在运行时还原成 Blob。
// 用通配加载:分片缺失时页面照常构建,只是提示"还没生成"。
import schedule from "./data/schedule.json";

type Mod = { default: string };
const pick = (mods: Record<string, Mod>, name: string) =>
  Object.keys(mods).filter((k) => new RegExp(`/${name}_\\d+\\.ts$`).test(k)).sort().map((k) => mods[k].default);

const all = import.meta.glob<Mod>("./generated/*_*.ts", { eager: true });
const factsMod = import.meta.glob<{ default: Facts }>("./generated/facts.json", { eager: true });

export interface Facts {
  generatedAt: string;
  web: {
    bytes: number; duration: number; kbps: number;
    video: { codec: string; profile: string; width: number; height: number; fps: number; frames: number };
    audio: { codec: string; sample_rate: number; channels: number };
    loudness: { lufs: number; truePeak: number };
  };
  audio: { bpm: number; voice: { name: string; rate: string; seconds: number; tts: string[] }; ducking: string };
  record: { minutes: number[]; clips: { name: string; frames: number; seconds: number }[] };
}
export const facts: Facts | null = Object.values(factsMod)[0]?.default ?? null;

const toBytes = (b64: string) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export const hasVideo = pick(all, "video").length > 0;
/** 每个分片的长度是 4 的倍数,可以各自解码后直接拼接 */
export async function videoUrl(): Promise<string> {
  const parts = pick(all, "video");
  const bufs: Uint8Array[] = [];
  for (const p of parts) {
    bufs.push(toBytes(p));
    await new Promise((r) => setTimeout(r)); // 让出主线程,避免解码时页面卡住
  }
  return URL.createObjectURL(new Blob(bufs as BlobPart[], { type: "video/mp4" }));
}
export const posterUrl = () => {
  const p = pick(all, "poster").join("");
  return p ? `data:image/jpeg;base64,${p}` : "";
};
export const srtText = () => pick(all, "srt").join("");

/* ---------- 时间表 ---------- */
export interface Shot { id: string; kind: string; start: number; end: number; vo: string | null }
export interface Vo { id: string; start: number; dur: number; text: string }
export const NEW = schedule as unknown as { duration: number; shots: Shot[]; vo: Vo[]; voice: { name: string; rate: string; seconds: number } };

/** 原版(仓库 02)的时间表,取自它的 src/data/schedule.json,只用来做对比 */
export const OLD = {
  duration: 74,
  shots: [["A1", 0, 4.5], ["A2", 4.5, 13], ["A3", 13, 19.5], ["A4", 19.5, 28], ["B2", 28, 31], ["B6", 31, 35.5], ["B4", 35.5, 48.5], ["B7", 48.5, 57.5], ["B8", 57.5, 64], ["B9", 64, 69.5], ["B10", 69.5, 74]].map(
    ([id, start, end]) => ({ id: id as string, start: start as number, end: end as number }),
  ),
  vo: [["s1", 0.35, 3.402], ["s2", 4.85, 7.512], ["s3", 13.3, 5.722], ["s4", 19.8, 7.259], ["s5a", 28.3, 1.803], ["s5b", 31.25, 1.472], ["s5c", 35.8, 5.267], ["s5d", 48.9, 4.179], ["s6", 64.35, 3.407], ["s7", 69.85, 3.118]].map(
    ([id, start, dur]) => ({ id: id as string, start: start as number, dur: dur as number }),
  ),
};

export const NAMES: Record<string, string> = {
  A1: "开场", A2: "周期痛点", A3: "重复的活儿", A4: "两派建模",
  B2: "网站登场", B6: "标准车型", B4: "尺寸与轮眉", B7: "断面与型面", B8: "颜色与显示", B9: "导出", B10: "结尾",
};
export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
