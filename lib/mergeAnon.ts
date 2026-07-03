import { supabaseService } from "./supabase";

// Re-key all rows owned by an anonymous key over to a signed-in user's key.
// Called from the Stripe webhook after a user completes checkout and we
// know the buyer's email + auth user id.

export async function mergeAnonHistoryTo(userId: string, anonCombined: string) {
  if (!userId || !anonCombined) return;
  const sb = supabaseService();
  if (!sb) return;
  const newKey = `user:${userId}`;
  const tables = ["verdicts", "lockers", "detentions"] as const;
  for (const t of tables) {
    await sb.from(t).update({ user_or_anon_key: newKey }).eq("user_or_anon_key", anonCombined);
  }
}

export async function ensureAuthUserByEmail(email: string): Promise<string | null> {
  const sb = supabaseService();
  if (!sb) return null;
  // Look up existing user first.
  try {
    const admin = sb.auth.admin;
    const found = await admin.listUsers({ page: 1, perPage: 200 });
    const match = found.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    const created = await admin.createUser({
      email,
      email_confirm: true,
    });
    return created.data.user?.id ?? null;
  } catch {
    return null;
  }
}
