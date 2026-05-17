/**
 * supervity.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central configuration and type definitions for the Supervity AI workflow API.
 * ALL server-side calls must go through this module — the bearer token is
 * intentionally not prefixed with NEXT_PUBLIC_ so it is NEVER exposed to the
 * browser bundle.
 *
 * API endpoint: https://auto-workflow-api.supervity.ai/api/v1/workflow-runs/execute/stream
 * Transport:    multipart/form-data  →  SSE stream response
 * Auth:         Authorization: Bearer <token>  +  x-source: v1
 */

// ─── Base ─────────────────────────────────────────────────────────────────────
export const SUPERVITY_API_URL =
  process.env.SUPERVITY_API_URL ||
  "https://auto-workflow-api.supervity.ai/api/v1/workflow-runs/execute/stream";

export const SUPERVITY_BEARER_TOKEN =
  process.env.SUPERVITY_BEARER_TOKEN || "";

// ─── Workflow IDs (one per agent node) ────────────────────────────────────────
export const WORKFLOW_IDS = {
  /** Full NEXUS OS orchestration — triggers all nodes in sequence */
  ATLAS:    process.env.SUPERVITY_WORKFLOW_ATLAS    || "019e1ea6-819f-7000-98ef-fbeeb581f54a",
  /** Quill-1 (Content Gen) + Quill-2 (Publisher) share the same workflow */
  QUILL:    process.env.SUPERVITY_WORKFLOW_QUILL    || "019e324a-a7ec-7000-9085-52e08630dbfe",
  /** Oracle – Web Search Agent */
  ORACLE:   process.env.SUPERVITY_WORKFLOW_ORACLE   || "019e2faf-64ac-7000-9dc7-1da580f0482d",
  /** Vanguard – Offensive Conquest Agent */
  VANGUARD: process.env.SUPERVITY_WORKFLOW_VANGUARD || "019e2c17-4b27-7000-97a5-835d1fb19716",
  /** GrowthPilot Herald – Morning Briefing */
  HERALD:   process.env.SUPERVITY_WORKFLOW_HERALD   || "019e1ede-0545-7000-b66a-ded437146b1b",
  /** Ledger – CAC Attribution Operator */
  LEDGER:   process.env.SUPERVITY_WORKFLOW_LEDGER   || "019e1ebd-38d5-7000-9223-828915556edb",
  /** Helios – Paid Media Auditor */
  HELIOS:   process.env.SUPERVITY_WORKFLOW_HELIOS   || "019e1eb6-5e05-7000-a235-56f5c9bd5a80",
  /** Sentry – Brand Crisis Monitor */
  SENTRY:   process.env.SUPERVITY_WORKFLOW_SENTRY   || "019e1eb0-6554-7000-a018-8203d9a61f95",
  /** Lens – AI Share of Voice Monitor */
  LENS:     process.env.SUPERVITY_WORKFLOW_LENS     || "019e1eac-76ba-7000-a969-35ff30e57f89",
} as const;

export type AgentName = keyof typeof WORKFLOW_IDS;

// ─── Required headers for every Supervity API call ────────────────────────────
export function supervityHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${SUPERVITY_BEARER_TOKEN}`,
    "x-source": "v1",
    // No Content-Type — fetch sets it automatically for FormData (includes boundary)
  };
}

// ─── Build multipart/form-data for each agent ─────────────────────────────────
/**
 * Shared fields present on every workflow trigger.
 */
export interface BaseInputs {
  brand_name: string;
  trigger_source: string;
  trigger_reason: string;
  campaign_state_url?: string;
  human_approved?: string;
  decision_action?: string;
}

/**
 * ATLAS – Full orchestrator. Accepts all campaign state metrics.
 */
export interface AtlasInputs extends BaseInputs {
  share_of_voice_drop_pp?: number;
  crisis_probability?: number;
  wasted_spend_inr?: number;
  current_cac_inr?: number;
  target_cac_inr?: number;
  proposed_spend_change_inr?: number;
  quill_approval_wait_hours?: number;
}

/**
 * ORACLE – Web Search Agent.
 */
export interface OracleInputs {
  search_query: string;
  search_type: string;
  brand_name: string;
  max_results: number;
  caller_agent: string;
}

/**
 * VANGUARD – Offensive Conquest Agent.
 */
export interface VanguardInputs extends BaseInputs {
  competitor_name: string;
  sentry_severity: string;
  competitor_sov_drop_pp?: number;
  competitor_sentiment_drop_pct?: number;
  our_brand_sov_drop_pp?: number;
  our_brand_crisis_probability?: number;
  conquest_budget_requested_inr?: number;
}

/**
 * HERALD / LEDGER – include Slack channel routing.
 */
export interface HeraldInputs extends BaseInputs {
  slack_channel_ops: string;
  slack_channel_errors: string;
}

/**
 * HELIOS – Paid Media Auditor.
 */
export interface HeliosInputs extends BaseInputs {
  slack_channel: string;
}

// ─── FormData builders ────────────────────────────────────────────────────────
/**
 * Converts a flat record of input values into the multipart/form-data shape
 * expected by Supervity: workflowId + inputs[key]=value
 */
export function buildFormData(
  workflowId: string,
  inputs: Record<string, string | number | undefined | null>
): FormData {
  const fd = new FormData();
  fd.append("workflowId", workflowId);
  for (const [key, value] of Object.entries(inputs)) {
    if (value !== undefined && value !== null && value !== "") {
      fd.append(`inputs[${key}]`, String(value));
    }
  }
  return fd;
}

// ─── SSE event types (best-effort parse of Supervity stream) ─────────────────
export interface SupervitySSEEvent {
  type?: string;
  agent?: string;
  node_name?: string;
  status?: string;
  message?: string;
  output?: string;
  run_id?: string;
  error?: string;
  completed?: boolean;
  // Catch-all for extra fields
  [key: string]: unknown;
}

/**
 * Parse a single SSE "data: ..." line into a structured event.
 * Returns null if the line is not parseable JSON.
 */
export function parseSSELine(line: string): SupervitySSEEvent | null {
  const cleaned = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
  if (!cleaned || cleaned === "[DONE]") return null;
  try {
    return JSON.parse(cleaned) as SupervitySSEEvent;
  } catch {
    // Plain-text SSE line — wrap in a generic event
    return { type: "text", message: cleaned };
  }
}
