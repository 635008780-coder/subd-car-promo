// 节奏对比:原版(仓库 02)和这一版的镜头时间条画在同一把秒尺上。数据都来自两份时间表,不是手填的。
import { NAMES, NEW, OLD, fmt } from "../media";

const MAX = Math.max(NEW.duration, OLD.duration);
const WARM = ["#d18d5f", "#c07f55", "#b0744d", "#a26a46"];
const COOL = ["#6f9aa6", "#628c98", "#577f8a", "#4d727d", "#44666f", "#3c5a63", "#354f57"];
const color = (id: string, i: number) => (id[0] === "A" ? WARM[i % 4] : COOL[(i - 4) % 7]);

function Bar({ label, shots, total, t, onSeek }: { label: string; shots: { id: string; start: number; end: number }[]; total: number; t?: number; onSeek?: (s: number) => void }) {
  const pivot = shots.find((s) => s.id === "B2")!.start;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs text-[#9fb0b3]">
        <span className="text-sm font-bold text-[#e9ece8]">{label}</span>
        <span className="font-mono">前段 {pivot.toFixed(1)} s · 后段 {(total - pivot).toFixed(1)} s · 共 {total.toFixed(1)} s</span>
      </div>
      <div className="relative h-11" style={{ width: `${(total / MAX) * 100}%` }}>
        <div className="flex h-full overflow-hidden rounded-lg">
          {shots.map((s, i) => {
            const d = s.end - s.start;
            const Tag = onSeek ? "button" : "div";
            return (
              <Tag key={s.id} {...(onSeek ? { type: "button" as const, onClick: () => onSeek(s.start), title: `跳到 ${fmt(s.start)} ${NAMES[s.id]}` } : {})}
                className={`relative flex min-w-0 items-center justify-center overflow-hidden border-r border-[#11171a] text-[11px] font-bold text-[#0d1214] last:border-r-0 ${onSeek ? "cursor-pointer transition hover:brightness-125" : ""}`}
                style={{ width: `${(d / total) * 100}%`, background: color(s.id, i) }}>
                <span className="truncate px-1">{d >= 5 ? `${NAMES[s.id]} ${d.toFixed(1)}` : d.toFixed(1)}</span>
              </Tag>
            );
          })}
        </div>
        <div className="pointer-events-none absolute -bottom-1.5 -top-1.5 w-0.5 bg-white" style={{ left: `${(pivot / total) * 100}%` }} />
        {t !== undefined && <div className="pointer-events-none absolute -bottom-1 -top-1 w-[3px] rounded bg-[#ffe1c8] shadow-[0_0_10px_#e8b28a]" style={{ left: `${Math.min(100, (t / total) * 100)}%` }} />}
      </div>
    </div>
  );
}

export default function Pacing({ t, onSeek }: { t: number; onSeek: (s: number) => void }) {
  const gap = (vo: { start: number; dur: number }[], i: number) => vo[i + 1].start - (vo[i].start + vo[i].dur);
  const rows = NEW.shots.map((s) => {
    const o = OLD.shots.find((x) => x.id === s.id)!;
    const a = o.end - o.start, b = s.end - s.start;
    return { id: s.id, a, b, pct: Math.round((b / a - 1) * 100) };
  });
  return (
    <div className="space-y-8">
      <div className="space-y-6 overflow-x-auto rounded-2xl border border-white/10 bg-[#171e22]/70 p-5 sm:p-6">
        <div className="min-w-[640px] space-y-6">
          <Bar label="原版(仓库 02 / 02-01)" shots={OLD.shots} total={OLD.duration} />
          <Bar label="这一版 · 点击色块可跳转" shots={NEW.shots} total={NEW.duration} t={t} onSeek={onSeek} />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[#9fb0b3]">
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#d18d5f]" />前段:开场、痛点、两派</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#6f9aa6]" />后段:网站真实录屏</span>
            <span className="flex items-center gap-1.5"><i className="h-3 w-0.5 bg-white" />“所以，我做了这个网站”</span>
            <span>两条时间条用同一把秒尺,长短可以直接比</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="bg-white/5 text-xs text-[#9fb0b3]">
              <tr><th className="px-4 py-2.5 font-medium">镜头</th><th className="px-3 py-2.5 text-right font-medium">原版</th><th className="px-3 py-2.5 text-right font-medium">这一版</th><th className="px-4 py-2.5 text-right font-medium">变化</th></tr>
            </thead>
            <tbody className="font-mono text-[13px]">
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="px-4 py-2 font-sans text-[#e9ece8]"><span className={`mr-2 inline-block h-2 w-2 rounded-sm ${r.id[0] === "A" ? "bg-[#d18d5f]" : "bg-[#6f9aa6]"}`} />{NAMES[r.id]}</td>
                  <td className="px-3 py-2 text-right text-[#9fb0b3]">{r.a.toFixed(2)} s</td>
                  <td className="px-3 py-2 text-right text-[#e9ece8]">{r.b.toFixed(2)} s</td>
                  <td className={`px-4 py-2 text-right ${r.pct < 0 ? "text-[#e8b28a]" : r.pct > 0 ? "text-[#8fc0cc]" : "text-[#9fb0b3]"}`}>{r.pct > 0 ? "+" : ""}{r.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="min-w-0 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="bg-white/5 text-xs text-[#9fb0b3]">
              <tr><th className="px-4 py-2.5 font-medium">口播</th><th className="px-3 py-2.5 text-right font-medium">原版时长</th><th className="px-3 py-2.5 text-right font-medium">这一版时长</th><th className="px-4 py-2.5 text-right font-medium">句后空拍</th></tr>
            </thead>
            <tbody className="font-mono text-[13px]">
              {NEW.vo.map((v, i) => {
                const o = OLD.vo[i];
                const same = Math.abs(o.dur - v.dur) < 0.01;
                return (
                  <tr key={v.id} className="border-t border-white/5">
                    <td className="max-w-[11rem] truncate px-4 py-2 font-sans text-[#e9ece8]" title={v.text}>{v.text.split(" / ")[0]}…</td>
                    <td className="px-3 py-2 text-right text-[#9fb0b3]">{o.dur.toFixed(2)} s</td>
                    <td className={`px-3 py-2 text-right ${same ? "text-[#e9ece8]" : "text-[#e8b28a]"}`}>{v.dur.toFixed(2)} s{same ? "" : " *"}</td>
                    <td className="px-4 py-2 text-right text-[#9fb0b3]">{i < NEW.vo.length - 1 ? `${gap(OLD.vo, i).toFixed(2)} → ${gap(NEW.vo, i).toFixed(2)} s` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-white/5 px-4 py-3 text-xs leading-relaxed text-[#9fb0b3]">
            每句口播都是同一个音色、同一个语速重新合成后,原样放到新的时间点上,时长和原版逐句一致,没有做任何变速。
            带 * 的那一句只把稿子里“一天一版”后面的句号换成了逗号,停顿短了约半秒,字和语速没变。
          </p>
        </div>
      </div>
    </div>
  );
}
