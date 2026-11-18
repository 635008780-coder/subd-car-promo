// A2 · SubD 建模周期:"最快一天一版,但这种强度撑不了几次,正常三到五天"。
// 这一段不再用汽车模型,改成一个情绪化的小动画:工位上的人、狂转的钟、越压越近的四壁、掉下来的"再来一版",
// 电量见底后一头栽在键盘上;最后压力松开,回到"正常 3–5 天/版"。所有节点都跟着口播的 cue 走。
import { ACC, CAGE, SOFT, VIEW_H, W, clamp, drawRuns, eInOut, eOutBack, eOutCubic, eOutExpo, lerp, measureRuns, roundRect, seg, setFont, smallTag } from "./draw";

type Ctx = CanvasRenderingContext2D;
const RED = "#e8553a";
const TAU = Math.PI * 2;
const wob = (t: number, k: number) => Math.sin(t * k * 1.7 + k) * 0.6 + Math.sin(t * k * 3.1 + 2 * k) * 0.4;

function slamText(ctx: Ctx, age: number, x: number, y: number, draw: () => void, from = 1.5) {
  if (age < 0) return;
  const a = eOutExpo(seg(age, 0, 0.28));
  ctx.save();
  ctx.globalAlpha *= clamp(a * 1.8);
  ctx.translate(x, y);
  const sc = lerp(from, 1, a);
  ctx.scale(sc, sc);
  draw();
  ctx.restore();
}

function clock(ctx: Ctx, x: number, y: number, r: number, days: number, hot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = "rgba(12,17,19,0.9)"; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = hot > 0.02 ? `rgb(${Math.round(lerp(207, 232, hot))},${Math.round(lerp(214, 85, hot))},${Math.round(lerp(210, 58, hot))})` : "#cfd6d2"; ctx.stroke();
  ctx.strokeStyle = "#869296"; ctx.lineWidth = 2;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU, r0 = k % 3 === 0 ? r - 11 : r - 7;
    ctx.beginPath(); ctx.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0); ctx.lineTo(Math.sin(a) * (r - 3), -Math.cos(a) * (r - 3)); ctx.stroke();
  }
  // 时针一天两圈;分针转得太快时画成一片扫过的扇形
  const ha = (9 / 12) * TAU + days * 2 * TAU, ma = days * 9 * TAU;
  if (hot > 0.05) {
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r - 9, ma - Math.PI / 2 - 1.1 * hot, ma - Math.PI / 2); ctx.closePath();
    ctx.fillStyle = `rgba(232,85,58,${0.3 * hot})`; ctx.fill();
  }
  ctx.lineCap = "round";
  ctx.strokeStyle = "#f3f4f0"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(ha) * r * 0.5, -Math.cos(ha) * r * 0.5); ctx.stroke();
  ctx.strokeStyle = hot > 0.05 ? RED : SOFT; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(ma) * (r - 10), -Math.cos(ma) * (r - 10)); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fillStyle = "#f3f4f0"; ctx.fill();
  ctx.restore();
}

/** 太阳 / 月亮:白天黑夜跟着钟一起翻 */
function sunMoon(ctx: Ctx, x: number, y: number, days: number, a: number) {
  const day = Math.cos(days * TAU) > 0;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y);
  if (day) {
    ctx.fillStyle = "#f0c26a"; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#f0c26a"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    for (let k = 0; k < 8; k++) { const q = (k / 8) * TAU + days * 3; ctx.beginPath(); ctx.moveTo(Math.cos(q) * 16, Math.sin(q) * 16); ctx.lineTo(Math.cos(q) * 21, Math.sin(q) * 21); ctx.stroke(); }
  } else {
    ctx.fillStyle = "#b9c9e6"; ctx.beginPath(); ctx.arc(0, 0, 13, 0.25 * TAU - 2.2, 0.25 * TAU + 2.2); ctx.arc(7, -3, 11, 0.25 * TAU + 1.6, 0.25 * TAU - 1.9, true); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function battery(ctx: Ctx, x: number, y: number, level: number, t: number) {
  const w = 60, h = 27;
  const col = level > 0.5 ? "#7bd389" : level > 0.22 ? "#e8b24a" : RED;
  const blink = level < 0.08 ? 0.45 + 0.55 * (Math.sin(t * 14) > 0 ? 1 : 0) : 1;
  ctx.save(); ctx.translate(x - w / 2, y - h / 2);
  ctx.globalAlpha *= blink;
  roundRect(ctx, 0, 0, w, h, 6); ctx.fillStyle = "rgba(10,14,16,0.85)"; ctx.fill();
  ctx.strokeStyle = level < 0.22 ? RED : "#cfd6d2"; ctx.lineWidth = 2.5; ctx.stroke();
  roundRect(ctx, w + 2, h / 2 - 5, 5, 10, 2); ctx.fillStyle = level < 0.22 ? RED : "#cfd6d2"; ctx.fill();
  const fw = Math.max(0, (w - 8) * level);
  if (fw > 1) { roundRect(ctx, 4, 4, fw, h - 8, 3); ctx.fillStyle = col; ctx.fill(); }
  ctx.restore();
}

/** 工位上的人。f = 疲劳 0(坐直敲键盘)→ 1(趴在键盘上) */
function worker(ctx: Ctx, t: number, f: number, typing: number, p: number) {
  const H = { x: 210, y: 520 };
  const th = lerp(0.06, 1.15, f) + 0.014 * Math.sin(t * 23) * typing * (1 - f);
  const S = { x: H.x + 120 * Math.sin(th), y: H.y - 120 * Math.cos(th) };
  const ha = th + lerp(0.05, 0.5, f);
  const C = { x: S.x + 44 * Math.sin(ha), y: S.y - 44 * Math.cos(ha) };
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  // 椅子
  ctx.strokeStyle = "#4b5b61"; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(172, 540); ctx.lineTo(158, 425); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(168, 542); ctx.lineTo(262, 542); ctx.stroke();
  ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(215, 546); ctx.lineTo(215, 596); ctx.moveTo(182, 598); ctx.lineTo(248, 598); ctx.stroke();
  // 腿
  ctx.strokeStyle = "#27353a"; ctx.lineWidth = 32;
  ctx.beginPath(); ctx.moveTo(H.x + 6, H.y + 4); ctx.lineTo(304, 528); ctx.stroke();
  ctx.lineWidth = 25; ctx.beginPath(); ctx.moveTo(304, 530); ctx.lineTo(310, 590); ctx.stroke();
  ctx.lineWidth = 15; ctx.beginPath(); ctx.moveTo(306, 594); ctx.lineTo(334, 594); ctx.stroke();
  // 躯干
  ctx.strokeStyle = "#3a4d55"; ctx.lineWidth = 52;
  ctx.beginPath(); ctx.moveTo(H.x, H.y - 8); ctx.lineTo(S.x, S.y + 8); ctx.stroke();
  // 头
  ctx.save();
  ctx.translate(C.x, C.y); ctx.rotate(ha);
  ctx.fillStyle = "#ecd9c6"; ctx.beginPath(); ctx.arc(0, 0, 33, 0, TAU); ctx.fill();
  ctx.fillStyle = "#1b2428"; ctx.beginPath(); ctx.arc(0, 0, 34.5, Math.PI * 0.82, Math.PI * 1.86); ctx.closePath(); ctx.fill();
  // 黑眼圈、眼睛、嘴
  if (f > 0.2) { ctx.strokeStyle = `rgba(86,62,92,${0.75 * seg(f, 0.2, 0.6)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(16, 2, 7, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
  ctx.strokeStyle = "#1b2428"; ctx.fillStyle = "#1b2428"; ctx.lineWidth = 2.6;
  if (f > 0.9) { ctx.beginPath(); ctx.moveTo(11, -6); ctx.lineTo(20, 3); ctx.moveTo(20, -6); ctx.lineTo(11, 3); ctx.stroke(); }
  else if (f > 0.25) { ctx.beginPath(); ctx.moveTo(10, -1); ctx.lineTo(21, -1 + 2 * f); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(16, -2, 3.4, 0, TAU); ctx.fill(); }
  if (f > 0.45) { ctx.beginPath(); ctx.ellipse(20, 15, 3.5, 4.5 * seg(f, 0.45, 0.8) + 1, 0, 0, TAU); ctx.fill(); }
  else { ctx.beginPath(); ctx.moveTo(16, 15); ctx.lineTo(25, 14); ctx.stroke(); }
  ctx.restore();
  // 汗
  if (p > 0.45 && f < 0.97) {
    ctx.fillStyle = "#8fd3e8";
    for (let k = 0; k < 3; k++) {
      const ph = (t * 2.3 + k / 3) % 1;
      ctx.globalAlpha = Math.sin(ph * Math.PI) * clamp((p - 0.45) * 3);
      const x = C.x - 30 - k * 9 - ph * 26, y = C.y - 30 + k * 6 + ph * ph * 30;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.moveTo(x - 3.4, y - 2); ctx.lineTo(x + 3, y - 9); ctx.lineTo(x + 3.6, y - 1); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  return { S, C };
}

function arm(ctx: Ctx, S: { x: number; y: number }, t: number, f: number, typing: number) {
  const k = eInOut(seg(f, 0.6, 1));
  const hx = lerp(372 + 15 * Math.sin(t * 31) * typing, 446, k), hy = lerp(497 - 4 * Math.abs(Math.sin(t * 37)) * typing, 501, k);
  const sx = S.x + 4, sy = S.y + 16;
  ctx.save(); ctx.lineCap = "round";
  ctx.strokeStyle = "#46606a"; ctx.lineWidth = 18;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo((sx + hx) / 2 - 14 * (1 - k), Math.max(sy, hy) + 30 * (1 - k) + 4, hx, hy); ctx.stroke();
  ctx.fillStyle = "#ecd9c6"; ctx.beginPath(); ctx.arc(hx, hy, 9.5, 0, TAU); ctx.fill();
  ctx.restore();
}

function desk(ctx: Ctx, t: number, ver: number, prog: number, stuck: number, cups: number[]) {
  ctx.save();
  ctx.strokeStyle = "rgba(159,175,177,0.22)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(90, 601); ctx.lineTo(740, 601); ctx.stroke();
  ctx.fillStyle = "#566970"; roundRect(ctx, 270, 508, 440, 11, 4); ctx.fill();
  ctx.fillRect(292, 519, 8, 81); ctx.fillRect(680, 519, 8, 81);
  // 显示器:屏幕里是一块抽象的四边面网格(不是车),每做完一版就清空重来
  ctx.fillStyle = "#6b7c82"; ctx.fillRect(538, 480, 14, 23); roundRect(ctx, 512, 502, 66, 6, 3); ctx.fill();
  roundRect(ctx, 450, 350, 190, 132, 9); ctx.fillStyle = "#0b1012"; ctx.fill(); ctx.strokeStyle = stuck > 0.5 ? RED : "#7d8f95"; ctx.lineWidth = 3.5; ctx.stroke();
  ctx.save();
  roundRect(ctx, 456, 356, 178, 120, 5); ctx.clip();
  const nu = 7, nv = 4, shown = prog * nu;
  ctx.strokeStyle = CAGE; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.95;
  const P = (i: number, j: number): [number, number] => [472 + i * 24.5 + j * 3, 398 + j * 16 - 10 * Math.sin((i / nu) * Math.PI) * (1 - j / nv) + 2 * Math.sin(t * 5 + i)];
  ctx.beginPath();
  for (let j = 0; j <= nv; j++) for (let i = 0; i < nu; i++) if (i + 1 <= shown + 0.001) { const a = P(i, j), b = P(i + 1, j); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  for (let i = 0; i <= nu; i++) if (i <= shown + 0.001) for (let j = 0; j < nv; j++) { const a = P(i, j), b = P(i, j + 1); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  ctx.stroke();
  ctx.globalAlpha = 1;
  setFont(ctx, 14, 900); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = stuck > 0.5 ? RED : SOFT; ctx.fillText(`第 ${ver} 版`, 466, 375);
  ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(520, 366, 104, 6);
  ctx.fillStyle = stuck > 0.5 ? RED : ACC; ctx.fillRect(520, 366, 104 * prog, 6);
  ctx.restore();
  // 键盘
  roundRect(ctx, 338, 500, 88, 8, 3); ctx.fillStyle = "#84969c"; ctx.fill();
  // 咖啡杯:每多一版多一杯
  cups.forEach((age, k) => {
    if (age < 0) return;
    const s = eOutBack(seg(age, 0, 0.25)), x = 600 + k * 27;
    ctx.save(); ctx.translate(x, 508); ctx.scale(s, s);
    ctx.fillStyle = "#d9d2c5"; ctx.beginPath(); ctx.moveTo(-9, -22); ctx.lineTo(9, -22); ctx.lineTo(7, 0); ctx.lineTo(-7, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#8a6a4f"; ctx.fillRect(-10, -25, 20, 4);
    ctx.restore();
  });
  ctx.restore();
}

function ticket(ctx: Ctx, age: number, x: number, y: number, text: string, rot: number) {
  if (age < 0) return;
  const a = seg(age, 0, 0.3), e = eOutBack(a);
  ctx.save();
  ctx.globalAlpha *= clamp(a * 3);
  ctx.translate(x, lerp(y - 260, y, e)); ctx.rotate(rot * (0.4 + 0.6 * e));
  roundRect(ctx, -150, -27, 300, 54, 10); ctx.fillStyle = "rgba(42,18,14,0.94)"; ctx.fill();
  ctx.strokeStyle = RED; ctx.lineWidth = 2.5; ctx.stroke();
  drawRuns(ctx, [[text]], 0, 10, 27, 900, "center", "#ffe9e2");
  ctx.restore();
}

export function drawBurnout(ctx: Ctx, lt: number, _dur: number, cue: number[]) {
  const [c0, c1, c2, c3] = cue;
  const hit = c2 + 1.25; // 栽到键盘上的那一刻
  const B = [c2 - 0.12, c2 + 0.42, c2 + 0.76, c2 + 1.0]; // 第 1、2、3、4 版交掉的时刻:越来越赶
  const ver = 1 + B.filter((b) => lt >= b).length;
  const prev = ver === 1 ? c0 : B[ver - 2], next = ver <= 4 ? B[ver - 1] : hit + 3;
  const prog = ver === 5 ? 0.34 * seg(lt, prev, hit) : seg(lt, prev, next) * (ver === 1 ? 1 : 1);
  const fall = Math.pow(seg(lt, c2 + 0.35, hit), 2.6);
  const bounce = lt > hit ? 0.05 * Math.exp(-(lt - hit) * 9) * Math.abs(Math.sin((lt - hit) * 26)) : 0;
  const f = lt < c1 ? 0.03 : lt < c2 ? lerp(0.03, 0.42, eInOut(seg(lt, c1, c2))) : lerp(0.42, 1, fall) - bounce;
  const relax = eOutCubic(seg(lt, hit + 0.1, hit + 0.8));
  const p = lt < c1 ? 0 : lt < c2 ? 0.3 * eOutCubic(seg(lt, c1, c1 + 0.3)) + 0.3 * seg(lt, c1, c2) : lerp(lerp(0.6, 1, seg(lt, c2, hit)), 0.1, relax);
  const days = seg(lt, c1, B[0]) + 3 * Math.pow(seg(lt, B[0], hit), 1.5) + 0.2 * seg(lt, hit, hit + 4);
  const hot = lt < c1 ? 0 : clamp(p * 1.3) * (1 - relax);
  const typing = lt < c1 ? 0.45 : 1;
  const quake = lt > hit ? 11 * Math.exp(-(lt - hit) * 7) : 0;

  smallTag(ctx, "前期方案  ·  SubD 建模周期", "示意", 1);
  ctx.save();
  ctx.translate(wob(lt, 31) * (4.5 * p + quake), wob(lt, 47) * (3.5 * p + quake));

  /* ---------- 左:工位 ---------- */
  clock(ctx, 214, 196, 54, days, hot);
  sunMoon(ctx, 300, 160, days, seg(lt, c1, c1 + 0.2));
  const { S, C } = worker(ctx, lt, f, typing, p);
  desk(ctx, lt, ver, prog, lt > hit ? 1 : 0, B.map((b) => lt - b));
  arm(ctx, S, lt, f, typing);
  battery(ctx, C.x + 30 + 26 * f, C.y - 72 - 8 * f, clamp(1 - f * 1.02), lt);
  if (lt > hit + 0.45) {
    ctx.save(); ctx.fillStyle = "#b7c4c6"; ctx.textAlign = "center";
    for (let k = 0; k < 3; k++) {
      const ph = ((lt - hit) * 0.55 + k / 3) % 1;
      ctx.globalAlpha = Math.sin(ph * Math.PI) * seg(lt, hit + 0.45, hit + 0.8);
      setFont(ctx, 17 + ph * 17, 900);
      ctx.fillText("z", C.x - 6 + ph * 40 + 8 * Math.sin(ph * 9), C.y - 44 - ph * 78);
    }
    ctx.restore();
  }

  /* ---------- 右:大字 ---------- */
  const X = 985;
  const aA = eOutCubic(seg(lt, c0 - 0.05, c0 + 0.35)) * (1 - seg(lt, c1 - 0.14, c1));
  if (aA > 0.01) {
    ctx.save(); ctx.globalAlpha = aA; ctx.translate(0, (1 - eOutCubic(seg(lt, c0 - 0.05, c0 + 0.35))) * 16);
    drawRuns(ctx, [["SubD", SOFT], [" 建模"]], X, 262, 80, 900, "center");
    drawRuns(ctx, [["做一版前期方案，要多久？"]], X, 318, 28, 700, "center", "#9fb0b3");
    ctx.restore();
  }
  const aB = (1 - seg(lt, c2, c2 + 0.16));
  if (lt >= c1 && aB > 0.01) {
    ctx.save(); ctx.globalAlpha = aB;
    slamText(ctx, lt - c1, X, 180, () => drawRuns(ctx, [["最快也要"]], 0, 0, 38, 900, "center", "#cfd6d2", 4), 1.2);
    slamText(ctx, lt - c1 - 0.08, X, 312, () => { ctx.shadowColor = "rgba(232,85,58,0.5)"; ctx.shadowBlur = 30; drawRuns(ctx, [["1 天", SOFT], [" / 版"]], 0, 0, 128, 900, "center"); });
    // 今天之内交:一条越走越红的进度
    const d = seg(lt, c1 + 0.15, B[0]);
    roundRect(ctx, X - 200, 352, 400, 14, 7); ctx.fillStyle = "rgba(255,255,255,0.09)"; ctx.fill();
    if (d > 0.01) { roundRect(ctx, X - 200, 352, 400 * d, 14, 7); ctx.fillStyle = `rgb(${Math.round(lerp(209, 232, d))},${Math.round(lerp(141, 85, d))},${Math.round(lerp(95, 58, d))})`; ctx.fill(); }
    setFont(ctx, 16, 700); (ctx as any).letterSpacing = "3px"; ctx.textAlign = "left"; ctx.fillStyle = "#869296"; ctx.fillText("早上开工", X - 200, 394);
    ctx.textAlign = "right"; ctx.fillStyle = d > 0.7 && Math.sin(lt * 20) > 0 ? RED : "#c9735e"; ctx.fillText("今天交", X + 200, 394); (ctx as any).letterSpacing = "0px";
    ctx.restore();
  }
  const aC = 1 - seg(lt, c3 - 0.1, c3 + 0.12);
  if (lt >= c2 && aC > 0.01) {
    ctx.save(); ctx.globalAlpha = aC;
    const rot = [-0.03, 0.045, -0.05, 0.035];
    ["再来一版 · 明天交", "再来一版 · 明天交", "再来一版 · 今晚交", "再来一版 · 现在就要"].forEach((s, k) => ticket(ctx, lt - (c2 + 0.05 + k * 0.3), X + (k % 2 ? 14 : -12), 430 - k * 64, s, rot[k]));
    // 印章
    const age = lt - hit;
    if (age >= 0) {
      const a = eOutExpo(seg(age, 0, 0.26));
      ctx.save(); ctx.globalAlpha *= clamp(a * 2); ctx.translate(X, 318); ctx.rotate(-0.1); ctx.scale(lerp(1.7, 1, a), lerp(1.7, 1, a));
      const w = measureRuns(ctx, [["撑不了几次"]], 66) + 56;
      roundRect(ctx, -w / 2, -52, w, 100, 12); ctx.fillStyle = "rgba(9,13,15,0.93)"; ctx.fill(); ctx.strokeStyle = RED; ctx.lineWidth = 5; ctx.stroke();
      drawRuns(ctx, [["撑不了几次"]], 0, 22, 66, 900, "center", "#f0633f");
      ctx.restore();
    }
    ctx.restore();
  }
  if (lt >= c3) {
    slamText(ctx, lt - c3, X, 176, () => drawRuns(ctx, [["正常节奏"]], 0, 0, 38, 900, "center", "#cfd6d2", 4), 1.15);
    slamText(ctx, lt - c3 - 0.07, X, 304, () => drawRuns(ctx, [["3–5 天", SOFT], [" / 版"]], 0, 0, 116, 900, "center"), 1.25);
    for (let k = 0; k < 5; k++) {
      const on = eOutBack(seg(lt, c3 + 0.3 + k * 0.13, c3 + 0.52 + k * 0.13));
      const x = X - 190 + k * 78;
      ctx.save(); ctx.translate(x + 34, 386); ctx.scale(0.6 + 0.4 * clamp(on, 0, 1.2), 0.6 + 0.4 * clamp(on, 0, 1.2)); ctx.globalAlpha *= clamp(on);
      roundRect(ctx, -34, -34, 68, 68, 12);
      ctx.fillStyle = k < 3 ? "rgba(232,178,138,0.9)" : "rgba(232,178,138,0.28)"; ctx.fill();
      if (k >= 3) { ctx.setLineDash([6, 5]); ctx.strokeStyle = SOFT; ctx.lineWidth = 2; ctx.stroke(); }
      setFont(ctx, 30, 900); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = k < 3 ? "#11171a" : SOFT; ctx.fillText(String(k + 1), 0, 2);
      ctx.restore();
    }
  }
  ctx.restore();

  /* ---------- 压迫感:四壁往里挤、红色暗角跟着心跳 ---------- */
  if (p > 0.01) {
    const beat = Math.pow(Math.max(0, Math.sin(lt * TAU * 2.2)), 6);
    const g = ctx.createRadialGradient(W / 2, VIEW_H / 2, 200, W / 2, VIEW_H / 2, 760);
    g.addColorStop(0, "rgba(232,70,40,0)"); g.addColorStop(1, `rgba(232,70,40,${(p * (0.3 + 0.25 * beat)).toFixed(3)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, VIEW_H);
    const pw = Math.pow(clamp((p - 0.12) / 0.88), 1.4) * (1 + 0.05 * beat);
    const sx = 92 * pw, sy = 50 * pw;
    ctx.fillStyle = "rgba(5,7,8,0.94)";
    ctx.fillRect(0, 0, W, sy); ctx.fillRect(0, VIEW_H - sy, W, sy); ctx.fillRect(0, 0, sx, VIEW_H); ctx.fillRect(W - sx, 0, sx, VIEW_H);
    ctx.strokeStyle = `rgba(232,85,58,${(0.75 * pw).toFixed(3)})`; ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, W - 2 * sx, VIEW_H - 2 * sy);
  }
  if (lt > hit) { ctx.fillStyle = `rgba(4,6,7,${(0.4 * Math.exp(-(lt - hit) * 4.5)).toFixed(3)})`; ctx.fillRect(0, 0, W, VIEW_H); }
}
