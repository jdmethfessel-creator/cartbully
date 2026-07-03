import { WORDMARK } from "@/config";

export default function Wordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "text-2xl", md: "text-3xl", lg: "text-5xl" };
  return (
    <span className={`font-marker ${sizes[size]} tracking-wide`}>
      <span className="text-ink">{WORDMARK.left}</span>
      <span className="text-marker">{WORDMARK.right}</span>
    </span>
  );
}
