/**
 * One-time Stripe setup script.
 * Creates billing meters, products, and metered prices.
 * Run: npx tsx scripts/stripe-setup.ts
 *
 * Copy the output IDs into your .env file.
 */

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY is required. Set it in your environment.");
  process.exit(1);
}

const stripe = new Stripe(key, { typescript: true });

async function main() {
  console.log("Setting up Stripe billing resources...\n");

  // 1. Create Billing Meters
  const situationMeter = await stripe.billing.meters.create({
    display_name: "Qorpera Situation Billing",
    event_name: "situation_billing",
    default_aggregation: { formula: "sum" },
    value_settings: { event_payload_key: "amount_cents" },
  });
  console.log(`✓ Situation meter created: ${situationMeter.id}`);
  console.log(`  event_name: situation_billing`);

  const copilotMeter = await stripe.billing.meters.create({
    display_name: "Qorpera Copilot Billing",
    event_name: "copilot_billing",
    default_aggregation: { formula: "sum" },
    value_settings: { event_payload_key: "amount_cents" },
  });
  console.log(`✓ Copilot meter created: ${copilotMeter.id}`);
  console.log(`  event_name: copilot_billing\n`);

  // 2. Create Products
  const situationProduct = await stripe.products.create({
    name: "Qorpera Situations",
    description: "AI-powered situation detection, reasoning, and orchestrated action",
  });
  console.log(`✓ Situation product created: ${situationProduct.id}`);

  const copilotProduct = await stripe.products.create({
    name: "Qorpera Copilot",
    description: "AI copilot conversations with tool-augmented responses",
  });
  console.log(`✓ Copilot product created: ${copilotProduct.id}\n`);

  // 3. Create Metered Prices (per-unit, USD, linked to meters)
  const situationPrice = await stripe.prices.create({
    product: situationProduct.id,
    currency: "usd",
    billing_scheme: "per_unit",
    unit_amount: 1, // 1 cent per unit (value is already in cents)
    recurring: {
      interval: "month",
      usage_type: "metered",
      meter: situationMeter.id,
    },
  });
  console.log(`✓ Situation price created: ${situationPrice.id}`);

  const copilotPrice = await stripe.prices.create({
    product: copilotProduct.id,
    currency: "usd",
    billing_scheme: "per_unit",
    unit_amount: 1, // 1 cent per unit
    recurring: {
      interval: "month",
      usage_type: "metered",
      meter: copilotMeter.id,
    },
  });
  console.log(`✓ Copilot price created: ${copilotPrice.id}\n`);

  // Output env vars
  console.log("Add these to your .env:\n");
  console.log(`STRIPE_SITUATION_PRICE_ID=${situationPrice.id}`);
  console.log(`STRIPE_COPILOT_PRICE_ID=${copilotPrice.id}`);
  console.log(`STRIPE_SITUATION_METER_EVENT=situation_billing`);
  console.log(`STRIPE_COPILOT_METER_EVENT=copilot_billing`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
