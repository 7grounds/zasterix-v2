"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

type AgentRow = {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  allowed_tools?: string[] | null;
  organization_id?: string | null;
  created_at?: string | null;
};

type Draft = {
  name: string;
  description: string;
  system_prompt: string;
  allowed_tools: string[];
};

const TOOL_OPTIONS = [
  { value: "user_asset_history", label: "user_asset_history" },
  { value: "progress_tracker", label: "progress_tracker" },
  { value: "web_search", label: "web_search" },
  { value: "agent_router", label: "agent_router" },
  { value: "agent_call", label: "agent_call" },
];

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [newAgent, setNewAgent] = useState<Draft>({
    name: "",
    description: "",
    system_prompt: "",
    allowed_tools: [],
  });

  const canUseSupabase = useMemo(
    () => Boolean(supabaseUrl && supabaseAnonKey && supabase),
    [],
  );

  const loadAgents = async () => {
    if (!supabase) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("agent_templates")
      .select(
        "id, name, description, system_prompt, allowed_tools, organization_id, created_at",
      )
      .order("created_at", { ascending: true });

    if (error) {
      setStatus(`Fehler: ${error.message}`);
      setAgents([]);
      setIsLoading(false);
      return;
    }

    setAgents((data ?? []) as AgentRow[]);
    setStatus(null);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!canUseSupabase) {
      setStatus("Supabase-Umgebung fehlt.");
      setIsLoading(false);
      return;
    }
    const loadOrgAndAgents = async () => {
      const { data: orgRow, error: orgError } = await supabase
        .from("organizations")
        .select("id")
        .eq("name", "Zasterix")
        .maybeSingle();

      if (orgError) {
        setStatus(`Fehler: ${orgError.message}`);
      } else if (orgRow?.id) {
        setOrganizationId(orgRow.id);
      }

      await loadAgents();
    };

    loadOrgAndAgents();
  }, [canUseSupabase]);

  const handleCreate = async () => {
    if (!supabase) return;
    if (!newAgent.name.trim() || !newAgent.system_prompt.trim()) {
      setStatus("Name und system_prompt sind erforderlich.");
      return;
    }
    setIsSaving(true);
    const { error } = await supabase.from("agent_templates").insert({
      name: newAgent.name.trim(),
      description: newAgent.description.trim(),
      system_prompt: newAgent.system_prompt.trim(),
      allowed_tools: newAgent.allowed_tools,
      organization_id: organizationId ?? undefined,
    });

    if (error) {
      setStatus(`Fehler: ${error.message}`);
      setIsSaving(false);
      return;
    }

    setNewAgent({
      name: "",
      description: "",
      system_prompt: "",
      allowed_tools: [],
    });
    setStatus(null);
    await loadAgents();
    setIsSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from("agent_templates").delete().eq("id", id);
    if (error) {
      setStatus(`Fehler: ${error.message}`);
      return;
    }
    await loadAgents();
  };

  const handleEdit = (agent: AgentRow) => {
    setDrafts((prev) => ({
      ...prev,
      [agent.id]: {
        name: agent.name,
        description: agent.description ?? "",
        system_prompt: agent.system_prompt ?? "",
        allowed_tools: Array.isArray(agent.allowed_tools)
          ? agent.allowed_tools
          : [],
      },
    }));
  };

  const handleSave = async (id: string) => {
    if (!supabase) return;
    const draft = drafts[id];
    if (!draft) return;
    if (!draft.name.trim() || !draft.system_prompt.trim()) {
      setStatus("Name und system_prompt sind erforderlich.");
      return;
    }
    const { error } = await supabase
      .from("agent_templates")
      .update({
        name: draft.name.trim(),
        description: draft.description.trim(),
        system_prompt: draft.system_prompt.trim(),
        allowed_tools: draft.allowed_tools,
      })
      .eq("id", id);

    if (error) {
      setStatus(`Fehler: ${error.message}`);
      return;
    }
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    await loadAgents();
  };

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600 }}>Agentenverwaltung</h1>
      {status ? (
        <p style={{ marginTop: 12, color: "#f87171" }}>{status}</p>
      ) : null}

      <section style={{ marginTop: 20, border: "1px solid #e2e8f0", padding: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Neuen Agenten anlegen</h2>
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <input
            placeholder="Name"
            value={newAgent.name}
            onChange={(event) =>
              setNewAgent((prev) => ({ ...prev, name: event.target.value }))
            }
            style={{ padding: 8, border: "1px solid #cbd5f5", borderRadius: 8 }}
          />
          <input
            placeholder="Beschreibung"
            value={newAgent.description}
            onChange={(event) =>
              setNewAgent((prev) => ({ ...prev, description: event.target.value }))
            }
            style={{ padding: 8, border: "1px solid #cbd5f5", borderRadius: 8 }}
          />
          <textarea
            rows={4}
            placeholder="System Prompt"
            value={newAgent.system_prompt}
            onChange={(event) =>
              setNewAgent((prev) => ({
                ...prev,
                system_prompt: event.target.value,
              }))
            }
            style={{ padding: 8, border: "1px solid #cbd5f5", borderRadius: 8 }}
          />
          <label style={{ fontSize: 12, color: "#64748b" }}>
            Allowed Tools
            <select
              multiple
              value={newAgent.allowed_tools}
              onChange={(event) => {
                const selected = Array.from(
                  event.target.selectedOptions,
                ).map((option) => option.value);
                setNewAgent((prev) => ({ ...prev, allowed_tools: selected }));
              }}
              style={{
                marginTop: 6,
                padding: 8,
                border: "1px solid #cbd5f5",
                borderRadius: 8,
                width: "100%",
                minHeight: 120,
              }}
            >
              {TOOL_OPTIONS.map((tool) => (
                <option key={tool.value} value={tool.value}>
                  {tool.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleCreate}
            disabled={isSaving}
            style={{
              alignSelf: "flex-start",
              padding: "8px 14px",
              borderRadius: 999,
              border: "none",
              background: "#0f172a",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            {isSaving ? "Speichern..." : "Agent speichern"}
          </button>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Bestehende Agenten</h2>
        {isLoading ? (
          <p style={{ marginTop: 10, color: "#64748b" }}>Lade Agenten...</p>
        ) : null}
        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {agents.map((agent) => {
            const draft = drafts[agent.id];
            return (
              <div
                key={agent.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                {draft ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <input
                      value={draft.name}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [agent.id]: {
                            ...prev[agent.id],
                            name: event.target.value,
                          },
                        }))
                      }
                      style={{ padding: 8, border: "1px solid #cbd5f5", borderRadius: 8 }}
                    />
                    <input
                      value={draft.description}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [agent.id]: {
                            ...prev[agent.id],
                            description: event.target.value,
                          },
                        }))
                      }
                      style={{ padding: 8, border: "1px solid #cbd5f5", borderRadius: 8 }}
                    />
                    <textarea
                      rows={4}
                      value={draft.system_prompt}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [agent.id]: {
                            ...prev[agent.id],
                            system_prompt: event.target.value,
                          },
                        }))
                      }
                      style={{ padding: 8, border: "1px solid #cbd5f5", borderRadius: 8 }}
                    />
                    <label style={{ fontSize: 12, color: "#64748b" }}>
                      Allowed Tools
                      <select
                        multiple
                        value={draft.allowed_tools}
                        onChange={(event) => {
                          const selected = Array.from(
                            event.target.selectedOptions,
                          ).map((option) => option.value);
                          setDrafts((prev) => ({
                            ...prev,
                            [agent.id]: {
                              ...prev[agent.id],
                              allowed_tools: selected,
                            },
                          }));
                        }}
                        style={{
                          marginTop: 6,
                          padding: 8,
                          border: "1px solid #cbd5f5",
                          borderRadius: 8,
                          width: "100%",
                          minHeight: 120,
                        }}
                      >
                        {TOOL_OPTIONS.map((tool) => (
                          <option key={tool.value} value={tool.value}>
                            {tool.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleSave(agent.id)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 999,
                          border: "none",
                          background: "#0f172a",
                          color: "#fff",
                        }}
                      >
                        Speichern
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDrafts((prev) => {
                            const next = { ...prev };
                            delete next[agent.id];
                            return next;
                          })
                        }
                        style={{
                          padding: "6px 12px",
                          borderRadius: 999,
                          border: "1px solid #94a3b8",
                          background: "transparent",
                          color: "#0f172a",
                        }}
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    <p style={{ fontWeight: 600 }}>{agent.name}</p>
                    <p style={{ fontSize: 13, color: "#64748b" }}>
                      {agent.description}
                    </p>
                    <p style={{ fontSize: 12, color: "#94a3b8" }}>
                      Prompt: {agent.system_prompt.slice(0, 120)}...
                    </p>
                    <p style={{ fontSize: 12, color: "#94a3b8" }}>
                      Tools:{" "}
                      {Array.isArray(agent.allowed_tools) &&
                      agent.allowed_tools.length > 0
                        ? agent.allowed_tools.join(", ")
                        : "keine"}
                    </p>
                    <p style={{ fontSize: 12, color: "#94a3b8" }}>
                      Org-ID: {agent.organization_id ?? "Zasterix (default)"}
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleEdit(agent)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 999,
                          border: "1px solid #94a3b8",
                          background: "transparent",
                          color: "#0f172a",
                        }}
                      >
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(agent.id)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 999,
                          border: "none",
                          background: "#ef4444",
                          color: "#fff",
                        }}
                      >
                        Löschen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
