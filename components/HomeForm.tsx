"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import MarkerButton from "./MarkerButton";
import { FREE_BEATDOWNS } from "@/config";

const KEY = "cb_free_used";

export default function HomeForm() {
  const [url, setUrl] = useState("");
  const [meanness, setMeanness] = useState<"mild" | "medium" | "merciless">("medium");
  const [needsPrice, setNeedsPrice] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showMeanness, setShowMeanness] = useState(false);
  const router = useRouter();

  function used(): number {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem(KEY) || "0");
  }

  function bump() {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEY, String(used() + 1));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!url) return;
    if (used() >= FREE_BEATDOWNS && !localStorage.getItem("cb_sub")) {
      router.push("/paywall");
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = { url, meanness };
      if (needsPrice && priceInput) body.priceOverride = Number(priceInput);
      const res = await fetch("/api/verdict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 422 && data?.error === "need_price") {
        setNeedsPrice(true);
        setError("Couldn't find a price on that page. Type it in.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError("The bully choked. Try again.");
        setLoading(false);
        return;
      }
      bump();
      router.push(`/b/${data.id}`);
    } catch {
      setError("Network went sideways. Try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block font-marker text-lg text-ink" htmlFor="url">
        Hand over the link
      </label>
      <input
        id="url"
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://..."
        className="w-full rounded border-2 border-ink bg-paper px-3 py-3 text-lg font-body outline-none focus:ring-2 focus:ring-marker/40"
        autoComplete="off"
        required
      />
      {needsPrice && (
        <div>
          <label className="block font-marker text-lg text-ink" htmlFor="price">
            Price on the page ($)
          </label>
          <input
            id="price"
            type="number"
            step="0.01"
            min="0"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            className="w-full rounded border-2 border-ink bg-paper px-3 py-3 text-lg font-body outline-none focus:ring-2 focus:ring-marker/40"
            required
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowMeanness((s) => !s)}
        className="text-inkSoft text-sm underline underline-offset-2"
      >
        Meanness: {meanness}
      </button>
      {showMeanness && (
        <div className="flex gap-2">
          {(["mild", "medium", "merciless"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMeanness(m)}
              className={`flex-1 rounded border-2 px-2 py-2 font-marker text-sm ${
                meanness === m ? "bg-marker text-paper border-marker" : "border-ink text-ink"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-marker text-sm">{error}</p>}

      <MarkerButton type="submit" variant="primary" block disabled={loading}>
        {loading ? "Bullying..." : "Bully it"}
      </MarkerButton>
    </form>
  );
}
