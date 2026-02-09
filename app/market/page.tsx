"use client";

import { useMemo, useRef, useState } from "react";
import { AGENTS } from "../../lib/agents";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function MarketPage() {
  const tiles = useMemo(() => AGENTS, []);
  const [activeAgent, setActiveAgent] = useState(() => AGENTS[0] ?? null);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleSelectAgent = (agentId: string) => {
    const agent = tiles.find((entry) => entry.id === agentId) ?? null;
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
      setStatus("Bitte zuerst einen Agenten auswählen.");
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
        setStatus(data?.error ?? "Fehler beim Agenten-Aufruf.");
        setIsSending(false);
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply ?? "Antwort erhalten." },
      ]);
    } catch (error) {
      setStatus("Netzwerkfehler beim Agenten-Aufruf.");
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
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Agenten-Schaufenster</h1>
          <p style={{ fontSize: 14, color: "#94a3b8" }}>
            Wähle einen Spezialisten oder teste den Erbrecht-Agenten direkt.
          </p>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          {tiles.map((agent) => (
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
              <div style={{ fontSize: 24 }}>{agent.icon}</div>
              <h3 style={{ marginTop: 8, fontSize: 16 }}>{agent.name}</h3>
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
                {agent.category}
              </p>

              <div
                ref={(node) => {
                  panelRefs.current[agent.id] = node;
                }}
                style={{
                  marginTop: 12,
                  overflow: "hidden",
                  maxHeight: activeAgent?.id === agent.id ? 480 : 0,
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
                    {activeAgent?.id === agent.id
                      ? "Input → Architect → Supabase → Output"
                      : ""}
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
                  {status ? (
                    <p style={{ fontSize: 12, color: "#f87171" }}>{status}</p>
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
          ))}
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
