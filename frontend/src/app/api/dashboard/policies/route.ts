/**
 * GET    /api/dashboard/policies  — list all policies
 * POST   /api/dashboard/policies  — create a policy
 * PATCH  /api/dashboard/policies?id=  — update/toggle
 * DELETE /api/dashboard/policies?id=  — delete
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
async function readPolicies(): Promise<Policy[]> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(path.join(DATA_DIR, "policies.json"), "utf-8");
    return JSON.parse(raw);
  } catch { return []; }
}
async function writePolicies(data: Policy[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, "policies.json"), JSON.stringify(data, null, 2), "utf-8");
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  natural_language: string;
  summary: string;
  policy_type: "logical" | "natural_language";
  dsl: {
    conditions: Array<{ field: string; operator: string; value: string }>;
    actions: Array<{ type: string; value?: string }>;
    match_mode: "all" | "any";
  } | null;
  refined_instruction: string | null;
  ai_instruction: string;
  entity_name: string | null;
  is_active: boolean;
  priority: number;
  tags: string[];
  execution_count: number;
  last_executed_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET() {
  const policies = await readPolicies();
  return NextResponse.json(policies);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const now = new Date().toISOString();
  const policy: Policy = {
    id: body.id || `pol-${Date.now()}`,
    name: body.name,
    description: body.description || "",
    natural_language: body.natural_language || body.naturalLanguage || "",
    summary: body.summary || body.description || "",
    policy_type: body.policy_type || body.policyType || "natural_language",
    dsl: body.dsl || null,
    refined_instruction: body.refined_instruction || body.refinedInstruction || null,
    ai_instruction: body.ai_instruction || body.natural_language || "",
    entity_name: body.entity_name || body.entityName || null,
    is_active: true,
    priority: body.priority || 50,
    tags: body.tags || [],
    execution_count: 0,
    last_executed_at: null,
    created_at: now,
    updated_at: now,
  };
  const policies = await readPolicies();
  await writePolicies([policy, ...policies]);
  return NextResponse.json(policy, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const body = await req.json();
  const policies = await readPolicies();
  const updated = policies.map(p =>
    p.id === id ? { ...p, ...body, updated_at: new Date().toISOString() } : p
  );
  await writePolicies(updated);
  return NextResponse.json(updated.find(p => p.id === id));
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const policies = await readPolicies();
  await writePolicies(policies.filter(p => p.id !== id));
  return NextResponse.json({ removed: id });
}
