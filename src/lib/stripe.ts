import Stripe from "stripe";

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-04-30.basil",
      typescript: true,
    })
  : null;

export function isStripeEnabled(): boolean {
  return stripe !== null;
}
