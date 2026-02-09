"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

type OrgRow = {
  id: string;
  name: string;
  mission?: string | null;
  mission_text?: string | null;
  mission_updated_at?: string | null;
};

type AgentRow = {
  id: string;
  name: string;
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  agent_id?: string | null;
  created_at: string;
};

type ActivityEntry = {
  id: string;
  message: string;
  timestamp: string;
};

const STATUS_LABELS: Record<string, string> = {
  open: "Offen",
  assigned: "Zugewiesen",
  processing: "In Arbeit",
  completed: "Abgeschlossen",
  failed: "Fehler",
};

export default function CommandCenterPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [org, setOrg] = useState<OrgRow | null>(null);
  const [missionInput, setMissionInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [integratorLog, setIntegratorLog] = useState<ActivityEntry[]>([]);
  const [agentDirectory, setAgentDirectory] = useState<Record<string, string>>(
    {},
  );
  const [isLoading, setIsLoading] = useState(true);
  const [lastMissionTriggerAt, setLastMissionTriggerAt] = useState<string | null>(
    null,
  );

  const canUseSupabase = useMemo(
    () => Boolean(supabaseUrl && supabaseAnonKey && supabase),
    [],
  );

  const loadBaseData = useCallback(async () => {
    if (!supabase) return;
    setIsLoading(true);

    const { data: orgRow, error: orgError } = await supabase
      .from("organizations")
      .select("id, name, mission, mission_text, mission_updated_at")
      .eq("name", "Zasterix")
      .maybeSingle();

    if (orgError || !orgRow?.id) {
      setStatus(orgError ? `Fehler: ${orgError.message}` : "Zasterix fehlt.");
      setIsLoading(false);
      return;
    }

    const { data: agentRows, error: agentError } = await supabase
      .from("agent_templates")
      .select("id, name")
      .eq("organization_id", orgRow.id)
      .order("created_at", { ascending: true });

    if (agentError) {
      setStatus(`Fehler: ${agentError.message}`);
      setIsLoading(false);
      return;
    }

    const directory: Record<string, string> = {};
    (agentRows ?? []).forEach((agent: AgentRow) => {
      directory[agent.id] = agent.name;
    });

    const missionValue = orgRow?.mission ?? orgRow?.mission_text ?? "";
    setOrg(orgRow as OrgRow);
    setMissionInput(missionValue);
    setLastMissionTriggerAt(orgRow?.mission_updated_at ?? null);
    setAgentDirectory(directory);
    setStatus(null);
    setIsLoading(false);
  }, []);

  const loadMonitoring = useCallback(async () => {
    if (!supabase || !org?.id) return;

    const { data: taskRows } = await supabase
      .from("tasks")
      .select("id, title, status, agent_id, created_at")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(12);

    setTasks((taskRows ?? []) as TaskRow[]);

    const { data: activityRows } = await supabase
      .from("universal_history")
      .select("id, payload, created_at")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(12);

    const activityItems: ActivityEntry[] = [];
    const integratorItems: ActivityEntry[] = [];
    (activityRows ?? []).forEach(
      (row: { id: string; payload: Record<string, unknown>; created_at: string }) => {
        const payload = row.payload ?? {};
        const type = String(payload.type ?? "");
        let message = "";
        if (type === "integrator_distribution") {
          const count = Array.isArray(payload.assignments)
            ? payload.assignments.length
            : payload.tasks_created ?? 0;
          message = `Integrator hat Strategie-Papier an ${count} Agenten verteilt.`;
          integratorItems.push({
            id: `integrator-${row.id}`,
            message,
            timestamp: row.created_at,
          });
        } else if (type === "task_assigned") {
          message = `Task zugewiesen: ${String(payload.summary ?? "")}`;
          integratorItems.push({
            id: `integrator-${row.id}`,
            message,
            timestamp: row.created_at,
          });
        } else if (type === "strategy_sync") {
          message = `Integrator synchronisiert Kontext.`;
          integratorItems.push({
            id: `integrator-${row.id}`,
            message,
            timestamp: row.created_at,
          });
        } else if (type === "feedback_task_created") {
          message = `Sentinel hat Feedback-Task erstellt.`;
        } else if (type === "operative_task_completed") {
          message = `Operativer Task abgeschlossen.`;
        } else if (type === "mission_ack") {
          message = `Sentinel bestätigt Missionseingang.`;
        }

        if (message) {
          activityItems.push({
            id: row.id,
            message,
            timestamp: row.created_at,
          });
        }
      },
    );

    setActivity(activityItems);
    setIntegratorLog(integratorItems);
  }, [org?.id]);

  useEffect(() => {
    if (!canUseSupabase) {
      setStatus("Supabase-Umgebung fehlt.");
      setIsLoading(false);
      return;
    }
    loadBaseData();
  }, [canUseSupabase, loadBaseData]);

  useEffect(() => {
    if (!canUseSupabase || !org?.id) return;
    let isMounted = true;
    const refresh = async () => {
      if (!isMounted) return;
      await loadMonitoring();
    };
    refresh();
    const interval = window.setInterval(refresh, 7000);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [canUseSupabase, loadMonitoring, org?.id]);

  useEffect(() => {
    if (!org?.mission_updated_at) return;
    const missionValue = org.mission ?? org.mission_text ?? "";
    if (!missionValue) return;
    if (lastMissionTriggerAt === org.mission_updated_at) return;
    setLastMissionTriggerAt(org.mission_updated_at);
    runMissionChain(missionValue);
  }, [lastMissionTriggerAt, org?.mission, org?.mission_text, org?.mission_updated_at]);

  const triggerMissionCEO = async (mission: string) => {
    if (!supabase || !org?.id) return;

    const { data: ceoRow } = await supabase
      .from("agent_templates")
      .select("id")
      .eq("organization_id", org.id)
      .in("name", ["Zasterix CEO", "Zasterix CEO: The Essence Keeper"])
      .eq("is_operative", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!ceoRow?.id) {
      setStatus("CEO Agent nicht gefunden.");
      return;
    }

    await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: ceoRow.id,
        organizationName: "Zasterix",
        message: `Globale Mission:\n${mission}\n\nErstelle 3-5 strategische Meilensteine (Growth, Finance, Tech). Antworte ausschließlich mit einem Tool-Aufruf im Format [USE_TOOL: create_task | payload: {...}] und nutze das Feld tasks mit 3-5 Einträgen (title, description, priority). Weisen den Tasks nach Möglichkeit agent_name zu (Growth Architect, CFO, CTO).`,
      }),
    });
  };

  const triggerSentinelAck = async (mission: string) => {
    if (!supabase || !org?.id) return;
    const { data: sentinelRow } = await supabase
      .from("agent_templates")
      .select("id")
      .eq("organization_id", org.id)
      .eq("name", "Zasterix Sentinel")
      .eq("is_operative", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let ackMessage = "Sentinel bestätigt den Missionseingang.";

    if (sentinelRow?.id) {
      try {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: sentinelRow.id,
            organizationName: "Zasterix",
            message: `Mission eingegangen:\n${mission}\n\nFormuliere eine kurze Eingangsbestätigung für den Chairman (1-2 Sätze).`,
          }),
        });
        const data = await response.json();
        if (response.ok && typeof data.reply === "string") {
          ackMessage = data.reply;
        }
      } catch (_error) {
        ackMessage = "Sentinel konnte keine Bestätigung erzeugen.";
      }
    }

    await supabase.from("universal_history").insert({
      payload: {
        type: "mission_ack",
        message: ackMessage,
        mission,
      },
      organization_id: org.id,
    });
  };

  const runMissionChain = async (mission: string) => {
    await triggerMissionCEO(mission);
    await triggerSentinelAck(mission);
  };

  const handleSaveMission = async () => {
    if (!supabase || !org?.id) return;
    const trimmed = missionInput.trim();
    if (!trimmed) {
      setStatus("Bitte eine Mission eingeben.");
      return;
    }

    setIsSaving(true);
    const updatedAt = new Date().toISOString();
    const { error } = await supabase
      .from("organizations")
      .update({
        mission: trimmed,
        mission_text: trimmed,
        mission_updated_at: updatedAt,
      })
      .eq("id", org.id);

    if (error) {
      setStatus(`Fehler: ${error.message}`);
      setIsSaving(false);
      return;
    }

    setOrg((prev) =>
      prev
        ? {
            ...prev,
            mission: trimmed,
            mission_text: trimmed,
            mission_updated_at: updatedAt,
          }
        : prev,
    );
    setLastMissionTriggerAt(updatedAt);
    setStatus(null);
    await runMissionChain(trimmed);
    await loadMonitoring();
    setIsSaving(false);
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">
            Zasterix V2
          </p>
          <h1 className="text-2xl font-semibold">Mission Control</h1>
          <p className="text-sm text-slate-400">
            Missionen steuern und autonome Task-Verteilung überwachen.
          </p>
        </header>

        {status ? (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {status}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-5 py-5">
          <h2 className="text-sm uppercase tracking-[0.3em] text-slate-400">
            Aktive Mission
          </h2>
          <p className="mt-2 text-sm text-slate-200 whitespace-pre-wrap">
            {org?.mission ?? org?.mission_text ?? "Noch keine Mission hinterlegt."}
          </p>
        </section>

        <section className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-5 py-5">
          <h2 className="text-sm uppercase tracking-[0.3em] text-slate-400">
            Globale Mission / Impuls
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            Der aktuelle Impuls wird gespeichert und triggert die CEO-Analyse.
          </p>
          <textarea
            className="mt-4 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-sm text-slate-100"
            rows={4}
            placeholder="Mission eingeben..."
            value={missionInput}
            onChange={(event) => setMissionInput(event.target.value)}
            disabled={isLoading}
          />
          <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
            <button
              type="button"
              className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-900 hover:bg-emerald-400 disabled:opacity-60"
              onClick={handleSaveMission}
              disabled={isSaving || isLoading}
            >
              {isSaving ? "Speichere..." : "Mission speichern"}
            </button>
            {org?.mission_updated_at ? (
              <span>
                Letztes Update: {new Date(org.mission_updated_at).toLocaleString()}
              </span>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-5 py-5">
          <h2 className="text-sm uppercase tracking-[0.3em] text-slate-400">
            Task Wall
          </h2>
          {tasks.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">Keine Tasks gefunden.</p>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {tasks.map((task) => {
                const agentName = task.agent_id
                  ? agentDirectory[task.agent_id]
                  : null;
                return (
                  <div
                    key={task.id}
                    className="rounded-xl border border-slate-800/70 bg-slate-950/50 px-3 py-3"
                  >
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-500">
                      <span>{STATUS_LABELS[task.status] ?? task.status}</span>
                      <span>{agentName ?? "Unassigned"}</span>
                    </div>
                    <div className="mt-2 text-sm text-slate-200">{task.title}</div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-5 py-5">
            <h2 className="text-sm uppercase tracking-[0.3em] text-slate-400">
              Agenten-Aktivität
            </h2>
            {activity.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">
                Noch keine Aktivität erfasst.
              </p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm text-slate-200">
                {activity.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-xl border border-slate-800/70 bg-slate-950/50 px-3 py-2"
                  >
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                      {new Date(entry.timestamp).toLocaleString()}
                    </div>
                    <div className="mt-1 text-sm text-slate-200">
                      {entry.message}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-5 py-5">
            <h2 className="text-sm uppercase tracking-[0.3em] text-slate-400">
              Integrator-Log
            </h2>
            {integratorLog.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">
                Noch kein Hintergrund-Rauschen erfasst.
              </p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm text-slate-200">
                {integratorLog.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-xl border border-slate-800/70 bg-slate-950/50 px-3 py-2"
                  >
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                      {new Date(entry.timestamp).toLocaleString()}
                    </div>
                    <div className="mt-1 text-sm text-slate-200">
                      {entry.message}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
