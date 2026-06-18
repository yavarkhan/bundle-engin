// REPLACES src/cart_lines_discounts_generate_run.js in the generated extension.
// Thin wrapper: parse the metafield config, delegate to the pure evaluator.

import { evaluate } from "./evaluate.js";

/**
 * @param {*} input - CartLinesDiscountsGenerateRun input (see .graphql query)
 */
export function cartLinesDiscountsGenerateRun(input) {
  if (!input.discount.discountClasses.includes("PRODUCT")) {
    return { operations: [] };
  }
  let config = {};
  try {
    config = JSON.parse(input.discount.metafield?.value ?? "{}");
  } catch (e) {
    return { operations: [] }; // bad config must never break checkout
  }
  const candidates = evaluate(config, input.cart);
  if (!candidates.length) return { operations: [] };
  return {
    operations: [
      {
        productDiscountsAdd: {
          selectionStrategy: "ALL",
          candidates,
        },
      },
    ],
  };
}
