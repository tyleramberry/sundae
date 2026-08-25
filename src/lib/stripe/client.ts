import Stripe from "stripe";

// Stripe SDK client. Instantiated lazily so importing this module in tests
// or unused server files doesn't crash on a missing key — callers that
// actually charge or verify webhooks still fail closed via getStripe().
let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add a Stripe secret key to the environment to use billing.",
    );
  }

  if (!stripe) {
    // Omit apiVersion so the SDK uses its packaged latest (currently
    // 2026-07-29.dahlia). Pinning 2025-04-30.basil is rejected by this
    // package's types.
    stripe = new Stripe(key);
  }

  return stripe;
}
