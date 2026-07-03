import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  withHoles?: boolean;
  className?: string;
};

export default function PaperSurface({ children, withHoles = false, className = "" }: Props) {
  return (
    <div className={`paper-rules paper-margin relative min-h-screen ${className}`}>
      {withHoles && <div className="paper-holes" aria-hidden />}
      <div className={`relative ${withHoles ? "pl-8" : ""} pt-6 pb-16`}>{children}</div>
    </div>
  );
}
