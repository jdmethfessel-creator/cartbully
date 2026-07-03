import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  MEANNESS_DEFAULT,
  Meanness,
  VERDICT_MAX_TOKENS,
  VERDICT_MODEL,
} from "@/config";

export type VerdictLabel = "TRASHED" | "SPARED";
export type Grade = "A" | "B+" | "B" | "C" | "D" | "F";

export const verdictSchema = z.object({
  verdict: z.union([z.literal("TRASHED"), z.literal("SPARED")]),
  grade: z.union([
    z.literal("A"),
    z.literal("B+"),
    z.literal("B"),
    z.literal("C"),
    z.literal("D"),
    z.literal("F"),
  ]),
  roast: z.string().max(240),
  math: z.object({
    est_uses_per_year: z.number(),
    cost_per_use: z.string(),
    note: z.string(),
  }),
  category: z.string(),
  swap: z
    .object({
      name: z.string(),
      reason: z.string(),
      est_price: z.number().nullable().optional(),
    })
    .nullable(),
});
export type VerdictJson = z.infer<typeof verdictSchema>;

export type VerdictInput = {
  title: string;
  price: number;
  domain: string;
  localHour: number;
  repeatCount: number;
  meanness?: Meanness;
  userNote?: string | null;
  isRebuttal?: boolean;
  priorVerdict?: VerdictJson | null;
  rebuttalText?: string | null;
};

const SYSTEM_PROMPT = `You are CartBully, an old-school notebook-scribbling schoolyard bully with one job: judge shopping-cart items and roast the habit behind them.

VOICE
- PG-13, funny, blunt, affectionate menace. Never cruel about the person's body, income, or intelligence.
- No profanity. No slurs. Never insult a person for being poor, broke, fat, ugly, stupid, or their family.
- Roast the purchase, the pattern, the habit. Not the person. Punch at the cart, not the shopper.
- Never use em dashes. Use commas, periods, or parentheses.

VERDICT LOGIC
- TRASHED: impulse buys, duplicate-category items, late-night doomscroll purchases, trend items with short lifespan, gimmicks, items with clear cheaper equivalents, repeat visits to the same non-essential item.
- SPARED: genuine replacements for something broken, consumables the user actually uses (soap, coffee, contact lenses), reasonably priced upgrades to daily-driver tools, gifts with clear intent, items where the math clearly checks out.
- Grade F or D for TRASHED, A or B for SPARED, C is the fence and should be rare. Pair the grade with the verdict, don't contradict.

MATH RULES
- All numbers are estimates. Note field must say something like "napkin math, obviously" or "guesstimate". Never say "based on data" or reference sources you don't have.
- est_uses_per_year is a plausible integer. cost_per_use is a short string like "$1.87 a use" using price / est_uses_per_year.
- If repeat visits are high or hour is late, work it into the roast, not the math.

SWAPS
- Only include a swap if a well known, functionally equivalent cheaper alternative genuinely exists (generic vs brand, direct-to-consumer version, older model, secondhand, dupe). If nothing obvious exists, swap must be null.
- Never invent brand names. Use generic descriptors when unsure ("any pharmacy retinol", "a $40 slow cooker at Target").
- Never claim price history, reviews, discounts, deals, coupons, or savings you don't have.

REBUTTALS
- If the user is fighting back, respond once in character, then hold the verdict. Don't flip your call on excuses.

MEANNESS DIAL
- mild: teasing older-cousin tone
- medium: blunt, mildly menacing schoolyard tone
- merciless: scorched earth but still PG-13, no profanity, no personal attacks

OUTPUT
- Return STRICT JSON only, no prose, no code fences, no comments, matching this shape:
{"verdict":"TRASHED|SPARED","grade":"A|B+|B|C|D|F","roast":"...","math":{"est_uses_per_year":N,"cost_per_use":"$X a use","note":"..."},"category":"...","swap":null|{"name":"...","reason":"...","est_price":N|null}}`;

function userPrompt(input: VerdictInput): string {
  const parts = [
    `Product: ${input.title}`,
    `Price: $${input.price.toFixed(2)}`,
    `Domain: ${input.domain}`,
    `Local hour (0-23): ${input.localHour}`,
    `Times this exact product has been looked at by this user: ${input.repeatCount}`,
    `Meanness: ${input.meanness ?? MEANNESS_DEFAULT}`,
  ];
  if (input.userNote) parts.push(`User note: ${input.userNote}`);
  if (input.isRebuttal && input.priorVerdict) {
    parts.push(
      `Prior verdict was ${input.priorVerdict.verdict} with roast: "${input.priorVerdict.roast}"`
    );
    parts.push(`User rebuttal: ${input.rebuttalText || ""}`);
    parts.push(
      "Respond in-character with a comeback that still holds the verdict. Return the same JSON shape."
    );
  }
  return parts.join("\n");
}

export async function runVerdict(input: VerdictInput): Promise<VerdictJson> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("verdict: no ANTHROPIC_API_KEY, using stub");
    return stubVerdict(input);
  }
  const client = new Anthropic({ apiKey });
  let res;
  try {
    res = await client.messages.create({
      model: VERDICT_MODEL,
      max_tokens: VERDICT_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt(input) }],
    });
  } catch (err) {
    console.log("verdict: anthropic error", (err as Error).message);
    return stubVerdict(input);
  }
  const text = res.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim();
  const cleaned = stripFences(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.log("verdict: JSON parse failed. raw=", text.slice(0, 200));
    return stubVerdict(input);
  }
  const check = verdictSchema.safeParse(parsed);
  if (!check.success) {
    console.log("verdict: schema fail", check.error.message.slice(0, 200));
    return stubVerdict(input);
  }
  return check.data;
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

// Zero-env stub so the app runs cold. Not meant to be clever, just present.
export function stubVerdict(input: VerdictInput): VerdictJson {
  const trashed = input.repeatCount >= 2 || input.localHour >= 22 || input.localHour < 5;
  const uses = trashed ? 6 : 60;
  const cost = uses > 0 ? input.price / uses : input.price;
  return {
    verdict: trashed ? "TRASHED" : "SPARED",
    grade: trashed ? "F" : "B",
    roast: trashed
      ? "Back at this again? Put the phone down and go drink some water."
      : "Fine. This one is actually useful. Don't get cocky.",
    math: {
      est_uses_per_year: uses,
      cost_per_use: `$${cost.toFixed(2)} a use`,
      note: "napkin math, obviously",
    },
    category: "misc",
    swap: null,
  };
}

export function amazonSearchUrl(query: string, tag?: string | null): string {
  const q = encodeURIComponent(query);
  const base = `https://www.amazon.com/s?k=${q}`;
  return tag ? `${base}&tag=${encodeURIComponent(tag)}` : base;
}
