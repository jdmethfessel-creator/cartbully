"use client";
import { useEffect, useState } from "react";
import OutcomeBlock from "./OutcomeBlock";

type Stored = { id: string; title: string; t: number };

export default function LastVisitBanner() {
  const [item, setItem] = useState<Stored | null>(null);
  const [outcome, setOutcome] = useState<"unconfirmed" | "walked_away" | "took_swap" | "bought_anyway">("unconfirmed");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem("cb_last_verdict");
        if (!raw) return;
        const parsed = JSON.parse(raw) as Stored;
        // Show only if it's been at least 30 minutes since last look, less than 14 days.
        const age = Date.now() - parsed.t;
        if (age < 30 * 60 * 1000 || age > 14 * 24 * 3600 * 1000) return;
        const r = await fetch(`/api/verdict/${parsed.id}/status`);
        if (r.ok) {
          const data = await r.json();
          if (data.outcome && data.outcome !== "unconfirmed") return;
          setOutcome("unconfirmed");
        }
        setItem(parsed);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading || !item) return null;
  return (
    <div className="mx-5 mt-4 rounded border-2 border-ink/40 bg-hilite/40 p-3">
      <div className="font-marker text-sm text-ink">Last time: {truncate(item.title, 40)}.</div>
      <div className="text-inkSoft text-xs mb-2">What happened?</div>
      <OutcomeBlock id={item.id} initialOutcome={outcome} compact />
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
