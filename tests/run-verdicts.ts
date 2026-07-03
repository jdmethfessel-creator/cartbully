/**
 * Manual QA harness. Runs each test product through the verdict engine and
 * prints pass/fail against expected verdict, roast guardrails, and swap-quality
 * expectations.
 *
 * Run: npx tsx tests/run-verdicts.ts
 */
import { readFile } from "fs/promises";
import path from "path";
import { runVerdict, sanitizeSwap } from "../lib/verdict";

type Case = {
  title: string;
  price: number;
  domain: string;
  expect: "TRASHED" | "SPARED";
  swap_expect: "concrete" | "concrete_or_null" | "null_only" | "any";
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
      meanness: "medium",
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
        // The sanitizer will drop any non-concrete swap to null, so either is fine.
        swapOk = true;
        break;
      case "any":
        swapOk = true;
        break;
    }

    const ok = verdictOk && roastOk && cardOk && swapOk;
    if (ok) pass++;
    const status = ok ? "PASS" : "FAIL";
    const swapDisplay = sanitized
      ? `${sanitized.name}${sanitized.est_price ? ` $${sanitized.est_price}` : ""}`
      : "null";
    console.log(
      `${status.padEnd(4)}  ${c.title.slice(0, 42).padEnd(42)}  ${v.verdict}/${v.grade}  swap=${swapDisplay}`
    );
    if (!ok) {
      console.log(
        `      verdictOk=${verdictOk} roastOk=${roastOk} cardOk=${cardOk} swapOk=${swapOk} raw_swap=${JSON.stringify(
          v.swap
        )}`
      );
    }
  }
  console.log(`\n${pass}/${cases.length} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
