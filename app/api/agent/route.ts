import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const openAiKey = process.env.OPENAI_API_KEY ?? "";
const OPENAI_MODEL = "gpt-4o-mini";

type AgentRequest = {
  agentId?: string;
  message?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as AgentRequest;
  const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Supabase environment missing." },
      { status: 500 },
    );
  }
  if (!openAiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY missing." },
      { status: 500 },
    );
  }
  if (!agentId || !message) {
    return NextResponse.json(
      { error: "agentId and message are required." },
      { status: 400 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: agent, error: agentError } = await supabase
    .from("agent_templates")
    .select("id, name, system_prompt")
    .eq("id", agentId)
    .maybeSingle();

  if (agentError || !agent) {
    return NextResponse.json(
      { error: agentError?.message ?? "Agent not found." },
      { status: 404 },
    );
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: agent.system_prompt ?? "You are a helpful assistant.",
        },
        { role: "user", content: message },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: errorText || "OpenAI request failed." },
      { status: 500 },
    );
  }

  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content ?? "";

  await supabase.from("universal_history").insert({
    payload: {
      type: "agent_chat",
      agent_id: agent.id,
      agent_name: agent.name,
      input: message,
      output: reply,
    },
  });

  return NextResponse.json({ reply });
}
