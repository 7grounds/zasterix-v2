import type { UserProgressRow } from "../../../lib/types";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type AgentRequest = {
  agentId?: string;
  message?: string;
  userId?: string;
  stageId?: string;
  moduleId?: string;
  sessionId?: string;
  organizationName?: string;
  subOrganization?: string;
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

const normalizeToolName = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "web_search") return "external_search";
  return normalized;
};

const slugify = (value: string) => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const resolveOrganizationId = async ({
  supabase,
  organizationName,
  subOrganization,
}: {
  supabase: ReturnType<typeof createClient>;
  organizationName?: string;
  subOrganization?: string;
}) => {
  const baseName = "Zasterix";
  const suffix = subOrganization?.trim();
  const resolvedName =
    organizationName?.trim() || (suffix ? `${baseName} ${suffix}` : baseName);
  const slug = slugify(resolvedName) || "zasterix";

  const { data: existing, error: lookupError } = await supabase
    .from("organizations")
    .select("id")
    .eq("name", resolvedName)
    .maybeSingle();

  if (lookupError) {
    console.error("Agent API: organization lookup failed:", lookupError);
  }

  if (existing && (existing as any).id) {
    return (existing as any).id as string;
  }

  const { data, error } = await supabase
    .from("organizations")
    .insert({ name: resolvedName, slug })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Agent API: organization insert failed:", error);
    return null;
  }

  return data?.id ?? null;
};

type CompletedTaskEntry = {
  task_id: string;
  completed_at?: string;
  evaluation?: {
    score?: number | null;
    feedback?: string | null;
  };
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

const normalizeCompletedTasks = (tasks: unknown[]) => {
  const normalized: CompletedTaskEntry[] = [];
  tasks.forEach((item) => {
    if (typeof item === "string" && item.trim()) {
      normalized.push({ task_id: item.trim() });
      return;
    }
    if (item && typeof item === "object" && "task_id" in item) {
      const entry = item as CompletedTaskEntry;
      if (typeof entry.task_id === "string" && entry.task_id.trim()) {
        normalized.push({
          task_id: entry.task_id.trim(),
          completed_at: entry.completed_at,
          evaluation: entry.evaluation,
        });
      }
    }
  });
  return normalized;
};

const mergeCompletedTasks = (
  existing: CompletedTaskEntry[],
  updates: CompletedTaskEntry[],
) => {
  const merged = new Map<string, CompletedTaskEntry>();
  existing.forEach((entry) => merged.set(entry.task_id, entry));
  updates.forEach((entry) => merged.set(entry.task_id, entry));
  return Array.from(merged.values());
};

const buildFeedbackMessage = (evaluations: CompletedTaskEntry[]) => {
  if (evaluations.length === 0) return "";
  return evaluations
    .map((entry) => {
      const score = entry.evaluation?.score;
      const feedback = entry.evaluation?.feedback ?? "Step bewertet.";
      return `Step ${entry.task_id}: ${
        score !== undefined && score !== null ? `Score ${score}/10` : "Bewertet"
      } – ${feedback}`;
    })
    .join("\n");
};

const extractScoreFeedback = (
  output: unknown,
  replyText: string,
  evaluations: CompletedTaskEntry[],
) => {
  let score: number | null = null;
  let feedback: string | null = null;

  if (evaluations[0]?.evaluation) {
    score =
      typeof evaluations[0].evaluation?.score === "number"
        ? evaluations[0].evaluation?.score ?? null
        : null;
    feedback =
      typeof evaluations[0].evaluation?.feedback === "string"
        ? evaluations[0].evaluation?.feedback ?? null
        : null;
  }

  if (output && typeof output === "object") {
    const record = output as Record<string, unknown>;
    if (score === null && typeof record.score === "number") {
      score = record.score;
    }
    if (!feedback && typeof record.feedback === "string") {
      feedback = record.feedback;
    }
  }

  if (score === null) {
    const scoreMatch = replyText.match(/score\s*[:\-]?\s*(\d{1,2})/i);
    if (scoreMatch) {
      const parsed = Number(scoreMatch[1]);
      score = Number.isNaN(parsed) ? null : parsed;
    }
  }

  if (!feedback) {
    const feedbackMatch = replyText.match(/feedback\s*[:\-]?\s*(.+)/i);
    if (feedbackMatch) {
      feedback = feedbackMatch[1].trim();
    }
  }

  return {
    score,
    feedback: feedback ?? "Step abgeschlossen.",
  };
};

const evaluateTasks = async ({
  openAiKey,
  model,
  tasks,
  userMessage,
  replyText,
}: {
  openAiKey: string;
  model: string;
  tasks: string[];
  userMessage: string;
  replyText: string;
}): Promise<CompletedTaskEntry[]> => {
  if (tasks.length === 0) return [];
  try {
    const evaluationPrompt = `Bewerte die folgenden abgeschlossenen Steps. Gib ausschließlich JSON zurück als Array mit Objekten { "task_id": string, "score": number (1-10), "feedback": string }.

Steps: ${tasks.join(", ")}
User Input: ${userMessage}
Agent Response: ${replyText}
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "Du bist ein strenger, aber fairer Bewertungsassistent für Aufgabenfortschritt.",
          },
          { role: "user", content: evaluationPrompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Agent API: evaluation OpenAI error", response.status, errorBody);
      return tasks.map((task) => ({
        task_id: task,
        completed_at: new Date().toISOString(),
        evaluation: { score: 7, feedback: "Step abgeschlossen." },
      }));
    }

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";
    const cleaned = stripCodeFence(raw);
    const parsed = JSON.parse(cleaned) as Array<{
      task_id: string;
      score: number;
      feedback: string;
    }>;

    if (!Array.isArray(parsed)) {
      return tasks.map((task) => ({
        task_id: task,
        completed_at: new Date().toISOString(),
        evaluation: { score: 7, feedback: "Step abgeschlossen." },
      }));
    }

    return parsed
      .filter((item) => typeof item?.task_id === "string")
      .map((item) => ({
        task_id: item.task_id,
        completed_at: new Date().toISOString(),
        evaluation: { score: item.score, feedback: item.feedback },
      }));
  } catch (error) {
    console.error("Agent API: evaluation exception", error);
    return tasks.map((task) => ({
      task_id: task,
      completed_at: new Date().toISOString(),
      evaluation: { score: 7, feedback: "Step abgeschlossen." },
    }));
  }
};

type ToolCall = {
  name: string;
  payload: Record<string, unknown>;
  raw: string;
};

const parseToolCall = (text: string): ToolCall | null => {
  const payloadMatch = text.match(
    /\[USE_TOOL:\s*([^\|\]]+)\s*\|\s*payload:\s*(\{[\s\S]*?\})\s*\]/i,
  );
  if (payloadMatch) {
    const name = payloadMatch[1]?.trim();
    const payloadRaw = payloadMatch[2]?.trim();
    if (!name || !payloadRaw) return null;
    try {
      const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
      return { name, payload, raw: payloadMatch[0] };
    } catch (_error) {
      return { name, payload: { raw: payloadRaw }, raw: payloadMatch[0] };
    }
  }

  const keyValueMatch = text.match(/\[USE_TOOL:\s*([^\|\]]+)\s*\|\s*([^\]]+)\]/i);
  if (keyValueMatch) {
    const name = keyValueMatch[1]?.trim();
    const rest = keyValueMatch[2] ?? "";
    if (!name) return null;
    const payload: Record<string, unknown> = {};
    rest.split("|").forEach((part) => {
      const [rawKey, ...rawValueParts] = part.split(":");
      if (!rawKey || rawValueParts.length === 0) return;
      const key = rawKey.trim();
      const valueRaw = rawValueParts.join(":").trim();
      const cleaned = valueRaw.replace(/^"|"$/g, "");
      payload[key] = cleaned;
    });
    return { name, payload, raw: keyValueMatch[0] };
  }

  const targetMatch = text.match(
    /\[USE_TOOL:\s*([^\|\]]+)\s*\|\s*target:\s*"?([^"\]]+)"?\s*\]/i,
  );
  if (targetMatch) {
    const name = targetMatch[1]?.trim();
    const target = targetMatch[2]?.trim();
    if (!name || !target) return null;
    return {
      name,
      payload: { target },
      raw: targetMatch[0],
    };
  }

  return null;
};

const fetchAgentHierarchy = async (
  supabase: ReturnType<typeof createClient>,
) => {
  const { data, error } = await supabase
    .from("agent_templates")
    .select("id, name, description, system_prompt, parent_id")
    .order("name", { ascending: true });

  if (error) {
    console.error("Agent API: hierarchy fetch failed:", error);
    return [] as Array<{
      id: string;
      name: string;
      description: string;
      system_prompt: string;
      parent_id: string | null;
    }>;
  }

  return (data ?? []) as Array<{
    id: string;
    name: string;
    description: string;
    system_prompt: string;
    parent_id: string | null;
  }>;
};

const buildHierarchyDirectory = (
  agents: Array<{
    id: string;
    name: string;
    parent_id: string | null;
  }>,
) => {
  const byParent = new Map<string | null, typeof agents>();
  agents.forEach((agent) => {
    const key = agent.parent_id ?? null;
    const list = byParent.get(key) ?? [];
    list.push(agent);
    byParent.set(key, list);
  });

  const lines: string[] = [];
  const render = (parentId: string | null, depth: number) => {
    const children = byParent.get(parentId) ?? [];
    children.forEach((child) => {
      const prefix = "  ".repeat(depth);
      lines.push(`${prefix}- ${child.id} | ${child.name}`);
      render(child.id, depth + 1);
    });
  };
  render(null, 0);
  return lines.length ? `\n\nAgent Tree:\n${lines.join("\n")}` : "";
};

const buildChildContext = (
  children: Array<{
    id: string;
    name: string;
    system_prompt: string;
  }>,
) => {
  if (children.length === 0) return "";
  const lines = children.map(
    (child) =>
      `- ${child.id} | ${child.name}\nPrompt: ${child.system_prompt}`,
  );
  return `\n\nChild Agents (delegate via [USE_TOOL: agent_call | target_id: \"...\"]):\n${lines.join(
    "\n",
  )}`;
};

const isNavigator = (agent: { name: string; system_prompt: string }) => {
  const haystack = `${agent.name} ${agent.system_prompt}`.toLowerCase();
  return (
    haystack.includes("navigator") ||
    haystack.includes("routing") ||
    haystack.includes("router") ||
    haystack.includes("flow")
  );
};

const buildAgentDirectory = async (supabase: ReturnType<typeof createClient>) => {
  const { data, error } = await supabase
    .from("agent_templates")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    console.error("Agent API: agent directory fetch failed:", error);
    return "";
  }

  const directory = (data ?? [])
    .map((row: { id: string; name: string }) => `${row.id} - ${row.name}`)
    .join("\n");

  return directory ? `\n\nAvailable Agents:\n${directory}` : "";
};

const updateSessionState = async ({
  supabase,
  sessionId,
  targetAgent,
  contextNote,
  organizationId,
}: {
  supabase: ReturnType<typeof createClient>;
  sessionId: string;
  targetAgent: { id: string; name: string };
  contextNote?: string;
  organizationId?: string | null;
}) => {
  if (!sessionId) return;

  const payload = {
    type: "agent_session",
    session_id: sessionId,
    active_agent_id: targetAgent.id,
    active_agent_name: targetAgent.name,
    context_note: contextNote ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: lookupError } = await supabase
    .from("universal_history")
    .select("id")
    .eq("payload->>type", "agent_session")
    .eq("payload->>session_id", sessionId)
    .maybeSingle();

  if (lookupError) {
    console.error("Agent API: session lookup failed:", lookupError);
  }

  if (existing?.id) {
    const { error } = await supabase
      .from("universal_history")
      .update({ payload, organization_id: organizationId ?? null })
      .eq("id", existing.id);

    if (error) {
      console.error("Agent API: session update failed:", error);
    }
    return;
  }

  const { error } = await supabase
    .from("universal_history")
    .insert({ payload, organization_id: organizationId ?? null });
  if (error) {
    console.error("Agent API: session insert failed:", error);
  }
};

const dispatchTool = async ({
  supabase,
  tool,
  userId,
  stageId,
  moduleId,
  sessionId,
  openAiKey,
}: {
  supabase: ReturnType<typeof createClient>;
  tool: ToolCall;
  userId?: string;
  stageId?: string;
  moduleId?: string;
  sessionId?: string;
  openAiKey: string;
}) => {
  const toolName = normalizeToolName(tool.name);

  if (toolName === "user_asset_history") {
    const query = supabase.from("user_asset_history").select("*").limit(5);
    if (tool.payload.user_id) {
      query.eq("user_id", String(tool.payload.user_id));
    }
    if (tool.payload.isin) {
      query.eq("isin", String(tool.payload.isin));
    }
    const { data, error } = await query.order("analyzed_at", {
      ascending: false,
    });
    if (error) {
      return { error: error.message };
    }
    return { data };
  }

  if (toolName === "progress_tracker") {
    let query = supabase
      .from("user_progress")
      .select("stage_id, module_id, completed_tasks, payload")
      .limit(1);
    if (tool.payload.user_id) {
      query = query.eq("user_id", String(tool.payload.user_id));
    } else if (userId) {
      query = query.eq("user_id", userId);
    }
    if (tool.payload.stage_id) {
      query = query.eq("stage_id", String(tool.payload.stage_id));
    } else if (stageId) {
      query = query.eq("stage_id", stageId);
    }
    if (tool.payload.module_id) {
      query = query.eq("module_id", String(tool.payload.module_id));
    } else if (moduleId) {
      query = query.eq("module_id", moduleId);
    }
    const { data, error } = await query.maybeSingle();
    if (error) {
      return { error: error.message };
    }
    return { data };
  }

  if (toolName === "external_search") {
    return { error: "external_search not configured" };
  }

  if (toolName === "agent_call") {
    const targetId =
      typeof tool.payload.target_id === "string"
        ? tool.payload.target_id.trim()
        : "";
    const task =
      typeof tool.payload.task === "string" ? tool.payload.task.trim() : "";

    if (!targetId || !task) {
      return { error: "agent_call requires target_id and task" };
    }

    const { data, error } = await supabase
      .from("agent_templates")
      .select("id, name, system_prompt")
      .eq("id", targetId)
      .maybeSingle();

    if (error || !data) {
      return { error: "agent_call target not found" };
    }

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
            { role: "system", content: data.system_prompt },
            { role: "user", content: task },
          ],
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(
          "Agent API: agent_call OpenAI error",
          response.status,
          errorBody,
        );
        return { error: "agent_call OpenAI error" };
      }

      const resultData = await response.json();
      const output = resultData?.choices?.[0]?.message?.content ?? "";
      return {
        data: {
          target_id: data.id,
          target_name: data.name,
          output,
        },
      };
    } catch (error) {
      console.error("Agent API: agent_call exception", error);
      return { error: "agent_call exception" };
    }
  }

  if (toolName === "agent_router") {
    const target =
      typeof tool.payload.target_id === "string"
        ? tool.payload.target_id.trim()
        : typeof tool.payload.target === "string"
          ? tool.payload.target.trim()
          : typeof tool.payload.name === "string"
            ? tool.payload.name.trim()
            : "";
    const contextNote =
      typeof tool.payload.context_note === "string"
        ? tool.payload.context_note.trim()
        : typeof tool.payload.note === "string"
          ? tool.payload.note.trim()
          : "";
    const resolvedSessionId =
      typeof tool.payload.session_id === "string"
        ? tool.payload.session_id
        : sessionId ?? "";

    if (!target) {
      return { error: "agent_router target missing" };
    }

    const { data, error } = await supabase
      .from("agent_templates")
      .select("id, name, description, system_prompt")
      .or(`id.eq.${target},name.ilike.%${target}%`)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      return { error: error.message };
    }

    if (!data) {
      return { error: `Agent not found for target: ${target}` };
    }

    await updateSessionState({
      supabase,
      sessionId: resolvedSessionId,
      targetAgent: { id: data.id, name: data.name },
      contextNote: contextNote || undefined,
    });

    return {
      data: {
        target_id: data.id,
        target_name: data.name,
        message: `Übergebe an Spezial-Agent ${data.name}...`,
        session_id: resolvedSessionId || null,
        context_note: contextNote || null,
      },
    };
  }

  return { error: `Tool not supported: ${tool.name}` };
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
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const organizationName =
    typeof body.organizationName === "string" ? body.organizationName : "";
  const subOrganization =
    typeof body.subOrganization === "string" ? body.subOrganization : "";

  if (!message) {
    return NextResponse.json(
      { error: "Message is required." },
      { status: 400 },
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  const organizationId = await resolveOrganizationId({
    supabase,
    organizationName,
    subOrganization,
  });

  let progressContext = "No progress context available.";
  let existingTasks: CompletedTaskEntry[] = [];
  let existingPayload: Record<string, unknown> | null = null;

  if (userId && stageId && moduleId) {
    const { data: progressRow, error: progressError } = await supabase
      .from("user_progress")
      .select("stage_id, module_id, completed_tasks, payload")
      .eq("user_id", userId)
      .eq("stage_id", stageId)
      .eq("module_id", moduleId)
      .maybeSingle<UserProgressRow>();

    if (progressError) {
      console.error("Agent API: user_progress lookup failed:", progressError);
    } else if (progressRow) {
      existingTasks = Array.isArray(progressRow.completed_tasks)
        ? normalizeCompletedTasks(progressRow.completed_tasks)
        : [];
      existingPayload =
        progressRow.payload && typeof progressRow.payload === "object"
          ? (progressRow.payload as Record<string, unknown>)
          : null;
      progressContext = `Current progress: stage_id=${progressRow.stage_id}, module_id=${progressRow.module_id}, completed_tasks=[${existingTasks
        .map((task) => task.task_id)
        .join(", ")}]`;
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
    allowed_tools: string[] | null;
  };

  if (agentId) {
    const { data, error } = await supabase
      .from("agent_templates")
      .select("id, name, description, system_prompt, category, allowed_tools")
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
      .select("id, name, description, system_prompt, category, allowed_tools")
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

  const hierarchy = await fetchAgentHierarchy(supabase);
  const agentDirectory = isNavigator(agent)
    ? buildHierarchyDirectory(hierarchy)
    : "";
  const childAgents = hierarchy.filter((entry) => entry.parent_id === agent.id);
  const managerContext = buildChildContext(
    childAgents.map((entry) => ({
      id: entry.id,
      name: entry.name,
      system_prompt: entry.system_prompt,
    })),
  );
  const allowedTools = Array.isArray(agent.allowed_tools)
    ? agent.allowed_tools.map(normalizeToolName)
    : [];
  const allowedToolsPrompt =
    allowedTools.length > 0
      ? `\n\nDir stehen folgende Optionen zur Verfügung: ${allowedTools.join(
          ", ",
        )}`
      : "\n\nDir stehen keine Optionen zur Verfügung.";

  let replyText = "";
  let outputJson: unknown = null;
  let toolCall: ToolCall | null = null;
  let toolResult: Record<string, unknown> | null = null;
  let handover:
    | { target_id: string; target_name: string; message: string }
    | null = null;

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
            content: `${agent.system_prompt}${agentDirectory}${managerContext}${allowedToolsPrompt}\n\nProgress Context:\n${progressContext}`,
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
    toolCall = parseToolCall(replyText);
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

  if (toolCall) {
    const requestedTool = normalizeToolName(toolCall.name);
    const isAllowed =
      allowedTools.length > 0 && allowedTools.includes(requestedTool);

    if (!isAllowed) {
      toolResult = {
        error: `Tool not allowed: ${toolCall.name}`,
      };
    } else {
      toolResult = await dispatchTool({
        supabase,
        tool: toolCall,
        userId,
        stageId,
        moduleId,
        sessionId,
        openAiKey,
      });
    }

    if (
      normalizeToolName(toolCall.name) === "agent_router" &&
      toolResult &&
      "data" in toolResult &&
      toolResult.data &&
      typeof toolResult.data === "object"
    ) {
      const record = toolResult.data as Record<string, unknown>;
      if (
        typeof record.target_id === "string" &&
        typeof record.target_name === "string" &&
        typeof record.message === "string"
      ) {
        handover = {
          target_id: record.target_id,
          target_name: record.target_name,
          message: record.message,
        };
        await updateSessionState({
          supabase,
          sessionId: record.session_id ?? sessionId,
          targetAgent: {
            id: record.target_id,
            name: record.target_name,
          },
          contextNote:
            typeof record.context_note === "string"
              ? record.context_note
              : undefined,
          organizationId,
        });
      }
    }

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
              content: `${agent.system_prompt}${agentDirectory}${managerContext}${allowedToolsPrompt}\n\nProgress Context:\n${progressContext}`,
            },
            { role: "user", content: message },
            { role: "assistant", content: replyText },
            {
              role: "user",
              content: `Tool Result (${toolCall.name}): ${JSON.stringify(toolResult)}`,
            },
          ],
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(
          "Agent API: OpenAI tool follow-up error",
          response.status,
          errorBody,
        );
      } else {
        const data = await response.json();
        replyText = data?.choices?.[0]?.message?.content ?? replyText;
        const cleaned = stripCodeFence(replyText);
        try {
          outputJson = JSON.parse(cleaned);
        } catch (_parseError) {
          outputJson = null;
        }
      }
    } catch (error) {
      console.error("Agent API: tool follow-up exception", error);
    }
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
    tool_call: toolCall,
    tool_result: toolResult,
    handover,
  };

  const { error } = await supabase
    .from("universal_history")
    .insert({ payload, organization_id: organizationId ?? null });

  if (error) {
    console.error("Agent API insert failed:", error);
    return NextResponse.json(
      { error: "Failed to write history." },
      { status: 500 },
    );
  }

  const completedTaskIds = extractCompletedTasks(outputJson);
  let evaluations: CompletedTaskEntry[] = [];
  if (completedTaskIds.length > 0) {
    evaluations = await evaluateTasks({
      openAiKey,
      model: OPENAI_MODEL,
      tasks: completedTaskIds,
      userMessage: message,
      replyText,
    });
  }

  const completionSignal =
    /\[STATUS:\s*COMPLETED\]/i.test(replyText) ||
    (outputJson &&
      typeof outputJson === "object" &&
      String((outputJson as Record<string, unknown>).status ?? "").toLowerCase() ===
        "completed");

  const completionPayload = completionSignal
    ? {
        ...extractScoreFeedback(outputJson, replyText, evaluations),
        validated_at: new Date().toISOString(),
      }
    : null;

  if (
    userId &&
    stageId &&
    moduleId &&
    (evaluations.length > 0 || completionPayload)
  ) {
    const mergedTasks = mergeCompletedTasks(existingTasks, evaluations);
    const { error: progressUpdateError } = await supabase
      .from("user_progress")
      .upsert(
        {
          user_id: userId,
          stage_id: stageId,
          module_id: moduleId,
          completed_tasks: mergedTasks,
          organization_id: organizationId ?? undefined,
          payload: completionPayload ?? existingPayload ?? {},
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
    feedback: buildFeedbackMessage(evaluations),
    evaluations,
    tool_call: toolCall,
    tool_result: toolResult,
    handover,
    agent_switched: Boolean(handover),
    active_agent: handover
      ? { id: handover.target_id, name: handover.target_name }
      : null,
    agent: {
      id: agent.id,
      name: agent.name,
      category: agent.category,
    },
  });
}
