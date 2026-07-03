import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseService } from "@/lib/supabase";
import { ensureAuthUserByEmail, mergeAnonHistoryTo } from "@/lib/mergeAnon";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function upsertSubscriber(row: {
  email: string | null;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  status: string;
  current_period_end: string | null;
}) {
  const sb = supabaseService();
  if (!sb) return;
  await sb
    .from("subscribers")
    .upsert(
      {
        ...row,
        email: row.email?.toLowerCase() ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_customer_id" }
    );
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: "not_configured" }, { status: 400 });

  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig!, secret);
  } catch {
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const customerId = (s.customer as string) || "";
        const subId = (s.subscription as string) || null;
        const email = (s.customer_details?.email as string) || (s.customer_email as string) || null;
        const anonCombined = (s.metadata?.anon_combined as string) || "";
        if (customerId) {
          await upsertSubscriber({
            email,
            stripe_customer_id: customerId,
            stripe_subscription_id: subId,
            status: "active",
            current_period_end: null,
          });
        }
        // Provision an auth user for the buyer and merge anonymous history over.
        if (email && anonCombined) {
          const userId = await ensureAuthUserByEmail(email);
          const sb = supabaseService();
          if (userId) {
            if (sb) {
              await sb
                .from("subscribers")
                .update({ user_id: userId })
                .eq("stripe_customer_id", customerId);
              await sb
                .from("profiles")
                .upsert({ id: userId, email: email.toLowerCase() }, { onConflict: "id" });
            }
            await mergeAnonHistoryTo(userId, anonCombined);
          }
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const stripeAny = sub as unknown as { current_period_end?: number };
        const periodEnd = stripeAny.current_period_end
          ? new Date(stripeAny.current_period_end * 1000).toISOString()
          : null;
        await upsertSubscriber({
          email: null,
          stripe_customer_id: customerId,
          stripe_subscription_id: sub.id,
          status: sub.status,
          current_period_end: periodEnd,
        });
        break;
      }
      default:
        break;
    }
  } catch {
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
