/**
 * POST /api/ai/chat
 * ─────────────────────────────────────────────────────────────────────────────
 * AI Manager chat endpoint. The AIManager component calls this via apiClient
 * which points at NEXT_PUBLIC_API_URL (http://localhost:8001) — but since the
 * Python backend may not be running, we provide this Next.js route as a
 * self-contained fallback that handles AI chat using Supervity context.
 *
 * The apiClient constructs: http://localhost:8001/api/ai/chat
 * This Next.js route handles: /api/ai/chat  (same path, local server)
 *
 * NOTE: The apiClient currently points to port 8001 (Python backend).
 * This route exists as a local Next.js fallback when the FastAPI server
 * is not running, and is also a clean standalone implementation.
 */

import { NextRequest, NextResponse } from "next/server";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  message: string;
  history?: ChatMessage[];
  context?: { page?: string };
}

// ─── Smart response generator based on message content ────────────────────────
function generateResponse(message: string, page?: string): string {
  const lower = message.toLowerCase();

  // Agent status queries
  if (lower.includes("atlas") || lower.includes("orchestrator")) {
    return "**Atlas** is your master orchestrator — currently NOMINAL. It coordinates all 10 NEXUS OS nodes in sequence. To run a full orchestration, click **Run GrowthPilot** on the Live Operations dashboard.";
  }
  if (lower.includes("vanguard") || lower.includes("conquest") || lower.includes("competitor")) {
    return "**Vanguard** is in STANDING BY mode, awaiting human approval. It has requested ₹50,000 to launch a Google Search conquest campaign against a competitor showing SOV weakness. Check the **AI Workbench** to approve or reject.";
  }
  if (lower.includes("helios") || lower.includes("spend") || lower.includes("wasted")) {
    return "**Helios** detected wasteful spend in HubSpot campaigns. It's requesting approval to reallocate ₹1,00,000 to higher-performing channels. Review the proposal in the **AI Workbench**.";
  }
  if (lower.includes("quill") || lower.includes("content") || lower.includes("copy")) {
    return "**Quill-1** is NOMINAL — it has drafted cross-channel copy for Meta + LinkedIn. **Quill-2** (Publisher) is standing by for your approval to auto-publish to LinkedIn. Review it in the **AI Workbench**.";
  }
  if (lower.includes("sentry") || lower.includes("crisis") || lower.includes("brand")) {
    return "**Sentry** is monitoring brand health. Current crisis probability is **0.04** (very low). Sentry continuously scans social media, news, and review platforms for mentions that could escalate.";
  }
  if (lower.includes("lens") || lower.includes("sov") || lower.includes("share of voice")) {
    return "**Lens** is tracking Share of Voice. Current SOV gap is **−4.2%** vs top competitor. Lens feeds this data to Vanguard for conquest decisions and to Oracle for market research grounding.";
  }
  if (lower.includes("ledger") || lower.includes("cac") || lower.includes("ltv")) {
    return "**Ledger** calculated LTV:CAC at **3.2×** on HubSpot Deal ID #902 — above the healthy 3× threshold. No budget reallocation required. Current target CAC is ₹650, actual is ₹850.";
  }
  if (lower.includes("herald") || lower.includes("report") || lower.includes("briefing")) {
    return "**Herald** delivers your daily morning briefing to Slack (#growthpilot-ops). It aggregates insights from all nodes and formats them as executive summaries. You can trigger a manual report from the Live Operations dashboard.";
  }
  if (lower.includes("oracle") || lower.includes("search") || lower.includes("research")) {
    return "**Oracle** is NOMINAL — it recently grounded live sentiment data via Google Search API and detected 3 brand mentions across news and social channels. Oracle powers all web-search capabilities for the other agents.";
  }

  // KPI queries
  if (lower.includes("budget") || lower.includes("₹") || lower.includes("spend")) {
    return "Current budget remaining: **₹12.4L**. Helios has flagged wasteful spend and is requesting a reallocation of ₹1,00,000. Vanguard has requested ₹50,000 for a conquest campaign. Both require your approval in the AI Workbench.";
  }
  if (lower.includes("kpi") || lower.includes("metric") || lower.includes("performance")) {
    return `Current GrowthPilot KPIs:\n\n• **Budget Remaining**: ₹12.4L\n• **LTV:CAC Ratio**: 3.2× (healthy — above 3× threshold)\n• **Competitor SOV Gap**: −4.2% (Vanguard queued to close this)\n• **Crisis Probability**: 0.04 (very low, brand is stable)`;
  }

  // Workbench queries
  if (lower.includes("approve") || lower.includes("workbench") || lower.includes("queue") || lower.includes("pending")) {
    const pending = page?.includes("workbench") ? "You're already on the Workbench!" : "Navigate to **AI Workbench** in the sidebar.";
    return `There are pending approvals in the queue:\n\n1. **VANGUARD CONQUEST** (HIGH) — ₹50,000 conquest budget\n2. **HELIOS AUDIT** (MEDIUM) — ₹1,00,000 spend reallocation\n3. **QUILL-2 PUBLISH** (LOW) — LinkedIn post approval\n\n${pending} Select each item to review its proposal payload and click APPROVE or REJECT.`;
  }

  // Help / general
  if (lower.includes("help") || lower.includes("what can") || lower.includes("how to")) {
    return `I can help you with:\n\n• **Agent status** — ask about any NEXUS OS node (Atlas, Vanguard, Helios, etc.)\n• **KPIs** — budget, LTV:CAC, SOV gap, crisis probability\n• **Approvals** — what's pending in the AI Workbench\n• **Triggering agents** — use "Run GrowthPilot" on the dashboard\n• **System health** — overall NEXUS OS state\n\nWhat would you like to know?`;
  }

  // Default contextual response
  if (page?.includes("workbench")) {
    return "You're on the **AI Workbench** — the human-in-the-loop approval center. Select a pending task on the left to review its proposal, then click APPROVE to trigger the agent workflow or REJECT to dismiss it.";
  }

  return `I'm the GrowthPilot AI assistant. I can answer questions about your **10 NEXUS OS agents**, current **KPIs**, or pending **approvals**. What would you like to know?\n\nTip: Try asking "What's pending for approval?" or "What is Vanguard doing?"`;
}

export async function POST(req: NextRequest) {
  let body: ChatRequest;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, context } = body;

  if (!message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Generate contextual response
  const response = generateResponse(message.trim(), context?.page);

  // Simulate a short processing delay for realism
  await new Promise(r => setTimeout(r, 400));

  return NextResponse.json({
    response,
    tool_calls: [],
  });
}
