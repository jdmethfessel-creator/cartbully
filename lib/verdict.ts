import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  VERDICT_MAX_TOKENS,
  VERDICT_MODEL,
} from "@/config";

export type VerdictLabel = "TRASHED" | "SPARED";
export type Grade = "A" | "B+" | "B" | "C" | "D" | "F";

// The engine returns raw signals. verdict + grade + math are derived by
// runVerdict deterministically so grade distribution can't drift with the model.
const engineOutputSchema = z.object({
  product_type: z.string().min(1).max(80),
  category: z.string().min(1).max(80),
  roast: z.string().min(1).max(500),
  card_line: z.string().min(1).max(120),
  estimated_uses_per_year: z.number().int().min(0).max(3650),
  defensibility_score: z.number().min(0).max(100),
  swap: z
    .object({
      name: z.string(),
      reason: z.string(),
      est_price: z.number().nullable().optional(),
      venue: z.enum(["amazon", "shopping"]).optional(),
    })
    .nullable(),
});
type EngineOutput = z.infer<typeof engineOutputSchema>;

// What the app persists and renders.
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
  product_type: z.string(),
  category: z.string(),
  roast: z.string().min(1).max(500),
  card_line: z.string().min(1).max(120),
  defensibility_score: z.number().min(0).max(100),
  math: z.object({
    est_uses_per_year: z.number(),
    cost_per_use: z.string(),
    note: z.string(),
  }),
  swap: z
    .object({
      name: z.string(),
      reason: z.string(),
      est_price: z.number().nullable().optional(),
      venue: z.enum(["amazon", "shopping"]).optional(),
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
  userNote?: string | null;
  isRebuttal?: boolean;
  priorVerdict?: VerdictJson | null;
  rebuttalText?: string | null;
};

const SYSTEM_PROMPT = `You are CartBully, an old-school notebook-scribbling schoolyard bully who reviews shopping carts. Your job is a two-part beatdown: judge the purchase, then roast the fantasy behind it.

VOICE (STRICT)
- Merciless. Never gentle, never apologetic, never softening. No "treat yourself," "no judgment," "you deserve it," or "if it makes you happy." The roast always lands.
- Funny, not cruel. Roast the purchase decision and the fantasy the product is selling. Never insult the person's body, income, or intelligence. No profanity, no slurs.
- Never use em dashes. Use commas, periods, or parentheses.

SCHOOL-ERA REFERENCE RULE
- Weave in AT MOST ONE middle school or high school reference per roast. Rotate through the list, don't repeat. If nothing fits naturally, skip it. The reference sharpens the roast, it does not replace it.
- Universal territory only, not era-specific tech. Good territory:
  book fair money, Scholastic order forms, cafeteria lunch trades, science fair tri-folds, permission slips, detention slips, group project freeloaders, getting picked last in gym, the kid who peaked at the talent show, yearbook superlatives, locker decorations, picture day outfits, school dance corners, hall pass economy, pep rally attendance, homecoming float, PTA bake sale, spirit week, honor roll bumper stickers, band camp, class president election, the popcorn fundraiser, backpack rules, gym uniform, tardy slips.

ROAST STRUCTURE (STRICT, per roast, in order)
1. Open with the price spelled out as an insult ("$345 swim shorts.").
2. Gut the fantasy the product is selling.
3. Land the school-era comparison (or skip if forced).
4. Close with the cost-per-use reality.

STYLE EXAMPLES (calibrate to these two)
- "$345 swim shorts. That is 34 book fairs. You are spending an entire elementary school's Scholastic budget to sit near a pool you do not belong at, eight times a year. That's 43 dollars a splash."
- "$600 hairdryer. Six hundred dollars to blow hot air at your head. You couldn't get picked for the talent show and you thought a wand fixes that. 150 blowouts a year if you're honest, four bucks a puff."

PRODUCT IDENTIFICATION (STRICT)
- Derive product_type from the exact product NAME given, not the domain, not the category page, not vibes. Read the noun in the title.
- Examples of correct identification: "Orlebar Brown Setter swim shorts" → product_type "swim shorts". "Dyson Airwrap Complete Long" → product_type "hair styling tool". "Lodge 10-inch cast iron skillet" → product_type "cast iron skillet".
- Never substitute a different item type. If the roast mentions a noun, it must match product_type.
- category is the broader family, e.g. "menswear", "hair care", "cookware".

SCORING RUBRIC (defensibility_score, integer 0 to 100)
- 85 to 100: Genuine replacement for something worn out, essential consumable, priced fairly, honest cost per use. Anchor: $45 running shoes replacing worn pair, daily use.
- 70 to 84: Reasonable quality upgrade to a daily-driver tool with clear use. Anchor: $90 quality backpack used daily.
- 50 to 69: Fence. Probably a duplicate or a mild indulgence with real but not necessary use. Anchor: $180 sneakers, third similar pair.
- 30 to 49: Poor cost per use, identity purchase, thin justification, seasonal use only. Anchor: $345 swim shorts at 8 uses a year.
- 0 to 29: Impulse buy with no honest use case, gimmick, duplicate of a duplicate, trend item with 90-day lifespan. Anchor: $600 impulse gadget with no use case.
- Distribution should skew C and D for typical impulse buys. A and B must be reachable. F must exist for the worst offenders.
- Inputs to the score: price relative to functional alternatives, cost per use (price divided by estimated_uses_per_year), whether it solves a real problem or buys an identity, durability, duplicate likelihood.

CARD LINE
- One punchline under 120 characters. Sharp, sharable, works on its own with no context. Do not repeat the roast, distill it.

MATH
- estimated_uses_per_year: your honest guess of how many times a year this specific item gets used. Not aspirational. Integer.
- Do not include cost_per_use in the JSON. The app computes it from price / estimated_uses_per_year.

SWAP RULES (STRICT)
- Include a swap ONLY when a specific, well known, cheaper functional alternative exists with a real brand and model name a normal shopper would recognize.
- name MUST be a specific product: brand + product name. Never a category ("a cheaper table"), never a store ("Target's version"), never a hedge ("comparable option," "similar alternative," "a cheaper vacuum").
- est_price: realistic MSRP number (USD) or null if you don't know.
- reason: one short sentence.
- If no specific named alternative honestly exists, swap MUST be null. Do not invent brands.

VENUE RULE (STRICT)
- Every non-null swap includes a venue: "amazon" or "shopping".
- venue: "amazon" ONLY when the swap is a mass-market consumer product commonly sold on Amazon under its own brand and model (Shark, Ninja, Anker, Lodge, Instant Pot, SanDisk, Kasa, Levoit, Amazon Basics tier).
- venue: "shopping" for anything Amazon does not reliably carry: appliances shipped through dealers, high-end furniture, designer bags, professional or trade equipment, luxury, small-batch, boutique.
- For pro-appliance / luxury / dealer-distributed categories, prefer a mass-market comparable if one honestly exists (venue amazon), otherwise return swap: null.

OUTPUT (STRICT JSON ONLY, NO PROSE, NO FENCES, NO COMMENTS)
{"product_type":"...","category":"...","roast":"...","card_line":"...","estimated_uses_per_year":N,"defensibility_score":N,"swap":null|{"name":"Brand Product Name","reason":"...","est_price":N|null,"venue":"amazon|shopping"}}`;

function userPrompt(input: VerdictInput): string {
  const parts = [
    `Product name: ${input.title}`,
    `Source domain: ${input.domain}`,
    `Price: $${input.price.toFixed(2)}`,
    `Local hour (0-23): ${input.localHour}`,
    `Times this exact product has been looked at by this user: ${input.repeatCount}`,
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

function isConcreteSwap(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 4 || trimmed.length > 80) return false;
  for (const pat of BAD_SWAP_PATTERNS) {
    if (pat.test(trimmed)) return false;
  }
  const lower = trimmed.toLowerCase();
  for (const s of STORE_NAMES) {
    if (
      lower.startsWith(`${s} `) ||
      lower === s ||
      lower.includes(`${s}'s version`) ||
      lower.includes(`${s} version`)
    ) {
      return false;
    }
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  const hasCapitalizedToken = tokens.some((t) => /^[A-Z0-9]/.test(t));
  return hasCapitalizedToken;
}

export function sanitizeSwap(swap: VerdictJson["swap"]): VerdictJson["swap"] {
  if (!swap) return null;
  if (!isConcreteSwap(swap.name)) return null;
  const venue = swap.venue === "amazon" ? "amazon" : "shopping";
  return { ...swap, venue };
}

const AMAZON_STAPLE_BRANDS = [
  "shark", "ninja", "anker", "lodge", "instant pot", "sandisk", "kasa",
  "levoit", "amazon basics", "soundcore", "cosori", "aukey", "eufy",
  "roborock", "wyze", "tp-link", "logitech", "razer", "corsair",
  "keurig", "hamilton beach", "black+decker", "black and decker", "cuisinart",
  "oxo", "yeti", "hydro flask", "contigo", "kirkland",
];

function guessVenueFromName(name: string): "amazon" | "shopping" {
  const lower = name.toLowerCase();
  for (const brand of AMAZON_STAPLE_BRANDS) {
    if (lower.startsWith(brand + " ") || lower === brand) return "amazon";
  }
  return "shopping";
}

export function buildSwapCTA(
  swap: NonNullable<VerdictJson["swap"]>,
  amazonTag?: string | null
): { url: string; label: string; venue: "amazon" | "shopping"; rel: string } {
  const venue: "amazon" | "shopping" =
    swap.venue === "amazon" || swap.venue === "shopping"
      ? swap.venue
      : guessVenueFromName(swap.name);
  if (venue === "amazon") {
    return {
      venue,
      url: amazonSearchUrl(swap.name, amazonTag),
      label: "Take the cheap one",
      rel: "nofollow sponsored noopener",
    };
  }
  return {
    venue,
    url: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(swap.name)}`,
    label: "Compare prices",
    rel: "nofollow noopener",
  };
}

// Deterministic grade mapping. Kept out of the model so distribution doesn't drift.
export function gradeFromScore(score: number): Grade {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s >= 85) return "A";
  if (s >= 80) return "B+";
  if (s >= 70) return "B";
  if (s >= 50) return "C";
  if (s >= 30) return "D";
  return "F";
}

export function verdictFromGrade(grade: Grade): VerdictLabel {
  // A, B+, B are defensible buys. C is the fence. D and F are put-it-back.
  // C leans TRASHED because CartBully's job is to talk you out of the fence.
  if (grade === "A" || grade === "B+" || grade === "B") return "SPARED";
  return "TRASHED";
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

  // If roast overshoots, ask the model to compress once. Never truncate.
  if (
    parsed &&
    typeof parsed === "object" &&
    typeof (parsed as { roast?: unknown }).roast === "string" &&
    (parsed as { roast: string }).roast.length > 500
  ) {
    const compressPrompt = `${userPrompt(input)}\n\nYour previous roast was too long. Rewrite the SAME beatdown as JSON matching the same schema, but keep roast under 500 characters and card_line under 120 characters. Do not soften the take. Return JSON only.`;
    const retry = await callEngine(client, compressPrompt);
    if (retry) {
      const reparsed = tryParse(retry);
      if (reparsed) parsed = reparsed;
    }
  }

  // Normalize fields the model sometimes omits, so we don't stub for nits.
  if (parsed && typeof parsed === "object") {
    const p = parsed as {
      category?: unknown;
      card_line?: unknown;
      roast?: unknown;
      product_type?: unknown;
    };
    if (typeof p.category !== "string" || !p.category) p.category = "misc";
    if (typeof p.product_type !== "string" || !p.product_type) {
      p.product_type = deriveProductTypeFromTitle(input.title);
    }
    if (typeof p.card_line !== "string" || !p.card_line) {
      if (typeof p.roast === "string") p.card_line = firstSentence(p.roast).slice(0, 120);
    }
  }

  const check = engineOutputSchema.safeParse(parsed);
  if (!check.success) {
    console.log("verdict: engine schema fail", check.error.message.slice(0, 240));
    return stubVerdict(input);
  }
  const engine = check.data;

  return assembleVerdict(engine, input.price);
}

function assembleVerdict(engine: EngineOutput, price: number): VerdictJson {
  const grade = gradeFromScore(engine.defensibility_score);
  const verdict = verdictFromGrade(grade);
  const uses = Math.max(1, engine.estimated_uses_per_year);
  const cost = price / uses;
  const math = {
    est_uses_per_year: engine.estimated_uses_per_year,
    cost_per_use: `$${cost.toFixed(2)} a use`,
    note: "napkin math, obviously",
  };
  const full: VerdictJson = {
    verdict,
    grade,
    product_type: engine.product_type,
    category: engine.category,
    roast: engine.roast,
    card_line: engine.card_line,
    defensibility_score: Math.round(engine.defensibility_score),
    math,
    swap: sanitizeSwap(engine.swap),
  };
  return full;
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

// Coarse fallback: the last one or two title words are usually the noun.
export function deriveProductTypeFromTitle(title: string): string {
  const cleaned = title.replace(/[\|\-–].*$/, "").trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "item";
  const tail = tokens.slice(-2).join(" ").toLowerCase();
  return tail || "item";
}

// Zero-env stub so the app runs cold. Deterministic, present, correct schema.
export function stubVerdict(input: VerdictInput): VerdictJson {
  const impulseSignal = input.repeatCount >= 2 || input.localHour >= 22 || input.localHour < 5;
  const score = impulseSignal ? 25 : 72;
  const uses = impulseSignal ? 6 : 60;
  const product_type = deriveProductTypeFromTitle(input.title);
  const engine: EngineOutput = {
    product_type,
    category: "misc",
    roast: impulseSignal
      ? `$${input.price.toFixed(2)} for ${product_type} at this hour. That's book fair money you'll never see again. Six uses a year, do the math.`
      : `$${input.price.toFixed(2)} on ${product_type}. Fine. Don't get cocky, and don't add three more like it in the same tab.`,
    card_line: impulseSignal
      ? `$${input.price.toFixed(2)} on ${product_type}. Put it back.`
      : `Fine. Buy the ${product_type}. Just once.`,
    estimated_uses_per_year: uses,
    defensibility_score: score,
    swap: null,
  };
  return assembleVerdict(engine, input.price);
}

export function amazonSearchUrl(query: string, tag?: string | null): string {
  const q = encodeURIComponent(query);
  const base = `https://www.amazon.com/s?k=${q}`;
  return tag ? `${base}&tag=${encodeURIComponent(tag)}` : base;
}
