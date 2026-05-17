import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"

const adapter = new PrismaBetterSqlite3({ url: "dev.db" });
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding brands...');
  const brands = [
    { id: "boat", name: "boAt", hubspotUrl: "https://app.hubspot.com/contacts/246216086/company/322843509473", sovDrop: 3.7, crisisProb: 35, wasteInr: 800000, currentCac: 200, targetCac: 150 },
    { id: "mamaearth", name: "Mamaearth", hubspotUrl: "https://app.hubspot.com/contacts/246216086/company/322934771387", sovDrop: 0.8, crisisProb: 65, wasteInr: 1200000, currentCac: 1500, targetCac: 900 },
    { id: "nike", name: "Nike", hubspotUrl: "https://app.hubspot.com/contacts/246216086/company/322503805626", sovDrop: 14, crisisProb: 20, wasteInr: 9500000, currentCac: 2500, targetCac: 2000 },
    { id: "apple", name: "Apple", hubspotUrl: "https://app.hubspot.com/contacts/246216086/company/322934484674", sovDrop: 0, crisisProb: 85, wasteInr: 24000000, currentCac: 2000, targetCac: 1500 }
  ];

  for (const b of brands) {
    await prisma.brand.upsert({
      where: { id: b.id },
      update: b,
      create: b,
    })
  }

  console.log('Seeding completed.');
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
