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
    const inputs = {
      brand_name: brandName || "GrowthPilot Default",
      trigger_source: "workbench",
      trigger_reason: `Human-in-the-Loop Decision: ${action}`,
      campaign_state_url: hubspotUrl || "https://app.hubspot.com/contacts",
      human_approved: action === "APPROVE" ? "true" : "false",
      decision_action: action
    };

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

    // Since Supervity returns an SSE stream, we can just return success 
    // immediately to unblock the UI.
    return NextResponse.json({ success: true, message: `Action ${action} synced with Supervity for ${agent}` });
  } catch (error: any) {
    console.error("Error in workbench-resolve:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
