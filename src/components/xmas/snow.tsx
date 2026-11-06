import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./season";

/* Falling snow on a full-screen canvas (no pointer events).
   Three depth layers: small slow flakes far away, medium ones, and a few big
   soft "bokeh" flakes up front. Each sways on its own sine; a light wind
   follows the mouse. Pauses while the tab is hidden. On the light theme the
   flakes get a faint blue-grey edge so they still read on a white page. */
type Flake = { x: number; y: number; r: number; vy: number; sway: number; ph: number; depth: number; a: number; star: boolean };

export function Snow() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    let W = 0, H = 0, dpr = 1, raf = 0, last = 0, wind = 0, windTarget = 0, t = 0;
    let flakes: Flake[] = [];

    const make = (y?: number): Flake => {
      const roll = Math.random();
      const depth = roll < 0.55 ? 0 : roll < 0.93 ? 1 : 2;
      const r = depth === 0 ? 0.7 + Math.random() * 1.1 : depth === 1 ? 1.6 + Math.random() * 1.6 : 3.6 + Math.random() * 2.6;
      return {
        x: Math.random() * W,
        y: y ?? Math.random() * H,
        r,
        vy: (depth === 0 ? 18 : depth === 1 ? 34 : 58) * (0.75 + Math.random() * 0.5),
        sway: (depth + 1) * (6 + Math.random() * 10),
        ph: Math.random() * Math.PI * 2,
        depth,
        a: depth === 0 ? 0.55 : depth === 1 ? 0.85 : 0.45,
        star: depth === 1 && Math.random() < 0.18,
      };
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(260, Math.round((W * H) / 7000));
      while (flakes.length < n) flakes.push(make());
      flakes.length = n;
    };

    const star = (x: number, y: number, r: number, rot: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r * 1.6, Math.sin(a) * r * 1.6);
      }
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.restore();
    };

    const frame = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      t += dt;
      wind += (windTarget - wind) * Math.min(1, dt * 0.8);
      const light = document.documentElement.getAttribute("data-theme") !== "dark";
      ctx.clearRect(0, 0, W, H);
      for (const f of flakes) {
        f.y += f.vy * dt;
        f.x += (Math.sin(t * 0.9 + f.ph) * f.sway + wind * (f.depth + 1) * 12) * dt;
        if (f.y - f.r > H) Object.assign(f, make(-f.r * 2));
        if (f.x < -10) f.x = W + 10;
        else if (f.x > W + 10) f.x = -10;

        const fill = `rgba(255,255,255,${f.a})`;
        if (f.depth === 2) {
          const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 1.8);
          g.addColorStop(0, light ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.55)");
          g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = g;
          if (light) {
            ctx.shadowColor = "rgba(80,110,170,.5)";
            ctx.shadowBlur = 8;
          }
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r * 1.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (f.star) {
          ctx.strokeStyle = light ? "rgba(95,125,180,.9)" : fill;
          star(f.x, f.y, f.r, t * 0.6 + f.ph);
        } else {
          ctx.fillStyle = fill;
          if (light) {
            ctx.strokeStyle = "rgba(95,125,180,.7)";
            ctx.lineWidth = 0.8;
          }
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
          ctx.fill();
          if (light) ctx.stroke();
        }
      }
      raf = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      windTarget = (e.clientX / Math.max(1, W) - 0.5) * 1.6;
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      last = 0;
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[240] h-full w-full" />;
}
