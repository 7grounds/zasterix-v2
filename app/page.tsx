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
  slug?: string | null;
};

type AgentRow = {
  id: string;
  name: string;
  organization_id?: string | null;
  is_operative?: boolean | null;
};

type OrgSummary = {
  id: string;
  name: string;
  totalAgents: number;
  operativeAgents: number;
  demoAgents: number;
};

type ClusterView = {
  id: string;
  label: string;
  organizations: OrgSummary[];
};

type TelemetryItem = {
  id: string;
  message: string;
  timestamp: string;
  orgName?: string;
};

const CLUSTERS: Array<{
  id: string;
  label: string;
  match: (name: string) => boolean;
}> = [
  {
    id: "internal",
    label: "Zasterix Internal",
    match: (name) => name.toLowerCase().includes("zasterix"),
  },
  {
    id: "education",
    label: "Educational Units",
    match: (name) =>
      /schule|school|education|edu|academy|university|bildung/i.test(name),
  },
  {
    id: "startup",
    label: "Startup Clients",
    match: () => true,
  },
];

const FALLBACK_TELEMETRY = [
  "Lehrer-Agent korrigiert Tests",
  "Startup-CEO-Agent validiert Pivot",
  "Zasterix Sentinel sortiert Feedback",
];

export default function Page() {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [clusters, setClusters] = useState<ClusterView[]>([]);
  const [organizations, setOrganizations] = useState<OrgRow[]>([]);
  const [agentDirectory, setAgentDirectory] = useState<Record<string, string>>(
    {},
  );
  const [orgDirectory, setOrgDirectory] = useState<Record<string, string>>({});
  const [telemetry, setTelemetry] = useState<TelemetryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isHiring, setIsHiring] = useState(false);
  const [factoryName, setFactoryName] = useState("");
  const [factoryDescription, setFactoryDescription] = useState("");
  const [factoryPrompt, setFactoryPrompt] = useState("");
  const [factoryTools, setFactoryTools] = useState("");
  const [factoryOrgId, setFactoryOrgId] = useState("");
  const [factoryShowroomCopy, setFactoryShowroomCopy] = useState(true);

  const canUseSupabase = useMemo(
    () => Boolean(supabaseUrl && supabaseAnonKey && supabase),
    [],
  );

  const buildClusters = useCallback(
    (orgs: OrgRow[], agents: AgentRow[]) => {
      const counts: Record<string, OrgSummary> = {};
      agents.forEach((agent) => {
        if (!agent.organization_id) return;
        if (!counts[agent.organization_id]) {
          const org = orgs.find((row) => row.id === agent.organization_id);
          counts[agent.organization_id] = {
            id: agent.organization_id,
            name: org?.name ?? "Unbekannt",
            totalAgents: 0,
            operativeAgents: 0,
            demoAgents: 0,
          };
        }
        counts[agent.organization_id].totalAgents += 1;
        if (agent.is_operative) {
          counts[agent.organization_id].operativeAgents += 1;
        } else {
          counts[agent.organization_id].demoAgents += 1;
        }
      });

      const clusterMap: Record<string, ClusterView> = {};
      CLUSTERS.forEach((cluster) => {
        clusterMap[cluster.id] = {
          id: cluster.id,
          label: cluster.label,
          organizations: [],
        };
      });

      orgs.forEach((org) => {
        const cluster =
          CLUSTERS.find((entry) => entry.match(org.name)) ?? CLUSTERS[2];
        clusterMap[cluster.id].organizations.push(
          counts[org.id] ?? {
            id: org.id,
            name: org.name,
            totalAgents: 0,
            operativeAgents: 0,
            demoAgents: 0,
          },
        );
      });

      setClusters(Object.values(clusterMap));
    },
    [],
  );

  const loadDashboard = useCallback(async () => {
    if (!supabase) return;
    setIsLoading(true);

    const { data: orgRows, error: orgError } = await supabase
      .from("organizations")
      .select("id, name, slug")
      .order("name", { ascending: true });

    if (orgError) {
      setStatusMessage(`Fehler: ${orgError.message}`);
      setIsLoading(false);
      return;
    }

    const { data: agentRows, error: agentError } = await supabase
      .from("agent_templates")
      .select("id, name, organization_id, is_operative")
      .order("created_at", { ascending: true });

    if (agentError) {
      setStatusMessage(`Fehler: ${agentError.message}`);
      setIsLoading(false);
      return;
    }

    const orgList = (orgRows ?? []) as OrgRow[];
    const agents = (agentRows ?? []) as AgentRow[];
    const agentIndex: Record<string, string> = {};
    const orgIndex: Record<string, string> = {};
    agents.forEach((agent) => {
      agentIndex[agent.id] = agent.name;
    });
    orgList.forEach((org) => {
      orgIndex[org.id] = org.name;
    });

    setOrganizations(orgList);
    setAgentDirectory(agentIndex);
    setOrgDirectory(orgIndex);
    buildClusters(orgList, agents);
    setStatusMessage(null);
    setIsLoading(false);
  }, [buildClusters]);

  const loadTelemetry = useCallback(async () => {
    if (!supabase) return;
    const { data: historyRows, error: historyError } = await supabase
      .from("universal_history")
      .select("id, payload, created_at, organization_id")
      .order("created_at", { ascending: false })
      .limit(12);

    const { data: taskRows, error: taskError } = await supabase
      .from("operative_tasks")
      .select(
        "id, title, status, agent_id, organization_id, created_at, updated_at, processed_at",
      )
      .order("created_at", { ascending: false })
      .limit(12);

    if (historyError || taskError) {
      return;
    }

    const items: TelemetryItem[] = [];

    (historyRows ?? []).forEach(
      (entry: {
        id: string;
        payload: Record<string, unknown>;
        created_at: string;
        organization_id: string;
      }) => {
        const payload = entry.payload ?? {};
        const type = String(payload.type ?? "event");
        let message = `System-Event: ${type}`;
        if (type === "feedback_task_created") {
          message = `Zasterix Sentinel erstellt Task: ${payload.summary ?? ""}`;
        } else if (type === "operative_task_completed") {
          const agentName = entry.payload.agent_id
            ? agentDirectory[String(entry.payload.agent_id)]
            : null;
          message = `Operativer Agent ${agentName ?? "Agent"} schließt Task ab`;
        } else if (type === "strategy_sync") {
          message = `Integrator synchronisiert Kontext: ${String(
            payload.context_update ?? "",
          ).slice(0, 80)}`;
        } else if (type === "enterprise_onboarding") {
          message = `Onboarding gestartet: ${payload.company_name ?? "Neue Firma"}`;
        } else if (type === "ticket") {
          message = `Feedback erfasst: ${payload.summary ?? "Neues Ticket"}`;
        }

        items.push({
          id: `history-${entry.id}`,
          message,
          timestamp: entry.created_at,
          orgName: orgDirectory[entry.organization_id],
        });
      },
    );

    (taskRows ?? []).forEach(
      (task: {
        id: string;
        title: string;
        status: string;
        agent_id: string | null;
        organization_id: string | null;
        created_at: string;
        updated_at: string | null;
        processed_at: string | null;
      }) => {
        const agentName = task.agent_id
          ? agentDirectory[task.agent_id] ?? "Agent"
          : "Agent";
        let message = `Neuer Task: ${task.title}`;
        if (task.status === "processing") {
          message = `${agentName} bearbeitet Task: ${task.title}`;
        } else if (task.status === "completed") {
          message = `${agentName} hat Task abgeschlossen: ${task.title}`;
        }
        items.push({
          id: `task-${task.id}`,
          message,
          timestamp: task.processed_at ?? task.updated_at ?? task.created_at,
          orgName: task.organization_id
            ? orgDirectory[task.organization_id]
            : undefined,
        });
      },
    );

    items.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    setTelemetry(items.slice(0, 12));
  }, [agentDirectory, orgDirectory]);

  useEffect(() => {
    if (!canUseSupabase) {
      setStatusMessage("Fehler: Supabase-Umgebung fehlt.");
      setIsLoading(false);
      return;
    }

    loadDashboard();
  }, [canUseSupabase, loadDashboard]);

  useEffect(() => {
    if (!canUseSupabase) return;
    let isMounted = true;

    const refresh = async () => {
      if (!isMounted) return;
      await loadTelemetry();
    };

    refresh();
    const interval = window.setInterval(refresh, 8000);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [canUseSupabase, loadTelemetry]);

  const handleHireAgent = async () => {
    if (!supabase) return;
    if (!factoryOrgId || !factoryName.trim() || !factoryPrompt.trim()) {
      setStatusMessage("Bitte Organisation, Name und System-Prompt angeben.");
      return;
    }

    setIsHiring(true);
    setStatusMessage(null);
    const tools = factoryTools
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    const { data: ceoOperative } = await supabase
      .from("agent_templates")
      .select("id")
      .eq("organization_id", factoryOrgId)
      .in("name", ["Zasterix CEO", "Zasterix CEO: The Essence Keeper"])
      .eq("is_operative", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const { error: insertError } = await supabase.from("agent_templates").insert({
      name: factoryName.trim(),
      description: factoryDescription.trim(),
      system_prompt: factoryPrompt.trim(),
      allowed_tools: tools,
      organization_id: factoryOrgId,
      parent_id: ceoOperative?.id ?? null,
      is_operative: true,
    });

    if (insertError) {
      setStatusMessage(`Fehler: ${insertError.message}`);
      setIsHiring(false);
      return;
    }

    if (factoryShowroomCopy) {
      const { data: ceoDemo } = await supabase
        .from("agent_templates")
        .select("id")
        .eq("organization_id", factoryOrgId)
        .in("name", ["Zasterix CEO", "Zasterix CEO: The Essence Keeper"])
        .eq("is_operative", false)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      await supabase.from("agent_templates").insert({
        name: factoryName.trim(),
        description: factoryDescription.trim(),
        system_prompt: factoryPrompt.trim(),
        allowed_tools: tools,
        organization_id: factoryOrgId,
        parent_id: ceoDemo?.id ?? null,
        is_operative: false,
      });
    }

    setFactoryName("");
    setFactoryDescription("");
    setFactoryPrompt("");
    setFactoryTools("");
    setFactoryShowroomCopy(true);
    setIsHiring(false);
    await loadDashboard();
  };

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">
            Zasterix V2
          </p>
          <h1 className="text-2xl font-semibold">Universal Command Center</h1>
          <p className="text-sm text-slate-400">
            Multi-Org Overview, Agent Factory und Live-Telemetrie.
          </p>
          <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-slate-400">
            <a className="hover:text-emerald-300" href="/market">
              Showroom
            </a>
            <a className="hover:text-emerald-300" href="/admin/agents">
              Agentenverwaltung
            </a>
            <a className="hover:text-emerald-300" href="/admin/system-health">
              System Health
            </a>
          </div>
        </header>

        {statusMessage ? (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {statusMessage}
          </div>
        ) : null}

        <section className="grid gap-4">
          <h2 className="text-sm uppercase tracking-[0.3em] text-slate-400">
            Multi-Org Overview
          </h2>
          {isLoading ? (
            <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-4 py-4 text-sm text-slate-300">
              Lade Cluster...
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {clusters.map((cluster) => (
                <div
                  key={cluster.id}
                  className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-4 py-4"
                >
                  <h3 className="text-sm font-semibold text-emerald-300">
                    {cluster.label}
                  </h3>
                  {cluster.organizations.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-500">
                      Keine Organisationen gefunden.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-3 text-xs text-slate-200">
                      {cluster.organizations.map((org) => (
                        <li key={org.id} className="rounded-xl bg-slate-950/40 p-3">
                          <div className="font-semibold">{org.name}</div>
                          <div className="mt-2 flex gap-3 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                            <span>Agenten: {org.totalAgents}</span>
                            <span>Operativ: {org.operativeAgents}</span>
                            <span>Showroom: {org.demoAgents}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-[1.2fr,1fr]">
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-5 py-5">
            <h2 className="text-sm uppercase tracking-[0.3em] text-slate-400">
              Agent Factory
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              Neue Agenten-Typen definieren und sofort einstellen.
            </p>
            <div className="mt-4 grid gap-3 text-sm">
              <input
                className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                placeholder="Agenten-Name"
                value={factoryName}
                onChange={(event) => setFactoryName(event.target.value)}
              />
              <input
                className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                placeholder="Kurzbeschreibung"
                value={factoryDescription}
                onChange={(event) => setFactoryDescription(event.target.value)}
              />
              <textarea
                className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                placeholder="System-Prompt"
                rows={4}
                value={factoryPrompt}
                onChange={(event) => setFactoryPrompt(event.target.value)}
              />
              <input
                className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                placeholder="Tools (kommagetrennt)"
                value={factoryTools}
                onChange={(event) => setFactoryTools(event.target.value)}
              />
              <select
                className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                value={factoryOrgId}
                onChange={(event) => setFactoryOrgId(event.target.value)}
              >
                <option value="">Organisation auswählen</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={factoryShowroomCopy}
                  onChange={(event) => setFactoryShowroomCopy(event.target.checked)}
                />
                Showroom-Kopie anlegen
              </label>
              <button
                type="button"
                className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-900 hover:bg-emerald-400 disabled:opacity-60"
                onClick={handleHireAgent}
                disabled={isHiring}
              >
                {isHiring ? "Stelle ein..." : "Agent einstellen"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-5 py-5">
            <h2 className="text-sm uppercase tracking-[0.3em] text-slate-400">
              Live-Telemetrie
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              Echtzeit-Aktivitäten aus dem Meta-Netzwerk.
            </p>
            <div className="mt-4 space-y-3 text-sm text-slate-200">
              {telemetry.length === 0
                ? FALLBACK_TELEMETRY.map((line) => (
                    <div
                      key={line}
                      className="rounded-xl border border-slate-800/70 bg-slate-950/50 px-3 py-2 text-xs text-slate-300"
                    >
                      {line}
                    </div>
                  ))
                : telemetry.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-800/70 bg-slate-950/50 px-3 py-2 text-xs text-slate-200"
                    >
                      <div className="flex justify-between gap-3 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                        <span>{item.orgName ?? "System"}</span>
                        <span>{new Date(item.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="mt-2 text-sm text-slate-200">
                        {item.message}
                      </div>
                    </div>
                  ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
