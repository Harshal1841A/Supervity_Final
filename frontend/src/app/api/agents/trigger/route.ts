/**
 * POST /api/agents/trigger
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side proxy that:
 *  1. Receives a JSON body with { agent, brand_name, ...inputs } from the frontend
 *  2. Resolves the correct Supervity workflowId for that agent
 *  3. Builds multipart/form-data
 *  4. Calls Supervity's streaming execute endpoint
 *  5. Pipes the raw SSE stream back to the browser
 *
 * The bearer token is only accessed server-side and never reaches the browser.
 */

import { NextRequest } from "next/server";
import {
  SUPERVITY_API_URL,
  WORKFLOW_IDS,
  supervityHeaders,
  buildFormData,
  type AgentName,
} from "@/lib/supervity";

// Default campaign state URL for convenience
const DEFAULT_CAMPAIGN_URL = "https://app.hubspot.com/contacts";

// Slack defaults (can be overridden via inputs)
const SLACK_OPS    = "#growthpilot-ops";
const SLACK_ERRORS = "#growthpilot-errors";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const agent = (body.agent as string | undefined)?.toUpperCase() as AgentName | undefined;

  if (!agent || !WORKFLOW_IDS[agent]) {
    return new Response(
      JSON.stringify({
        error: `Unknown agent '${body.agent}'. Valid agents: ${Object.keys(WORKFLOW_IDS).join(", ")}`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const workflowId = WORKFLOW_IDS[agent];
  const brand      = (body.brand_name as string) || "GrowthPilot Default";
  const source     = (body.trigger_source as string) || "manual";
  const reason     = (body.trigger_reason as string) || "Manual run from Command Center";
  const campaignUrl = (body.campaign_state_url as string) || DEFAULT_CAMPAIGN_URL;

  // ── Build inputs based on agent ──────────────────────────────────────────────
  let inputs: Record<string, string | number | undefined | null>;

  switch (agent) {
    case "ATLAS":
      inputs = {
        brand_name:                brand,
        trigger_source:            source,
        trigger_reason:            reason,
        campaign_state_url:        campaignUrl,
        share_of_voice_drop_pp:    body.share_of_voice_drop_pp as number | undefined,
        crisis_probability:        body.crisis_probability as number | undefined,
        wasted_spend_inr:          body.wasted_spend_inr as number | undefined,
        current_cac_inr:           body.current_cac_inr as number | undefined,
        target_cac_inr:            body.target_cac_inr as number | undefined,
        proposed_spend_change_inr: body.proposed_spend_change_inr as number | undefined,
        quill_approval_wait_hours: body.quill_approval_wait_hours as number | undefined,
      };
      break;

    case "ORACLE":
      inputs = {
        search_query:  (body.search_query as string) || `${brand} brand sentiment`,
        search_type:   (body.search_type as string)  || "web",
        brand_name:    brand,
        max_results:   (body.max_results as number)  || 10,
        caller_agent:  (body.caller_agent as string) || "Atlas",
      };
      break;

    case "VANGUARD":
      inputs = {
        brand_name:                       brand,
        competitor_name:                  (body.competitor_name as string) || "Competitor",
        trigger_source:                   source,
        trigger_reason:                   reason,
        sentry_severity:                  (body.sentry_severity as string) || "medium",
        competitor_sov_drop_pp:           body.competitor_sov_drop_pp as number | undefined,
        competitor_sentiment_drop_pct:    body.competitor_sentiment_drop_pct as number | undefined,
        our_brand_sov_drop_pp:            body.our_brand_sov_drop_pp as number | undefined,
        our_brand_crisis_probability:     body.our_brand_crisis_probability as number | undefined,
        conquest_budget_requested_inr:    body.conquest_budget_requested_inr as number | undefined,
        campaign_state_url:               campaignUrl,
      };
      break;

    case "HERALD":
      inputs = {
        brand_name:          brand,
        trigger_source:      source,
        trigger_reason:      reason,
        campaign_state_url:  campaignUrl,
        slack_channel_ops:   (body.slack_channel_ops as string)   || SLACK_OPS,
        slack_channel_errors:(body.slack_channel_errors as string) || SLACK_ERRORS,
      };
      break;

    case "LEDGER":
      inputs = {
        brand_name:          brand,
        trigger_source:      source,
        trigger_reason:      reason,
        campaign_state_url:  campaignUrl,
        slack_channel_ops:   (body.slack_channel_ops as string)   || SLACK_OPS,
        slack_channel_errors:(body.slack_channel_errors as string) || SLACK_ERRORS,
      };
      break;

    case "HELIOS":
      inputs = {
        slack_channel:      (body.slack_channel as string) || SLACK_OPS,
        brand_name:         brand,
        trigger_source:     source,
        trigger_reason:     reason,
        campaign_state_url: campaignUrl,
      };
      break;

    case "SENTRY":
      inputs = {
        brand_name:         brand,
        trigger_source:     source,
        trigger_reason:     reason,
        campaign_state_url: campaignUrl,
      };
      break;

    case "LENS":
      inputs = {
        brand_name:     brand,
        trigger_source: source,
        trigger_reason: reason,
      };
      break;

    case "QUILL":
    default:
      inputs = {
        brand_name:         brand,
        trigger_source:     source,
        trigger_reason:     reason,
        campaign_state_url: campaignUrl,
      };
      break;
  }

  // ── Build FormData and call Supervity ────────────────────────────────────────
  const formData = buildFormData(workflowId, inputs);

  let supervityRes: Response;
  try {
    supervityRes = await fetch(SUPERVITY_API_URL, {
      method:  "POST",
      headers: supervityHeaders(),
      body:    formData,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Supervity unreachable: ${err instanceof Error ? err.message : "network error"}` }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!supervityRes.ok) {
    const errorText = await supervityRes.text();
    return new Response(
      JSON.stringify({ error: `Supervity error ${supervityRes.status}`, detail: errorText }),
      { status: supervityRes.status, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Pipe the SSE stream directly to the client ───────────────────────────────
  // Inject run_id and agent headers for the client to track.
  const runId = `run_${agent}_${Date.now()}`;

  return new Response(supervityRes.body, {
    status: 200,
    headers: {
      "Content-Type":                "text/event-stream; charset=utf-8",
      "Cache-Control":               "no-cache, no-transform",
      "X-Accel-Buffering":           "no",
      "X-GrowthPilot-Agent":         agent,
      "X-GrowthPilot-Run-Id":        runId,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
