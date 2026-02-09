"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

type HistoryRow = {
  id?: string;
  payload?: any;
  created_at?: string | null;
};

const renderValue = (value: any) => {
  if (value === null || value === undefined) return "--";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
};

export default function BoardPage() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [status, setStatus] = useState("Lade Daten...");

  useEffect(() => {
    let isMounted = true;

    const loadRows = async () => {
      if (!supabase) {
        if (isMounted) setStatus("Supabase-Umgebung fehlt.");
        return;
      }

      const { data, error } = await supabase
        .from("universal_history")
        .select("id, payload, created_at")
        .order("created_at", { ascending: false });

      if (!isMounted) return;

      if (error) {
        setStatus(`Fehler: ${error.message}`);
        setRows([]);
        return;
      }

      setRows(data ?? []);
      setStatus(data && data.length > 0 ? "" : "Keine Einträge gefunden.");
    };

    loadRows();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600 }}>Board Feed</h1>
      {status ? (
        <p style={{ marginTop: 12, color: "#64748b" }}>{status}</p>
      ) : null}

      <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
        {rows.map((row, index) => {
          const payload = row.payload ?? {};
          const agentName =
            payload.agent_name ?? payload.agent ?? payload.agent_id ?? "Unbekannt";
          const userInput = payload.input ?? payload.message ?? "";
          const aiOutput = payload.output ?? payload.reply ?? payload.output_raw ?? "";

          return (
            <div
              key={row.id ?? `row-${index}`}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <p style={{ fontSize: 12, textTransform: "uppercase" }}>
                Agent: <strong>{agentName}</strong>
              </p>
              <p style={{ marginTop: 8, fontSize: 14 }}>
                <strong>Input:</strong> {renderValue(userInput)}
              </p>
              <div style={{ marginTop: 8 }}>
                <strong>Antwort:</strong>
                <pre
                  style={{
                    marginTop: 6,
                    whiteSpace: "pre-wrap",
                    background: "#f8fafc",
                    padding: 12,
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                >
                  {renderValue(aiOutput)}
                </pre>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
