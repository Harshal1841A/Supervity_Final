import os
import uuid
import logging
import httpx
import datetime
from datetime import timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.run_state import AgentRun, AgentTask

log = logging.getLogger(__name__)

supervity_router = APIRouter(prefix="/supervity", tags=["Supervity"])

# ─── Pydantic Models ──────────────────────────────────────────────────────────

class TriggerPayload(BaseModel):
    brand_name: str
    trigger_source: str
    trigger_reason: str
    campaign_state_url: str

class ReviewDecision(BaseModel):
    """Maps to POST /api/v1/user-forms/:formId/submit body"""
    formId: str
    decision: str   # "approve" | "reject"
    comments: Optional[str] = ""

# ─── Helpers ──────────────────────────────────────────────────────────────────

WORKFLOW_SVC_URL = os.getenv("SUPERVITY_BASE_URL", "https://auto.supervity.ai").rstrip("/")

def get_supervity_headers() -> dict:
    token = os.getenv("SUPERVITY_BEARER_TOKEN", os.getenv("SUPERVITY_API_KEY", ""))
    return {"Authorization": f"Bearer {token}"}

def _now_iso() -> str:
    return datetime.datetime.now(timezone.utc).isoformat()

def _time_ago(dt: datetime.datetime) -> str:
    now = datetime.datetime.now(timezone.utc)
    aware_dt = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    diff = int((now - aware_dt).total_seconds() / 60)
    if diff < 1:
        return "Just now"
    if diff < 60:
        return f"{diff}m ago"
    return f"{diff // 60}h ago"

# ─── /trigger ────────────────────────────────────────────────────────────────

@supervity_router.post("/trigger")
async def trigger_atlas(payload: TriggerPayload, db: Session = Depends(get_db)):
    """
    Triggers the Atlas Orchestrator workflow via:
      POST /api/v1/workflow-runs/execute  (multipart/form-data)

    Required env vars:
      SUPERVITY_BASE_URL   — defaults to https://auto.supervity.ai
      SUPERVITY_API_KEY    — Bearer token
      ATLAS_WORKFLOW_ID    — workflowId for Atlas orchestrator
    """
    workflow_id = os.getenv("ATLAS_WORKFLOW_ID", "")
    endpoint    = f"{WORKFLOW_SVC_URL}/api/v1/workflow-runs/execute"

    log.info("Triggering Atlas workflow %s for brand: %s", workflow_id, payload.brand_name)

    run_id: str = f"run_{uuid.uuid4().hex[:8]}"   # fallback
    supervity_run_id: Optional[str] = None

    try:
        # Supervity execute endpoint uses multipart/form-data
        form_data = {
            "workflowId": workflow_id,
            "inputs[brand_name]":        payload.brand_name,
            "inputs[trigger_source]":    payload.trigger_source,
            "inputs[trigger_reason]":    payload.trigger_reason,
            "inputs[campaign_state_url]": payload.campaign_state_url,
        }
        async with httpx.AsyncClient() as client:
            res = await client.post(
                endpoint,
                headers=get_supervity_headers(),
                data=form_data,          # multipart/form-data
                timeout=15.0,
            )

        if res.status_code < 400:
            data = res.json()
            # Supervity returns the run object; grab the id field
            supervity_run_id = (
                data.get("id")
                or data.get("runId")
                or data.get("run_id")
            )
            if supervity_run_id:
                run_id = supervity_run_id
            log.info("Supervity execute succeeded → run_id=%s", run_id)
        else:
            log.warning(
                "Supervity execute returned %s — %s. Falling back to simulated run.",
                res.status_code, res.text[:200]
            )

    except Exception as exc:
        log.error("Failed to call Supervity execute: %s. Falling back.", exc)

    # Persist the run in PostgreSQL
    new_run = AgentRun(
        run_id=run_id,
        status="running",
        logs=[],
        completed=False,
    )
    db.add(new_run)
    db.commit()

    return {"status": "success", "run_id": run_id}


# ─── /status/{run_id} ────────────────────────────────────────────────────────

@supervity_router.get("/status/{run_id}")
async def get_run_status(run_id: str, db: Session = Depends(get_db)):
    """
    Polls run state via:
      GET /api/v1/workflow-runs/:runId
    Falls back to DB-based simulation when the API is unreachable.
    """
    endpoint = f"{WORKFLOW_SVC_URL}/api/v1/workflow-runs/{run_id}"

    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                endpoint,
                headers=get_supervity_headers(),
                timeout=8.0,
            )

        if res.status_code < 400:
            data = res.json()
            # Normalise to our internal shape the frontend understands
            status  = data.get("status", "running")
            completed = status in ("completed", "failed", "cancelled")
            # Extract activity-run logs if present
            logs = [
                {
                    "agent":        step.get("name", "Agent"),
                    "status":       step.get("status", "success"),
                    "action_taken": step.get("output", step.get("description", "")),
                    "key_metrics":  step.get("metadata", {}),
                    "human_required": step.get("status") == "paused",
                    "timestamp":    step.get("createdAt", _now_iso()),
                }
                for step in data.get("activityRuns", [])
            ]
            return {"run_id": run_id, "logs": logs, "completed": completed}

    except Exception as exc:
        log.warning("Polling Supervity run %s failed: %s", run_id, exc)

    # ── Simulation fallback (for local dev / when API is not yet live) ──
    run_record = db.query(AgentRun).filter(AgentRun.run_id == run_id).first()
    if not run_record:
        return {"run_id": run_id, "logs": [], "completed": True}

    if run_record.completed:
        return {"run_id": run_id, "logs": run_record.logs, "completed": True}

    current_count = len(run_record.logs) if run_record.logs else 0
    now = _now_iso()
    new_logs = list(run_record.logs or [])

    SIMULATION_STEPS = [
        # (index, entries_to_append)
        (0, [{"agent": "Atlas",   "status": "success",       "action_taken": "Orchestration sequence initiated — delegating to sub-agents.",                          "key_metrics": {}, "human_required": False, "timestamp": now}]),
        (1, [{"agent": "Oracle",  "status": "success",       "action_taken": "Live market sentiment grounded via search. Top signals indexed.",                        "key_metrics": {}, "human_required": False, "timestamp": now}]),
        (2, [{"agent": "Lens",    "status": "success",       "action_taken": "Share of Voice analysis complete. Competitor gap identified.",                           "key_metrics": {"Competitor SOV Gap": "-4.2%"}, "human_required": False, "timestamp": now},
             {"agent": "Helios",  "status": "success",       "action_taken": "Paid media audit complete. Wasteful spend detected in HubSpot deals.",                   "key_metrics": {"Budget Remaining": "₹12.4L"}, "human_required": False, "timestamp": now}]),
        (4, [{"agent": "Ledger",  "status": "success",       "action_taken": "CAC attribution calculated. LTV:CAC healthy at 3.2x on HubSpot Deal #902.",             "key_metrics": {"LTV:CAC Ratio": "3.2x"}, "human_required": False, "timestamp": now}]),
        (5, [{"agent": "Sentry",  "status": "success",       "action_taken": "Crisis monitor scanned 480 signals — no critical threat detected.",                     "key_metrics": {"Crisis Probability": "0.04"}, "human_required": False, "timestamp": now},
             {"agent": "Vanguard","status": "pending_human",  "action_taken": "Competitor SOV dropped 4.2%. Vanguard requests ₹50,000 budget for Google Search conquest campaign.", "key_metrics": {}, "human_required": True,  "timestamp": now}]),
        (7, [{"agent": "Quill",   "status": "success",       "action_taken": "LinkedIn + Twitter copy generated and grounded by Oracle trend research.",               "key_metrics": {}, "human_required": False, "timestamp": now},
             {"agent": "Herald",  "status": "success",       "action_taken": "Morning briefing compiled and dispatched to Slack #growth channel.",                     "key_metrics": {}, "human_required": False, "timestamp": now}]),
    ]

    for threshold, entries in SIMULATION_STEPS:
        if current_count == threshold:
            new_logs.extend(entries)
            # Create pending DB task for human-in-the-loop entries
            for entry in entries:
                if entry.get("human_required"):
                    task = AgentTask(
                        run_id=run_id,
                        task_id=f"{entry['agent'].lower()}-{uuid.uuid4().hex[:4]}",
                        agent=f"{entry['agent'].upper()} CONQUEST",
                        priority="HIGH",
                        priority_color="#ef4444",
                        message=entry["action_taken"],
                        icon_name="Zap",
                    )
                    db.add(task)
            break

    # Mark completed after final step
    if len(new_logs) >= 9:
        run_record.completed = True
        run_record.status = "completed"

    # Reassign to trigger SQLAlchemy mutation detection on JSON columns
    run_record.logs = new_logs
    db.commit()

    return {"run_id": run_id, "logs": run_record.logs, "completed": run_record.completed}


# ─── /tasks ──────────────────────────────────────────────────────────────────

@supervity_router.get("/tasks")
async def get_pending_tasks(db: Session = Depends(get_db)):
    """
    Lists pending human-in-the-loop review forms via:
      GET /api/v1/user-forms

    Falls back to DB-seeded demo tasks when the API is unreachable.
    """
    endpoint = f"{WORKFLOW_SVC_URL}/api/v1/user-forms?page=1&limit=20"

    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                endpoint,
                headers=get_supervity_headers(),
                timeout=8.0,
            )

        if res.status_code < 400:
            data = res.json()
            forms = data.get("forms", [])
            # Map Supervity user-form schema → our frontend shape
            tasks = [
                {
                    "id":            f["id"],
                    "agent":         f.get("workflowName", f.get("workflowStepName", "Agent")).upper(),
                    "priority":      "HIGH",
                    "priorityColor": "#ef4444",
                    "message":       f.get("workflowStepName", "Action required — please review and decide."),
                    "time":          f.get("createdAt", ""),
                    "icon_name":     "Zap",
                }
                for f in forms
                if f.get("status") == "pending"
            ]
            return {"status": "success", "tasks": tasks}

    except Exception as exc:
        log.warning("Fetching Supervity user-forms failed: %s — using DB fallback.", exc)

    # ── DB fallback ──
    db_tasks = db.query(AgentTask).filter(AgentTask.status == "pending_human").all()

    if not db_tasks:
        # Seed demo tasks once
        demo_tasks = [
            AgentTask(run_id="demo", task_id=f"vanguard-{uuid.uuid4().hex[:4]}",
                      agent="VANGUARD CONQUEST",  priority="HIGH",   priority_color="#ef4444",
                      message="Competitor SOV dropped 4.2%. Vanguard requests ₹50,000 budget for Google Search attack campaign.",
                      icon_name="Zap"),
            AgentTask(run_id="demo", task_id=f"helios-{uuid.uuid4().hex[:4]}",
                      agent="HELIOS AUDIT",        priority="MEDIUM", priority_color="#f59e0b",
                      message="Wasteful spend detected in HubSpot deals. Requesting approval to reallocate ₹1.2L to high-performing channels.",
                      icon_name="AlertTriangle"),
            AgentTask(run_id="demo", task_id=f"quill-{uuid.uuid4().hex[:4]}",
                      agent="QUILL CONTENT",       priority="LOW",    priority_color="rgba(247,231,206,0.55)",
                      message="Review LinkedIn/Twitter copy grounded by Oracle trend search before publishing.",
                      icon_name="CheckCircle2"),
        ]
        db.add_all(demo_tasks)
        db.commit()
        db_tasks = demo_tasks

    return {
        "status": "success",
        "tasks": [
            {
                "id":            t.task_id,
                "agent":         t.agent,
                "priority":      t.priority,
                "priorityColor": t.priority_color,
                "message":       t.message,
                "time":          _time_ago(t.created_at),
                "icon_name":     t.icon_name,
            }
            for t in db_tasks
        ],
    }


# ─── /webhook (Approve / Reject) ─────────────────────────────────────────────

@supervity_router.post("/webhook")
async def workbench_action(payload: ReviewDecision, db: Session = Depends(get_db)):
    """
    Submits an approve/reject decision to Supervity via:
      POST /api/v1/user-forms/:formId/submit
      Body: { "decision": "approve"|"reject", "comments": "..." }

    Falls back to DB-only update when the API is unreachable.
    """
    form_id  = payload.formId
    decision = payload.decision.lower()   # "approve" | "reject"
    endpoint = f"{WORKFLOW_SVC_URL}/api/v1/user-forms/{form_id}/submit"

    log.info("Submitting decision '%s' for form %s", decision, form_id)

    supervity_ok = False
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                endpoint,
                headers={**get_supervity_headers(), "Content-Type": "application/json"},
                json={"decision": decision, "comments": payload.comments or ""},
                timeout=10.0,
            )
        if res.status_code < 400:
            supervity_ok = True
            log.info("Supervity user-form submit succeeded for form %s", form_id)
        else:
            log.warning("Supervity submit returned %s — %s", res.status_code, res.text[:200])

    except Exception as exc:
        log.error("Supervity submit failed for %s: %s", form_id, exc)

    # Always update our local DB record regardless of Supervity response
    task = db.query(AgentTask).filter(AgentTask.task_id == form_id).first()
    if task:
        task.status = decision
        db.commit()
        return {
            "status":  "success",
            "message": f"Decision '{decision}' recorded. Execution will resume.",
            "supervity_confirmed": supervity_ok,
        }

    return {
        "status":  "success",
        "message": f"Decision '{decision}' forwarded to Supervity.",
        "supervity_confirmed": supervity_ok,
    }
