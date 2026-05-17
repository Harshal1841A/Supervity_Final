/**
 * GET  /api/dashboard/kpis?brandId=<id>  — fetch brand-computed KPI values
 * POST /api/dashboard/kpis               — update overridden KPI values
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export interface KPIData {
  budgetRemaining: string | null;
  ltvCac: string | null;
  sovGap: string | null;
  crisisProb: string | null;
  lastUpdated: string | null;
  runId: string | null;
}

function computeKpisFromBrand(brand: {
  sovDrop: number; crisisProb: number; wasteInr: number; currentCac: number; targetCac: number;
}): KPIData {
  const fmtInr = (n: number) => {
    if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
    if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`;
    return `₹${n.toLocaleString("en-IN")}`;
  };

  const budgetSaved = Math.round(brand.wasteInr * 0.6);
  const ltvCacRatio = brand.targetCac > 0 ? (brand.currentCac / brand.targetCac).toFixed(2) : "N/A";

  return {
    budgetRemaining: fmtInr(budgetSaved),
    ltvCac: `${ltvCacRatio}x`,
    sovGap: `${brand.sovDrop.toFixed(1)}pp`,
    crisisProb: `${brand.crisisProb}%`,
    lastUpdated: new Date().toISOString(),
    runId: null,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");

  if (brandId) {
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (brand) {
      return NextResponse.json(computeKpisFromBrand(brand));
    }
  }

  // Fallback: compute from first available brand
  const brand = await prisma.brand.findFirst();
  if (brand) {
    return NextResponse.json(computeKpisFromBrand(brand));
  }

  return NextResponse.json({
    budgetRemaining: null, ltvCac: null, sovGap: null,
    crisisProb: null, lastUpdated: null, runId: null,
  });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");
  const body = await req.json().catch(() => ({}));

  if (brandId && Object.keys(body).length > 0) {
    // Allow updating brand metrics directly
    const allowedFields = ["sovDrop", "crisisProb", "wasteInr", "currentCac", "targetCac"];
    const updateData: Record<string, number> = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) updateData[key] = Number(body[key]);
    }
    if (Object.keys(updateData).length > 0) {
      await prisma.brand.update({ where: { id: brandId }, data: updateData });
    }
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (brand) return NextResponse.json(computeKpisFromBrand(brand));
  }

  return NextResponse.json({ error: "brandId required for updates" }, { status: 400 });
}
