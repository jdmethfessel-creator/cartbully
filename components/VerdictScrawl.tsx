type Verdict = "TRASHED" | "SPARED" | "SWAP";

type Props = {
  verdict: Verdict;
  size?: "md" | "lg" | "xl";
};

const color: Record<Verdict, string> = {
  TRASHED: "text-marker",
  SPARED: "text-spared",
  SWAP: "text-swap",
};

const sizes: Record<NonNullable<Props["size"]>, string> = {
  md: "text-5xl",
  lg: "text-6xl",
  xl: "text-7xl",
};

export default function VerdictScrawl({ verdict, size = "lg" }: Props) {
  return (
    <div className="flex justify-center py-4">
      <span
        className={`font-marker ${sizes[size]} ${color[verdict]} scrawl-underline animate-scrawlIn inline-block`}
        style={{ transform: "rotate(-4deg)" }}
      >
        {verdict}
      </span>
    </div>
  );
}
