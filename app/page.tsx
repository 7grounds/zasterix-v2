"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    let isMounted = true;

    const checkConnection = async () => {
      if (!supabaseUrl || !supabaseAnonKey || !supabase) {
        if (!isMounted) return;
        setStatusMessage("Fehler: Supabase-Umgebung fehlt.");
        return;
      }

      const { error } = await supabase
        .from("universal_history")
        .select("count", { count: "exact", head: true });

      if (!isMounted) return;

      if (error) {
        setStatusMessage(`Fehler: ${error.message}`);
        return;
      }

      setStatusMessage("Verbindung zu Supabase: OK");
    };

    checkConnection();

    return () => {
      isMounted = false;
    };
  }, []);

  return <h1>{statusMessage}</h1>;
}
