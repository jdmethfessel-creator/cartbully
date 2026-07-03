import PaperSurface from "@/components/PaperSurface";
import StickyNote from "@/components/StickyNote";
import Wordmark from "@/components/Wordmark";
import HomeForm from "@/components/HomeForm";
import { recentVerdicts, tallyForToday } from "@/lib/store";
import Link from "next/link";

const slogans = [
  "Finally, a bully on your side.",
  "It picks on your cart, not you.",
  "Protecting your lunch money since day one.",
];

export const dynamic = "force-dynamic";

export default async function Home() {
  const [tally, recent] = await Promise.all([tallyForToday(), recentVerdicts(6)]);
  const slogan = slogans[Math.floor(Math.random() * slogans.length)];

  return (
    <PaperSurface withHoles>
      <header className="flex items-start justify-between px-5">
        <Wordmark size="md" />
        <StickyNote rotate={7} className="text-sm">put it back.</StickyNote>
      </header>

      <section className="px-5 pt-8">
        <h1 className="font-marker text-4xl leading-tight text-ink" style={{ transform: "rotate(-1deg)" }}>
          What&apos;s the cart <br /> trying to pull <span className="text-marker">now?</span>
        </h1>
        <p className="mt-3 text-inkSoft">Paste a link. Get roasted. Save the money.</p>
      </section>

      <section className="px-5 pt-6">
        <HomeForm />
      </section>

      <section className="px-5 pt-10">
        <h2 className="font-marker text-2xl text-ink">Today&apos;s victims</h2>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          <TallyCell label="TRASHED" value={tally.trashed} color="text-marker" />
          <TallyCell label="SPARED" value={tally.spared} color="text-spared" />
          <TallyCell label="SWAPPED" value={tally.swapped} color="text-swap" />
        </div>
      </section>

      {recent.length > 0 && (
        <section className="px-5 pt-8">
          <h3 className="font-marker text-xl">Recent beatdowns</h3>
          <ul className="mt-2 space-y-2">
            {recent.map((r) => (
              <li key={r.id} className="border-b border-dashed border-ink/20 pb-2">
                <Link href={`/b/${r.id}`} className="flex items-center gap-2">
                  <span
                    className={`font-marker text-sm ${
                      r.verdict === "TRASHED" ? "text-marker" : "text-spared"
                    }`}
                  >
                    {r.verdict}
                  </span>
                  <span className="text-sm text-ink line-clamp-1">{r.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="px-5 pt-12 pb-8 text-center">
        <p className="font-marker text-inkSoft text-lg" style={{ transform: "rotate(-1deg)" }}>
          {slogan}
        </p>
      </footer>
    </PaperSurface>
  );
}

function TallyCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded border-2 border-ink/20 bg-paper py-3">
      <div className={`font-marker text-3xl ${color}`}>{value}</div>
      <div className="text-xs uppercase tracking-widest text-inkSoft">{label}</div>
    </div>
  );
}
