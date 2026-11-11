import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { prefersReducedMotion } from "./season";

/* The three Santas take turns, always starting with Santa 3:
   • "peek": Santa 3 (or Santa 1) rises from the bottom-right corner, leans in, says
     something, and ducks back down;
   • "walk": Santa 2 walks across the bottom of the screen, right to left,
     with a little bounce in his step and a line of his own.
   Clicking either one makes him hop with a burst of snowflakes and stars.
   Only the Santas themselves take clicks — the rest of the page is free. */

const SANTA_1 = "assets/images/xmas/santa-1.webp";
const SANTA_2 = "assets/images/xmas/santa-2.webp";
const SANTA_3 = "assets/images/xmas/santa-3.webp";

const LINES = [
  "Ho ho ho! 🎅",
  "Feliz Natal, time de Transmissão! 🎄",
  "Nenhum trecho down é o melhor presente 🎁",
  "Quem pediu 400G de presente? 📦",
  "Boas festas e OSNR alto! ✨",
  "Já confirmou o OTDR pro Natal? 😄",
  "Que 2027 venha sem rompimento! 🙏",
];

const FIRST_DELAY = 3500;
const GAP = 22000;

type Act = "peek3" | "walk" | "peek1";
/* the order they show up in; Santa 3 is the first one on every page load */
const ORDER: Act[] = ["peek3", "walk", "peek1", "walk"];
/* the peeking Santas: image and box size (keeps each image's proportions) */
const PEEK = {
  peek1: { src: SANTA_1, box: "h-[230px] w-[103px] sm:h-[300px] sm:w-[134px]" },
  peek3: { src: SANTA_3, box: "h-[230px] w-[127px] sm:h-[300px] sm:w-[165px]" },
};

function pick(prev?: string) {
  let s = LINES[Math.floor(Math.random() * LINES.length)];
  if (s === prev) s = LINES[(LINES.indexOf(s) + 1) % LINES.length];
  return s;
}

export function Santas() {
  const [act, setAct] = useState<Act | null>(null);
  const [line, setLine] = useState(LINES[0]);
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);
  const turn = useRef(0);
  const first = useRef(true);
  const reduced = prefersReducedMotion();

  /* take turns forever; each act ends itself by calling done(). While the tab
     is hidden nobody shows up — check again a bit later. */
  useEffect(() => {
    if (act) return;
    let t: ReturnType<typeof setTimeout>;
    const schedule = (ms: number) => {
      t = setTimeout(() => {
        if (document.hidden) return schedule(5000);
        setLine((l) => pick(l));
        setAct(ORDER[turn.current++ % ORDER.length]);
      }, ms);
    };
    schedule(first.current ? FIRST_DELAY : GAP);
    first.current = false;
    return () => clearTimeout(t);
  }, [act]);

  const done = useCallback(() => setAct(null), []);

  const pop = (e: React.MouseEvent) => {
    const id = Date.now() + Math.random();
    setBursts((b) => [...b, { id, x: e.clientX, y: e.clientY }]);
    setLine((l) => pick(l));
    setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1400);
  };

  return (
    <>
      <AnimatePresence>
        {(act === "peek1" || act === "peek3") && (
          <Peek key={act} {...PEEK[act]} line={line} onDone={done} onPop={pop} reduced={reduced} />
        )}
        {act === "walk" && <Walk key="walk" line={line} onDone={done} onPop={pop} reduced={reduced} />}
      </AnimatePresence>
      {bursts.map((b) => (
        <Burst key={b.id} x={b.x} y={b.y} />
      ))}
    </>
  );
}

function Bubble({ text, side }: { text: string; side: "left" | "right" }) {
  return (
    <motion.div
      key={text}
      initial={{ opacity: 0, scale: 0.6, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
      className={
        "xmas-bubble pointer-events-none absolute -top-2 w-max max-w-[220px] rounded-2xl px-3.5 py-2 text-[13px] leading-snug font-semibold " +
        (side === "left" ? "right-[78%] origin-bottom-right" : "left-[78%] origin-bottom-left")
      }
    >
      {text}
    </motion.div>
  );
}

/* Santa 1 / Santa 3 — rises from the bottom-right corner, stays a few seconds, ducks back */
function Peek({
  src,
  box,
  line,
  onDone,
  onPop,
  reduced,
}: {
  src: string;
  box: string;
  line: string;
  onDone: () => void;
  onPop: (e: React.MouseEvent) => void;
  reduced: boolean;
}) {
  const [talk, setTalk] = useState(false);
  const [hop, setHop] = useState(0);
  useEffect(() => {
    const a = setTimeout(() => setTalk(true), 900);
    const b = setTimeout(onDone, 7500);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [onDone]);
  return (
    <motion.div
      className={"fixed right-6 bottom-0 z-[245] " + box}
      initial={{ y: "100%", rotate: 8 }}
      animate={{ y: "28%", rotate: -4 }}
      exit={{ y: "105%", rotate: 10, transition: { duration: 0.55, ease: [0.5, 0, 0.75, 0] } }}
      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 14 }}
    >
      <AnimatePresence>{talk && <Bubble text={line} side="left" />}</AnimatePresence>
      <motion.img
        src={src}
        alt="Papai Noel"
        draggable={false}
        onClick={(e) => {
          onPop(e);
          setHop((h) => h + 1);
          setTalk(true);
        }}
        key={hop}
        animate={hop ? { y: [0, -36, 0], rotate: [0, -6, 4, 0] } : { rotate: [-2, 2, -2] }}
        transition={hop ? { duration: 0.6 } : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        className="xmas-santa pointer-events-auto h-full w-full cursor-pointer object-contain select-none"
      />
    </motion.div>
  );
}

/* Santa 2 — walks across the bottom of the screen, right to left */
function Walk({ line, onDone, onPop, reduced }: { line: string; onDone: () => void; onPop: (e: React.MouseEvent) => void; reduced: boolean }) {
  const [talk, setTalk] = useState(false);
  const [hop, setHop] = useState(0);
  const dur = reduced ? 0.01 : Math.min(16, Math.max(9, window.innerWidth / 110));
  useEffect(() => {
    const a = setTimeout(() => setTalk(true), dur * 250);
    const b = setTimeout(() => setTalk(false), dur * 750);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [dur]);
  return (
    <motion.div
      className="fixed bottom-1 left-0 z-[245] h-[170px] w-[81px] sm:h-[210px] sm:w-[100px]"
      initial={{ x: "calc(100vw + 20px)" }}
      animate={{ x: "-140px" }}
      transition={{ duration: dur, ease: "linear" }}
      onAnimationComplete={onDone}
    >
      <AnimatePresence>{talk && <Bubble text={line} side="right" />}</AnimatePresence>
      {/* the step: bob up and down, rock side to side */}
      <motion.div
        className="h-full w-full"
        animate={reduced ? undefined : { y: [0, -7, 0, -7, 0], rotate: [-3, 3, -3, 3, -3] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
      >
        <motion.img
          src={SANTA_2}
          alt="Papai Noel"
          draggable={false}
          key={hop}
          onClick={(e) => {
            onPop(e);
            setHop((h) => h + 1);
            setTalk(true);
          }}
          animate={hop ? { y: [0, -40, 0] } : undefined}
          transition={{ duration: 0.55 }}
          className="xmas-santa pointer-events-auto h-full w-full cursor-pointer object-contain select-none"
        />
      </motion.div>
    </motion.div>
  );
}

/* click burst: snowflakes and stars flying out and falling */
function Burst({ x, y }: { x: number; y: number }) {
  const parts = useRef(
    Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
      const d = 60 + Math.random() * 70;
      return { dx: Math.cos(a) * d, dy: Math.sin(a) * d - 30, ch: i % 3 === 0 ? "✦" : "❄", s: 12 + Math.random() * 10, r: Math.random() * 360 };
    }),
  ).current;
  return (
    <div className="pointer-events-none fixed z-[246]" style={{ left: x, top: y }} aria-hidden="true">
      {parts.map((p, i) => (
        <motion.span
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2 select-none"
          style={{ fontSize: p.s, color: p.ch === "✦" ? "#ffd166" : "#fff", textShadow: "0 0 6px rgba(120,170,255,.9)" }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
          animate={{ x: p.dx, y: [0, p.dy, p.dy + 60], opacity: [1, 1, 0], scale: 1, rotate: p.r }}
          transition={{ duration: 1.3, ease: "easeOut" }}
        >
          {p.ch}
        </motion.span>
      ))}
    </div>
  );
}
