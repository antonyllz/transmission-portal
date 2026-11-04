import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  IconCheck,
  IconClockHour4,
  IconInfinity,
  IconMessageCircle,
  IconPlus,
  IconSend2,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { Notepad } from "@/components/ui/notepad";
import { cn } from "@/lib/utils";
import { useNow } from "@/hooks/use-now";
import {
  PRIO,
  PRIO_ORDER,
  addComment,
  addDemand,
  demandAge,
  demandState,
  removeDemand,
  useDemands,
  type Demand,
  type Priority,
} from "@/lib/demands-store";

type FilterKey = "all" | "urgent" | "due" | "free";
const FILTERS: Record<FilterKey, { label: string; test: (d: Demand, now: number) => boolean }> = {
  all: { label: "Todas", test: () => true },
  urgent: { label: "Urgentes", test: (d) => d.priority === "urgente" },
  due: {
    label: "Vencendo",
    test: (d, now) => {
      const c = demandState(d, now).cls;
      return c === "soon" || c === "late";
    },
  },
  free: { label: "Sem prazo", test: (d) => d.duration == null },
};

const PRIO_SHORT: Record<Priority, string> = { urgente: "▲ 6h", media: "● 1d", baixa: "■ 7d", sempre: "∞ Sempre" };

export function DemandsBoard() {
  const demands = useDemands();
  const now = useNow(10_000); // countdowns show hours/minutes only
  const [filter, setFilter] = useState<FilterKey>("all");
  const [openId, setOpenId] = useState<string | null>(null); // demand id or "new"
  const [finishing, setFinishing] = useState<Record<string, true>>({});

  const shown = useMemo(() => demands.filter((d) => FILTERS[filter].test(d, now)), [demands, filter, now]);
  const soon = demands.filter((d) => demandState(d, now).cls === "soon").length;
  const late = demands.filter((d) => demandState(d, now).cls === "late").length;
  const open = openId && openId !== "new" ? demands.find((d) => d.id === openId) : undefined;

  /* the open demand was removed elsewhere (another user) → close it */
  useEffect(() => {
    if (openId && openId !== "new" && !open) setOpenId(null);
  }, [openId, open]);

  const finish = (id: string) => {
    setOpenId(null);
    setFinishing((f) => ({ ...f, [id]: true }));
    setTimeout(() => {
      removeDemand(id);
      setFinishing(({ [id]: _, ...rest }) => rest);
    }, 900);
  };

  return (
    <div className="np-board rounded-2xl border p-5">
      {/* ── header ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">Em andamento</div>
          <div className="text-xs text-[#6e6e73] dark:text-[#8e8e93]">
            {demands.length} {demands.length === 1 ? "aberta" : "abertas"}
            {soon > 0 && <span className="text-[#ea580c]"> · {soon} vencendo</span>}
            {late > 0 && (
              <span className="text-[#dc2626]">
                {" "}
                · {late} {late === 1 ? "expirada" : "expiradas"}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(FILTERS) as FilterKey[]).map((k) => {
            const n = demands.filter((d) => FILTERS[k].test(d, now)).length;
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
                {FILTERS[k].label} <b className="ml-0.5 font-semibold opacity-50">{n}</b>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── the row of pads, with a simple + after the last one ── */}
      <LayoutGroup>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-8 px-1 pb-2">
          <AnimatePresence mode="popLayout">
            {shown.map((d) => (
              <DemandPad
                key={d.id}
                d={d}
                now={now}
                finishing={!!finishing[d.id]}
                hidden={openId === d.id}
                onOpen={() => setOpenId(d.id)}
              />
            ))}
          </AnimatePresence>

          <motion.button
            layout
            layoutId="pad-new"
            type="button"
            onClick={() => setOpenId("new")}
            aria-label="Nova demanda"
            title="Nova demanda"
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-dashed border-tely-blue/40 text-tely-blue transition-colors hover:border-tely-blue hover:bg-tely-blue/10 dark:border-tely-blue-light/40 dark:text-tely-blue-light dark:hover:border-tely-blue-light dark:hover:bg-tely-blue/20"
          >
            <IconPlus className="h-5 w-5" stroke={2.2} />
          </motion.button>

          {!shown.length && (
            <div className="flex h-[232px] min-w-[200px] flex-1 flex-col items-center justify-center gap-1 text-center">
              <IconCheck className="mb-1 h-7 w-7 text-[#16a34a] dark:text-[#30d158]" />
              <b className="text-sm text-[#1d1d1f] dark:text-[#f5f5f7]">{demands.length ? "Nada neste filtro" : "Tudo em dia"}</b>
              <span className="text-xs text-[#6e6e73] dark:text-[#8e8e93]">
                {demands.length
                  ? `Nenhuma demanda ${FILTERS[filter].label.toLowerCase()} agora.`
                  : "Nenhuma demanda aberta. Use o + para registrar."}
              </span>
            </div>
          )}
        </div>

        {/* ── opened pad ── */}
        <AnimatePresence>
          {openId === "new" && <Composer key="composer" onClose={() => setOpenId(null)} />}
          {open && (
            <DemandSheet
              key={`sheet-${open.id}`}
              d={open}
              now={now}
              onClose={() => setOpenId(null)}
              onFinish={() => finish(open.id)}
              onDelete={() => {
                setOpenId(null);
                removeDemand(open.id);
              }}
            />
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
}

/* ═════════════════ pad on the board ═════════════════ */
function DemandPad({
  d,
  now,
  finishing,
  hidden,
  onOpen,
}: {
  d: Demand;
  now: number;
  finishing: boolean;
  hidden: boolean;
  onOpen: () => void;
}) {
  const st = demandState(d, now);
  const nc = d.comments?.length ?? 0;
  const accent = PRIO()[d.priority]?.bar ?? "#2563eb";

  return (
    <Notepad
      accent={accent}
      seed={d.id}
      sheets={Math.min(4, 2 + nc)}
      layoutId={`pad-${d.id}`}
      onOpen={onOpen}
      ariaLabel={`Demanda ${st.label}: ${d.description}`}
      className={hidden ? "invisible" : undefined}
      overlay={
        finishing ? (
          <Stamp text="Concluída" color="#16a34a" />
        ) : st.cls === "late" ? (
          <Stamp text="Expirado" color="#dc2626" faint />
        ) : null
      }
    >
      <span className="flex h-full flex-col px-3.5 pt-2.5 pb-3">
        <span className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: accent }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
            {st.label}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums",
              st.cls === "late" || st.cls === "soon" ? "text-[#dc2626]" : "text-[#6e6e73] dark:text-[#aeaeb2]",
            )}
          >
            {st.cls === "free" ? <IconInfinity className="h-3.5 w-3.5" /> : <IconClockHour4 className="h-3 w-3" />}
            {st.text}
          </span>
        </span>

        <span className="np-text mt-2 line-clamp-5 text-[13px] leading-[22px] break-words whitespace-pre-line">
          {d.description}
        </span>

        <span className="mt-auto">
          {st.cls !== "free" && (
            <span className="mb-2 block h-[3px] overflow-hidden rounded-full bg-black/[.06] dark:bg-white/10">
              <span
                className="block h-full rounded-full transition-[width] duration-1000 ease-linear"
                style={{ width: `${st.pct.toFixed(1)}%`, background: st.color }}
              />
            </span>
          )}
          <span className="flex items-center justify-between text-[11px] text-[#8e8e93]">
            <span>Criada {demandAge(d.createdAt, now)}</span>
            {nc > 0 && (
              <span className="inline-flex items-center gap-1">
                <IconMessageCircle className="h-3 w-3" />
                {nc}
              </span>
            )}
          </span>
        </span>
      </span>
    </Notepad>
  );
}

function Stamp({ text, color, faint }: { text: string; color: string; faint?: boolean }) {
  return (
    <motion.span
      initial={{ scale: 1.8, opacity: 0, rotate: -24 }}
      animate={{ scale: 1, opacity: faint ? 0.55 : 0.95, rotate: -14 }}
      transition={{ type: "spring", stiffness: 420, damping: 18 }}
      className="absolute top-1/2 left-1/2 -mt-5 -ml-[70px] flex h-10 w-[140px] items-center justify-center rounded-md border-[3px] text-sm font-extrabold tracking-[.2em] uppercase"
      style={{ color, borderColor: color, background: faint ? "transparent" : `${color}14` }}
    >
      {text}
    </motion.span>
  );
}

/* ═════════════════ opened views ═════════════════ */
function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/35 backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      {children}
    </div>
  );
}

function SheetFrame({
  layoutId,
  accent,
  onClose,
  children,
  label,
}: {
  layoutId: string;
  accent: string;
  onClose: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <motion.div
      layoutId={layoutId}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className="np-top relative flex max-h-[min(640px,88vh)] w-[min(520px,100%)] flex-col overflow-hidden rounded-[18px] shadow-[0_30px_80px_rgba(0,0,0,.35)]"
    >
      <span className="relative flex h-[22px] shrink-0 items-center justify-evenly px-4" style={{ background: accent }}>
        {Array.from({ length: 11 }, (_, i) => (
          <span key={i} className="np-hole h-[8px] w-[8px] rounded-full" />
        ))}
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className="absolute top-8 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-[#6e6e73] transition-colors hover:bg-black/5 dark:text-[#aeaeb2] dark:hover:bg-white/10"
      >
        <IconX className="h-4 w-4" />
      </button>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 0.12 } }}
        exit={{ opacity: 0, transition: { duration: 0.08 } }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function Composer({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [prio, setPrio] = useState<Priority>("urgente");
  const [shake, setShake] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const t = setTimeout(() => ta.current?.focus(), 180);
    return () => clearTimeout(t);
  }, []);

  const save = () => {
    const desc = text.trim();
    if (!desc) {
      setShake((s) => s + 1);
      ta.current?.focus();
      return;
    }
    addDemand(desc, prio);
    onClose();
  };

  return (
    <Overlay onClose={onClose}>
      <SheetFrame layoutId="pad-new" accent={PRIO()[prio].bar} onClose={onClose} label="Nova demanda">
        <div className="flex flex-col gap-4 p-6 pt-5">
          <div className="text-[17px] font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">Nova demanda</div>
          <motion.textarea
            ref={ta}
            key={shake}
            animate={shake ? { x: [0, -8, 8, -5, 5, 0] } : undefined}
            transition={{ duration: 0.35 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
            }}
            rows={5}
            placeholder="Descreva a demanda..."
            className="np-text w-full resize-none bg-transparent text-[14px] leading-[22px] outline-none placeholder:text-[#aeaeb2] dark:placeholder:text-[#636366]"
          />
          <div className="flex flex-wrap gap-1.5">
            {PRIO_ORDER.map((p) => {
              const sel = p === prio;
              const c = PRIO()[p].bar;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrio(p)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold transition-all",
                    sel ? "text-white shadow-sm" : "border-black/10 text-[#3a3a3c] dark:border-white/15 dark:text-[#d1d1d6]",
                  )}
                  style={sel ? { background: c, borderColor: c } : undefined}
                >
                  {PRIO_SHORT[p]}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-[11px] text-[#aeaeb2] dark:text-[#636366]">Ctrl + Enter para salvar</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-3.5 py-1.5 text-[13px] font-medium text-[#6e6e73] hover:bg-black/5 dark:text-[#aeaeb2] dark:hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded-full bg-tely-blue px-4 py-1.5 text-[13px] font-semibold text-white shadow-[0_4px_14px_rgba(6,73,252,.3)] hover:bg-[#0540d4]"
            >
              Salvar
            </button>
          </div>
        </div>
      </SheetFrame>
    </Overlay>
  );
}

function DemandSheet({
  d,
  now,
  onClose,
  onFinish,
  onDelete,
}: {
  d: Demand;
  now: number;
  onClose: () => void;
  onFinish: () => void;
  onDelete: () => void;
}) {
  const st = demandState(d, now);
  const accent = PRIO()[d.priority]?.bar ?? "#2563eb";
  const [comment, setComment] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const comments = d.comments ?? [];

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [comments.length]);

  const send = () => {
    const t = comment.trim();
    if (!t) return;
    addComment(d.id, t);
    setComment("");
  };

  return (
    <Overlay onClose={onClose}>
      <SheetFrame layoutId={`pad-${d.id}`} accent={accent} onClose={onClose} label="Demanda">
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-6 pt-5">
          <div className="flex flex-wrap items-center gap-3 pr-8">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
              style={{ background: accent }}
            >
              {st.label}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[13px] font-semibold tabular-nums",
                st.cls === "late" || st.cls === "soon" ? "text-[#dc2626]" : "text-[#3a3a3c] dark:text-[#d1d1d6]",
              )}
            >
              {st.cls === "free" ? <IconInfinity className="h-4 w-4" /> : <IconClockHour4 className="h-3.5 w-3.5" />}
              {st.text}
            </span>
            <span className="text-xs text-[#8e8e93]">Criada {demandAge(d.createdAt, now)}</span>
          </div>

          {st.cls !== "free" && (
            <span className="block h-1 overflow-hidden rounded-full bg-black/[.06] dark:bg-white/10">
              <span className="block h-full rounded-full" style={{ width: `${st.pct.toFixed(1)}%`, background: st.color }} />
            </span>
          )}

          <p className="np-text text-[15px] leading-[22px] break-words whitespace-pre-line">{d.description}</p>

          <div className="flex min-h-0 flex-col gap-2 border-t border-black/[.06] pt-3 dark:border-white/[.08]">
            <div className="text-[11px] font-semibold tracking-wider text-[#8e8e93] uppercase">
              Comentários {comments.length > 0 && `· ${comments.length}`}
            </div>
            <div ref={list} className="flex max-h-[180px] min-h-0 flex-col gap-1.5 overflow-y-auto">
              {comments.length ? (
                comments.map((c, i) => (
                  <motion.div
                    key={`${c.at}-${i}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-2 rounded-lg bg-black/[.035] px-2.5 py-1.5 text-[13px] dark:bg-white/[.06]"
                  >
                    <span className="shrink-0 font-medium text-[#8e8e93] tabular-nums">
                      {new Date(c.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="np-text break-words">{c.text}</span>
                  </motion.div>
                ))
              ) : (
                <div className="text-[13px] text-[#aeaeb2] dark:text-[#636366]">Sem comentários ainda</div>
              )}
            </div>
            <div className="flex items-center gap-2 rounded-full border border-black/10 py-1 pr-1 pl-3.5 dark:border-white/15">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Comentar..."
                className="np-text min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#aeaeb2] dark:placeholder:text-[#636366]"
              />
              <button
                type="button"
                onClick={send}
                aria-label="Comentar"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-tely-blue text-white hover:bg-[#0540d4]"
              >
                <IconSend2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onFinish}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#16a34a] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_4px_14px_rgba(22,163,74,.3)] hover:bg-[#15803d]"
            >
              <IconCheck className="h-4 w-4" stroke={2.6} /> Finalizar
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Excluir demanda"
              title="Excluir demanda"
              className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dc2626]/30 text-[#dc2626] transition-colors hover:bg-[#dc2626]/10"
            >
              <IconTrash className="h-4 w-4" />
            </button>
          </div>
        </div>
      </SheetFrame>
    </Overlay>
  );
}
