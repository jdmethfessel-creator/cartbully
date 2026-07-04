import { notFound } from "next/navigation";
import PaperSurface from "@/components/PaperSurface";
import VerdictScrawl from "@/components/VerdictScrawl";
import GradeCircle from "@/components/GradeCircle";
import PriceSlash from "@/components/PriceSlash";
import HighlightSave from "@/components/HighlightSave";
import MarkerButton from "@/components/MarkerButton";
import BeatdownActions from "@/components/BeatdownActions";
import FightBack from "@/components/FightBack";
import OutcomeBlock from "@/components/OutcomeBlock";
import OutcomeStamp from "@/components/OutcomeStamp";
import LastBeatdownCookie from "@/components/LastBeatdownCookie";
import { getVerdictById } from "@/lib/store";
import { buildSwapCTA } from "@/lib/verdict";
import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const v = await getVerdictById(params.id);
  if (!v) return { title: "Beatdown not found" };
  const title = `${v.verdict}: ${v.title}`;
  const description = v.roast;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [`/b/${v.id}/opengraph-image`],
      type: "article",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function BeatdownPage({ params }: Params) {
  const v = await getVerdictById(params.id);
  if (!v) return notFound();

  const tag = process.env.AMAZON_AFFILIATE_TAG || null;
  const swap = v.swap;
  const swapCTA = swap ? buildSwapCTA(swap, tag) : null;
  const timestamp = new Date(v.created_at).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const isTrashed = v.verdict === "TRASHED";
  const swapSaves =
    swap && typeof swap.est_price === "number" ? Math.max(0, v.price - swap.est_price) : null;

  return (
    <PaperSurface withHoles>
      <div className="px-5 pt-4">
        <Link href="/" aria-label="Bully another product">
          <MarkerButton variant="primary" block>
            Bully another
          </MarkerButton>
        </Link>
      </div>

      <header className="flex items-start justify-between px-5 pt-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-inkSoft">
            Caught at checkout
          </div>
          <div className="text-sm text-inkSoft">{timestamp}</div>
        </div>
        <GradeCircle grade={v.grade} />
      </header>

      <section className="px-5 pt-4">
        <div className="text-inkSoft text-xs uppercase">from {v.domain}</div>
        <h1 className="mt-1 font-marker text-3xl leading-tight text-ink">{v.title}</h1>
        {v.product_type && (
          <div className="mt-1 text-inkSoft text-xs uppercase tracking-widest">
            item type: {v.product_type}
          </div>
        )}
        {v.image && (
          <div className="mt-3 overflow-hidden rounded border-2 border-ink/20 bg-paper">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={v.image}
              alt=""
              className="w-full h-auto max-h-72 object-contain"
              loading="lazy"
            />
          </div>
        )}
        <div className="mt-3 flex items-baseline gap-3">
          {isTrashed ? (
            <PriceSlash amount={v.price} size="lg" />
          ) : (
            <span className="font-marker text-3xl text-ink">${v.price.toFixed(2)}</span>
          )}
        </div>
      </section>

      <div className="relative">
        <VerdictScrawl verdict={isTrashed ? "TRASHED" : "SPARED"} size="xl" />
        {!isTrashed && (
          <p className="text-center text-inkSoft font-marker -mt-1">...this time.</p>
        )}
        {v.outcome !== "unconfirmed" && (
          <div className="pointer-events-none absolute right-3 top-2">
            <OutcomeStamp outcome={v.outcome} />
          </div>
        )}
      </div>
      {v.outcome === "unconfirmed" && (
        <p className="text-center text-inkSoft text-xs -mt-3 mb-2 uppercase tracking-widest">
          pending in the ledger
        </p>
      )}

      <section className="px-5 pt-4">
        <blockquote
          className="border-l-4 border-marker bg-paper px-4 py-3 font-body text-lg italic text-ink"
          style={{ transform: "rotate(-0.4deg)" }}
        >
          &ldquo;{v.roast}&rdquo;
        </blockquote>
      </section>

      <section className="px-5 pt-6">
        <h3 className="font-marker text-xl text-ink">The math, since you won&apos;t do it</h3>
        <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded border-2 border-dashed border-ink/30 p-3">
            <dt className="uppercase tracking-widest text-inkSoft text-xs">Uses a year</dt>
            <dd className="font-marker text-2xl text-ink">{v.math.est_uses_per_year}</dd>
          </div>
          <div className="rounded border-2 border-dashed border-ink/30 p-3">
            <dt className="uppercase tracking-widest text-inkSoft text-xs">Cost per use</dt>
            <dd className="font-marker text-2xl text-ink">{v.math.cost_per_use}</dd>
          </div>
        </dl>
        <p className="mt-2 text-inkSoft text-xs">Note: {v.math.note}</p>
      </section>

      {swap && swapCTA && (
        <section className="px-5 pt-6">
          <div className="rounded border-[3px] border-swap bg-paper p-4">
            <h3 className="font-marker text-xl text-swap">
              {swapCTA.venue === "amazon" ? "Take the cheap one and go" : "Cheaper option worth comparing"}
            </h3>
            <p className="mt-1 font-marker text-lg text-ink">{swap.name}</p>
            {typeof swap.est_price === "number" && swap.est_price > 0 && (
              <p className="mt-1 text-sm text-inkSoft">
                est. price <span className="font-marker text-ink">${swap.est_price.toFixed(2)}</span>{" "}
                <span className="italic">(estimate)</span>
              </p>
            )}
            <p className="mt-1 text-sm text-inkSoft">{swap.reason}</p>
            {swapSaves !== null && swapSaves > 0 && (
              <p className="mt-2">
                <HighlightSave>save about ${swapSaves.toFixed(2)}</HighlightSave>
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <a
                href={swapCTA.url}
                target="_blank"
                rel={swapCTA.rel}
                className="inline-flex items-center justify-center bg-swap text-paper font-marker px-4 py-2 border-2 border-swap shadow-stampSm"
              >
                {swapCTA.label}
              </a>
            </div>
            <p className="mt-3 text-[11px] text-inkSoft">
              CartBully may earn commission on swaps. The beatdown is never for sale.
            </p>
          </div>
        </section>
      )}

      {isTrashed && (
        <section className="px-5 pt-6">
          <div className="rounded bg-hilite/50 border-2 border-ink/20 p-3 font-marker text-ink">
            Stuffed that item in a locker. If the price ever begs, you&apos;ll hear about it.
          </div>
        </section>
      )}

      <section className="px-5 pt-6">
        <OutcomeBlock id={v.id} initialOutcome={v.outcome} />
      </section>

      <section className="px-5 pt-6">
        <BeatdownActions id={v.id} verdict={v.verdict} price={v.price} url={v.url} />
      </section>

      <FightBack id={v.id} />
      <LastBeatdownCookie id={v.id} title={v.title} />

      <section className="px-5 pt-6 pb-8">
        <p className="text-[11px] text-inkSoft">
          CartBully is entertainment with math in it. Verdicts are opinions, savings figures are
          estimates.
        </p>
      </section>
    </PaperSurface>
  );
}
