import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconX,
  IconCircleCheck,
  IconClockHour4,
  IconBolt,
  IconRouteOff,
  IconTemperature,
  IconWifiOff,
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
    return () => {
      alive = false;
      clearInterval(t);
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

      {/* ── KPIs ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi icon={<IconRouteOff />} label="Trechos down" value={down} tone={down ? "red" : "ok"} />
        <Kpi icon={<IconAlertTriangle />} label="Alarmes Padtec" value={padtecN} tone={padtecN ? "orange" : "ok"} />
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
      <PanelHead title="Alarmes Padtec" count={all.length} hint="NMS Padtec" />
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
      className="pointer-events-none fixed z-[300] w-max max-w-[min(440px,calc(100vw-24px))] rounded-xl border border-black/10 bg-white/95 p-3 text-[12px] shadow-[0_10px_40px_rgba(0,0,0,.18)] backdrop-blur-md dark:border-white/10 dark:bg-[#2c2c2e]/95"
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
      className="fixed inset-0 z-[280] overflow-y-auto bg-[#f5f5f7] px-5 py-6 sm:px-10 sm:py-8 dark:bg-[#0b0b0d]"
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
