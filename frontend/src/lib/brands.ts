// ─── Shared Brand Data ────────────────────────────────────────────────────────
export interface BrandData {
  id: string;
  name: string;
  hubspotUrl: string;
  sovDrop: number;      // percentage points
  crisisProb: number;   // 0–100
  wasteInr: number;     // rupees
  currentCac: number;   // INR
  targetCac: number;    // INR
}

export const BRAND_DATA: BrandData[] = [
  { id: "boat",      name: "boAt",      hubspotUrl: "https://app.hubspot.com/contacts/246216086/company/322843509473", sovDrop: 3.7,  crisisProb: 35, wasteInr: 800000,   currentCac: 200,  targetCac: 150  },
  { id: "mamaearth", name: "Mamaearth", hubspotUrl: "https://app.hubspot.com/contacts/246216086/company/322934771387", sovDrop: 0.8,  crisisProb: 65, wasteInr: 1200000,  currentCac: 1500, targetCac: 900  },
  { id: "nike",      name: "Nike",      hubspotUrl: "https://app.hubspot.com/contacts/246216086/company/322503805626", sovDrop: 14,   crisisProb: 20, wasteInr: 9500000,  currentCac: 2500, targetCac: 2000 },
  { id: "apple",     name: "Apple",     hubspotUrl: "https://app.hubspot.com/contacts/246216086/company/322934484674", sovDrop: 0,    crisisProb: 85, wasteInr: 24000000, currentCac: 2000, targetCac: 1500 },
];

/** Format a number as Indian Rupees with lakh/crore notation */
export function fmtInr(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}
