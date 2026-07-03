import PaperSurface from "@/components/PaperSurface";
import Wordmark from "@/components/Wordmark";

export const metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <PaperSurface withHoles>
      <div className="px-5 space-y-4">
        <Wordmark size="sm" />
        <h1 className="font-marker text-3xl mt-4">Privacy, kept plain.</h1>
        <p>
          We store the URLs you paste, the verdicts we return, and lightweight event counts so we
          can improve the product. Anonymous users are tracked by a cookie identifier plus a
          hashed IP + user-agent fingerprint used only for the free counter.
        </p>
        <p>
          If you subscribe, Stripe holds your payment details. We store your email and your
          Stripe customer id so we can send drop alerts and open your billing portal.
        </p>
        <p>
          We do not sell your data. We share the minimum necessary with Supabase (database),
          Stripe (billing), Anthropic (verdict engine), Resend (email), and Vercel (hosting).
        </p>
        <p>
          Email us to delete your account and data. Cancellations stop future billing but do not
          automatically wipe history, ask if you want a full purge.
        </p>
      </div>
    </PaperSurface>
  );
}
