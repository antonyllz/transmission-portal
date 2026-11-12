/* Animated line icons for the dock (24×24, stroke = currentColor).
   Each one has a slow idle motion that says what the tool does; hovering
   the dock item plays it faster. Keyframes live in src/portal.css (.di-*). */
import { useId, type SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "di h-full w-full overflow-visible",
  "aria-hidden": true,
};

/** Home — smoke curls from the chimney; the door swings open on hover. */
export const HomeIcon = () => (
  <svg {...base}>
    <g className="di-home">
      <circle className="di-smoke" cx="17.1" cy="3.2" r=".9" />
      <circle className="di-smoke di-smoke2" cx="17.1" cy="3.2" r=".7" />
      <path d="M16 7.6V4.6h2.2v4.8" />
      <path d="M3 11.6 12 4.4l9 7.2" />
      <path d="M5 10.2v10.3h14V10.2" />
      <path className="di-door" d="M10 20.5v-5.2h4v5.2" />
    </g>
  </svg>
);

/** RMAs — the box hops and settles, like a package being shipped back. */
export const RmaIcon = () => (
  <svg {...base}>
    <g className="di-box">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline className="di-lid" points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </g>
  </svg>
);

/** Lambdas — light runs along the fibers, each node blinks in turn. */
export const LambdaIcon = () => (
  <svg {...base}>
    <g className="di-net">
      <path className="di-edge" d="M7 6h10" />
      <path className="di-edge" d="M6 8l5 8.5" />
      <path className="di-edge" d="M18 8l-5 8.5" />
      <circle className="di-node" cx="5" cy="6" r="2" />
      <circle className="di-node di-n2" cx="19" cy="6" r="2" />
      <circle className="di-node di-n3" cx="12" cy="18" r="2" />
    </g>
  </svg>
);

/** LOA — the lines write themselves and a signature is drawn. */
export const LoaIcon = () => (
  <svg {...base}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline className="di-fold" points="14 2 14 8 20 8" />
    <line className="di-line" x1="8" y1="11.5" x2="15" y2="11.5" />
    <line className="di-line di-l2" x1="8" y1="14.5" x2="13" y2="14.5" />
    <path className="di-sign" pathLength={1} d="M7.8 18.6c.9-1.6 1.7-1.6 2 0 .3 1.4 1.2 1.3 2-.3.6-1.1 1.3-.9 1.6.2.3.9 1 .8 2.6.1" />
  </svg>
);

/** RFO — an outage trace is drawn across the report. */
export const RfoIcon = () => (
  <svg {...base}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline className="di-fold" points="14 2 14 8 20 8" />
    <line className="di-line" x1="8" y1="11" x2="12.5" y2="11" />
    <path className="di-trace" pathLength={1} d="M6.8 16.2h2.4l1.3-2.6 1.9 5 1.5-3.6.8 1.2h2.5" />
  </svg>
);

/** Almoxarifado — the roll-up door of the warehouse opens on a box and closes again. */
export const WarehouseIcon = () => {
  const clip = `di-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg {...base}>
      <defs>
        <clipPath id={clip}>
          <rect x="8" y="13" width="8" height="7.5" />
        </clipPath>
      </defs>
      <path d="M2.5 9.8 12 4l9.5 5.8" />
      <path d="M4.5 8.8v11.7h15V8.8" />
      <path d="M8 20.5V13h8v7.5" />
      <rect className="di-crate" x="10.3" y="17.2" width="3.4" height="3.3" rx=".3" />
      <g clipPath={`url(#${clip})`}>
        <g className="di-slats">
          <path d="M8 15h8M8 17h8M8 19h8" />
        </g>
      </g>
    </svg>
  );
};

/** Janelas programadas — a calendar whose scheduled slot fills in while the
    little clock's hand sweeps around. */
export const WindowIcon = () => (
  <svg {...base}>
    <path d="M20 11V6.5A1.5 1.5 0 0 0 18.5 5h-13A1.5 1.5 0 0 0 4 6.5v12A1.5 1.5 0 0 0 5.5 20H11" />
    <path className="di-ring" d="M8 3v4" />
    <path className="di-ring di-ring2" d="M16 3v4" />
    <path d="M4 10h16" />
    <rect className="di-slot" x="7" y="12.6" width="5" height="3" rx=".6" fill="currentColor" stroke="none" />
    <circle cx="17.5" cy="17.5" r="4" />
    <path className="di-hand" d="M17.5 15.6v1.9l1.3.9" />
  </svg>
);
