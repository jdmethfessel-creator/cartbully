type Grade = "A" | "B+" | "B" | "C" | "D" | "F";

type Props = {
  grade: Grade;
};

export default function GradeCircle({ grade }: Props) {
  const failing = grade === "F" || grade === "D";
  const color = failing ? "text-marker border-marker" : "text-spared border-spared";
  return (
    <div
      className={`inline-flex items-center justify-center rounded-full border-[3px] ${color} w-16 h-16 font-marker text-3xl bg-paper`}
      style={{ transform: "rotate(6deg)", boxShadow: "2px 2px 0 rgba(0,0,0,0.15)" }}
      aria-label={`Grade ${grade}`}
    >
      {grade}
    </div>
  );
}
