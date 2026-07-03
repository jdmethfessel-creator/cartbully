import PaperSurface from "@/components/PaperSurface";
import Wordmark from "@/components/Wordmark";
import HighlightSave from "@/components/HighlightSave";
import { supabaseService } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Row = { verdict: string; price: number; swap: unknown; created_at: string };

export default async function LedgerPage() {
  const sb = supabaseService();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  let rows: Row[] = [];
  if (sb) {
    const { data } = await sb
      .from("verdicts")
      .select("verdict, price, swap, created_at")
      .gte("created_at", start.toISOString())
      .order("created_at", { ascending: false })
      .limit(500);
    rows = (data as Row[]) || [];
  }

  const trashed = rows.filter((r) => r.verdict === "TRASHED");
  const swaps = rows.filter((r) => r.swap !== null && r.swap !== undefined);
  const attemptedTotal = trashed.reduce((sum, r) => sum + Number(r.price || 0), 0);
  const swapSaved = swaps.reduce((sum, r) => {
    const s = r.swap as { est_price?: number } | null;
    if (!s || typeof s.est_price !== "number") return sum;
    return sum + Math.max(0, Number(r.price || 0) - Number(s.est_price));
  }, 0);
  const streakDays = calcStreak(rows);

  return (
    <PaperSurface withHoles>
      <div className="px-5">
        <Wordmark size="sm" />
        <h1 className="mt-6 font-marker text-3xl leading-tight">
          Lunch money <br />
          <HighlightSave>protected</HighlightSave>
        </h1>
        <p className="mt-2 text-inkSoft">
          Kept in your pocket. Attempted total, estimates included.
        </p>

        <div className="mt-6 rounded border-[3px] border-ink bg-paper p-5">
          <div className="font-marker text-6xl text-marker">
            ${attemptedTotal.toFixed(2)}
          </div>
          <div className="text-sm text-inkSoft mt-1">This week, trashed items total.</div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Cell label="Trashed" value={trashed.length.toString()} color="text-marker" />
          <Cell label="Swaps taken" value={swaps.length.toString()} color="text-swap" />
          <Cell label="Est. swap savings" value={`$${swapSaved.toFixed(2)}`} color="text-swap" />
          <Cell label="Clean streak days" value={String(streakDays)} color="text-spared" />
        </div>

        <p className="mt-6 text-[11px] text-inkSoft">
          Estimates only. Numbers reflect verdicts run inside CartBully. Full history requires a
          subscription.
        </p>
      </div>
    </PaperSurface>
  );
}

function Cell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded border-2 border-dashed border-ink/30 p-3">
      <div className={`font-marker text-2xl ${color}`}>{value}</div>
      <div className="text-xs uppercase tracking-widest text-inkSoft">{label}</div>
    </div>
  );
}

function calcStreak(rows: Row[]): number {
  const trashedDays = new Set(
    rows
      .filter((r) => r.verdict === "TRASHED")
      .map((r) => new Date(r.created_at).toDateString())
  );
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 30; i++) {
    if (trashedDays.has(cursor.toDateString())) streak++;
    else if (streak > 0) break;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
