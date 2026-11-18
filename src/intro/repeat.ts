// A3 · 重复的前期活儿:"很大一部分时间,都浪费在前期那些重复的活儿上:定车的尺寸,抓整车的趋势"。
// 不再放三维车模型。四个小节拍,一句口播一个画面:时间条 → 一版一版翻牌 → 蓝图上拉尺寸线 → 反复描趋势线。
import { CAR, WHEEL_X, yBeltAt, yTopAt } from "../car/cage";
import { ACC, SOFT, clamp, dimLine, drawRuns, eInOut, eOutBack, eOutCubic, eOutExpo, lerp, roundRect, seg, setFont, smallTag } from "./draw";

type Ctx = CanvasRenderingContext2D;
const RED = "#e8553a";

function loopIcon(ctx: Ctx, x: number, y: number, r: number, rot: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.strokeStyle = SOFT; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const a1 = Math.PI * 1.62;
  ctx.beginPath(); ctx.arc(0, 0, r, 0.2, a1); ctx.stroke();
  const ex = Math.cos(a1) * r, ey = Math.sin(a1) * r, tx = -Math.sin(a1), ty = Math.cos(a1), nx = Math.cos(a1), ny = Math.sin(a1);
  ctx.beginPath(); ctx.moveTo(ex - tx * 14 + nx * 10, ey - ty * 14 + ny * 10); ctx.lineTo(ex + tx * 4, ey + ty * 4); ctx.lineTo(ex - tx * 14 - nx * 10, ey - ty * 14 - ny * 10); ctx.stroke();
  ctx.restore();
}

function check(ctx: Ctx, x: number, y: number, u: number) {
  if (u <= 0) return;
  ctx.save(); ctx.strokeStyle = SOFT; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(x, y);
  const a = Math.min(1, u * 2), b = clamp(u * 2 - 1);
  ctx.lineTo(x + 7 * a, y + 7 * a);
  if (b > 0) ctx.lineTo(x + 7 + 13 * b, y + 7 - 16 * b);
  ctx.stroke(); ctx.restore();
}

function card(ctx: Ctx, x: number, y: number, k: number, age: number, dim: number) {
  if (age < 0) return;
  const flip = eOutBack(seg(age, 0, 0.3));
  ctx.save();
  ctx.translate(x + 105, y + 125); ctx.scale(Math.max(0.02, flip), 0.9 + 0.1 * Math.min(1, flip)); ctx.translate(-105, -125);
  ctx.globalAlpha *= clamp(age * 8) * lerp(1, 0.42, dim);
  roundRect(ctx, 0, 0, 210, 250, 16); ctx.fillStyle = "rgba(23,30,34,0.92)"; ctx.fill();
  ctx.strokeStyle = dim > 0.5 ? "#2f3b40" : ACC; ctx.lineWidth = 2; ctx.stroke();
  drawRuns(ctx, [[`第 ${k + 1} 版`]], 24, 50, 30, 900, "left", "#fff");
  ctx.fillStyle = "#2a3438"; ctx.fillRect(24, 68, 162, 2);
  // 两件每版都要重做的事
  ["定尺寸", "抓趋势"].forEach((s, i) => {
    const yy = 118 + i * 62;
    roundRect(ctx, 24, yy - 26, 162, 46, 10); ctx.fillStyle = "rgba(209,141,95,0.12)"; ctx.fill();
    drawRuns(ctx, [[s]], 40, yy + 6, 25, 700, "left", "#e9ece8");
    check(ctx, 150, yy - 8, seg(age, 0.14 + i * 0.12, 0.3 + i * 0.12));
  });
  setFont(ctx, 14, 700); ctx.textAlign = "left"; ctx.fillStyle = "#869296"; ctx.fillText("从零开始", 24, 228);
  ctx.restore();
  if (k > 0) {
    const a = eOutExpo(seg(age, 0.05, 0.3));
    if (a > 0) {
      ctx.save(); ctx.globalAlpha *= clamp(a * 2) * lerp(1, 0.5, dim); ctx.translate(x + 150, y + 6); ctx.rotate(0.12); ctx.scale(lerp(1.6, 1, a), lerp(1.6, 1, a));
      roundRect(ctx, -58, -20, 116, 40, 8); ctx.fillStyle = "rgba(9,13,15,0.95)"; ctx.fill(); ctx.strokeStyle = RED; ctx.lineWidth = 3; ctx.stroke();
      drawRuns(ctx, [["又来一遍"]], 0, 8, 22, 900, "center", "#f0633f");
      ctx.restore();
    }
  }
}

export function drawRepeat(ctx: Ctx, lt: number, dur: number, cue: number[]) {
  const [c0, c1, c2, c3] = cue;
  smallTag(ctx, "前期方案  ·  每一版都要重来", "示意", 1);

  /* ---------- ① 很大一部分时间:一条时间条,大半截是"重复的前期活儿" ---------- */
  const o1 = eInOut(seg(lt, c1 - 0.16, c1 + 0.06));
  if (o1 < 0.99) {
    const i1 = eOutCubic(seg(lt, c0 - 0.1, c0 + 0.3));
    ctx.save(); ctx.globalAlpha = i1 * (1 - o1); ctx.translate(-60 * o1, (1 - i1) * 16);
    drawRuns(ctx, [["很大一部分"], ["时间", SOFT]], 640, 196, 82, 900, "center");
    setFont(ctx, 20, 700); ctx.textAlign = "left"; ctx.fillStyle = "#869296"; ctx.fillText("做一版方案的时间", 190, 268);
    roundRect(ctx, 190, 282, 900, 76, 14); ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fill(); ctx.strokeStyle = "#2a3438"; ctx.lineWidth = 1.5; ctx.stroke();
    const w = 900 * 0.62 * eOutCubic(seg(lt, c0 + 0.2, c0 + 1.05));
    if (w > 4) {
      ctx.save(); roundRect(ctx, 190, 282, w, 76, 14); ctx.clip();
      ctx.fillStyle = SOFT; ctx.fillRect(190, 282, w, 76);
      ctx.strokeStyle = "rgba(160,84,40,0.5)"; ctx.lineWidth = 9;
      const off = (lt * 40) % 34;
      ctx.beginPath(); for (let x = 100 + off; x < 190 + w + 90; x += 34) { ctx.moveTo(x, 366); ctx.lineTo(x + 76, 274); } ctx.stroke();
      ctx.restore();
      ctx.save(); ctx.globalAlpha *= seg(w, 320, 480);
      drawRuns(ctx, [["重复的前期活儿"]], 190 + w / 2, 332, 34, 900, "center", "#11171a"); ctx.restore();
    }
    ctx.save(); ctx.globalAlpha *= seg(lt, c0 + 0.8, c0 + 1.1);
    drawRuns(ctx, [["真正做造型"]], 190 + 900 * 0.81, 330, 26, 700, "center", "#9fb0b3"); ctx.restore();
    ctx.restore();
  }

  /* ---------- ② 重复的活儿:一版一版翻牌,每一版都是同样两件事 ---------- */
  const o2 = eInOut(seg(lt, c2 - 0.16, c2 + 0.06));
  if (lt > c1 - 0.1 && o2 < 0.99) {
    const i2 = eOutCubic(seg(lt, c1 - 0.05, c1 + 0.25));
    ctx.save(); ctx.globalAlpha = i2 * (1 - o2); ctx.translate((1 - i2) * 60 - 80 * o2, 0);
    loopIcon(ctx, 452, 138, 25, (lt - c1) * 6.2);
    drawRuns(ctx, [["重复", SOFT], ["的活儿"]], 500, 162, 66, 900, "left");
    const gap = Math.min(0.45, (c2 - c1 - 0.5) / 3);
    for (let k = 0; k < 4; k++) {
      const at = c1 + 0.12 + k * gap, newer = lt - (at + gap);
      card(ctx, 118 + k * 278, 214, k, lt - at, k < 3 ? clamp(newer * 6) : 0);
      if (k < 3 && lt > at + gap - 0.1) {
        ctx.save(); ctx.globalAlpha *= seg(lt, at + gap - 0.1, at + gap + 0.05); ctx.strokeStyle = "#869296"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
        const ax = 118 + k * 278 + 226; ctx.beginPath(); ctx.moveTo(ax, 339); ctx.lineTo(ax + 34, 339); ctx.moveTo(ax + 24, 330); ctx.lineTo(ax + 34, 339); ctx.lineTo(ax + 24, 348); ctx.stroke(); ctx.restore();
      }
    }
    ctx.restore();
  }

  /* ---------- ③ 定尺寸 → ④ 抓趋势:一张侧视蓝图(线稿,不是三维模型) ---------- */
  if (lt > c2 - 0.1) {
    const i3 = eOutCubic(seg(lt, c2 - 0.05, c2 + 0.25));
    const S = 150, ox = 640, gy = 492; // 每米 150 像素
    const X = (x: number) => ox - x * S, Y = (y: number) => gy - y * S; // 车头朝左
    const L = CAR.length, Hh = CAR.height, wr = CAR.axleY * S;
    const trend = lt >= c3;
    ctx.save(); ctx.globalAlpha = i3; ctx.translate((1 - i3) * 70, 0);
    // 标题:01 定尺寸 / 02 抓趋势,右上角的版本号一直在跳
    const tA = 1 - seg(lt, c3 - 0.1, c3 + 0.04), tB = eOutExpo(seg(lt, c3, c3 + 0.28));
    ctx.save(); ctx.globalAlpha *= tA; drawRuns(ctx, [["01 ", "#869296"], ["定"], ["尺寸", SOFT]], 150, 150, 64, 900, "left"); ctx.restore();
    if (trend) { ctx.save(); ctx.globalAlpha *= clamp(tB * 1.6); ctx.translate(0, (1 - tB) * 18); drawRuns(ctx, [["02 ", "#869296"], ["抓"], ["趋势", SOFT]], 150, 150, 64, 900, "left"); ctx.restore(); }
    const vn = 1 + Math.floor(Math.max(0, lt - c2) / 0.42) % 9;
    const vp = (Math.max(0, lt - c2) / 0.42) % 1;
    ctx.save(); ctx.translate(1068, 128); const vs = 1 + 0.18 * (1 - eOutCubic(seg(vp, 0, 0.4))); ctx.scale(vs, vs);
    roundRect(ctx, -62, -24, 124, 48, 24); ctx.fillStyle = "rgba(209,141,95,0.16)"; ctx.fill(); ctx.strokeStyle = ACC; ctx.lineWidth = 2; ctx.stroke();
    drawRuns(ctx, [[`第 ${vn} 版`]], 0, 9, 24, 900, "center", SOFT); ctx.restore();
    // 地面、包围盒、车轮
    ctx.strokeStyle = "rgba(159,175,177,0.5)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(X(L / 2) - 70, gy); ctx.lineTo(X(-L / 2) + 70, gy); ctx.stroke();
    ctx.setLineDash([7, 7]); ctx.strokeStyle = "rgba(159,175,177,0.42)";
    ctx.strokeRect(X(L / 2), Y(Hh), L * S, Hh * S);
    ctx.setLineDash([]);
    ctx.strokeStyle = "#9fb0b3"; ctx.lineWidth = 2;
    for (const wx of [WHEEL_X, -WHEEL_X]) {
      ctx.beginPath(); ctx.arc(X(wx), gy - wr, wr, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(X(wx), gy - wr, wr * 0.55, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(wx) - 7, gy - wr); ctx.lineTo(X(wx) + 7, gy - wr); ctx.moveTo(X(wx), gy - wr - 7); ctx.lineTo(X(wx), gy - wr + 7); ctx.stroke();
    }
    // ③ 尺寸线:一根接一根"啪"地拉出来
    const dimA = lerp(1, 0.4, seg(lt, c3, c3 + 0.3));
    const dp = (k: number) => eOutCubic(seg(lt, c2 + 0.08 + k * 0.26, c2 + 0.36 + k * 0.26));
    dimLine(ctx, [X(WHEEL_X), gy + 30], [X(-WHEEL_X), gy + 30], "轴距", dp(0), dimA, -1);
    dimLine(ctx, [X(L / 2), gy + 78], [X(-L / 2), gy + 78], "车长", dp(1), dimA, -1);
    dimLine(ctx, [X(-L / 2) + 46, gy], [X(-L / 2) + 46, Y(Hh)], "车高", dp(2), dimA, -1);
    // ④ 趋势线:顶线、腰线各描一遍,旁边留着前几版的影子,控制点还在来回试
    if (trend) {
      const N = 60;
      const line = (fn: (x: number) => number, prog: number, k: number, col: string, lw: number, a: number) => {
        if (prog <= 0) return;
        ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath();
        for (let i = 0; i <= Math.round(N * prog); i++) {
          const x = lerp(L / 2 - 0.12, -L / 2 + 0.12, i / N);
          const y = fn(x) * (1 + k * Math.sin((i / N) * Math.PI));
          if (i === 0) ctx.moveTo(X(x), Y(y)); else ctx.lineTo(X(x), Y(y));
        }
        ctx.stroke(); ctx.restore();
      };
      const p1 = eInOut(seg(lt, c3 + 0.02, c3 + 0.6)), p2 = eInOut(seg(lt, c3 + 0.28, c3 + 0.85));
      const wig = 0.035 * Math.sin((lt - c3) * 7.5);
      line(yTopAt, p1, 0.075, SOFT, 2, 0.28); line(yTopAt, p1, -0.06, SOFT, 2, 0.22);
      line(yBeltAt, p2, 0.08, SOFT, 2, 0.22);
      ctx.save(); ctx.shadowColor = "rgba(224,122,60,0.7)"; ctx.shadowBlur = 12;
      line(yTopAt, p1, wig, "#fff", 3.5, 1); line(yBeltAt, p2, -wig * 0.8, SOFT, 3, 1);
      ctx.restore();
      [1.35, 0.25, -1.0].forEach((x, k) => {
        const a = seg(lt, c3 + 0.25 + k * 0.1, c3 + 0.45 + k * 0.1);
        if (a <= 0) return;
        const px = X(x), py = Y(yTopAt(x) * (1 + wig * Math.sin(((L / 2 - 0.12 - x) / (L - 0.24)) * Math.PI)));
        const dx = 54, dy = (k - 1) * 9 + 60 * wig;
        ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = ACC; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(px - dx, py - dy); ctx.lineTo(px + dx, py + dy); ctx.stroke();
        ctx.fillStyle = "#11171a"; ctx.lineWidth = 2.2; ctx.strokeStyle = SOFT;
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(px + s * dx, py + s * dy, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        ctx.fillStyle = SOFT; ctx.fillRect(px - 5, py - 5, 10, 10);
        ctx.restore();
      });
    }
    ctx.restore();
  }
  void dur;
}
