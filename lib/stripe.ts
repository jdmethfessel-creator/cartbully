import Stripe from "stripe";

let stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!stripe) {
    // Rely on library default apiVersion so we don't churn on Stripe SDK bumps.
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

export function stripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PRICE_ID &&
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  );
}
