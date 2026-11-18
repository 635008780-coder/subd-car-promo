// 成片播放器。整条片子(开场动画 + 网站录屏 + 配音 + 音乐)是流水线一次渲染出来的同一个 mp4,
// 页面只负责播放:不叠实时图层,也不改播放速度(playbackRate 恒为 1)。
import { useEffect, useRef, useState } from "react";
import { NAMES, NEW, fmt, hasVideo, posterUrl, videoUrl } from "../media";

interface Props { onTime: (t: number) => void; seekRef: React.MutableRefObject<(t: number) => void>; onUrl: (u: string) => void }

export default function Player({ onTime, seekRef, onUrl }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState("");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(NEW.duration);
  const [poster] = useState(posterUrl);

  useEffect(() => {
    if (!hasVideo) return;
    let dead = false, url = "";
    videoUrl().then((u) => { if (dead) URL.revokeObjectURL(u); else { url = u; setSrc(u); onUrl(u); } });
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [onUrl]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const v = video.current;
      if (v) { setT(v.currentTime); onTime(v.currentTime); }
      raf = requestAnimationFrame(loop);
    };
    if (playing) raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, onTime]);

  const seek = (s: number, play = false) => {
    const v = video.current; if (!v) return;
    v.currentTime = Math.max(0, Math.min(dur - 0.05, s)); setT(v.currentTime); onTime(v.currentTime);
    if (play) void v.play();
  };
  seekRef.current = (s) => seek(s, true);
  const toggle = () => {
    const v = video.current; if (!v || !src) return;
    if (v.paused) { if (v.ended) v.currentTime = 0; void v.play(); } else v.pause();
  };
  const current = NEW.shots.find((s) => t >= s.start && t < s.end) ?? NEW.shots[NEW.shots.length - 1];

  return (
    <div>
      <div ref={box} className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_40px_100px_rgba(0,0,0,0.55)]">
        <video
          ref={video} src={src || undefined} poster={poster || undefined} className="absolute inset-0 h-full w-full" playsInline preload="auto" muted={muted}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
          onLoadedMetadata={(e) => { e.currentTarget.playbackRate = 1; setDur(e.currentTarget.duration || NEW.duration); }}
        />
        <button type="button" aria-label={playing ? "暂停" : "播放"} onClick={toggle} className="absolute inset-0 flex cursor-pointer items-center justify-center focus-visible:outline-2 focus-visible:outline-[#e8b28a]">
          {!playing && (
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#d18d5f]/95 shadow-[0_10px_40px_rgba(0,0,0,.5)] transition hover:scale-105 hover:bg-[#e8b28a]">
              {src ? <svg viewBox="0 0 24 24" className="ml-1 h-9 w-9 fill-[#11171a]"><path d="M7 4.5v15l13-7.5z" /></svg>
                : <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#11171a]/30 border-t-[#11171a]" />}
            </span>
          )}
        </button>
        {!hasVideo && <div className="absolute inset-x-0 bottom-0 bg-black/70 p-3 text-center text-sm text-amber-100">还没有成片:先执行 node build.mjs all 生成 src/generated/。</div>}
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-[#171e22]/80 px-3 py-2.5">
        <button type="button" onClick={toggle} aria-label="播放 / 暂停" className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#d18d5f] text-[#11171a] transition hover:bg-[#e8b28a]">
          {playing ? <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg> : <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-current"><path d="M7 4.5v15l13-7.5z" /></svg>}
        </button>
        <span className="w-[5.5rem] shrink-0 font-mono text-xs text-[#9fb0b3]">{fmt(t)} / {fmt(dur)}</span>
        <input type="range" min={0} max={dur} step={0.05} value={t} onChange={(e) => seek(parseFloat(e.target.value))} aria-label="进度" className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[#d18d5f]" />
        <span className="hidden shrink-0 rounded-md bg-white/5 px-2 py-1 text-xs text-[#e8b28a] sm:block">{NAMES[current.id]}</span>
        <button type="button" onClick={() => setMuted(!muted)} className="shrink-0 cursor-pointer whitespace-nowrap rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-[#e9ece8] transition hover:border-[#d18d5f]/70">{muted ? "已静音" : "声音开"}</button>
        <button type="button" onClick={() => box.current?.requestFullscreen?.()} className="hidden shrink-0 cursor-pointer whitespace-nowrap rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-[#e9ece8] transition hover:border-[#d18d5f]/70 sm:block">全屏</button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {NEW.shots.map((s) => {
          const on = s.id === current.id;
          return (
            <button key={s.id} type="button" onClick={() => seek(s.start, true)}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs transition ${on ? "border-[#d18d5f] bg-[#d18d5f]/15 text-[#e8b28a]" : "border-white/10 text-[#9fb0b3] hover:border-[#d18d5f]/50 hover:text-[#e9ece8]"}`}>
              <span className="font-mono opacity-70">{fmt(s.start)}</span> {NAMES[s.id]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
