import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconAlertTriangle, IconCheck, IconPencil, IconPlus, IconSearch, IconTrash, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import {
  fetchLocalities,
  fetchManualLocalities,
  saveManualLocalities,
  type LocalitiesData,
  type ManualLocality,
} from "@/data/network-events";

/* Locality lookup: UF + Anatel code → city. Base entries come from the DWDM
   map (read-only here); the team adds/edits the rest, which is what turns
   "PE-AIN x PE-TIU" into "Aliança ↔ Timbaúba" on the home dashboard. */

const muted = "text-[#6e6e73] dark:text-[#8e8e93]";
const strong = "text-[#1d1d1f] dark:text-[#f5f5f7]";
const card =
  "rounded-2xl border border-black/[.07] bg-white shadow-[0_1px_3px_rgba(0,0,0,.04),0_4px_16px_rgba(0,0,0,.05)] dark:border-white/[.08] dark:bg-[#1c1c1e] dark:shadow-none";
const input =
  "h-9 rounded-lg border border-black/10 bg-white px-3 text-[13px] text-[#1d1d1f] outline-none placeholder:text-[#aeaeb2] focus:border-tely-blue focus:ring-2 focus:ring-tely-blue/20 dark:border-white/15 dark:bg-[#2c2c2e] dark:text-[#f5f5f7] dark:placeholder:text-[#636366]";
const btnBlue =
  "inline-flex h-9 items-center gap-1.5 rounded-lg bg-tely-blue px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#0540d4] disabled:opacity-50";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function LocalitiesPage() {
  const [data, setData] = useState<LocalitiesData | null>(null);
  const [manual, setManual] = useState<ManualLocality[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ uf: "PE", code: "", name: "" });
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([fetchLocalities(), fetchManualLocalities()])
      .then(([d, m]) => {
        setData(d);
        setManual(m);
        setError(null);
      })
      .catch(() => setError("Não foi possível carregar as localidades (API indisponível)."));
  }, []);

  /* load when the page is opened (the island is mounted once, the page is shown/hidden) */
  useEffect(() => {
    load();
    const onRoute = () => location.hash.startsWith("#/localidades") && load();
    window.addEventListener("hashchange", onRoute);
    return () => window.removeEventListener("hashchange", onRoute);
  }, [load]);

  const save = async (next: ManualLocality[]) => {
    try {
      await saveManualLocalities(next);
      load();
    } catch {
      setError("Não foi possível salvar. Tente de novo.");
    }
  };

  const upsert = (uf: string, code: string, name: string) => {
    uf = uf.trim().toUpperCase();
    code = code.trim().toUpperCase();
    name = name.trim();
    if (!uf || !code || !name) return;
    const rest = manual.filter((m) => !(m.uf.toUpperCase() === uf && m.code.toUpperCase() === code));
    save([...rest, { uf, code, name }].sort((a, b) => (a.uf + a.code).localeCompare(b.uf + b.code)));
  };
  const remove = (uf: string, code: string) => save(manual.filter((m) => !(m.uf === uf && m.code === code)));

  const items = useMemo(() => {
    if (!data) return [];
    const t = norm(q.trim());
    if (!t) return data.items;
    return data.items.filter((l) =>
      [l.key, l.code, l.name, data.ufs[l.uf] ?? ""].some((v) => norm(v).includes(t)),
    );
  }, [data, q]);

  if (!data) {
    return (
      <div className={cn(card, "p-6 text-sm", muted)}>{error ?? "Carregando localidades…"}</div>
    );
  }

  const ufList = Object.entries(data.ufs).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div className="rounded-xl bg-[#dc2626]/10 px-4 py-2.5 text-sm text-[#dc2626] dark:text-[#ff6b61]">{error}</div>
      )}

      {/* ── codes seen in alarms without a name ── */}
      {data.unknown.length > 0 && (
        <section className={cn(card, "border-[#ca8a04]/30 p-5 dark:border-[#ffd60a]/25")}>
          <div className="flex items-center gap-2">
            <IconAlertTriangle className="h-4 w-4 shrink-0 text-[#ca8a04] dark:text-[#ffd60a]" />
            <h3 className={cn("text-[15px] font-semibold whitespace-nowrap", strong)}>Códigos sem nome</h3>
          </div>
          <p className={cn("mt-1 text-xs", muted)}>Apareceram nos alarmes do Zabbix. Dê um nome para aparecerem assim na dashboard.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {data.unknown.map((u) => (
              <UnknownRow key={u.key} u={u} ufName={data.ufs[u.uf]} onSave={(name) => upsert(u.uf, u.code, name)} />
            ))}
          </ul>
        </section>
      )}

      {/* ── add ── */}
      <section className={cn(card, "p-5")}>
        <h3 className={cn("text-[15px] font-semibold", strong)}>Adicionar localidade</h3>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            upsert(form.uf, form.code, form.name);
            setForm({ ...form, code: "", name: "" });
          }}
        >
          <label className="flex flex-col gap-1">
            <span className={cn("text-[11px] font-semibold tracking-wide uppercase", muted)}>UF</span>
            <select className={cn(input, "w-[92px]")} value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value })}>
              {ufList.map(([k]) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={cn("text-[11px] font-semibold tracking-wide uppercase", muted)}>Código Anatel</span>
            <input
              className={cn(input, "w-[130px] font-mono uppercase")}
              value={form.code}
              maxLength={5}
              placeholder="ex: TIU"
              onChange={(e) => setForm({ ...form, code: e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() })}
            />
          </label>
          <label className="flex min-w-[200px] flex-1 flex-col gap-1">
            <span className={cn("text-[11px] font-semibold tracking-wide uppercase", muted)}>Localidade</span>
            <input className={input} value={form.name} placeholder="ex: Timbaúba" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <button type="submit" className={btnBlue} disabled={!form.code || !form.name.trim()}>
            <IconPlus className="h-4 w-4" /> Adicionar
          </button>
        </form>
      </section>

      {/* ── list ── */}
      <section className={cn(card, "p-5")}>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className={cn("text-[15px] font-semibold", strong)}>
            Localidades <span className={cn("font-normal", muted)}>· {data.items.length}</span>
          </h3>
          <div className="relative ml-auto w-full sm:w-[320px]">
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#aeaeb2]" />
            <input
              className={cn(input, "w-full pl-9")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por código, cidade ou estado…"
            />
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className={cn("border-b border-black/[.06] text-[11px] tracking-wide uppercase dark:border-white/[.08]", muted)}>
                <th className="py-2 pr-3 font-semibold">Código</th>
                <th className="py-2 pr-3 font-semibold">Localidade</th>
                <th className="py-2 pr-3 font-semibold">Estado</th>
                <th className="py-2 pr-3 font-semibold">Origem</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {items.map((l) => (
                  <motion.tr
                    key={l.key}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="border-b border-black/[.04] last:border-0 dark:border-white/[.05]"
                  >
                    <td className={cn("py-2 pr-3 font-mono font-semibold", strong)}>{l.key}</td>
                    <td className={cn("py-2 pr-3", strong)}>
                      {editing === l.key ? (
                        <InlineEdit
                          initial={l.name}
                          onCancel={() => setEditing(null)}
                          onSave={(name) => {
                            upsert(l.uf, l.code, name);
                            setEditing(null);
                          }}
                        />
                      ) : (
                        l.name
                      )}
                    </td>
                    <td className={cn("py-2 pr-3", muted)}>{data.ufs[l.uf]}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium",
                          l.source === "manual"
                            ? "bg-tely-blue/10 text-tely-blue dark:bg-tely-blue/25 dark:text-tely-blue-light"
                            : "bg-black/[.05] text-[#6e6e73] dark:bg-white/10 dark:text-[#aeaeb2]",
                        )}
                      >
                        {l.source === "manual" ? "Cadastrada" : "Pré-cadastrada"}
                      </span>
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {editing !== l.key && (
                        <button
                          type="button"
                          onClick={() => setEditing(l.key)}
                          title={l.source === "manual" ? "Editar" : "Corrigir nome"}
                          aria-label="Editar"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#6e6e73] hover:bg-black/5 dark:text-[#aeaeb2] dark:hover:bg-white/10"
                        >
                          <IconPencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {l.source === "manual" && (
                        <button
                          type="button"
                          onClick={() => remove(l.uf, l.code)}
                          title="Excluir"
                          aria-label="Excluir"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#dc2626] hover:bg-[#dc2626]/10"
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {!items.length && <div className={cn("py-6 text-center text-sm", muted)}>Nenhuma localidade encontrada.</div>}
        </div>
      </section>
    </div>
  );
}

function UnknownRow({
  u,
  ufName,
  onSave,
}: {
  u: { key: string; uf: string; code: string; count: number; lastSeen: string | null };
  ufName?: string;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl bg-[#ca8a04]/[.06] px-3 py-2 dark:bg-[#ffd60a]/[.06]">
      <span className={cn("w-[84px] font-mono text-[13px] font-semibold", strong)}>{u.key}</span>
      <span className={cn("text-xs", muted)}>
        {ufName} · {u.count} {u.count === 1 ? "alarme" : "alarmes"}
      </span>
      <form
        className="ml-auto flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name);
        }}
      >
        <input className={cn(input, "h-8 w-[200px]")} placeholder="Nome da localidade" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className={cn(btnBlue, "h-8")} disabled={!name.trim()}>
          <IconCheck className="h-4 w-4" /> Salvar
        </button>
      </form>
    </li>
  );
}

function InlineEdit({ initial, onSave, onCancel }: { initial: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onSave(v);
      }}
    >
      <input autoFocus className={cn(input, "h-8 w-[220px]")} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onCancel()} />
      <button type="submit" aria-label="Salvar" className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-tely-blue text-white hover:bg-[#0540d4]">
        <IconCheck className="h-4 w-4" />
      </button>
      <button type="button" onClick={onCancel} aria-label="Cancelar" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#6e6e73] hover:bg-black/5 dark:text-[#aeaeb2] dark:hover:bg-white/10">
        <IconX className="h-4 w-4" />
      </button>
    </form>
  );
}
