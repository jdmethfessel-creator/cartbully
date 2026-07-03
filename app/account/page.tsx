"use client";
import { useEffect, useState } from "react";
import PaperSurface from "@/components/PaperSurface";
import Wordmark from "@/components/Wordmark";
import MarkerButton from "@/components/MarkerButton";
import { createClient } from "@supabase/supabase-js";

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: true } });
}

export default function Account() {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [session, setSession] = useState<{ email?: string } | null>(null);

  useEffect(() => {
    const sb = client();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      if (data.session?.user?.email) setSession({ email: data.session.user.email });
    });
  }, []);

  async function sendMagicLink() {
    setLoading(true);
    setNote(null);
    const sb = client();
    if (!sb) {
      setNote("Auth not configured. Add Supabase env vars.");
      setLoading(false);
      return;
    }
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window !== "undefined" ? `${window.location.origin}/account` : undefined,
      },
    });
    setLoading(false);
    if (error) {
      setNote(error.message);
      return;
    }
    setSent(true);
  }

  async function portal() {
    setLoading(true);
    setNote(null);
    try {
      const r = await fetch("/api/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: session?.email || email }),
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

  async function signOut() {
    const sb = client();
    if (!sb) return;
    await sb.auth.signOut();
    setSession(null);
  }

  return (
    <PaperSurface withHoles>
      <div className="px-5">
        <Wordmark size="sm" />
        <h1 className="mt-6 font-marker text-3xl">Your account</h1>

        {session ? (
          <div className="mt-4 rounded border-2 border-ink/30 p-4">
            <p className="text-ink">
              Signed in as <span className="font-marker">{session.email}</span>
            </p>
            <button
              onClick={signOut}
              className="mt-2 text-inkSoft text-sm underline underline-offset-2"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="mt-4 rounded border-2 border-dashed border-ink/40 p-4">
            <p className="text-inkSoft text-sm">
              Sign in with a magic link to sync your ledger, locker, and subscription across
              devices.
            </p>
            {sent ? (
              <p className="mt-2 font-marker text-spared">
                Check your email. We sent the link.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded border-2 border-ink bg-paper px-3 py-3 font-body outline-none focus:ring-2 focus:ring-marker/40"
                />
                <MarkerButton
                  variant="secondary"
                  block
                  onClick={sendMagicLink}
                  disabled={loading || !email}
                >
                  {loading ? "Sending..." : "Send magic link"}
                </MarkerButton>
              </div>
            )}
          </div>
        )}

        <div className="mt-6">
          <h2 className="font-marker text-xl">Billing</h2>
          <p className="mt-1 text-inkSoft">Manage, cancel, or update card.</p>
          <div className="mt-3">
            <MarkerButton
              block
              variant="secondary"
              onClick={portal}
              disabled={loading || (!session && !email)}
            >
              {loading ? "Opening..." : "Open billing portal"}
            </MarkerButton>
            {note && <p className="mt-2 text-sm text-marker">{note}</p>}
          </div>
        </div>

        <p className="mt-8 text-xs text-inkSoft">
          A subscription unlocks unlimited beatdowns, meanness dial, locker price-watch, and full
          ledger history.
        </p>
      </div>
    </PaperSurface>
  );
}
