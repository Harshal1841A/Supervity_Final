/**
 * POST /api/ai-manager/chat
 * ─────────────────────────────────────────────────────────────────────────────
 * Proxies a chat query to the Supervity "NEXUS OS AI Manager" workflow.
 * WorkflowId: 019e3330-a58d-7000-ba93-0f20008ae658
 * Inputs: user_query, session_context
 */

import { NextRequest } from "next/server";
import { SUPERVITY_API_URL, supervityHeaders, buildFormData } from "@/lib/supervity";

const AI_MANAGER_WORKFLOW_ID = "019e3330-a58d-7000-ba93-0f20008ae658";

export async function POST(req: NextRequest) {
  let body: { query: string; sessionContext?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  if (!body.query?.trim()) {
    return new Response(JSON.stringify({ error: "query is required" }), { status: 400 });
  }

  const formData = buildFormData(AI_MANAGER_WORKFLOW_ID, {
    user_query:      body.query,
    session_context: body.sessionContext ?? "",
  });

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
      { status: 502 }
    );
  }

  if (!supervityRes.ok) {
    const txt = await supervityRes.text();
    return new Response(JSON.stringify({ error: `Supervity ${supervityRes.status}`, detail: txt }), {
      status: supervityRes.status,
    });
  }

  // Stream SSE directly to the browser
  return new Response(supervityRes.body, {
    status: 200,
    headers: {
      "Content-Type":      "text/event-stream; charset=utf-8",
      "Cache-Control":     "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
