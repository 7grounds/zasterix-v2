"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

const ALLOWED_EMAIL =
  process.env.NEXT_PUBLIC_CHAIRMAN_EMAIL?.toLowerCase().trim() ?? "";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;
      if (data.session?.user) {
        router.replace("/admin/command-center");
      } else {
        setIsLoading(false);
      }
    };
    checkSession();
    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  const handleLogin = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setStatus("Please enter your email.");
      return;
    }
    if (ALLOWED_EMAIL && trimmed !== ALLOWED_EMAIL) {
      setStatus("Access denied: unauthorized email.");
      return;
    }

    setIsSending(true);
    setStatus(null);

    const redirectTo = `${window.location.origin}/admin/command-center`;
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setStatus(`Error: ${error.message}`);
      setIsSending(false);
      return;
    }

    setStatus("Magic link sent. Check your inbox.");
    setIsSending(false);
  };

  const redirectedFrom = searchParams.get("redirectedFrom");

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">
            Zasterix V2
          </p>
          <h1 className="text-2xl font-semibold">Chairman Login</h1>
          <p className="text-sm text-slate-400">
            Solo access is restricted to the Chairman account.
          </p>
        </header>

        {redirectedFrom ? (
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-4 py-3 text-xs text-slate-300">
            Please sign in to continue to{" "}
            <span className="text-emerald-300">{redirectedFrom}</span>.
          </div>
        ) : null}

        {status ? (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {status}
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-4 py-4">
          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Email
            <input
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isLoading}
              type="email"
            />
          </label>
          <button
            className="mt-4 w-full rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-900 hover:bg-emerald-400 disabled:opacity-60"
            type="button"
            onClick={handleLogin}
            disabled={isSending || isLoading}
          >
            {isSending ? "Sending..." : "Send magic link"}
          </button>
        </div>
      </div>
    </main>
  );
}
