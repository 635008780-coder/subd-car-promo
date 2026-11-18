// "SubD 建模 · 两派"——两种建模方式的三维演示(同一辆车,两条路)
//  左:方盒推拉(体块法)——密网格的方盒 → 推(压低机盖/尾部)→ 拉(拉高座舱)→ 收腰、开轮眉、收车头 → 细分光顺
//  右:拼接法(搭建法)——先做轮眉,再做腰线,再把门板、机盖、座舱的面一块块补上 → 细分光顺
// 两边都用同一个 27×18 的控制笼,所以最后拼出来的都是完整的一辆车。
import { CarRig } from "../car/carScene";
import { yTopAt } from "../car/cage";
import { ACC, SOFT, drawRuns, eInOut, eOutCubic, panel, seg, setFont, lerp, clamp } from "./draw";

const D = Math.PI / 180;

export interface SchoolCues { c0: number; c1: number; c2: number; c3: number; c4: number }
/** 原片口播节点(秒):标题、方盒、拼接法、先做轮眉、再做腰线 */
export const CUES: SchoolCues = { c0: 19.76, c1: 21.9, c2: 23.99, c3: 25.34, c4: 26.28 };

export function drawSchools(ctx: CanvasRenderingContext2D, t: number, left: CarRig, right: CarRig, cues: SchoolCues = CUES, alpha = 1, px = 1.5) {
  const { c0, c1, c2, c3, c4 } = cues;
  ctx.save();
  ctx.globalAlpha = alpha;
  // 标题
  const ta = eOutCubic(seg(t, c0 - 0.1, c0 + 0.3));
  ctx.globalAlpha = alpha * ta;
  drawRuns(ctx, [["SubD 建模 · 两派"]], 640, 78 + (1 - ta) * 12, 40, 900, "center", "#fff", 1);
  // 两个面板先后滑入,讲到哪一派哪一边亮起来
  const inL = eOutCubic(seg(t, c0 + 0.3, c0 + 0.8)), inR = eOutCubic(seg(t, c0 + 0.6, c0 + 1.1));
  const glowL = seg(t, c1 - 0.2, c1 + 0.1) * (1 - 0.55 * seg(t, c2 + 0.2, c2 + 0.8));
  const glowR = seg(t, c2 - 0.2, c2 + 0.1);
  const PY = 104, PH = 500;
  // ---------- 左:方盒推拉 ----------
  ctx.save();
  ctx.globalAlpha = alpha * inL * lerp(0.4, 1, Math.max(glowL, seg(t, c2, c2 + 0.5)));
  ctx.translate((1 - inL) * -50, 0);
  panel(ctx, 60, PY, 560, PH, "方盒推拉", "体块法", glowL);
  const box = seg(t, c1 - 0.9, c1 + 0.1); // 方盒出现(沿车长扫过)
  const push = eInOut(seg(t, c1 + 0.45, c1 + 1.3));
  const pull = eInOut(seg(t, c1 + 1.35, c1 + 2.2));
  const shape = eInOut(seg(t, c1 + 2.4, c1 + 3.7));
  const smooth = eInOut(seg(t, c1 + 3.7, c1 + 4.9));
  left.setCage({ ends: push, roof: pull, shape });
  left.setLook({
    paint: "white", smooth: smooth, body: lerp(0.14, 1, eInOut(seg(t, c1 + 3.8, c1 + 5.0))) * eOutCubic(box),
    cage: 1 - 0.55 * eInOut(seg(t, c1 + 4.6, c1 + 5.6)), fill: 0.6 * (1 - eInOut(seg(t, c1 + 3.6, c1 + 4.6))) * eOutCubic(box), wire1: 0,
    wheels: shape > 0.2 ? 1 : 0, cageXray: true, shadow: eOutCubic(box),
  });
  left.clip.constant = lerp(-2.6, 2.7, eInOut(box));
  const az = (34 - 10 * seg(t, c1, c1 + 6)) * D;
  const projL = left.render(ctx, 66, 190, 548, 410, { az, el: 15 * D, dist: 9.0, ty: 0.58 }, px);
  // 推 / 拉 箭头
  const arrow = (x: number, y: number, up: boolean, a: number, label: string) => {
    if (a <= 0.01) return;
    const [sx, sy] = projL(x, y, 0.0);
    ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3.2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const tail = up ? sy - 14 : sy - 60, tip = up ? sy - 58 : sy - 16, k = up ? 12 : -12;
    ctx.beginPath(); ctx.moveTo(sx, tail); ctx.lineTo(sx, tip); ctx.moveTo(sx - 9, tip + k); ctx.lineTo(sx, tip); ctx.lineTo(sx + 9, tip + k); ctx.stroke();
    if (label) { setFont(ctx, 30, 900); ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.strokeStyle = "rgba(10,14,16,0.8)"; ctx.lineWidth = 5; ctx.strokeText(label, sx, sy - 72); ctx.fillText(label, sx, sy - 72); }
    ctx.restore();
  };
  const win = (a: number, b: number) => Math.sin(Math.PI * seg(t, a, b));
  // 推:机盖、尾部向下;拉:座舱向上(箭头跟着当前高度走)
  const hoodY = lerp(1.2, yTopAt(1.7), push) + 0.02;
  arrow(1.7, hoodY + 0.35, false, win(c1 + 0.3, c1 + 1.5), "推");
  arrow(-2.0, lerp(1.2, yTopAt(-2.0), push) + 0.35, false, win(c1 + 0.45, c1 + 1.5), "");
  arrow(-0.2, lerp(1.2, 1.42, pull) + 0.1, true, win(c1 + 1.2, c1 + 2.5), "拉");
  arrow(0.5, lerp(1.2, 1.37, pull) + 0.1, true, win(c1 + 1.25, c1 + 2.5), "");
  ctx.restore();
  // ---------- 右:拼接法 ----------
  ctx.save();
  ctx.globalAlpha = alpha * inR * lerp(0.4, 1, glowR);
  ctx.translate((1 - inR) * 50, 0);
  panel(ctx, 660, PY, 560, PH, "拼接法", "搭建法", glowR);
  const p0 = eInOut(seg(t, c3, c3 + 0.85)), p1 = seg(t, c4, c4 + 0.75), p2 = seg(t, c4 + 0.7, c4 + 1.3);
  const bodyIn = eInOut(seg(t, c4 + 1.2, c4 + 2.2));
  right.setGroupProgress(p0, p1, p2);
  right.setLook({
    paint: "white", smooth: bodyIn, body: bodyIn, cage: 1 - 0.5 * bodyIn, fill: 1 - 0.65 * bodyIn, wire1: 0,
    wheels: t > c3 - 0.5 ? 1 : 0, cageXray: true, shadow: seg(t, c3 - 0.5, c3),
  });
  const az2 = (34 - 10 * seg(t, c2, c2 + 6)) * D;
  const projR = right.render(ctx, 666, 190, 548, 410, { az: az2, el: 15 * D, dist: 9.0, ty: 0.58 }, px);
  // 标注:先做轮眉(下方)、再做腰线(上方,虚线引到腰线)
  const label = (s: string, x: number, y: number, a: number) => {
    if (a <= 0.01) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.textAlign = "center"; setFont(ctx, 27, 900);
    ctx.lineWidth = 5; ctx.strokeStyle = "rgba(10,14,16,0.85)"; ctx.strokeText(s, x, y); ctx.fillStyle = SOFT; ctx.fillText(s, x, y);
    ctx.restore();
  };
  const [wx, wy] = projR(1.4, 0.0, 0.9);
  label("先做轮眉", wx, Math.min(wy + 58, 592), seg(t, c3, c3 + 0.25) * (1 - seg(t, c4 + 0.6, c4 + 1.0) * 0.55));
  const [bx, by] = projR(0.0, 1.0, 0.95);
  const la = seg(t, c4, c4 + 0.25);
  if (la > 0.01) {
    ctx.save(); ctx.globalAlpha *= 0.85 * la; ctx.strokeStyle = SOFT; ctx.lineWidth = 1.6; ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(bx, by - 8); ctx.lineTo(bx, 262); ctx.stroke(); ctx.restore();
    label("再做腰线", bx, 252, la);
  }
  ctx.restore();
  // 面板底部的进度小点
  ctx.restore();
  void ACC; void clamp;
}
