/* ═══════════════════════════════════════════════════════════════
   NETWORK EVENTS — data source of the home dashboard
   ───────────────────────────────────────────────────────────────
   For now this returns SIMULATED data (flag `simulated: true`, shown
   on screen as "Dados simulados"). When the real collection exists,
   replace the body of `fetchNetworkSnapshot()` with the API call
   (e.g. `fetch('/api/network/events')`) returning the same shape —
   the dashboard doesn't need to change.
   ═══════════════════════════════════════════════════════════════ */

export type EventStatus = "down" | "degraded";
export type AlarmSeverity = "critical" | "major" | "minor";

/** An active event on a network site (from the future site/route collection). */
export type NetworkEvent = {
  id: string;
  site: string;
  uf: string;
  status: EventStatus;
  /** ISO timestamp of when the event started. */
  since: string;
  /** Where the event came from (collector name). */
  source: string;
  detail?: string;
};

/** An active alarm from the Padtec NMS. */
export type PadtecAlarm = {
  id: string;
  /** Network element as shown in the NMS, e.g. "SPVL-HB CGE-A01". */
  element: string;
  /** Alarm text, e.g. "Indisponível". */
  status: string;
  severity: AlarmSeverity;
  since: string;
};

export type NetworkSnapshot = {
  events: NetworkEvent[];
  padtecAlarms: PadtecAlarm[];
  updatedAt: string;
  /** true while the data is mocked — the UI shows a badge. */
  simulated: boolean;
};

/* stable "started at" for the mock, so the durations keep counting during the session */
const T0 = Date.now();
const ago = (min: number) => new Date(T0 - min * 60000).toISOString();

const MOCK: Omit<NetworkSnapshot, "updatedAt"> = {
  simulated: true,
  events: [
    { id: "ev-cge", site: "Campina Grande", uf: "PB", status: "down", since: ago(157), source: "Coleta a definir" },
    { id: "ev-sp", site: "São Paulo", uf: "SP", status: "down", since: ago(48), source: "Coleta a definir" },
  ],
  padtecAlarms: [
    { id: "pd-spvl", element: "SPVL-HB CGE-A01", status: "Indisponível", severity: "critical", since: ago(312) },
  ],
};

export async function fetchNetworkSnapshot(): Promise<NetworkSnapshot> {
  return { ...MOCK, updatedAt: new Date().toISOString() };
}
