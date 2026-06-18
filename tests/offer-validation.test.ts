// CREATE this file at tests/offer-validation.test.ts
// Bundle-creation rules (admin side). Run with: npx vitest run
// NOTE: these tests exercise validation only — they never touch the database.
import { describe, expect, it } from "vitest";
import { saveOffer, type OfferInput } from "../app/models/offer.server";

const base: OfferInput = {
  type: "QUANTITY_BREAK",
  name: "Test",
  status: "DRAFT",
  products: [{ id: "gid://shopify/Product/1", title: "P" }],
  tiers: [{ minQty: 2, discountType: "PERCENTAGE", value: 10 }],
  config: {},
};

// saveOffer validates BEFORE any DB call, so invalid input rejects
// without a database. (Valid-input persistence is covered by using the
// app against the dev store.)
describe("bundle creation validation", () => {
  it("rejects a missing name", async () => {
    await expect(saveOffer({ ...base, name: " " })).rejects.toThrow("Name is required");
  });

  it("rejects an offer with no products", async () => {
    await expect(saveOffer({ ...base, products: [] })).rejects.toThrow("at least one product");
  });

  it("rejects a quantity break with no tiers", async () => {
    await expect(saveOffer({ ...base, tiers: [] })).rejects.toThrow("at least one tier");
  });

  it("rejects a tier above 100%", async () => {
    await expect(
      saveOffer({ ...base, tiers: [{ minQty: 2, discountType: "PERCENTAGE", value: 150 }] }),
    ).rejects.toThrow("Percentage cannot exceed 100");
  });

  it("rejects a tier with quantity 0", async () => {
    await expect(
      saveOffer({ ...base, tiers: [{ minQty: 0, discountType: "PERCENTAGE", value: 10 }] }),
    ).rejects.toThrow("quantity of 1 or more");
  });

  it("rejects BOGO with no tiers", async () => {
    await expect(
      saveOffer({ ...base, type: "BOGO", tiers: [], config: {} }),
    ).rejects.toThrow("add at least one tier");
  });

  it("rejects a BOGO tier without a 'get' quantity", async () => {
    await expect(
      saveOffer({
        ...base,
        type: "BOGO",
        tiers: [{ minQty: 1, discountType: "PERCENTAGE", value: 100 }],
        config: {},
      }),
    ).rejects.toThrow("'Get quantity' must be 1 or more");
  });

  it("rejects a free gift tier without a gift product", async () => {
    await expect(
      saveOffer({
        ...base,
        type: "FREE_GIFT",
        products: [],
        tiers: [{ minQty: 1, discountType: "THRESHOLD", value: 300 }],
        config: {},
      }),
    ).rejects.toThrow("needs a gift product");
  });

  it("rejects mix & match tiers below 2 items", async () => {
    await expect(
      saveOffer({
        ...base,
        type: "MIX_MATCH",
        tiers: [{ minQty: 1, discountType: "PERCENTAGE", value: 20 }],
        config: {},
      }),
    ).rejects.toThrow("must be 2 or more");
  });

  it("rejects an unknown status", async () => {
    await expect(saveOffer({ ...base, status: "LIVE" as never })).rejects.toThrow("Invalid status");
  });
});
