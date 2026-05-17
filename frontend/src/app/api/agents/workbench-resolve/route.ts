import { NextRequest, NextResponse } from "next/server";
import {
  SUPERVITY_API_URL,
  WORKFLOW_IDS,
  supervityHeaders,
  buildFormData,
  type AgentName,
} from "@/lib/supervity";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, agent, brandName, hubspotUrl } = body;

    const agentName = (agent as string | undefined)?.toUpperCase() as AgentName | undefined;

    if (!agentName || !WORKFLOW_IDS[agentName]) {
      return NextResponse.json({ error: `Unknown agent '${agent}'` }, { status: 400 });
    }

    const workflowId = WORKFLOW_IDS[agentName];
    
    // Construct inputs for the autonomous workflow
    let inputs: Record<string, string | number | undefined | null> = {
      brand_name: brandName || "GrowthPilot Default",
      trigger_source: "workbench",
      trigger_reason: `Human-in-the-Loop Decision: ${action}`,
      campaign_state_url: hubspotUrl || "https://app.hubspot.com/contacts",
      human_approved: action === "APPROVE" ? "true" : "false",
      decision_action: action
    };

    // Brutally enforce required parameters based on the specific agent being resolved
    switch (agentName) {
      case "VANGUARD":
        inputs.competitor_name = "Competitor";
        inputs.sentry_severity = "medium";
        inputs.conquest_budget_requested_inr = action === "APPROVE" ? 50000 : 0;
        break;
      case "HELIOS":
        inputs.slack_channel = "#growthpilot-ops";
        break;
      case "ORACLE":
        inputs.search_query = `${inputs.brand_name} brand sentiment`;
        inputs.search_type = "web";
        inputs.max_results = 10;
        inputs.caller_agent = "Workbench";
        break;
      case "HERALD":
      case "LEDGER":
        inputs.slack_channel_ops = "#growthpilot-ops";
        inputs.slack_channel_errors = "#growthpilot-errors";
        break;
    }

    const formData = buildFormData(workflowId, inputs);

    console.log(`[Workbench] Forwarding to Supervity - Action: ${action} | Agent: ${agentName} | Brand: ${brandName}`);

    // Call Supervity API asynchronously
    const supervityRes = await fetch(SUPERVITY_API_URL, {
      method: "POST",
      headers: supervityHeaders(),
      body: formData,
    });

    if (!supervityRes.ok) {
      const errorText = await supervityRes.text();
      console.error("[Workbench] Supervity Error:", errorText);
      return NextResponse.json({ error: `Supervity returned ${supervityRes.status}` }, { status: 502 });
    }

    // CRITICAL: Drain the SSE body completely to prevent TCP socket leak, 
    // but do it ASYNCHRONOUSLY so we don't block the frontend UI while the agent runs.
    if (supervityRes.body) {
      const drainStream = async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const reader = supervityRes.body!.getReader();
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        } catch (err) {
          console.error("[Workbench] Background stream drain error:", err);
        }
      };
      // Fire and forget
      drainStream();
    }

    return NextResponse.json({ success: true, message: `Action ${action} synced with Supervity for ${agent}` });
  } catch (error: unknown) {
    console.error("Error in workbench-resolve:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}


