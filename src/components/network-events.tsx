import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  IconAlertTriangle,
  IconChevronDown,
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
        <PanelHead title="Trechos down" count={down} hint="Zabbix" />
        {down ? (
          <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2.5">
            <AnimatePresence initial={false}>
              {snap.trechos.map((t, i) => (
                <TrechoTile key={t.key} t={t} locs={snap.localities} now={now} i={i} />
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <ul className="mt-3">
            <Empty text="Nenhum trecho down na rede" />
          </ul>
        )}
        <Resolved list={snap.resolved} locs={snap.localities} />
      </section>

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

/* one segment as a compact tile: both ends, since when, for how long.
   The technical detail (codes, interfaces, hosts) is in the tooltip. */
function TrechoTile({ t, locs, now, i }: { t: Trecho; locs: Record<string, Locality>; now: number; i: number }) {
  const sameSite = !!(t.a && t.b && t.a.key === t.b.key);
  const codes = t.a && t.b ? `${t.a.key} × ${t.b.key}` : (t.a?.key ?? t.events[0].host);
  const detail = [
    codes,
    ...t.events.map((e) => `${e.host} — ${[e.iface, e.speed].filter(Boolean).join(" · ") || e.trigger}`),
  ].join("\n");
  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1, transition: { delay: 0.03 * i } }}
      exit={{ opacity: 0, scale: 0.94 }}
      title={detail}
      className="relative flex flex-col gap-2 overflow-hidden rounded-xl border border-[#dc2626]/25 bg-[#dc2626]/[.045] p-3 pt-3.5 dark:border-[#ff453a]/25 dark:bg-[#ff453a]/[.07]"
    >
      <span className="absolute inset-x-0 top-0 h-[3px] bg-[#dc2626]" aria-hidden="true" />
      <div className={cn("flex min-w-0 flex-col gap-0.5 text-[13px] leading-tight font-semibold", strong)}>
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
      <div className="mt-auto flex items-end justify-between gap-2">
        <span className={cn("text-[11px] leading-tight", muted)}>
          desde {fmtClock(t.since)}
          {t.acknowledged && <span className="block text-[#16a34a] dark:text-[#30d158]">reconhecido</span>}
        </span>
        <span className="text-[17px] leading-none font-bold text-[#dc2626] tabular-nums dark:text-[#ff6b61]">
          {fmtDuration(now - Date.parse(t.since))}
        </span>
      </div>
    </motion.li>
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
