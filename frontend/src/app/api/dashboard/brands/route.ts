/**
 * GET    /api/dashboard/brands         — list all brands
 * POST   /api/dashboard/brands         — create a brand
 * PATCH  /api/dashboard/brands?id=<id> — update brand KPI metrics
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const brands = await prisma.brand.findMany();
  return NextResponse.json(brands);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { id, name, hubspotUrl, sovDrop, crisisProb, wasteInr, currentCac, targetCac } = body;
  if (!id || !name) {
    return NextResponse.json({ error: "id and name required" }, { status: 400 });
  }
  const brand = await prisma.brand.upsert({
    where: { id },
    update: { name, hubspotUrl, sovDrop, crisisProb, wasteInr, currentCac, targetCac },
    create: { id, name, hubspotUrl: hubspotUrl || "", sovDrop: sovDrop || 0, crisisProb: crisisProb || 0, wasteInr: wasteInr || 0, currentCac: currentCac || 0, targetCac: targetCac || 0 },
  });
  return NextResponse.json(brand);
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });
  const body = await req.json();
  const { name, hubspotUrl, sovDrop, crisisProb, wasteInr, currentCac, targetCac } = body;
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (hubspotUrl !== undefined) data.hubspotUrl = hubspotUrl;
  if (sovDrop !== undefined) data.sovDrop = sovDrop;
  if (crisisProb !== undefined) data.crisisProb = crisisProb;
  if (wasteInr !== undefined) data.wasteInr = wasteInr;
  if (currentCac !== undefined) data.currentCac = currentCac;
  if (targetCac !== undefined) data.targetCac = targetCac;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  const brand = await prisma.brand.update({ where: { id }, data });
  return NextResponse.json(brand);
}
