type Props = {
  amount: number | string;
  currency?: string;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl",
};

export default function PriceSlash({ amount, currency = "$", size = "md" }: Props) {
  const formatted =
    typeof amount === "number" ? `${currency}${amount.toFixed(2)}` : `${currency}${amount}`;
  return <span className={`price-slash font-marker ${sizes[size]}`}>{formatted}</span>;
}
