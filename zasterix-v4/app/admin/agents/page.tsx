"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../../../lib/supabase";

type AgentRow = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  complexity_level?: string | number | null;
};

export default function AdminAgentsPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [status, setStatus] = useState<string | null>("Loading agents...");

  useEffect(() => {
    let isMounted = true;
    const loadAgents = async () => {
      if (!supabase) {
        if (isMounted) setStatus("Supabase environment missing.");
        return;
      }
      const { data, error } = await supabase
        .from("agent_templates")
        .select("id, name, description, category, complexity_level")
        .order("created_at", { ascending: true });

      if (!isMounted) return;
      if (error) {
        setStatus(`Error: ${error.message}`);
        setAgents([]);
        return;
      }
      setAgents((data ?? []) as AgentRow[]);
      setStatus((data ?? []).length ? null : "No agents found.");
    };

    loadAgents();
    return () => {
      isMounted = false;
    };
  }, [supabase]);

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600 }}>Admin · Agents</h1>
      {status ? (
        <p style={{ marginTop: 12, color: "#64748b" }}>{status}</p>
      ) : null}
      <div style={{ marginTop: 20, display: "grid", gap: 12 }}>
        {agents.map((agent) => (
          <div
            key={agent.id}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{agent.name}</strong>
              <span style={{ fontSize: 12, color: "#64748b" }}>
                {agent.category ?? "Uncategorized"}
              </span>
            </div>
            <p style={{ marginTop: 8, fontSize: 14, color: "#475569" }}>
              {agent.description ?? "No description."}
            </p>
            {agent.complexity_level ? (
              <p style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>
                Complexity: {agent.complexity_level}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </main>
  );
}
