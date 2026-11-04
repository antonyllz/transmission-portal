"use client";
/**
 * Notepad — a pad of paper drawn as an object, in the spirit of
 * "Glass Folder Cards": real layers that move independently.
 *
 *  - back sheets (the rest of the pad) under a top sheet with a coloured
 *    binding strip — the accent says the priority;
 *  - **Rest**: lying slightly askew (angle seeded by the pad's id);
 *  - **Hover / focus**: straightens up, lifts toward you and follows the
 *    cursor in 3D, the sheets underneath fan out and the corner curls;
 *  - **Enter**: drops onto the table with a spring when created.
 *
 * Pure presentation: content, click and accent come from the caller.
 */
import * as React from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

export type NotepadProps = {
  /** Binding-strip colour. */
  accent: string;
  /** Any string/number; gives the pad its resting angle. */
  seed?: string | number;
  /** How many sheets show under the top one. */
  sheets?: number;
  /** Dashed, empty pad — the "new" slot. */
  blank?: boolean;
  /** Shared-layout id, so the pad can morph into an opened view. */
  layoutId?: string;
  /** Drawn over the top sheet (e.g. a rubber stamp). */
  overlay?: React.ReactNode;
  onOpen?: () => void;
  ariaLabel?: string;
  className?: string;
  children?: React.ReactNode;
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const SPRING = { stiffness: 260, damping: 22, mass: 0.6 };

export function Notepad({
  accent,
  seed = 0,
  sheets = 3,
  blank = false,
  layoutId,
  overlay,
  onOpen,
  ariaLabel,
  className,
  children,
}: NotepadProps) {
  const h = hash(String(seed));
  const restAngle = ((h % 1000) / 1000 - 0.5) * 5; // −2.5° … 2.5°
  const [hover, setHover] = React.useState(false);

  /* cursor-following tilt */
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotX = useSpring(useTransform(py, [0, 1], [7, -7]), SPRING);
  const rotY = useSpring(useTransform(px, [0, 1], [-9, 9]), SPRING);

  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const reset = () => {
    setHover(false);
    px.set(0.5);
    py.set(0.5);
  };

  return (
    <motion.div
      layout
      layoutId={layoutId}
      initial={{ opacity: 0, y: -36, scale: 0.92, rotate: restAngle * 3 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      exit={{ opacity: 0, scale: 0.85, y: 12, transition: { duration: 0.22 } }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={cn("relative h-[232px] w-[212px] shrink-0 [perspective:900px]", hover ? "z-20" : "z-0", className)}
    >
      <motion.button
        type="button"
        aria-label={ariaLabel}
        onClick={onOpen}
        onPointerEnter={() => setHover(true)}
        onPointerMove={onMove}
        onPointerLeave={reset}
        onFocus={() => setHover(true)}
        onBlur={reset}
        style={{ rotateX: hover ? rotX : 0, rotateY: hover ? rotY : 0, transformStyle: "preserve-3d" }}
        animate={{ rotate: hover ? 0 : restAngle, y: hover ? -10 : 0, scale: hover ? 1.04 : 1 }}
        transition={{ type: "spring", ...SPRING }}
        className="group relative block h-full w-full cursor-pointer rounded-[14px] text-left outline-none focus-visible:ring-2 focus-visible:ring-tely-blue focus-visible:ring-offset-4 focus-visible:ring-offset-transparent"
      >
        {/* the rest of the pad — sheets underneath that fan out on hover */}
        {!blank &&
          Array.from({ length: sheets }, (_, i) => {
            const k = sheets - i; // farthest first
            const dir = (h >> k) & 1 ? 1 : -1;
            return (
              <motion.span
                key={k}
                aria-hidden="true"
                className="np-sheet absolute inset-0 rounded-[14px]"
                animate={{
                  x: hover ? dir * k * 7 : k * 1.5,
                  y: hover ? k * 5 : k * 2.5,
                  rotate: hover ? dir * k * 3.2 : dir * k * 0.6,
                }}
                transition={{ type: "spring", ...SPRING }}
                style={{ zIndex: -k }}
              />
            );
          })}

        {/* top sheet */}
        <span
          className={cn(
            "absolute inset-0 flex flex-col overflow-hidden rounded-[14px] transition-shadow duration-300",
            blank
              ? "np-blank border-2 border-dashed"
              : "np-top np-ruled shadow-[0_2px_6px_rgba(0,0,0,.06),0_8px_24px_rgba(0,0,0,.06)] group-hover:shadow-[0_10px_20px_rgba(0,0,0,.10),0_24px_48px_rgba(0,0,0,.14)]",
          )}
        >
          {!blank && (
            <span className="relative flex h-[18px] shrink-0 items-center justify-evenly px-3" style={{ background: accent }}>
              {Array.from({ length: 7 }, (_, i) => (
                <span key={i} className="np-hole h-[7px] w-[7px] rounded-full" />
              ))}
            </span>
          )}
          <span className="relative flex min-h-0 flex-1 flex-col">{children}</span>

          {/* curling corner */}
          {!blank && (
            <span
              aria-hidden="true"
              className="np-curl pointer-events-none absolute right-0 bottom-0 h-0 w-0 transition-all duration-300 ease-out group-hover:h-[26px] group-hover:w-[26px]"
            />
          )}
        </span>

        {overlay && <span className="pointer-events-none absolute inset-0 z-10">{overlay}</span>}
      </motion.button>
    </motion.div>
  );
}

export default Notepad;
