import { useCallback, useRef, useState } from "react";
import Player from "./components/Player";
import Pacing from "./components/Pacing";
import { NEW, OLD, facts, srtText } from "./media";

const pivotNew = NEW.shots.find((s) => s.id === "B2")!.start;
const pivotOld = OLD.shots.find((s) => s.id === "B2")!.start;
const backNew = NEW.duration - pivotNew, backOld = OLD.duration - pivotOld;
const pct = (a: number, b: number) => `${b > a ? "+" : "−"}${Math.abs(Math.round((b / a - 1) * 100))}%`;

const CARDS: { tag: string; title: string; tone: string; items: string[] }[] = [
  {
    tag: "前段 · 收紧", title: "“所以我做了这个网站”之前", tone: "#d18d5f",
    items: [
      "口播一句接一句：句间空拍从 1 秒左右收到 0.5–0.6 秒，镜头长度只取到半拍。",
      "三维车身只在开场亮相一次（4 秒），后面不再反复出现。",
      "周期痛点改成情绪动画：钟越转越快、四壁往里挤、“再来一版”一张张砸下来，电量见底，人一头栽在键盘上；到“正常三到五天”压力才松开。",
      "重复的活儿不用车模型：时间条 → 一版一版翻牌 → 蓝图上拉尺寸线 → 反复描趋势线，一句话换一个画面。",
      "两派建模沿用修改第一版的体块法、拼接法，“再做腰线”之后加速收拢，赶在接缝前拼成整车。",
    ],
  },
  {
    tag: "后段 · 放慢", title: "网站真实录屏", tone: "#6f9aa6",
    items: [
      "整段对线上网站重新逐帧录制，不是把旧视频放慢：光标移动更从容，每个滑块拖得更慢。",
      "每调完一个参数多停 0.2–0.3 秒，让人看清车身变了什么再往下走。",
      "8 个标准车型连点，从每个约 0.5 秒放到约 0.8 秒。",
      "口播晚半拍进，先看清画面再开口；镜头跟随光标的提前量从 0.7 秒加到 1.2 秒，切镜时的冲击和模糊收小。",
    ],
  },
  {
    tag: "接缝 · 抹平", title: "不再是两段硬拼", tone: "#e8b28a",
    items: [
      "匹配转场：拼接法刚拼好的整车，朝网站视口里那台车的位置推过去并化开，浏览器窗口同时从略小处推近淡入——同一个运动方向，没有白闪，也没有空一拍的字幕卡。",
      "音乐全片一套律动：原来前段半拍速、网站一登场就切到十六分琶音，前慢后快有一半是音乐造成的。现在前段就用四分底鼓往前推，登场第一小节抽掉鼓让画面落下来，后段琶音减成八分。",
      "开场动画和录屏在同一条流水线里一次渲染成同一个 mp4：同样的分辨率、帧率、压缩，不再是实时画布盖在视频上。",
    ],
  },
];

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-[#171e22]/70 px-4 py-3.5">
      <div className="text-xs text-[#9fb0b3]">{k}</div>
      <div className="mt-1 text-lg font-black tracking-tight text-[#f3f4f0] sm:text-xl">{v}</div>
      {sub && <div className="mt-0.5 text-xs text-[#869296]">{sub}</div>}
    </div>
  );
}

export default function App() {
  const [t, setT] = useState(0);
  const [url, setUrl] = useState("");
  const seekRef = useRef<(s: number) => void>(() => {});
  const onTime = useCallback((x: number) => setT(x), []);
  const onUrl = useCallback((u: string) => setUrl(u), []);
  const seek = (s: number) => { seekRef.current(s); document.getElementById("film")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const saveSrt = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([srtText()], { type: "text/plain;charset=utf-8" }));
    a.download = "FORM_promo_v5_captions.srt"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const w = facts?.web;

  return (
    <div className="min-h-screen bg-[#11171a] text-[#e9ece8] antialiased" style={{ fontFamily: '"Noto Sans SC","PingFang SC","Microsoft YaHei","Source Han Sans SC",system-ui,sans-serif' }}>
      <div className="pointer-events-none fixed inset-0" style={{ background: "radial-gradient(900px 520px at 78% -8%, rgba(209,141,95,.17), transparent 70%), radial-gradient(700px 480px at 4% 96%, rgba(96,134,146,.14), transparent 70%)" }} />
      <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
        <header className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-xs tracking-[0.2em] text-[#d18d5f]">
            <span className="font-bold">FORM SUBDIVISION STUDIO</span><span className="text-[#869296]">宣传片 · 第五版</span>
          </div>
          <h1 className="mt-4 text-4xl font-black leading-[1.15] tracking-tight text-white sm:text-5xl">前段收紧，后段放慢，<br className="hidden sm:block" /><span className="text-[#e8b28a]">接缝抹平</span></h1>
          <p className="mt-4 text-base leading-relaxed text-[#b7c4c6]">
            在仓库 02 的流水线和 02-01 的三维开场基础上重调了整片节奏。整条片子从代码重新录制、重新渲染成一个新的 mp4；
            配音按原来的音色和语速重新合成后原样摆放，没有任何变速、变调。
          </p>
        </header>

        <section id="film" className="mt-9 scroll-mt-6">
          <Player onTime={onTime} seekRef={seekRef} onUrl={onUrl} />
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <a href={url || undefined} download="FORM_promo_v5_720p.mp4" aria-disabled={!url}
              className={`rounded-lg px-4 py-2.5 font-bold transition ${url ? "bg-[#d18d5f] text-[#11171a] hover:bg-[#e8b28a]" : "pointer-events-none bg-white/10 text-[#869296]"}`}>
              下载成片 mp4{w ? `（${(w.bytes / 1048576).toFixed(1)} MB）` : ""}
            </a>
            <button type="button" onClick={saveSrt} className="cursor-pointer rounded-lg border border-white/15 px-4 py-2.5 text-[#e9ece8] transition hover:border-[#d18d5f]/70">下载字幕 srt</button>
            <span className="text-xs text-[#869296]">播放速度恒为 1×；想看节奏变化，直接对照下面的时间条。</span>
          </div>
        </section>

        <section className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat k="前段（到“所以我做了这个网站”）" v={`${pivotOld.toFixed(1)} → ${pivotNew.toFixed(2)} s`} sub={`${pct(pivotOld, pivotNew)}，口播一字未删`} />
          <Stat k="后段（网站录屏）" v={`${backOld.toFixed(1)} → ${backNew.toFixed(1)} s`} sub={`${pct(backOld, backNew)}，重新录制`} />
          <Stat k="全片" v={`${OLD.duration} → ${NEW.duration} s`} sub="比原版长了，见文末说明" />
          <Stat k="配音" v={`${NEW.voice.name?.replace("zh-CN-", "").replace("Neural", "") ?? "—"} ${NEW.voice.rate ?? ""}`} sub={`共 ${NEW.voice.seconds.toFixed(1)} s，原速原调`} />
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-black tracking-tight text-white">节奏对比</h2>
          <p className="mb-6 mt-2 max-w-3xl text-sm leading-relaxed text-[#9fb0b3]">上面一条是原版，下面一条是这一版，白线是“所以，我做了这个网站”。前段的色块变窄了，后段每一块都变宽了。</p>
          <Pacing t={t} onSeek={seek} />
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-black tracking-tight text-white">这一版改了什么</h2>
          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            {CARDS.map((c) => (
              <article key={c.tag} className="min-w-0 rounded-2xl border border-white/10 bg-[#171e22]/70 p-6">
                <div className="text-xs font-bold tracking-[0.18em]" style={{ color: c.tone }}>{c.tag}</div>
                <h3 className="mt-2 text-lg font-black text-white">{c.title}</h3>
                <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[#b7c4c6]">
                  {c.items.map((s) => (<li key={s} className="flex gap-2.5"><i className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.tone }} /><span>{s}</span></li>))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-5 lg:grid-cols-2">
          <article className="min-w-0 rounded-2xl border border-white/10 bg-[#171e22]/70 p-6">
            <h2 className="text-lg font-black text-white">声音：没有变速，没有变调</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[#b7c4c6]">
              <li>没有用仓库里现成的 promo_720p.mp4，也没有改任何播放速度。画面是逐帧重新渲染的，声音是重新合成、重新混的。</li>
              <li>十句口播各自是一个独立的音频文件，调节奏只是改它们在时间轴上的起点和句间的空拍，音频本身按 1:1 放进混音。</li>
              <li>音色和语速与原版相同（{NEW.voice.name} {NEW.voice.rate}）。上表里九句的时长与原版逐句相同，可以直接核对。</li>
              <li>音乐和音效由代码按新的时间表重新合成（{facts?.audio.bpm ?? 120} BPM，全片同速）{w ? `，成片响度 ${w.loudness.lufs} LUFS、真峰值 ${w.loudness.truePeak} dBTP` : ""}。</li>
            </ul>
          </article>
          <article className="min-w-0 rounded-2xl border border-white/10 bg-[#171e22]/70 p-6">
            <h2 className="text-lg font-black text-white">怎么重新出片</h2>
            <pre className="mt-4 overflow-x-auto rounded-lg bg-black/40 p-4 text-[12.5px] leading-relaxed text-[#e8b28a]"><code>{`bash pipeline/setup.sh   # ffmpeg、字体、Playwright、edge-tts
node build.mjs all       # 录制→配音→时间表→混音→渲染→内嵌
npm run build            # 生成这个页面`}</code></pre>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-[#b7c4c6]">
              <li><b className="text-[#e9ece8]">前段节奏</b>：pipeline/schedule.mjs 里的 LEAD（每句口播的起点）和各镜头的留白。</li>
              <li><b className="text-[#e9ece8]">后段节奏</b>：pipeline/record.mjs 顶部的 two / one / quick 三档拖动速度和各处 hold。</li>
              <li><b className="text-[#e9ece8]">开场动画</b>：src/intro/（film.ts 总控，burnout.ts 情绪动画，repeat.ts 重复的活儿）。</li>
              <li><b className="text-[#e9ece8]">接缝与镜头</b>：pipeline/timeline/index.html 里的 R.B2 和 realShot。</li>
            </ul>
          </article>
        </section>

        <section className="mt-16 rounded-2xl border border-white/10 bg-[#171e22]/40 p-6 text-sm leading-relaxed text-[#9fb0b3]">
          <h2 className="text-base font-black text-[#e9ece8]">需要你知道的几件事</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>全片从 {OLD.duration} 秒变成 {NEW.duration} 秒。前段受口播长度限制只能收紧约 {(pivotOld - pivotNew).toFixed(1)} 秒（提速主要靠画面切得更勤），后段放慢约三分之一，所以总时长变长了。想压回 75 秒左右，最直接的办法是在 record.mjs 里少演示一两个参数。</li>
            <li>配音仍是 AI 合成语音（微软 Edge 在线朗读，不是真人录音，也不是对外授权的商用渠道）。正式发布建议换成自己的录音：放进 assets/audio/ 后重跑时间表即可，动画节点会跟着走。</li>
            <li>这次只渲染了页面内嵌的 1280×720 · 30 帧版本{w ? `（${w.video.frames} 帧，${w.kbps} kbps）` : ""}。1080p 和 60 帧主版本没有出，需要时执行 node build.mjs hd master；四款封面也没有重做。</li>
            <li>后段镜头是 {facts ? `本次重新录制的 ${facts.record.clips.length} 段` : "重新录制的"}线上网站真实录屏（form-cc-studio.netlify.app），录制时隐藏了托管平台的浮标，界面内容没有改动。</li>
            <li>我是通过抽帧检查画面的，没有办法实际听一遍成片；响度和人声/背景比来自混音脚本的实测数据。接缝和情绪动画的观感，请以你自己看一遍为准。</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
