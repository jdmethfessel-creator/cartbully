import { supabaseService } from "./supabase";
import { firstSentence, type VerdictJson } from "./verdict";

// All persistence gated on Supabase availability. When disabled, verdicts are ephemeral,
// cached only in an in-memory Map so a fresh dyno still functions in dev.

export type Outcome = "unconfirmed" | "walked_away" | "took_swap" | "bought_anyway";

type StoredVerdict = {
  id: string;
  url: string;
  title: string;
  price: number;
  image: string | null;
  domain: string;
  verdict: VerdictJson["verdict"];
  grade: VerdictJson["grade"];
  roast: string;
  card_line: string | null;
  math: VerdictJson["math"];
  swap: VerdictJson["swap"];
  meanness: string;
  category: string;
  user_or_anon_key: string;
  created_at: string;
  shareable: boolean;
  outcome: Outcome;
  outcome_at: string | null;
};

// Legacy verdicts (pre card_line) fall back to the first sentence of the roast.
export function cardLineFor(v: Pick<StoredVerdict, "card_line" | "roast">): string {
  if (v.card_line && v.card_line.trim().length > 0) return v.card_line;
  return firstSentence(v.roast || "").slice(0, 120);
}

const memory = new Map<string, StoredVerdict>();
const cacheByKey = new Map<string, StoredVerdict>();

function cacheKey(url: string, meanness: string) {
  return `${url}::${meanness}`;
}

function newId() {
  return Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6);
}

// Postgres numeric columns arrive as strings via supabase-js. Normalize them
// on the read path so callers can treat price as a number without ceremony.
function coerce(v: StoredVerdict | null | undefined): StoredVerdict | null {
  if (!v) return null;
  return { ...v, price: typeof v.price === "string" ? Number(v.price) : v.price };
}

export async function findCachedVerdict(
  url: string,
  meanness: string
): Promise<StoredVerdict | null> {
  const key = cacheKey(url, meanness);
  const mem = cacheByKey.get(key);
  if (mem) return mem;
  const sb = supabaseService();
  if (!sb) return null;
  const { data } = await sb
    .from("verdicts")
    .select("*")
    .eq("url", url)
    .eq("meanness", meanness)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) return data as StoredVerdict;
  return null;
}

export async function saveVerdict(
  v: Omit<StoredVerdict, "id" | "created_at" | "outcome" | "outcome_at" | "card_line"> & {
    card_line?: string | null;
  }
): Promise<StoredVerdict> {
  const row: StoredVerdict = {
    ...v,
    card_line: v.card_line ?? null,
    id: newId(),
    created_at: new Date().toISOString(),
    outcome: "unconfirmed",
    outcome_at: null,
  };
  const sb = supabaseService();
  if (sb) {
    const { data, error } = await sb.from("verdicts").insert(row).select().single();
    if (!error && data) {
      cacheByKey.set(cacheKey(row.url, row.meanness), data as StoredVerdict);
      return data as StoredVerdict;
    }
  }
  memory.set(row.id, row);
  cacheByKey.set(cacheKey(row.url, row.meanness), row);
  return row;
}

export async function getVerdictById(id: string): Promise<StoredVerdict | null> {
  const sb = supabaseService();
  if (sb) {
    const { data } = await sb.from("verdicts").select("*").eq("id", id).maybeSingle();
    if (data) return coerce(data as StoredVerdict);
  }
  return coerce(memory.get(id) || null);
}

export async function setOutcome(id: string, outcome: Outcome): Promise<StoredVerdict | null> {
  const sb = supabaseService();
  if (sb) {
    const { data } = await sb
      .from("verdicts")
      .update({ outcome, outcome_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (data) {
      cacheByKey.set(cacheKey((data as StoredVerdict).url, (data as StoredVerdict).meanness), data as StoredVerdict);
      memory.set(id, data as StoredVerdict);
      // bought_anyway drops the locker row
      if (outcome === "bought_anyway") {
        await sb.from("lockers").delete().eq("verdict_id", id);
      }
      return data as StoredVerdict;
    }
    return null;
  }
  const existing = memory.get(id);
  if (!existing) return null;
  existing.outcome = outcome;
  existing.outcome_at = new Date().toISOString();
  memory.set(id, existing);
  return existing;
}

export async function unconfirmedForKey(userKey: string, limit = 1): Promise<StoredVerdict | null> {
  const sb = supabaseService();
  if (sb) {
    const { data } = await sb
      .from("verdicts")
      .select("*")
      .eq("user_or_anon_key", userKey)
      .eq("outcome", "unconfirmed")
      .order("created_at", { ascending: false })
      .limit(limit)
      .maybeSingle();
    return (data as StoredVerdict) || null;
  }
  const arr = Array.from(memory.values())
    .filter((v) => v.user_or_anon_key === userKey && v.outcome === "unconfirmed")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return arr[0] || null;
}

export async function repeatCountFor(userKey: string, url: string): Promise<number> {
  const sb = supabaseService();
  if (sb) {
    const { count } = await sb
      .from("verdicts")
      .select("id", { count: "exact", head: true })
      .eq("user_or_anon_key", userKey)
      .eq("url", url);
    return count ?? 0;
  }
  let n = 0;
  memory.forEach((v) => {
    if (v.user_or_anon_key === userKey && v.url === url) n++;
  });
  return n;
}

export async function recentVerdicts(limit = 6): Promise<StoredVerdict[]> {
  const sb = supabaseService();
  if (sb) {
    const { data } = await sb
      .from("verdicts")
      .select("*")
      .eq("shareable", true)
      .order("created_at", { ascending: false })
      .limit(limit);
    return ((data as StoredVerdict[]) || []).map((v) => coerce(v) as StoredVerdict);
  }
  return Array.from(memory.values())
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
    .map((v) => coerce(v) as StoredVerdict);
}

export async function tallyForToday(): Promise<{ trashed: number; spared: number; swapped: number }> {
  const sb = supabaseService();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  if (sb) {
    const { data } = await sb
      .from("verdicts")
      .select("verdict, swap")
      .gte("created_at", start.toISOString());
    const rows = (data as { verdict: string; swap: unknown }[]) || [];
    return {
      trashed: rows.filter((r) => r.verdict === "TRASHED").length,
      spared: rows.filter((r) => r.verdict === "SPARED").length,
      swapped: rows.filter((r) => r.swap !== null).length,
    };
  }
  const arr = Array.from(memory.values()).filter((v) => v.created_at >= start.toISOString());
  return {
    trashed: arr.filter((r) => r.verdict === "TRASHED").length,
    spared: arr.filter((r) => r.verdict === "SPARED").length,
    swapped: arr.filter((r) => r.swap !== null).length,
  };
}

export async function logEvent(name: string, props: Record<string, unknown> = {}) {
  const sb = supabaseService();
  if (!sb) return;
  await sb.from("events").insert({ name, props, created_at: new Date().toISOString() });
}

export type { StoredVerdict };
