// Central tunables. Everything the product manager might want to nudge lives here.
export const PRICING = {
  amount: 4.99,
  interval: "week" as const,
  display: "$4.99 a week",
};

export const FREE_BEATDOWNS = 3;

// Locker alert thresholds. Both must be met for a drop to trigger an email.
export const SALE_DROP_PERCENT = 15;
export const SALE_DROP_MIN_DOLLARS = 10;

// Detention cooldown after a user chooses to sit on an item instead of buying.
export const DETENTION_HOURS = 48;

// Meanness knob for the bully voice. Free users get default only.
export type Meanness = "mild" | "medium" | "merciless";
export const MEANNESS_DEFAULT: Meanness = "medium";

// Rebuttal is a one-shot. If the model still stands its ground, verdict is final.
export const REBUTTAL_LIMIT_PER_VERDICT = 1;

// Verdict cache TTL. Same URL + meanness within this window returns cached.
export const VERDICT_CACHE_HOURS = 24 * 7;

// Anthropic model. Locked to the verdict engine, tune here.
export const VERDICT_MODEL = "claude-sonnet-4-6";
export const VERDICT_MAX_TOKENS = 700;

// Share footer used on every /b/[id] page and generated card.
export const SHARE_FOOTER = "It picks on your cart, not you.";

// Wordmark helpers so the marker-red BULLY stays consistent.
export const WORDMARK = { left: "CART", right: "BULLY" };
