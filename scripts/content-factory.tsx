/**
 * CartBully content factory.
 *
 * Reads a text file of product URLs (one per line, blanks and # comments ok) and
 * for each URL runs the real extractor + verdict engine,
 * then writes to /content/YYYY-MM-DD/:
 *   - {slug}-card.png       (1200x630 beatdown card)
 *   - {slug}-story.png      (1080x1920 vertical crop of the same content)
 *   - {slug}-captions.txt   (three caption options plus hook lines)
 *
 * Nothing auto-posts. Handoff-ready only.
 *
 * Run:
 *   npx tsx scripts/content-factory.ts scripts/products.txt
 */

import { readFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import { extractProduct } from "../lib/extractor";
import { runVerdict } from "../lib/verdict";
import { ImageResponse } from "next/og";

async function main() {
  const listPath = process.argv[2];
  if (!listPath) {
    console.error("Usage: content-factory.ts <urls.txt>");
    process.exit(1);
  }
  const raw = await readFile(listPath, "utf8");
  const urls = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  const day = new Date().toISOString().slice(0, 10);
  const outDir = path.join(process.cwd(), "content", day);
  await mkdir(outDir, { recursive: true });

  console.log(`Factory running on ${urls.length} URLs. Output → ${outDir}`);

  for (const url of urls) {
    try {
      const p = await extractProduct(url);
      if (p.price == null) {
        console.warn(`skip (no price): ${url}`);
        continue;
      }
      const v = await runVerdict({
        title: p.title,
        price: p.price,
        domain: p.domain,
        localHour: 22,
        repeatCount: 1,
      });

      const slug = slugify(p.title);
      const card = await renderCard({
        title: p.title,
        price: p.price,
        roast: v.roast,
        verdict: v.verdict,
      });
      const story = await renderStory({
        title: p.title,
        price: p.price,
        roast: v.roast,
        verdict: v.verdict,
      });
      await writeFile(path.join(outDir, `${slug}-card.png`), Buffer.from(card));
      await writeFile(path.join(outDir, `${slug}-story.png`), Buffer.from(story));

      const captions = buildCaptions({
        title: p.title,
        price: p.price,
        roast: v.roast,
        verdict: v.verdict,
        swap: v.swap?.name || null,
      });
      await writeFile(path.join(outDir, `${slug}-captions.txt`), captions, "utf8");

      console.log(`ok: ${slug}`);
    } catch (err) {
      console.error(`fail: ${url}`, (err as Error).message);
    }
  }
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "item";
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

async function renderCard(input: {
  title: string;
  price: number;
  roast: string;
  verdict: string;
}) {
  const isTrashed = input.verdict === "TRASHED";
  const color = isTrashed ? "#D6231F" : "#2E7D46";
  const res = new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: "#FDFBF2",
          display: "flex",
          flexDirection: "column",
          padding: "50px 70px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontSize: 24, color: "#6D675C", letterSpacing: 4 }}>
            OFFICIAL BEATDOWN
          </div>
          <div style={{ display: "flex" }}>
            <div style={{ fontSize: 40, color: "#1C1A17" }}>CART</div>
            <div style={{ fontSize: 40, color: "#D6231F" }}>BULLY</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
          <div style={{ fontSize: 34, color: "#1C1A17" }}>{truncate(input.title, 90)}</div>
          <div style={{ fontSize: 42, color: "#6D675C", textDecoration: isTrashed ? "line-through" : "none", textDecorationColor: "#D6231F" }}>
            ${input.price.toFixed(2)}
          </div>
        </div>
        <div style={{ display: "flex", transform: "rotate(-4deg)", marginTop: 24 }}>
          <div style={{ fontSize: 140, color, letterSpacing: 4 }}>{input.verdict}</div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            fontStyle: "italic",
            color: "#1C1A17",
            borderLeft: "6px solid #D6231F",
            paddingLeft: 20,
            marginTop: 16,
            maxWidth: 1000,
          }}
        >
          {`"${truncate(input.roast, 180)}"`}
        </div>
        <div style={{ marginTop: "auto", fontSize: 22, color: "#6D675C" }}>
          cartbully.com · Read the cart. Roast the fantasy.
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
  return res.arrayBuffer();
}

async function renderStory(input: {
  title: string;
  price: number;
  roast: string;
  verdict: string;
}) {
  const isTrashed = input.verdict === "TRASHED";
  const color = isTrashed ? "#D6231F" : "#2E7D46";
  const res = new ImageResponse(
    (
      <div
        style={{
          width: 1080,
          height: 1920,
          background: "#FDFBF2",
          display: "flex",
          flexDirection: "column",
          padding: "80px 70px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex" }}>
          <div style={{ fontSize: 60, color: "#1C1A17" }}>CART</div>
          <div style={{ fontSize: 60, color: "#D6231F" }}>BULLY</div>
        </div>
        <div style={{ fontSize: 36, color: "#6D675C", marginTop: 40, letterSpacing: 4 }}>
          OFFICIAL BEATDOWN
        </div>
        <div style={{ fontSize: 46, color: "#1C1A17", marginTop: 40, lineHeight: 1.15 }}>
          {truncate(input.title, 80)}
        </div>
        <div
          style={{
            fontSize: 60,
            color: "#6D675C",
            textDecoration: isTrashed ? "line-through" : "none",
            textDecorationColor: "#D6231F",
            marginTop: 20,
          }}
        >
          ${input.price.toFixed(2)}
        </div>
        <div style={{ display: "flex", transform: "rotate(-4deg)", marginTop: 80 }}>
          <div style={{ fontSize: 220, color, letterSpacing: 6 }}>{input.verdict}</div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 40,
            color: "#1C1A17",
            fontStyle: "italic",
            borderLeft: "8px solid #D6231F",
            paddingLeft: 24,
            marginTop: 60,
            maxWidth: 900,
          }}
        >
          {`"${truncate(input.roast, 180)}"`}
        </div>
        <div style={{ marginTop: "auto", fontSize: 32, color: "#6D675C" }}>
          cartbully.com
        </div>
      </div>
    ),
    { width: 1080, height: 1920 }
  );
  return res.arrayBuffer();
}

function buildCaptions(input: {
  title: string;
  price: number;
  roast: string;
  verdict: string;
  swap: string | null;
}): string {
  const shortTitle = truncate(input.title, 60);
  const verdictLabel = input.verdict === "TRASHED" ? "TRASHED" : "SPARED";
  const hooks = [
    `POV: your cart tried to sneak a ${shortTitle.toLowerCase()} past the bully.`,
    `${verdictLabel}. And I saved $${input.price.toFixed(2)}.`,
    input.swap
      ? `${verdictLabel}. Swap dropped: ${input.swap}.`
      : `${verdictLabel}. No swap. It just sits down.`,
  ];
  const captions = hooks.map(
    (hook, i) =>
      `Option ${i + 1}\n${hook}\n\n"${input.roast}"\n\n#cartbully #impulseshopping #savingschallenge`
  );
  return captions.join("\n\n---\n\n") + "\n";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
