/**
 * Manual QA harness. Runs each test product through the verdict engine and prints
 * a pass/fail table against expected verdict + basic guardrails.
 *
 * Run: npx tsx tests/run-verdicts.ts
 */
import { readFile } from "fs/promises";
import path from "path";
import { runVerdict } from "../lib/verdict";

type Case = {
  title: string;
  price: number;
  domain: string;
  expect: "TRASHED" | "SPARED";
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
      v.roast.length <= 240 &&
      !v.roast.includes("—") &&
      !BAD_WORDS.some((w) => new RegExp(`\\b${w}\\b`, "i").test(v.roast));
    const status = verdictOk && roastOk ? "PASS" : "FAIL";
    if (verdictOk && roastOk) pass++;
    console.log(`${status.padEnd(4)}  ${c.title.slice(0, 40).padEnd(40)}  → ${v.verdict}/${v.grade}  ${v.roast}`);
  }
  console.log(`\n${pass}/${cases.length} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
