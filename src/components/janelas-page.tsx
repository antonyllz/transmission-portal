/* Janelas programadas — maintenance windows synced from the Excel sheet
   (Janelas_Programadas.xlsx) by a Power Automate flow (see server/janelas.js).
   "Agora" = windows running right now; the upcoming ones are grouped by day,
   the ended ones are under "Encerradas". Read-only: the sheet is the source. */
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  IconAlertTriangle,
  IconCalendarEvent,
  IconChevronDown,
  IconCircleCheck,
  IconPlugConnectedX,
  IconRefresh,
  IconSearch,
  IconUser,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { fmtDuration, useNow } from "@/hooks/use-now";

type Janela = {
  ap: string;
  cliente: string;
  status: string;
  revisao: number;
  interrupcao: boolean;
  inicio: string | null;
  fim: string | null;
  duracaoH: number | null;
  qtdServicos: number;
  servicos: string[];
  descricao: string;
  responsavel: string;
  solicitacao: string | null;
  atualizadoEm: string | null;
  syncedAt: string;
};
type Data = { windows: Janela[]; firstSyncAt: string | null; lastSyncAt: string | null; lastCount: number | null };

const REFRESH_MS = 60_000;
const card =
  "rounded-2xl border border-black/[.07] bg-white shadow-[0_1px_3px_rgba(0,0,0,.04),0_4px_16px_rgba(0,0,0,.05)] dark:border-white/[.08] dark:bg-[#1c1c1e] dark:shadow-none";
const muted = "text-[#6e6e73] dark:text-[#8e8e93]";
const strong = "text-[#1d1d1f] dark:text-[#f5f5f7]";

const ms = (iso: string | null) => (iso ? Date.parse(iso) : NaN);
const clock = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—";
const dateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
    : "—";
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
function dayLabel(iso: string, now: number) {
  const k = dayKey(iso);
  const today = dayKey(new Date(now).toISOString());
  const tomorrow = dayKey(new Date(now + 86400000).toISOString());
  const base = new Date(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" });
  const days = Math.round((Date.parse(k) - Date.parse(today)) / 86400000);
  const rel = k === today ? "hoje" : k === tomorrow ? "amanhã" : days > 0 ? `em ${days} dias` : `há ${-days} dias`;
  return { base: base.charAt(0).toUpperCase() + base.slice(1), rel, today: k === today };
}

type Phase = "now" | "next" | "done" | "cancelled";
const isCancelled = (w: Janela) => /cancel/i.test(w.status);
function phaseOf(w: Janela, now: number): Phase {
  if (isCancelled(w)) return "cancelled";
  const a = ms(w.inicio), b = ms(w.fim);
  if (!isNaN(b) && b <= now) return "done";
  if (!isNaN(a) && a <= now) return "now";
  return "next";
}

/* status from the sheet → badge color */
function statusTone(s: string) {
  if (/cancel/i.test(s)) return "bg-black/[.06] text-[#6e6e73] dark:bg-white/10 dark:text-[#aeaeb2]";
  if (/conclu|execut|finaliz|realiz/i.test(s)) return "bg-[#16a34a]/12 text-[#15803d] dark:bg-[#30d158]/15 dark:text-[#30d158]";
  if (/andamento|execu/i.test(s)) return "bg-[#ea580c]/12 text-[#c2410c] dark:bg-[#ff9f0a]/15 dark:text-[#ffb340]";
  if (/adiad|reagend|pend/i.test(s)) return "bg-[#ca8a04]/12 text-[#a16207] dark:bg-[#ffd60a]/15 dark:text-[#ffd60a]";
  return "bg-tely-blue/10 text-tely-blue dark:bg-tely-blue/25 dark:text-tely-blue-light";
}

function useJanelas() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/network/janelas", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: Data) => {
          if (alive) {
            setData(d);
            setError(false);
          }
        })
        .catch(() => alive && setError(true));
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return { data, error };
}

type View = "proximas" | "encerradas" | "todas";

export function JanelasPage() {
  const { data, error } = useJanelas();
  const now = useNow(30_000);
  const [view, setView] = useState<View>("proximas");
  const [q, setQ] = useState("");

  const all = data?.windows ?? [];
  const filtered = useMemo(() => {
    const t = q
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
    if (!t) return all;
    return all.filter((w) =>
      [w.ap, w.cliente, w.status, w.descricao, w.responsavel, ...w.servicos]
        .join(" ")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .includes(t),
    );
  }, [all, q]);

  if (!data)
    return error ? (
      <div className={cn(card, "flex items-center gap-3 p-5 text-sm", muted)}>
        <IconAlertTriangle className="h-5 w-5 text-[#ea580c]" />
        Não foi possível carregar as janelas (API indisponível).
      </div>
    ) : (
      <div className={cn(card, "h-[240px] animate-pulse")} aria-busy="true" />
    );

  const by = (p: Phase) => filtered.filter((w) => phaseOf(w, now) === p);
  const running = by("now");
  const upcoming = [...by("next"), ...by("cancelled").filter((w) => ms(w.fim) > now)].sort(
    (a, b) => String(a.inicio).localeCompare(String(b.inicio)),
  );
  const ended = [...by("done"), ...by("cancelled").filter((w) => !(ms(w.fim) > now))].sort((a, b) =>
    String(b.inicio).localeCompare(String(a.inicio)),
  );
  const week = all.filter((w) => phaseOf(w, now) === "next" && ms(w.inicio) - now < 7 * 86400000);
  const withCut = all.filter((w) => ["now", "next"].includes(phaseOf(w, now)) && w.interrupcao);

  return (
    <div className="flex flex-col gap-4">
      {/* summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Em andamento agora" value={all.filter((w) => phaseOf(w, now) === "now").length} tone="orange" />
        <Stat label="Próximos 7 dias" value={week.length} tone="blue" />
        <Stat label="Com interrupção (agendadas)" value={withCut.length} tone="red" />
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-black/[.05] p-0.5 dark:bg-white/[.07]">
          {(
            [
              ["proximas", "Próximas"],
              ["encerradas", "Encerradas"],
              ["todas", "Todas"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setView(k)}
              className={cn(
                "relative rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                view === k ? strong : muted,
              )}
            >
              {view === k && (
                <motion.span
                  layoutId="jan-view"
                  className="absolute inset-0 rounded-full bg-white shadow-sm dark:bg-[#3a3a3c]"
                  transition={{ type: "spring", stiffness: 500, damping: 36 }}
                />
              )}
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
        <label className="relative min-w-[200px] flex-1">
          <IconSearch className={cn("pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2", muted)} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar AP, cliente, serviço, descrição…"
            className={cn(
              "w-full rounded-full border border-black/10 bg-white py-1.5 pr-3 pl-9 text-[13px] outline-none focus:border-tely-blue dark:border-white/10 dark:bg-[#1c1c1e]",
              strong,
            )}
          />
        </label>
        <SyncInfo data={data} />
      </div>

      {!all.length ? (
        <EmptyBox
          icon={<IconPlugConnectedX className="h-5 w-5" />}
          text="Nenhuma janela recebida ainda. Assim que o fluxo do Power Automate rodar, as janelas da planilha aparecem aqui."
        />
      ) : (
        <>
          {view !== "encerradas" && running.length > 0 && (
            <section className="flex flex-col gap-2">
              <GroupHead title="Agora" sub={`${running.length} em andamento`} live />
              {running.map((w) => (
                <WindowCard key={w.ap} w={w} now={now} />
              ))}
            </section>
          )}
          {view !== "encerradas" && <DayGroups list={upcoming} now={now} empty="Nenhuma janela futura" />}
          {view === "encerradas" && <DayGroups list={ended} now={now} empty="Nenhuma janela encerrada" />}
          {view === "todas" && ended.length > 0 && <Ended list={ended} now={now} />}
        </>
      )}
    </div>
  );
}

function DayGroups({ list, now, empty }: { list: Janela[]; now: number; empty: string }) {
  if (!list.length) return <EmptyBox icon={<IconCircleCheck className="h-5 w-5 text-[#16a34a]" />} text={empty} />;
  const groups: [string, Janela[]][] = [];
  for (const w of list) {
    const k = w.inicio ? dayKey(w.inicio) : "sem-data";
    const g = groups.find((x) => x[0] === k);
    if (g) g[1].push(w);
    else groups.push([k, [w]]);
  }
  return (
    <>
      {groups.map(([k, ws]) => {
        const d = ws[0].inicio ? dayLabel(ws[0].inicio, now) : { base: "Sem data", rel: "", today: false };
        return (
          <section key={k} className="flex flex-col gap-2">
            <GroupHead title={d.base} sub={d.rel} live={d.today} />
            {ws.map((w) => (
              <WindowCard key={w.ap} w={w} now={now} />
            ))}
          </section>
        );
      })}
    </>
  );
}

function Ended({ list, now }: { list: Janela[]; now: number }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col gap-2">
      <button type="button" onClick={() => setOpen((o) => !o)} className={cn("flex items-center gap-2 pt-2 text-xs font-semibold", muted)}>
        <IconCircleCheck className="h-4 w-4 text-[#16a34a] dark:text-[#30d158]" />
        Encerradas · {list.length}
        <IconChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex flex-col gap-2 overflow-hidden"
          >
            {list.map((w) => (
              <WindowCard key={w.ap} w={w} now={now} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function GroupHead({ title, sub, live }: { title: string; sub?: string; live?: boolean }) {
  return (
    <div className="mt-2 flex items-center gap-2 px-1">
      {live && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ea580c] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ea580c]" />
        </span>
      )}
      <h3 className={cn("text-[14px] font-semibold tracking-tight", strong)}>{title}</h3>
      {sub && <span className={cn("text-xs", muted)}>· {sub}</span>}
    </div>
  );
}

/* one window */
function WindowCard({ w, now }: { w: Janela; now: number }) {
  const [open, setOpen] = useState(false);
  const phase = phaseOf(w, now);
  const a = ms(w.inicio), b = ms(w.fim);
  const progress = phase === "now" && !isNaN(a) && !isNaN(b) && b > a ? Math.min(1, (now - a) / (b - a)) : null;
  const dur = w.duracaoH ?? (!isNaN(a) && !isNaN(b) ? (b - a) / 3600000 : null);
  const sameDay = w.inicio && w.fim && dayKey(w.inicio) === dayKey(w.fim);
  const countdown =
    phase === "next" && !isNaN(a)
      ? `começa em ${fmtDuration(a - now)}`
      : phase === "now" && !isNaN(b)
        ? `termina em ${fmtDuration(b - now)}`
        : phase === "done" && !isNaN(b)
          ? `encerrada há ${fmtDuration(now - b)}`
          : "";
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        card,
        "relative overflow-hidden",
        phase === "now" && "border-[#ea580c]/40 dark:border-[#ff9f0a]/40",
        (phase === "cancelled" || phase === "done") && "opacity-70",
      )}
    >
      {phase === "now" && <span className="absolute inset-y-0 left-0 w-[3px] bg-[#ea580c]" aria-hidden="true" />}
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full flex-col gap-3 p-4 text-left sm:flex-row sm:items-start">
        {/* when */}
        <div className="flex shrink-0 items-baseline gap-2 sm:w-[132px] sm:flex-col sm:items-start sm:gap-0.5">
          <span className={cn("text-[17px] leading-none font-bold tabular-nums", strong, phase === "cancelled" && "line-through")}>
            {clock(w.inicio)} – {clock(w.fim)}
          </span>
          <span className={cn("text-[11px]", muted)}>
            {!sameDay && w.fim ? `até ${dateTime(w.fim)} · ` : ""}
            {dur !== null ? `${Number.isInteger(dur) ? dur : dur.toFixed(1)}h` : ""}
          </span>
          {countdown && (
            <span className={cn("text-[11px] font-semibold", phase === "now" ? "text-[#ea580c] dark:text-[#ffb340]" : "text-tely-blue dark:text-tely-blue-light")}>
              {countdown}
            </span>
          )}
        </div>

        {/* what */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("font-mono text-[13px] font-semibold", strong)}>{w.ap}</span>
            <span className={cn("rounded-md px-1.5 py-px text-[10px] font-bold tracking-wide uppercase", statusTone(w.status))}>
              {phase === "now" && !isCancelled(w) ? "Em andamento" : w.status || "—"}
            </span>
            {w.interrupcao ? (
              <span className="rounded-md bg-[#dc2626]/10 px-1.5 py-px text-[10px] font-bold tracking-wide text-[#dc2626] uppercase dark:bg-[#ff453a]/15 dark:text-[#ff6b61]">
                Com interrupção
              </span>
            ) : (
              <span className="rounded-md bg-[#16a34a]/10 px-1.5 py-px text-[10px] font-bold tracking-wide text-[#15803d] uppercase dark:bg-[#30d158]/15 dark:text-[#30d158]">
                Sem interrupção
              </span>
            )}
            {w.revisao > 0 && <span className={cn("text-[11px] font-medium", muted)}>rev. {w.revisao}</span>}
            <span className={cn("ml-auto text-[12px] font-medium", muted)}>{w.cliente}</span>
          </div>
          <p className={cn("mt-1.5 text-[13px] leading-snug", strong, !open && "line-clamp-2")}>{w.descricao || "Sem descrição"}</p>
          <div className={cn("mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]", muted)}>
            <span className="inline-flex items-center gap-1">
              <IconPlugConnectedX className="h-3.5 w-3.5" />
              {w.qtdServicos} {w.qtdServicos === 1 ? "serviço afetado" : "serviços afetados"}
            </span>
            {w.responsavel && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <IconUser className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{w.responsavel}</span>
              </span>
            )}
            <IconChevronDown className={cn("ml-auto h-4 w-4 transition-transform", open && "rotate-180")} />
          </div>
        </div>
      </button>

      {progress !== null && (
        <div className="h-1 w-full bg-[#ea580c]/10">
          <motion.div className="h-full bg-[#ea580c]" initial={{ width: 0 }} animate={{ width: `${progress * 100}%` }} />
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-black/[.06] px-4 pt-3 pb-4 dark:border-white/[.06]">
              <div className={cn("mb-2 text-[11px] font-semibold tracking-wide uppercase", muted)}>Serviços afetados</div>
              {w.servicos.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {w.servicos.map((s) => (
                    <li
                      key={s}
                      className={cn("rounded-md bg-black/[.05] px-2 py-0.5 font-mono text-[11px] dark:bg-white/[.08]", strong)}
                    >
                      {s}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className={cn("text-xs", muted)}>Não informado</span>
              )}
              <div className={cn("mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]", muted)}>
                <span>Início {dateTime(w.inicio)}</span>
                <span>Fim {dateTime(w.fim)}</span>
                {w.solicitacao && <span>Solicitada em {dateTime(w.solicitacao)}</span>}
                {w.atualizadoEm && <span>Atualizada em {dateTime(w.atualizadoEm)}</span>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "orange" | "blue" | "red" }) {
  const cls = {
    orange: "text-[#ea580c] bg-[#ea580c]/10 dark:text-[#ffb340] dark:bg-[#ff9f0a]/15",
    blue: "text-tely-blue bg-tely-blue/10 dark:text-tely-blue-light dark:bg-tely-blue/25",
    red: "text-[#dc2626] bg-[#dc2626]/10 dark:text-[#ff6b61] dark:bg-[#ff453a]/15",
  }[tone];
  return (
    <div className={cn(card, "flex items-center gap-3 p-4")}>
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", cls)}>
        <IconCalendarEvent className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className={cn("text-[22px] leading-none font-semibold tabular-nums", strong)}>{value}</div>
        <div className={cn("mt-1 truncate text-xs", muted)}>{label}</div>
      </div>
    </div>
  );
}

function SyncInfo({ data }: { data: Data }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px]", muted)} title="Sincronizado pelo Power Automate a partir da planilha">
      <IconRefresh className="h-3.5 w-3.5" />
      {data.lastSyncAt ? `Planilha sincronizada ${dateTime(data.lastSyncAt)}` : "Aguardando a primeira sincronização"}
    </span>
  );
}

function EmptyBox({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-2xl border border-dashed border-black/10 p-5 text-sm dark:border-white/10", muted)}>
      {icon}
      {text}
    </div>
  );
}
