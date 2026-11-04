/* Entry point of the portal's React islands.
   Built by Vite into assets/react/portal.js + portal.css (see vite.config.mts);
   each island mounts into its own placeholder in index.html, if present. */
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { PortalDock } from "@/components/portal-dock";
import { NetworkEventsDashboard } from "@/components/network-events";
import { DemandsBoard } from "@/components/demands-board";
import "./portal.css";

const ISLANDS: Record<string, ReactNode> = {
  "dock-root": <PortalDock />,
  "events-root": <NetworkEventsDashboard />,
  "demands-root": <DemandsBoard />,
};

for (const [id, node] of Object.entries(ISLANDS)) {
  const el = document.getElementById(id);
  if (el) createRoot(el).render(<StrictMode>{node}</StrictMode>);
}
