// 车身控制笼(SubD cage)与细分:
// 车身是一张"沿车长放样"的四边形网格——沿 X 方向 27 个截面,每个截面绕一圈 18 个控制点。
// 细分用的是均匀三次 B 样条加密(与 Catmull-Clark 在规则四边形网格上的极限曲面一致),
// 所以屏幕上看到的光顺曲面,就是控制笼真正的细分结果,不是贴图或描边。

export type Grid = { nu: number; nv: number; p: Float32Array };

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** 分段三次 Hermite(Catmull-Rom 斜率),用来描述侧视轮廓、车宽等随车长变化的曲线 */
export function makeCurve(pts: [number, number][]) {
  const n = pts.length;
  const m: number[] = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    return (b[1] - a[1]) / Math.max(1e-6, b[0] - a[0]);
  });
  return (x: number) => {
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0;
    while (x > pts[i + 1][0]) i++;
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const h = x1 - x0, t = (x - x0) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[i + 1];
  };
}

// ---- 车型参数(单位 米,车头朝 +X,Y 向上,Z 向左右) ----
export const CAR = { length: 4.77, width: 1.85, height: 1.43, wheelbase: 2.8, axleY: 0.356, wheelZ: 0.775 };
export const WHEEL_X = CAR.wheelbase / 2;

const yTopF = makeCurve([[-2.385, 0.86], [-2.3, 0.93], [-2.1, 0.99], [-1.8, 1.025], [-1.35, 1.13], [-0.9, 1.29], [-0.4, 1.39], [0.1, 1.43], [0.45, 1.37], [0.7, 1.2], [1.05, 0.99], [1.5, 0.935], [1.9, 0.86], [2.2, 0.775], [2.33, 0.72], [2.385, 0.67]]);
const yBeltF = makeCurve([[-2.385, 0.8], [-2.0, 0.97], [-1.2, 1.0], [0, 1.0], [1.0, 0.98], [1.6, 0.915], [2.0, 0.83], [2.385, 0.64]]);
const yLipF = makeCurve([[-2.385, 0.36], [-2.2, 0.27], [-2.0, 0.19], [2.0, 0.19], [2.2, 0.21], [2.385, 0.31]]);
const hwF = makeCurve([[-2.385, 0.6], [-2.3, 0.73], [-2.0, 0.875], [-1.4, 0.925], [0, 0.92], [1.4, 0.925], [2.0, 0.885], [2.3, 0.79], [2.385, 0.7]]);
export const yTopAt = yTopF;
export const yBeltAt = yBeltF;

/** 27 个截面的 X 位置:两端各 2 个收口截面 + 中间每 0.2 m 一个(轮心 ±1.4 正好落在截面上) */
export const STATIONS: number[] = (() => {
  const xs = [-2.385, -2.33];
  for (let k = 0; k <= 22; k++) xs.push(+(-2.2 + 0.2 * k).toFixed(3));
  xs.push(2.33, 2.385);
  return xs;
})();
export const NS = STATIONS.length; // 27
export const NR = 18; // 每个截面的控制点数(上半 10 个镜像成一圈)
const END_SCALE: Record<number, number> = { 0: 0, 1: 0.7, 2: 0.93, [NS - 3]: 0.93, [NS - 2]: 0.7, [NS - 1]: 0 };

/** 把 X 坐标换算成"截面序号"(小数),贴图和细分后的参数都按这个序号走 */
export function stationIndexOf(x: number) {
  if (x <= STATIONS[0]) return 0;
  if (x >= STATIONS[NS - 1]) return NS - 1;
  let i = 0;
  while (x > STATIONS[i + 1]) i++;
  return i + (x - STATIONS[i]) / (STATIONS[i + 1] - STATIONS[i]);
}

export interface CageOpts {
  /** 车顶:0 = 方盒高度,1 = 成品车顶(中段座舱) */
  roof: number;
  /** 机盖与尾部:0 = 方盒高度,1 = 压到成品高度 */
  ends: number;
  /** 整体型面:车宽收窄、腰线、轮眉开口、车头车尾收口。0 = 方盒,1 = 成品 */
  shape: number;
}
export const FINAL_OPTS: CageOpts = { roof: 1, ends: 1, shape: 1 };
const BOX_TOP = 1.2, BOX_BELT = 0.78, BOX_HW = 0.92, SILL = 0.17;

function ringHalf(i: number, o: CageOpts): [number, number][] {
  const x = STATIONS[i];
  const sh = o.shape;
  // 车顶高度:机盖、尾部区域受 ends 控制,座舱受 roof 控制,交界处平滑过渡(方盒阶段就是一个台阶)
  const wc = smooth(-1.95, -1.7, x) * (1 - smooth(1.0, 1.25, x));
  const wTop = lerp(o.ends, o.roof, wc);
  const yt = lerp(BOX_TOP, yTopF(x), wTop);
  // 轮眉:以轮心为圆心的拱形开口(截面间距 0.2 m,所以细分后才会变圆润)
  let yb = lerp(SILL, yLipF(x), sh);
  const Ra = 0.385;
  for (const c of [-WHEEL_X, WHEEL_X]) {
    const dx = Math.abs(x - c);
    if (dx < Ra) yb = Math.max(yb, lerp(SILL, CAR.axleY + Math.sqrt(Ra * Ra - dx * dx), sh));
  }
  const hw = lerp(BOX_HW, hwF(x), sh);
  const beltBase = lerp(BOX_BELT, yBeltF(x), sh);
  const yBelt = Math.max(yb + 0.1, Math.min(beltBase, yt - 0.004));
  const hc = Math.max(0, yt - yBelt);
  const s = smooth(0.02, 0.4, hc) * sh;
  const hr = hw * (1 - 0.36 * s);
  const hl = yBelt - yb;
  const crown = 0.022 * sh;
  const half: [number, number][] = [
    [0, yb],
    [0.45 * hw, yb],
    [0.93 * hw, yb + 0.1 * hl],
    [hw, yb + 0.42 * hl],
    [hw, yb + 0.8 * hl],
    [0.975 * hw, yBelt],
    [lerp(hw * 0.8, lerp(hw * 0.975, hr, 0.55), s), yBelt + 0.45 * hc],
    [lerp(hw * 0.62, hr, s), yBelt + 0.9 * hc],
    [lerp(hw * 0.33, 0.55 * hr, s), yt - crown],
    [0, yt],
  ];
  // 方盒阶段:侧面是直墙
  if (sh < 1) {
    const k = 1 - sh;
    half[6][0] = lerp(half[6][0], hw, k * 0.9);
    half[7][0] = lerp(half[7][0], hw, k * 0.75);
  }
  // 两端收口
  const es = lerp(1, END_SCALE[i] ?? 1, sh);
  if (es < 1) {
    const yc = (yb + yt) / 2;
    for (const p of half) { p[0] *= es; p[1] = yc + (p[1] - yc) * es; }
  }
  return half;
}

/** 生成控制笼:27 × 18 个点,下标 = i * NR + j(j=0 底部中线,j=9 车顶中线,逆时针转一圈) */
export function buildCage(o: CageOpts = FINAL_OPTS): Grid {
  const p = new Float32Array(NS * NR * 3);
  for (let i = 0; i < NS; i++) {
    const h = ringHalf(i, o);
    const ring: [number, number][] = [];
    for (let k = 0; k < 10; k++) ring.push([h[k][0], h[k][1]]);
    for (let k = 8; k >= 1; k--) ring.push([-h[k][0], h[k][1]]);
    for (let j = 0; j < NR; j++) {
      const q = (i * NR + j) * 3;
      p[q] = STATIONS[i]; p[q + 1] = ring[j][1]; p[q + 2] = ring[j][0];
    }
  }
  return { nu: NS, nv: NR, p };
}

/** 一次细分:smooth=true 为三次 B 样条加密(光顺),false 为线性加密(保持棱角,用来做"硬朗 → 光顺"的对照) */
export function subdivide(g: Grid, smoothRule: boolean): Grid {
  const { nu, nv, p } = g;
  const nu2 = nu * 2 - 1;
  const a = new Float32Array(nu2 * nv * 3);
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) for (let c = 0; c < 3; c++) {
    const cur = p[(i * nv + j) * 3 + c];
    let v = cur;
    if (smoothRule && i > 0 && i < nu - 1) v = (p[((i - 1) * nv + j) * 3 + c] + 6 * cur + p[((i + 1) * nv + j) * 3 + c]) / 8;
    a[(2 * i * nv + j) * 3 + c] = v;
    if (i < nu - 1) a[((2 * i + 1) * nv + j) * 3 + c] = (cur + p[((i + 1) * nv + j) * 3 + c]) / 2;
  }
  const nv2 = nv * 2;
  const out = new Float32Array(nu2 * nv2 * 3);
  for (let i = 0; i < nu2; i++) for (let j = 0; j < nv; j++) for (let c = 0; c < 3; c++) {
    const cur = a[(i * nv + j) * 3 + c];
    const nxt = a[(i * nv + ((j + 1) % nv)) * 3 + c];
    const prv = a[(i * nv + ((j + nv - 1) % nv)) * 3 + c];
    out[(i * nv2 + 2 * j) * 3 + c] = smoothRule ? (prv + 6 * cur + nxt) / 8 : cur;
    out[(i * nv2 + 2 * j + 1) * 3 + c] = (cur + nxt) / 2;
  }
  return { nu: nu2, nv: nv2, p: out };
}

export function refine(g: Grid, levels: number, smoothRule: boolean) {
  let r = g;
  for (let k = 0; k < levels; k++) r = subdivide(r, smoothRule);
  return r;
}
