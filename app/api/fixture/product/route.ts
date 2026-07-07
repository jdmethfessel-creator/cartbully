import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Static test fixture that returns a product page with valid JSON-LD Product
// data. Used by the cron and by tests to verify the extract -> compare -> alert
// pipeline works end to end. Harmless in production: it just returns HTML.
export async function GET(req: NextRequest) {
  const priceParam = req.nextUrl.searchParams.get("price");
  const titleParam = req.nextUrl.searchParams.get("title") || "CartBully Fixture Item";
  const price = priceParam ? Number(priceParam) : 42;
  if (!isFinite(price) || price < 0) {
    return NextResponse.json({ error: "bad_price" }, { status: 400 });
  }

  const ld = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: titleParam,
    image: "https://cartbully.vercel.app/icon.svg",
    description: "A synthetic product used for pipeline verification.",
    offers: {
      "@type": "Offer",
      priceCurrency: "USD",
      price: price.toFixed(2),
      availability: "https://schema.org/InStock",
    },
  });

  const html = `<!doctype html><html><head>
<meta charset="utf-8">
<title>${escapeHtml(titleParam)}</title>
<meta property="og:title" content="${escapeAttr(titleParam)}">
<meta property="og:image" content="https://cartbully.vercel.app/icon.svg">
<meta property="product:price:amount" content="${price.toFixed(2)}">
<meta property="product:price:currency" content="USD">
<meta property="og:price:amount" content="${price.toFixed(2)}">
<meta property="og:price:currency" content="USD">
<script type="application/ld+json">${ld}</script>
</head><body>
<h1>${escapeHtml(titleParam)}</h1>
<p>Price: $${price.toFixed(2)}</p>
</body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}
