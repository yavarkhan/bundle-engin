// CREATE this file at app/models/analytics.server.ts
// Impression recording, order attribution, and dashboard stats.

import prisma from "../db.server";

export async function recordImpression(offerId: string) {
  // Only record events for offers that actually exist (junk protection).
  const exists = await prisma.offer.findUnique({ where: { id: offerId }, select: { id: true } });
  if (!exists) return;
  await prisma.offerEvent.create({ data: { offerId, event: "impression" } });
}

/**
 * Attributes an order (REST webhook payload) to offers.
 * Strategy: a line item counts toward an offer when its product is in the
 * offer's product list AND the line actually received a discount allocation
 * (i.e. the offer really applied). Revenue = line total minus allocations.
 */
export async function recordOrder(payload: any) {
  const orderId = String(payload?.id ?? "");
  if (!orderId || !Array.isArray(payload?.line_items)) return;

  const offers = await prisma.offer.findMany({
    select: { id: true, productsJson: true },
  });
  const offerProducts = offers.map((o) => ({
    id: o.id,
    pids: new Set(
      (JSON.parse(o.productsJson) as { id: string }[]).map((p) =>
        String(p.id).split("/").pop(),
      ),
    ),
  }));

  const revenueByOffer = new Map<string, number>();
  for (const line of payload.line_items) {
    const allocations = line.discount_allocations || [];
    if (!allocations.length) continue;
    const pid = String(line.product_id ?? "");
    const match = offerProducts.find((o) => o.pids.has(pid));
    if (!match) continue;
    const gross = Math.round(parseFloat(line.price || "0") * 100) * (line.quantity || 1);
    const off = allocations.reduce(
      (s: number, a: any) => s + Math.round(parseFloat(a.amount || "0") * 100),
      0,
    );
    const net = Math.max(0, gross - off);
    revenueByOffer.set(match.id, (revenueByOffer.get(match.id) ?? 0) + net);
  }

  for (const [offerId, revenueX100] of revenueByOffer) {
    await prisma.offerConversion
      .create({
        data: {
          offerId,
          orderId,
          orderName: payload.name ?? null,
          revenueX100,
          currency: payload.currency ?? "",
        },
      })
      .catch(() => null); // unique(offerId, orderId): webhook retries are no-ops
  }
}

export type OfferStats = {
  offerId: string;
  impressions: number;
  orders: number;
  revenueX100: number;
};

export async function getStats(): Promise<Map<string, OfferStats>> {
  const [impressions, conversions] = await Promise.all([
    prisma.offerEvent.groupBy({
      by: ["offerId"],
      where: { event: "impression" },
      _count: { _all: true },
    }),
    prisma.offerConversion.groupBy({
      by: ["offerId"],
      _count: { _all: true },
      _sum: { revenueX100: true },
    }),
  ]);
  const map = new Map<string, OfferStats>();
  const get = (id: string) => {
    if (!map.has(id)) map.set(id, { offerId: id, impressions: 0, orders: 0, revenueX100: 0 });
    return map.get(id)!;
  };
  for (const row of impressions) get(row.offerId).impressions = row._count._all;
  for (const row of conversions) {
    const s = get(row.offerId);
    s.orders = row._count._all;
    s.revenueX100 = row._sum.revenueX100 ?? 0;
  }
  return map;
}
