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
  description?: string | null;
  allowed_tools?: string[] | null;
  created_at?: string | null;
  organization_id?: string | null;
  is_operative?: boolean | null;
};

export default function SystemHealthPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const canUseSupabase = useMemo(
    () => Boolean(supabaseUrl && supabaseAnonKey && supabase),
    [],
  );

  useEffect(() => {
    if (!canUseSupabase) {
      setStatus("Supabase-Umgebung fehlt.");
      setIsLoading(false);
      return;
    }

    const loadHealth = async () => {
      setIsLoading(true);
      const { data: orgRow, error: orgError } = await supabase
        .from("organizations")
        .select("id")
        .eq("name", "Zasterix")
        .maybeSingle();

      if (orgError || !orgRow?.id) {
        setStatus(orgError ? `Fehler: ${orgError.message}` : "Organisation fehlt.");
        setAgents([]);
        setCapabilities([]);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("agent_templates")
        .select(
          "id, name, description, allowed_tools, created_at, organization_id, is_operative",
        )
        .eq("organization_id", orgRow.id)
        .eq("is_operative", true)
        .order("name", { ascending: true });

      if (error) {
        setStatus(`Fehler: ${error.message}`);
        setAgents([]);
        setCapabilities([]);
        setIsLoading(false);
        return;
      }

      const rows = (data ?? []) as AgentRow[];
      const toolSet = new Set<string>();
      rows.forEach((agent) => {
        if (Array.isArray(agent.allowed_tools)) {
          agent.allowed_tools.forEach((tool) => toolSet.add(tool));
        }
      });

      setAgents(rows);
      setCapabilities(Array.from(toolSet).sort());
      setStatus(null);
      setIsLoading(false);
    };

    loadHealth();
  }, [canUseSupabase]);

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600 }}>System Health</h1>
      <p style={{ marginTop: 6, color: "#64748b" }}>
        Aktive Systemfaehigkeiten und Agentenstatus fuer Zasterix.
      </p>

      {status ? (
        <p style={{ marginTop: 12, color: "#f87171" }}>{status}</p>
      ) : null}

      {isLoading ? (
        <p style={{ marginTop: 16, color: "#64748b" }}>Lade Daten...</p>
      ) : null}

      <section style={{ marginTop: 20, border: "1px solid #e2e8f0", padding: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>
          Aktive Capabilities ({capabilities.length})
        </h2>
        {capabilities.length === 0 ? (
          <p style={{ marginTop: 8, color: "#94a3b8" }}>
            Keine aktiven Capabilities gefunden.
          </p>
        ) : (
          <ul style={{ marginTop: 8, paddingLeft: 18 }}>
            {capabilities.map((tool) => (
              <li key={tool} style={{ marginBottom: 4 }}>
                {tool}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 20, border: "1px solid #e2e8f0", padding: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>
          Agenten-Module ({agents.length})
        </h2>
        {agents.length === 0 ? (
          <p style={{ marginTop: 8, color: "#94a3b8" }}>
            Keine Agenten gefunden.
          </p>
        ) : (
          <ul style={{ marginTop: 8, paddingLeft: 18 }}>
            {agents.map((agent) => (
              <li key={agent.id} style={{ marginBottom: 10 }}>
                <strong>{agent.name}</strong>
                {agent.description ? ` — ${agent.description}` : ""}
                {Array.isArray(agent.allowed_tools) &&
                agent.allowed_tools.length > 0 ? (
                  <div style={{ marginTop: 4, color: "#475569" }}>
                    Tools: {agent.allowed_tools.join(", ")}
                  </div>
                ) : (
                  <div style={{ marginTop: 4, color: "#94a3b8" }}>
                    Keine Tools hinterlegt.
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
