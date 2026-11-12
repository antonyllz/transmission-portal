import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconX,
  IconCheck,
  IconCircleCheck,
  IconClockHour4,
  IconBolt,
  IconRouteOff,
  IconTemperature,
  IconWifiOff,
  IconWaveSine,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { fmtClock, fmtDuration, useNow } from "@/hooks/use-now";
import {
  fetchNetworkSnapshot,
  placeName,
  type AlarmSeverity,
  type Locality,
  type NetworkSnapshot,
  type NodeRef,
  type PadtecAlarm,
  type PadtecCategory,
  type Trecho,
  type DwdmAlarm,
  type ZbxSeverity,
  ackDwdm,
  dwdmAcked,
} from "@/data/network-events";

const REFRESH_MS = 15_000;

function useNetworkSnapshot() {
  const [snap, setSnap] = useState<NetworkSnapshot | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchNetworkSnapshot()
        .then((s) => {
          if (!alive) return;
          setSnap(s);
          setError(false);
        })
        .catch((e) => {
          console.error("Network events unavailable:", e);
          if (alive) setError(true);
        });
    load();
    const t = setInterval(load, REFRESH_MS);
    window.addEventListener("net-refresh", load);   /* e.g. right after acknowledging an alarm */
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("net-refresh", load);
    };
  }, []);
  return { snap, error };
}

const SEVERITY: Record<AlarmSeverity, { label: string; cls: string }> = {
  critical: { label: "Crítico", cls: "bg-[#dc2626]/10 text-[#dc2626] dark:bg-[#ff453a]/15 dark:text-[#ff6b61]" },
  major: { label: "Maior", cls: "bg-[#ea580c]/10 text-[#ea580c] dark:bg-[#ff9f0a]/15 dark:text-[#ffb340]" },
  minor: { label: "Menor", cls: "bg-[#ca8a04]/10 text-[#a16207] dark:bg-[#ffd60a]/15 dark:text-[#ffd60a]" },
  warning: { label: "Aviso", cls: "bg-black/[.05] text-[#6e6e73] dark:bg-white/10 dark:text-[#aeaeb2]" },
};

const CATEGORY: Record<PadtecCategory, { label: string; icon: React.ReactNode; cls: string }> = {
  energia: {
    label: "Energia",
    icon: <IconBolt />,
    cls: "bg-[#ca8a04]/12 text-[#a16207] dark:bg-[#ffd60a]/15 dark:text-[#ffd60a]",
  },
  temperatura: {
    label: "Temperatura",
    icon: <IconTemperature />,
    cls: "bg-[#ea580c]/10 text-[#ea580c] dark:bg-[#ff9f0a]/15 dark:text-[#ffb340]",
  },
  resposta: {
    label: "Sem resposta",
    icon: <IconWifiOff />,
    cls: "bg-[#7c3aed]/10 text-[#7c3aed] dark:bg-[#bf5af2]/15 dark:text-[#d08bf7]",
  },
};

const card =
  "rounded-2xl border border-black/[.07] bg-white shadow-[0_1px_3px_rgba(0,0,0,.04),0_4px_16px_rgba(0,0,0,.05)] dark:border-white/[.08] dark:bg-[#1c1c1e] dark:shadow-none";
const muted = "text-[#6e6e73] dark:text-[#8e8e93]";
const strong = "text-[#1d1d1f] dark:text-[#f5f5f7]";

export function NetworkEventsDashboard() {
  const { snap, error } = useNetworkSnapshot();
  const now = useNow(30_000);
  const [expanded, setExpanded] = useState(false);

  if (!snap) {
    return error ? (
      <div className={cn(card, "flex items-center gap-3 p-5 text-sm", muted)}>
        <IconAlertTriangle className="h-5 w-5 text-[#ea580c]" />
        Não foi possível carregar os eventos da rede (API indisponível). Tentando de novo a cada {REFRESH_MS / 1000}s.
      </div>
    ) : (
      <div className={cn(card, "h-[280px] animate-pulse")} aria-busy="true" />
    );
  }

  const down = snap.trechos.length;
  const padtecN = snap.padtecAlarms.length;
  const dwdmN = snap.dwdm.active.filter((a) => !dwdmAcked(a)).length;
  const oldest = snap.trechos[0]?.since ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* ── segments first ── */}
      <section className={cn(card, "p-5")}>
        <PanelHead
          title="Trechos down"
          count={down}
          hint="Zabbix"
          action={<ExpandButton onClick={() => setExpanded(true)} />}
        />
        <TrechoGrid trechos={snap.trechos} locs={snap.localities} now={now} />
        <Resolved list={snap.resolved} locs={snap.localities} />
      </section>
      <AnimatePresence>
        {expanded && <TrechosFull snap={snap} now={now} onClose={() => setExpanded(false)} />}
      </AnimatePresence>

      {/* ── DWDM Padtec ── */}
      <DwdmPanel snap={snap} now={now} />

      {/* ── KPIs ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<IconRouteOff />} label="Trechos down" value={down} tone={down ? "red" : "ok"} />
        <Kpi icon={<IconWaveSine />} label="Alarmes DWDM Padtec" value={dwdmN} tone={dwdmN ? "red" : "ok"} />
        <Kpi icon={<IconAlertTriangle />} label="Alarmes de infra Padtec" value={padtecN} tone={padtecN ? "orange" : "ok"} />
        <Kpi icon={<IconClockHour4 />} label="Trecho down mais antigo" value={oldest ? fmtDuration(now - Date.parse(oldest)) : "—"} tone="blue" />
      </div>

      <PadtecPanel snap={snap} now={now} />
    </div>
  );
}

function PadtecPanel({ snap, now }: { snap: NetworkSnapshot; now: number }) {
  const [filter, setFilter] = useState<PadtecCategory | "all">("all");
  const all = snap.padtecAlarms;
  const shown = filter === "all" ? all : all.filter((a) => a.category === filter);
  const st = snap.padtec;
  const status = !st.configured
    ? "NMS não configurado (sem token)"
    : !st.ok
      ? `Falha ao consultar o NMS${st.error ? ` (${st.error})` : ""}${st.updatedAt ? ` · dados de ${fmtClock(st.updatedAt)}` : ""}`
      : st.updatedAt
        ? `Atualizado às ${fmtClock(st.updatedAt)}`
        : "Aguardando a primeira consulta";
  return (
    <section className={cn(card, "p-5")}>
      <PanelHead title="Alarmes de infra Padtec" count={all.length} hint="NMS Padtec" />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {(["all", "energia", "temperatura", "resposta"] as const).map((k) => {
          const n = k === "all" ? all.length : all.filter((a) => a.category === k).length;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                filter === k
                  ? "border-transparent bg-[#1d1d1f] text-white dark:bg-[#f5f5f7] dark:text-[#1d1d1f]"
                  : "border-black/10 text-[#3a3a3c] hover:border-black/20 dark:border-white/10 dark:text-[#d1d1d6] dark:hover:border-white/25",
              )}
            >
              {k === "all" ? "Todos" : CATEGORY[k].label} <b className="ml-0.5 font-semibold opacity-50">{n}</b>
            </button>
          );
        })}
        <span className={cn("ml-auto text-[11px]", !st.ok || !st.configured ? "text-[#ea580c]" : muted)}>{status}</span>
      </div>
      <ul className="mt-3 grid gap-2 lg:grid-cols-2">
        <AnimatePresence initial={false}>
          {shown.map((a, i) => (
            <AlarmRow key={a.id} al={a} now={now} i={i} />
          ))}
        </AnimatePresence>
        {!shown.length && <Empty text={all.length ? "Nenhum alarme nesta categoria" : "Nenhum alarme Padtec de energia, temperatura ou resposta"} />}
      </ul>
    </section>
  );
}

/* ═════════════ pieces ═════════════ */
function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone: "red" | "orange" | "blue" | "ok";
}) {
  const toneCls = {
    red: "text-[#dc2626] bg-[#dc2626]/10 dark:text-[#ff6b61] dark:bg-[#ff453a]/15",
    orange: "text-[#ea580c] bg-[#ea580c]/10 dark:text-[#ffb340] dark:bg-[#ff9f0a]/15",
    blue: "text-tely-blue bg-tely-blue/10 dark:text-tely-blue-light dark:bg-tely-blue/25",
    ok: "text-[#16a34a] bg-[#16a34a]/10 dark:text-[#30d158] dark:bg-[#30d158]/15",
  }[tone];
  return (
    <div className={cn(card, "flex items-center gap-3 p-4")}>
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl [&>svg]:h-5 [&>svg]:w-5", toneCls)}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className={cn("text-[22px] leading-none font-semibold tracking-tight tabular-nums", strong)}>{value}</div>
        <div className={cn("mt-1 truncate text-xs", muted)}>{label}</div>
      </div>
    </div>
  );
}

function PanelHead({
  title,
  count,
  hint,
  badge,
  action,
}: {
  title: string;
  count: number;
  hint: string;
  badge?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h3 className={cn("text-[15px] font-semibold tracking-tight", strong)}>{title}</h3>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
          count ? "bg-[#dc2626] text-white" : "bg-[#f5f5f7] text-[#6e6e73] dark:bg-[#2c2c2e] dark:text-[#8e8e93]",
        )}
      >
        {count}
      </span>
      {badge && (
        <span className="rounded-full bg-[#ca8a04]/12 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#a16207] uppercase dark:bg-[#ffd60a]/15 dark:text-[#ffd60a]">
          {badge}
        </span>
      )}
      <span className="ml-auto text-[11px] font-medium tracking-wide text-[#aeaeb2] uppercase dark:text-[#636366]">{hint}</span>
      {action}
    </div>
  );
}

/* one end of a segment: city name (or the raw code, flagged, when it isn't registered yet) */
function Place({ n, locs }: { n: NodeRef | null; locs: Record<string, Locality> }) {
  if (!n) return <span className={muted}>ponta não identificada</span>;
  const known = !!locs[n.key];
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1">
      {known ? (
        <span className="truncate">{placeName(n, locs)}</span>
      ) : (
        <span title="Localidade sem nome cadastrado" className="truncate font-mono text-[#ca8a04] dark:text-[#ffd60a]">
          {n.key}
        </span>
      )}
      <span className="shrink-0 rounded bg-black/[.06] px-1 py-px text-[10px] font-bold text-[#6e6e73] dark:bg-white/10 dark:text-[#aeaeb2]">
        {n.uf}
      </span>
    </span>
  );
}

const rowMotion = (i: number) => ({
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0, transition: { delay: 0.04 * i } },
  exit: { opacity: 0, x: 10 },
});

/* grid of segment tiles (home panel and the expanded view) */
function TrechoGrid({ trechos, locs, now, big = false }: { trechos: Trecho[]; locs: Record<string, Locality>; now: number; big?: boolean }) {
  if (!trechos.length)
    return (
      <ul className={big ? "mt-6" : "mt-3"}>
        <Empty text="Nenhum trecho down na rede" />
      </ul>
    );
  return (
    <ul
      className={cn(
        "grid gap-2.5",
        big ? "mt-6 grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-3" : "mt-3 grid-cols-[repeat(auto-fill,minmax(210px,1fr))]",
      )}
    >
      <AnimatePresence initial={false}>
        {trechos.map((t, i) => (
          <TrechoTile key={t.key} t={t} locs={locs} now={now} i={i} big={big} />
        ))}
      </AnimatePresence>
    </ul>
  );
}

/* one segment as a compact tile: both ends, since when, for how long.
   Hovering shows the Zabbix trigger(s) — several links between the same
   two cities (Fortaleza × Natal…) only differ there. */
function TrechoTile({ t, locs, now, i, big }: { t: Trecho; locs: Record<string, Locality>; now: number; i: number; big: boolean }) {
  const sameSite = !!(t.a && t.b && t.a.key === t.b.key);
  const ref = useRef<HTMLLIElement>(null);
  const [hover, setHover] = useState(false);
  const links = t.events.length;
  return (
    <motion.li
      ref={ref}
      layout
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1, transition: { delay: 0.03 * i } }}
      exit={{ opacity: 0, scale: 0.94 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        "relative flex cursor-default flex-col gap-2 rounded-xl border border-[#dc2626]/25 bg-[#dc2626]/[.045] transition-colors hover:border-[#dc2626]/60 hover:bg-[#dc2626]/[.08] dark:border-[#ff453a]/25 dark:bg-[#ff453a]/[.07] dark:hover:border-[#ff453a]/60",
        big ? "p-4 pt-[18px]" : "p-3 pt-3.5",
      )}
    >
      <span className="absolute inset-x-0 top-0 h-[3px] rounded-t-xl bg-[#dc2626]" aria-hidden="true" />
      {links > 1 && (
        <span
          title={`${links} links down neste trecho`}
          className="absolute top-2 right-2 rounded-full bg-[#dc2626] px-1.5 py-px text-[10px] font-bold text-white tabular-nums"
        >
          ×{links}
        </span>
      )}
      <div className={cn("flex min-w-0 flex-col gap-0.5 leading-tight font-semibold", big ? "text-[15px]" : "text-[13px]", links > 1 && "pr-7", strong)}>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#dc2626] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#dc2626]" />
          </span>
          {t.a ? <Place n={t.a} locs={locs} /> : <span className="truncate font-mono">{t.events[0].host}</span>}
        </span>
        {t.b || sameSite ? (
          <span className="flex min-w-0 items-center gap-1.5 pl-[3px]">
            <span className={cn("shrink-0 text-[11px]", muted)}>{sameSite ? "interno" : "↔"}</span>
            {!sameSite && <Place n={t.b} locs={locs} />}
          </span>
        ) : (
          /* far end not named in the trigger: show what the alarm says instead */
          <span className={cn("truncate pl-[3px] font-mono text-[11px] font-normal", muted)}>
            {[t.events[0].iface, t.events[0].speed].filter(Boolean).join(" · ") || t.events[0].trigger}
          </span>
        )}
      </div>
      {/* expanded view: the interfaces are always visible, one line per link */
      big && (
        <ul className={cn("flex flex-col gap-0.5 font-mono text-[11px]", muted)}>
          {t.events.map((e) => (
            <li key={e.id} className="break-all">
              {e.host.split(" ")[0]} · {[e.iface, e.speed].filter(Boolean).join(" ") || e.trigger}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex items-end justify-between gap-2">
        <span className={cn("text-[11px] leading-tight", muted)}>
          desde {fmtClock(t.since)}
          {t.acknowledged && <span className="block text-[#16a34a] dark:text-[#30d158]">reconhecido</span>}
        </span>
        <span className={cn("leading-none font-bold text-[#dc2626] tabular-nums dark:text-[#ff6b61]", big ? "text-[20px]" : "text-[17px]")}>
          {fmtDuration(now - Date.parse(t.since))}
        </span>
      </div>
      <AnimatePresence>{hover && <TrechoTip t={t} anchor={ref} now={now} />}</AnimatePresence>
    </motion.li>
  );
}

/* hover card with the raw Zabbix data of each link of the segment. Rendered in a
   portal (fixed position, kept inside the viewport) so the grid never clips it;
   inside the browser full screen it goes into the full-screen element. */
function TrechoTip({ t, anchor, now }: { t: Trecho; anchor: React.RefObject<HTMLLIElement | null>; now: number }) {
  const tip = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  useLayoutEffect(() => {
    const r = anchor.current?.getBoundingClientRect();
    const w = tip.current?.offsetWidth ?? 360, h = tip.current?.offsetHeight ?? 120;
    if (!r) return;
    const x = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    const below = r.bottom + h + 16 < window.innerHeight || r.top - h - 16 < 0;
    setPos({ x, y: below ? r.bottom + 8 : r.top - h - 8, below });
  }, [anchor, t.events.length]);
  const codes = t.a && t.b ? `${t.a.key} × ${t.b.key}` : (t.a?.key ?? "");
  return createPortal(
    <motion.div
      ref={tip}
      initial={{ opacity: 0, y: pos?.below === false ? 6 : -6, scale: 0.97 }}
      animate={{ opacity: pos ? 1 : 0, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }}
      transition={{ type: "spring", stiffness: 500, damping: 32 }}
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? 0 }}
      className="portal-isl pointer-events-none fixed z-[300] w-max max-w-[min(440px,calc(100vw-24px))] rounded-xl border border-black/10 bg-white/95 p-3 text-[12px] shadow-[0_10px_40px_rgba(0,0,0,.18)] backdrop-blur-md dark:border-white/10 dark:bg-[#2c2c2e]/95"
    >
      {codes && <div className="mb-2 font-mono text-[11px] font-semibold tracking-wide text-[#0649fc] dark:text-[#6b93ff]">{codes}</div>}
      <ul className="flex flex-col gap-2">
        {t.events.map((e) => (
          <li key={e.id} className="flex flex-col gap-0.5 border-l-2 border-[#dc2626] pl-2">
            <span className={cn("leading-snug font-medium break-words", strong)}>{e.trigger}</span>
            <span className={cn("font-mono text-[11px] break-all", muted)}>{e.host}</span>
            <span className={cn("text-[11px]", muted)}>
              desde {fmtClock(e.start)} · {fmtDuration(now - Date.parse(e.start))}
              {e.acknowledged && <span className="text-[#16a34a] dark:text-[#30d158]"> · reconhecido</span>}
            </span>
          </li>
        ))}
      </ul>
    </motion.div>,
    document.fullscreenElement ?? document.body,
  );
}

/* "expand" button: four corners that spread out on hover */
function ExpandButton({ onClick }: { onClick: () => void }) {
  const corners = ["M4 9V4h5", "M15 4h5v5", "M20 15v5h-5", "M9 20H4v-5"];
  const out = [
    { x: -1.5, y: -1.5 },
    { x: 1.5, y: -1.5 },
    { x: 1.5, y: 1.5 },
    { x: -1.5, y: 1.5 },
  ];
  return (
    <motion.button
      type="button"
      onClick={onClick}
      title="Expandir trechos down (tela cheia)"
      aria-label="Expandir trechos down"
      initial="rest"
      whileHover="hover"
      whileTap="tap"
      className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-[#6e6e73] transition-colors hover:bg-[#0649fc]/10 hover:text-[#0649fc] dark:text-[#8e8e93] dark:hover:bg-[#6b93ff]/15 dark:hover:text-[#6b93ff]"
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {corners.map((d, k) => (
          <motion.path
            key={d}
            d={d}
            variants={{
              rest: { x: 0, y: 0 },
              hover: { x: [0, out[k].x, out[k].x * 0.6], y: [0, out[k].y, out[k].y * 0.6], transition: { duration: 0.45 } },
              tap: { x: out[k].x * 1.6, y: out[k].y * 1.6 },
            }}
          />
        ))}
        <motion.rect
          x={9.5}
          y={9.5}
          width={5}
          height={5}
          rx={1}
          fill="currentColor"
          stroke="none"
          variants={{ rest: { scale: 0.6, opacity: 0.5 }, hover: { scale: 1, opacity: 1 }, tap: { scale: 1.3 } }}
          style={{ transformOrigin: "12px 12px" }}
        />
      </svg>
    </motion.button>
  );
}

/* full-screen view of every segment down (browser full screen when allowed);
   Esc or the X closes it. Keeps refreshing with the dashboard. */
function TrechosFull({ snap, now, onClose }: { snap: NetworkSnapshot; now: number; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const clock = useNow(1000);
  useEffect(() => {
    const el = box.current;
    let wasFull = false;
    const onFs = () => {
      if (document.fullscreenElement === el) wasFull = true;
      else if (wasFull) onClose();                     /* left the browser full screen (Esc) */
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.fullscreenElement && onClose();
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("keydown", onKey);
    el?.requestFullscreen?.().catch(() => {});        /* not allowed → stays as an overlay */
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("keydown", onKey);
      if (document.fullscreenElement === el) document.exitFullscreen().catch(() => {});
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  const n = snap.trechos.length;
  return createPortal(
    <motion.div
      ref={box}
      role="dialog"
      aria-modal="true"
      aria-label="Trechos down"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.22 }}
      className="portal-isl fixed inset-0 z-[280] overflow-y-auto bg-[#f5f5f7] px-5 py-6 sm:px-10 sm:py-8 dark:bg-[#0b0b0d]"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="relative flex h-3 w-3">
          {n > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#dc2626] opacity-60" />}
          <span className={cn("relative inline-flex h-3 w-3 rounded-full", n ? "bg-[#dc2626]" : "bg-[#16a34a]")} />
        </span>
        <h2 className={cn("text-[22px] font-bold tracking-tight sm:text-[26px]", strong)}>Trechos down</h2>
        <span
          className={cn(
            "rounded-full px-3 py-0.5 text-[16px] font-bold tabular-nums",
            n ? "bg-[#dc2626] text-white" : "bg-[#16a34a]/15 text-[#16a34a]",
          )}
        >
          {n}
        </span>
        <span className={cn("ml-auto text-[13px] tabular-nums", muted)}>
          {new Date(clock).toLocaleTimeString("pt-BR")} · atualiza a cada {REFRESH_MS / 1000}s
        </span>
        <motion.button
          type="button"
          onClick={onClose}
          title="Fechar (Esc)"
          aria-label="Fechar"
          whileHover={{ rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/[.06] text-[#1d1d1f] hover:bg-black/10 dark:bg-white/10 dark:text-[#f5f5f7] dark:hover:bg-white/15"
        >
          <IconX className="h-5 w-5" />
        </motion.button>
      </div>
      <TrechoGrid trechos={snap.trechos} locs={snap.localities} now={now} big />
    </motion.div>,
    document.body,
  );
}

function Resolved({ list, locs }: { list: Trecho[]; locs: Record<string, Locality> }) {
  const [open, setOpen] = useState(false);
  if (!list.length) return null;
  return (
    <div className="mt-3 border-t border-black/[.06] pt-3 dark:border-white/[.06]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn("flex w-full items-center gap-2 text-xs font-semibold", muted)}
      >
        <IconCircleCheck className="h-4 w-4 text-[#16a34a] dark:text-[#30d158]" />
        Normalizados nas últimas 24h · {list.length}
        <IconChevronDown className={cn("ml-auto h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex flex-col gap-1 overflow-hidden pt-2"
          >
            {list.map((t) => (
              <li key={t.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-black/[.03] dark:hover:bg-white/[.04]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#16a34a] dark:bg-[#30d158]" />
                <span className={cn("flex min-w-0 flex-1 items-center gap-1.5 font-medium", strong)}>
                  <Place n={t.a} locs={locs} />
                  {t.b && t.a?.key !== t.b.key && (
                    <>
                      <span className={muted}>↔</span>
                      <Place n={t.b} locs={locs} />
                    </>
                  )}
                </span>
                <span className={cn("shrink-0 tabular-nums", muted)}>
                  {fmtClock(t.since)} → {t.until ? fmtClock(t.until) : "—"}
                  {t.until && ` · ${fmtDuration(Date.parse(t.until) - Date.parse(t.since))}`}
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function AlarmRow({ al, now, i }: { al: PadtecAlarm; now: number; i: number }) {
  const sev = SEVERITY[al.severity];
  const cat = CATEGORY[al.category];
  return (
    <motion.li
      layout
      {...rowMotion(i)}
      className="flex items-center gap-3 rounded-xl border border-black/[.06] bg-[#f5f5f7]/60 p-3 transition-colors hover:bg-[#f5f5f7] dark:border-white/[.06] dark:bg-[#2c2c2e]/50 dark:hover:bg-[#2c2c2e]"
    >
      <div
        title={cat.label}
        className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg [&>svg]:h-[18px] [&>svg]:w-[18px]", cat.cls)}
      >
        {cat.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-[13px] font-semibold", strong)}>{al.name}</div>
        <div className={cn("mt-0.5 truncate text-xs", muted)}>
          {al.site || "—"}
          <span className="font-mono"> · {al.card}</span>
          {al.resource && ` · ${al.resource}`}
        </div>
        <div className="mt-0.5 text-[11px] text-[#aeaeb2] dark:text-[#636366]">
          {al.start ? `desde ${fmtClock(al.start)}` : "início desconhecido"}
          {al.acknowledged && <span className="text-[#16a34a] dark:text-[#30d158]"> · reconhecido</span>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", sev.cls)}>{sev.label}</span>
        {al.start && (
          <span className={cn("text-xs font-medium tabular-nums", strong)}>{fmtDuration(now - Date.parse(al.start))}</span>
        )}
      </div>
    </motion.li>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <li className={cn("flex items-center gap-2 rounded-xl border border-dashed border-black/10 p-4 text-sm dark:border-white/10", muted)}>
      <IconCircleCheck className="h-4 w-4 text-[#16a34a] dark:text-[#30d158]" />
      {text}
    </li>
  );
}

/* ═════════════ DWDM Padtec (Zabbix host group PADTEC) ═════════════ */

/* one color per Zabbix severity, hottest to coolest; `c` light theme, `d` dark theme */
const ZBX_SEV: Record<ZbxSeverity, { label: string; c: string; d: string }> = {
  5: { label: "Desastre", c: "#dc2626", d: "#ff453a" },
  4: { label: "Alta", c: "#ea580c", d: "#ff8a3d" },
  3: { label: "Média", c: "#ca8a04", d: "#ffd60a" },
  2: { label: "Atenção", c: "#0891b2", d: "#3dd6f5" },
  1: { label: "Informação", c: "#2563eb", d: "#6b9bff" },
  0: { label: "Não classificada", c: "#8e8e93", d: "#aeaeb2" },
};
const SEV_ORDER: ZbxSeverity[] = [5, 4, 3, 2, 1, 0];
const sevOf = (n: number) => ZBX_SEV[(Math.max(0, Math.min(5, n | 0)) as ZbxSeverity)];
/* the severity color as a CSS variable, switched by the theme */
const sevVars = (n: number) => {
  const s = sevOf(n);
  return { "--sev-l": s.c, "--sev-d": s.d } as React.CSSProperties;
};
const SEV_C = "[--sev:var(--sev-l)] dark:[--sev:var(--sev-d)]";
/* acknowledged = green */
const ACK_VARS = { "--sev-l": "#16a34a", "--sev-d": "#30d158" } as React.CSSProperties;

function DwdmPanel({ snap, now }: { snap: NetworkSnapshot; now: number }) {
  const [filter, setFilter] = useState<ZbxSeverity | "all" | "ack">("all");
  /* optimistic acks (id → ackAt | null) until the next refresh brings them back */
  const [local, setLocal] = useState<Record<string, string | null>>({});
  useEffect(
    () =>
      setLocal((l) => {
        /* forget the ones the server already reflects */
        const keep = Object.entries(l).filter(([id, v]) => {
          const a = snap.dwdm.active.find((x) => x.id === id);
          return a && !!a.ackAt !== !!v;
        });
        return keep.length === Object.keys(l).length ? l : Object.fromEntries(keep);
      }),
    [snap],
  );
  const { resolved, ok, receivingSince, lastReceivedAt, group } = snap.dwdm;
  const active = snap.dwdm.active.map((a) => (a.id in local ? { ...a, ackAt: local[a.id] } : a));
  const open = active.filter((a) => !dwdmAcked(a));
  const acked = active.filter(dwdmAcked);
  const shown = filter === "ack" ? acked : filter === "all" ? open : open.filter((a) => a.severity === filter);
  const [sel, setSel] = useState<string | null>(null);
  const ackChip = useRef<HTMLButtonElement>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [bump, setBump] = useState(0);
  const ack = (id: string, v: boolean, from?: DOMRect) => {
    /* acknowledging from the list: a green copy of the card flies into the chip */
    const to = ackChip.current?.getBoundingClientRect();
    if (v && from && to) setFlights((f) => [...f, { id, from, to }]);
    setSel(null);
    setLocal((l) => ({ ...l, [id]: v ? new Date().toISOString() : null }));
    ackDwdm(id, v)
      .then(() => window.dispatchEvent(new Event("net-refresh")))
      .catch((e) => {
      console.error(e);
      setLocal((l) => {
        const { [id]: _, ...rest } = l;
        return rest;
      });
    });
  };
  const status = !ok
    ? "API indisponível"
    : lastReceivedAt
      ? `Último evento às ${fmtClock(lastReceivedAt)}`
      : `Aguardando eventos do grupo ${group}`;
  return (
    <section className={cn(card, "p-5")}>
      <PanelHead title="Alarmes DWDM Padtec" count={open.length} hint={`Zabbix · grupo ${group}`} />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <SevChip active={filter === "all"} onClick={() => setFilter("all")} label="Todos" n={open.length} />
        {SEV_ORDER.map((k) => (
          <SevChip
            key={k}
            sev={k}
            active={filter === k}
            onClick={() => setFilter(filter === k ? "all" : k)}
            label={ZBX_SEV[k].label}
            n={open.filter((a) => a.severity === k).length}
          />
        ))}
        <SevChip ref={ackChip} bump={bump} ack active={filter === "ack"} onClick={() => setFilter(filter === "ack" ? "all" : "ack")} label="Reconhecidos" n={acked.length} />
        <span className={cn("ml-auto text-[11px]", ok ? muted : "text-[#ea580c]")}>{status}</span>
      </div>
      {shown.length ? (
        <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((a, i) => (
              <DwdmCard
                key={a.id}
                al={a}
                now={now}
                i={i}
                selected={sel === a.id}
                onSelect={() => setSel(sel === a.id ? null : a.id)}
                onAck={ack}
              />
            ))}
          </AnimatePresence>
        </ul>
      ) : (
        <ul className="mt-3">
          <Empty
            text={
              filter === "ack"
                ? "Nenhum alarme reconhecido"
                : active.length
                  ? open.length
                    ? "Nenhum alarme com essa severidade"
                    : "Todos os alarmes ativos foram reconhecidos"
                  : receivingSince
                    ? "Nenhum alarme DWDM ativo"
                    : `Nenhum evento do grupo ${group} recebido ainda`
            }
          />
        </ul>
      )}
      <DwdmResolved list={resolved} />
      {flights.map((f) => (
        <AckFlight
          key={f.id}
          f={f}
          onDone={() => {
            setFlights((l) => l.filter((x) => x.id !== f.id));
            setBump((b) => b + 1);
          }}
        />
      ))}
    </section>
  );
}

type Flight = { id: string; from: DOMRect; to: DOMRect };
/* the acknowledged card, as a green ghost, shrinks and flies into the "Reconhecidos" chip */
function AckFlight({ f, onDone }: { f: Flight; onDone: () => void }) {
  return createPortal(
    <motion.div
      aria-hidden="true"
      className="portal-isl pointer-events-none fixed z-[300] flex items-center justify-center overflow-hidden border-2 border-[#16a34a] bg-[#16a34a]/15 text-[#16a34a] shadow-[0_8px_30px_rgba(22,163,74,.35)] backdrop-blur-sm dark:border-[#30d158] dark:bg-[#30d158]/20 dark:text-[#30d158]"
      initial={{ left: f.from.left, top: f.from.top, width: f.from.width, height: f.from.height, borderRadius: 12, opacity: 1 }}
      animate={{
        left: [f.from.left, f.from.left, f.to.left + f.to.width / 2 - 14],
        top: [f.from.top, f.from.top - 14, f.to.top + f.to.height / 2 - 14],
        width: [f.from.width, f.from.width * 0.92, 28],
        height: [f.from.height, f.from.height * 0.92, 28],
        borderRadius: [12, 18, 999],
        opacity: [1, 1, 0.9],
      }}
      transition={{ duration: 0.75, times: [0, 0.25, 1], ease: [0.5, 0, 0.2, 1] }}
      onAnimationComplete={onDone}
    >
      <IconCheck className="h-4 w-4 shrink-0" stroke={3} />
    </motion.div>,
    document.fullscreenElement ?? document.body,
  );
}

function SevChip({
  ref,
  bump,
  sev,
  ack,
  active,
  onClick,
  label,
  n,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  bump?: number;
  sev?: ZbxSeverity;
  ack?: boolean;
  active: boolean;
  onClick: () => void;
  label: string;
  n: number;
}) {
  if (ack) sev = undefined;
  const colored = sev !== undefined || ack;
  return (
    <motion.button
      ref={ref}
      key={bump ? `b${bump}` : undefined}
      animate={bump ? { scale: [1, 1.18, 1] } : undefined}
      transition={{ duration: 0.4 }}
      type="button"
      onClick={onClick}
      style={ack ? ACK_VARS : sev !== undefined ? sevVars(sev) : undefined}
      className={cn(
        SEV_C,
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? !colored
            ? "border-transparent bg-[#1d1d1f] text-white dark:bg-[#f5f5f7] dark:text-[#1d1d1f]"
            : "border-[var(--sev)] bg-[color-mix(in_srgb,var(--sev)_14%,transparent)] text-[#1d1d1f] dark:text-[#f5f5f7]"
          : "border-black/10 text-[#3a3a3c] hover:border-black/20 dark:border-white/10 dark:text-[#d1d1d6] dark:hover:border-white/25",
        colored && !n && !active && "opacity-45",
      )}
    >
      {ack ? <IconCheck className="h-3.5 w-3.5 text-[var(--sev)]" stroke={3} /> : sev !== undefined && <span className="h-2 w-2 rounded-full bg-[var(--sev)]" />}
      {label} <b className="font-semibold opacity-50">{n}</b>
    </motion.button>
  );
}

/* one alarm: the card is tinted with its severity color — or green once acknowledged */
function DwdmCard({
  al,
  now,
  i,
  selected,
  onSelect,
  onAck,
}: {
  al: DwdmAlarm;
  now: number;
  i: number;
  selected: boolean;
  onSelect: () => void;
  onAck: (id: string, ack: boolean, from?: DOMRect) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const sev = sevOf(al.severity);
  const acked = dwdmAcked(al);
  const hot = al.severity >= 4 && !acked;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1, transition: { delay: 0.03 * i } }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18 } }}
      ref={ref}
      onClick={acked ? undefined : onSelect}
      title={[al.trigger, al.host, al.opdata].filter(Boolean).join("\n")}
      style={acked ? ACK_VARS : sevVars(al.severity)}
      className={cn(
        SEV_C,
        !acked && "cursor-pointer",
        selected && "ring-2 ring-[var(--sev)] ring-offset-2 ring-offset-white dark:ring-offset-[#1c1c1e]",
        "relative flex flex-col gap-1.5 overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--sev)_32%,transparent)] bg-[color-mix(in_srgb,var(--sev)_6%,transparent)] p-3 pt-3.5 transition-colors hover:border-[color-mix(in_srgb,var(--sev)_65%,transparent)] hover:bg-[color-mix(in_srgb,var(--sev)_10%,transparent)]",
      )}
    >
      <span className="absolute inset-x-0 top-0 h-[3px] bg-[var(--sev)]" aria-hidden="true" />
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2 shrink-0">
          {hot && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--sev)] opacity-60" />}
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--sev)]" />
        </span>
        {acked ? (
          <>
            <span className="inline-flex items-center gap-1 rounded-md bg-[var(--sev)] px-1.5 py-px text-[10px] font-bold tracking-wide text-white uppercase dark:text-[#1c1c1e]">
              <IconCheck className="h-3 w-3" stroke={3} />
              Reconhecido
            </span>
            {/* the severity stays readable, in its own color */}
            <span style={sevVars(al.severity)} className={cn(SEV_C, "text-[10px] font-bold tracking-wide text-[var(--sev)] uppercase")}>
              {sev.label}
            </span>
          </>
        ) : (
          <span className="rounded-md bg-[var(--sev)] px-1.5 py-px text-[10px] font-bold tracking-wide text-white uppercase dark:text-[#1c1c1e]">
            {sev.label}
          </span>
        )}
        <span className="ml-auto">
          {!acked ? (
            <AnimatePresence>
              {selected && <AckButton onAck={() => onAck(al.id, true, ref.current?.getBoundingClientRect())} />}
            </AnimatePresence>
          ) : al.ackAt && !al.acknowledged ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAck(al.id, false);
              }}
              title={`Reconhecido às ${fmtClock(al.ackAt)} — clique para desfazer`}
              className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium hover:bg-black/[.05] dark:hover:bg-white/10", muted)}
            >
              Desfazer
            </button>
          ) : (
            <span className={cn("text-[11px]", muted)}>no Zabbix</span>
          )}
        </span>
      </div>
      <div className={cn("line-clamp-2 text-[13px] leading-snug font-semibold break-words", strong)}>{al.trigger}</div>
      <div className={cn("truncate font-mono text-[11px]", muted)}>{al.host}</div>
      {al.opdata && <div className={cn("truncate text-[11px]", muted)}>{al.opdata}</div>}
      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
        <span className={cn("text-[11px] leading-tight", muted)}>
          desde {fmtClock(al.start)}
          {al.ackAt && <span className="block text-[var(--sev)]">reconhecido às {fmtClock(al.ackAt)}</span>}
        </span>
        <span className="text-[16px] leading-none font-bold text-[var(--sev)] tabular-nums">{fmtDuration(now - Date.parse(al.start))}</span>
      </div>
    </motion.li>
  );
}

/* green round "acknowledge" button (icon only), shown when the card is selected:
   it pops in with a soft pulse; on click a check draws itself, a ring ripples
   out, and then the card flies to "Reconhecidos" */
function AckButton({ onAck }: { onAck: () => void }) {
  const [done, setDone] = useState(false);
  const cb = useRef(onAck);
  cb.current = onAck;
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => cb.current(), 420);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <motion.button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setDone(true);
      }}
      disabled={done}
      aria-label="Reconhecer alarme"
      title="Reconhecer alarme"
      initial={{ scale: 0, rotate: -90 }}
      animate={{ scale: 1, rotate: 0 }}
      exit={{ scale: 0, opacity: 0, transition: { duration: 0.12 } }}
      transition={{ type: "spring", stiffness: 520, damping: 22 }}
      whileHover={done ? undefined : { scale: 1.12 }}
      whileTap={done ? undefined : { scale: 0.88 }}
      className="relative flex h-7 w-7 items-center justify-center rounded-full bg-[#16a34a] text-white shadow-[0_2px_10px_rgba(22,163,74,.45)] dark:bg-[#30d158] dark:text-[#0b2e16]"
    >
      {/* soft pulse while waiting, ripple on click */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full border-2 border-[#16a34a] dark:border-[#30d158]"
        initial={{ scale: 1, opacity: 0.8 }}
        animate={done ? { scale: 2.6, opacity: 0 } : { scale: [1, 1.7], opacity: [0.7, 0] }}
        transition={done ? { duration: 0.45, ease: "easeOut" } : { duration: 1.4, repeat: Infinity, ease: "easeOut" }}
        key={done ? "ripple" : "pulse"}
      />
      <svg viewBox="0 0 24 24" className="relative h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <motion.path
          d="M5 12.5l4.5 4.5L19 7.5"
          initial={false}
          animate={{ pathLength: done ? [0, 1] : 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </svg>
    </motion.button>
  );
}

function DwdmResolved({ list }: { list: DwdmAlarm[] }) {
  const [open, setOpen] = useState(false);
  if (!list.length) return null;
  return (
    <div className="mt-3 border-t border-black/[.06] pt-3 dark:border-white/[.06]">
      <button type="button" onClick={() => setOpen((o) => !o)} className={cn("flex w-full items-center gap-2 text-xs font-semibold", muted)}>
        <IconCircleCheck className="h-4 w-4 text-[#16a34a] dark:text-[#30d158]" />
        Normalizados nas últimas 24h · {list.length}
        <IconChevronDown className={cn("ml-auto h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex flex-col gap-1 overflow-hidden pt-2"
          >
            {list.map((a) => (
              <li
                key={a.id}
                style={sevVars(a.severity)}
                className={cn(SEV_C, "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-black/[.03] dark:hover:bg-white/[.04]")}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--sev)]" title={sevOf(a.severity).label} />
                <span className={cn("min-w-0 flex-1 truncate font-medium", strong)} title={a.trigger}>
                  {a.trigger} <span className={cn("font-mono font-normal", muted)}>· {a.host}</span>
                </span>
                <span className={cn("shrink-0 tabular-nums", muted)}>
                  {fmtClock(a.start)} → {a.end ? fmtClock(a.end) : "—"}
                  {a.end && ` · ${fmtDuration(Date.parse(a.end) - Date.parse(a.start))}`}
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
