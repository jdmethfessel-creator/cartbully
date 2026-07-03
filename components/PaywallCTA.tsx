"use client";
import { useState } from "react";
import MarkerButton from "./MarkerButton";

export default function PaywallCTA() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState<string | null>(null);

  async function hire() {
    setLoading(true);
    setNote(null);
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email || null }),
      });
      const data = await r.json();
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      if (data?.error === "not_configured") {
        setNote("Payments not connected yet. Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID.");
      } else {
        setNote("Checkout hiccup. Try again.");
      }
    } catch {
      setNote("Network went sideways.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        type="email"
        placeholder="your email (for the receipt)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded border-2 border-ink bg-paper px-3 py-3 font-body outline-none focus:ring-2 focus:ring-marker/40"
      />
      <MarkerButton variant="primary" block onClick={hire} disabled={loading}>
        {loading ? "Getting the bully..." : "Hire the bully"}
      </MarkerButton>
      {note && <p className="text-sm text-marker">{note}</p>}
    </div>
  );
}
