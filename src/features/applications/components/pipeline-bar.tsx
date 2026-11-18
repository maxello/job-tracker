import { Status } from "@/generated/prisma/enums";
import { STATUS_LABELS } from "../status";
import {
  countNumberClass,
  hasAnyCount,
  type StatusCounts,
} from "../status-counts";
import { STATUS_STYLES } from "../status-style";

// US-6 pipeline bar (SPEC.md decision log, 2026-11-18): the status counts as
// proportional segments, Wishlist → Rejected, above the list. The bar is
// decorative; the "Pipeline" legend lists all five statuses with their
// counts, so its height doesn't depend on the data and the skeleton can
// match it. It sits on a surface card: Rejected's grey reaches 3:1 there.
// forced-color-adjust-none keeps the status colours in forced colors, where
// backgrounds would otherwise be dropped.
const cardClass =
  "mb-4 rounded-lg border border-line bg-surface px-4 py-3 forced-color-adjust-none";
// Separate segments, 3px apart, each with its own 2px radius.
const barClass = "flex h-2.5 gap-0.75";
const segmentClass = "min-w-2 rounded-xs";
// The whole legend is mono and muted; the number comes first, in the text
// colour. It is 1ch wide, not the filter's 3ch, so a one-digit count leaves
// no gap before the name; a two-digit count can then wrap the legend
// differently from the skeleton at narrow widths (accepted, 2026-11-18).
const legendClass =
  "mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted";
export const legendNumberClass =
  "inline-block min-w-[1ch] font-medium text-text";
const itemClass = "whitespace-nowrap";
const dotClass = "mr-1.5 inline-block size-2 rounded-xs align-middle";
const pulseClass = "h-3 animate-pulse rounded bg-line align-middle";

const STATUSES = Object.values(Status);

export function PipelineBar({ counts }: { counts: StatusCounts }) {
  if (!hasAnyCount(counts)) return null;
  return (
    <div className={cardClass}>
      <div aria-hidden="true" data-pipeline-bar className={barClass}>
        {/* Basis 0, so widths are proportional to the counts, not to the
            leftover space; min-w-2 keeps a count of 1 visible. */}
        {STATUSES.filter((status) => counts[status] > 0).map((status) => (
          <span
            key={status}
            className={`${segmentClass} ${STATUS_STYLES[status].fill}`}
            style={{ flex: `${counts[status]} 1 0` }}
          />
        ))}
      </div>
      <ul aria-label="Pipeline" className={legendClass}>
        {STATUSES.map((status) => (
          <li key={status} className={itemClass}>
            <span
              aria-hidden="true"
              className={`${dotClass} ${STATUS_STYLES[status].fill}`}
            />
            <span className={legendNumberClass}>{counts[status]}</span>{" "}
            <span>{STATUS_LABELS[status]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The same boxes with the real status names; only the bar and the numbers
// pulse. The skeleton always shows the bar, also when the loaded page won't
// (no applications, or all archived): an accepted shift (2026-11-18).
export function PipelineBarSkeleton() {
  return (
    <div aria-hidden="true" className={cardClass}>
      <div
        data-skeleton="bar"
        className={`${barClass} animate-pulse rounded-xs bg-line`}
      />
      <ul className={legendClass}>
        {STATUSES.map((status) => (
          <li key={status} className={itemClass}>
            <span className={`${dotClass} ${STATUS_STYLES[status].fill}`} />
            <span className={`${legendNumberClass} ${pulseClass}`} />{" "}
            <span>{STATUS_LABELS[status]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Replaces only the filter's number: same width as a one- to three-digit
// count.
export function CountPulse() {
  return <span className={`${countNumberClass} ${pulseClass}`} />;
}
