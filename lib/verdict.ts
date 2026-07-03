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
  roast: z.string().min(1).max(500),
  card_line: z.string().min(1).max(120),
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

ROAST vs CARD LINE
- "roast": 1 to 3 sentences, up to 500 characters total. This is the full punchdown, in-voice.
- "card_line": ONE punchline under 120 characters. Sharp, sharable, works on its own, no context needed. This is what goes on the share card. Do not repeat the roast; distill it.

MATH RULES
- All numbers are estimates. Note field must say something like "napkin math, obviously" or "guesstimate". Never say "based on data" or reference sources you don't have.
- est_uses_per_year is a plausible integer. cost_per_use is a short string like "$1.87 a use" using price / est_uses_per_year.
- If repeat visits are high or hour is late, work it into the roast, not the math.

SWAP RULES (STRICT)
- Only include a swap when a specific, well known, cheaper functional alternative EXISTS with a brand and product name a normal shopper would recognize. Examples of good swaps: "Shark FlexStyle" (for Dyson Airwrap), "Ninja Creami" (for a Big Ice Cream Machine), "Anker Soundcore Life P3" (for AirPods).
- name MUST be a specific product: brand + product name. Never a category ("a cheaper table"), never a store ("Target's version", "the Walmart one"), never a vague phrase ("comparable option", "similar alternative", "a cheaper vacuum").
- Include an est_price number (USD) that reflects a realistic MSRP for that named product. If you don't know the price, set est_price null.
- reason: one short sentence, no fluff, why this specific product beats the original.
- If no specific named alternative exists, swap MUST be null. Do not invent brand names. Do not fill it in with a category description.

REBUTTALS
- If the user is fighting back, respond once in character, then hold the verdict. Don't flip your call on excuses.

MEANNESS DIAL
- mild: teasing older-cousin tone
- medium: blunt, mildly menacing schoolyard tone
- merciless: scorched earth but still PG-13, no profanity, no personal attacks

OUTPUT
- Return STRICT JSON only, no prose, no code fences, no comments, matching this shape:
{"verdict":"TRASHED|SPARED","grade":"A|B+|B|C|D|F","roast":"...","card_line":"...","math":{"est_uses_per_year":N,"cost_per_use":"$X a use","note":"..."},"category":"...","swap":null|{"name":"Brand Product Name","reason":"...","est_price":N|null}}`;

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

const BAD_SWAP_PATTERNS = [
  /\bcomparable\b/i,
  /\bsimilar\b/i,
  /\balternative\b/i,
  /\ba cheaper\b/i,
  /\bthe cheaper\b/i,
  /\bany \w+/i,
  /\bstore brand\b/i,
  /\bgeneric\b/i,
  /\bdupe\b/i,
  /\bknockoff\b/i,
  /\bversion of\b/i,
];

const STORE_NAMES = [
  "amazon", "walmart", "target", "costco", "kroger", "aldi",
  "kohl's", "kohls", "cvs", "walgreens", "sam's club", "sams club",
  "trader joe's", "trader joes", "ikea", "wayfair", "best buy",
  "home depot", "lowe's", "lowes", "macy's", "macys", "nordstrom",
  "old navy", "gap", "primark", "shein", "temu", "aliexpress",
];

// A concrete product name has at least two whitespace-separated tokens
// where at least one token is capitalized (brand or product), and no
// banned category / hedge words / store names appear.
function isConcreteSwap(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 4 || trimmed.length > 80) return false;
  for (const pat of BAD_SWAP_PATTERNS) {
    if (pat.test(trimmed)) return false;
  }
  const lower = trimmed.toLowerCase();
  for (const s of STORE_NAMES) {
    // Reject "the Target one", "Walmart version", "Amazon Basics anything" as the product itself.
    if (lower.startsWith(`${s} `) || lower === s || lower.includes(`${s}'s version`) || lower.includes(`${s} version`)) {
      return false;
    }
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  const hasCapitalizedToken = tokens.some((t) => /^[A-Z0-9]/.test(t));
  return hasCapitalizedToken;
}

// Server-side gate on the model's swap output. Bad swaps become null and the
// beatdown page simply skips rendering the swap card.
export function sanitizeSwap(swap: VerdictJson["swap"]): VerdictJson["swap"] {
  if (!swap) return null;
  if (!isConcreteSwap(swap.name)) return null;
  return swap;
}

export async function runVerdict(input: VerdictInput): Promise<VerdictJson> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("verdict: no ANTHROPIC_API_KEY, using stub");
    return stubVerdict(input);
  }
  const client = new Anthropic({ apiKey });

  const firstText = await callEngine(client, userPrompt(input));
  if (firstText === null) return stubVerdict(input);

  let parsed = tryParse(firstText);
  if (!parsed) return stubVerdict(input);

  // If roast overshoots the schema, ask the model to compress once instead
  // of silently truncating. Truncation lops off the punchline.
  if (typeof (parsed as { roast?: string }).roast === "string" && (parsed as { roast: string }).roast.length > 500) {
    const compressPrompt = `${userPrompt(input)}\n\nYour previous roast was too long. Rewrite the SAME beatdown as JSON matching the same schema, but keep roast under 500 characters and card_line under 120 characters. Do not soften the take. Return JSON only.`;
    const retry = await callEngine(client, compressPrompt);
    if (retry) {
      const reparsed = tryParse(retry);
      if (reparsed) parsed = reparsed;
    }
  }

  // Normalize category if the model omitted it.
  if (parsed && typeof parsed === "object") {
    const p = parsed as { category?: unknown; card_line?: unknown; roast?: unknown };
    if (typeof p.category !== "string" || !p.category) p.category = "misc";
    // Legacy safety: if card_line is missing, derive from first sentence of roast.
    if (typeof p.card_line !== "string" || !p.card_line) {
      if (typeof p.roast === "string") p.card_line = firstSentence(p.roast).slice(0, 120);
    }
  }

  const check = verdictSchema.safeParse(parsed);
  if (!check.success) {
    console.log("verdict: schema fail", check.error.message.slice(0, 240));
    return stubVerdict(input);
  }
  const data = check.data;
  data.swap = sanitizeSwap(data.swap);
  return data;
}

async function callEngine(client: Anthropic, prompt: string): Promise<string | null> {
  try {
    const res = await client.messages.create({
      model: VERDICT_MODEL,
      max_tokens: VERDICT_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });
    return res.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim();
  } catch (err) {
    console.log("verdict: anthropic error", (err as Error).message);
    return null;
  }
}

function tryParse(text: string): unknown | null {
  const cleaned = stripFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

export function firstSentence(s: string): string {
  const trimmed = s.trim();
  const m = trimmed.match(/^[^.!?]+[.!?]/);
  return (m ? m[0] : trimmed).trim();
}

// Zero-env stub so the app runs cold. Deterministic, present, correct schema.
export function stubVerdict(input: VerdictInput): VerdictJson {
  const trashed = input.repeatCount >= 2 || input.localHour >= 22 || input.localHour < 5;
  const uses = trashed ? 6 : 60;
  const cost = uses > 0 ? input.price / uses : input.price;
  return {
    verdict: trashed ? "TRASHED" : "SPARED",
    grade: trashed ? "F" : "B",
    roast: trashed
      ? "Back at this again? Put the phone down and go drink some water. The cart will still be there tomorrow, and by tomorrow you will not want it."
      : "Fine. This one is actually useful. Don't get cocky, and don't add three more like it in the same tab.",
    card_line: trashed
      ? "Put it down. The cart can wait until tomorrow."
      : "Fine, buy it. Just don't get cocky.",
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
