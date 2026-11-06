/* ═══════════════════════════════════════════════════════════════
   CHRISTMAS THEME — on/off
   • Turns itself on between SEASON.from and SEASON.to (MM-DD, inclusive,
     wrapping over New Year). Outside that window the portal is normal.
   • Each viewer can switch it off/on with the ❄ button in the topbar
     (kept in localStorage, so it's per browser).
   • While on, <html> gets the class "xmas" (CSS hooks: snow cap on the
     banner, Santa hat on the dock, festive hero map in assets/js/home.js).
   ═══════════════════════════════════════════════════════════════ */
import { useSyncExternalStore } from "react";

export const SEASON = { from: "11-01", to: "01-06" };

const KEY = "portal-xmas-off";

export function inSeason(d = new Date()) {
  const md = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return SEASON.from <= SEASON.to ? md >= SEASON.from && md <= SEASON.to : md >= SEASON.from || md <= SEASON.to;
}

function readOff() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();
let off = readOff();

function apply() {
  document.documentElement.classList.toggle("xmas", inSeason() && !off);
}
apply();

export function setXmasOff(v: boolean) {
  off = v;
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    /* private mode — still toggles for this page */
  }
  apply();
  listeners.forEach((l) => l());
}

/** [season, enabled] — enabled = in season and not switched off by this viewer */
export function useXmas(): { season: boolean; enabled: boolean } {
  const isOff = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => off,
  );
  const season = inSeason();
  return { season, enabled: season && !isOff };
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
