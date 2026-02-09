"use client";

import { useMemo, useState } from "react";
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

  const handleSelectAgent = (agentId: string) => {
    const agent = tiles.find((entry) => entry.id === agentId) ?? null;
    setActiveAgent(agent);
    setMessages([]);
    setStatus(null);
    setChatInput("");
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
              onClick={() => handleSelectAgent(agent.id)}
              style={{
                background:
                  activeAgent?.id === agent.id
                    ? "rgba(16, 185, 129, 0.15)"
                    : "rgba(15, 23, 42, 0.8)",
                border:
                  activeAgent?.id === agent.id
                    ? "1px solid rgba(52, 211, 153, 0.6)"
                    : "1px solid rgba(148, 163, 184, 0.2)",
                borderRadius: 16,
                padding: 16,
                cursor: "pointer",
              }}
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
            </div>
          ))}
        </section>

        <section
          style={{
            background: "rgba(15, 23, 42, 0.9)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            borderRadius: 18,
            padding: 20,
            display: "grid",
            gap: 12,
          }}
        >
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>
              {activeAgent
                ? `${activeAgent.name} (Chat-Test)`
                : "Agenten-Chat"}
            </h2>
            <p style={{ fontSize: 13, color: "#94a3b8" }}>
              {activeAgent
                ? "Input → Architect → Supabase → Output"
                : "Wähle oben einen Agenten aus."}
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gap: 8,
              background: "#020617",
              borderRadius: 14,
              padding: 12,
              minHeight: 140,
            }}
          >
            {messages.length === 0 ? (
              <p style={{ fontSize: 13, color: "#64748b" }}>
                {activeAgent
                  ? "Noch keine Nachrichten."
                  : "Bitte zuerst einen Agenten auswählen."}
              </p>
            ) : (
              messages.map((message, index) => (
                <div key={`${message.role}-${index}`}>
                  <span
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.2em",
                      color: message.role === "user" ? "#38bdf8" : "#34d399",
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
              {activeAgent
                ? `Agent analysiert ${activeAgent.name}...`
                : "Agent analysiert..."}
            </p>
          ) : null}
          {status ? (
            <p style={{ fontSize: 12, color: "#f87171" }}>{status}</p>
          ) : null}

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <textarea
              rows={3}
              placeholder="Erbrecht-Frage eingeben..."
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              style={{
                flex: 1,
                minWidth: 240,
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
