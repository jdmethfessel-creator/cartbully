// Server-side product extractor. Fetches a URL, parses OG, JSON-LD, meta hints, title,
// and returns a rich page_context so the roast engine can identify the product
// with more signal than just the bare title.

export type PageContext = {
  jsonLdCategory: string | null;
  breadcrumbTrail: string[];
  ogDescriptionFirstSentence: string | null;
  titleTag: string | null;
  urlPathTokens: string[];
};

export type ExtractedProduct = {
  title: string;
  price: number | null;
  currency: string;
  image: string | null;
  domain: string;
  canonicalUrl: string;
  page_context: PageContext;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "gclid", "fbclid", "mc_cid", "mc_eid", "yclid", "msclkid", "igshid",
  "ref", "ref_", "ref_src", "share", "share_id", "src", "tag",
]);

// URL path tokens we drop because they are structural, not descriptive.
const PATH_STOPWORDS = new Set([
  "products", "product", "p", "shop", "store", "collections", "collection",
  "buy", "item", "items", "detail", "details", "html", "htm", "index", "en",
  "us", "en-us", "en_us", "www", "sku", "pdp", "browse", "category",
  "categories", "c",
]);

export function normalizeUrl(input: string): string {
  try {
    const u = new URL(input.trim());
    const kept = new URLSearchParams();
    u.searchParams.forEach((v, k) => {
      if (!TRACKING_PARAMS.has(k.toLowerCase())) kept.set(k, v);
    });
    u.search = kept.toString();
    u.hash = "";
    return u.toString();
  } catch {
    return input.trim();
  }
}

function parsePrice(input: unknown): number | null {
  if (typeof input === "number" && isFinite(input)) return input;
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/[^0-9.,]/g, "").replace(/,(?=\d{3}\b)/g, "");
  const commaDecimal = /,\d{2}$/.test(cleaned);
  const normalized = commaDecimal ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  const n = parseFloat(normalized);
  return isFinite(n) ? n : null;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code, 10)));
}

function findMeta(html: string, key: "property" | "name", value: string): string | null {
  const re = new RegExp(
    `<meta[^>]+${key}=["']${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
    "i"
  );
  const m = html.match(re);
  if (!m) return null;
  const cm = m[0].match(/content=["']([^"']+)["']/i);
  return cm ? decodeEntities(cm[1]) : null;
}

function findJsonLd(html: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else blocks.push(parsed);
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return blocks;
}

function isType(block: Record<string, unknown>, wanted: string): boolean {
  const type = block["@type"];
  return type === wanted || (Array.isArray(type) && type.includes(wanted));
}

function findProductInJsonLd(blocks: Record<string, unknown>[]): {
  name?: string;
  price?: number;
  currency?: string;
  image?: string;
  category?: string;
} {
  for (const block of blocks) {
    if (!isType(block, "Product")) continue;
    const name = typeof block.name === "string" ? block.name : undefined;
    const image = Array.isArray(block.image)
      ? (block.image[0] as string)
      : typeof block.image === "string"
      ? (block.image as string)
      : undefined;
    const rawCategory = (block as { category?: unknown }).category;
    const category = Array.isArray(rawCategory)
      ? rawCategory.filter((c) => typeof c === "string").join(" > ")
      : typeof rawCategory === "string"
      ? rawCategory
      : undefined;
    const offers = block.offers as Record<string, unknown> | Record<string, unknown>[] | undefined;
    let price: number | undefined;
    let currency: string | undefined;
    const readOffer = (offer: Record<string, unknown>) => {
      const p =
        parsePrice(offer.price) ??
        parsePrice((offer as Record<string, unknown>).lowPrice) ??
        parsePrice((offer as Record<string, unknown>).highPrice);
      if (p !== undefined && p !== null) price = p;
      const c = offer.priceCurrency;
      if (typeof c === "string") currency = c;
    };
    if (Array.isArray(offers)) offers.forEach(readOffer);
    else if (offers) readOffer(offers);
    return { name, price, currency, image, category };
  }
  return {};
}

function findBreadcrumbTrail(blocks: Record<string, unknown>[]): string[] {
  for (const block of blocks) {
    if (!isType(block, "BreadcrumbList")) continue;
    const items = block.itemListElement;
    if (!Array.isArray(items)) continue;
    const trail: string[] = [];
    for (const raw of items) {
      const item = raw as { name?: unknown; item?: unknown; position?: unknown };
      if (typeof item.name === "string") {
        trail.push(item.name.trim());
      } else if (item.item && typeof item.item === "object") {
        const inner = item.item as { name?: unknown };
        if (typeof inner.name === "string") trail.push(inner.name.trim());
      }
    }
    return trail.filter(Boolean);
  }
  return [];
}

function tokenizeUrlPath(pathname: string): string[] {
  return pathname
    .split(/[\/\-_]/)
    .map((s) => decodeURIComponent(s.trim()).toLowerCase())
    .filter(
      (s) =>
        s.length > 1 &&
        !/^\d+$/.test(s) &&
        !PATH_STOPWORDS.has(s) &&
        !/\.(html?|aspx?|php|jsp)$/i.test(s)
    );
}

function firstSentence(s: string): string {
  const trimmed = s.trim();
  const m = trimmed.match(/^[^.!?]+[.!?]/);
  return (m ? m[0] : trimmed).trim();
}

export async function extractProduct(url: string): Promise<ExtractedProduct> {
  const canonicalUrl = normalizeUrl(url);
  const parsed = new URL(canonicalUrl);
  const domain = parsed.hostname.replace(/^www\./, "");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  let html = "";
  try {
    const res = await fetch(canonicalUrl, {
      headers: { "user-agent": UA, accept: "text/html" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (res.ok) {
      html = await res.text();
    }
  } catch {
    // network or timeout, fall through to minimal extraction
  } finally {
    clearTimeout(timeout);
  }

  const blocks = html ? findJsonLd(html) : [];
  const productLd = findProductInJsonLd(blocks);
  const breadcrumbTrail = findBreadcrumbTrail(blocks);

  const ogTitle = html ? findMeta(html, "property", "og:title") : null;
  const ogImage = html ? findMeta(html, "property", "og:image") : null;
  const ogDescription = html ? findMeta(html, "property", "og:description") : null;
  const twTitle = html ? findMeta(html, "name", "twitter:title") : null;
  const twImage = html ? findMeta(html, "name", "twitter:image") : null;
  const metaPrice =
    (html ? findMeta(html, "property", "product:price:amount") : null) ||
    (html ? findMeta(html, "property", "og:price:amount") : null) ||
    (html ? findMeta(html, "name", "twitter:data1") : null);
  const metaCurrency =
    (html ? findMeta(html, "property", "product:price:currency") : null) ||
    (html ? findMeta(html, "property", "og:price:currency") : null) ||
    "USD";

  const rawTitleTag = html
    ? (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
    : "";
  const titleTag = rawTitleTag ? decodeEntities(stripTags(rawTitleTag)) : "";

  const title =
    productLd.name ||
    ogTitle ||
    twTitle ||
    titleTag ||
    domain;

  const price = productLd.price ?? parsePrice(metaPrice);
  const currency = productLd.currency || metaCurrency || "USD";
  const image = productLd.image || ogImage || twImage || null;

  const page_context: PageContext = {
    jsonLdCategory: productLd.category ?? null,
    breadcrumbTrail,
    ogDescriptionFirstSentence: ogDescription ? firstSentence(ogDescription).slice(0, 300) : null,
    titleTag: titleTag || null,
    urlPathTokens: tokenizeUrlPath(parsed.pathname),
  };

  return {
    title: title.slice(0, 200),
    price: price ?? null,
    currency,
    image,
    domain,
    canonicalUrl,
    page_context,
  };
}
