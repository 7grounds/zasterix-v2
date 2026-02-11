\"use client\";

import { useEffect, useMemo, useState } from \"react\";
import { createClient } from \"@supabase/supabase-js\";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? \"\";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? \"\";
const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

type AgentRow = {
  id: string;
  name: string;
  description?: string | null;
  system_prompt?: string | null;
};

const L1_NAMES = [\"Chairman\"];
const L2_NAMES = [
  \"Strategy Agent\",
  \"Operations Agent\",
  \"Financial Agent\",
  \"Auditor Agent\",
];
const L3_NAMES = [
  \"Architectural Agent\",
  \"Integrator Agent\",
  \"Growth Agent\",
  \"Sentinel Agent\",
  \"Intelligence Agent\",
  \"Messaging Agent\",
];

const normalizeName = (value: string) => value.trim().toLowerCase();

export default function HomePage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadAgents = async () => {
      if (!supabase) {
        if (isMounted) setStatus(\"Supabase-Umgebung fehlt.\");
        return;
      }
      const { data, error } = await supabase
        .from(\"agent_templates\")
        .select(\"id, name, description, system_prompt\")
        .order(\"created_at\", { ascending: true });

      if (!isMounted) return;
      if (error) {
        setStatus(`Fehler: ${error.message}`);
        setAgents([]);
        return;
      }
      setAgents((data ?? []) as AgentRow[]);
      setStatus(null);
    };

    loadAgents();
    return () => {
      isMounted = false;
    };
  }, []);

  const hierarchy = useMemo(() => {
    const byName = new Map(
      agents.map((agent) => [normalizeName(agent.name), agent]),
    );
    const resolveGroup = (names: string[]) =>
      names
        .map((name) => byName.get(normalizeName(name)))
        .filter(Boolean) as AgentRow[];
    const assigned = new Set(
      [...L1_NAMES, ...L2_NAMES, ...L3_NAMES].map(normalizeName),
    );
    const unassigned = agents.filter(
      (agent) => !assigned.has(normalizeName(agent.name)),
    );
    return {
      l1: resolveGroup(L1_NAMES),
      l2: resolveGroup(L2_NAMES),
      l3: resolveGroup(L3_NAMES),
      unassigned,
    };
  }, [agents]);

  return (
    <main className=\"min-h-screen bg-slate-950 px-6 py-10 text-slate-100\">
      <div className=\"mx-auto flex w-full max-w-6xl flex-col gap-8\">
        <header className=\"space-y-2\">
          <p className=\"text-xs uppercase tracking-[0.3em] text-emerald-400\">
            Zasterix V3
          </p>
          <h1 className=\"text-2xl font-semibold\">
            Management Board Hierarchy
          </h1>
          <p className=\"text-sm text-slate-400\">
            Origo-Architektur · Minimaler Datenzugriff · Agent Templates
          </p>
          {status ? (
            <p className=\"text-sm text-rose-400\">{status}</p>
          ) : null}
        </header>

        <section className=\"grid gap-6 lg:grid-cols-3\">
          <div className=\"rounded-2xl border border-slate-800/70 bg-slate-900/60 px-4 py-4\">
            <h2 className=\"text-xs uppercase tracking-[0.2em] text-slate-400\">
              L1 · Management
            </h2>
            <div className=\"mt-3 space-y-3\">
              {hierarchy.l1.length === 0 ? (
                <p className=\"text-sm text-slate-500\">Keine Agenten.</p>
              ) : (
                hierarchy.l1.map((agent) => (
                  <div
                    key={agent.id}
                    className=\"rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3\"
                  >
                    <p className=\"text-sm font-semibold\">{agent.name}</p>
                    <p className=\"mt-1 text-xs text-slate-300\">
                      {agent.description ?? \"No description.\"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className=\"rounded-2xl border border-slate-800/70 bg-slate-900/60 px-4 py-4\">
            <h2 className=\"text-xs uppercase tracking-[0.2em] text-slate-400\">
              L2 · Strategy
            </h2>
            <div className=\"mt-3 space-y-3\">
              {hierarchy.l2.length === 0 ? (
                <p className=\"text-sm text-slate-500\">Keine Agenten.</p>
              ) : (
                hierarchy.l2.map((agent) => (
                  <div
                    key={agent.id}
                    className=\"rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-3\"
                  >
                    <p className=\"text-sm font-semibold\">{agent.name}</p>
                    <p className=\"mt-1 text-xs text-slate-300\">
                      {agent.description ?? \"No description.\"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className=\"rounded-2xl border border-slate-800/70 bg-slate-900/60 px-4 py-4\">
            <h2 className=\"text-xs uppercase tracking-[0.2em] text-slate-400\">
              L3 · Execution
            </h2>
            <div className=\"mt-3 space-y-3\">
              {hierarchy.l3.length === 0 ? (
                <p className=\"text-sm text-slate-500\">Keine Agenten.</p>
              ) : (
                hierarchy.l3.map((agent) => (
                  <div
                    key={agent.id}
                    className=\"rounded-xl border border-purple-500/40 bg-purple-500/10 px-4 py-3\"
                  >
                    <p className=\"text-sm font-semibold\">{agent.name}</p>
                    <p className=\"mt-1 text-xs text-slate-300\">
                      {agent.description ?? \"No description.\"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {hierarchy.unassigned.length > 0 ? (
          <section className=\"rounded-2xl border border-slate-800/70 bg-slate-900/40 px-4 py-4\">
            <h2 className=\"text-xs uppercase tracking-[0.2em] text-slate-400\">
              Weitere Agenten
            </h2>
            <div className=\"mt-3 grid gap-2 sm:grid-cols-2\">
              {hierarchy.unassigned.map((agent) => (
                <div
                  key={agent.id}
                  className=\"rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2\"
                >
                  <p className=\"text-sm font-semibold\">{agent.name}</p>
                  <p className=\"text-xs text-slate-400\">
                    {agent.description ?? \"No description.\"}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
