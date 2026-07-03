import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  rotate?: number;
  className?: string;
};

export default function StickyNote({ children, rotate = -3, className = "" }: Props) {
  return (
    <div
      className={`inline-block bg-hilite text-ink font-marker px-3 py-2 shadow-note ${className}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      {children}
    </div>
  );
}
