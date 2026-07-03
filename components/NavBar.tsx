"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Wordmark from "./Wordmark";

const links = [
  { href: "/ledger", label: "Ledger" },
  { href: "/locker", label: "Locker" },
  { href: "/account", label: "Account" },
];

export default function NavBar() {
  const pathname = usePathname() || "/";
  return (
    <nav className="sticky top-0 z-30 border-b-2 border-ink/20 bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-[480px] items-center justify-between px-4 py-2">
        <Link href="/" aria-label="CartBully home" className="flex items-center">
          <Wordmark size="sm" />
        </Link>
        <ul className="flex items-center gap-3">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={
                    "font-marker text-[11px] uppercase tracking-widest text-ink " +
                    (active
                      ? "border-b-2 border-marker pb-[2px]"
                      : "hover:text-marker")
                  }
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
