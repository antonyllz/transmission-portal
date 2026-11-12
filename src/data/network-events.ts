/* ═══════════════════════════════════════════════════════════════
   NETWORK EVENTS — data source of the home dashboard
   ───────────────────────────────────────────────────────────────
   • Segments (trechos): REAL — Zabbix events that aren't Amazon Leo,
     from GET /api/network/events (server/netevents.js). Both ends of
     a link report the same segment, so events are grouped by it.
   • Padtec alarms: REAL — GET /api/network/padtec (server/padtec.js reads
     the NMS every minute and keeps "Via A/B" = energia, "Temperatura" and
     "Tempo de resposta" alarms).
   • DWDM Padtec alarms: REAL — Zabbix events of hosts in the host group
     PADTEC, from GET /api/network/dwdm (server/zabbix.js).
   • Locality names: GET /api/network/localities (DWDM map + the
     entries added on the "Localidades" page).
   ═══════════════════════════════════════════════════════════════ */

export type NodeRef = { uf: string; loc: string; key: string; site: string; device: string };

export type NetEvent = {
  id: string;
  host: string;
  trigger: string;
  severity: number;
  severityName: string;
  status: "active" | "resolved";
  acknowledged: boolean;
  start: string;
  end: string | null;
  a: NodeRef | null;
  b: NodeRef | null;
  /** "PE-AIN x PE-TIU" (sorted), or one end only when the far end isn't named */
  key: string | null;
  iface: string | null;
  speed: string | null;
  role: string | null;
};

/** A segment = all events of the same pair of localities. */
export type Trecho = {
  key: string;
  a: NodeRef | null;
  b: NodeRef | null;
  events: NetEvent[];
  since: string;
  until: string | null;
  acknowledged: boolean;
};

export type Locality = { key: string; uf: string; code: string; name: string; source: "map" | "manual" };
export type UnknownLocality = { key: string; uf: string; code: string; count: number; lastSeen: string | null };
export type LocalitiesData = { ufs: Record<string, string>; items: Locality[]; unknown: UnknownLocality[] };

export type AlarmSeverity = "critical" | "major" | "minor" | "warning";
export type PadtecCategory = "energia" | "temperatura" | "resposta";
export type PadtecAlarm = {
  id: string;
  name: string;
  category: PadtecCategory;
  severity: AlarmSeverity;
  site: string;
  card: string;
  model: string;
  family: string;
  resource: string;
  start: string | null;
  acknowledged: boolean;
  ackAt: string | null;
};
export type PadtecStatus = { configured: boolean; ok: boolean; error: string | null; updatedAt: string | null };

/** Zabbix severity: 0 not classified … 5 disaster */
export type ZbxSeverity = 0 | 1 | 2 | 3 | 4 | 5;
export type DwdmAlarm = {
  id: string;
  host: string;
  trigger: string;
  opdata: string;
  severity: ZbxSeverity;
  severityName: string;
  status: "active" | "resolved";
  /** acknowledged in Zabbix */
  acknowledged: boolean;
  /** acknowledged in the portal (when) */
  ackAt: string | null;
  start: string;
  end: string | null;
};
export const dwdmAcked = (a: DwdmAlarm) => a.acknowledged || !!a.ackAt;
export async function ackDwdm(id: string, ack: boolean) {
  const r = await fetch("/api/network/dwdm/ack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ack }),
  });
  if (!r.ok) throw new Error(`ack failed: ${r.status}`);
  return (await r.json()) as { ok: boolean; ackAt: string | null };
}
export type DwdmData = {
  group: string;
  active: DwdmAlarm[];
  resolved: DwdmAlarm[];
  receivingSince: string | null;
  lastReceivedAt: string | null;
  ok: boolean;
};

export type NetworkSnapshot = {
  trechos: Trecho[];
  resolved: Trecho[];
  dwdm: DwdmData;
  padtecAlarms: PadtecAlarm[];
  padtec: PadtecStatus;
  localities: Record<string, Locality>;
  updatedAt: string;
  lastReceivedAt: string | null;
  receivingSince: string | null;
};

const SEV_RANK: Record<AlarmSeverity, number> = { critical: 0, major: 1, minor: 2, warning: 3 };

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json() as Promise<T>;
}

export function fetchLocalities() {
  return getJSON<LocalitiesData>("/api/network/localities");
}

/* manual entries live in the plain "localities" collection (GET/PUT /api/localities) */
export type ManualLocality = { uf: string; code: string; name: string };
export function fetchManualLocalities() {
  return getJSON<ManualLocality[]>("/api/localities");
}
export async function saveManualLocalities(list: ManualLocality[]) {
  const r = await fetch("/api/localities", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(list),
  });
  if (!r.ok) throw new Error(`save failed: ${r.status}`);
}

function group(events: NetEvent[]): Trecho[] {
  const map = new Map<string, Trecho>();
  for (const e of events) {
    const k = e.key ?? `event-${e.id}`;
    let t = map.get(k);
    if (!t) {
      t = { key: k, a: e.a, b: e.b, events: [], since: e.start, until: e.end, acknowledged: true };
      map.set(k, t);
    }
    t.events.push(e);
    if (e.start < t.since) t.since = e.start;
    if (e.end && (!t.until || e.end > t.until)) t.until = e.end;
    if (!t.b && e.b) t.b = e.b;
    t.acknowledged = t.acknowledged && e.acknowledged;
  }
  return [...map.values()];
}

export async function fetchNetworkSnapshot(): Promise<NetworkSnapshot> {
  const [ev, loc, pd, dw] = await Promise.all([
    getJSON<{ active: NetEvent[]; resolved: NetEvent[]; lastReceivedAt: string | null; receivingSince: string | null }>(
      "/api/network/events",
    ),
    fetchLocalities(),
    getJSON<PadtecStatus & { alarms: PadtecAlarm[] }>("/api/network/padtec").catch(
      (): PadtecStatus & { alarms: PadtecAlarm[] } => ({ configured: true, ok: false, error: "API indisponível", updatedAt: null, alarms: [] }),
    ),
    getJSON<Omit<DwdmData, "ok">>("/api/network/dwdm")
      .then((d): DwdmData => ({ ...d, ok: true }))
      .catch((): DwdmData => ({ group: "PADTEC", active: [], resolved: [], receivingSince: null, lastReceivedAt: null, ok: false })),
  ]);
  const bySeverity = (x: DwdmAlarm, y: DwdmAlarm) => y.severity - x.severity || y.start.localeCompare(x.start);
  const activeKeys = new Set(group(ev.active).map((t) => t.key));
  return {
    trechos: group(ev.active).sort((x, y) => x.since.localeCompare(y.since)),
    /* resolved segments that aren't still down through another link */
    resolved: group(ev.resolved)
      .filter((t) => !activeKeys.has(t.key))
      .sort((x, y) => String(y.until).localeCompare(String(x.until))),
    dwdm: {
      ...dw,
      active: [...dw.active].sort(bySeverity),
      resolved: [...dw.resolved].sort((x, y) => String(y.end).localeCompare(String(x.end))),
    },
    padtecAlarms: [...pd.alarms].sort(
      (x, y) => SEV_RANK[x.severity] - SEV_RANK[y.severity] || String(y.start).localeCompare(String(x.start)),
    ),
    padtec: { configured: pd.configured, ok: pd.ok, error: pd.error, updatedAt: pd.updatedAt },
    localities: Object.fromEntries(loc.items.map((l) => [l.key, l])),
    updatedAt: new Date().toISOString(),
    lastReceivedAt: ev.lastReceivedAt,
    receivingSince: ev.receivingSince,
  };
}

/** "Aliança" for PE-AIN, or the code itself when unknown. */
export function placeName(n: NodeRef | null, locs: Record<string, Locality>) {
  if (!n) return "—";
  return locs[n.key]?.name ?? n.key;
}
