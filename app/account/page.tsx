"use client";
import { useState } from "react";
import PaperSurface from "@/components/PaperSurface";
import Wordmark from "@/components/Wordmark";
import MarkerButton from "@/components/MarkerButton";

export default function Account() {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function portal() {
    setLoading(true);
    setNote(null);
    try {
      const r = await fetch("/api/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await r.json();
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      if (data?.error === "not_found")
        setNote("No subscription found for that email. Try again.");
      else setNote("Portal not connected yet.");
    } catch {
      setNote("Network went sideways.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PaperSurface withHoles>
      <div className="px-5">
        <Wordmark size="sm" />
        <h1 className="mt-6 font-marker text-3xl">Your account</h1>
        <p className="mt-2 text-inkSoft">Manage billing, cancel, or update card.</p>

        <div className="mt-6 space-y-3">
          <input
            type="email"
            placeholder="email on your subscription"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border-2 border-ink bg-paper px-3 py-3 font-body outline-none focus:ring-2 focus:ring-marker/40"
          />
          <MarkerButton block variant="secondary" onClick={portal} disabled={loading || !email}>
            {loading ? "Opening..." : "Open billing portal"}
          </MarkerButton>
          {note && <p className="text-sm text-marker">{note}</p>}
        </div>

        <div className="mt-8 border-t border-dashed border-ink/30 pt-6">
          <p className="text-inkSoft text-sm">
            Signed up? A subscription unlocks unlimited beatdowns, meanness dial, locker
            price-watch, and full ledger history.
          </p>
        </div>
      </div>
    </PaperSurface>
  );
}
