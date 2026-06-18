// CREATE this file at extensions/bundle-discount/src/evaluate.js
// Pure discount evaluator — no Shopify imports, fully unit-testable.
// Input: parsed config (from the discount metafield) + input.cart.
// Output: array of product discount candidates.
//
// Rules:
// - Offers are evaluated in priority order: FREE_GIFT, BOGO, QUANTITY_BREAK, MIX_MATCH.
// - A cart line can only be discounted by ONE offer (first match wins) so
//   offers never stack on the same line.

const TYPE_PRIORITY = { FREE_GIFT: 0, BOGO: 1, QUANTITY_BREAK: 2, MIX_MATCH: 3 };

function numericProductId(line) {
  if (!line.merchandise || line.merchandise.__typename !== "ProductVariant") return null;
  const gid = line.merchandise.product.id;
  return gid.substring(gid.lastIndexOf("/") + 1);
}

function unitPrice(line) {
  return parseFloat(line.cost.amountPerQuantity.amount);
}

function groupLinesByProduct(cart) {
  const map = new Map();
  for (const line of cart.lines) {
    const pid = numericProductId(line);
    if (!pid) continue;
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid).push(line);
  }
  return map;
}

function bestTier(tiers, qty) {
  let best = null;
  for (const tier of tiers || []) {
    if (qty >= tier.minQty && (!best || tier.minQty > best.minQty)) best = tier;
  }
  return best;
}

function tierValueForLine(tier, line) {
  // tier.v is an x100 integer: 1000 = 10.00% or AED 10.00
  if (tier.t === "PERCENTAGE") {
    return { percentage: { value: tier.v / 100 } };
  }
  if (tier.t === "FIXED_AMOUNT") {
    const off = tier.v / 100;
    if (off <= 0 || off >= unitPrice(line)) return null;
    return { fixedAmount: { amount: off.toFixed(2), appliesToEachItem: true } };
  }
  if (tier.t === "FIXED_UNIT_PRICE") {
    const target = tier.v / 100;
    const delta = unitPrice(line) - target;
    if (delta <= 0) return null; // already cheaper than the tier price
    return { fixedAmount: { amount: delta.toFixed(2), appliesToEachItem: true } };
  }
  return null;
}

function evalQuantityBreak(offer, byProduct, claimed, candidates) {
  for (const pid of offer.productIds || []) {
    const lines = (byProduct.get(String(pid)) || []).filter((l) => !claimed.has(l.id));
    if (!lines.length) continue;
    const qty = lines.reduce((s, l) => s + l.quantity, 0);
    const tier = bestTier(offer.tiers, qty);
    if (!tier) continue;
    for (const line of lines) {
      const value = tierValueForLine(tier, line);
      if (!value) continue;
      claimed.add(line.id);
      candidates.push({
        message: tier.badge
          ? `${offer.name} — ${tier.label}`
          : `${offer.name} (${tier.label})`,
        targets: [{ cartLine: { id: line.id } }],
        value,
      });
    }
    // Per-tier free gift: 100% off ONE unit of the gift product when the
    // tier is reached (the storefront watcher auto-adds the gift line).
    if (tier.gift && tier.gift.pid) {
      const giftLines = (byProduct.get(String(tier.gift.pid)) || []).filter(
        (l) => !claimed.has(l.id),
      );
      if (giftLines.length) {
        const giftLine = giftLines[0];
        claimed.add(giftLine.id);
        candidates.push({
          message: `${offer.name} — FREE GIFT`,
          targets: [{ cartLine: { id: giftLine.id, quantity: 1 } }],
          value: { percentage: { value: 100 } },
        });
      }
    }
  }
}

/**
 * True when any QUANTITY_BREAK offer's matched tier grants free shipping.
 * Used by the delivery-options run (shipping discount).
 */
export function hasFreeShipping(config, cart) {
  const offers = (config && config.offers) || [];
  if (!offers.length || !cart || !cart.lines || !cart.lines.length) return false;
  const byProduct = groupLinesByProduct(cart);
  for (const offer of offers) {
    if (offer.type !== "QUANTITY_BREAK") continue;
    for (const pid of offer.productIds || []) {
      const lines = byProduct.get(String(pid)) || [];
      if (!lines.length) continue;
      const qty = lines.reduce((s, l) => s + l.quantity, 0);
      const tier = bestTier(offer.tiers, qty);
      if (tier && tier.fs) return true;
    }
  }
  return false;
}

function bogoRungs(offer) {
  const fromTiers = (offer.tiers || [])
    .filter((t) => t.get)
    .map((t) => ({ buy: t.minQty, get: t.get, pct: t.v / 100, name: t.label }));
  if (fromTiers.length) return fromTiers;
  if (offer.buyQty && offer.getQty) {
    return [{ buy: offer.buyQty, get: offer.getQty, pct: offer.percentOff || 100 }];
  }
  return [];
}

function evalBogo(offer, byProduct, claimed, candidates) {
  for (const pid of offer.productIds || []) {
    const lines = (byProduct.get(String(pid)) || []).filter((l) => !claimed.has(l.id));
    if (!lines.length) continue;
    const qty = lines.reduce((s, l) => s + l.quantity, 0);
    // Best rung = largest group size the cart quantity satisfies.
    let rung = null;
    for (const r of bogoRungs(offer)) {
      const size = r.buy + r.get;
      if (qty >= size && (!rung || size > rung.buy + rung.get)) rung = r;
    }
    if (!rung) continue;
    const pct = rung.pct;
    const groupSize = rung.buy + rung.get;
    let freeUnits = Math.floor(qty / groupSize) * rung.get;
    if (freeUnits <= 0) continue;
    // Discount the cheapest units first (customer-friendly and predictable).
    const sorted = [...lines].sort((a, b) => unitPrice(a) - unitPrice(b));
    for (const line of sorted) {
      if (freeUnits <= 0) break;
      const take = Math.min(freeUnits, line.quantity);
      freeUnits -= take;
      claimed.add(line.id);
      candidates.push({
        message: pct >= 100 ? `${offer.name} — FREE` : `${offer.name} — ${pct}% off`,
        targets: [{ cartLine: { id: line.id, quantity: take } }],
        value: { percentage: { value: pct } },
      });
    }
  }
}

function evalMixMatch(offer, byProduct, claimed, candidates) {
  const pool = [];
  for (const pid of offer.productIds || []) {
    for (const line of byProduct.get(String(pid)) || []) {
      if (!claimed.has(line.id)) pool.push(line);
    }
  }
  const qty = pool.reduce((s, l) => s + l.quantity, 0);
  // Tiered thresholds (any 2 -> 10%, any 3 -> 20%) with legacy fallback.
  const thresholds = (offer.tiers || [])
    .filter((t) => t.minQty >= 2 && t.v > 0)
    .map((t) => ({ minQty: t.minQty, pct: t.v / 100 }));
  if (!thresholds.length && offer.minQty) {
    thresholds.push({ minQty: offer.minQty, pct: offer.percentOff });
  }
  let best = null;
  for (const th of thresholds) {
    if (qty >= th.minQty && (!best || th.minQty > best.minQty)) best = th;
  }
  if (!best) return;
  for (const line of pool) {
    claimed.add(line.id);
    candidates.push({
      message: `${offer.name} — ${best.pct}% off`,
      targets: [{ cartLine: { id: line.id } }],
      value: { percentage: { value: best.pct } },
    });
  }
}

function evalFreeGift(offer, cart, byProduct, claimed, candidates) {
  // Threshold ladder (300 -> A, 500 -> B, 1000 -> C); highest met tier wins.
  const ladder = (offer.tiers || [])
    .filter((t) => t.t === "THRESHOLD" && t.gift && t.gift.pid)
    .map((t) => ({ thr: t.v, pid: t.gift.pid }));
  if (!ladder.length && offer.giftProductId) {
    ladder.push({ thr: offer.thresholdX100 || 0, pid: offer.giftProductId });
  }
  if (!ladder.length) return;
  // Subtotal excluding every configured gift product's lines.
  const giftPids = new Set(ladder.map((g) => String(g.pid)));
  let giftTotal = 0;
  for (const pid of giftPids) {
    for (const l of byProduct.get(pid) || []) giftTotal += unitPrice(l) * l.quantity;
  }
  const subtotalX100 = Math.round(
    (parseFloat(cart.cost.subtotalAmount.amount) - giftTotal) * 100,
  );
  let best = null;
  for (const g of ladder) {
    if (subtotalX100 >= g.thr && (!best || g.thr > best.thr)) best = g;
  }
  if (!best) return;
  const giftLines = byProduct.get(String(best.pid)) || [];
  const line = giftLines.find((l) => !claimed.has(l.id));
  if (!line) return;
  claimed.add(line.id);
  candidates.push({
    message: `${offer.name} — FREE GIFT`,
    targets: [{ cartLine: { id: line.id, quantity: 1 } }], // only 1 unit is free
    value: { percentage: { value: 100 } },
  });
}

/**
 * @param {{offers?: Array<object>}} config
 * @param {{lines: Array<object>, cost: {subtotalAmount: {amount: string}}}} cart
 * @returns {Array<object>} product discount candidates
 */
export function evaluate(config, cart) {
  const offers = (config && config.offers) || [];
  if (!offers.length || !cart || !cart.lines || !cart.lines.length) return [];
  const byProduct = groupLinesByProduct(cart);
  const claimed = new Set();
  const candidates = [];
  const ordered = [...offers].sort(
    (a, b) => (TYPE_PRIORITY[a.type] ?? 9) - (TYPE_PRIORITY[b.type] ?? 9),
  );
  for (const offer of ordered) {
    if (offer.type === "FREE_GIFT") evalFreeGift(offer, cart, byProduct, claimed, candidates);
    else if (offer.type === "BOGO") evalBogo(offer, byProduct, claimed, candidates);
    else if (offer.type === "QUANTITY_BREAK") evalQuantityBreak(offer, byProduct, claimed, candidates);
    else if (offer.type === "MIX_MATCH") evalMixMatch(offer, byProduct, claimed, candidates);
  }
  return candidates;
}
