// 开场到"所以,我做了这个网站"之前的四个镜头(A1–A4)。第五版的改法:
//   A1 开场       —— 三维细分曲面车身只在这里亮相一次(转台 + 三句大字)
//   A2 周期痛点   —— 不用车模型,换成情绪化动画(burnout.ts)
//   A3 重复的活儿 —— 不用车模型,时间条 / 翻牌 / 蓝图线稿(repeat.ts)
//   A4 两派建模   —— 沿用修改第一版的体块法、拼接法(schools.ts),结尾加速收拢,整车拼好的那一帧直接接到网站
// 所有节点都取自时间表(schedule.mjs 按口播的逐词时间戳算出的 cue),换配音不用改动画。
// 这份代码由流水线逐帧渲染进成片(pipeline/timeline/index.html 调 window.FormIntro.draw),不是叠在视频上的实时图层。
import { CarRig, type RigLook } from "../car/carScene";
import { SOFT, bigText, clamp, drawBackground, eInOut, eOutCubic, lerp, seg } from "./draw";
import { drawSchools } from "./schools";
import { drawBurnout } from "./burnout";
import { drawRepeat } from "./repeat";

export interface IntroShot { start: number; end: number; cue: number[] }
export interface IntroCfg { A1: IntroShot; A2: IntroShot; A3: IntroShot; A4: IntroShot }
type Ctx = CanvasRenderingContext2D;
const D = Math.PI / 180;

export class IntroFilm {
  private hero: CarRig | null = null;
  private left: CarRig | null = null;
  private right: CarRig | null = null;

  /** 在 ctx(逻辑尺寸 1280×632 的画面区)上画第 t 秒。t 超过 A4 结束时停在最后一帧(给转场用)。 */
  draw(ctx: Ctx, t: number, cfg: IntroCfg, px = 1.5) {
    const tt = Math.max(0, Math.min(t, cfg.A4.end - 1 / 240));
    drawBackground(ctx, tt);
    const id = tt < cfg.A1.end ? "A1" : tt < cfg.A2.end ? "A2" : tt < cfg.A3.end ? "A3" : "A4";
    const sh = cfg[id];
    const lt = tt - sh.start, dur = sh.end - sh.start;
    // 镜头之间:整幅内容向左甩出、下一幅从右侧甩入(0.2 秒),背景不断,看起来是一口气往前走
    const inn = id === "A1" ? 1 : eOutCubic(seg(lt, 0, 0.2));
    const out = id === "A4" ? 0 : eInOut(seg(lt, dur - 0.16, dur));
    ctx.save();
    ctx.translate((1 - inn) * 90 - out * 90, 0);
    if (id === "A1") this.opening(ctx, lt, dur, sh.cue, px);
    else if (id === "A2") drawBurnout(ctx, lt, dur, sh.cue);
    else if (id === "A3") drawRepeat(ctx, lt, dur, sh.cue);
    else this.schools(ctx, tt, sh, px);
    ctx.restore();
    const a = inn * (1 - out);
    if (a < 0.999) { ctx.save(); ctx.globalAlpha = 1 - a; drawBackground(ctx, tt); ctx.restore(); }
  }

  /** A1:控制笼沿车长扫出 → 加密 → 光顺上漆,转台一直在转;三句大字各占一拍 */
  private opening(ctx: Ctx, lt: number, dur: number, cue: number[], px: number) {
    const [c0, c1, c2] = cue;
    const hero = (this.hero ??= new CarRig());
    const toSolid = eInOut(seg(lt, c2, c2 + 1.1));
    const look: RigLook = {
      paint: "white", cageXray: true,
      smooth: eInOut(seg(lt, c2 + 0.05, c2 + 1.0)),
      body: clamp(eInOut(seg(lt, c2 + 0.05, c2 + 1.25)) + 0.16 * seg(lt, c1, c1 + 0.5) * (1 - toSolid)),
      cage: 1 - 0.85 * eInOut(seg(lt, c2 + 0.5, c2 + 1.6)),
      wire1: 0.3 * seg(lt, c1, c1 + 0.5) * (1 - eInOut(seg(lt, c2 + 0.05, c2 + 0.9))),
      fill: 0.5 * seg(lt, c0 + 0.7, c1 + 0.3) * (1 - eInOut(seg(lt, c2, c2 + 0.75))),
      wheels: lt > c0 + 0.5 ? 1 : 0, shadow: seg(lt, c0 + 0.6, c1 + 0.5),
    };
    hero.clip.constant = lt >= c1 ? 100 : lerp(-2.6, 2.7, eInOut(seg(lt, c0, c1)));
    hero.setLook(look);
    const az = lerp(78, 28, eInOut(seg(lt, 0, dur + 0.4))) * D;
    const dist = 6.5 - 0.2 * eOutCubic(seg(lt, c1, c1 + 0.35)) - 0.25 * eOutCubic(seg(lt, c2, c2 + 0.35));
    hero.render(ctx, 190, 232, 900, 390, { az, el: 11 * D, dist, ty: 0.62 }, px);
    if (lt < c1) bigText(ctx, [["汽车造型"]], 150, 108, lt - c0, c1 - c0);
    else if (lt < c2) bigText(ctx, [["第一版 "], ["SubD", SOFT], [" 数据"]], 150, 108, lt - c1, c2 - c1);
    else bigText(ctx, [["再也"], ["不用从零开始", SOFT]], 150, 108, lt - c2, dur - c2 + 0.3);
  }

  /** A4:两派建模。"再做腰线"之后把剩下的搭建过程压缩,赶在镜头结束前拼成整车 */
  private schools(ctx: Ctx, t: number, sh: IntroShot, px: number) {
    const left = (this.left ??= new CarRig()), right = (this.right ??= new CarRig());
    const [c0, c1, c2, c3, c4] = sh.cue.map((c) => sh.start + c);
    const k = 2.25 / Math.max(0.6, sh.end - 0.1 - c4);
    const tt = t <= c4 ? t : c4 + (t - c4) * Math.max(1, k);
    drawSchools(ctx, tt, left, right, { c0, c1, c2, c3, c4 }, 1, px);
  }
}
