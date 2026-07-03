"use client";
import { useState } from "react";
import MarkerButton from "./MarkerButton";

export default function FightBack({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);
  const [text, setText] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (used || !text.trim()) return;
    setLoading(true);
    try {
      const r = await fetch("/api/rebuttal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, text }),
      });
      const data = await r.json();
      if (r.ok && data?.verdict?.roast) {
        setReply(data.verdict.roast);
        setUsed(true);
      } else {
        setReply("The bully rolled its eyes and refused to answer.");
        setUsed(true);
      }
    } catch {
      setReply("Signal lost. Verdict stands.");
      setUsed(true);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <section className="px-5 pt-6">
        <MarkerButton variant="secondary" block onClick={() => setOpen(true)}>
          Fight back (1 shot)
        </MarkerButton>
      </section>
    );
  }

  return (
    <section className="px-5 pt-6">
      <div className="rounded border-2 border-ink p-4">
        <h3 className="font-marker text-xl text-ink">Make your case</h3>
        <p className="text-inkSoft text-sm">
          One try. The bully answers, then the verdict stands.
        </p>
        <form onSubmit={submit} className="mt-3 space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={used}
            className="w-full rounded border-2 border-ink bg-paper p-3 font-body outline-none focus:ring-2 focus:ring-marker/40"
            rows={3}
            placeholder="But I actually need it because..."
            maxLength={400}
          />
          <MarkerButton variant="primary" block type="submit" disabled={used || loading}>
            {loading ? "Sending..." : used ? "Answered" : "Try me"}
          </MarkerButton>
        </form>
        {reply && (
          <blockquote className="mt-3 border-l-4 border-marker bg-paper px-4 py-3 italic">
            &ldquo;{reply}&rdquo;
          </blockquote>
        )}
      </div>
    </section>
  );
}
