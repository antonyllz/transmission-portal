import { AnimatePresence, motion } from "motion/react";
import { IconSnowflake, IconSnowflakeOff } from "@tabler/icons-react";
import { Snow } from "./snow";
import { Lights } from "./lights";
import { Santas } from "./santas";
import { setXmasOff, useXmas } from "./season";

/* Christmas theme root (island "xmas-root"): snow, lights and the Santas,
   only while it's the season and this viewer hasn't switched it off. */
export function ChristmasTheme() {
  const { enabled } = useXmas();
  return (
    <AnimatePresence>
      {enabled && (
        <motion.div key="xmas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
          <Snow />
          <Lights />
          <Santas />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ❄ button in the topbar (island "xmas-toggle-root"), shown only in season */
export function ChristmasToggle() {
  const { season, enabled } = useXmas();
  if (!season) return null;
  return (
    <button
      type="button"
      className="tb-icon-btn xmas-toggle"
      onClick={() => setXmasOff(enabled)}
      aria-pressed={enabled}
      aria-label={enabled ? "Desligar clima de Natal" : "Ligar clima de Natal"}
      title={enabled ? "Desligar clima de Natal" : "Ligar clima de Natal"}
    >
      {enabled ? <IconSnowflake size={20} stroke={1.8} /> : <IconSnowflakeOff size={20} stroke={1.8} />}
    </button>
  );
}
