import type { Outcome } from "@/lib/store";

type Props = { outcome: Outcome };

// Renders a rotated marker-style stamp on the beatdown card once the user has
// confessed an outcome. Absent when the entry is still pending, so the ledger
// entry visually stays "unstamped" until the outcome is picked.
export default function OutcomeStamp({ outcome }: Props) {
  if (outcome === "unconfirmed") return null;
  const config: Record<
    Exclude<Outcome, "unconfirmed">,
    { label: string; color: string; rotate: number }
  > = {
    walked_away: { label: "WALKED", color: "text-spared border-spared", rotate: -8 },
    took_swap: { label: "SWAPPED", color: "text-swap border-swap", rotate: 6 },
    bought_anyway: { label: "IGNORED", color: "text-marker border-marker", rotate: -6 },
  };
  const c = config[outcome as Exclude<Outcome, "unconfirmed">];
  return (
    <div
      className={`inline-flex items-center justify-center border-[4px] ${c.color} bg-paper px-4 py-1 font-marker text-2xl shadow-stampSm`}
      style={{ transform: `rotate(${c.rotate}deg)` }}
      aria-label={`Outcome stamp: ${c.label}`}
    >
      {c.label}
    </div>
  );
}
