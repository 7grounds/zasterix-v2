import type { UserProgressRow } from "../../../lib/types";
import {
  AGENT_BLUEPRINTS,
  type OrganizationCategory,
} from "../../../lib/agent_blueprints";
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

const TOOL_REGISTRY = [
  { name: "user_asset_history", status: "active" },
  { name: "progress_tracker", status: "active" },
  { name: "external_search", status: "unconfigured", aliases: ["web_search"] },
  { name: "agent_router", status: "active" },
  { name: "agent_call", status: "active" },
  { name: "generate_agent_definition", status: "active" },
  { name: "process_enterprise_list", status: "active" },
  { name: "universal_history", status: "active" },
  { name: "agent_templates", status: "active" },
  { name: "tool_registry", status: "active" },
  { name: "ticket_creation", status: "active" },
  { name: "sentiment_analysis", status: "active" },
  { name: "create_corrective_task", status: "active" },
  { name: "create_task_from_feedback", status: "active" },
  { name: "get_system_capabilities", status: "active" },
  { name: "analyze_synergies", status: "active" },
  { name: "sync_context", status: "active" },
];

const analyzeSentiment = (text: string) => {
  const normalized = text.toLowerCase();
  const positiveKeywords = [
    "gut",
    "danke",
    "super",
    "grossartig",
    "stark",
    "zufrieden",
    "hilfreich",
    "love",
    "great",
    "excellent",
    "amazing",
  ];
  const negativeKeywords = [
    "schlecht",
    "problem",
    "beschwerde",
    "frustriert",
    "enttaeuscht",
    "unzufrieden",
    "bug",
    "fehler",
    "issue",
    "hate",
    "broken",
  ];

  const positiveHits = positiveKeywords.filter((keyword) =>
    normalized.includes(keyword),
  );
  const negativeHits = negativeKeywords.filter((keyword) =>
    normalized.includes(keyword),
  );
  const score = positiveHits.length - negativeHits.length;
  const sentiment = score > 0 ? "positive" : score < 0 ? "negative" : "neutral";

  return {
    sentiment,
    score,
    matches: {
      positive: Array.from(new Set(positiveHits)),
      negative: Array.from(new Set(negativeHits)),
    },
  };
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

  if (existing?.id) {
    return existing.id as string;
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

const resolveOrganizationRecord = async ({
  supabase,
  name,
}: {
  supabase: ReturnType<typeof createClient>;
  name: string;
}) => {
  const resolvedName = name.trim();
  if (!resolvedName) return null;
  const slug = slugify(resolvedName);

  const { data: existing, error: lookupError } = await supabase
    .from("organizations")
    .select("id")
    .eq("name", resolvedName)
    .maybeSingle();

  if (lookupError) {
    console.error("Agent API: organization lookup failed:", lookupError);
  }

  if (existing?.id) {
    return existing.id as string;
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

const ensureAgentTemplate = async ({
  supabase,
  organizationId,
  parentId,
  name,
  description,
  systemPrompt,
  allowedTools,
  isOperative,
}: {
  supabase: ReturnType<typeof createClient>;
  organizationId: string;
  parentId?: string | null;
  name: string;
  description: string;
  systemPrompt: string;
  allowedTools?: string[];
  isOperative?: boolean;
}) => {
  const { data: existing } = await supabase
    .from("agent_templates")
    .select("id")
    .eq("name", name)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (existing?.id) {
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("agent_templates")
    .insert({
      name,
      description,
      system_prompt: systemPrompt,
      organization_id: organizationId,
      parent_id: parentId ?? null,
      allowed_tools: allowedTools ?? [],
      is_operative: isOperative ?? false,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Agent API: agent insert failed:", error);
    return null;
  }

  return data?.id ?? null;
};

const resolveAgentIdByName = async ({
  supabase,
  organizationId,
  name,
  preferOperative = true,
}: {
  supabase: ReturnType<typeof createClient>;
  organizationId: string;
  name: string;
  preferOperative?: boolean;
}) => {
  const resolvedName = name.trim();
  if (!resolvedName) return null;

  let query = supabase
    .from("agent_templates")
    .select("id, name, is_operative")
    .eq("organization_id", organizationId)
    .ilike("name", `%${resolvedName}%`);

  if (preferOperative) {
    query = query.order("is_operative", { ascending: false });
  }

  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Agent API: agent lookup failed:", error);
    return null;
  }

  return data?.id ?? null;
};

const parseEnterpriseList = (payload: Record<string, unknown>) => {
  const companyName =
    typeof payload.company_name === "string"
      ? payload.company_name
      : typeof payload.organization === "string"
        ? payload.organization
        : typeof payload.name === "string"
          ? payload.name
          : "";

  const list =
    Array.isArray(payload.list)
      ? payload.list
      : Array.isArray(payload.employees)
        ? payload.employees
        : Array.isArray(payload.members)
          ? payload.members
          : typeof payload.list === "string"
            ? payload.list.split("\n")
            : typeof payload.employees === "string"
              ? payload.employees.split("\n")
              : typeof payload.members === "string"
                ? payload.members.split("\n")
                : [];

  const entries =
    typeof payload.entries === "string"
      ? payload.entries
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [name, role] = line.split("-").map((part) => part.trim());
            return { name, role };
          })
      : [];

  const normalized = [
    ...list,
    ...entries,
  ].flatMap((item: unknown) => {
    if (typeof item === "string") {
      const [name, role] = item.split("-").map((part) => part.trim());
      return [{ name, role }];
    }
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name : "";
      const role = typeof record.role === "string" ? record.role : "";
      return name ? [{ name, role }] : [];
    }
    return [];
  });

  return {
    companyName: companyName.trim(),
    employees: normalized.filter((entry) => entry.name),
  };
};

const normalizeOrganizationCategory = (
  value: string,
): OrganizationCategory | null => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (
    normalized.includes("school") ||
    normalized.includes("schule") ||
    normalized.includes("education") ||
    normalized.includes("edu") ||
    normalized.includes("academy") ||
    normalized.includes("university")
  ) {
    return "school";
  }
  if (normalized.includes("startup") || normalized.includes("start-up")) {
    return "startup";
  }
  if (
    normalized.includes("enterprise") ||
    normalized.includes("company") ||
    normalized.includes("unternehmen") ||
    normalized.includes("firma")
  ) {
    return "enterprise";
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
  organizationId,
}: {
  supabase: ReturnType<typeof createClient>;
  tool: ToolCall;
  userId?: string;
  stageId?: string;
  moduleId?: string;
  sessionId?: string;
  openAiKey: string;
  organizationId?: string | null;
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

  if (toolName === "sentiment_analysis") {
    const payload = tool.payload ?? {};
    const text =
      typeof payload.text === "string"
        ? payload.text.trim()
        : typeof payload.message === "string"
          ? payload.message.trim()
          : typeof payload.content === "string"
            ? payload.content.trim()
            : "";
    if (!text) {
      return { error: "sentiment_analysis requires text" };
    }
    return { data: analyzeSentiment(text) };
  }

  if (toolName === "ticket_creation") {
    const payload = tool.payload ?? {};
    const summary =
      typeof payload.summary === "string"
        ? payload.summary.trim()
        : typeof payload.title === "string"
          ? payload.title.trim()
          : "";
    const description =
      typeof payload.description === "string"
        ? payload.description.trim()
        : typeof payload.details === "string"
          ? payload.details.trim()
          : typeof payload.message === "string"
            ? payload.message.trim()
            : "";
    const category =
      typeof payload.category === "string"
        ? payload.category.trim()
        : typeof payload.type === "string"
          ? payload.type.trim()
          : "";
    const priority =
      typeof payload.priority === "string"
        ? payload.priority.trim()
        : typeof payload.severity === "string"
          ? payload.severity.trim()
          : "";
    const reporter =
      typeof payload.reporter === "string"
        ? payload.reporter.trim()
        : typeof userId === "string"
          ? userId
          : "";
    const orgId =
      typeof payload.organization_id === "string"
        ? payload.organization_id.trim()
        : organizationId ?? null;

    if (!summary && !description) {
      return { error: "ticket_creation requires summary or description" };
    }

    const payloadSummary = summary || description.slice(0, 140);
    const ticketPayload = {
      type: "ticket",
      summary: payloadSummary,
      description,
      category: category || "intake",
      priority: priority || "normal",
      reporter: reporter || null,
      source: "sentinel",
      sentiment:
        typeof payload.sentiment === "string" ? payload.sentiment.trim() : null,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("universal_history")
      .insert({ payload: ticketPayload, organization_id: orgId })
      .select("id")
      .maybeSingle();

    if (error) {
      return { error: error.message };
    }

    return {
      data: {
        ticket_id: data?.id ?? null,
        message: "Ticket wurde erstellt.",
      },
    };
  }

  if (toolName === "create_corrective_task") {
    const payload = tool.payload ?? {};
    const summary =
      typeof payload.summary === "string"
        ? payload.summary.trim()
        : typeof payload.title === "string"
          ? payload.title.trim()
          : "";
    const description =
      typeof payload.description === "string"
        ? payload.description.trim()
        : typeof payload.details === "string"
          ? payload.details.trim()
          : typeof payload.message === "string"
            ? payload.message.trim()
            : "";
    const classification =
      typeof payload.classification === "string"
        ? payload.classification.trim()
        : typeof payload.issue_type === "string"
          ? payload.issue_type.trim()
          : typeof payload.type === "string"
            ? payload.type.trim()
            : "";
    const reporter =
      typeof payload.reporter === "string"
        ? payload.reporter.trim()
        : typeof userId === "string"
          ? userId
          : "";
    const agentIdRaw =
      typeof payload.agent_id === "string"
        ? payload.agent_id.trim()
        : typeof payload.responsible_agent_id === "string"
          ? payload.responsible_agent_id.trim()
          : "";
    const agentName =
      typeof payload.agent_name === "string"
        ? payload.agent_name.trim()
        : typeof payload.responsible_agent === "string"
          ? payload.responsible_agent.trim()
          : typeof payload.module === "string"
            ? payload.module.trim()
            : "";
    const orgId =
      typeof payload.organization_id === "string"
        ? payload.organization_id.trim()
        : organizationId ?? "";

    if (!orgId) {
      return { error: "create_corrective_task requires organization_id" };
    }

    if (!summary && !description) {
      return { error: "create_corrective_task requires summary or description" };
    }

    let resolvedAgentId = agentIdRaw;
    if (!resolvedAgentId && agentName) {
      const resolved = await resolveAgentIdByName({
        supabase,
        organizationId: orgId,
        name: agentName,
      });
      resolvedAgentId = resolved ?? "";
    }

    const title =
      summary ||
      `${classification || "Issue"}: ${description.slice(0, 120)}`.trim();
    const metadata = {
      classification: classification || null,
      reporter: reporter || null,
      responsible_agent_name: agentName || null,
      sentiment:
        typeof payload.sentiment === "string" ? payload.sentiment.trim() : null,
      source: "sentinel",
    };

    const { data, error } = await supabase
      .from("operative_tasks")
      .insert({
        title,
        description,
        priority: "high",
        is_high_priority: true,
        status: "open",
        agent_id: resolvedAgentId || null,
        organization_id: orgId,
        source: "sentinel",
        metadata,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      return { error: error.message };
    }

    await supabase.from("universal_history").insert({
      payload: {
        type: "corrective_task_created",
        task_id: data?.id ?? null,
        agent_id: resolvedAgentId || null,
        organization_id: orgId,
        summary: title,
      },
      organization_id: orgId,
    });

    return {
      data: {
        task_id: data?.id ?? null,
        message: "Korrektur-Task wurde erstellt.",
      },
    };
  }

  if (toolName === "create_task_from_feedback") {
    const payload = tool.payload ?? {};
    const summary =
      typeof payload.summary === "string"
        ? payload.summary.trim()
        : typeof payload.title === "string"
          ? payload.title.trim()
          : "";
    const feedback =
      typeof payload.feedback === "string"
        ? payload.feedback.trim()
        : typeof payload.message === "string"
          ? payload.message.trim()
          : typeof payload.text === "string"
            ? payload.text.trim()
            : "";
    const description =
      typeof payload.description === "string"
        ? payload.description.trim()
        : typeof payload.details === "string"
          ? payload.details.trim()
          : feedback;
    const classification =
      typeof payload.classification === "string"
        ? payload.classification.trim()
        : typeof payload.issue_type === "string"
          ? payload.issue_type.trim()
          : typeof payload.type === "string"
            ? payload.type.trim()
            : "";
    const reporter =
      typeof payload.reporter === "string"
        ? payload.reporter.trim()
        : typeof userId === "string"
          ? userId
          : "";
    const agentIdRaw =
      typeof payload.agent_id === "string"
        ? payload.agent_id.trim()
        : typeof payload.responsible_agent_id === "string"
          ? payload.responsible_agent_id.trim()
          : "";
    const agentName =
      typeof payload.agent_name === "string"
        ? payload.agent_name.trim()
        : typeof payload.responsible_agent === "string"
          ? payload.responsible_agent.trim()
          : typeof payload.module === "string"
            ? payload.module.trim()
            : "";
    const orgId =
      typeof payload.organization_id === "string"
        ? payload.organization_id.trim()
        : organizationId ?? "";

    if (!orgId) {
      return { error: "create_task_from_feedback requires organization_id" };
    }

    if (!summary && !description) {
      return {
        error: "create_task_from_feedback requires summary or description",
      };
    }

    let resolvedAgentId = agentIdRaw;
    if (!resolvedAgentId && agentName) {
      const resolved = await resolveAgentIdByName({
        supabase,
        organizationId: orgId,
        name: agentName,
      });
      resolvedAgentId = resolved ?? "";
    }

    const title =
      summary ||
      `${classification || "Feedback"}: ${description.slice(0, 120)}`.trim();
    const metadata = {
      classification: classification || null,
      reporter: reporter || null,
      responsible_agent_name: agentName || null,
      sentiment:
        typeof payload.sentiment === "string" ? payload.sentiment.trim() : null,
      source: "sentinel",
      feedback: feedback || null,
    };

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title,
        description,
        priority: "high",
        is_high_priority: true,
        status: "open",
        agent_id: resolvedAgentId || null,
        organization_id: orgId,
        source: "sentinel",
        metadata,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      return { error: error.message };
    }

    await supabase.from("universal_history").insert({
      payload: {
        type: "feedback_task_created",
        task_id: data?.id ?? null,
        agent_id: resolvedAgentId || null,
        organization_id: orgId,
        summary: title,
      },
      organization_id: orgId,
    });

    let automationNote: string | null = null;
    if (resolvedAgentId && data?.id) {
      const { data: agentRow, error: agentError } = await supabase
        .from("agent_templates")
        .select("id, name, system_prompt, is_operative")
        .eq("id", resolvedAgentId)
        .maybeSingle();

      if (!agentError && agentRow?.id && agentRow.is_operative) {
        await supabase
          .from("operative_tasks")
          .update({ status: "processing", updated_at: new Date().toISOString() })
          .eq("id", data.id);

        try {
          const response = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${openAiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: OPENAI_MODEL,
                messages: [
                  { role: "system", content: agentRow.system_prompt },
                  {
                    role: "user",
                    content: `Operativer Task:\n${title}\n\nDetails:\n${description}\n\nBitte liefere konkrete Handlungsschritte und einen Status-Update.`,
                  },
                ],
                temperature: 0.2,
              }),
            },
          );

          if (!response.ok) {
            const errorBody = await response.text();
            console.error(
              "Agent API: operative task OpenAI error",
              response.status,
              errorBody,
            );
            await supabase
              .from("operative_tasks")
              .update({
                status: "failed",
                updated_at: new Date().toISOString(),
              })
              .eq("id", data.id);
          } else {
            const resultData = await response.json();
            const output = resultData?.choices?.[0]?.message?.content ?? "";
            await supabase
              .from("operative_tasks")
              .update({
                status: "completed",
                response: output,
                processed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", data.id);
            await supabase.from("universal_history").insert({
              payload: {
                type: "operative_task_completed",
                task_id: data.id,
                agent_id: resolvedAgentId,
                organization_id: orgId,
                summary: title,
              },
              organization_id: orgId,
            });
            automationNote = `Operativer Agent ${agentRow.name} hat den Task verarbeitet.`;
          }
        } catch (error) {
          console.error("Agent API: operative task exception", error);
          await supabase
            .from("operative_tasks")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("id", data.id);
        }
      }
    }

    return {
      data: {
        task_id: data?.id ?? null,
        message: "Feedback-Task wurde erstellt.",
        automation_note: automationNote,
      },
    };
  }

  if (toolName === "agent_templates") {
    const payload = tool.payload ?? {};
    const limitRaw = payload.limit;
    const limit =
      typeof limitRaw === "number" && Number.isFinite(limitRaw)
        ? Math.min(Math.max(Math.floor(limitRaw), 1), 200)
        : 100;
    const orgId =
      typeof payload.organization_id === "string"
        ? payload.organization_id.trim()
        : organizationId ?? "";
    const search =
      typeof payload.search === "string" ? payload.search.trim() : "";
    const includePrompts =
      payload.include_prompts === true || payload.includePrompts === true;
    const fields = includePrompts
      ? "id, name, description, system_prompt, allowed_tools, organization_id, parent_id, created_at, is_operative"
      : "id, name, description, allowed_tools, organization_id, parent_id, created_at, is_operative";

    let query = supabase
      .from("agent_templates")
      .select(fields)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (orgId) {
      query = query.eq("organization_id", orgId);
    }
    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      return { error: error.message };
    }
    return { data };
  }

  if (toolName === "tool_registry") {
    return { data: { tools: TOOL_REGISTRY } };
  }

  if (toolName === "get_system_capabilities") {
    const payload = tool.payload ?? {};
    const orgId =
      typeof payload.organization_id === "string"
        ? payload.organization_id.trim()
        : organizationId ?? "";
    const onlyOperative =
      payload.only_operative === true || payload.onlyOperative === true;
    const includePrompts =
      payload.include_prompts === true || payload.includePrompts === true;
    const fields = includePrompts
      ? "id, name, description, system_prompt, allowed_tools, organization_id, parent_id, created_at, is_operative"
      : "id, name, description, allowed_tools, organization_id, parent_id, created_at, is_operative";

    if (!orgId) {
      return { error: "get_system_capabilities requires organization_id" };
    }

    let query = supabase
      .from("agent_templates")
      .select(fields)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true });

    if (onlyOperative) {
      query = query.eq("is_operative", true);
    }

    const { data, error } = await query;

    if (error) {
      return { error: error.message };
    }

    const activeTools = new Set<string>();
    (data ?? []).forEach((agent: { allowed_tools?: string[] | null }) => {
      if (Array.isArray(agent.allowed_tools)) {
        agent.allowed_tools.forEach((tool) => activeTools.add(tool));
      }
    });

    return {
      data: {
        agents: data ?? [],
        tools: TOOL_REGISTRY,
        active_tools: Array.from(activeTools).sort(),
      },
    };
  }

  if (toolName === "analyze_synergies") {
    const payload = tool.payload ?? {};
    const skillsRaw =
      payload.skills ??
      payload.worker_skills ??
      payload.team_skills ??
      payload.expertise;
    const trendsRaw =
      payload.market_trends ?? payload.trends ?? payload.market ?? payload.signals;

    const skills = Array.isArray(skillsRaw)
      ? skillsRaw.filter((entry) => typeof entry === "string")
      : typeof skillsRaw === "string"
        ? skillsRaw
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [];
    const trends = Array.isArray(trendsRaw)
      ? trendsRaw.filter((entry) => typeof entry === "string")
      : typeof trendsRaw === "string"
        ? trendsRaw
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [];

    if (skills.length === 0 || trends.length === 0) {
      return {
        error:
          "analyze_synergies requires skills and market_trends to cross-reference",
      };
    }

    const suggestions: Array<{
      skill: string;
      trend: string;
      rationale: string;
    }> = [];

    for (const trend of trends) {
      for (const skill of skills) {
        if (suggestions.length >= 12) break;
        suggestions.push({
          skill,
          trend,
          rationale: `Nutze ${skill} um ${trend} schneller zu testen.`,
        });
      }
      if (suggestions.length >= 12) break;
    }

    return {
      data: {
        skills,
        trends,
        suggestions,
      },
    };
  }

  if (toolName === "sync_context") {
    const payload = tool.payload ?? {};
    const contextUpdate =
      typeof payload.context_update === "string"
        ? payload.context_update.trim()
        : typeof payload.update === "string"
          ? payload.update.trim()
          : typeof payload.message === "string"
            ? payload.message.trim()
            : "";
    const orgId =
      typeof payload.organization_id === "string"
        ? payload.organization_id.trim()
        : organizationId ?? "";
    const targetAgentsRaw =
      payload.target_agents ?? payload.targets ?? payload.agent_ids;
    const targetAgents = Array.isArray(targetAgentsRaw)
      ? targetAgentsRaw.filter((entry) => typeof entry === "string")
      : typeof targetAgentsRaw === "string"
        ? targetAgentsRaw
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [];
    const targetOrgIdsRaw =
      payload.target_organization_ids ??
      payload.target_org_ids ??
      payload.target_organizations ??
      payload.target_orgs;
    const targetOrgNamesRaw =
      payload.target_organization_names ??
      payload.target_org_names ??
      payload.target_org_labels ??
      payload.target_org_titles;
    const crossOrg = payload.cross_org === true || payload.crossOrg === true;
    const includeSource =
      payload.include_source !== false && payload.includeSource !== false;
    const targetOrgIds = Array.isArray(targetOrgIdsRaw)
      ? targetOrgIdsRaw.filter((entry) => typeof entry === "string")
      : typeof targetOrgIdsRaw === "string"
        ? targetOrgIdsRaw
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [];
    const targetOrgNames = Array.isArray(targetOrgNamesRaw)
      ? targetOrgNamesRaw.filter((entry) => typeof entry === "string")
      : typeof targetOrgNamesRaw === "string"
        ? targetOrgNamesRaw
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [];

    if (!orgId) {
      return { error: "sync_context requires organization_id" };
    }
    if (!contextUpdate) {
      return { error: "sync_context requires context_update" };
    }

    const resolvedTargets: Array<{ id: string | null; name: string }> = [];
    for (const entry of targetAgents) {
      const resolved = await resolveAgentIdByName({
        supabase,
        organizationId: orgId,
        name: entry,
      });
      resolvedTargets.push({ id: resolved ?? null, name: entry });
    }

    const resolvedOrgIds = new Set<string>(targetOrgIds);
    if (targetOrgNames.length > 0) {
      const { data: orgRows, error: orgError } = await supabase
        .from("organizations")
        .select("id, name")
        .in("name", targetOrgNames);
      if (orgError) {
        return { error: orgError.message };
      }
      (orgRows ?? []).forEach((row: { id: string }) =>
        resolvedOrgIds.add(row.id),
      );
    }

    if ((crossOrg || resolvedOrgIds.size > 0) && resolvedOrgIds.size === 0) {
      return {
        error: "sync_context cross_org requires target_organization_ids or names",
      };
    }

    const targetOrgList = Array.from(resolvedOrgIds);
    const destinationOrgIds = includeSource
      ? Array.from(new Set([orgId, ...targetOrgList]))
      : targetOrgList;

    const insertPayload = destinationOrgIds.map((targetOrgId) => ({
      payload: {
        type: "strategy_sync",
        context_update: contextUpdate,
        target_agents: resolvedTargets,
        target_agent_names: targetAgents,
        source_organization_id: orgId,
        target_organization_id: targetOrgId,
      },
      organization_id: targetOrgId,
    }));

    const { data, error } = await supabase
      .from("universal_history")
      .insert(insertPayload)
      .select("id, organization_id");

    if (error) {
      return { error: error.message };
    }

    return {
      data: {
        sync_ids: (data ?? []).map((row: { id: string }) => row.id),
        target_organization_ids: destinationOrgIds,
        message: "Context wurde synchronisiert.",
      },
    };
  }

  if (toolName === "universal_history") {
    const payload = tool.payload ?? {};
    const limitRaw = payload.limit;
    const limit =
      typeof limitRaw === "number" && Number.isFinite(limitRaw)
        ? Math.min(Math.max(Math.floor(limitRaw), 1), 25)
        : 10;
    const type =
      typeof payload.type === "string" ? payload.type.trim() : "";
    const sessionFilter =
      typeof payload.session_id === "string" ? payload.session_id.trim() : "";
    const orgId =
      typeof payload.organization_id === "string"
        ? payload.organization_id.trim()
        : organizationId ?? "";

    if (!orgId) {
      return { error: "universal_history requires organization_id" };
    }

    let query = supabase
      .from("universal_history")
      .select("id, payload, created_at, organization_id")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (type) {
      query = query.eq("payload->>type", type);
    }
    if (sessionFilter) {
      query = query.eq("payload->>session_id", sessionFilter);
    }

    const { data, error } = await query;
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
          message: "Agent-Delegation abgeschlossen.",
        },
      };
    } catch (error) {
      console.error("Agent API: agent_call exception", error);
      return { error: "agent_call exception" };
    }
  }

  if (toolName === "generate_agent_definition") {
    const name =
      typeof tool.payload.name === "string" ? tool.payload.name.trim() : "";
    const systemPrompt =
      typeof tool.payload.system_prompt === "string"
        ? tool.payload.system_prompt.trim()
        : "";
    const description =
      typeof tool.payload.description === "string"
        ? tool.payload.description.trim()
        : "";
    const orgIdFromPayload =
      typeof tool.payload.organization_id === "string"
        ? tool.payload.organization_id.trim()
        : "";
    const orgNameFromPayload =
      typeof tool.payload.organization_name === "string"
        ? tool.payload.organization_name.trim()
        : "";
    const parentId =
      typeof tool.payload.parent_id === "string"
        ? tool.payload.parent_id.trim()
        : null;
    const isOperative =
      typeof tool.payload.is_operative === "boolean"
        ? tool.payload.is_operative
        : typeof tool.payload.isOperative === "boolean"
          ? tool.payload.isOperative
          : undefined;
  const rawTools = tool.payload.allowed_tools ?? tool.payload.allowedTools;
  const allowedTools = Array.isArray(rawTools)
    ? rawTools.filter((entry) => typeof entry === "string")
    : typeof rawTools === "string"
      ? rawTools
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];

    if (!name || !systemPrompt) {
      return { error: "generate_agent_definition requires name and system_prompt" };
    }

    let orgId = orgIdFromPayload || organizationId || "";
    if (!orgId && orgNameFromPayload) {
      const resolved = await resolveOrganizationRecord({
        supabase,
        name: orgNameFromPayload,
      });
      orgId = resolved ?? "";
    }

    if (!orgId) {
      return { error: "Organization required to create agent definition" };
    }

    const createdId = await ensureAgentTemplate({
      supabase,
      organizationId: orgId,
      parentId,
      name,
      description,
      systemPrompt,
      allowedTools,
      isOperative,
    });

    if (!createdId) {
      return { error: "Failed to create agent definition" };
    }

    await supabase.from("universal_history").insert({
      payload: {
        type: "agent_definition_created",
        agent_name: name,
        agent_id: createdId,
        organization_id: orgId,
      },
      organization_id: orgId,
    });

    return {
      data: {
        agent_id: createdId,
        message: `Agentenprofil "${name}" wurde angelegt.`,
      },
    };
  }

  if (toolName === "process_enterprise_list") {
    const { companyName, employees } = parseEnterpriseList(tool.payload);
    const categoryRaw =
      typeof tool.payload.organization_category === "string"
        ? tool.payload.organization_category
        : typeof tool.payload.category === "string"
          ? tool.payload.category
          : typeof tool.payload.organization_type === "string"
            ? tool.payload.organization_type
            : typeof tool.payload.org_type === "string"
              ? tool.payload.org_type
              : "";
    const organizationCategory = categoryRaw
      ? normalizeOrganizationCategory(categoryRaw)
      : null;
    if (!companyName || employees.length === 0) {
      return { error: "process_enterprise_list requires company_name and employees" };
    }
    if (!organizationCategory) {
      return {
        error:
          "process_enterprise_list requires organization_category (School, Startup, Enterprise)",
      };
    }

    const orgId = await resolveOrganizationRecord({
      supabase,
      name: companyName,
    });
    if (!orgId) {
      return { error: "Failed to create organization" };
    }

    const ceoName = `${companyName} CEO`;
    const ceoPrompt =
      "You are the company CEO. Keep the essence clear and delegate only when the value is explicit.";
    const ceoId = await ensureAgentTemplate({
      supabase,
      organizationId: orgId,
      parentId: null,
      name: ceoName,
      description: "Executive lead for the organization.",
      systemPrompt: ceoPrompt,
      allowedTools: [],
      isOperative: true,
    });

    const blueprint = AGENT_BLUEPRINTS[organizationCategory];
    const blueprintAgents: Array<{ name: string; role: string; id: string | null }> =
      [];
    for (const role of blueprint.roles) {
      const agentName = `${companyName} ${role}`;
      const agentPrompt = `You are the ${role} for ${companyName}. Deliver concise, actionable output aligned with a ${blueprint.label} organization.`;
      const agentId = await ensureAgentTemplate({
        supabase,
        organizationId: orgId,
        parentId: ceoId ?? null,
        name: agentName,
        description: `${role} blueprint agent for ${blueprint.label}.`,
        systemPrompt: agentPrompt,
        allowedTools: [],
        isOperative: true,
      });
      blueprintAgents.push({ name: agentName, role, id: agentId });
    }

    const createdAgents: Array<{ name: string; role: string; id: string | null }> =
      [];
    for (const entry of employees) {
      const role = entry.role || "Specialist";
      const agentName = `${companyName} ${role}`;
      const agentPrompt = `You are the ${role} for ${companyName}. Focus on concise, value-driven outputs.`;
      const agentId = await ensureAgentTemplate({
        supabase,
        organizationId: orgId,
        parentId: ceoId ?? null,
        name: agentName,
        description: `Specialist for ${role}.`,
        systemPrompt: agentPrompt,
        allowedTools: [],
        isOperative: true,
      });
      createdAgents.push({ name: agentName, role, id: agentId });
    }

    const payload = {
      type: "enterprise_onboarding",
      company_name: companyName,
      organization_category: organizationCategory,
      blueprint_roles: blueprint.roles,
      employees,
      created_agents: createdAgents,
      created_blueprint_agents: blueprintAgents,
    };

    await supabase
      .from("universal_history")
      .insert({ payload, organization_id: orgId });

    return {
      data: {
        organization_id: orgId,
        message:
          "Agent-Delegation gestartet: Für jeden Mitarbeiter wird ein spezialisierter KI-Helfer erstellt.",
        created_agents: createdAgents,
        created_blueprint_agents: blueprintAgents,
        organization_category: organizationCategory,
      },
    };
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
      organizationId,
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
      organizationId,
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
