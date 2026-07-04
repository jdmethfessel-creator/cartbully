"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MarkerButton from "./MarkerButton";
import { FREE_BEATDOWNS } from "@/config";
import { createClient } from "@supabase/supabase-js";

const KEY = "cb_free_used";

type Phase = "idle" | "extracting" | "needsPrice" | "judging";

type PageContext = {
  jsonLdCategory: string | null;
  breadcrumbTrail: string[];
  ogDescriptionFirstSentence: string | null;
  titleTag: string | null;
  urlPathTokens: string[];
};

type ExtractResult = {
  url: string;
  title: string;
  price: number | null;
  currency: string;
  image: string | null;
  domain: string;
  page_context: PageContext;
};

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: true } });
}

export default function HomeForm() {
  const [url, setUrl] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [extract, setExtract] = useState<ExtractResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const q = searchParams.get("url");
    if (q) setUrl(q);
  }, [searchParams]);

  function used(): number {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem(KEY) || "0");
  }
  function bump() {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEY, String(used() + 1));
  }

  // The whole flow, one call. Extract, gate on price, then judge.
  async function runFullFlow(withPrice?: number) {
    setError(null);
    if (!url) return;
    if (used() >= FREE_BEATDOWNS && !localStorage.getItem("cb_sub")) {
      router.push("/paywall");
      return;
    }

    let currentExtract = extract;

    if (!currentExtract) {
      setPhase("extracting");
      try {
        const r = await fetch("/api/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (r.ok) {
          currentExtract = (await r.json()) as ExtractResult;
          setExtract(currentExtract);
        }
      } catch {
        currentExtract = null;
      }
    }

    const price = withPrice ?? currentExtract?.price ?? null;
    if (price == null) {
      setPhase("needsPrice");
      return;
    }

    setPhase("judging");
    try {
      const sb = client();
      const session = sb ? (await sb.auth.getSession()).data.session : null;
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (session?.access_token) headers.authorization = `Bearer ${session.access_token}`;
      const res = await fetch("/api/verdict", {
        method: "POST",
        headers,
        body: JSON.stringify({
          url,
          priceOverride: price,
          titleOverride: currentExtract?.title,
          imageOverride: currentExtract?.image,
          pageContextOverride: currentExtract?.page_context,
        }),
      });
      const data = await res.json();
      if (res.status === 402 && data?.error === "paywall") {
        router.push("/paywall");
        return;
      }
      if (!res.ok) {
        setError("The bully choked. Try again.");
        setPhase("idle");
        return;
      }
      bump();
      router.push(`/b/${data.id}`);
    } catch {
      setError("Network went sideways. Try again.");
      setPhase("idle");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (phase === "needsPrice") {
      const p = Number(priceInput);
      if (!isFinite(p) || p <= 0) {
        setError("Type the price on the page.");
        return;
      }
      await runFullFlow(p);
      return;
    }
    await runFullFlow();
  }

  const buttonLabel =
    phase === "extracting"
      ? "Reading the receipt..."
      : phase === "judging"
      ? "Sharpening the insults..."
      : phase === "needsPrice"
      ? "Continue"
      : "Bully it";
  const busy = phase === "extracting" || phase === "judging";

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block font-marker text-lg text-ink" htmlFor="url">
        Hand over the link
      </label>
      <input
        id="url"
        type="url"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setExtract(null);
          if (phase === "needsPrice") setPhase("idle");
        }}
        placeholder="https://..."
        className="w-full rounded border-2 border-ink bg-paper px-3 py-3 text-lg font-body outline-none focus:ring-2 focus:ring-marker/40"
        autoComplete="off"
        required
        disabled={busy}
      />

      {phase === "needsPrice" && (
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
            autoFocus
          />
        </div>
      )}

      {error && <p className="text-marker text-sm">{error}</p>}

      <MarkerButton type="submit" variant="primary" block disabled={busy}>
        {buttonLabel}
      </MarkerButton>
    </form>
  );
}
