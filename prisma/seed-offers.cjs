// CREATE this file at prisma/seed-offers.cjs
// Creates the 4 prebuilt offers as DRAFTS. Run once with:
//   node prisma/seed-offers.cjs
// Then open each offer in the admin, pick its products, and click
// "Save & activate". (Products can't be seeded — they're picked from
// YOUR catalog with the product picker.)
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.offer.count();
  if (existing > 0) {
    console.log(`Skipped: ${existing} offer(s) already exist.`);
    return;
  }

  // Offer 1 — quantity breaks 2/3/4
  await prisma.offer.create({
    data: {
      type: "QUANTITY_BREAK",
      name: "Buy more, save more",
      status: "DRAFT",
      productsJson: "[]",
      configJson: "{}",
      tiers: {
        create: [
          { position: 0, minQty: 2, discountType: "PERCENTAGE", valueX100: 1000, badge: null, preselected: false },
          { position: 1, minQty: 3, discountType: "PERCENTAGE", valueX100: 1500, badge: "MOST POPULAR", preselected: true },
          { position: 2, minQty: 4, discountType: "PERCENTAGE", valueX100: 2000, badge: "BEST VALUE", preselected: false },
        ],
      },
    },
  });

  // Offer 2 — Buy 1 Get 1 Free
  await prisma.offer.create({
    data: {
      type: "BOGO",
      name: "Buy 1 Get 1 Free",
      status: "DRAFT",
      productsJson: "[]",
      configJson: JSON.stringify({ buyQty: 1, getQty: 1, percentOff: 100 }),
    },
  });

  // Offer 3 — Spend AED 300 → free gift (pick the gift product in the admin)
  await prisma.offer.create({
    data: {
      type: "FREE_GIFT",
      name: "Spend AED 300 — Free Gift",
      status: "DRAFT",
      productsJson: "[]",
      configJson: JSON.stringify({ thresholdX100: 30000 }),
    },
  });

  // Offer 4 — Mix & Match any 3 for 20% off
  await prisma.offer.create({
    data: {
      type: "MIX_MATCH",
      name: "Mix & Match — any 3 for 20% off",
      status: "DRAFT",
      productsJson: "[]",
      configJson: JSON.stringify({ minQty: 3, percentOff: 20 }),
    },
  });

  console.log("Created 4 draft offers. Open the app, add products to each, then Save & activate.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
