import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
type AgentRequest = {
  agentId?: string;
  message?: string;
  userId?: string;
  stageId?: string;
  moduleId?: string;
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

const extractCompletedTasks = (output: unknown) => {
  if (!output || typeof output !== "object") return [];
  const record = output as Record<string, unknown>;
  const candidate =
    record.completed_tasks ??
    record.completed_steps ??
    record.completed_task ??
    record.completed_step;

  if (Array.isArray(candidate)) {
    return candidate
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof candidate === "string" && candidate.trim()) {
    return [candidate.trim()];
  }

  return [];
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
  const userId = typeof body.userId === "string" ? body.userId : "";
  const stageId = typeof body.stageId === "string" ? body.stageId : "";
  const moduleId = typeof body.moduleId === "string" ? body.moduleId : "";

  if (!message) {
    return NextResponse.json(
      { error: "Message is required." },
      { status: 400 },
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  let progressContext = "No progress context available.";
  let existingTasks: string[] = [];

  if (userId && stageId && moduleId) {
    const { data: progressRow, error: progressError } = await supabase
      .from("user_progress")
      .select("stage_id, module_id, completed_tasks")
      .eq("user_id", userId)
      .eq("stage_id", stageId)
      .eq("module_id", moduleId)
      .maybeSingle();

    if (progressError) {
      console.error("Agent API: user_progress lookup failed:", progressError);
    } else if (progressRow) {
      existingTasks = Array.isArray(progressRow.completed_tasks)
        ? progressRow.completed_tasks.filter(
            (task: unknown) => typeof task === "string",
          )
        : [];
      progressContext = `Current progress: stage_id=${progressRow.stage_id}, module_id=${progressRow.module_id}, completed_tasks=[${existingTasks.join(
        ", ",
      )}]`;
    } else {
      progressContext = `No progress entry for stage_id=${stageId}, module_id=${moduleId}.`;
    }
  }

  let agent = null as null | {
    id: string;
    name: string;
    description: string;
    system_prompt: string;
    category: string | null;
  };

  if (agentId) {
    const { data, error } = await supabase
      .from("agent_templates")
      .select("id, name, description, system_prompt, category")
      .eq("id", agentId)
      .maybeSingle();

    if (error) {
      console.error("Agent API: agent_templates lookup failed:", error);
      return NextResponse.json(
        { error: "Failed to load agent definition." },
        { status: 500 },
      );
    }
    agent = data ?? null;
  }

  if (!agent) {
    const { data, error } = await supabase
      .from("agent_templates")
      .select("id, name, description, system_prompt, category")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      console.error("Agent API: no agent_templates found:", error);
      return NextResponse.json(
        { error: "No agents available." },
        { status: 404 },
      );
    }
    agent = data;
  }

  let replyText = "";
  let outputJson: unknown = null;

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
          {
            role: "system",
            content: `${agent.system_prompt}\n\nProgress Context:\n${progressContext}`,
          },
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

  const completedTasks = extractCompletedTasks(outputJson);
  if (userId && stageId && moduleId && completedTasks.length > 0) {
    const mergedTasks = Array.from(new Set([...existingTasks, ...completedTasks]));
    const { error: progressUpdateError } = await supabase
      .from("user_progress")
      .upsert(
        {
          user_id: userId,
          stage_id: stageId,
          module_id: moduleId,
          completed_tasks: mergedTasks,
        },
        { onConflict: "user_id,stage_id,module_id" },
      );

    if (progressUpdateError) {
      console.error(
        "Agent API: user_progress update failed:",
        progressUpdateError,
      );
    }
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
