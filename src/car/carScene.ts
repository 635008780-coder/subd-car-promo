// 三维车身渲染(three.js)。所有场景共用一个离屏 WebGL 渲染器,画好后再 drawImage 到各自的 2D 画布上,
// 这样视频叠层、两派建模、封面一共十几个画面也只占用一个 WebGL 上下文。
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CAR, FINAL_OPTS, NR, NS, STATIONS, WHEEL_X, buildCage, clamp, refine, stationIndexOf, smooth as sstep, type CageOpts, type Grid } from "./cage";

export const PAINTS = {
  white: { name: "珍珠白", hex: "#f5f3ee" },
  terracotta: { name: "赤陶红", hex: "#b04128" },
  mint: { name: "薄荷青", hex: "#3aa88e" },
  navy: { name: "深海蓝", hex: "#123761" },
  graphite: { name: "石墨灰", hex: "#4a5258" },
} as const;
export type PaintKey = keyof typeof PAINTS;

/* ---------------- 共享渲染器 ---------------- */
const BUF_W = 1920, BUF_H = 1080;
let renderer: THREE.WebGLRenderer | null = null;
let envMap: THREE.Texture | null = null;
let glFailed = false;

export function hasWebGL() {
  try { return !!getRenderer(); } catch { return false; }
}
function getRenderer() {
  if (renderer) return renderer;
  if (glFailed) throw new Error("webgl");
  try {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    r.setPixelRatio(1);
    r.setSize(BUF_W, BUF_H, false);
    r.setClearColor(0x000000, 0);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.localClippingEnabled = true;
    const pm = new THREE.PMREMGenerator(r);
    envMap = pm.fromScene(new RoomEnvironment(), 0.035).texture;
    renderer = r;
    return r;
  } catch (e) {
    glFailed = true;
    throw e;
  }
}

/* ---------------- 车漆贴图(按"截面序号 × 圈内序号"展开) ---------------- */
const texCache = new Map<string, THREE.CanvasTexture>();
function paintTexture(color: string) {
  const hit = texCache.get(color);
  if (hit) return hit;
  const W = 2048, H = 1024;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d")!;
  g.fillStyle = color; g.fillRect(0, 0, W, H);
  const X = (x: number) => (stationIndexOf(x) / (NS - 1)) * W;
  const Y = (j: number) => (j / NR) * H;
  const both = (fn: (m: (j: number) => number) => void) => { fn((j) => j); fn((j) => NR - j); };
  const poly = (pts: [number, number][], m: (j: number) => number) => {
    g.beginPath();
    pts.forEach(([x, j], k) => (k ? g.lineTo(X(x), Y(m(j))) : g.moveTo(X(x), Y(m(j)))));
    g.closePath();
  };
  // 底部与门槛:压暗
  const dark = (y0: number, y1: number, y2: number, y3: number) => {
    const gr = g.createLinearGradient(0, Y(y0), 0, Y(y3));
    gr.addColorStop(0, "rgba(12,15,17,0.96)");
    gr.addColorStop((y1 - y0) / (y3 - y0), "rgba(12,15,17,0.94)");
    gr.addColorStop((y2 - y0) / (y3 - y0), "rgba(12,15,17,0.35)");
    gr.addColorStop(1, "rgba(12,15,17,0)");
    g.fillStyle = gr; g.fillRect(0, Y(Math.min(y0, y3)), W, Y(Math.abs(y3 - y0)));
  };
  dark(0, 1.6, 2.0, 2.5);
  dark(NR, NR - 1.6, NR - 2.0, NR - 2.5);
  // 玻璃:侧窗 + 前风挡 + 后风挡
  const glass = "#0c1318";
  both((m) => {
    poly([[0.88, 5.3], [0.8, 7.25], [-1.0, 7.3], [-1.62, 6.8], [-1.35, 5.3]], m);
    g.fillStyle = glass; g.fill();
    // B 柱
    g.fillStyle = color; g.fillRect(X(-0.14), Y(m(5.3)), X(-0.02) - X(-0.14), Y(m(7.3)) - Y(m(5.3)));
    // 窗框细线
    g.strokeStyle = "rgba(200,210,215,0.28)"; g.lineWidth = 3; poly([[0.88, 5.3], [0.8, 7.25], [-1.0, 7.3], [-1.62, 6.8], [-1.35, 5.3]], m); g.stroke();
  });
  g.fillStyle = glass;
  g.fillRect(X(0.5), Y(7.7), X(1.02) - X(0.5), Y(10.3) - Y(7.7));
  g.fillRect(X(-1.78), Y(7.7), X(-1.12) - X(-1.78), Y(10.3) - Y(7.7));
  // 分缝线:四门、机盖、尾盖
  g.strokeStyle = "rgba(8,10,12,0.55)"; g.lineWidth = 3.2; g.lineCap = "round";
  both((m) => {
    for (const x of [0.86, -0.08, -1.0]) { g.beginPath(); g.moveTo(X(x), Y(m(2.2))); g.lineTo(X(x), Y(m(5.3))); g.stroke(); }
    g.beginPath(); g.moveTo(X(-1.0), Y(m(2.3))); g.lineTo(X(0.86), Y(m(2.3))); g.stroke();
  });
  g.beginPath(); g.moveTo(X(1.08), Y(5.2)); g.lineTo(X(1.12), Y(9)); g.lineTo(X(1.08), Y(NR - 5.2)); g.stroke();
  g.beginPath(); g.moveTo(X(-1.95), Y(5.2)); g.lineTo(X(-2.0), Y(9)); g.lineTo(X(-1.95), Y(NR - 5.2)); g.stroke();
  // 腰线高光
  g.strokeStyle = "rgba(255,255,255,0.22)"; g.lineWidth = 2.4;
  both((m) => { g.beginPath(); g.moveTo(X(-2.3), Y(m(4.9))); g.lineTo(X(2.2), Y(m(4.9))); g.stroke(); });
  // 前灯
  both((m) => {
    poly([[1.9, 5.0], [2.3, 5.5], [2.33, 6.8], [2.0, 6.7]], m);
    g.fillStyle = "#0a0e11"; g.fill();
    g.strokeStyle = "#dfeaff"; g.lineWidth = 6; g.beginPath(); g.moveTo(X(1.95), Y(m(5.55))); g.lineTo(X(2.28), Y(m(5.85))); g.stroke();
    g.strokeStyle = "rgba(223,234,255,0.55)"; g.lineWidth = 4; g.beginPath(); g.moveTo(X(1.97), Y(m(6.25))); g.lineTo(X(2.28), Y(m(6.4))); g.stroke();
  });
  // 进气格栅与下进气口
  g.fillStyle = "#0b0f12";
  g.fillRect(X(2.2), Y(NR - 1.1), X(2.385) - X(2.2), Y(1.1) + (H - Y(NR - 1.1)));
  g.fillRect(X(2.2), 0, X(2.385) - X(2.2), Y(1.1));
  // 尾灯
  both((m) => {
    poly([[-2.34, 5.0], [-2.05, 5.2], [-2.0, 6.7], [-2.34, 6.9]], m);
    g.fillStyle = "#7d0d14"; g.fill();
    g.strokeStyle = "#ff5a48"; g.lineWidth = 7; g.beginPath(); g.moveTo(X(-2.3), Y(m(6.0))); g.lineTo(X(-2.05), Y(m(5.9))); g.stroke();
  });
  g.strokeStyle = "#ff4a3a"; g.lineWidth = 5;
  g.beginPath(); g.moveTo(X(-2.31), Y(6.9)); g.lineTo(X(-2.34), Y(9)); g.lineTo(X(-2.31), Y(NR - 6.9)); g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  texCache.set(color, t);
  return t;
}

/* ---------------- 车轮 ---------------- */
function makeWheel() {
  const grp = new THREE.Group();
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x141617, roughness: 0.82, metalness: 0.05 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xcfd4d8, roughness: 0.22, metalness: 1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x23282c, roughness: 0.45, metalness: 0.8 });
  const discMat = new THREE.MeshStandardMaterial({ color: 0x4a5055, roughness: 0.4, metalness: 0.9 });
  const calMat = new THREE.MeshStandardMaterial({ color: 0xd9552b, roughness: 0.4, metalness: 0.3 });
  const R = CAR.axleY;
  const tireProfile = [[0.205, -0.112], [0.3, -0.127], [0.338, -0.104], [0.352, -0.062], [R, 0], [0.352, 0.062], [0.338, 0.104], [0.3, 0.127], [0.205, 0.112]].map(([a, b]) => new THREE.Vector2(a, b));
  const tire = new THREE.Mesh(new THREE.LatheGeometry(tireProfile, 56), tireMat);
  const rimProfile = [[0, 0.08], [0.08, 0.1], [0.19, 0.105], [0.222, 0.118], [0.232, 0.095], [0.222, -0.05], [0.2, -0.085], [0, -0.085]].map(([a, b]) => new THREE.Vector2(a, b));
  const rim = new THREE.Mesh(new THREE.LatheGeometry(rimProfile, 48), rimMat);
  grp.add(tire, rim);
  const spokeGeo = new THREE.BoxGeometry(0.15, 0.03, 0.022);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const s = new THREE.Mesh(spokeGeo, k % 2 ? rimMat : darkMat);
    s.position.set(Math.cos(a) * 0.125, 0.092, Math.sin(a) * 0.125);
    s.rotation.set(0, -a, 0);
    s.scale.set(1, 1, 1);
    grp.add(s);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 20), darkMat);
  hub.position.y = 0.1;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 40), discMat);
  disc.position.y = 0.0;
  const cal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.07), calMat);
  cal.position.set(0.12, 0.012, 0.0);
  grp.add(hub, disc, cal);
  const outer = new THREE.Group();
  grp.rotation.x = Math.PI / 2; // 轴线转到 Z
  outer.add(grp);
  return outer;
}

/* ---------------- 车体场景 ---------------- */
const ORANGE = new THREE.Color("#e8793a");
const SOFT = new THREE.Color("#ffb37a");

let dotTex: THREE.CanvasTexture | null = null;
function dotTexture() {
  if (dotTex) return dotTex;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fillStyle = "#fff"; g.fill();
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}
let shadowTex: THREE.CanvasTexture | null = null;
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement("canvas"); c.width = 512; c.height = 256;
  const g = c.getContext("2d")!;
  g.translate(256, 128); g.scale(1, 0.5);
  const gr = g.createRadialGradient(0, 0, 10, 0, 0, 250);
  gr.addColorStop(0, "rgba(0,0,0,0.78)"); gr.addColorStop(0.55, "rgba(0,0,0,0.42)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(-256, -256, 512, 512);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

export interface CamSpec {
  az: number; // 弧度,0 = 正侧面(从车的 +Z 侧看,车头朝右),正值向车头方向转
  el: number; // 俯仰
  dist: number;
  fov?: number;
  tx?: number; ty?: number; tz?: number;
}

export interface RigLook {
  paint: PaintKey;
  /** 0 = 棱角(线性加密),1 = 光顺(细分曲面) */
  smooth: number;
  body: number; // 实体不透明度
  cage: number; // 控制笼线条/点不透明度
  wire1: number; // 细分一次后的网格线
  fill: number; // 控制笼面片填充
  wheels: number;
  shadow: number;
  cageXray: boolean;
}

const DEFAULT_LOOK: RigLook = { paint: "white", smooth: 1, body: 1, cage: 0, wire1: 0, fill: 0, wheels: 1, shadow: 1, cageXray: true };

export class CarRig {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(26, 16 / 9, 0.1, 100);
  look: RigLook = { ...DEFAULT_LOOK };
  clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 100);
  private cageOpts: CageOpts = { ...FINAL_OPTS };
  private cage!: Grid;
  private facet!: Grid;
  private sm!: Grid;
  private l1!: Grid;
  private bodyGeo: THREE.BufferGeometry;
  private body: THREE.Mesh;
  private bodyMat: THREE.MeshPhysicalMaterial;
  private edgeGeo: THREE.BufferGeometry;
  private edges: THREE.LineSegments;
  private edgeMat: THREE.LineBasicMaterial;
  private dotGeo: THREE.BufferGeometry;
  private dots: THREE.Points;
  private dotMat: THREE.PointsMaterial;
  private faceGeo: THREE.BufferGeometry;
  private faces: THREE.Mesh;
  private faceMat: THREE.MeshBasicMaterial;
  private w1Geo: THREE.BufferGeometry;
  private w1: THREE.LineSegments;
  private w1Mat: THREE.LineBasicMaterial;
  private wheelGroup = new THREE.Group();
  private mirrorMeshes: THREE.Mesh[] = [];
  private mirrorMat: THREE.MeshPhysicalMaterial;
  private shadow: THREE.Mesh;
  private shadowMat: THREE.MeshBasicMaterial;
  private cellGroup = new Uint8Array((NS - 1) * NR);
  private cellKey = new Float32Array((NS - 1) * NR);
  private groupProg = [1, 1, 1, 1];
  private dirtyCage = true;
  private dirtyLook = true;
  private lastRect = { x: 0, y: 0, w: 1, h: 1 };
  private curveCache: { roof?: THREE.Vector3[]; belt?: THREE.Vector3[] } = {};

  constructor() {
    getRenderer();
    this.scene.environment = envMap;
    this.scene.environmentIntensity = 0.95;
    const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(4, 6, 3.5);
    const rim = new THREE.DirectionalLight(0xffc89a, 1.6); rim.position.set(-5, 2.6, -3.5);
    const fill = new THREE.DirectionalLight(0x9fc6ff, 0.5); fill.position.set(-3, 2, 5);
    this.scene.add(key, rim, fill);

    this.bodyMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.18, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1, clippingPlanes: [this.clip] });
    this.bodyGeo = new THREE.BufferGeometry();
    this.body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    this.scene.add(this.body);

    this.edgeGeo = new THREE.BufferGeometry();
    this.edgeMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, clippingPlanes: [this.clip] });
    this.edges = new THREE.LineSegments(this.edgeGeo, this.edgeMat);
    this.edges.renderOrder = 5; this.edges.frustumCulled = false;
    this.dotGeo = new THREE.BufferGeometry();
    this.dotMat = new THREE.PointsMaterial({ vertexColors: true, transparent: true, size: 6, sizeAttenuation: false, map: dotTexture(), alphaTest: 0.2, depthWrite: false, clippingPlanes: [this.clip] });
    this.dots = new THREE.Points(this.dotGeo, this.dotMat);
    this.dots.renderOrder = 6; this.dots.frustumCulled = false;
    this.faceGeo = new THREE.BufferGeometry();
    this.faceMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: [this.clip] });
    this.faces = new THREE.Mesh(this.faceGeo, this.faceMat);
    this.faces.renderOrder = 3; this.faces.frustumCulled = false;
    this.w1Geo = new THREE.BufferGeometry();
    this.w1Mat = new THREE.LineBasicMaterial({ color: SOFT, transparent: true, opacity: 0, depthWrite: false, clippingPlanes: [this.clip] });
    this.w1 = new THREE.LineSegments(this.w1Geo, this.w1Mat);
    this.w1.renderOrder = 4; this.w1.frustumCulled = false;
    this.scene.add(this.faces, this.w1, this.edges, this.dots);

    // 车轮 / 后视镜 / 地面阴影
    const proto = makeWheel();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const w = proto.clone(true);
      w.position.set(sx * WHEEL_X, CAR.axleY, sz * CAR.wheelZ);
      if (sz < 0) w.rotation.y = Math.PI;
      this.wheelGroup.add(w);
    }
    this.scene.add(this.wheelGroup);
    this.wheelGroup.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.clippingPlanes = [this.clip];
    });
    this.mirrorMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.18, clearcoat: 1, clippingPlanes: [this.clip] });
    for (const sz of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), this.mirrorMat);
      m.scale.set(1.2, 0.72, 1.6);
      m.position.set(0.78, 1.0, sz * 1.0);
      m.rotation.y = sz * -0.25;
      this.mirrorMeshes.push(m);
      this.scene.add(m);
    }
    this.shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 3.8), this.shadowMat);
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.003; this.shadow.renderOrder = -1;
    this.scene.add(this.shadow);

    this.buildTopology();
    this.setCage(FINAL_OPTS, true);
  }

  /* ---- 拓扑(只建一次) ---- */
  private buildTopology() {
    // 面片分组:0 轮眉 1 腰线 2 补面 3 底部。用于"拼接法"依次出现
    for (let i = 0; i < NS - 1; i++) for (let j = 0; j < NR; j++) {
      const cx = (STATIONS[i] + STATIONS[i + 1]) / 2, jc = j + 0.5;
      const jm = jc < NR / 2 ? jc : NR - jc;
      const d = Math.min(Math.abs(cx - WHEEL_X), Math.abs(cx + WHEEL_X));
      const idx = i * NR + j;
      let gp = 2, key = (Math.abs(jm - 5) / 5) * 0.75 + (((i * 7 + j * 13) % 10) / 10) * 0.25;
      if (jm < 1) gp = 3;
      else if (d < 0.62 && jm >= 1 && jm <= 5) {
        gp = 0;
        const c = cx > 0 ? WHEEL_X : -WHEEL_X;
        key = clamp((cx - c) / 1.24 + 0.5) * 0.7 + (cx > 0 ? 0 : 0.3);
      } else if (jm >= 4 && jm <= 6) {
        gp = 1; key = (cx + 2.4) / 4.8;
      }
      this.cellGroup[idx] = gp; this.cellKey[idx] = key;
    }
    // 控制笼线段
    const segs: number[] = [];
    const push = (a: number, b: number) => segs.push(a, b);
    for (let i = 0; i < NS; i++) for (let j = 0; j < NR; j++) {
      const a = i * NR + j;
      if (i < NS - 1) push(a, (i + 1) * NR + j);
      push(a, i * NR + ((j + 1) % NR));
    }
    this.edgeSegs = new Uint16Array(segs);
    this.edgeGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(segs.length * 3), 3));
    this.edgeGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(segs.length * 4), 4));
    this.dotGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(NS * NR * 3), 3));
    this.dotGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(NS * NR * 4), 4));
    // 面片:每格 2 个三角形(6 个顶点)
    this.faceGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((NS - 1) * NR * 6 * 3), 3));
    this.faceGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array((NS - 1) * NR * 6 * 4), 4));
    // 实体网格拓扑
    const nu = (NS - 1) * 4 + 1, nv = NR * 4;
    const idx: number[] = [];
    const W = nv + 1;
    for (let i = 0; i < nu - 1; i++) for (let j = 0; j < nv; j++) {
      const a = i * W + j, b = (i + 1) * W + j, c = (i + 1) * W + j + 1, d = i * W + j + 1;
      idx.push(a, b, c, a, c, d);
    }
    this.bodyGeo.setIndex(idx);
    const uv = new Float32Array(nu * W * 2);
    for (let i = 0; i < nu; i++) for (let j = 0; j <= nv; j++) { uv[(i * W + j) * 2] = i / (nu - 1); uv[(i * W + j) * 2 + 1] = j / nv; }
    this.bodyGeo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    this.bodyGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nu * W * 3), 3));
    // 一次细分的网格线(53 × 36)
    const nu1 = (NS - 1) * 2 + 1, nv1 = NR * 2;
    const s1: number[] = [];
    for (let i = 0; i < nu1; i++) for (let j = 0; j < nv1; j++) {
      const a = i * nv1 + j;
      if (i < nu1 - 1) s1.push(a, (i + 1) * nv1 + j);
      s1.push(a, i * nv1 + ((j + 1) % nv1));
    }
    this.w1Segs = new Uint16Array(s1);
    this.w1Geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(s1.length * 3), 3));
  }
  private edgeSegs!: Uint16Array;
  private w1Segs!: Uint16Array;

  /** 设置控制笼(方盒推拉时每帧调用) */
  setCage(o: CageOpts, force = false) {
    if (!force && o.roof === this.cageOpts.roof && o.ends === this.cageOpts.ends && o.shape === this.cageOpts.shape) return;
    this.cageOpts = { ...o };
    this.cage = buildCage(o);
    this.facet = refine(this.cage, 2, false);
    this.sm = refine(this.cage, 2, true);
    this.l1 = refine(this.cage, 1, true);
    this.curveCache = {};
    this.dirtyCage = true;
  }
  setLook(p: Partial<RigLook>) {
    Object.assign(this.look, p);
    this.dirtyLook = true;
  }
  /** 拼接法:三组面片的出现进度(0..1) */
  setGroupProgress(a: number, b: number, c: number) {
    const g = [a, b, c, c];
    if (g.some((v, i) => v !== this.groupProg[i])) { this.groupProg = g; this.dirtyLook = true; }
  }

  private refreshGeometry() {
    const { cage } = this;
    // 控制笼线、点
    const ep = this.edgeGeo.getAttribute("position") as THREE.BufferAttribute;
    for (let k = 0; k < this.edgeSegs.length; k++) {
      const v = this.edgeSegs[k] * 3;
      ep.setXYZ(k, cage.p[v], cage.p[v + 1], cage.p[v + 2]);
    }
    ep.needsUpdate = true;
    const dp = this.dotGeo.getAttribute("position") as THREE.BufferAttribute;
    for (let k = 0; k < NS * NR; k++) dp.setXYZ(k, cage.p[k * 3], cage.p[k * 3 + 1], cage.p[k * 3 + 2]);
    dp.needsUpdate = true;
    // 面片(略微外推,避免和实体面打架)
    const fp = this.faceGeo.getAttribute("position") as THREE.BufferAttribute;
    let q = 0;
    const P = (i: number, j: number) => { const k = (i * NR + (j % NR)) * 3; return [cage.p[k], cage.p[k + 1], cage.p[k + 2]]; };
    for (let i = 0; i < NS - 1; i++) for (let j = 0; j < NR; j++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      for (const t of [a, b, c, a, c, d]) fp.setXYZ(q++, t[0], t[1], t[2]);
    }
    fp.needsUpdate = true;
    // 一次细分的网格线
    const wp = this.w1Geo.getAttribute("position") as THREE.BufferAttribute;
    for (let k = 0; k < this.w1Segs.length; k++) { const v = this.w1Segs[k] * 3; wp.setXYZ(k, this.l1.p[v], this.l1.p[v + 1], this.l1.p[v + 2]); }
    wp.needsUpdate = true;
    this.dirtyCage = false;
    this.dirtySurface = true;
  }
  private dirtySurface = true;
  private lastSmooth = -1;

  private refreshSurface() {
    const s = this.look.smooth;
    const pos = this.bodyGeo.getAttribute("position") as THREE.BufferAttribute;
    const A = this.facet.p, B = this.sm.p;
    const nu = this.sm.nu, nv = this.sm.nv, W = nv + 1;
    for (let i = 0; i < nu; i++) for (let j = 0; j <= nv; j++) {
      const k = (i * nv + (j % nv)) * 3;
      pos.setXYZ(i * W + j, A[k] + (B[k] - A[k]) * s, A[k + 1] + (B[k + 1] - A[k + 1]) * s, A[k + 2] + (B[k + 2] - A[k + 2]) * s);
    }
    pos.needsUpdate = true;
    this.bodyGeo.computeVertexNormals();
    this.bodyGeo.computeBoundingSphere();
    this.lastSmooth = s;
    this.dirtySurface = false;
  }

  private refreshLook() {
    const L = this.look;
    const col = PAINTS[L.paint];
    this.bodyMat.map = paintTexture(col.hex);
    this.bodyMat.needsUpdate = true;
    this.mirrorMat.color.set(col.hex);
    this.body.visible = L.body > 0.003;
    this.bodyMat.transparent = L.body < 0.999;
    this.bodyMat.opacity = L.body;
    this.bodyMat.depthWrite = L.body > 0.6;
    this.bodyMat.polygonOffset = !L.cageXray; this.bodyMat.polygonOffsetFactor = 1; this.bodyMat.polygonOffsetUnits = 1;
    for (const m of [this.edgeMat, this.dotMat]) { m.depthTest = !L.cageXray; m.opacity = L.cage; }
    this.edges.visible = this.dots.visible = L.cage > 0.003;
    this.w1Mat.opacity = L.wire1; this.w1.visible = L.wire1 > 0.003;
    this.w1Mat.depthTest = !L.cageXray;
    this.faceMat.opacity = L.fill; this.faces.visible = L.fill > 0.003;
    this.wheelGroup.visible = L.wheels > 0.003;
    this.mirrorMeshes.forEach((m) => (m.visible = L.body > 0.5));
    this.shadowMat.opacity = L.shadow;
    // 面片 / 线 / 点的逐顶点透明度(拼接法分组出现)
    const cellA = new Float32Array((NS - 1) * NR);
    for (let k = 0; k < cellA.length; k++) {
      const g = this.groupProg[this.cellGroup[k]], key = this.cellKey[k];
      const t0 = key * 0.62;
      cellA[k] = sstep(t0, t0 + 0.38, g);
    }
    const fc = this.faceGeo.getAttribute("color") as THREE.BufferAttribute;
    let q = 0;
    for (let k = 0; k < cellA.length; k++) {
      const a = cellA[k];
      const mix = this.cellGroup[k] === 0 ? 1 : this.cellGroup[k] === 1 ? 0.7 : 0.35;
      for (let t = 0; t < 6; t++) fc.setXYZW(q++, SOFT.r, SOFT.g * 0.8, SOFT.b * 0.6, a * 0.32 * mix + a * 0.05);
    }
    fc.needsUpdate = true;
    const cellAt = (i: number, j: number) => (i < 0 || i >= NS - 1 ? 0 : cellA[i * NR + ((j + NR) % NR)]);
    const ec = this.edgeGeo.getAttribute("color") as THREE.BufferAttribute;
    for (let k = 0; k < this.edgeSegs.length; k += 2) {
      const a = this.edgeSegs[k], b = this.edgeSegs[k + 1];
      const ia = Math.floor(a / NR), ja = a % NR, ib = Math.floor(b / NR);
      let al: number;
      if (ib !== ia) al = Math.max(cellAt(ia, ja), cellAt(ia, ja - 1));
      else al = Math.max(cellAt(ia, ja), cellAt(ia - 1, ja));
      ec.setXYZW(k, ORANGE.r, ORANGE.g, ORANGE.b, al);
      ec.setXYZW(k + 1, ORANGE.r, ORANGE.g, ORANGE.b, al);
    }
    ec.needsUpdate = true;
    const dc = this.dotGeo.getAttribute("color") as THREE.BufferAttribute;
    for (let i = 0; i < NS; i++) for (let j = 0; j < NR; j++) {
      const al = Math.max(cellAt(i, j), cellAt(i - 1, j), cellAt(i, j - 1), cellAt(i - 1, j - 1));
      dc.setXYZW(i * NR + j, SOFT.r, SOFT.g, SOFT.b, al);
    }
    dc.needsUpdate = true;
    this.dirtyLook = false;
  }

  /** 控制笼上的特征曲线(车顶中线 / 腰线),用于叠加"抓整车趋势"的描线 */
  curve(kind: "roof" | "belt"): THREE.Vector3[] {
    if (this.curveCache[kind]) return this.curveCache[kind]!;
    const { nu, nv, p } = this.sm;
    const j = kind === "roof" ? nv / 2 : Math.round((nv * 5) / NR);
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < nu; i++) { const k = (i * nv + j) * 3; out.push(new THREE.Vector3(p[k], p[k + 1], p[k + 2])); }
    this.curveCache[kind] = out;
    return out;
  }

  /** 渲染到 ctx 的指定矩形;返回世界坐标 → 画布坐标的投影函数 */
  render(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cam: CamSpec, pixelScale = 1) {
    const r = getRenderer();
    if (this.dirtyCage) this.refreshGeometry();
    if (this.dirtySurface || this.look.smooth !== this.lastSmooth) this.refreshSurface();
    if (this.dirtyLook) this.refreshLook();
    // 渲染像素尺寸:矩形尺寸 × pixelScale,限制在缓冲区内
    const pw = Math.min(BUF_W, Math.round(w * pixelScale)), ph = Math.min(BUF_H, Math.round(h * pixelScale));
    const c = this.camera;
    c.fov = cam.fov ?? 26; c.aspect = pw / ph;
    const tx = cam.tx ?? 0, ty = cam.ty ?? 0.62, tz = cam.tz ?? 0;
    c.position.set(tx + cam.dist * Math.cos(cam.el) * Math.sin(cam.az), ty + cam.dist * Math.sin(cam.el), tz + cam.dist * Math.cos(cam.el) * Math.cos(cam.az));
    c.lookAt(tx, ty, tz);
    c.updateProjectionMatrix(); c.updateMatrixWorld();
    r.setScissorTest(true);
    r.setViewport(0, 0, pw, ph); r.setScissor(0, 0, pw, ph);
    r.clear();
    r.render(this.scene, c);
    r.setScissorTest(false);
    ctx.drawImage(r.domElement, 0, BUF_H - ph, pw, ph, x, y, w, h);
    this.lastRect = { x, y, w, h };
    const v = new THREE.Vector3();
    return (px: number, py: number, pz: number): [number, number, number] => {
      v.set(px, py, pz).project(c);
      return [x + (v.x * 0.5 + 0.5) * w, y + (1 - (v.y * 0.5 + 0.5)) * h, v.z];
    };
  }
  get rect() { return this.lastRect; }
}

export { CAR };
