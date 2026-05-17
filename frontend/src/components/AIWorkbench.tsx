"use client";

import React, { useEffect, useState, useRef } from "react";
import { toast } from "react-hot-toast";
import { BrandData, BRAND_DATA } from "@/lib/brands";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  DollarSign,
  FileText,
  LucideIcon,
  Shield,
  Target,
  X,
  Zap,
  Loader2,
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
  success:    "#16A34A",
  successBg:  "#F0FDF4",
  danger:     "#DC2626",
  dangerBg:   "#FEF2F2",
  warning:    "#D97706",
  warningBg:  "#FFFBEB",
  btnBg:      "#000000",
  btnText:    "#FFFFFF",
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface AgentTask {
  id: string;
  agentId: string;
  title: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  message: string;
  time: string;
  brand_name?: string;
  icon: LucideIcon;
  fromDb?: boolean; // true = came from /api/dashboard/workbench (SSE-pushed)
}

// ─── Agent icon resolver ──────────────────────────────────────────────────────
function getAgentIcon(agentId: string): LucideIcon {
  const n = agentId.toLowerCase();
  if (n.includes("vanguard")) return Target;
  if (n.includes("helios")) return DollarSign;
  if (n.includes("quill")) return FileText;
  if (n.includes("sentry")) return Shield;
  return Zap;
}

const PRIORITY_COLOR: Record<string, string> = {
  HIGH:   "#DC2626",
  MEDIUM: "#D97706",
  LOW:    "#64748B",
};

// ─── Brand-aware dynamic alerts — strict data-driven generation ───────────────
function buildBrandAlerts(brand: BrandData): AgentTask[] {
  const alerts: AgentTask[] = [];

  if (brand.wasteInr > 100000) {
    alerts.push({ 
      id: `helios-waste-${brand.id}`, 
      agentId: "helios", 
      title: "Helios Audit",
      priority: "HIGH",
      message: `Reallocate ₹${brand.wasteInr.toLocaleString("en-IN")} in wasted ad spend.`,
      time: "just now", 
      brand_name: brand.name,
      icon: getAgentIcon("helios")
    });
  }

  if (brand.sovDrop >= 5 && brand.crisisProb < 70) {
    alerts.push({ 
      id: `vanguard-sov-${brand.id}`, 
      agentId: "vanguard", 
      title: "Vanguard Conquest",
      priority: "HIGH",
      message: `${brand.sovDrop}pp SOV drop detected. Approve ₹50,000 for attack campaign.`,
      time: "just now", 
      brand_name: brand.name,
      icon: getAgentIcon("vanguard")
    });
  }

  if (brand.crisisProb >= 70) {
    alerts.push({ 
      id: `sentry-crisis-${brand.id}`, 
      agentId: "sentry", 
      title: "Sentry Override",
      priority: "HIGH",
      message: `System Paused. Crisis probability at ${brand.crisisProb}%. Human intervention required.`,
      time: "just now", 
      brand_name: brand.name,
      icon: getAgentIcon("sentry")
    });
  } else {
    alerts.push({ 
      id: `quill-content-${brand.id}`, 
      agentId: "quill", 
      title: "Quill-2 Content",
      priority: "MEDIUM",
      message: `Approve cross-channel content for auto-publish.`,
      time: "just now", 
      brand_name: brand.name,
      icon: getAgentIcon("quill")
    });
  }

  return alerts;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AIWorkbench() {
  const [brands, setBrands] = useState<BrandData[]>([]);
  const [activeBrand, setActiveBrand] = useState<BrandData | null>(null);
  const [isBrandOpen, setIsBrandOpen] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [activeId, setActiveId] = useState<string>("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [actionedIds, setActionedIds] = useState<Set<string>>(new Set());
  // DB-backed tasks pushed by the live SSE stream
  const [dbTasks, setDbTasks] = useState<AgentTask[]>([]);

  // Mark mounted — prevents hydration mismatch
  useEffect(() => { setMounted(true); }, []);

  // Fetch brands from DB-backed API
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
    setIsBrandOpen(false);
  };
  
  // Sync demoMode with localStorage
  useEffect(() => {
    const savedDemo = localStorage.getItem("nexus_demoMode");
    if (savedDemo === "true") setDemoMode(true);
  }, []);

  // ── Poll /api/dashboard/workbench every 3s for tasks pushed by live SSE ──
  useEffect(() => {
    const fetchDbTasks = () => {
      fetch("/api/dashboard/workbench")
        .then(r => r.ok ? r.json() : [])
        .then((data: Array<{ id: string; agent: string; priority: string; message: string; time: string; brand_name?: string }>) => {
          const mapped: AgentTask[] = data.map(t => ({
            id: t.id,
            agentId: t.agent.toLowerCase(),
            title: `${t.agent.charAt(0).toUpperCase() + t.agent.slice(1).toLowerCase()} Request`,
            priority: (t.priority as "HIGH" | "MEDIUM" | "LOW") || "HIGH",
            message: t.message,
            time: t.time || "just now",
            brand_name: t.brand_name,
            icon: getAgentIcon(t.agent),
            fromDb: true,
          }));
          setDbTasks(mapped);
        })
        .catch(() => {});
    };
    fetchDbTasks();
    const interval = setInterval(fetchDbTasks, 3000);
    return () => clearInterval(interval);
  }, []);

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

  // Merge: DB tasks (from SSE stream) take priority, then brand alerts
  // DB tasks that have already been actioned are filtered out by actionedIds
  const brandAlerts = activeBrand
    ? buildBrandAlerts(activeBrand).filter(t => !actionedIds.has(t.id))
    : [];

  // Deduplicate: DB tasks override brand alerts for the same agentId
  const dbAgentIds = new Set(dbTasks.filter(t => !actionedIds.has(t.id)).map(t => t.agentId));
  const filteredBrandAlerts = brandAlerts.filter(a => !dbAgentIds.has(a.agentId));
  const displayQueue: AgentTask[] = [
    ...dbTasks.filter(t => !actionedIds.has(t.id)),
    ...filteredBrandAlerts,
  ];

  const selected = displayQueue.find(q => q.id === activeId) ?? null;

  // Auto-select first item when queue changes
  useEffect(() => {
    if (displayQueue.length > 0 && !displayQueue.some(q => q.id === activeId)) {
      setActiveId(displayQueue[0].id);
    } else if (displayQueue.length === 0) {
      setActiveId("");
    }
  }, [displayQueue, activeId]);

  const customToastStyle = {
    background: T.primary,
    color: T.bg,
    border: `1px solid ${T.cardBorder}`,
    fontSize: '14px',
    fontFamily: 'monospace',
    letterSpacing: '0.05em'
  };

  // ── Action Handlers ──
  const handleApprove = async (task: AgentTask) => {
    if (processingId) return;
    setProcessingId(task.id);
    
    if (demoMode) {
      setTimeout(() => {
        toast.success(`[DEMO] ${task.agentId.toUpperCase()} Approved. Workflow resuming.`, { style: customToastStyle });
        setActionedIds(prev => new Set(prev).add(task.id));
        // Remove from DB in demo mode too
        if (task.fromDb) fetch(`/api/dashboard/workbench?id=${task.id}`, { method: "DELETE" }).catch(() => {});
        setProcessingId(null);
      }, 1200);
      return;
    }

    try {
      const res = await fetch("/api/agents/workbench-resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "APPROVE",
          agent: task.agentId.toUpperCase(),
          brandName: task.brand_name || activeBrand?.name,
          hubspotUrl: activeBrand?.hubspotUrl,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      toast.success(`${task.agentId.toUpperCase()} approved — Supervity execution resuming.`, { style: customToastStyle });
      setActionedIds(prev => new Set(prev).add(task.id));

      // Remove from DB so it vanishes from the queue on next poll
      if (task.fromDb) {
        await fetch(`/api/dashboard/workbench?id=${task.id}`, { method: "DELETE" }).catch(() => {});
        setDbTasks(prev => prev.filter(t => t.id !== task.id));
      }
    } catch (err) {
      toast.error(`Failed to sync: ${err instanceof Error ? err.message : "Network error"}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (task: AgentTask) => {
    if (processingId) return;
    setProcessingId(task.id);
    
    if (demoMode) {
      setTimeout(() => {
        toast.error(`[DEMO] ${task.agentId.toUpperCase()} decision rejected.`, { style: customToastStyle });
        setActionedIds(prev => new Set(prev).add(task.id));
        if (task.fromDb) fetch(`/api/dashboard/workbench?id=${task.id}`, { method: "DELETE" }).catch(() => {});
        setProcessingId(null);
      }, 800);
      return;
    }

    try {
      const res = await fetch("/api/agents/workbench-resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REJECT",
          agent: task.agentId.toUpperCase(),
          brandName: task.brand_name || activeBrand?.name,
          hubspotUrl: activeBrand?.hubspotUrl,
        }),
      });
      if (!res.ok) throw new Error("Reject call failed");

      toast.error(`${task.agentId.toUpperCase()} rejected — Supervity notified.`, { style: customToastStyle });
      setActionedIds(prev => new Set(prev).add(task.id));

      // Remove from DB so the task leaves the queue
      if (task.fromDb) {
        await fetch(`/api/dashboard/workbench?id=${task.id}`, { method: "DELETE" }).catch(() => {});
        setDbTasks(prev => prev.filter(t => t.id !== task.id));
      }
    } catch (err) {
      toast.error(`Failed to sync: ${err instanceof Error ? err.message : "Network error"}`);
    } finally {
      setProcessingId(null);
    }
  };

  // Render a stable skeleton before client mount
  if (!mounted) {
    return (
      <div style={{ backgroundColor: T.bg, minHeight: "100vh", padding: 24 }}>
        <div style={{ borderBottom: `1px solid ${T.cardBorder}`, paddingBottom: 18 }}>
          <h1 style={{ color: T.primary, fontSize: 26, fontWeight: 300, letterSpacing: "-0.02em", margin: 0, display: "flex", alignItems: "center", gap: 12 }}>
            <Shield size={24} stroke={T.primary} strokeWidth={1.5} />
            AI Workbench
          </h1>
          <p style={{ color: T.muted, fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.13em", marginTop: 7 }}>
            Human-in-the-Loop · Approval Queue · Loading...
          </p>
        </div>
        <div style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 8, color: T.muted, fontSize: 12, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          <Zap size={16} className="animate-pulse" />
          Initialising workbench...
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: T.bg,
        minHeight: "100vh",
        padding: 24,
        color: T.primary,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* ── Header ── */}
      <div style={{ borderBottom: `1px solid ${T.cardBorder}`, paddingBottom: 18, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ color: T.primary, fontSize: 26, fontWeight: 300, letterSpacing: "-0.02em", margin: 0, display: "flex", alignItems: "center", gap: 12 }}>
            {demoMode && (
              <div title="God Mode ON (Alt+G)" style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: T.primary, boxShadow: `0 0 4px ${T.cardBorder}`, flexShrink: 0 }} />
            )}
            <Shield size={24} stroke={T.primary} strokeWidth={1.5} />
            AI Workbench
          </h1>
          <p style={{ color: T.muted, fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.13em", marginTop: 7 }}>
            Human-in-the-Loop · Approval Queue · {displayQueue.length} Pending
          </p>
        </div>
        {/* Brand Selector */}
        {activeBrand && (
        <div style={{ position: "relative", marginTop: 4 }}>
          <button
            onClick={() => setIsBrandOpen(!isBrandOpen)}
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
          {isBrandOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", right: 0, width: 160,
              backgroundColor: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 8,
              overflow: "hidden", zIndex: 50, boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
            }}>
              {brands.map(b => (
                <button key={b.id}
                  onClick={() => handleBrandSelect(b)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "10px 14px",
                    backgroundColor: b.id === activeBrand.id ? T.hover : "transparent",
                    color: T.primary, fontSize: 13, border: "none", cursor: "pointer",
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = T.subtle}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = b.id === activeBrand.id ? T.hover : "transparent"}
                >{b.name}</button>
              ))}
            </div>
          )}
        </div>
        )}
      </div>

      {/* ── Split Pane ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "5fr 7fr",
          gap: 18,
          flex: 1,
          minHeight: 560,
        }}
      >
        {/* ── Left: Queue ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p
            style={{ color: T.muted, fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}
          >
            Pending Approvals ({displayQueue.length})
          </p>

          {displayQueue.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                border: `1px dashed ${T.cardBorder}`,
                borderRadius: 12,
                color: T.muted,
                gap: 10,
                minHeight: 200,
              }}
            >
              <CheckCircle2 size={28} style={{ opacity: 0.35 } as React.CSSProperties} />
              <p style={{ fontSize: 12, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Queue Clear
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {displayQueue.map(item => {
                const isActive = item.id === activeId;
                const Icon = item.icon;
                const isItemProcessing = processingId === item.id;
                
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveId(item.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "16px 20px",
                      borderRadius: 12,
                      border: `1px solid ${isActive ? T.primary : T.cardBorder}`,
                      backgroundColor: isActive ? T.subtle : "transparent",
                      color: T.primary,
                      cursor: "pointer",
                      position: "relative",
                      overflow: "hidden",
                      transition: "all 0.15s ease",
                      opacity: isItemProcessing ? 0.7 : 1,
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.hover; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                  >
                    {/* Active accent bar */}
                    {isActive && (
                      <div
                        style={{
                          position: "absolute",
                          left: 0, top: 0, bottom: 0,
                          width: 3,
                          backgroundColor: T.primary,
                          borderRadius: "0 2px 2px 0",
                        }}
                      />
                    )}

                    {/* Top row: agent + time */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isItemProcessing ? (
                          <Loader2 size={13} className="animate-spin text-slate-800" strokeWidth={2} />
                        ) : (
                          <Icon size={13} stroke={T.primary} strokeWidth={1.5} />
                        )}
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", color: T.primary }}>
                          [{item.agentId.toUpperCase()}]
                        </span>
                      </div>
                      <span style={{ fontSize: 10, fontFamily: "monospace", color: T.muted, display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock size={10} stroke={T.muted} />
                        {item.time}
                      </span>
                    </div>

                    <h3 style={{ fontSize: 14, fontWeight: 500, color: T.primary, marginBottom: 4 }}>{item.title}</h3>
                    
                    {/* Message */}
                    <p
                      style={{
                        color: T.muted,
                        fontSize: 13,
                        fontWeight: 300,
                        lineHeight: 1.55,
                        margin: 0,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical" as const,
                      }}
                    >
                      {item.message}
                    </p>

                    {/* Bottom row: priority badge + chevron */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: "monospace",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          padding: "3px 8px",
                          borderRadius: 4,
                          border: `1px solid ${PRIORITY_COLOR[item.priority]}`,
                          color: PRIORITY_COLOR[item.priority],
                        }}
                      >
                        {item.priority} PRIORITY
                      </span>
                      <ArrowRight size={13} stroke={isActive ? T.primary : "transparent"} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right: Detail Pane ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p
            style={{
              color: T.muted,
              fontSize: 10,
              fontFamily: "monospace",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              margin: 0,
            }}
          >
            Node Request Details
          </p>

          {selected ? (
            <div
              style={{
                flex: 1,
                backgroundColor: T.card,
                border: `1px solid ${T.cardBorder}`,
                borderRadius: 14,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                position: "relative",
              }}
            >
              {/* Detail header */}
              <div
                style={{
                  padding: "22px 26px",
                  borderBottom: `1px solid ${T.cardBorder}`,
                  background: "rgba(0,0,0,0.02)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      padding: "4px 10px",
                      borderRadius: 5,
                      border: `1px solid ${PRIORITY_COLOR[selected.priority]}`,
                      color: PRIORITY_COLOR[selected.priority],
                      fontWeight: 700,
                    }}
                  >
                    {selected.priority} PRIORITY
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, color: T.muted, fontSize: 11, fontFamily: "monospace" }}>
                    <Clock size={11} />
                    {selected.time}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <selected.icon size={26} stroke={T.primary} strokeWidth={1.5} style={{ opacity: 0.8 } as React.CSSProperties} />
                  <h2 style={{ color: T.primary, fontSize: 20, fontWeight: 300, letterSpacing: "-0.01em", margin: 0 }}>
                    {selected.title}
                  </h2>
                </div>
              </div>

              {/* Detail body */}
              <div
                style={{
                  flex: 1,
                  padding: "26px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <p
                    style={{
                      color: T.muted,
                      fontSize: 10,
                      fontFamily: "monospace",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      marginBottom: 14,
                    }}
                  >
                    Proposal Payload
                  </p>
                  <p
                    style={{
                      color: T.primary,
                      fontSize: 19,
                      fontWeight: 300,
                      lineHeight: 1.7,
                      margin: 0,
                    }}
                  >
                    &ldquo;{selected.message}&rdquo;
                  </p>

                  {/* Separator */}
                  <div style={{ borderTop: `1px solid ${T.cardBorder}`, marginTop: 24, paddingTop: 20 }}>
                    <p style={{ color: T.muted, fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
                      Requesting Agent Context
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {[
                        { label: "Node", value: selected.agentId },
                        { label: "Channel", value: "HubSpot CRM" },
                        { label: "Confidence", value: "94%" },
                      ].map(({ label, value }) => (
                        <div
                          key={label}
                          style={{
                            padding: "6px 12px",
                            backgroundColor: T.subtle,
                            borderRadius: 6,
                            border: `1px solid ${T.cardBorder}`,
                          }}
                        >
                          <span style={{ color: T.muted, fontSize: 10, fontFamily: "monospace", textTransform: "uppercase" }}>
                            {label}:{" "}
                          </span>
                          <span style={{ color: T.primary, fontSize: 12, fontWeight: 500 }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── Action Buttons ── */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                    marginTop: 28,
                  }}
                >
                  {/* REJECT */}
                  <button
                    onClick={() => handleReject(selected)}
                    disabled={!!processingId}
                    style={{
                      height: 88,
                      borderRadius: 12,
                      border: `2px solid ${T.danger}`,
                      backgroundColor: "transparent",
                      color: T.danger,
                      fontSize: 17,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      cursor: !!processingId ? "not-allowed" : "pointer",
                      opacity: !!processingId ? 0.5 : 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => { if (!processingId) e.currentTarget.style.backgroundColor = T.dangerBg; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    {processingId === selected.id ? <Loader2 size={22} className="animate-spin" /> : <X size={22} strokeWidth={2.5} />}
                    REJECT
                  </button>

                  {/* APPROVE */}
                  <button
                    onClick={() => handleApprove(selected)}
                    disabled={!!processingId}
                    style={{
                      height: 88,
                      borderRadius: 12,
                      border: `2px solid ${T.success}`,
                      backgroundColor: "transparent",
                      color: T.success,
                      fontSize: 17,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      cursor: !!processingId ? "not-allowed" : "pointer",
                      opacity: !!processingId ? 0.5 : 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => { if (!processingId) e.currentTarget.style.backgroundColor = T.successBg; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    {processingId === selected.id ? <Loader2 size={22} className="animate-spin" /> : <Check size={22} strokeWidth={2.5} />}
                    APPROVE
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                border: `1px dashed ${T.cardBorder}`,
                borderRadius: 14,
                color: T.muted,
                gap: 12,
                minHeight: 300,
              }}
            >
              <Shield size={34} style={{ opacity: 0.18 } as React.CSSProperties} />
              <p style={{ fontSize: 14, fontWeight: 300 }}>Select an item to review</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
