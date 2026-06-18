// CREATE this file at app/models/shopify-sync.server.ts
// Pushes the compiled offer config to Shopify:
//   1. ensures ONE automatic app discount exists (backed by our Function)
//   2. writes the config JSON to a metafield on that discount (Function input)
//   3. writes the same JSON to a shop metafield (read by the Liquid widget)
//
// `admin` is the GraphQL client from `authenticate.admin(request)`.

import prisma from "../db.server";
import { compileActiveConfig } from "./offer.server";

const NAMESPACE = "bundle_engine";
const DISCOUNT_TITLE = "Bundle Engine";
const SETTING_KEY = "discountGid";

type AdminClient = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

async function gql<T = any>(
  admin: AdminClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await admin.graphql(query, variables ? { variables } : undefined);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data as T;
}

async function findFunctionId(admin: AdminClient): Promise<string> {
  const data = await gql(
    admin,
    `#graphql
    query {
      shopifyFunctions(first: 50) {
        nodes { id apiType title }
      }
    }`,
  );
  const fn = data.shopifyFunctions.nodes.find(
    (n: { apiType: string; title: string }) =>
      n.apiType === "discount" && n.title.includes("bundle-discount"),
  ) ?? data.shopifyFunctions.nodes.find((n: { apiType: string }) => n.apiType === "discount");
  if (!fn) {
    throw new Error(
      "Discount function not found. Run `shopify app deploy` (or `shopify app dev`) so the bundle-discount function is registered, then save again.",
    );
  }
  return fn.id;
}

/** True when the discount node still exists in Shopify (it may have been
 *  deleted manually in the admin — we must then recreate, not reuse). */
async function discountExists(admin: AdminClient, gid: string): Promise<boolean> {
  try {
    const data = await gql(
      admin,
      `#graphql
      query DiscountExists($id: ID!) {
        node(id: $id) { id }
      }`,
      { id: gid },
    );
    return Boolean(data.node?.id);
  } catch {
    return false;
  }
}

async function ensureDiscount(admin: AdminClient, configJson: string): Promise<string> {
  let existing = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  if (existing && !(await discountExists(admin, existing.value))) {
    // Stale reference (discount was deleted in the Shopify admin) — forget it.
    await prisma.setting.delete({ where: { key: SETTING_KEY } });
    existing = null;
  }
  if (existing) {
    // Keep the main node PRODUCT-only: multi-class discounts are not
    // evaluated on the storefront cart page (shipping lives on its own node).
    await gql(
      admin,
      `#graphql
      mutation UpdateClasses($id: ID!, $discount: DiscountAutomaticAppInput!) {
        discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $discount) {
          userErrors { field message }
        }
      }`,
      { id: existing.value, discount: { discountClasses: ["PRODUCT"] } },
    ).catch(() => null);
    return existing.value;
  }

  const functionId = await findFunctionId(admin);
  const data = await gql(
    admin,
    `#graphql
    mutation CreateBundleDiscount($discount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $discount) {
        automaticAppDiscount { discountId }
        userErrors { field message }
      }
    }`,
    {
      discount: {
        title: DISCOUNT_TITLE,
        functionId,
        startsAt: "2024-01-01T00:00:00Z",
        discountClasses: ["PRODUCT"],
        combinesWith: {
          orderDiscounts: true,
          productDiscounts: false,
          shippingDiscounts: true,
        },
        metafields: [
          { namespace: NAMESPACE, key: "config", type: "json", value: configJson },
        ],
      },
    },
  );
  const errs = data.discountAutomaticAppCreate.userErrors;
  if (errs?.length) throw new Error(errs.map((e: any) => e.message).join("; "));
  const gid = data.discountAutomaticAppCreate.automaticAppDiscount.discountId as string;
  await prisma.setting.create({ data: { key: SETTING_KEY, value: gid } });
  return gid;
}

async function getShopId(admin: AdminClient): Promise<string> {
  const data = await gql(admin, `#graphql\n    query { shop { id } }`);
  return data.shop.id as string;
}

async function setMetafields(
  admin: AdminClient,
  metafields: { ownerId: string; key: string; value: string }[],
) {
  const data = await gql(
    admin,
    `#graphql
    mutation SetConfig($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message }
      }
    }`,
    {
      metafields: metafields.map((m) => ({
        ownerId: m.ownerId,
        namespace: NAMESPACE,
        key: m.key,
        type: "json",
        value: m.value,
      })),
    },
  );
  const errs = data.metafieldsSet.userErrors;
  if (errs?.length) throw new Error(errs.map((e: any) => e.message).join("; "));
}

const SHIPPING_SETTING_KEY = "shippingDiscountGid";

/** Separate SHIPPING-class node so the main node stays cart-visible. */
async function ensureShippingDiscount(
  admin: AdminClient,
  configJson: string,
): Promise<string | null> {
  let existing = await prisma.setting.findUnique({ where: { key: SHIPPING_SETTING_KEY } });
  if (existing && !(await discountExists(admin, existing.value))) {
    await prisma.setting.delete({ where: { key: SHIPPING_SETTING_KEY } });
    existing = null;
  }
  if (existing) return existing.value;
  const functionId = await findFunctionId(admin);
  const data = await gql(
    admin,
    `#graphql
    mutation CreateShippingDiscount($discount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $discount) {
        automaticAppDiscount { discountId }
        userErrors { field message }
      }
    }`,
    {
      discount: {
        title: `${DISCOUNT_TITLE} — Shipping`,
        functionId,
        startsAt: "2024-01-01T00:00:00Z",
        discountClasses: ["SHIPPING"],
        combinesWith: {
          orderDiscounts: true,
          productDiscounts: true,
          shippingDiscounts: false,
        },
        metafields: [
          { namespace: NAMESPACE, key: "config", type: "json", value: configJson },
        ],
      },
    },
  );
  const errs = data.discountAutomaticAppCreate.userErrors;
  if (errs?.length) throw new Error(errs.map((e: any) => e.message).join("; "));
  const gid = data.discountAutomaticAppCreate.automaticAppDiscount.discountId as string;
  await prisma.setting.create({ data: { key: SHIPPING_SETTING_KEY, value: gid } });
  return gid;
}

/** Call after every offer save/delete/status change. */
export async function syncToShopify(admin: AdminClient) {
  const config = await compileActiveConfig();
  const json = JSON.stringify(config);
  const discountGid = await ensureDiscount(admin, json);
  const shopGid = await getShopId(admin);

  const metafields = [
    { ownerId: discountGid, key: "config", value: json },
    { ownerId: shopGid, key: "offers", value: json },
  ];

  // Only create/refresh the shipping node when some tier grants free shipping.
  const needsShipping = config.offers.some((o: any) =>
    (o.tiers || []).some((t: any) => t.fs),
  );
  const existingShipping = await prisma.setting.findUnique({
    where: { key: SHIPPING_SETTING_KEY },
  });
  if (needsShipping) {
    const shippingGid = await ensureShippingDiscount(admin, json);
    if (shippingGid) {
      metafields.push({ ownerId: shippingGid, key: "config", value: json });
    }
  } else if (existingShipping && (await discountExists(admin, existingShipping.value))) {
    metafields.push({ ownerId: existingShipping.value, key: "config", value: json });
  }

  await setMetafields(admin, metafields);
  return config;
}
