import PaperSurface from "@/components/PaperSurface";
import HighlightSave from "@/components/HighlightSave";
import DetentionList from "@/components/DetentionList";
import { supabaseService } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  verdict: string;
  price: number;
  swap: { est_price?: number } | null;
  outcome: string;
  created_at: string;
  title: string;
};

type DetentionRow = {
  id: string;
  verdict_id: string;
  release_at: string;
  verdicts: { id: string; title: string; url: string } | null;
};

export default async function LedgerPage() {
  const sb = supabaseService();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  let rows: Row[] = [];
  let detentions: DetentionRow[] = [];
  if (sb) {
    const { data } = await sb
      .from("verdicts")
      .select("id, verdict, price, swap, outcome, created_at, title")
      .gte("created_at", start.toISOString())
      .order("created_at", { ascending: false })
      .limit(500);
    rows = (data as Row[]) || [];
    const { data: det } = await sb
      .from("detentions")
      .select("id, verdict_id, release_at, verdicts(id, title, url)")
      .order("release_at", { ascending: true })
      .limit(50);
    detentions = ((det as unknown as DetentionRow[]) || []).filter((r) => r.verdicts);
  }

  const walked = rows.filter((r) => r.outcome === "walked_away");
  const tookSwap = rows.filter((r) => r.outcome === "took_swap");
  const boughtAnyway = rows.filter((r) => r.outcome === "bought_anyway");
  const unconfirmed = rows.filter((r) => r.outcome === "unconfirmed" && r.verdict === "TRASHED");

  // Headline counts only confirmed outcomes.
  const savedWalking = walked.reduce((sum, r) => sum + Number(r.price || 0), 0);
  const savedSwapping = tookSwap.reduce((sum, r) => {
    const est = r.swap && typeof r.swap.est_price === "number" ? r.swap.est_price : null;
    if (est === null) return sum;
    return sum + Math.max(0, Number(r.price || 0) - Number(est));
  }, 0);
  const protectedTotal = savedWalking + savedSwapping;

  const ignoredTotal = boughtAnyway.reduce((sum, r) => sum + Number(r.price || 0), 0);
  const awaitingTotal = unconfirmed.reduce((sum, r) => sum + Number(r.price || 0), 0);

  const streakDays = calcStreak(walked);

  return (
    <PaperSurface withHoles>
      <div className="px-5">
        <h1 className="mt-4 font-marker text-3xl leading-tight">
          Lunch money <br />
          <HighlightSave>protected</HighlightSave>
        </h1>
        <p className="mt-2 text-inkSoft">
          Confirmed outcomes only. Estimates included, labeled where they apply.
        </p>

        <div className="mt-6 rounded border-[3px] border-ink bg-paper p-5">
          <div className="font-marker text-6xl text-marker">
            ${protectedTotal.toFixed(2)}
          </div>
          <div className="text-sm text-inkSoft mt-1">This week, kept in your pocket.</div>
        </div>

        <div className="mt-3 text-sm text-inkSoft">
          Awaiting confession: ${awaitingTotal.toFixed(2)} across {unconfirmed.length} trashed items.
        </div>

        {boughtAnyway.length > 0 && (
          <div className="mt-4 rounded border-2 border-marker bg-paper p-4">
            <div className="font-marker text-marker text-lg">
              Ignored the bully, {boughtAnyway.length} {boughtAnyway.length === 1 ? "time" : "times"}
            </div>
            <div className="text-inkSoft text-sm">
              ${ignoredTotal.toFixed(2)} spent against advice this week.
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Cell label="Walked away" value={walked.length.toString()} color="text-spared" />
          <Cell label="Swaps taken" value={tookSwap.length.toString()} color="text-swap" />
          <Cell label="Est. swap savings" value={`$${savedSwapping.toFixed(2)}`} color="text-swap" />
          <Cell label="Clean streak days" value={String(streakDays)} color="text-spared" />
        </div>

        <div className="mt-8">
          <h2 className="font-marker text-2xl text-ink">Detention hall</h2>
          <p className="text-inkSoft text-sm">
            Items on a 48h cooldown. When the timer expires you get a re-verdict link.
          </p>
          <DetentionList rows={detentions} />
        </div>

        <p className="mt-8 text-[11px] text-inkSoft">
          Estimates only. Numbers reflect confirmed outcomes on verdicts run inside CartBully.
          Full history requires a subscription.
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

function calcStreak(walked: Row[]): number {
  const days = new Set(walked.map((r) => new Date(r.created_at).toDateString()));
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 30; i++) {
    if (days.has(cursor.toDateString())) streak++;
    else if (streak > 0) break;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
