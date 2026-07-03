import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-6 border-t border-ink/20 bg-paper">
      <div className="mx-auto flex max-w-[480px] items-center justify-between px-4 py-3 text-[11px] text-inkSoft">
        <span>© CartBully</span>
        <div className="flex gap-3">
          <Link href="/terms" className="underline underline-offset-2 hover:text-ink">
            Terms
          </Link>
          <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  );
}
