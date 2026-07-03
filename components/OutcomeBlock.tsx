"use client";
import { useState } from "react";
import type { Outcome } from "@/lib/store";

type Props = {
  id: string;
  initialOutcome?: Outcome;
  compact?: boolean;
};

const labels: Record<Exclude<Outcome, "unconfirmed">, string> = {
  walked_away: "Walked away",
  took_swap: "Took the cheap one",
  bought_anyway: "Bought it anyway",
};

export default function OutcomeBlock({ id, initialOutcome = "unconfirmed", compact = false }: Props) {
  const [outcome, setOutcome] = useState<Outcome>(initialOutcome);
  const [reaction, setReaction] = useState<string | null>(null);
  const [saving, setSaving] = useState<null | Exclude<Outcome, "unconfirmed">>(null);

  async function pick(o: Exclude<Outcome, "unconfirmed">) {
    if (saving || outcome !== "unconfirmed") return;
    setSaving(o);
    try {
      const r = await fetch("/api/outcome", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, outcome: o }),
      });
      const data = await r.json();
      if (r.ok) {
        setOutcome(o);
        setReaction(data.reaction);
      }
    } finally {
      setSaving(null);
    }
  }

  if (outcome !== "unconfirmed") {
    const color =
      outcome === "walked_away"
        ? "text-spared"
        : outcome === "took_swap"
        ? "text-swap"
        : "text-marker";
    return (
      <div className={compact ? "text-sm" : "mt-3"}>
        <span className={`font-marker ${color}`}>
          Outcome: {labels[outcome as Exclude<Outcome, "unconfirmed">]}
        </span>
        {reaction && <p className="mt-1 text-inkSoft italic">&ldquo;{reaction}&rdquo;</p>}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
          <button
            key={k}
            onClick={() => pick(k)}
            disabled={saving !== null}
            className="rounded border border-ink/40 bg-paper px-2 py-1 text-xs font-marker text-ink hover:bg-ink hover:text-paper transition"
          >
            {labels[k]}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded border-2 border-dashed border-ink/40 p-4 bg-paper">
      <h3 className="font-marker text-xl">So what did you do?</h3>
      <p className="text-sm text-inkSoft">Confess. The bully is keeping score.</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          onClick={() => pick("walked_away")}
          disabled={saving !== null}
          className="rounded border-2 border-spared bg-paper py-2 font-marker text-spared shadow-stampSm hover:bg-spared hover:text-paper transition"
        >
          {saving === "walked_away" ? "..." : "Walked away"}
        </button>
        <button
          onClick={() => pick("took_swap")}
          disabled={saving !== null}
          className="rounded border-2 border-swap bg-paper py-2 font-marker text-swap shadow-stampSm hover:bg-swap hover:text-paper transition"
        >
          {saving === "took_swap" ? "..." : "Took the cheap one"}
        </button>
        <button
          onClick={() => pick("bought_anyway")}
          disabled={saving !== null}
          className="rounded border-2 border-marker bg-paper py-2 font-marker text-marker shadow-stampSm hover:bg-marker hover:text-paper transition"
        >
          {saving === "bought_anyway" ? "..." : "Bought it anyway"}
        </button>
      </div>
    </div>
  );
}
