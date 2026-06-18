// CREATE this file at app/models/offer.server.ts
// CRUD for offers + compiler that turns DB rows into the small JSON blob
// read by both the storefront widget (shop metafield) and the
// discount Function (discount metafield).

import prisma from "../db.server";

export type TierInput = {
  minQty: number;
  discountType: "NONE" | "PERCENTAGE" | "FIXED_AMOUNT" | "FIXED_UNIT_PRICE" | "THRESHOLD";
  /** Human value: 10 = 10%, 179 = AED 179.00 (or threshold 300). x100 in DB. */
  value: number;
  /** BOGO only: the Y quantity */
  getQty?: number;
  badge?: string;
  preselected?: boolean;
  title?: string;
  subtitle?: string;
  labelText?: string;
  imageUrl?: string;
  freeShipping?: boolean;
  giftProductId?: string;
  giftVariantId?: string;
  giftTitle?: string;
  /** "Complete the bundle" cross-sell — extra product(s) added at full price (no discount). */
  bundleProducts?: { productId: string; variantId?: string; title: string; handle?: string }[];
};

export type OfferType = "QUANTITY_BREAK" | "BOGO" | "FREE_GIFT" | "MIX_MATCH";

export type OfferConfig = {
  /** BOGO */
  buyQty?: number;
  getQty?: number;
  percentOff?: number; // BOGO (100 = free) and MIX_MATCH
  /** BOGO presentation (all optional) */
  title?: string; // "Buy 2, get 1 FREE"
  subtitle?: string; // "2 Smart Correctors, Free shipping"
  badge?: string; // "Todays Special Deal"
  /** FREE_GIFT */
  thresholdX100?: number; // AED 300.00 -> 30000
  giftProductId?: string; // gid://shopify/Product/...
  giftVariantId?: string; // numeric variant id, used by the cart auto-add script
  giftTitle?: string;
  /** MIX_MATCH */
  minQty?: number;
  /** Add-on upsells (shipping protection, warranty, …) — any offer type */
  addons?: {
    id: string;
    variantId: string;
    title: string;
    handle?: string;
    preselected?: boolean;
  }[];
};

export type OfferInput = {
  id?: string;
  type: OfferType;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED";
  products: { id: string; title: string }[];
  tiers: TierInput[];
  config: OfferConfig;
};

export async function listOffers() {
  return prisma.offer.findMany({
    include: { tiers: { orderBy: { position: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getOffer(id: string) {
  return prisma.offer.findUnique({
    where: { id },
    include: { tiers: { orderBy: { position: "asc" } } },
  });
}

export async function deleteOffer(id: string) {
  await prisma.offer.delete({ where: { id } });
}

export async function deleteOffers(ids: string[]) {
  await prisma.offer.deleteMany({ where: { id: { in: ids } } });
}

export async function setOfferStatus(id: string, status: "ACTIVE" | "PAUSED") {
  return prisma.offer.update({ where: { id }, data: { status } });
}

/** Copies an offer (tiers included) as a DRAFT named "<name> (copy)". */
export async function duplicateOffer(id: string) {
  const source = await prisma.offer.findUnique({
    where: { id },
    include: { tiers: { orderBy: { position: "asc" } } },
  });
  if (!source) throw new Error("Offer not found.");
  return prisma.offer.create({
    data: {
      type: source.type,
      name: `${source.name} (copy)`,
      status: "DRAFT",
      productsJson: source.productsJson,
      configJson: source.configJson,
      tiers: {
        create: source.tiers.map((t) => ({
          position: t.position,
          minQty: t.minQty,
          discountType: t.discountType,
          getQty: t.getQty,
          valueX100: t.valueX100,
          badge: t.badge,
          preselected: t.preselected,
          title: t.title,
          subtitle: t.subtitle,
          labelText: t.labelText,
          imageUrl: t.imageUrl,
          freeShipping: t.freeShipping,
          giftProductId: t.giftProductId,
          giftVariantId: t.giftVariantId,
          giftTitle: t.giftTitle,
          bundleProductsJson: t.bundleProductsJson,
        })),
      },
    },
  });
}

/**
 * One product may only belong to ONE ACTIVE offer. Drafts/paused offers may
 * overlap (so duplicates are allowed until you activate them).
 */
async function assertProductsNotInOtherActiveOffer(input: OfferInput) {
  if (input.status !== "ACTIVE" || !input.products.length) return;
  const others = await prisma.offer.findMany({
    where: { status: "ACTIVE", ...(input.id ? { id: { not: input.id } } : {}) },
    select: { name: true, productsJson: true },
  });
  const mine = new Set(input.products.map((p) => p.id));
  for (const other of others) {
    const theirs = JSON.parse(other.productsJson) as { id: string; title: string }[];
    const clash = theirs.find((p) => mine.has(p.id));
    if (clash) {
      throw new Error(
        `"${clash.title}" is already in the active offer "${other.name}". ` +
          `One product can only be in one active offer — pause or edit that offer first.`,
      );
    }
  }
}

function validate(input: OfferInput) {
  if (!input.name?.trim()) throw new Error("Name is required.");
  if (!["DRAFT", "ACTIVE", "PAUSED"].includes(input.status))
    throw new Error("Invalid status.");
  if (!["QUANTITY_BREAK", "BOGO", "FREE_GIFT", "MIX_MATCH"].includes(input.type))
    throw new Error("Invalid offer type.");
  if (
    input.type !== "FREE_GIFT" &&
    (!Array.isArray(input.products) || input.products.length === 0)
  )
    throw new Error("Select at least one product.");

  if (input.type === "QUANTITY_BREAK") {
    if (!Array.isArray(input.tiers) || input.tiers.length === 0)
      throw new Error("Add at least one tier.");
    for (const t of input.tiers) {
      if (!Number.isInteger(t.minQty) || t.minQty < 1)
        throw new Error("Each tier needs a quantity of 1 or more.");
      if (!["NONE", "PERCENTAGE", "FIXED_AMOUNT", "FIXED_UNIT_PRICE"].includes(t.discountType))
        throw new Error("Invalid discount type.");
      if (t.discountType !== "NONE") {
        if (!(t.value > 0)) throw new Error("Each tier needs a value greater than 0.");
        if (t.discountType === "PERCENTAGE" && t.value > 100)
          throw new Error("Percentage cannot exceed 100.");
      }
    }
  }
  if (input.type === "BOGO") {
    if (!Array.isArray(input.tiers) || input.tiers.length === 0)
      throw new Error("BOGO: add at least one tier (e.g. Buy 1 Get 1).");
    for (const t of input.tiers) {
      if (!Number.isInteger(t.minQty) || t.minQty < 1)
        throw new Error("BOGO: 'Buy quantity' must be 1 or more.");
      if (!Number.isInteger(t.getQty) || (t.getQty as number) < 1)
        throw new Error("BOGO: 'Get quantity' must be 1 or more.");
      if (!(t.value > 0) || t.value > 100)
        throw new Error("BOGO: percent off must be between 1 and 100.");
    }
  }
  if (input.type === "FREE_GIFT") {
    if (!Array.isArray(input.tiers) || input.tiers.length === 0)
      throw new Error("Free gift: add at least one threshold tier.");
    for (const t of input.tiers) {
      if (!(t.value > 0))
        throw new Error("Free gift: each tier needs a spend threshold greater than 0.");
      if (!t.giftProductId)
        throw new Error("Free gift: each tier needs a gift product.");
    }
  }
  if (input.type === "MIX_MATCH") {
    if (!Array.isArray(input.tiers) || input.tiers.length === 0)
      throw new Error("Mix & Match: add at least one tier.");
    for (const t of input.tiers) {
      if (!Number.isInteger(t.minQty) || t.minQty < 2)
        throw new Error("Mix & Match: minimum quantity must be 2 or more.");
      if (!(t.value > 0) || t.value > 100)
        throw new Error("Mix & Match: percent off must be between 1 and 100.");
    }
  }
}

export async function saveOffer(input: OfferInput) {
  validate(input);
  await assertProductsNotInOtherActiveOffer(input);
  const data = {
    type: input.type,
    name: input.name.trim(),
    status: input.status,
    productsJson: JSON.stringify(input.products),
    configJson: JSON.stringify(input.config ?? {}),
  };
  const tiersData = [...input.tiers]
    .sort((a, b) => a.minQty - b.minQty || a.value - b.value)
    .map((t, i) => ({
      position: i,
      minQty: t.minQty || 1,
      discountType: t.discountType,
      getQty: t.getQty ?? null,
      valueX100: t.discountType === "NONE" ? 0 : Math.round(t.value * 100),
      badge: t.badge?.trim() || null,
      preselected: Boolean(t.preselected),
      title: t.title?.trim() || null,
      subtitle: t.subtitle?.trim() || null,
      labelText: t.labelText?.trim() || null,
      imageUrl: t.imageUrl?.trim() || null,
      freeShipping: Boolean(t.freeShipping),
      giftProductId: t.giftProductId || null,
      giftVariantId: t.giftVariantId || null,
      giftTitle: t.giftTitle?.trim() || null,
      bundleProductsJson: JSON.stringify(t.bundleProducts ?? []),
    }));

  if (input.id) {
    return prisma.offer.update({
      where: { id: input.id },
      data: { ...data, tiers: { deleteMany: {}, create: tiersData } },
      include: { tiers: true },
    });
  }
  return prisma.offer.create({
    data: { ...data, tiers: { create: tiersData } },
    include: { tiers: true },
  });
}

/**
 * Compiled config shape (kept tiny — it is parsed inside the Function):
 * {
 *   "version": 1,
 *   "offers": [{
 *     "id": "...", "type": "QUANTITY_BREAK",
 *     "productIds": ["8723459342"],            // numeric ids as strings
 *     "tiers": [{ "minQty": 2, "t": "PERCENTAGE", "v": 1000,
 *                 "badge": "MOST POPULAR", "pre": true, "label": "Buy 2" }]
 *   }]
 * }
 */
export async function compileActiveConfig() {
  const offers = await prisma.offer.findMany({
    where: { status: "ACTIVE" },
    include: { tiers: { orderBy: { position: "asc" } } },
  });
  return {
    version: 1,
    offers: offers.map((o) => {
      const config = JSON.parse(o.configJson) as OfferConfig;
      const parsedProducts = JSON.parse(o.productsJson) as {
        id: string;
        title: string;
        handle?: string;
      }[];
      return {
        id: o.id,
        type: o.type,
        name: o.name,
        productIds: parsedProducts.map((p) => p.id.split("/").pop() as string),
        // Product handles let the widget render product cards (images, prices,
        // variants) for "Complete the bundle" — Liquid can only look up by handle.
        handles: parsedProducts.map((p) => p.handle).filter(Boolean),
        tiers: o.tiers.map((t) => ({
          minQty: t.minQty,
          t: t.discountType,
          v: t.valueX100,
          get: t.getQty ?? undefined, // BOGO: Y quantity
          badge: t.badge ?? undefined,
          pre: t.preselected || undefined,
          label:
            t.title ||
            (o.type === "BOGO"
              ? t.valueX100 >= 10000
                ? `Buy ${t.minQty}, get ${t.getQty} FREE`
                : `Buy ${t.minQty}, get ${t.getQty} at ${t.valueX100 / 100}% off`
              : o.type === "MIX_MATCH"
                ? `Any ${t.minQty} — ${t.valueX100 / 100}% off`
                : `Buy ${t.minQty}`),
          sub: t.subtitle ?? undefined,
          chip: t.labelText ?? undefined,
          img: t.imageUrl ?? undefined,
          fs: t.freeShipping || undefined,
          gift: t.giftProductId
            ? {
                pid: t.giftProductId.split("/").pop(),
                vid: t.giftVariantId?.split("/").pop(),
                title: t.giftTitle ?? "Free gift",
              }
            : undefined,
          // "Complete the bundle" cross-sell — extra product(s) at full price.
          bundle: (() => {
            try {
              const list = JSON.parse(t.bundleProductsJson || "[]") as {
                productId: string;
                variantId?: string;
                title: string;
                handle?: string;
              }[];
              if (!list.length) return undefined;
              return list
                .filter((b) => b.handle)
                .map((b) => ({
                  h: b.handle,
                  vid: b.variantId?.split("/").pop(),
                  t: b.title,
                }));
            } catch {
              return undefined;
            }
          })(),
        })),
        // Legacy single-value fields (derived from the first tier when tiers
        // exist) — keep the widget, watcher and old configs working.
        buyQty: o.tiers[0]?.getQty != null ? o.tiers[0].minQty : config.buyQty,
        getQty: o.tiers[0]?.getQty ?? config.getQty,
        percentOff:
          o.type === "BOGO" || o.type === "MIX_MATCH"
            ? o.tiers[0]
              ? o.tiers[0].valueX100 / 100
              : config.percentOff
            : config.percentOff,
        title: config.title || undefined,
        sub: config.subtitle || undefined,
        badge: config.badge || undefined,
        // FREE_GIFT legacy fields (first threshold tier)
        thresholdX100:
          o.type === "FREE_GIFT" && o.tiers[0]
            ? o.tiers[0].valueX100
            : config.thresholdX100,
        giftProductId:
          (o.type === "FREE_GIFT" && o.tiers[0]?.giftProductId?.split("/").pop()) ||
          config.giftProductId?.split("/").pop(),
        giftVariantId:
          (o.type === "FREE_GIFT" && o.tiers[0]?.giftVariantId?.split("/").pop()) ||
          config.giftVariantId?.split("/").pop(),
        giftTitle:
          (o.type === "FREE_GIFT" && o.tiers[0]?.giftTitle) || config.giftTitle,
        // MIX_MATCH legacy field
        minQty: o.type === "MIX_MATCH" && o.tiers[0] ? o.tiers[0].minQty : config.minQty,
        // Add-on upsells (numeric variant id + handle for Liquid lookup)
        addons: config.addons?.map((a) => ({
          vid: a.variantId.split("/").pop(),
          h: a.handle,
          t: a.title,
          pre: a.preselected || undefined,
        })),
      };
    }),
  };
}
