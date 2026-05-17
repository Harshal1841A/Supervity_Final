import { NextRequest, NextResponse } from "next/server";
import {
  SUPERVITY_API_URL,
  WORKFLOW_IDS,
  supervityHeaders,
  buildFormData,
  type AgentName,
} from "@/lib/supervity";
import { prisma } from "@/lib/db";

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
          const runId = supervityRes.headers.get("X-GrowthPilot-Run-Id") || `workbench_${Date.now()}`;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const reader = supervityRes.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith(":")) continue;

              const dataLine = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
              if (!dataLine || dataLine === "[DONE]") continue;

              let evt: Record<string, unknown> = {};
              try { evt = JSON.parse(dataLine); } catch { evt = { message: dataLine }; }

              const evtAgentName = (evt.node_name ?? evt.agent ?? evt.operator ?? evt.source ?? agentName) as string;
              const eventType = (evt.event ?? evt.type ?? evt.status ?? "nominal") as string;
              const statusRaw = eventType.toLowerCase();

              let msgText: string;
              if (evt.output && typeof evt.output === "string" && evt.output.trim()) {
                msgText = evt.output.trim();
              } else if (evt.message && typeof evt.message === "string" && evt.message.trim()) {
                msgText = evt.message.trim();
              } else if (evt.content && typeof evt.content === "string" && evt.content.trim()) {
                msgText = evt.content.trim();
              } else if (evt.text && typeof evt.text === "string" && evt.text.trim()) {
                msgText = evt.text.trim();
              } else if (evt.result && typeof evt.result === "string" && evt.result.trim()) {
                msgText = evt.result.trim();
              } else if (evt.summary && typeof evt.summary === "string" && evt.summary.trim()) {
                msgText = evt.summary.trim();
              } else {
                const eventLabel: Record<string, string> = {
                  "thinking": "Agent is analysing the situation…",
                  "workflow-run": "Workflow execution started.",
                  "ping": "Heartbeat — connection healthy.",
                  "start": "Agent task started.",
                  "end": "Agent task completed.",
                  "tool-call": "Calling external tool…",
                  "tool-result": "Tool returned a result.",
                  "pending_human": "Awaiting human approval.",
                  "completed": "Agent sequence completed successfully.",
                };
                msgText = eventLabel[statusRaw] ?? `Event received: ${statusRaw}`;
              }

              // Persist log to database
              await prisma.logEntry.create({
                data: {
                  agent: String(evtAgentName),
                  status: String(statusRaw).toLowerCase(),
                  action_taken: String(msgText),
                  key_metrics: evt.key_metrics ? JSON.stringify(evt.key_metrics) : null,
                  timestamp: new Date(),
                  run_id: runId,
                }
              }).catch(() => { });
            }
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


