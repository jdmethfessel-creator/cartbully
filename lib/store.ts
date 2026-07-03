import { supabaseService } from "./supabase";
import type { VerdictJson } from "./verdict";

// All persistence gated on Supabase availability. When disabled, verdicts are ephemeral,
// cached only in an in-memory Map so a fresh dyno still functions in dev.

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
  math: VerdictJson["math"];
  swap: VerdictJson["swap"];
  meanness: string;
  category: string;
  user_or_anon_key: string;
  created_at: string;
  shareable: boolean;
};

const memory = new Map<string, StoredVerdict>();
const cacheByKey = new Map<string, StoredVerdict>();

function cacheKey(url: string, meanness: string) {
  return `${url}::${meanness}`;
}

function newId() {
  return Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6);
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

export async function saveVerdict(v: Omit<StoredVerdict, "id" | "created_at">): Promise<StoredVerdict> {
  const row: StoredVerdict = {
    ...v,
    id: newId(),
    created_at: new Date().toISOString(),
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
    if (data) return data as StoredVerdict;
  }
  return memory.get(id) || null;
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
    return (data as StoredVerdict[]) || [];
  }
  return Array.from(memory.values())
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
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
