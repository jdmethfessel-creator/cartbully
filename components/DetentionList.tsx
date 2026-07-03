"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Row = {
  id: string;
  verdict_id: string;
  release_at: string;
  verdicts: { id: string; title: string; url: string } | null;
};

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "released";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export default function DetentionList({ rows }: { rows: Row[] }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (rows.length === 0) {
    return (
      <p className="mt-2 text-inkSoft text-sm">No items are sitting in detention right now.</p>
    );
  }

  const now = Date.now();
  const expired = rows.filter((r) => new Date(r.release_at).getTime() <= now);
  const active = rows.filter((r) => new Date(r.release_at).getTime() > now);

  return (
    <div className="mt-3 space-y-3">
      {expired.map((r) => (
        <div
          key={r.id}
          className="rounded border-2 border-marker bg-paper p-3"
        >
          <div className="font-marker text-marker text-sm">Detention&apos;s over. Still want it?</div>
          <div className="mt-1 text-ink text-sm line-clamp-2">
            {r.verdicts?.title || "Unknown item"}
          </div>
          <div className="mt-2 flex gap-3 text-sm">
            {r.verdicts?.id && (
              <Link
                href={`/b/${r.verdicts.id}`}
                className="underline text-ink"
              >
                See the beatdown
              </Link>
            )}
            {r.verdicts?.url && (
              <Link
                href={`/?url=${encodeURIComponent(r.verdicts.url)}`}
                className="font-marker text-marker underline underline-offset-2"
              >
                Re-verdict it
              </Link>
            )}
          </div>
        </div>
      ))}
      {active.map((r) => {
        const remaining = new Date(r.release_at).getTime() - now;
        return (
          <div
            key={r.id}
            className="rounded border-2 border-dashed border-ink/40 bg-paper p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-ink text-sm line-clamp-2">
                {r.verdicts?.title || "Unknown item"}
              </div>
              <div className="font-marker text-inkSoft text-sm shrink-0">
                {fmtCountdown(remaining)}
              </div>
            </div>
            {r.verdicts?.id && (
              <Link
                href={`/b/${r.verdicts.id}`}
                className="mt-1 inline-block text-xs text-inkSoft underline"
              >
                See the beatdown
              </Link>
            )}
          </div>
        );
      })}
      {/* tick keeps the countdown fresh */}
      <span data-tick={tick} className="hidden" />
    </div>
  );
}
