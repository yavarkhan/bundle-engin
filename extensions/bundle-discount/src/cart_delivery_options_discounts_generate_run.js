// CREATE at extensions/bundle-discount/src/cart_delivery_options_discounts_generate_run.js
// Shipping side of the discount: 100% off delivery when a quantity-break
// tier with "free shipping" is reached.

import { hasFreeShipping } from "./evaluate.js";

export function cartDeliveryOptionsDiscountsGenerateRun(input) {
  if (!input.discount.discountClasses.includes("SHIPPING")) {
    return { operations: [] };
  }
  let config = {};
  try {
    config = JSON.parse(input.discount.metafield?.value ?? "{}");
  } catch (e) {
    return { operations: [] };
  }
  if (!hasFreeShipping(config, input.cart)) return { operations: [] };
  const groups = input.cart.deliveryGroups || [];
  if (!groups.length) return { operations: [] };
  return {
    operations: [
      {
        deliveryDiscountsAdd: {
          selectionStrategy: "ALL",
          candidates: groups.map((g) => ({
            message: "FREE SHIPPING",
            targets: [{ deliveryGroup: { id: g.id } }],
            value: { percentage: { value: 100 } },
          })),
        },
      },
    ],
  };
}
