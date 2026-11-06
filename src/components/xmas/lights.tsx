import { useEffect, useState } from "react";

/* A string of Christmas lights hanging under the topbar: a sagging wire with
   bulbs in alternating colours that twinkle out of step. Purely decorative. */
const COLORS = ["#ff4d4f", "#ffd166", "#36d399", "#4dabff", "#ff8fd8"];
const GAP = 44;

export function Lights() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  const n = Math.ceil(w / GAP) + 1;
  /* the wire sags between hooks every 2 bulbs */
  let d = "M0 2";
  for (let x = 0; x < w + GAP * 2; x += GAP * 2) d += ` Q${x + GAP} 14 ${x + GAP * 2} 2`;
  /* y of the wire at x: the quadratic curve above, (2) → (14 control) → (2) */
  const sag = (x: number) => {
    const k = (x % (GAP * 2)) / (GAP * 2);
    return 2 + 24 * k * (1 - k);
  };

  return (
    <div aria-hidden="true" className="xmas-lights pointer-events-none fixed inset-x-0 top-[50px] z-[205] h-[30px] overflow-hidden">
      <svg width={w} height="30" className="absolute inset-0">
        <path d={d} fill="none" stroke="rgba(20,40,30,.75)" strokeWidth="1.4" />
      </svg>
      {Array.from({ length: n }, (_, i) => {
        const x = i * GAP + GAP / 2;
        return (
          <span
            key={i}
            className="xmas-bulb absolute"
            style={
              {
                left: x - 4,
                top: sag(x) + 2,
                "--c": COLORS[i % COLORS.length],
                animationDelay: `${(i * 0.37) % 2.4}s`,
                animationDuration: `${1.6 + ((i * 7) % 5) * 0.25}s`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
