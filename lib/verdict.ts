import Anthropic from "@anthropic-ai/sdk";
import { randomBytes } from "crypto";
import { z } from "zod";
import type { PageContext } from "./extractor";
import {
  VERDICT_MAX_TOKENS,
  VERDICT_MODEL,
} from "@/config";

export type VerdictLabel = "TRASHED" | "SPARED";
export type Grade = "A" | "B+" | "B" | "C" | "D" | "F";

// Two-stage engine. Stage 1 identifies the product (product_type + category)
// with the image as authoritative signal. Stage 2 writes the roast with
// product_type as a hard constraint so brand-name inference cannot bleed
// into the noun the roast uses.

const idSchema = z.object({
  product_type: z.string().min(1).max(80),
  category: z.string().min(1).max(80),
});
type IdOutput = z.infer<typeof idSchema>;

const roastEngineSchema = z.object({
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
type RoastOutput = z.infer<typeof roastEngineSchema>;

// The full VerdictJson the app persists and renders.
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
  imageUrl?: string | null;
  pageContext?: PageContext | null;
  userNote?: string | null;
  isRebuttal?: boolean;
  priorVerdict?: VerdictJson | null;
  rebuttalText?: string | null;
};

// --------------------------------------------------------------------------
// STAGE 1 PROMPT: identify the product from image + page_context. This call
// exists to lock product_type before the roasting call sees a single word of
// the roast. Brand names are explicitly not allowed as product_type.
// --------------------------------------------------------------------------
const ID_SYSTEM_PROMPT = `You are a product classifier. Look at the image (if provided) and the page_context, and return a JSON object identifying the item.

RULES (STRICT)
- product_type MUST be the specific noun for the item, e.g. "swim shorts", "sofa", "cast iron skillet", "cordless vacuum", "hair styling tool", "earbuds", "watch". It is never a brand name, model number, or line name. "Setter" is NOT a product type. "Airwrap" is NOT a product type.
- Never infer product type from brand reputation. Orlebar Brown is not always swim shorts. Nike sells many things. Look at the actual signals.
- Preferred signal order when the image is present: image > breadcrumb trail > URL path tokens > og:description > title tag > raw title.
- Preferred signal order when the image is absent: breadcrumb trail > URL path tokens > og:description > title tag > raw title.
- When the raw title is a brand or model with no noun, prefer URL path tokens. "setter mid length swim shorts navy" in the URL path outweighs "Orlebar Brown Setter" in the title.
- category is the broader family, e.g. "menswear", "hair care", "cookware", "audio".

OUTPUT (STRICT JSON ONLY, NO PROSE, NO FENCES)
{"product_type":"...","category":"..."}`;

function idUserPrompt(input: VerdictInput, imageAvailable: boolean): string {
  const parts: string[] = [
    `Raw product title from the page: ${input.title}`,
    `Source domain: ${input.domain}`,
  ];
  if (imageAvailable) {
    parts.push("An IMAGE of the product is included above. Use it as the primary signal.");
  } else {
    parts.push(
      "No image was available. Use page_context below as the primary signal, and prefer URL path tokens over the bare title."
    );
  }
  const ctx = input.pageContext;
  if (ctx) {
    const ctxLines: string[] = ["page_context:"];
    if (ctx.jsonLdCategory) ctxLines.push(`  jsonLdCategory: ${ctx.jsonLdCategory}`);
    if (ctx.breadcrumbTrail.length > 0)
      ctxLines.push(`  breadcrumbTrail: ${ctx.breadcrumbTrail.join(" > ")}`);
    if (ctx.ogDescriptionFirstSentence)
      ctxLines.push(`  ogDescriptionFirstSentence: ${ctx.ogDescriptionFirstSentence}`);
    if (ctx.titleTag) ctxLines.push(`  titleTag: ${ctx.titleTag}`);
    if (ctx.urlPathTokens.length > 0)
      ctxLines.push(`  urlPathTokens: ${ctx.urlPathTokens.join(" ")}`);
    if (ctxLines.length > 1) parts.push(ctxLines.join("\n"));
  }
  return parts.join("\n");
}

// --------------------------------------------------------------------------
// STAGE 2 PROMPT: write the roast. product_type is already locked. The prompt
// hard-constrains the roast to use product_type verbatim and to not name any
// other garment or item type.
// --------------------------------------------------------------------------
const ROAST_SYSTEM_PROMPT = `You are CartBully, an old-school notebook-scribbling schoolyard bully who reviews shopping carts. Your job is to judge the purchase, then roast the fantasy behind it.

VOICE (STRICT)
- Merciless. Never gentle, never apologetic, never softening. No "treat yourself," "no judgment," "you deserve it," or "if it makes you happy." The roast always lands.
- Funny, not cruel. Roast the purchase decision and the fantasy the product is selling. Never insult the person's body, income, or intelligence. No profanity, no slurs.
- Never use em dashes. Use commas, periods, or parentheses.

PRODUCT_TYPE IS ALREADY LOCKED (MOST IMPORTANT RULE)
- You will receive product_type in the user message. Treat it as ground truth.
- The roast MUST name the item using product_type verbatim at least once. Prefer using it in the opening sentence.
- Do not call the item any other product type or garment. If product_type is "swim shorts", do not say "polo," "shirt," "tee," "pants," or "trunks." If product_type is "sofa," do not say "couch," "sectional," or "loveseat." Say the actual product_type.

SCHOOL-ERA REFERENCE RULE
- Weave in AT MOST ONE middle school or high school reference per roast. Rotate through the list, don't repeat. If nothing fits naturally, skip it. The reference sharpens the roast, it does not replace it.
- Universal territory only, not era-specific tech. Good territory:
  book fair money, Scholastic order forms, cafeteria lunch trades, science fair tri-folds, permission slips, detention slips, group project freeloaders, getting picked last in gym, the kid who peaked at the talent show, yearbook superlatives, locker decorations, picture day outfits, school dance corners, hall pass economy, pep rally attendance, homecoming float, PTA bake sale, spirit week, honor roll bumper stickers, band camp, class president election, the popcorn fundraiser, backpack rules, gym uniform, tardy slips.

ROAST STRUCTURE (STRICT, per roast, in order)
1. Open with the price spelled out as an insult, using product_type ("$345 swim shorts.").
2. Gut the fantasy the product is selling.
3. Land the school-era comparison (or skip if forced).
4. Close with the cost-per-use reality.

STYLE EXAMPLES (calibrate to these two)
- "$345 swim shorts. That is 34 book fairs. You are spending an entire elementary school's Scholastic budget to sit near a pool you do not belong at, eight times a year. That's 43 dollars a splash."
- "$600 hairdryer. Six hundred dollars to blow hot air at your head. You couldn't get picked for the talent show and you thought a wand fixes that. 150 blowouts a year if you're honest, four bucks a puff."

SCORING RUBRIC (defensibility_score, integer 0 to 100)
- 85 to 100: Genuine replacement for something worn out, essential consumable, priced fairly, honest cost per use.
- 70 to 84: Reasonable quality upgrade to a daily-driver tool with clear use.
- 50 to 69: Fence. Duplicate or mild indulgence with real but not necessary use.
- 30 to 49: Poor cost per use, identity purchase, thin justification, seasonal use only.
- 0 to 29: Impulse buy with no honest use case, gimmick, duplicate of a duplicate, trend item with 90-day lifespan.
- Distribution should skew C and D for typical impulse buys. A and B must be reachable. F must exist for the worst offenders.

CARD LINE
- One punchline under 120 characters. Sharp, sharable, works on its own. Do not repeat the roast, distill it. The card_line must also use product_type verbatim.

MATH
- estimated_uses_per_year: your honest guess of how many times a year this specific item gets used. Not aspirational. Integer.
- Do not include cost_per_use in the JSON. The app computes it.

SWAP RULES (STRICT)
- Include a swap ONLY when a specific, well known, cheaper functional alternative exists with a real brand and model name a normal shopper would recognize.
- name MUST be a specific product: brand + product name. Never a category, never a store, never a hedge ("comparable option," "similar alternative").
- est_price: realistic MSRP number (USD) or null if you don't know.
- reason: one short sentence.
- If no specific named alternative honestly exists, swap MUST be null.
- Every non-null swap includes venue: "amazon" if it's a mass-market Amazon staple (Shark, Ninja, Anker, Lodge, etc), otherwise "shopping".

OUTPUT (STRICT JSON ONLY, NO PROSE, NO FENCES, NO COMMENTS, NO product_type or category in this stage)
{"roast":"...","card_line":"...","estimated_uses_per_year":N,"defensibility_score":N,"swap":null|{"name":"Brand Product Name","reason":"...","est_price":N|null,"venue":"amazon|shopping"}}`;

function roastUserPrompt(
  input: VerdictInput,
  product_type: string,
  category: string,
  imageAvailable: boolean,
  correctionNote?: string
): string {
  const parts: string[] = [
    `product_type (LOCKED, use verbatim): ${product_type}`,
    `category: ${category}`,
    `Product title on the page: ${input.title}`,
    `Source domain: ${input.domain}`,
    `Price: $${input.price.toFixed(2)}`,
    `Local hour (0-23): ${input.localHour}`,
    `Times this exact product has been looked at by this user: ${input.repeatCount}`,
  ];
  if (imageAvailable) {
    parts.push("An IMAGE of the product is included above for context, but product_type is already correct.");
  }
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
  if (correctionNote) {
    parts.push("");
    parts.push(`CORRECTION: ${correctionNote}`);
  }
  return parts.join("\n");
}

// --------------------------------------------------------------------------
// Conflict-word guard. If the roast names a different clothing / item type
// than product_type, we retry once and then template if it still slips.
// --------------------------------------------------------------------------
const CLOTHING_TYPES = [
  "swim shorts", "swim trunks", "trunks",
  "shorts", "shirt", "tee", "t-shirt", "polo", "pants", "trousers",
  "jacket", "coat", "dress", "hoodie", "sweater", "sweatshirt",
  "skirt", "blouse", "suit", "jeans", "tank top", "tank",
  "hat", "cap", "beanie", "scarf",
  "sneakers", "boots", "shoes", "loafers", "sandals", "flip-flops",
  "socks", "belt", "tie", "gloves",
];

function findConflictingType(product_type: string, roast: string): string | null {
  const pt = product_type.toLowerCase();
  const rl = " " + roast.toLowerCase() + " ";
  // Only guard when product_type itself is a clothing item, otherwise other
  // categories (kitchenware, electronics) don't have a well-scoped word bank
  // to police here.
  const productIsClothing = CLOTHING_TYPES.some((t) => pt.includes(t));
  if (!productIsClothing) return null;
  // Collect the exact clothing tokens present in product_type so we know
  // which are legal to mention.
  const legal = new Set<string>();
  for (const t of CLOTHING_TYPES) {
    if (pt.includes(t)) legal.add(t);
  }
  for (const t of CLOTHING_TYPES) {
    if (legal.has(t)) continue;
    // Skip if a longer legal phrase contains this shorter one. E.g. product_type
    // "swim shorts" makes "shorts" appear legal by extension.
    const covered = Array.from(legal).some((L) => L.includes(t));
    if (covered) continue;
    const re = new RegExp(`(^|[^a-z])${t.replace(/[-\/]/g, "[-\\/]")}(?![a-z])`, "i");
    if (re.test(rl)) return t;
  }
  return null;
}

// Template opener when the model refuses to comply after two tries. Boring
// but honest, and always uses product_type verbatim.
function templatedRoast(input: VerdictInput, product_type: string): string {
  const price = input.price.toFixed(2);
  return `$${price} ${product_type}. That's real money to solve a problem you did not have. The fantasy the ${product_type} is selling does not survive the checkout page. Use it a dozen times and the cost per use still stings.`;
}

// --------------------------------------------------------------------------
// Swap sanitizer stays the same as before.
// --------------------------------------------------------------------------
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
  if (grade === "A" || grade === "B+" || grade === "B") return "SPARED";
  return "TRASHED";
}

// --------------------------------------------------------------------------
// Image handling. Fetches the URL server-side, converts to base64, gates on
// content-type and size. Every step is logged with the request id so failures
// are visible in the server console.
// --------------------------------------------------------------------------
const UA_FOR_IMAGE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

type FetchedImage = { data: string; media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif" };

async function fetchImageBase64(url: string, reqId: string): Promise<FetchedImage | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA_FOR_IMAGE, accept: "image/*,*/*;q=0.8" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      console.log(`[verdict ${reqId}] image fetch failed status=${res.status} url=${url.slice(0, 120)}`);
      return null;
    }
    const raw = (res.headers.get("content-type") || "").toLowerCase();
    const mediaType: FetchedImage["media_type"] | null = raw.includes("jpeg") || raw.includes("jpg")
      ? "image/jpeg"
      : raw.includes("png")
      ? "image/png"
      : raw.includes("webp")
      ? "image/webp"
      : raw.includes("gif")
      ? "image/gif"
      : null;
    if (!mediaType) {
      console.log(`[verdict ${reqId}] image fetch rejected non-image content-type="${raw}"`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 4 * 1024 * 1024) {
      console.log(`[verdict ${reqId}] image fetch rejected size=${buf.byteLength}`);
      return null;
    }
    console.log(`[verdict ${reqId}] image fetch ok size=${buf.byteLength} media=${mediaType}`);
    return { data: buf.toString("base64"), media_type: mediaType };
  } catch (err) {
    console.log(`[verdict ${reqId}] image fetch error: ${(err as Error).message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// --------------------------------------------------------------------------
// Runner. Two calls: identify then roast. Every step logs. If the roast names
// a different clothing item than product_type, retry once. If it still slips,
// use a templated opener that guarantees product_type verbatim.
// --------------------------------------------------------------------------
export async function runVerdict(input: VerdictInput): Promise<VerdictJson> {
  const reqId = randomBytes(3).toString("hex");
  console.log(
    `[verdict ${reqId}] start title="${input.title.slice(0, 80)}" domain=${input.domain} price=$${input.price} imageUrl=${input.imageUrl || "none"}`
  );

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log(`[verdict ${reqId}] no ANTHROPIC_API_KEY, using stub`);
    return stubVerdict(input);
  }
  const client = new Anthropic({ apiKey });

  const fetchedImage = input.imageUrl ? await fetchImageBase64(input.imageUrl, reqId) : null;
  if (!input.imageUrl) console.log(`[verdict ${reqId}] no image URL supplied`);
  const imageAvailable = fetchedImage !== null;
  console.log(`[verdict ${reqId}] path=${imageAvailable ? "vision" : "text_fallback"}`);

  // Stage 1: identify product_type + category.
  const identified = await identifyProduct(client, input, fetchedImage, reqId);
  if (!identified) {
    console.log(`[verdict ${reqId}] identification failed, using stub`);
    return stubVerdict(input);
  }
  console.log(
    `[verdict ${reqId}] identified product_type="${identified.product_type}" category="${identified.category}"`
  );

  // Stage 2: write the roast, product_type is locked.
  const roasted = await writeRoastWithGuard(client, input, identified, fetchedImage, reqId);
  if (!roasted) {
    console.log(`[verdict ${reqId}] roast failed all attempts, using stub`);
    return stubVerdict(input);
  }

  const engine = {
    product_type: identified.product_type,
    category: identified.category,
    roast: roasted.roast,
    card_line: roasted.card_line,
    estimated_uses_per_year: roasted.estimated_uses_per_year,
    defensibility_score: roasted.defensibility_score,
    swap: roasted.swap,
  };
  return assembleVerdict(engine, input.price);
}

async function identifyProduct(
  client: Anthropic,
  input: VerdictInput,
  image: FetchedImage | null,
  reqId: string
): Promise<IdOutput | null> {
  const prompt = idUserPrompt(input, image !== null);
  const raw = await callEngine(client, ID_SYSTEM_PROMPT, prompt, image, 200);
  console.log(`[verdict ${reqId}] identify raw: ${(raw || "").slice(0, 400)}`);
  if (!raw) return null;
  const parsed = tryParse(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as { product_type?: unknown; category?: unknown };
  if (typeof p.category !== "string" || !p.category) p.category = "misc";
  const check = idSchema.safeParse(parsed);
  if (!check.success) {
    console.log(`[verdict ${reqId}] identify schema fail: ${check.error.message.slice(0, 200)}`);
    // Coarse fallback so a bad JSON doesn't drop us to stub for the whole run.
    return { product_type: deriveProductTypeFromTitle(input.title), category: "misc" };
  }
  return check.data;
}

async function writeRoastWithGuard(
  client: Anthropic,
  input: VerdictInput,
  identified: IdOutput,
  image: FetchedImage | null,
  reqId: string
): Promise<RoastOutput | null> {
  const imageAvailable = image !== null;

  const attempt = async (correctionNote?: string): Promise<RoastOutput | null> => {
    const prompt = roastUserPrompt(
      input,
      identified.product_type,
      identified.category,
      imageAvailable,
      correctionNote
    );
    const raw = await callEngine(client, ROAST_SYSTEM_PROMPT, prompt, image, VERDICT_MAX_TOKENS);
    console.log(`[verdict ${reqId}] roast raw: ${(raw || "").slice(0, 600)}`);
    if (!raw) return null;
    const parsed = tryParse(raw);
    if (!parsed) return null;
    if (
      typeof (parsed as { roast?: unknown }).roast === "string" &&
      (parsed as { roast: string }).roast.length > 500
    ) {
      // Recycle prompt with a compress note but reuse product_type.
      const compress = await callEngine(
        client,
        ROAST_SYSTEM_PROMPT,
        prompt +
          "\n\nYour previous roast was too long. Rewrite JSON matching the same schema, keep roast under 500 characters and card_line under 120 characters. product_type stays the same. Return JSON only.",
        image,
        VERDICT_MAX_TOKENS
      );
      if (compress) {
        const reparsed = tryParse(compress);
        if (reparsed) return validateRoast(reparsed);
      }
    }
    return validateRoast(parsed);
  };

  const result = await attempt();
  if (!result) return null;

  const conflict = findConflictingType(identified.product_type, result.roast);
  if (!conflict) {
    return result;
  }

  console.log(
    `[verdict ${reqId}] roast conflict: product_type="${identified.product_type}" conflict_word="${conflict}", retrying`
  );
  const correction = `Your last roast called it "${conflict}". The product IS "${identified.product_type}". Rewrite. Use "${identified.product_type}" verbatim, and never write "${conflict}" or any other clothing / item noun.`;
  const retry = await attempt(correction);
  if (retry) {
    const secondConflict = findConflictingType(identified.product_type, retry.roast);
    if (!secondConflict) {
      return retry;
    }
    console.log(
      `[verdict ${reqId}] roast still conflicts after retry (word="${secondConflict}"), templating opener`
    );
  } else {
    console.log(`[verdict ${reqId}] retry attempt failed entirely, templating opener`);
  }
  // Both attempts slipped. Use a templated roast opener that guarantees the
  // product_type is stated correctly, keep the numbers from the first attempt.
  const templated: RoastOutput = {
    roast: templatedRoast(input, identified.product_type),
    card_line: `$${input.price.toFixed(2)} ${identified.product_type}. Put it back.`,
    estimated_uses_per_year: result.estimated_uses_per_year,
    defensibility_score: result.defensibility_score,
    swap: result.swap,
  };
  return templated;
}

function validateRoast(parsed: unknown): RoastOutput | null {
  if (parsed && typeof parsed === "object") {
    const p = parsed as { card_line?: unknown; roast?: unknown };
    if ((typeof p.card_line !== "string" || !p.card_line) && typeof p.roast === "string") {
      p.card_line = firstSentence(p.roast).slice(0, 120);
    }
  }
  const check = roastEngineSchema.safeParse(parsed);
  return check.success ? check.data : null;
}

function assembleVerdict(
  engine: {
    product_type: string;
    category: string;
    roast: string;
    card_line: string;
    estimated_uses_per_year: number;
    defensibility_score: number;
    swap: VerdictJson["swap"];
  },
  price: number
): VerdictJson {
  const grade = gradeFromScore(engine.defensibility_score);
  const verdict = verdictFromGrade(grade);
  const uses = Math.max(1, engine.estimated_uses_per_year);
  const cost = price / uses;
  const math = {
    est_uses_per_year: engine.estimated_uses_per_year,
    cost_per_use: `$${cost.toFixed(2)} a use`,
    note: "napkin math, obviously",
  };
  return {
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
}

async function callEngine(
  client: Anthropic,
  system: string,
  prompt: string,
  image: FetchedImage | null,
  maxTokens: number
): Promise<string | null> {
  try {
    const content: Anthropic.MessageParam["content"] = image
      ? [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: image.media_type,
              data: image.data,
            },
          },
          { type: "text", text: prompt },
        ]
      : prompt;
    const res = await client.messages.create({
      model: VERDICT_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
    });
    return res.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim();
  } catch (err) {
    console.log(`verdict: anthropic error ${(err as Error).message}`);
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

// Zero-env stub so the app runs cold. Deterministic, correct schema.
export function stubVerdict(input: VerdictInput): VerdictJson {
  const impulseSignal = input.repeatCount >= 2 || input.localHour >= 22 || input.localHour < 5;
  const score = impulseSignal ? 25 : 72;
  const uses = impulseSignal ? 6 : 60;
  const product_type = deriveProductTypeFromTitle(input.title);
  return assembleVerdict(
    {
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
    },
    input.price
  );
}

export function amazonSearchUrl(query: string, tag?: string | null): string {
  const q = encodeURIComponent(query);
  const base = `https://www.amazon.com/s?k=${q}`;
  return tag ? `${base}&tag=${encodeURIComponent(tag)}` : base;
}
