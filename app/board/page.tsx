"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

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
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [status, setStatus] = useState("Loading data...");

  useEffect(() => {
    let isMounted = true;

    const loadRows = async () => {
      if (!supabase) {
        if (isMounted) setStatus("Supabase environment missing.");
        return;
      }

      const { data, error } = await supabase
        .from("universal_history")
        .select("id, payload, created_at")
        .order("created_at", { ascending: false });

      if (!isMounted) return;

      if (error) {
        setStatus(`Error: ${error.message}`);
        setRows([]);
        return;
      }

      setRows(data ?? []);
      setStatus(data && data.length > 0 ? "" : "No entries found.");
    };

    loadRows();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

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
            payload.agent_name ?? payload.agent ?? payload.agent_id ?? "Unknown";
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
                <strong>Response:</strong>
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
