import PaperSurface from "@/components/PaperSurface";
import PriceSlash from "@/components/PriceSlash";
import HighlightSave from "@/components/HighlightSave";
import OutcomeBlock from "@/components/OutcomeBlock";
import { supabaseService } from "@/lib/supabase";
import { amazonSearchUrl } from "@/lib/verdict";
import Link from "next/link";

export const dynamic = "force-dynamic";

type LockerRow = {
  id: string;
  verdict_id: string;
  status: "watching" | "released" | "dismissed";
  last_price: number | null;
  verdicts: {
    id: string;
    title: string;
    price: number;
    domain: string;
    image: string | null;
    url: string;
    outcome: "unconfirmed" | "walked_away" | "took_swap" | "bought_anyway";
  } | null;
};

export default async function LockerPage() {
  const sb = supabaseService();
  let rows: LockerRow[] = [];
  if (sb) {
    const { data } = await sb
      .from("lockers")
      .select("id, verdict_id, status, last_price, verdicts(id, title, price, domain, image, url, outcome)")
      .order("created_at", { ascending: false })
      .limit(50);
    rows = ((data as unknown as LockerRow[]) || []).filter((r) => r.verdicts);
  }
  const tag = process.env.AMAZON_AFFILIATE_TAG || null;

  return (
    <PaperSurface withHoles>
      <div className="px-5">
        <h1 className="mt-4 font-marker text-3xl">Stuffed in lockers</h1>
        <p className="mt-2 text-inkSoft">Trashed items sitting in the dark waiting to drop.</p>

        {rows.length === 0 ? (
          <div className="mt-8 rounded border-2 border-dashed border-ink/40 p-4 text-inkSoft">
            No lockers yet. Get a verdict first.
            <div className="mt-2">
              <Link href="/" className="underline">
                Go bully a link
              </Link>
            </div>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {rows.map((r) => {
              const v = r.verdicts!;
              const dropped =
                r.status === "released" &&
                r.last_price !== null &&
                r.last_price < v.price;
              const savings = r.last_price !== null ? v.price - r.last_price : 0;
              return (
                <li key={r.id} className="rounded border-2 border-ink/30 p-3 bg-paper">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-xs uppercase text-inkSoft">{v.domain}</div>
                      <div className="font-body text-ink line-clamp-2">{v.title}</div>
                      <div className="mt-1 flex items-center gap-2">
                        {dropped ? (
                          <>
                            <PriceSlash amount={v.price} size="sm" />
                            <span className="font-marker text-swap">${r.last_price!.toFixed(2)}</span>
                            <HighlightSave>save ${savings.toFixed(2)}</HighlightSave>
                          </>
                        ) : (
                          <span className="font-marker text-ink">${v.price.toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {r.status === "watching" && (
                        <span className="font-marker text-xs text-inkSoft">Watching</span>
                      )}
                      {r.status === "released" && (
                        <span className="font-marker text-sm text-marker">wants out</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <a
                      href={amazonSearchUrl(v.title, tag)}
                      target="_blank"
                      rel="noopener nofollow sponsored"
                      className="text-sm underline text-ink"
                    >
                      Look it up
                    </a>
                    <Link href={`/b/${v.id}`} className="text-sm underline text-inkSoft">
                      See the beatdown
                    </Link>
                  </div>
                  <div className="mt-2">
                    <OutcomeBlock id={v.id} initialOutcome={v.outcome} compact />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PaperSurface>
  );
}
