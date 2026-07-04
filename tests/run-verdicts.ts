/**
 * Manual QA harness. Runs each test product through the verdict engine and
 * prints pass/fail against expected verdict, roast guardrails, swap-quality,
 * and swap-venue expectations.
 *
 * Run: npx tsx tests/run-verdicts.ts
 */
import { readFile } from "fs/promises";
import path from "path";
import { buildSwapCTA, runVerdict, sanitizeSwap } from "../lib/verdict";

type Case = {
  title: string;
  price: number;
  domain: string;
  expect: "TRASHED" | "SPARED";
  swap_expect: "concrete" | "concrete_or_null" | "null_only" | "any";
  venue_expect: "amazon" | "shopping" | "amazon_or_null" | "shopping_or_amazon_or_null" | "any";
  why: string;
};

const BAD_WORDS = [
  "fat", "stupid", "idiot", "dumb", "poor", "broke", "loser", "ugly", "worthless",
];

async function main() {
  const file = path.join(process.cwd(), "tests", "products.json");
  const raw = await readFile(file, "utf8");
  const cases = JSON.parse(raw) as Case[];

  let pass = 0;
  for (const c of cases) {
    const v = await runVerdict({
      title: c.title,
      price: c.price,
      domain: c.domain,
      localHour: 22,
      repeatCount: 1,
    });

    const verdictOk = v.verdict === c.expect;
    const roastOk =
      v.roast.length <= 500 &&
      v.roast.length > 0 &&
      !v.roast.includes("—") &&
      !BAD_WORDS.some((w) => new RegExp(`\\b${w}\\b`, "i").test(v.roast));
    const cardOk = v.card_line.length > 0 && v.card_line.length <= 120;

    const sanitized = sanitizeSwap(v.swap);
    const gotConcrete = sanitized !== null;
    let swapOk = true;
    switch (c.swap_expect) {
      case "concrete":
        swapOk = gotConcrete;
        break;
      case "null_only":
        swapOk = !gotConcrete;
        break;
      case "concrete_or_null":
      case "any":
        swapOk = true;
        break;
    }

    let venueOk = true;
    if (sanitized) {
      const cta = buildSwapCTA(sanitized);
      switch (c.venue_expect) {
        case "amazon":
          venueOk = cta.venue === "amazon";
          break;
        case "shopping":
          venueOk = cta.venue === "shopping";
          break;
        case "amazon_or_null":
          venueOk = cta.venue === "amazon";
          break;
        case "shopping_or_amazon_or_null":
        case "any":
          venueOk = true;
          break;
      }
    } else {
      // No swap; only the "amazon" or "shopping" hard-expects fail here.
      if (c.venue_expect === "amazon" || c.venue_expect === "shopping") venueOk = false;
    }

    const ok = verdictOk && roastOk && cardOk && swapOk && venueOk;
    if (ok) pass++;
    const status = ok ? "PASS" : "FAIL";
    let swapDisplay = "null";
    if (sanitized) {
      const cta = buildSwapCTA(sanitized);
      swapDisplay = `${sanitized.name}${sanitized.est_price ? ` $${sanitized.est_price}` : ""} [${cta.venue}]`;
    }
    console.log(
      `${status.padEnd(4)}  ${c.title.slice(0, 42).padEnd(42)}  ${v.verdict}/${v.grade}  swap=${swapDisplay}`
    );
    if (!ok) {
      console.log(
        `      verdictOk=${verdictOk} roastOk=${roastOk} cardOk=${cardOk} swapOk=${swapOk} venueOk=${venueOk} raw_swap=${JSON.stringify(v.swap)}`
      );
    }
  }
  console.log(`\n${pass}/${cases.length} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
