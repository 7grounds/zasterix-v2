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
  open: "Open",
  assigned: "Assigned",
  processing: "In Progress",
  completed: "Completed",
  failed: "Failed",
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
      setStatus(orgError ? `Error: ${orgError.message}` : "Zasterix missing.");
      setIsLoading(false);
      return;
    }

    const { data: agentRows, error: agentError } = await supabase
      .from("agent_templates")
      .select("id, name")
      .eq("organization_id", orgRow.id)
      .order("created_at", { ascending: true });

    if (agentError) {
      setStatus(`Error: ${agentError.message}`);
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

    const { data: missionRow } = await supabase
      .from("organizations")
      .select("mission, mission_text, mission_updated_at")
      .eq("id", org.id)
      .maybeSingle();

    if (missionRow?.mission_updated_at && missionRow.mission_updated_at !== org.mission_updated_at) {
      const missionValue = missionRow.mission ?? missionRow.mission_text ?? "";
      setOrg((prev) =>
        prev
          ? {
              ...prev,
              mission: missionRow.mission ?? prev.mission ?? null,
              mission_text: missionRow.mission_text ?? prev.mission_text ?? null,
              mission_updated_at: missionRow.mission_updated_at,
            }
          : prev,
      );
      setMissionInput(missionValue);
    }

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
          message = `Integrator distributed strategy brief to ${count} agents.`;
          integratorItems.push({
            id: `integrator-${row.id}`,
            message,
            timestamp: row.created_at,
          });
        } else if (type === "task_assigned") {
          message = `Task assigned: ${String(payload.summary ?? "")}`;
          integratorItems.push({
            id: `integrator-${row.id}`,
            message,
            timestamp: row.created_at,
          });
        } else if (type === "strategy_sync") {
          message = `Integrator synced context.`;
          integratorItems.push({
            id: `integrator-${row.id}`,
            message,
            timestamp: row.created_at,
          });
        } else if (type === "feedback_task_created") {
          message = `Sentinel created a feedback task.`;
        } else if (type === "operative_task_completed") {
          message = `Operative task completed.`;
        } else if (type === "mission_ack") {
          message = payload.message
            ? String(payload.message)
            : "Sentinel acknowledged mission intake.";
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
      setStatus("Supabase environment missing.");
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
      .ilike("name", "%CEO%")
      .eq("is_operative", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!ceoRow?.id) {
      setStatus("CEO agent not found.");
      return;
    }

    await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: ceoRow.id,
        organizationName: "Zasterix",
        message: `Global Mission:\n${mission}\n\nCreate 3-5 strategic milestones (Growth, Finance, Tech). Respond ONLY with a tool call in the format [USE_TOOL: create_task | payload: {...}] and include a tasks array with 3-5 entries (title, description, priority). Assign agent_name where possible (Growth, CFO, CTO).`,
      }),
    });
  };

  const triggerSentinelAck = async (mission: string) => {
    if (!supabase || !org?.id) return;
    const { data: sentinelRow } = await supabase
      .from("agent_templates")
      .select("id")
      .eq("organization_id", org.id)
      .ilike("name", "%Sentinel%")
      .eq("is_operative", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let ackMessage = "Sentinel confirmed mission intake.";

    if (sentinelRow?.id) {
      try {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: sentinelRow.id,
            organizationName: "Zasterix",
            message: `Mission received:\n${mission}\n\nProvide a short acknowledgement for the Chairman (1-2 sentences).`,
          }),
        });
        const data = await response.json();
        if (response.ok && typeof data.reply === "string") {
          ackMessage = data.reply;
        }
      } catch (_error) {
        ackMessage = "Sentinel could not generate an acknowledgement.";
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
      setStatus("Please enter a mission.");
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
      setStatus(`Error: ${error.message}`);
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
            Orchestrate missions and monitor autonomous task distribution.
          </p>
        </header>

        {status ? (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {status}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-5 py-5">
          <h2 className="text-sm uppercase tracking-[0.3em] text-slate-400">
            Active Mission
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
            {org?.mission ?? org?.mission_text ?? "No mission saved yet."}
          </p>
        </section>

        <section className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-5 py-5">
          <h2 className="text-sm uppercase tracking-[0.3em] text-slate-400">
            Global Mission / Input
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            Saving this input triggers the CEO analysis.
          </p>
          <textarea
            className="mt-4 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-sm text-slate-100"
            rows={4}
            placeholder="Enter mission..."
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
              {isSaving ? "Saving..." : "Save mission"}
            </button>
            {org?.mission_updated_at ? (
              <span>
                Last update: {new Date(org.mission_updated_at).toLocaleString()}
              </span>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-5 py-5">
          <h2 className="text-sm uppercase tracking-[0.3em] text-slate-400">
            Task Wall
          </h2>
          {tasks.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">No tasks found.</p>
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
              Agent Activity
            </h2>
            {activity.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">
                No activity captured yet.
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
              Integrator Log
            </h2>
            {integratorLog.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">
                No background noise captured yet.
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
