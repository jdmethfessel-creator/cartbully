import { NextRequest } from "next/server";
import { supabaseService } from "./supabase";

// Reads an optional Supabase access token from the Authorization header and
// resolves it to a user. Returns null when there's no token, no Supabase
// configured, or the token is invalid.
export async function getServerUser(
  req: NextRequest | Request
): Promise<{ id: string; email: string | null } | null> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const sb = supabaseService();
  if (!sb) return null;
  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}
