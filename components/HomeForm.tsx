"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MarkerButton from "./MarkerButton";
import { FREE_BEATDOWNS } from "@/config";
import { createClient } from "@supabase/supabase-js";

const KEY = "cb_free_used";

type Preview = {
  title: string;
  price: number | null;
  image: string | null;
  domain: string;
} | null;

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: true } });
}

export default function HomeForm() {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<Preview>(null);
  const [previewing, setPreviewing] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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

  async function doPreview(nextUrl: string) {
    setPreviewing(true);
    setError(null);
    try {
      const r = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: nextUrl }),
      });
      if (!r.ok) {
        setPreview(null);
        return;
      }
      const data = (await r.json()) as Preview;
      setPreview(data);
    } catch {
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!url) return;

    // If we have not previewed the URL yet, preview first so the user sees
    // what CartBully thinks they pasted before we run the roast.
    if (!preview || preview.title === "" ) {
      await doPreview(url);
      return;
    }

    if (used() >= FREE_BEATDOWNS && !localStorage.getItem("cb_sub")) {
      router.push("/paywall");
      return;
    }

    // Price rules: use scraped price when we have it, otherwise the manual field.
    const effectivePrice =
      preview.price != null ? preview.price : priceInput ? Number(priceInput) : null;
    if (effectivePrice == null || !isFinite(effectivePrice) || effectivePrice <= 0) {
      setError("Type the price on the page.");
      return;
    }

    setLoading(true);
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
          priceOverride: effectivePrice,
          titleOverride: preview.title,
          imageOverride: preview.image,
        }),
      });
      const data = await res.json();
      if (res.status === 402 && data?.error === "paywall") {
        router.push("/paywall");
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

  const needsPrice = preview && preview.price == null;

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
          if (preview) setPreview(null);
        }}
        onBlur={() => {
          if (url && !preview) doPreview(url);
        }}
        placeholder="https://..."
        className="w-full rounded border-2 border-ink bg-paper px-3 py-3 text-lg font-body outline-none focus:ring-2 focus:ring-marker/40"
        autoComplete="off"
        required
      />

      {previewing && (
        <p className="text-inkSoft text-sm">Reading the page...</p>
      )}

      {preview && (
        <div className="rounded border-2 border-dashed border-ink/40 bg-paper p-3">
          <div className="flex gap-3">
            {preview.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.image}
                alt=""
                className="h-16 w-16 object-contain border border-ink/20 bg-paper"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-inkSoft text-xs uppercase">{preview.domain}</div>
              <div className="text-ink text-sm line-clamp-2">{preview.title}</div>
              {preview.price != null && (
                <div className="font-marker text-ink text-lg">
                  ${preview.price.toFixed(2)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

      {error && <p className="text-marker text-sm">{error}</p>}

      <MarkerButton type="submit" variant="primary" block disabled={loading || previewing}>
        {loading ? "Bullying..." : preview ? "Bully it" : "Read the page"}
      </MarkerButton>
    </form>
  );
}
