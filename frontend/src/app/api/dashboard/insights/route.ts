/**
 * GET  /api/dashboard/insights  — fetch computed insights from real logs
 * POST /api/dashboard/insights  — trigger re-analysis from real log data
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export interface Insight {
  id: string;
  type: "anomaly" | "pattern" | "recommendation";
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  data: Record<string, string | number>;
  suggested_action: string;
  action_type: "investigate" | "create_policy" | "review_duplicate" | "review_transaction";
  confidence: number;
  created_at: string;
}

export interface Pattern {
  name: string;
  frequency: string;
  confidence: number;
  sample_size: number;
  description: string;
}

export interface Action {
  id: string;
  title: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  estimated_impact: string;
  action_type: "investigate" | "create_policy" | "review_transaction";
  action_config: Record<string, string>;
}

export interface InsightsData {
  insights: Insight[];
  patterns: Pattern[];
  actions: Action[];
  lastAnalyzed: string | null;
}

// Derive insights from real log data
function deriveInsights(logs: { agent: string; status: string; timestamp: Date | string }[]): InsightsData {
  if (logs.length === 0) {
    return { insights: [], patterns: [], actions: [], lastAnalyzed: null };
  }

  const now = new Date().toISOString();
  const insights: Insight[] = [];
  const patterns: Pattern[] = [];
  const actions: Action[] = [];

  // Count agents that ran
  const agentCounts: Record<string, number> = {};
  const agentErrors: Record<string, number> = {};
  const pendingHuman: { agent: string; status: string; timestamp: Date | string }[] = [];

  for (const log of logs) {
    const agent = log.agent || "Unknown";
    agentCounts[agent] = (agentCounts[agent] || 0) + 1;
    if (log.status === "exception" || log.status === "error") {
      agentErrors[agent] = (agentErrors[agent] || 0) + 1;
    }
    if (log.status === "pending_human") {
      pendingHuman.push(log);
    }
  }

  const totalRuns = logs.length;
  const errorCount = Object.values(agentErrors).reduce((s, v) => s + v, 0);
  const successRate = totalRuns > 0 ? ((totalRuns - errorCount) / totalRuns) : 0;
  const uniqueAgents = Object.keys(agentCounts);

  // Pattern: System throughput
  if (totalRuns >= 3) {
    patterns.push({
      name: "System Throughput",
      frequency: "current run",
      confidence: successRate,
      sample_size: totalRuns,
      description: `${totalRuns} agent executions recorded. ${Math.round(successRate * 100)}% success rate across ${uniqueAgents.length} active nodes.`,
    });
  }

  // Insight: Error detected
  if (errorCount > 0) {
    insights.push({
      id: `insight-errors-${Date.now()}`,
      type: "anomaly",
      severity: "warning",
      title: `${errorCount} Agent Exception${errorCount > 1 ? "s" : ""} Detected`,
      description: `${Object.entries(agentErrors).map(([a, c]) => `${a} (${c})`).join(", ")} reported exceptions during execution.`,
      data: { error_count: errorCount, total_runs: totalRuns },
      suggested_action: "Review agent logs and check Supervity workflow configuration",
      action_type: "investigate",
      confidence: 0.99,
      created_at: now,
    });
    actions.push({
      id: `act-error-${Date.now()}`,
      title: `Investigate ${errorCount} agent error${errorCount > 1 ? "s" : ""} in execution log`,
      description: `Review the integration status for ${Object.keys(agentErrors).join(", ")}.`,
      priority: "high",
      estimated_impact: "Restore full agent reliability",
      action_type: "investigate",
      action_config: { agents: Object.keys(agentErrors).join(", ") },
    });
  }

  // Insight: Pending human approvals
  if (pendingHuman.length > 0) {
    insights.push({
      id: `insight-pending-${Date.now()}`,
      type: "recommendation",
      severity: "warning",
      title: `${pendingHuman.length} Decision${pendingHuman.length > 1 ? "s" : ""} Awaiting Human Approval`,
      description: `Agents have routed ${pendingHuman.length} action${pendingHuman.length > 1 ? "s" : ""} to the AI Workbench for human review.`,
      data: { pending_count: pendingHuman.length },
      suggested_action: "Review and approve/reject pending tasks in AI Workbench",
      action_type: "investigate",
      confidence: 1.0,
      created_at: now,
    });
    actions.push({
      id: `act-pending-${Date.now()}`,
      title: `${pendingHuman.length} pending workbench approval${pendingHuman.length > 1 ? "s" : ""} require attention`,
      description: "Approve or reject tasks to unblock agent orchestration.",
      priority: "critical",
      estimated_impact: "Unblock agent execution pipeline",
      action_type: "investigate",
      action_config: { pending: String(pendingHuman.length) },
    });
  }

  // Insight: Successful run summary
  if (totalRuns > 0 && errorCount === 0) {
    insights.push({
      id: `insight-success-${Date.now()}`,
      type: "pattern",
      severity: "info",
      title: "All Agents Executed Successfully",
      description: `${totalRuns} agent actions completed with 100% success rate. Nodes active: ${uniqueAgents.join(", ")}.`,
      data: { total_runs: totalRuns, agents: uniqueAgents.length },
      suggested_action: "Review execution logs for optimization opportunities",
      action_type: "investigate",
      confidence: 1.0,
      created_at: now,
    });
  }

  return { insights, patterns, actions, lastAnalyzed: now };
}

export async function GET() {
  const logs = await prisma.logEntry.findMany({
    orderBy: { timestamp: "asc" },
    select: { agent: true, status: true, timestamp: true },
  });
  const fresh = deriveInsights(logs);
  return NextResponse.json(fresh);
}

export async function POST() {
  // Force re-analysis from live database logs
  const logs = await prisma.logEntry.findMany({
    orderBy: { timestamp: "asc" },
    select: { agent: true, status: true, timestamp: true },
  });
  const fresh = deriveInsights(logs);
  return NextResponse.json(fresh);
}
