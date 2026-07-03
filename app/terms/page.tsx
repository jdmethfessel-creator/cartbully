import PaperSurface from "@/components/PaperSurface";
import Wordmark from "@/components/Wordmark";

export const metadata = { title: "Terms" };

export default function Terms() {
  return (
    <PaperSurface withHoles>
      <div className="px-5 space-y-4">
        <Wordmark size="sm" />
        <h1 className="font-marker text-3xl mt-4">Terms, kept plain.</h1>
        <p>
          CartBully is a shopping-cart roast tool. It reads a product page, estimates whether
          buying it is a good idea, and shows you a verdict. All verdicts are opinions dressed up
          as attitude. Money math is estimated and clearly labeled as such.
        </p>
        <p>
          You agree not to abuse the service, not to submit content you do not have the right to
          submit, and not to try to break other people using it. We reserve the right to remove
          content and terminate accounts that violate this.
        </p>
        <p>
          Subscriptions renew weekly at the price shown at checkout. You can cancel any time in
          the billing portal.
        </p>
        <p>
          Some outbound links are affiliate links. When a swap link is present we may earn a
          commission if you buy through it. That does not affect verdicts.
        </p>
        <p className="text-inkSoft text-sm">
          CartBully is entertainment with math in it. It is not financial advice.
        </p>
      </div>
    </PaperSurface>
  );
}
