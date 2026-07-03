import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "spared" | "swap";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
  as?: "button" | "a";
  href?: string;
  target?: string;
  rel?: string;
  block?: boolean;
};

const variantClasses: Record<Variant, string> = {
  primary: "bg-marker text-paper border-marker",
  secondary: "bg-paper text-ink border-ink",
  spared: "bg-spared text-paper border-spared",
  swap: "bg-swap text-paper border-swap",
};

export default function MarkerButton({
  children,
  variant = "primary",
  as = "button",
  href,
  target,
  rel,
  block = false,
  className = "",
  ...rest
}: Props) {
  const base =
    "inline-flex items-center justify-center font-marker tracking-wide uppercase px-6 py-3 text-lg border-[2px] transition-transform active:translate-y-[2px] active:shadow-none";
  const shadow =
    variant === "secondary" ? "shadow-stampSm" : "shadow-stamp";
  const width = block ? "w-full" : "";
  const cls = `${base} ${variantClasses[variant]} ${shadow} ${width} ${className}`;
  if (as === "a" && href) {
    return (
      <a href={href} target={target} rel={rel} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
