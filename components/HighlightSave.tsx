import { ReactNode } from "react";

export default function HighlightSave({ children }: { children: ReactNode }) {
  return (
    <span className="hilite-swipe font-marker text-ink text-2xl">
      {children}
    </span>
  );
}
