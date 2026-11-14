// Five bars in the five status colours, next to the name. Not a link, so the
// header's tab order is unchanged.
const BARS = [
  { fill: "fill-wishlist", height: 10 },
  { fill: "fill-applied", height: 14 },
  { fill: "fill-interview", height: 18 },
  { fill: "fill-offer", height: 22 },
  { fill: "fill-rejected", height: 12 },
];

export function Logo() {
  return (
    <p className="flex items-center gap-2.5 font-display text-base font-bold tracking-tight whitespace-nowrap">
      <svg
        aria-hidden="true"
        viewBox="0 0 29 22"
        className="h-5.5 w-auto shrink-0"
      >
        {BARS.map((bar, i) => (
          <rect
            key={bar.fill}
            x={i * 6}
            y={22 - bar.height}
            width="4"
            height={bar.height}
            rx="1"
            className={bar.fill}
          />
        ))}
      </svg>
      Job Tracker
    </p>
  );
}
