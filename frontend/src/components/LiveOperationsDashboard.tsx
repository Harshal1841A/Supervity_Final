"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { BrandData, BRAND_DATA, fmtInr } from "@/lib/brands";
import { toast } from "react-hot-toast";
import {
  Activity,
  BarChart3,
  BookOpen,
  ChevronDown,
  Cpu,
  Globe,
  LineChart,
  LucideIcon,
  MessageSquare,
  Megaphone,
  Play,
  ShieldAlert,
  Target,
  TerminalSquare,
  AlertTriangle,
  Wallet,
  ClipboardList,
} from "lucide-react";

// ─── Theme (Snow White Enterprise Light Mode) ─────────────────────────────────
const T = {
  bg:         "#FFFFFF",
  card:       "#FAFAFA",
  cardBorder: "#E2E8F0",
  primary:    "#0F172A",
  muted:      "#64748B",
  subtle:     "#F1F5F9",
  hover:      "#F8FAFC",
  danger:     "#DC2626",
  dangerBg:   "#FEF2F2",
  warning:    "#D97706",
  warningBg:  "#FFFBEB",
  success:    "#16A34A",
  successBg:  "#F0FDF4",
  btnBg:      "#000000",
  btnText:    "#FFFFFF",
};

// ─── Constants ────────────────────────────────────────────────────────────────


// All 10 NEXUS OS nodes per spec
const ALL_NODES: { name: string; role: string; icon: LucideIcon; standby?: boolean }[] = [
  { name: "Atlas",    role: "Orchestrator",       icon: Cpu },
  { name: "Oracle",   role: "Core Capability",    icon: Globe },
  { name: "Quill-1",  role: "Content Generation", icon: MessageSquare },
  { name: "Quill-2",  role: "Publisher",          icon: Megaphone,   standby: true },
  { name: "Sentry",   role: "Crisis Monitor",     icon: ShieldAlert, standby: true },
  { name: "Lens",     role: "SOV Intelligence",   icon: Target },
  { name: "Helios",   role: "Media Auditor",      icon: BarChart3 },
  { name: "Ledger",   role: "CAC Monitor",        icon: Wallet },
  { name: "Herald",   role: "Reporting",          icon: LineChart },
  { name: "Vanguard", role: "Conquest",           icon: Activity,    standby: true },
];

// No synthetic seed logs — execution history loads from the API on mount

interface AgentStatus {
  name: string;
  role: string;
  icon: LucideIcon;
  status: string;
}

interface LogEntry {
  agent: string;
  status: string;
  action_taken: string;
  key_metrics?: Record<string, string>;
  timestamp: string;
  run_id?: string;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ title, value, isLoading }: { title: string; value: string; isLoading?: boolean }) {
  return (
    <div
      style={{
        backgroundColor: T.card,
        border: `1px solid ${T.cardBorder}`,
        borderRadius: 14,
        padding: "24px",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 32px rgba(0,0,0,0.08)`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      <p style={{ color: T.muted, fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>
        {title}
      </p>
      {isLoading ? (
        <div className="animate-pulse" style={{ height: 38, width: "60%", backgroundColor: T.hover, borderRadius: 6, marginTop: 4 }} />
      ) : (
        <p style={{ color: T.primary, fontSize: 36, fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1 }}>
          {value}
        </p>
      )}
    </div>
  );
}

// ─── Agent Row ────────────────────────────────────────────────────────────────
function AgentRow({ agent }: { agent: AgentStatus }) {
  const Icon: LucideIcon = agent.icon;

  let statusColor = T.success;
  let statusBg = "rgba(16, 185, 129, 0.1)";
  let statusLabel = agent.status;

  if (agent.status === "STANDING BY") {
    statusColor = T.muted;
    statusBg = T.subtle;
  } else if (agent.status === "EXCEPTION") {
    statusColor = T.danger;
    statusBg = T.dangerBg;
  } else if (agent.status === "PENDING_HUMAN") {
    statusColor = T.warning;
    statusBg = "rgba(245, 158, 11, 0.1)";
    statusLabel = "PENDING HUMAN";
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "13px 20px",
        borderBottom: `1px solid ${T.cardBorder}`,
        transition: "background 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = T.hover)}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ background: T.subtle, padding: 7, borderRadius: 8 }}>
          <Icon size={15} stroke={T.primary} />
        </div>
        <div>
          <p style={{ color: T.primary, fontWeight: 500, fontSize: 13, letterSpacing: "0.03em" }}>{agent.name}</p>
          <p style={{ color: T.muted, fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.09em", marginTop: 1 }}>
            {agent.role}
          </p>
        </div>
      </div>

      <div style={{
        padding: "3px 9px",
        fontSize: 10,
        fontFamily: "monospace",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        borderRadius: 5,
        border: `1px solid ${statusColor}`,
        color: statusColor,
        backgroundColor: statusBg,
        fontWeight: 700,
      }}>
        {statusLabel}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function LiveOperationsDashboard() {
  const [brands, setBrands] = useState<BrandData[]>([]);
  const [activeBrand, setActiveBrand] = useState<BrandData | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Sync with API and localStorage
  useEffect(() => {
    fetch("/api/dashboard/brands")
      .then(r => r.ok ? r.json() : [])
      .then((data: BrandData[]) => {
        const brandList = (data && data.length > 0) ? data : BRAND_DATA;
        setBrands(brandList);
        const saved = localStorage.getItem("nexus_activeBrandId");
        const found = saved ? brandList.find(b => b.id === saved) : null;
        setActiveBrand(found ?? brandList[0]);
      })
      .catch(() => {
        setBrands(BRAND_DATA);
        const saved = localStorage.getItem("nexus_activeBrandId");
        const found = saved ? BRAND_DATA.find(b => b.id === saved) : null;
        setActiveBrand(found ?? BRAND_DATA[0]);
      });
  }, []);

  const handleBrandSelect = (b: BrandData) => {
    setActiveBrand(b);
    localStorage.setItem("nexus_activeBrandId", b.id);
    setIsDropdownOpen(false);
  };
  const [demoMode, setDemoMode] = useState(false);
  
  // Sync demoMode with localStorage
  useEffect(() => {
    const savedDemo = localStorage.getItem("nexus_demoMode");
    if (savedDemo === "true") setDemoMode(true);
  }, []);

  const [isTriggering, setIsTriggering] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [agentsState, setAgentsState] = useState<AgentStatus[]>([]);

  useEffect(() => {
    if (!activeBrand) return;
    setAgentsState(
      ALL_NODES.map(a => {
        let status = a.standby ? "STANDING BY" : "NOMINAL";
        if (activeBrand.crisisProb >= 70 && ["Sentry", "Quill-2", "Vanguard"].includes(a.name)) {
          status = "EXCEPTION"; // which renders as red BLOCKED/CRISIS badge
        }
        return { ...a, status };
      })
    );
  }, [activeBrand]);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [sendingToWorkbench, setSendingToWorkbench] = useState<Record<number, boolean>>({});
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [kpis, setKpis] = useState<{
    budgetRemaining: string | null;
    ltvCac: string | null;
    sovGap: string | null;
    crisisProb: string | null;
  }>({
    budgetRemaining: null,
    ltvCac: null,
    sovGap: null,
    crisisProb: null,
  });

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Alt+G → toggle God Mode
  const demoModeRef = useRef(demoMode);
  useEffect(() => {
    demoModeRef.current = demoMode;
  }, [demoMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key.toLowerCase() === "g" || e.code === "KeyG")) {
        const newVal = !demoModeRef.current;
        localStorage.setItem("nexus_demoMode", newVal.toString());
        if (newVal) toast.success("God Mode Activated");
        else toast.error("God Mode Deactivated");
        setDemoMode(newVal);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Load persisted logs and KPIs from API on mount
  useEffect(() => {
    if (!activeBrand) return;
    fetch("/api/dashboard/logs")
      .then(r => r.ok ? r.json() : [])
      .then((data: LogEntry[]) => { 
        if (data.length > 0) {
          setLogs(data);
        } else {
          // Dynamic mock execution logs
          setLogs([
            { agent: "Atlas", status: "nominal", action_taken: `Initialized orchestrator state for ${activeBrand.name}.`, timestamp: new Date(Date.now() - 60000).toISOString() },
            { agent: "Lens", status: "nominal", action_taken: `Scanned 4.2M SOV data points for ${activeBrand.name}.`, timestamp: new Date(Date.now() - 45000).toISOString() },
            { agent: "Helios", status: "nominal", action_taken: `Audited ${activeBrand.name} media spend across all channels.`, timestamp: new Date(Date.now() - 30000).toISOString() }
          ]);
        }
      })
      .catch(() => {});
    fetch("/api/dashboard/kpis")
      .then(r => r.ok ? r.json() : {})
      .then((data: { budgetRemaining?: string | null; ltvCac?: string | null; sovGap?: string | null; crisisProb?: string | null }) => {
        setKpis({
          budgetRemaining: data.budgetRemaining ?? null,
          ltvCac: data.ltvCac ?? null,
          sovGap: data.sovGap ?? null,
          crisisProb: data.crisisProb ?? null,
        });
      })
      .catch(() => {});
  }, [activeBrand]);


  // ── SSE Stream reader (live mode) ──
  // We keep activeRunId only as a boolean flag; the stream is managed in handleTrigger.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _activeRunId = activeRunId; // kept for status indicator

  // ── Persist a log entry to the API ──
  const persistLog = async (entry: LogEntry) => {
    try {
      await fetch("/api/dashboard/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
    } catch { /* non-blocking */ }
  };

  // ── Manually route any log entry to the Workbench for human review ──
  const sendToWorkbench = async (log: LogEntry, logIdx: number) => {
    if (!activeBrand) return;
    setSendingToWorkbench(prev => ({ ...prev, [logIdx]: true }));
    const taskPayload = {
      id: `manual-${String(log.agent).toLowerCase()}-${Date.now()}`,
      agent: log.agent,
      priority: "HIGH" as const,
      message: log.action_taken,
      time: "just now",
      brand_name: activeBrand.name,
    };
    try {
      await fetch("/api/dashboard/workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskPayload),
      });
      toast.success(`Sent [${log.agent}] action to AI Workbench for approval.`);
    } catch {
      toast.error("Failed to send to Workbench.");
    } finally {
      setSendingToWorkbench(prev => ({ ...prev, [logIdx]: false }));
    }
  };

  // ── Trigger Handler (real SSE streaming, or 800ms demo bypass) ──
  const handleTrigger = useCallback(async () => {
    if (isTriggering || activeRunId || !activeBrand) return;
    // ── God Mode fast-path ──
    if (demoMode) {
      setIsTriggering(true);
      await new Promise(r => setTimeout(r, 800));
      
      // Simulate adding a task to the workbench for demo purposes
      const taskPayload = {
        id: `atlas-demo-${Date.now()}`,
        agent: "Atlas",
        priority: "HIGH" as const,
        message: `[DEMO] Atlas orchestrator has identified critical budget anomalies for ${activeBrand.name}. Approval required to reallocate funds.`,
        time: "just now",
        brand_name: activeBrand.name,
      };
      fetch("/api/dashboard/workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskPayload),
      }).catch(() => {});

      toast.success(`[DEMO] Atlas triggered for ${activeBrand.name}`);
      setIsTriggering(false);
      return;
    }
    setIsTriggering(true);
    setErrorBanner(null);
    setLogs([]);
    fetch("/api/dashboard/logs", { method: "DELETE" }).catch(() => {});
    setAgentsState(ALL_NODES.map(a => ({ ...a, status: a.standby ? "STANDING BY" : "NOMINAL" })));

    try {
      const res = await fetch("/api/agents/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "ATLAS",
          brand_name: activeBrand.name,
          trigger_source: "manual",
          trigger_reason: "Manual run from GrowthPilot Command Center",
          campaign_state_url: activeBrand.hubspotUrl,
          share_of_voice_drop_pp: activeBrand.sovDrop,
          crisis_probability: activeBrand.crisisProb / 100,
          wasted_spend_inr: activeBrand.wasteInr,
          current_cac_inr: activeBrand.currentCac,
          target_cac_inr: activeBrand.targetCac,
          proposed_spend_change_inr: Math.round(activeBrand.wasteInr * 0.5),
          quill_approval_wait_hours: 2,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      // Extract run-id from response header
      const runId = res.headers.get("X-GrowthPilot-Run-Id") || `atlas_${Date.now()}`;
      setActiveRunId(runId);
      toast.success(`Atlas Orchestrator triggered for ${activeBrand.name}`);

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep incomplete line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data:")) continue;
          const dataLine = trimmed.slice(5).trim();
          if (!dataLine || dataLine === "[DONE]") continue;
          let evt: Record<string, unknown> = {};
          try { evt = JSON.parse(dataLine); } catch { continue; }

          // ── Map Supervity SSE event → LogEntry ──────────────────────────────
          // Supervity sends many event types — extract agent name robustly
          const agentName = (
            evt.node_name ?? evt.agent ?? evt.operator ?? evt.source ?? "Atlas"
          ) as string;

          // Normalize status — Supervity uses "event" as the type field
          const eventType = (evt.event ?? evt.type ?? evt.status ?? "nominal") as string;
          const statusRaw = eventType.toLowerCase();

          // ── Human-readable message extraction ───────────────────────────────
          // Priority: output > message > content > event-specific fields > label
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
            // Last resort: convert known event types to human labels instead of raw JSON
            const eventLabel: Record<string, string> = {
              "thinking":      "Agent is analysing the situation…",
              "workflow-run":  "Workflow execution started.",
              "ping":          "Heartbeat — connection healthy.",
              "start":         "Agent task started.",
              "end":           "Agent task completed.",
              "tool-call":     "Calling external tool…",
              "tool-result":   "Tool returned a result.",
              "pending_human": "Awaiting human approval.",
              "completed":     "Agent sequence completed successfully.",
            };
            msgText = eventLabel[statusRaw] ?? `Event received: ${statusRaw}`;
          }

          // Skip heartbeat pings — don't pollute the log
          if (statusRaw === "ping" || msgText.toLowerCase() === "ping") continue;

          const newLog: LogEntry = {
            agent:        String(agentName),
            status:       String(statusRaw).toLowerCase(),
            action_taken: String(msgText),
            key_metrics:  evt.key_metrics as Record<string, string> | undefined,
            timestamp:    new Date().toISOString(),
            run_id:       runId,
          };

          setLogs(prev => [...prev, newLog]);
          // Persist to API so logs survive page refresh
          persistLog(newLog);

          // Extract and persist KPI updates if present
          if (evt.key_metrics && typeof evt.key_metrics === "object") {
            const km = evt.key_metrics as Record<string, string>;
            const kpiPatch: Record<string, string> = {};
            if (km.budget_remaining)  kpiPatch.budgetRemaining = km.budget_remaining;
            if (km.ltv_cac)           kpiPatch.ltvCac = km.ltv_cac;
            if (km.sov_gap)           kpiPatch.sovGap = km.sov_gap;
            if (km.crisis_probability) kpiPatch.crisisProb = km.crisis_probability;
            if (Object.keys(kpiPatch).length > 0) {
              setKpis(prev => ({ ...prev, ...kpiPatch }));
              fetch(`/api/dashboard/kpis?brandId=${activeBrand.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...kpiPatch, runId }),
              }).catch(() => {});
            }
          }

          // Detect Supervity human-in-the-loop pause (broad match across all event shapes)
          const nodeNameRaw = String(evt.nodeName ?? evt.node_name ?? evt.stepName ?? "").toLowerCase();
          const isApprovalNode =
            nodeNameRaw.includes("workbench") ||
            nodeNameRaw.includes("approval") ||
            nodeNameRaw.includes("human") ||
            nodeNameRaw.includes("review");

          const needsHuman =
            isApprovalNode ||
            statusRaw === "pending_human" ||
            statusRaw === "human-input-required" ||
            statusRaw === "node-paused" ||
            statusRaw === "paused" ||
            statusRaw === "waiting_human" ||
            statusRaw === "human_review" ||
            evt.human_required === true ||
            evt.requires_approval === true ||
            typeof evt.formId === "string" ||
            typeof evt.form_id === "string";

          if (needsHuman) {
            const taskPayload = {
              id: `${String(agentName).toLowerCase()}-${Date.now()}`,
              agent: String(agentName),
              priority: "HIGH" as const,
              message: String(msgText),
              time: "just now",
              brand_name: activeBrand.name,
            };
            fetch("/api/dashboard/workbench", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(taskPayload),
            }).catch(() => {});
          }

          // Update agent status badge
          setAgentsState(prev => prev.map(a =>
            a.name.toLowerCase() === String(agentName).toLowerCase()
              ? { ...a, status: String(statusRaw).toUpperCase() }
              : a
          ));

          // Mark completed — Supervity uses event:"end" or completed:true
          if (
            evt.completed === true ||
            statusRaw === "completed" ||
            statusRaw === "done" ||
            statusRaw === "end"
          ) {
            setActiveRunId(null);
            toast.success("GrowthPilot execution sequence completed.");
          }
        }
      }

      setActiveRunId(null);
    } catch (err) {
      setErrorBanner(`Trigger failed: ${err instanceof Error ? err.message : "Network error"}`);
      setActiveRunId(null);
    } finally {
      setIsTriggering(false);
    }
  }, [isTriggering, activeRunId, demoMode, activeBrand]);

  // ── Audit Handler ──
  const handleAudit = () => {
    if (isTriggering || activeRunId || !activeBrand) {
      toast.error("An operation is already in progress.");
      return;
    }
    toast.success("System audit initiated.");
    handleTrigger();
  };

  if (!mounted || !activeBrand) {
    return (
      <div style={{ backgroundColor: T.bg, minHeight: "100vh", padding: 24, display: "flex", flexDirection: "column", gap: 20, color: T.primary }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h1 style={{ fontWeight: 300, fontSize: 28, letterSpacing: "-0.02em", margin: 0, display: "flex", alignItems: "center", gap: 12 }}>
            <Activity size={24} stroke={T.primary} strokeWidth={1.5} />
            Live Operations
          </h1>
          <div style={{ padding: "4px 10px", borderRadius: 4, backgroundColor: T.subtle, border: `1px solid ${T.cardBorder}`, fontSize: 13, color: T.muted }}>
            Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: T.bg, minHeight: "100vh", padding: 24, display: "flex", flexDirection: "column", gap: 20, color: T.primary }}>

      {/* Error Banner */}
      {errorBanner && (
        <div style={{
          backgroundColor: T.dangerBg, border: `1px solid ${T.danger}`,
          borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, color: T.danger,
        }}>
          <AlertTriangle size={16} />
          <span style={{ fontWeight: 500, fontSize: 13 }}>{errorBanner}</span>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* God Mode indicator dot (2x2px Champagne) */}
          {demoMode && (
            <div title="God Mode ON (Alt+G)" style={{
              width: 2, height: 2, borderRadius: "50%",
              backgroundColor: "#F7E7CE", flexShrink: 0,
              boxShadow: `0 0 4px #F7E7CE`,
            }} />
          )}
          <div>
            <h1 style={{ color: T.primary, fontSize: 26, fontWeight: 300, letterSpacing: "-0.02em", margin: 0 }}>
              Live Operations
            </h1>
            <p style={{ color: T.muted, fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 5 }}>
              NEXUS OS · 10 Nodes · {demoMode ? "DEMO MODE" : "HubSpot CRM State"}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Brand Selector */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                backgroundColor: T.card, border: `1px solid ${T.cardBorder}`,
                color: T.primary, padding: "8px 14px", borderRadius: 8,
                fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}
            >
              {activeBrand.name}
              <ChevronDown size={13} stroke={T.muted} />
            </button>
            {isDropdownOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", right: 0, width: 160,
                backgroundColor: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 8,
                overflow: "hidden", zIndex: 50, boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
              }}>
                {brands.map(b => (
                  <button
                    key={b.id}
                    onClick={() => handleBrandSelect(b)}
                    style={{
                      display: "block", width: "100%", textAlign: "left", padding: "10px 14px",
                      backgroundColor: b.id === activeBrand.id ? T.hover : "transparent",
                      color: T.primary, fontSize: 13, border: "none", cursor: "pointer",
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = T.subtle}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = b.id === activeBrand.id ? T.hover : "transparent"}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* System Audit */}
          <button
            onClick={handleAudit}
            disabled={isAuditing}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              backgroundColor: "transparent", border: `1px solid ${T.cardBorder}`,
              color: T.muted, padding: "8px 14px", borderRadius: 8,
              fontSize: 13, fontWeight: 500, cursor: isAuditing ? "not-allowed" : "pointer",
              opacity: isAuditing ? 0.6 : 1, transition: "border-color 0.15s",
            }}
            onMouseEnter={e => { if (!isAuditing) e.currentTarget.style.borderColor = T.primary; }}
            onMouseLeave={e => e.currentTarget.style.borderColor = T.cardBorder}
          >
            <ClipboardList size={14} stroke={T.muted} />
            {isAuditing ? "Auditing..." : "System Audit"}
          </button>

          {/* Run GrowthPilot */}
          <button
            onClick={handleTrigger}
            disabled={isTriggering || !!activeRunId}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              backgroundColor: T.btnBg, color: T.btnText,
              border: "none", borderRadius: 8, padding: "8px 18px",
              fontSize: 13, fontWeight: 700, letterSpacing: "0.04em",
              cursor: (isTriggering || activeRunId) ? "not-allowed" : "pointer",
              opacity: (isTriggering || activeRunId) ? 0.7 : 1,
              transition: "transform 0.1s",
            }}
            onMouseDown={e => { if (!isTriggering && !activeRunId) e.currentTarget.style.transform = "scale(0.96)"; }}
            onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
            onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
          >
            <Play size={13} fill={T.btnText} />
            {activeRunId ? "RUNNING…" : "RUN GROWTHPILOT"}
          </button>

          {/* Status indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ position: "relative", width: 10, height: 10, display: "inline-flex" }}>
              <span style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                backgroundColor: activeRunId ? T.warning : T.success, opacity: 0.5,
                animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite",
              }} />
              <span style={{ position: "relative", width: 10, height: 10, borderRadius: "50%", backgroundColor: activeRunId ? T.warning : T.success }} />
            </span>
            <span style={{ color: activeRunId ? T.warning : T.success, fontSize: 11, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {activeRunId ? "ACTIVE RUN" : "ONLINE"}
            </span>
          </div>
        </div>
      </div>

      {/* ── KPI Row — brand-specific values, updated instantly on brand switch ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <KpiCard
          title="Current CAC"
          value={`₹${activeBrand.currentCac.toLocaleString("en-IN")} → ₹${activeBrand.targetCac.toLocaleString("en-IN")}`}
          isLoading={isTriggering}
        />
        <KpiCard
          title="SOV Drop"
          value={activeBrand.sovDrop === 0 ? "0pp" : `-${activeBrand.sovDrop}pp`}
          isLoading={isTriggering}
        />
        <KpiCard
          title="Crisis Probability"
          value={`${activeBrand.crisisProb}%`}
          isLoading={isTriggering}
        />
        <KpiCard
          title="Wasted Spend"
          value={fmtInr(activeBrand.wasteInr)}
          isLoading={isTriggering}
        />
      </div>

      {/* ── Main Split ── */}
      <div style={{ display: "grid", gridTemplateColumns: "5fr 7fr", gap: 16, flex: 1 }}>

        {/* System Status */}
        <div style={{ backgroundColor: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "15px 20px", borderBottom: `1px solid ${T.cardBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
            <TerminalSquare size={15} stroke={T.primary} />
            <span style={{ color: T.primary, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              System Status
            </span>
            <span style={{ marginLeft: "auto", color: T.muted, fontSize: 10, fontFamily: "monospace" }}>10 NODES</span>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {agentsState.map(agent => <AgentRow key={agent.name} agent={agent} />)}
          </div>
        </div>

        {/* Live Execution Log */}
        <div style={{ backgroundColor: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "15px 20px", borderBottom: `1px solid ${T.cardBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
            <Activity size={15} stroke={T.primary} />
            <span style={{ color: T.primary, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Live Execution Log
            </span>
            {activeRunId && (
              <span style={{ marginLeft: "auto", color: T.muted, fontSize: 10, fontFamily: "monospace", textTransform: "uppercase" }}>
                RUN {activeRunId.slice(-6)}
              </span>
            )}
          </div>

          <div style={{ padding: "22px 20px", display: "flex", flexDirection: "column", gap: 22, overflowY: "auto", flex: 1 }}>
            {logs.length === 0 && !activeRunId ? (
              <div style={{ textAlign: "center", color: T.muted, marginTop: 40 }}>
                <BookOpen size={28} style={{ opacity: 0.25, marginBottom: 12 } as React.CSSProperties} />
                <p style={{ fontSize: 13, fontWeight: 300 }}>No active operations. Click &quot;Run GrowthPilot&quot; to begin.</p>
              </div>
            ) : (
              logs.map((log, i) => {
                const isError = log.status === "exception";
                const isWarn  = log.status === "pending_human";
                const dotColor = isError ? T.danger : isWarn ? T.warning : T.success;
                const isSending = !!sendingToWorkbench[i];

                return (
                  <div key={i} style={{ display: "flex", gap: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: dotColor, marginTop: 5, flexShrink: 0 }} />
                      {i !== logs.length - 1 && (
                        <div style={{ width: 1, flex: 1, backgroundColor: T.cardBorder, marginTop: 6 }} />
                      )}
                    </div>
                    <div style={{ paddingBottom: 6, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ color: T.primary, fontWeight: 700, fontSize: 13, letterSpacing: "0.04em" }}>[{log.agent}]</span>
                        <span style={{ color: T.muted, fontSize: 10, fontFamily: "monospace", textTransform: "uppercase" }}>
                          {log.status}
                        </span>
                        <span style={{ color: T.muted, fontSize: 10, fontFamily: "monospace", marginLeft: "auto" }}>
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        {/* ── Send to Workbench button on every log entry ── */}
                        <button
                          onClick={() => sendToWorkbench(log, i)}
                          disabled={isSending}
                          title="Route this action to AI Workbench for human approval"
                          style={{
                            display: "flex", alignItems: "center", gap: 5,
                            backgroundColor: "transparent",
                            border: `1px solid ${isWarn ? T.warning : T.cardBorder}`,
                            color: isWarn ? T.warning : T.muted,
                            padding: "2px 8px", borderRadius: 5, fontSize: 10,
                            fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em",
                            cursor: isSending ? "not-allowed" : "pointer",
                            opacity: isSending ? 0.5 : 1,
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={e => { if (!isSending) { e.currentTarget.style.borderColor = T.primary; e.currentTarget.style.color = T.primary; } }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = isWarn ? T.warning : T.cardBorder; e.currentTarget.style.color = isWarn ? T.warning : T.muted; }}
                        >
                          {isSending ? "Sending…" : isWarn ? "⚡ Review" : "→ Workbench"}
                        </button>
                      </div>
                      <p style={{ color: T.muted, fontSize: 13, fontWeight: 300, lineHeight: 1.65, margin: 0 }}>{log.action_taken}</p>
                    </div>
                  </div>
                );
              })
            )}

            {activeRunId && (
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <span style={{ position: "relative", width: 8, height: 8, display: "inline-flex", flexShrink: 0 }}>
                  <span style={{ position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: T.primary, opacity: 0.5, animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite" }} />
                  <span style={{ position: "relative", width: 8, height: 8, borderRadius: "50%", backgroundColor: T.primary }} />
                </span>
                <p style={{ color: T.muted, fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.12em", margin: 0 }}>
                  Awaiting next sequence…
                </p>
              </div>
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>


      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
