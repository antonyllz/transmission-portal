"use client";
/**
 * FloatingDock (Aceternity UI) — adapted for the Transmission Portal:
 *  - colors follow the portal theme (light by default, [data-theme="dark"])
 *    with Tely blue (#0649fc) on hover, tooltip and the active item
 *  - optional `active` flag per item (current route) + aria labels
 *  - `orientation="vertical"` for a dock pinned to a side of the screen
 *    (magnifies along Y, tooltip opens to the right)
 *  - `image` per item: a picture (e.g. a client's logo) filling the whole
 *    circle instead of an icon; zooms in a little on hover
 *  - every item carries the `dock-item` class, so animated icons can react
 *    to hover/active from CSS
 */
import { cn } from "@/lib/utils";
import { IconLayoutNavbarCollapse } from "@tabler/icons-react";
import {
  AnimatePresence,
  MotionValue,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { useRef, useState } from "react";

export type DockItem = {
  title: string;
  icon?: React.ReactNode;
  /** Fills the whole circle instead of `icon` (e.g. a logo). */
  image?: DockImage;
  href: string;
  active?: boolean;
};

export type DockImage = {
  src: string;
  /** CSS background-size, to crop the logo out of a bigger picture. */
  size?: string;
  /** CSS background-position. */
  position?: string;
  /** Fills any part of the circle the picture doesn't cover. */
  background?: string;
};

/* the picture, as a circle-filling layer that zooms in on hover */
function DockImageFill({ image }: { image: DockImage }) {
  return (
    <span className="absolute inset-0 overflow-hidden rounded-full">
      <span
        className="dock-img absolute inset-0 bg-no-repeat"
        style={{
          backgroundImage: `url("${image.src}")`,
          backgroundSize: image.size ?? "cover",
          backgroundPosition: image.position ?? "center",
          backgroundColor: image.background,
        }}
      />
    </span>
  );
}

export type DockOrientation = "horizontal" | "vertical";

export const FloatingDock = ({
  items,
  desktopClassName,
  mobileClassName,
  orientation = "horizontal",
}: {
  items: DockItem[];
  desktopClassName?: string;
  mobileClassName?: string;
  orientation?: DockOrientation;
}) => {
  return (
    <>
      <FloatingDockDesktop items={items} className={desktopClassName} orientation={orientation} />
      <FloatingDockMobile items={items} className={mobileClassName} />
    </>
  );
};

const FloatingDockMobile = ({
  items,
  className,
}: {
  items: DockItem[];
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("relative block md:hidden", className)}>
      <AnimatePresence>
        {open && (
          <motion.div
            layoutId="nav"
            className="absolute inset-x-0 bottom-full mb-2 flex flex-col items-center gap-2"
          >
            {items.map((item, idx) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                exit={{
                  opacity: 0,
                  y: 10,
                  transition: {
                    delay: idx * 0.05,
                  },
                }}
                transition={{ delay: (items.length - 1 - idx) * 0.05 }}
              >
                <a
                  href={item.href}
                  key={item.title}
                  aria-label={item.title}
                  title={item.title}
                  aria-current={item.active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  data-active={item.active ? "" : undefined}
                  className={cn(
                    "dock-item relative flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition-colors",
                    item.image
                      ? item.active
                        ? "border-transparent ring-2 ring-tely-blue ring-offset-2 ring-offset-white dark:ring-offset-[#1c1c1e]"
                        : "border-black/[.07] dark:border-white/10"
                      : item.active
                        ? "border-tely-blue bg-tely-blue text-white"
                        : "border-black/[.07] bg-white text-[#6e6e73] hover:text-tely-blue dark:border-white/10 dark:bg-[#2c2c2e] dark:text-[#aeaeb2] dark:hover:text-tely-blue-light",
                  )}
                >
                  {item.image ? <DockImageFill image={item.image} /> : <div className="h-5 w-5">{item.icon}</div>}
                </a>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Fechar navegação" : "Abrir navegação"}
        aria-expanded={open}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full border shadow-md transition-colors",
          open
            ? "border-tely-blue bg-tely-blue text-white"
            : "border-black/[.07] bg-white text-tely-blue dark:border-white/10 dark:bg-[#1c1c1e] dark:text-tely-blue-light",
        )}
      >
        <IconLayoutNavbarCollapse className="h-5 w-5" />
      </button>
    </div>
  );
};

const FloatingDockDesktop = ({
  items,
  className,
  orientation,
}: {
  items: DockItem[];
  className?: string;
  orientation: DockOrientation;
}) => {
  const vertical = orientation === "vertical";
  /* pointer position along the dock axis, in viewport coords (the dock is fixed) */
  let mousePos = useMotionValue(Infinity);
  return (
    <motion.div
      onMouseMove={(e) => mousePos.set(vertical ? e.clientY : e.clientX)}
      onMouseLeave={() => mousePos.set(Infinity)}
      className={cn(
        "hidden gap-4 rounded-2xl border border-black/[.07] bg-white/80 shadow-[0_8px_32px_rgba(0,0,0,.12)] backdrop-blur-xl md:flex dark:border-white/10 dark:bg-[#1c1c1e]/85 dark:shadow-[0_8px_32px_rgba(0,0,0,.5)]",
        vertical ? "w-16 flex-col items-start py-4 pl-3" : "mx-auto h-16 items-end px-4 pb-3",
        className,
      )}
    >
      {items.map((item) => (
        <IconContainer mousePos={mousePos} vertical={vertical} key={item.title} {...item} />
      ))}
    </motion.div>
  );
};

function IconContainer({
  mousePos,
  vertical,
  title,
  icon,
  image,
  href,
  active,
}: {
  mousePos: MotionValue;
  vertical: boolean;
  title: string;
  icon?: React.ReactNode;
  image?: DockImage;
  href: string;
  active?: boolean;
}) {
  let ref = useRef<HTMLDivElement>(null);

  let distance = useTransform(mousePos, (val) => {
    let b = ref.current?.getBoundingClientRect();
    if (!b) return Infinity;
    return vertical ? val - b.y - b.height / 2 : val - b.x - b.width / 2;
  });

  let widthTransform = useTransform(distance, [-150, 0, 150], [40, 80, 40]);
  let heightTransform = useTransform(distance, [-150, 0, 150], [40, 80, 40]);

  let widthTransformIcon = useTransform(distance, [-150, 0, 150], [20, 40, 20]);
  let heightTransformIcon = useTransform(
    distance,
    [-150, 0, 150],
    [20, 40, 20],
  );

  let width = useSpring(widthTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });
  let height = useSpring(heightTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  let widthIcon = useSpring(widthTransformIcon, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });
  let heightIcon = useSpring(heightTransformIcon, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  const [hovered, setHovered] = useState(false);

  return (
    <a
      href={href}
      aria-label={title}
      aria-current={active ? "page" : undefined}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      data-active={active ? "" : undefined}
      className="dock-item rounded-full outline-none focus-visible:ring-2 focus-visible:ring-tely-blue focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
    >
      <motion.div
        ref={ref}
        style={{ width, height }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "relative flex aspect-square items-center justify-center rounded-full transition-[background-color,color,box-shadow] duration-200",
          image
            ? active
              ? "shadow-[0_0_0_2px_#fff,0_0_0_4px_#0649fc,0_4px_16px_rgba(6,73,252,.35)] dark:shadow-[0_0_0_2px_#1c1c1e,0_0_0_4px_#6b93ff]"
              : hovered
                ? "shadow-[0_0_0_2px_rgba(6,73,252,.55)] dark:shadow-[0_0_0_2px_rgba(107,147,255,.6)]"
                : "shadow-[0_0_0_1px_rgba(0,0,0,.08)] dark:shadow-[0_0_0_1px_rgba(255,255,255,.1)]"
            : active
              ? "bg-tely-blue text-white shadow-[0_4px_16px_rgba(6,73,252,.35)]"
              : hovered
                ? "bg-tely-blue/10 text-tely-blue dark:bg-tely-blue/25 dark:text-tely-blue-light"
                : "bg-[#f5f5f7] text-[#6e6e73] dark:bg-[#2c2c2e] dark:text-[#aeaeb2]",
        )}
      >
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={vertical ? { opacity: 0, x: -10, y: "-50%" } : { opacity: 0, y: 10, x: "-50%" }}
              animate={vertical ? { opacity: 1, x: 0, y: "-50%" } : { opacity: 1, y: 0, x: "-50%" }}
              exit={vertical ? { opacity: 0, x: -2, y: "-50%" } : { opacity: 0, y: 2, x: "-50%" }}
              className={cn(
                "pointer-events-none absolute w-fit rounded-md bg-tely-blue px-2 py-0.5 text-xs font-medium whitespace-pre text-white shadow-[0_4px_12px_rgba(6,73,252,.3)]",
                vertical ? "top-1/2 left-full ml-3" : "-top-8 left-1/2",
              )}
            >
              {title}
            </motion.div>
          )}
        </AnimatePresence>
        {image ? (
          <DockImageFill image={image} />
        ) : (
          <motion.div
            style={{ width: widthIcon, height: heightIcon }}
            className="flex items-center justify-center"
          >
            {icon}
          </motion.div>
        )}
        {active && (
          <span
            className={cn(
              "absolute h-1 w-1 rounded-full bg-tely-blue dark:bg-tely-blue-light",
              vertical ? "top-1/2 -left-2 -translate-y-1/2" : "-bottom-2 left-1/2 -translate-x-1/2",
            )}
          />
        )}
      </motion.div>
    </a>
  );
}

export default FloatingDock;
