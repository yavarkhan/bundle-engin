// CREATE this file at extensions/bundle-discount/tests/evaluate.test.js
// Run from the app root with:  npx vitest run
import { describe, expect, it } from "vitest";
import { evaluate } from "../src/evaluate.js";
import { cartLinesDiscountsGenerateRun } from "../src/cart_lines_discounts_generate_run.js";

// ── helpers ──────────────────────────────────────────────────────────
let lineCounter = 0;
function line(productId, quantity, unitPrice) {
  lineCounter += 1;
  return {
    id: `gid://shopify/CartLine/${lineCounter}`,
    quantity,
    cost: { amountPerQuantity: { amount: unitPrice.toFixed(2) } },
    merchandise: {
      __typename: "ProductVariant",
      id: `gid://shopify/ProductVariant/${lineCounter}`,
      product: { id: `gid://shopify/Product/${productId}` },
    },
  };
}
function cart(...lines) {
  const subtotal = lines.reduce(
    (s, l) => s + parseFloat(l.cost.amountPerQuantity.amount) * l.quantity,
    0,
  );
  return { lines, cost: { subtotalAmount: { amount: subtotal.toFixed(2) } } };
}
const qbOffer = {
  id: "o1",
  type: "QUANTITY_BREAK",
  name: "Perfume deal",
  productIds: ["111"],
  tiers: [
    { minQty: 2, t: "PERCENTAGE", v: 1000, label: "Buy 2" },
    { minQty: 3, t: "PERCENTAGE", v: 1500, label: "Buy 3" },
    { minQty: 4, t: "PERCENTAGE", v: 2000, label: "Buy 4" },
  ],
};

// ── Quantity break / cart calculations ───────────────────────────────
describe("QUANTITY_BREAK", () => {
  it("applies no discount below the first tier", () => {
    expect(evaluate({ offers: [qbOffer] }, cart(line("111", 1, 199)))).toEqual([]);
  });

  it("applies 10% at qty 2 and 15% at qty 3 (highest tier wins)", () => {
    const two = evaluate({ offers: [qbOffer] }, cart(line("111", 2, 199)));
    expect(two).toHaveLength(1);
    expect(two[0].value.percentage.value).toBe(10);

    const three = evaluate({ offers: [qbOffer] }, cart(line("111", 3, 199)));
    expect(three[0].value.percentage.value).toBe(15);
  });

  it("counts quantity across variants of the same product", () => {
    const res = evaluate(
      { offers: [qbOffer] },
      cart(line("111", 1, 199), line("111", 2, 199)),
    );
    expect(res).toHaveLength(2); // both lines discounted
    expect(res.every((c) => c.value.percentage.value === 15)).toBe(true);
  });

  it("ignores products not in the offer", () => {
    expect(evaluate({ offers: [qbOffer] }, cart(line("999", 5, 50)))).toEqual([]);
  });

  it("computes fixed unit price as a per-item amount delta", () => {
    const offer = {
      ...qbOffer,
      tiers: [{ minQty: 2, t: "FIXED_UNIT_PRICE", v: 17900, label: "Buy 2" }],
    };
    const res = evaluate({ offers: [offer] }, cart(line("111", 2, 199)));
    // AED 199 -> AED 179 each = 20.00 off per item
    expect(res[0].value.fixedAmount).toEqual({ amount: "20.00", appliesToEachItem: true });
  });

  it("never produces a negative discount (fixed price above unit price)", () => {
    const offer = {
      ...qbOffer,
      tiers: [{ minQty: 2, t: "FIXED_UNIT_PRICE", v: 25000, label: "Buy 2" }],
    };
    expect(evaluate({ offers: [offer] }, cart(line("111", 2, 199)))).toEqual([]);
  });

  it("applies fixed amount off per unit", () => {
    const offer = {
      ...qbOffer,
      tiers: [{ minQty: 2, t: "FIXED_AMOUNT", v: 2000, label: "Buy 2" }],
    };
    const res = evaluate({ offers: [offer] }, cart(line("111", 2, 199)));
    expect(res[0].value.fixedAmount).toEqual({ amount: "20.00", appliesToEachItem: true });
  });
});

// ── BOGO ─────────────────────────────────────────────────────────────
describe("BOGO", () => {
  const bogo = {
    id: "o2",
    type: "BOGO",
    name: "B1G1",
    productIds: ["222"],
    buyQty: 1,
    getQty: 1,
    percentOff: 100,
  };

  it("gives 1 free unit when buying 2 (buy 1 get 1)", () => {
    const res = evaluate({ offers: [bogo] }, cart(line("222", 2, 100)));
    expect(res).toHaveLength(1);
    expect(res[0].targets[0].cartLine.quantity).toBe(1);
    expect(res[0].value.percentage.value).toBe(100);
  });

  it("repeats: 4 units -> 2 free", () => {
    const res = evaluate({ offers: [bogo] }, cart(line("222", 4, 100)));
    expect(res[0].targets[0].cartLine.quantity).toBe(2);
  });

  it("gives nothing for a single unit", () => {
    expect(evaluate({ offers: [bogo] }, cart(line("222", 1, 100)))).toEqual([]);
  });

  it("discounts the cheapest variant lines first", () => {
    const cheap = line("222", 1, 50);
    const dear = line("222", 1, 150);
    const res = evaluate({ offers: [bogo] }, cart(dear, cheap));
    expect(res[0].targets[0].cartLine.id).toBe(cheap.id);
  });

  it("supports buy 2 get 1 at 50% off", () => {
    const offer = { ...bogo, buyQty: 2, getQty: 1, percentOff: 50 };
    const res = evaluate({ offers: [offer] }, cart(line("222", 3, 100)));
    expect(res[0].targets[0].cartLine.quantity).toBe(1);
    expect(res[0].value.percentage.value).toBe(50);
  });
});

// ── Free gift ────────────────────────────────────────────────────────
describe("FREE_GIFT", () => {
  const gift = {
    id: "o3",
    type: "FREE_GIFT",
    name: "Spend 300",
    productIds: [],
    giftProductId: "777",
    thresholdX100: 30000,
  };

  it("makes the gift free when subtotal (excluding gift) reaches AED 300", () => {
    const res = evaluate({ offers: [gift] }, cart(line("111", 2, 150), line("777", 1, 49)));
    expect(res).toHaveLength(1);
    expect(res[0].value.percentage.value).toBe(100);
    expect(res[0].targets[0].cartLine.quantity).toBe(1);
  });

  it("does NOT count the gift's own price toward the threshold", () => {
    // 260 of products + 49 gift = 309 subtotal, but only 260 counts -> no discount
    const res = evaluate({ offers: [gift] }, cart(line("111", 1, 260), line("777", 1, 49)));
    expect(res).toEqual([]);
  });

  it("does nothing when the gift is not in the cart", () => {
    expect(evaluate({ offers: [gift] }, cart(line("111", 3, 150)))).toEqual([]);
  });

  it("only ever makes ONE gift unit free", () => {
    const res = evaluate({ offers: [gift] }, cart(line("111", 3, 150), line("777", 3, 49)));
    expect(res[0].targets[0].cartLine.quantity).toBe(1);
  });
});

// ── Mix & Match ──────────────────────────────────────────────────────
describe("MIX_MATCH", () => {
  const mm = {
    id: "o4",
    type: "MIX_MATCH",
    name: "Any 3",
    productIds: ["301", "302", "303"],
    minQty: 3,
    percentOff: 20,
  };

  it("applies 20% across the pool when any 3 are picked", () => {
    const res = evaluate(
      { offers: [mm] },
      cart(line("301", 1, 80), line("302", 1, 90), line("303", 1, 100)),
    );
    expect(res).toHaveLength(3);
    expect(res.every((c) => c.value.percentage.value === 20)).toBe(true);
  });

  it("counts multiple units of one pool product", () => {
    const res = evaluate({ offers: [mm] }, cart(line("301", 2, 80), line("302", 1, 90)));
    expect(res).toHaveLength(2);
  });

  it("does nothing below the minimum", () => {
    expect(evaluate({ offers: [mm] }, cart(line("301", 2, 80)))).toEqual([]);
  });
});

// ── Stacking protection ──────────────────────────────────────────────
describe("offer stacking", () => {
  it("never applies two offers to the same line (BOGO beats quantity break)", () => {
    const both = {
      offers: [qbOffer, { id: "x", type: "BOGO", name: "B1G1", productIds: ["111"], buyQty: 1, getQty: 1, percentOff: 100 }],
    };
    const res = evaluate(both, cart(line("111", 2, 199)));
    expect(res).toHaveLength(1);
    expect(res[0].value.percentage.value).toBe(100); // BOGO won, no 10% on top
  });
});

// ── Checkout entrypoint (what Shopify actually calls) ────────────────
describe("cartLinesDiscountsGenerateRun", () => {
  const baseInput = (metafieldValue, classes = ["PRODUCT"]) => ({
    cart: cart(line("111", 2, 199)),
    discount: {
      discountClasses: classes,
      metafield: metafieldValue === undefined ? null : { value: metafieldValue },
    },
  });

  it("returns a single productDiscountsAdd operation", () => {
    const out = cartLinesDiscountsGenerateRun(baseInput(JSON.stringify({ offers: [qbOffer] })));
    expect(out.operations).toHaveLength(1);
    expect(out.operations[0].productDiscountsAdd.selectionStrategy).toBe("ALL");
    expect(out.operations[0].productDiscountsAdd.candidates).toHaveLength(1);
  });

  it("returns no operations when PRODUCT class is missing", () => {
    const out = cartLinesDiscountsGenerateRun(
      baseInput(JSON.stringify({ offers: [qbOffer] }), ["ORDER"]),
    );
    expect(out.operations).toEqual([]);
  });

  it("survives a missing metafield", () => {
    expect(cartLinesDiscountsGenerateRun(baseInput(undefined)).operations).toEqual([]);
  });

  it("survives corrupted JSON without throwing (checkout must never break)", () => {
    expect(cartLinesDiscountsGenerateRun(baseInput("{not json")).operations).toEqual([]);
  });
});
