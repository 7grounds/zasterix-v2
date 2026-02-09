"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export default function Page() {
  const [statusMessage, setStatusMessage] = useState(
    "Verbindung zu Supabase wird geprüft...",
  );
  const [entries, setEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadEntries = useCallback(async () => {
    if (!supabase) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("universal_history")
      .select("id, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      setStatusMessage(`Fehler: ${error.message}`);
      setEntries([]);
    } else {
      setStatusMessage("Verbindung zu Supabase: OK");
      setEntries(data ?? []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkConnection = async () => {
      if (!supabaseUrl || !supabaseAnonKey || !supabase) {
        if (!isMounted) return;
        setStatusMessage("Fehler: Supabase-Umgebung fehlt.");
        setIsLoading(false);
        return;
      }

      const { error } = await supabase
        .from("universal_history")
        .select("count", { count: "exact", head: true });

      if (error) {
        if (isMounted) {
          setStatusMessage(`Fehler: ${error.message}`);
          setIsLoading(false);
        }
        return;
      }

      if (isMounted) {
        setStatusMessage("Verbindung zu Supabase: OK");
      }

      await loadEntries();
    };

    checkConnection();

    return () => {
      isMounted = false;
    };
  }, [loadEntries]);

  const handleSaveNote = async () => {
    if (!supabase) return;
    const trimmed = noteInput.trim();
    if (!trimmed) return;
    setIsSaving(true);

    const payload = {
      notiz: trimmed,
      quelle: "Handy",
    };
    const { error } = await supabase
      .from("universal_history")
      .insert({ payload })
      .select("id");

    if (error) {
      setStatusMessage(`Fehler: ${error.message}`);
    } else {
      setNoteInput("");
      await loadEntries();
    }

    setIsSaving(false);
  };

  const handleSeed = async () => {
    if (!supabase) return;
    setIsSeeding(true);
    const payload = {
      type: "manual_seed",
      message: "Test-Daten generiert",
      created_by: "Zasterix V2",
    };
    const { error } = await supabase
      .from("universal_history")
      .insert({ payload })
      .select("id");
    if (error) {
      setStatusMessage(`Fehler: ${error.message}`);
    } else {
      await loadEntries();
    }
    setIsSeeding(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">
            Zasterix V2
          </p>
          <h1 className="text-2xl font-semibold">Universal History Feed</h1>
          <p className="text-sm text-slate-400">{statusMessage}</p>
        </header>

        <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-4 py-4">
          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Neue Notiz
            <textarea
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
              rows={3}
              placeholder="Notiz eingeben..."
              value={noteInput}
              onChange={(event) => setNoteInput(event.target.value)}
            />
          </label>
          <button
            className="mt-3 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-900 hover:bg-emerald-400 disabled:opacity-60"
            type="button"
            onClick={handleSaveNote}
            disabled={isSaving || !noteInput.trim()}
          >
            {isSaving ? "Speichern..." : "Log speichern"}
          </button>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-4 py-4 text-sm text-slate-300">
            Lädt Einträge...
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-4 py-6 text-center text-sm text-slate-300">
            <p>Keine Einträge gefunden.</p>
            <button
              className="mt-4 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-900 hover:bg-emerald-400"
              type="button"
              onClick={handleSeed}
              disabled={isSeeding}
            >
              {isSeeding ? "Generiere..." : "Test-Daten generieren"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-4 py-4 text-sm text-slate-200"
              >
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  {entry.created_at ?? "--"}
                </div>
                <pre className="mt-3 whitespace-pre-wrap text-xs text-slate-200">
                  {JSON.stringify(entry.payload ?? {}, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
