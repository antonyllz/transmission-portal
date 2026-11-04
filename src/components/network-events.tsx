import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  IconAlertTriangle,
  IconBroadcastOff,
  IconCircleCheck,
  IconClockHour4,
  IconMapPin,
  IconServer2,
  IconWaveSine,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { fmtClock, fmtDuration, useNow } from "@/hooks/use-now";
import {
  fetchNetworkSnapshot,
  type AlarmSeverity,
  type NetworkEvent,
  type NetworkSnapshot,
  type PadtecAlarm,
} from "@/data/network-events";

const REFRESH_MS = 30_000;

function useNetworkSnapshot() {
  const [snap, setSnap] = useState<NetworkSnapshot | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchNetworkSnapshot()
        .then((s) => alive && setSnap(s))
        .catch((e) => console.error("Network events unavailable:", e));
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return snap;
}

const SEVERITY: Record<AlarmSeverity, { label: string; cls: string }> = {
  critical: { label: "Crítico", cls: "bg-[#dc2626]/10 text-[#dc2626] dark:bg-[#ff453a]/15 dark:text-[#ff6b61]" },
  major: { label: "Maior", cls: "bg-[#ea580c]/10 text-[#ea580c] dark:bg-[#ff9f0a]/15 dark:text-[#ffb340]" },
  minor: { label: "Menor", cls: "bg-[#ca8a04]/10 text-[#a16207] dark:bg-[#ffd60a]/15 dark:text-[#ffd60a]" },
};

const card =
  "rounded-2xl border border-black/[.07] bg-white shadow-[0_1px_3px_rgba(0,0,0,.04),0_4px_16px_rgba(0,0,0,.05)] dark:border-white/[.08] dark:bg-[#1c1c1e] dark:shadow-none";

export function NetworkEventsDashboard() {
  const snap = useNetworkSnapshot();
  const now = useNow(1000);

  if (!snap) {
    return <div className={cn(card, "h-[280px] animate-pulse")} aria-busy="true" />;
  }

  const down = snap.events.filter((e) => e.status === "down");
  const totalActive = snap.events.length + snap.padtecAlarms.length;
  const oldest = [...snap.events, ...snap.padtecAlarms].reduce<string | null>(
    (acc, e) => (!acc || e.since < acc ? e.since : acc),
    null,
  );
  const healthy = totalActive === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ── status banner ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "relative flex flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden rounded-2xl px-5 py-4 text-white",
          healthy
            ? "bg-gradient-to-r from-[#16a34a] to-[#15803d]"
            : "bg-gradient-to-r from-[#dc2626] via-[#c81e1e] to-[#9f1239]",
        )}
      >
        <span className="relative flex h-3 w-3 shrink-0">
          {!healthy && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />}
          <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold tracking-tight">
            {healthy
              ? "Rede operando normalmente"
              : `${down.length} ${down.length === 1 ? "site fora" : "sites fora"} · ${snap.padtecAlarms.length} ${
                  snap.padtecAlarms.length === 1 ? "alarme Padtec" : "alarmes Padtec"
                }`}
          </div>
          <div className="text-xs text-white/75">
            Atualizado às {fmtClock(snap.updatedAt)} · recarrega a cada {REFRESH_MS / 1000}s
          </div>
        </div>
        {snap.simulated && (
          <span
            className="rounded-full border border-white/30 bg-white/15 px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase backdrop-blur"
            title="A coleta real ainda não foi implementada — estes eventos são de exemplo"
          >
            Dados simulados
          </span>
        )}
      </motion.div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<IconBroadcastOff />} label="Sites fora" value={down.length} tone={down.length ? "red" : "ok"} />
        <Kpi
          icon={<IconAlertTriangle />}
          label="Alarmes Padtec"
          value={snap.padtecAlarms.length}
          tone={snap.padtecAlarms.length ? "orange" : "ok"}
        />
        <Kpi icon={<IconWaveSine />} label="Eventos ativos" value={totalActive} tone="blue" />
        <Kpi
          icon={<IconClockHour4 />}
          label="Mais antigo"
          value={oldest ? fmtDuration(now - Date.parse(oldest)) : "—"}
          tone="blue"
        />
      </div>

      {/* ── lists ── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className={cn(card, "p-5")}>
          <PanelHead title="Eventos ativos" count={snap.events.length} hint="Sites e rotas" />
          <ul className="mt-3 flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {snap.events.map((e, i) => (
                <EventRow key={e.id} ev={e} now={now} i={i} />
              ))}
            </AnimatePresence>
            {!snap.events.length && <Empty text="Nenhum evento ativo na rede" />}
          </ul>
        </section>

        <section className={cn(card, "p-5")}>
          <PanelHead title="Alarmes Padtec" count={snap.padtecAlarms.length} hint="NMS Padtec" />
          <ul className="mt-3 flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {snap.padtecAlarms.map((a, i) => (
                <AlarmRow key={a.id} al={a} now={now} i={i} />
              ))}
            </AnimatePresence>
            {!snap.padtecAlarms.length && <Empty text="Nenhum alarme Padtec ativo" />}
          </ul>
        </section>
      </div>
    </div>
  );
}

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
        <div className="text-[22px] leading-none font-semibold tracking-tight text-[#1d1d1f] tabular-nums dark:text-[#f5f5f7]">
          {value}
        </div>
        <div className="mt-1 truncate text-xs text-[#6e6e73] dark:text-[#8e8e93]">{label}</div>
      </div>
    </div>
  );
}

function PanelHead({ title, count, hint }: { title: string; count: number; hint: string }) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="text-[15px] font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">{title}</h3>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
          count
            ? "bg-[#dc2626] text-white"
            : "bg-[#f5f5f7] text-[#6e6e73] dark:bg-[#2c2c2e] dark:text-[#8e8e93]",
        )}
      >
        {count}
      </span>
      <span className="ml-auto text-[11px] font-medium tracking-wide text-[#aeaeb2] uppercase dark:text-[#636366]">
        {hint}
      </span>
    </div>
  );
}

const rowMotion = (i: number) => ({
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0, transition: { delay: 0.05 * i } },
  exit: { opacity: 0, x: 10 },
});

function EventRow({ ev, now, i }: { ev: NetworkEvent; now: number; i: number }) {
  const isDown = ev.status === "down";
  return (
    <motion.li
      layout
      {...rowMotion(i)}
      className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-black/[.06] bg-[#f5f5f7]/60 p-3 pl-4 transition-colors hover:bg-[#f5f5f7] dark:border-white/[.06] dark:bg-[#2c2c2e]/50 dark:hover:bg-[#2c2c2e]"
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-1", isDown ? "bg-[#dc2626]" : "bg-[#ea580c]")}
        aria-hidden="true"
      />
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
            isDown ? "bg-[#dc2626]" : "bg-[#ea580c]",
          )}
        />
        <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", isDown ? "bg-[#dc2626]" : "bg-[#ea580c]")} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <IconMapPin className="h-3.5 w-3.5 shrink-0 text-[#6e6e73] dark:text-[#8e8e93]" />
          <span className="truncate text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">{ev.site}</span>
          <span className="rounded-md bg-black/[.06] px-1.5 py-px text-[10px] font-bold text-[#6e6e73] dark:bg-white/10 dark:text-[#aeaeb2]">
            {ev.uf}
          </span>
        </div>
        <div className="mt-0.5 truncate text-xs text-[#6e6e73] dark:text-[#8e8e93]">
          desde {fmtClock(ev.since)} · {ev.source}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wider text-white uppercase",
            isDown ? "bg-[#dc2626]" : "bg-[#ea580c]",
          )}
        >
          {isDown ? "Down" : "Degradado"}
        </span>
        <span className="text-xs font-medium text-[#1d1d1f] tabular-nums dark:text-[#f5f5f7]">
          {fmtDuration(now - Date.parse(ev.since))}
        </span>
      </div>
    </motion.li>
  );
}

function AlarmRow({ al, now, i }: { al: PadtecAlarm; now: number; i: number }) {
  const sev = SEVERITY[al.severity];
  return (
    <motion.li
      layout
      {...rowMotion(i)}
      className="flex items-center gap-3 rounded-xl border border-black/[.06] bg-[#f5f5f7]/60 p-3 transition-colors hover:bg-[#f5f5f7] dark:border-white/[.06] dark:bg-[#2c2c2e]/50 dark:hover:bg-[#2c2c2e]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ea580c]/10 text-[#ea580c] dark:bg-[#ff9f0a]/15 dark:text-[#ffb340]">
        <IconServer2 className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[13px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
          {al.element}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#6e6e73] dark:text-[#8e8e93]">
          <span className="font-medium text-[#dc2626] dark:text-[#ff6b61]">{al.status}</span>· desde {fmtClock(al.since)}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", sev.cls)}>{sev.label}</span>
        <span className="text-xs font-medium text-[#1d1d1f] tabular-nums dark:text-[#f5f5f7]">
          {fmtDuration(now - Date.parse(al.since))}
        </span>
      </div>
    </motion.li>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2 rounded-xl border border-dashed border-black/10 p-4 text-sm text-[#6e6e73] dark:border-white/10 dark:text-[#8e8e93]">
      <IconCircleCheck className="h-4 w-4 text-[#16a34a] dark:text-[#30d158]" />
      {text}
    </li>
  );
}
