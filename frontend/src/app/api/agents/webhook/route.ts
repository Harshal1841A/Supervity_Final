/**
 * POST /api/agents/webhook
 * ─────────────────────────────────────────────────────────────────────────────
 * Human-in-the-Loop decision endpoint — called by AIWorkbench when a user
 * clicks APPROVE or REJECT on a queued task.
 *
 * Each task in the AIWorkbench maps to a specific Supervity agent workflow.
 * Approving a task fires the corresponding agent with an "approved" trigger
 * context so it can resume or execute its planned action.
 *
 * Task ID → Agent mapping:
 *   vanguard-*  → VANGUARD workflow
 *   helios-*    → HELIOS workflow
 *   quill2-*    → QUILL workflow
 *   system_audit→ ATLAS workflow (system-wide audit mode)
 *
 * For REJECT decisions, we send the same agent a "rejected" trigger so the
 * agent can log the decision and clean up any pending state.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  SUPERVITY_API_URL,
  WORKFLOW_IDS,
  supervityHeaders,
  buildFormData,
} from "@/lib/supervity";

// Map task IDs (prefix) → workflow agent key
const TASK_AGENT_MAP: Record<string, keyof typeof WORKFLOW_IDS> = {
  "vanguard":    "VANGUARD",
  "helios":      "HELIOS",
  "quill2":      "QUILL",
  "quill":       "QUILL",
  "sentry":      "SENTRY",
  "ledger":      "LEDGER",
  "herald":      "HERALD",
  "oracle":      "ORACLE",
  "lens":        "LENS",
  "system_audit":"ATLAS",
  "atlas":       "ATLAS",
};

function resolveAgent(taskId: string): keyof typeof WORKFLOW_IDS | null {
  const lower = taskId.toLowerCase();
  for (const prefix of Object.keys(TASK_AGENT_MAP)) {
    if (lower.startsWith(prefix)) return TASK_AGENT_MAP[prefix];
  }
  return null;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { taskId, decision, brand_name, comments } = body as {
    taskId?: string;
    decision?: string;
    brand_name?: string;
    comments?: string;
  };

  if (!taskId || !decision) {
    return NextResponse.json(
      { error: "Required fields: taskId, decision" },
      { status: 400 }
    );
  }

  const agent = resolveAgent(taskId);
  if (!agent) {
    return NextResponse.json(
      { error: `Could not resolve agent for taskId '${taskId}'` },
      { status: 400 }
    );
  }

  const workflowId = WORKFLOW_IDS[agent];
  const brand      = (brand_name as string) || "GrowthPilot Default";
  const actionLabel = decision === "approve" ? "APPROVED" : "REJECTED";
  const reason      = comments || `${actionLabel} via GrowthPilot OS AI Workbench at ${new Date().toISOString()}`;

  // Build agent-specific inputs with the decision context
  let inputs: Record<string, string | number | undefined | null>;

  switch (agent) {
    case "VANGUARD":
      inputs = {
        brand_name:                    brand,
        competitor_name:               "Competitor",
        trigger_source:                "human_approval",
        trigger_reason:                reason,
        sentry_severity:               "medium",
        campaign_state_url:            "https://app.hubspot.com/contacts",
        conquest_budget_requested_inr: decision === "approve" ? 50000 : 0,
      };
      break;

    case "HELIOS":
      inputs = {
        slack_channel:      "#growthpilot-ops",
        brand_name:         brand,
        trigger_source:     "human_approval",
        trigger_reason:     reason,
        campaign_state_url: "https://app.hubspot.com/contacts",
      };
      break;

    case "QUILL":
      inputs = {
        brand_name:         brand,
        trigger_source:     "human_approval",
        trigger_reason:     reason,
        campaign_state_url: "https://app.hubspot.com/contacts",
      };
      break;

    case "ATLAS":
      // System audit — trigger full orchestration
      inputs = {
        brand_name:     brand,
        trigger_source: "human_approval",
        trigger_reason: reason,
        campaign_state_url: "https://app.hubspot.com/contacts",
      };
      break;

    default:
      inputs = {
        brand_name:     brand,
        trigger_source: "human_approval",
        trigger_reason: reason,
      };
  }

  const formData = buildFormData(workflowId, inputs);

  try {
    const supervityRes = await fetch(SUPERVITY_API_URL, {
      method:  "POST",
      headers: supervityHeaders(),
      body:    formData,
    });

    if (!supervityRes.ok) {
      const errorText = await supervityRes.text();
      return NextResponse.json(
        { error: `Supervity error ${supervityRes.status}`, detail: errorText, confirmed: false },
        { status: supervityRes.status }
      );
    }

    // Drain the stream (we don't need to forward it for webhook actions)
    // Read until done to prevent connection hangs
    if (supervityRes.body) {
      const reader = supervityRes.body.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    return NextResponse.json({
      success:   true,
      confirmed: true,
      agent,
      decision,
      taskId,
      message: `${actionLabel} — ${agent} workflow triggered. Execution resuming.`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Supervity unreachable: ${err instanceof Error ? err.message : "network error"}`, confirmed: false },
      { status: 502 }
    );
  }
}
