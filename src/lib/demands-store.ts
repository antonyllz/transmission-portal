/* ═══════════════════════════════════════════════════════════════
   DEMANDS STORE — bridge between the React notepad board and the
   portal's existing plain-JS data layer (assets/js/database.js +
   demands.js). Same data, same /api/demands sync, same polling:
   React only replaces the rendering.
   ═══════════════════════════════════════════════════════════════ */
import { useSyncExternalStore } from "react";

export type Priority = "urgente" | "media" | "baixa" | "sempre";

export type DemandComment = { text: string; at: string };

export type Demand = {
  id: string;
  description: string;
  priority: Priority;
  createdAt: string;
  /** seconds until the deadline; null = no deadline */
  duration: number | null;
  comments?: DemandComment[];
};

type PrioDef = { label: string; dur: number | null; bar: string };

declare global {
  interface Window {
    dmdGetAll?: () => Demand[];
    dmdSave?: (all: Demand[]) => void;
    renderNoteBoard?: () => void;
    renderNotifDemands?: () => void;
    notifOpen?: boolean;
    PRIO?: Record<Priority, PrioDef>;
  }
}

/* same values as PRIO in assets/js/demands.js (used if that script isn't loaded) */
const PRIO_FALLBACK: Record<Priority, PrioDef> = {
  urgente: { label: "Urgente", dur: 6 * 3600, bar: "#dc2626" },
  media: { label: "Média", dur: 24 * 3600, bar: "#ea580c" },
  baixa: { label: "Baixa", dur: 7 * 24 * 3600, bar: "#2563eb" },
  sempre: { label: "Sem prazo", dur: null, bar: "#7c3aed" },
};
export const PRIO = (): Record<Priority, PrioDef> => window.PRIO ?? PRIO_FALLBACK;
export const PRIO_ORDER: Priority[] = ["urgente", "media", "baixa", "sempre"];

const EMPTY: Demand[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/* The plain-JS app calls renderNoteBoard() whenever demands change
   (first sync, polling from other users). Route that to React. */
let hooked = false;
function hookLegacyRender() {
  if (hooked) return;
  hooked = true;
  window.renderNoteBoard = notify;
}

function subscribe(cb: () => void) {
  hookLegacyRender();
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const getSnapshot = () => window.dmdGetAll?.() ?? EMPTY;

export function useDemands() {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

function save(next: Demand[]) {
  window.dmdSave?.(next);
  notify();
  if (window.notifOpen) window.renderNotifDemands?.();
}

export function addDemand(description: string, priority: Priority) {
  const d: Demand = {
    id: String(Date.now()),
    description,
    priority,
    createdAt: new Date().toISOString(),
    duration: PRIO()[priority].dur,
    comments: [],
  };
  save([d, ...getSnapshot()]);
  return d;
}

export function addComment(id: string, text: string) {
  save(
    getSnapshot().map((d) =>
      d.id === id ? { ...d, comments: [...(d.comments ?? []), { text, at: new Date().toISOString() }] } : d,
    ),
  );
}

export function removeDemand(id: string) {
  save(getSnapshot().filter((d) => d.id !== id));
}

/* ── time state: same rules as dmdState() in demands.js ── */
export type DemandState = {
  label: string;
  color: string;
  pct: number;
  text: string;
  cls: "" | "soon" | "late" | "free";
};

export function fmtCountdown(sec: number) {
  if (sec <= 0) return "Expirado";
  const p = (n: number) => String(n).padStart(2, "0");
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${p(h)}h ${p(m)}m` : `${p(h)}h ${p(m)}m`;
}

export function demandState(d: Demand, now: number): DemandState {
  const p = PRIO()[d.priority] ?? PRIO().baixa;
  if (d.duration == null) return { label: p.label, color: p.bar, pct: 0, text: "Sem prazo", cls: "free" };
  const elapsed = Math.floor((now - Date.parse(d.createdAt)) / 1000);
  const rem = Math.max(0, d.duration - elapsed);
  const pct = Math.min(100, (elapsed / d.duration) * 100);
  if (rem <= 0) return { label: p.label, color: "#dc2626", pct: 100, text: "Expirado", cls: "late" };
  const soon = rem < 1800;
  return { label: p.label, color: soon ? "#dc2626" : p.bar, pct, text: fmtCountdown(rem), cls: soon ? "soon" : "" };
}

export function demandAge(iso: string, now: number) {
  const m = Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}
