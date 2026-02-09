import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AGENTS } from "../../../lib/agents";

type AgentRequest = {
  agentId?: string;
  message?: string;
};

const OPENAI_MODEL = "gpt-4o";

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

const stripCodeFence = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/```[a-zA-Z]*\n?/g, "").replace(/```$/g, "").trim();
  }
  return trimmed;
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

  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    console.error("Agent API: OPENAI_API_KEY missing.");
    return NextResponse.json(
      { error: "OpenAI credentials missing." },
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
  let replyText = "";
  let outputJson: unknown = null;

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: agent.systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Agent API: OpenAI error", response.status, errorBody);
      return NextResponse.json(
        { error: "OpenAI request failed." },
        { status: 500 },
      );
    }

    const data = await response.json();
    replyText = data?.choices?.[0]?.message?.content ?? "";
    const cleaned = stripCodeFence(replyText);
    try {
      outputJson = JSON.parse(cleaned);
    } catch (parseError) {
      outputJson = null;
    }
  } catch (error) {
    console.error("Agent API: OpenAI exception", error);
    return NextResponse.json(
      { error: "OpenAI request failed." },
      { status: 500 },
    );
  }

  const payload = {
    type: "agent_chat",
    agent_id: agent.id,
    agent_name: agent.name,
    input: message,
    output: outputJson ?? replyText,
    output_raw: replyText,
    output_is_json: Boolean(outputJson),
    model: OPENAI_MODEL,
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
    reply: replyText,
    agent: {
      id: agent.id,
      name: agent.name,
      category: agent.category,
    },
  });
}
