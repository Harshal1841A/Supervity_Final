/**
 * GET    /api/dashboard/workbench  — fetch pending approval tasks
 * POST   /api/dashboard/workbench  — enqueue a new task
 * DELETE /api/dashboard/workbench?id=<id>  — remove task after approve/reject
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export interface WorkbenchTaskPayload {
  id: string;
  agent: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  message: string;
  time?: string;
  createdAt?: string;
  brand_name?: string;
}

export async function GET() {
  const tasks = await prisma.workbenchTask.findMany({
    where: { status: "PENDING" },
    include: { brand: true }
  });

  // Map to frontend expected shape
  const formattedTasks = tasks.map(t => ({
    ...t,
    brand_name: t.brand ? t.brand.name : "GrowthPilot Default",
  }));

  return NextResponse.json(formattedTasks);
}

export async function POST(req: NextRequest) {
  const task: WorkbenchTaskPayload = await req.json();
  if (!task.id || !task.agent || !task.message) {
    return NextResponse.json({ error: "id, agent, and message required" }, { status: 400 });
  }

  const existing = await prisma.workbenchTask.findUnique({ where: { id: task.id } });
  if (existing) {
    return NextResponse.json(existing);
  }

  // Try to find a brand by name or ID if possible. If not, don't link it.
  let brandId = null;
  if (task.brand_name && task.brand_name !== "GrowthPilot Default") {
    // Attempt to match brand by name
    const brand = await prisma.brand.findFirst({
      where: { name: task.brand_name }
    });
    if (brand) brandId = brand.id;
  }

  const newTask = await prisma.workbenchTask.create({
    data: {
      id: task.id,
      agent: task.agent,
      priority: task.priority,
      message: task.message,
      time: task.time || "just now",
      status: "PENDING",
      brandId: brandId,
    }
  });

  return NextResponse.json({ ...newTask, brand_name: task.brand_name || "GrowthPilot Default" });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }
  try {
    await prisma.workbenchTask.delete({ where: { id } });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2025') {
      return NextResponse.json({ removed: id });
    }
    throw err;
  }
  return NextResponse.json({ removed: id });
}
