// Decorative arrow in currentColor, shared by the back link (left) and the
// status history (right). aria-hidden: the surrounding text carries the
// meaning.
export function ArrowIcon({
  direction,
  className = "",
}: {
  direction: "left" | "right";
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`size-4 shrink-0 ${direction === "right" ? "rotate-180" : ""} ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 8H3M7 4 3 8l4 4" />
    </svg>
  );
}
