import PaperSurface from "@/components/PaperSurface";
import Wordmark from "@/components/Wordmark";
import PaywallCTA from "@/components/PaywallCTA";
import { PRICING, FREE_BEATDOWNS } from "@/config";
import Link from "next/link";

export default function Paywall() {
  return (
    <PaperSurface withHoles>
      <div className="px-5">
        <Wordmark size="sm" />
        <h1
          className="mt-8 font-marker text-4xl text-ink"
          style={{ transform: "rotate(-1.5deg)" }}
        >
          The first {FREE_BEATDOWNS.toString()} were free.
        </h1>
        <p className="mt-3 text-inkSoft text-lg">
          Unlimited beatdowns, the full ledger, locker price-watch, and the meanness dial.
        </p>
        <p className="mt-2 text-ink text-lg">
          {PRICING.display}. Cheaper than whatever you were about to buy.
        </p>

        <div className="mt-6 space-y-2 text-ink">
          <div className="flex items-center gap-2">
            <span className="font-marker text-marker text-xl">✓</span>
            <span>Unlimited verdicts, no counter</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-marker text-marker text-xl">✓</span>
            <span>Locker price-watch with drop alerts</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-marker text-marker text-xl">✓</span>
            <span>Meanness dial (mild, medium, merciless)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-marker text-marker text-xl">✓</span>
            <span>Full ledger history</span>
          </div>
        </div>

        <div className="mt-8 space-y-3">
          <PaywallCTA />
          <Link
            href="/"
            className="block text-center text-inkSoft underline underline-offset-2"
          >
            Maybe later
          </Link>
        </div>

        <p className="mt-8 text-xs text-inkSoft">
          Cancel any time. Weekly billing. You can also open the billing portal from your account
          page.
        </p>
      </div>
    </PaperSurface>
  );
}
