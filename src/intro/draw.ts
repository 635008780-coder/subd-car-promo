// 2D 绘制工具:缓动、文字、背景、字幕。逻辑画布 1280 × 720,字幕条在 y = 632 以下。
export const W = 1280, H = 720, VIEW_H = 632;
export const FONT = '"Noto Sans SC","PingFang SC","Microsoft YaHei","Source Han Sans SC","Noto Sans CJK SC",sans-serif';
export const ACC = "#d18d5f", SOFT = "#e8b28a", CAGE = "#e07a3c";

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const eOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
export const eOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const eInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const eOutBack = (x: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

export function setFont(ctx: CanvasRenderingContext2D, size: number, weight = 900) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}
type Part = [string, string?];
/** 一行多色文字,按总宽度居中/左对齐 */
export function drawRuns(ctx: CanvasRenderingContext2D, parts: Part[], x: number, y: number, size: number, weight = 900, align: "left" | "center" = "center", color = "#fff", ls = 0) {
  setFont(ctx, size, weight);
  (ctx as any).letterSpacing = `${ls}px`;
  const ws = parts.map((p) => ctx.measureText(p[0]).width);
  const total = ws.reduce((a, b) => a + b, 0);
  let cx = align === "center" ? x - total / 2 : x;
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  parts.forEach((p, i) => { ctx.fillStyle = p[1] ?? color; ctx.fillText(p[0], cx, y); cx += ws[i]; });
  (ctx as any).letterSpacing = "0px";
  return total;
}
export function measureRuns(ctx: CanvasRenderingContext2D, parts: Part[], size: number, weight = 900, ls = 0) {
  setFont(ctx, size, weight);
  (ctx as any).letterSpacing = `${ls}px`;
  const w = parts.reduce((a, p) => a + ctx.measureText(p[0]).width, 0);
  (ctx as any).letterSpacing = "0px";
  return w;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** 背景:深色底 + 网格 + 两团缓慢漂移的柔光 + 暗角 */
export function drawBackground(ctx: CanvasRenderingContext2D, t: number) {
  ctx.fillStyle = "#11171a"; ctx.fillRect(0, 0, W, VIEW_H);
  const a1x = 960 + 46 * Math.sin(t * 0.33), a1y = 40 + 30 * Math.cos(t * 0.27);
  let g = ctx.createRadialGradient(a1x, a1y, 0, a1x, a1y, 560);
  g.addColorStop(0, "rgba(209,141,95,0.26)"); g.addColorStop(1, "rgba(209,141,95,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, VIEW_H);
  const a2x = 120 + 52 * Math.cos(t * 0.29), a2y = 560 + 30 * Math.sin(t * 0.31);
  g = ctx.createRadialGradient(a2x, a2y, 0, a2x, a2y, 480);
  g.addColorStop(0, "rgba(96,134,146,0.2)"); g.addColorStop(1, "rgba(96,134,146,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, VIEW_H);
  ctx.strokeStyle = "rgba(159,175,177,0.05)"; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = 0; y <= VIEW_H; y += 36) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
  for (let x = 0; x <= W; x += 36) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, VIEW_H); }
  ctx.stroke();
  g = ctx.createRadialGradient(W / 2, VIEW_H / 2, 260, W / 2, VIEW_H / 2, 820);
  g.addColorStop(0, "rgba(6,9,10,0)"); g.addColorStop(1, "rgba(6,9,10,0.5)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, VIEW_H);
}

/** 字幕条(与原片一致:高 88、深色底、单行,高亮词用暖色) */
export function drawCaption(ctx: CanvasRenderingContext2D, text: string, hl: string[], alpha: number) {
  ctx.fillStyle = "#0b1012"; ctx.fillRect(0, VIEW_H, W, H - VIEW_H);
  ctx.fillStyle = "#222c30"; ctx.fillRect(0, VIEW_H, W, 1);
  if (!text || alpha <= 0) return;
  // 按高亮词拆段
  const marks = new Array(text.length).fill(false);
  for (const w of hl) { let k = text.indexOf(w); while (k >= 0) { for (let i = k; i < k + w.length; i++) marks[i] = true; k = text.indexOf(w, k + w.length); } }
  const parts: Part[] = [];
  let cur = "", curM = marks[0];
  for (let i = 0; i < text.length; i++) {
    if (marks[i] !== curM) { parts.push([cur, curM ? SOFT : "#f3f4f0"]); cur = ""; curM = marks[i]; }
    cur += text[i];
  }
  parts.push([cur, curM ? SOFT : "#f3f4f0"]);
  ctx.save(); ctx.globalAlpha = alpha;
  drawRuns(ctx, parts, W / 2, VIEW_H + 55, 29, 700, "center", "#f3f4f0", 1.4);
  ctx.restore();
}

/** 大字卡:自下浮起、字距由松到紧、模糊衰减;离场时向上淡出 */
export function bigText(ctx: CanvasRenderingContext2D, parts: Part[], y: number, size: number, u: number, dur: number) {
  const a = eOutExpo(seg(u, 0, 0.5));
  const out = eInOut(seg(u, dur - 0.16, dur));
  const alpha = clamp(a * 1.5) * (1 - out);
  if (alpha <= 0.01) return;
  const ls = size * (0.02 + 0.1 * (1 - a));
  const dy = (1 - a) * 30 - out * 20;
  const blur = (1 - a) * 10 + out * 6;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (blur > 0.4) (ctx as any).filter = `blur(${blur.toFixed(1)}px)`;
  const sc = 1 + 0.03 * seg(u, 0, dur);
  ctx.translate(W / 2, y + dy); ctx.scale(sc, sc);
  ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 8;
  drawRuns(ctx, parts, 0, 0, size, 900, "center", "#fff", ls);
  ctx.restore();
  // 下方光线
  ctx.save();
  ctx.globalAlpha = 0.9 * seg(u, 0.1, 0.3) * (1 - out);
  const w = size * 2.6 * eOutCubic(seg(u, 0.1, 0.75));
  const gr = ctx.createLinearGradient(W / 2 - w / 2, 0, W / 2 + w / 2, 0);
  gr.addColorStop(0, "rgba(232,178,138,0)"); gr.addColorStop(0.5, "rgba(255,225,200,0.95)"); gr.addColorStop(1, "rgba(232,178,138,0)");
  ctx.fillStyle = gr; ctx.fillRect(W / 2 - w / 2, y + size * 0.22, w, 2);
  ctx.restore();
}

export function smallTag(ctx: CanvasRenderingContext2D, a: string, b: string, alpha: number) {
  ctx.save(); ctx.globalAlpha = alpha;
  (ctx as any).letterSpacing = "3px";
  setFont(ctx, 13, 700);
  ctx.fillStyle = ACC; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText(a, 100, 66);
  const w = ctx.measureText(a).width;
  ctx.fillStyle = "#869296"; ctx.fillText(b, 100 + w + 14, 66);
  (ctx as any).letterSpacing = "0px";
  ctx.restore();
}

/** 尺寸线:两端箭头,带文字标签。prog 为画出的比例 */
export function dimLine(ctx: CanvasRenderingContext2D, p0: [number, number], p1: [number, number], label: string, prog: number, alpha: number, labelSide = 1) {
  if (prog <= 0.001 || alpha <= 0.01) return;
  const x1 = lerp(p0[0], p1[0], prog), y1 = lerp(p0[1], p1[1], prog);
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  ctx.save();
  ctx.globalAlpha = alpha; ctx.strokeStyle = SOFT; ctx.fillStyle = SOFT; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(224,122,60,0.55)"; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(x1, y1); ctx.stroke();
  const arrow = (px: number, py: number, sx: number) => {
    ctx.beginPath();
    ctx.moveTo(px - sx * ux * 11 + nx * 5.5, py - sx * uy * 11 + ny * 5.5); ctx.lineTo(px, py); ctx.lineTo(px - sx * ux * 11 - nx * 5.5, py - sx * uy * 11 - ny * 5.5);
    ctx.stroke();
  };
  arrow(p0[0], p0[1], -1);
  if (prog > 0.98) arrow(p1[0], p1[1], 1);
  const la = seg(prog, 0.6, 1);
  ctx.globalAlpha = alpha * la; ctx.shadowBlur = 0;
  const mx = (p0[0] + p1[0]) / 2 + nx * 24 * labelSide, my = (p0[1] + p1[1]) / 2 + ny * 24 * labelSide;
  setFont(ctx, 21, 900);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineWidth = 5; ctx.strokeStyle = "rgba(10,14,16,0.85)"; ctx.strokeText(label, mx, my);
  ctx.fillStyle = SOFT; ctx.fillText(label, mx, my);
  ctx.restore();
}

/** 面板外框 */
export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string, pill: string, glow: number) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = "rgba(23,30,34,0.74)"; ctx.fill();
  ctx.strokeStyle = glow > 0.01 ? `rgba(209,141,95,${0.18 + 0.3 * glow})` : "#2a3438"; ctx.lineWidth = 1.5; ctx.stroke();
  drawRuns(ctx, [[title]], x + 30, y + 66, 43, 900, "left", "#fff");
  setFont(ctx, 20, 900);
  const tw = measureRuns(ctx, [[title]], 43, 900);
  const px = x + 30 + tw + 16;
  roundRect(ctx, px, y + 30, 92, 34, 17);
  ctx.fillStyle = "rgba(209,141,95,0.14)"; ctx.fill(); ctx.strokeStyle = ACC; ctx.lineWidth = 1.4; ctx.stroke();
  setFont(ctx, 20, 900); ctx.fillStyle = SOFT; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillText(pill, px + 46, y + 54);
  ctx.restore();
}
