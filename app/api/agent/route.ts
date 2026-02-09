import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AGENTS } from "../../../lib/agents";

type AgentRequest = {
  agentId?: string;
  message?: string;
};

const resolveSupabaseConfig = () => {
  return {
    url:
      process.env.SUPABASE_URL ??
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      "",
    key:
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      "",
  };
};

export async function POST(req: Request) {
  const { url, key } = resolveSupabaseConfig();
  if (!url || !key) {
    console.error("Agent API: Supabase env missing.");
    return NextResponse.json(
      { error: "Supabase credentials missing." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as AgentRequest;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const agentId = typeof body.agentId === "string" ? body.agentId : "";

  if (!message) {
    return NextResponse.json(
      { error: "Message is required." },
      { status: 400 },
    );
  }

  const agent = AGENTS.find((entry) => entry.id === agentId) ?? AGENTS[0];
  const reply = `Architect Response (${agent.name}): ${message}`;

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  const payload = {
    type: "agent_chat",
    agent_id: agent.id,
    agent_name: agent.name,
    input: message,
    output: reply,
  };

  const { error } = await supabase.from("universal_history").insert({ payload });

  if (error) {
    console.error("Agent API insert failed:", error);
    return NextResponse.json(
      { error: "Failed to write history." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    reply,
    agent: {
      id: agent.id,
      name: agent.name,
      category: agent.category,
    },
  });
}
