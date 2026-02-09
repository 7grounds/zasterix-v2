"use client";

import { useEffect, useRef, useState } from "react";
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
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const FEATURED_AGENT_NAMES = [
  "Zasterix Sentinel",
  "Zasterix System Auditor",
  "Zasterix Intelligence Agent",
  "Zasterix Integrator",
];

export default function MarketPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [activeAgent, setActiveAgent] = useState<AgentRow | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    let isMounted = true;

    const loadAgents = async () => {
      if (!supabase) {
        if (isMounted) {
          setStatus("Supabase-Umgebung fehlt.");
          setIsLoadingAgents(false);
        }
        return;
      }

      const { data: orgRow, error: orgError } = await supabase
        .from("organizations")
        .select("id")
        .eq("name", "Zasterix")
        .maybeSingle();

      if (!isMounted) return;

      if (orgError || !orgRow?.id) {
        setStatus(orgError ? `Error: ${orgError.message}` : "Zasterix missing.");
        setAgents([]);
        setIsLoadingAgents(false);
        return;
      }

      const { data, error } = await supabase
        .from("agent_templates")
        .select("id, name, description, system_prompt")
        .eq("organization_id", orgRow.id)
        .eq("is_operative", false)
        .order("created_at", { ascending: true });

      if (!isMounted) return;

      if (error) {
        setStatus(`Error: ${error.message}`);
        setAgents([]);
        setIsLoadingAgents(false);
        return;
      }

      const list = (data ?? []) as AgentRow[];
      const byName = new Map(list.map((agent) => [agent.name, agent]));
      const featured = FEATURED_AGENT_NAMES.map((name) => byName.get(name)).filter(
        Boolean,
      ) as AgentRow[];
      const featuredIds = new Set(featured.map((agent) => agent.id));
      const remainder = list.filter((agent) => !featuredIds.has(agent.id));
      const ordered = [...featured, ...remainder];

      setAgents(ordered);
      setActiveAgent((prev) => prev ?? featured[0] ?? ordered[0] ?? null);
      setStatus(null);
      setIsLoadingAgents(false);
    };

    loadAgents();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectAgent = (agentId: string) => {
    const agent = agents.find((entry) => entry.id === agentId) ?? null;
    setActiveAgent(agent);
    setMessages([]);
    setStatus(null);
    setChatInput("");

    if (!agent) return;
    window.setTimeout(() => {
      const panel = panelRefs.current[agent.id];
      if (panel) {
        panel.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 120);
  };

  const handleSend = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    if (!activeAgent) {
      setStatus("Please select an agent first.");
      return;
    }

    setIsSending(true);
    setStatus(null);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setChatInput("");

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: activeAgent.id, message: trimmed }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus(data?.error ?? "Agent call failed.");
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply ?? "Response received." },
        ...(data.feedback
          ? [{ role: "assistant", content: data.feedback } as ChatMessage]
          : []),
      ]);
    } catch (_error) {
      setStatus("Network error during agent call.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "#e2e8f0",
        padding: "32px 20px",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto", display: "grid", gap: 24 }}>
        <header style={{ display: "grid", gap: 8 }}>
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: "#34d399",
            }}
          >
            Zasterix V2
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Agent Showroom</h1>
          <p style={{ fontSize: 14, color: "#94a3b8" }}>
            Select a specialist to start the chat.
          </p>
        </header>

        {status ? (
          <p style={{ fontSize: 13, color: "#f87171" }}>{status}</p>
        ) : null}

        {isLoadingAgents ? (
          <p style={{ fontSize: 13, color: "#94a3b8" }}>Loading agents...</p>
        ) : null}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          {agents.map((agent) => {
            const isFeatured = FEATURED_AGENT_NAMES.includes(agent.name);
            return (
              <div
                key={agent.id}
                style={{
                  background:
                    activeAgent?.id === agent.id
                      ? "rgba(16, 185, 129, 0.12)"
                      : "rgba(15, 23, 42, 0.8)",
                  border:
                    activeAgent?.id === agent.id
                      ? "1px solid rgba(52, 211, 153, 0.6)"
                      : "1px solid rgba(148, 163, 184, 0.2)",
                  borderRadius: 16,
                  padding: 16,
                  cursor: "pointer",
                  transition: "border 0.2s ease, background 0.2s ease",
                }}
                onClick={() => handleSelectAgent(agent.id)}
              >
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>{agent.name}</h3>
                {isFeatured ? (
                  <p
                    style={{
                      marginTop: 4,
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.2em",
                      color: "#38bdf8",
                    }}
                  >
                    Governance Suite
                  </p>
                ) : null}
                <p style={{ marginTop: 6, fontSize: 13, color: "#94a3b8" }}>
                  {agent.description}
                </p>
                <p
                  style={{
                    marginTop: 10,
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.2em",
                    color: "#34d399",
                  }}
                >
                  {agent.id}
                </p>

              <div
                ref={(node) => {
                  panelRefs.current[agent.id] = node;
                }}
                style={{
                  marginTop: 12,
                  overflow: "hidden",
                  maxHeight: activeAgent?.id === agent.id ? 520 : 0,
                  opacity: activeAgent?.id === agent.id ? 1 : 0,
                  transition: "max-height 0.35s ease, opacity 0.35s ease",
                }}
              >
                <div
                  style={{
                    marginTop: 10,
                    background: "#020617",
                    borderRadius: 14,
                    padding: 12,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <p style={{ fontSize: 12, color: "#94a3b8" }}>
                    Input → Architect → Supabase → Output
                  </p>

                  <div
                    style={{
                      display: "grid",
                      gap: 8,
                      background: "#0f172a",
                      borderRadius: 12,
                      padding: 10,
                      minHeight: 120,
                    }}
                  >
                    {messages.length === 0 ? (
                      <p style={{ fontSize: 13, color: "#64748b" }}>
                        Noch keine Nachrichten.
                      </p>
                    ) : (
                      messages.map((message, index) => (
                        <div key={`${message.role}-${index}`}>
                          <span
                            style={{
                              fontSize: 10,
                              textTransform: "uppercase",
                              letterSpacing: "0.2em",
                              color:
                                message.role === "user" ? "#38bdf8" : "#34d399",
                            }}
                          >
                            {message.role === "user" ? "User" : "Agent"}
                          </span>
                          <p style={{ marginTop: 4, fontSize: 13 }}>
                            {message.content}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  {isSending ? (
                    <p style={{ fontSize: 12, color: "#34d399" }}>
                      Agent analysiert {agent.name}...
                    </p>
                  ) : null}

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <textarea
                      rows={3}
                      placeholder={`Frage an ${agent.name}...`}
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      style={{
                        flex: 1,
                        minWidth: 220,
                        background: "#0f172a",
                        border: "1px solid rgba(148, 163, 184, 0.3)",
                        borderRadius: 12,
                        padding: "10px 12px",
                        color: "#e2e8f0",
                        fontSize: 13,
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={isSending || !chatInput.trim()}
                      style={{
                        borderRadius: 999,
                        padding: "10px 18px",
                        background: isSending ? "#1f2937" : "#34d399",
                        color: "#0f172a",
                        fontWeight: 600,
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: "0.2em",
                        border: "none",
                        cursor: isSending ? "not-allowed" : "pointer",
                      }}
                    >
                      {isSending ? "Send..." : "Senden"}
                    </button>
                  </div>
                </div>
              </div>
              </div>
            );
          })}
        </section>

        <footer style={{ textAlign: "center", fontSize: 13, color: "#94a3b8" }}>
          <a href="/board" style={{ color: "#34d399", textDecoration: "none" }}>
            Zum Board
          </a>
        </footer>
      </div>
    </div>
  );
}
