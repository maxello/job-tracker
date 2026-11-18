import { Status } from "@/generated/prisma/enums";
import { STATUS_LABELS } from "../status";
import {
  countNumberClass,
  hasAnyCount,
  type StatusCounts,
} from "../status-counts";
import { STATUS_STYLES } from "../status-style";
import { countClass } from "./board-styles";

// US-6 pipeline bar (SPEC.md decision log, 2026-11-18): the status counts as
// proportional segments, Wishlist → Rejected, above the list. The bar is
// decorative; the "Pipeline" legend lists all five statuses with their
// counts, so its height doesn't depend on the data and the skeleton can
// match it. It sits on a surface card: Rejected's grey reaches 3:1 there.
// forced-color-adjust-none keeps the status colours in forced colors, where
// backgrounds would otherwise be dropped.
const cardClass =
  "mb-4 rounded-lg border border-line bg-surface px-4 py-3 forced-color-adjust-none";
const barClass = "flex h-2 gap-0.5 overflow-hidden rounded-full";
const legendClass = "mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm";
// Inline, not flex: " · " must stay plain inline text after the name.
const itemClass = "whitespace-nowrap";
const dotClass = "mr-1.5 inline-block size-2 rounded-full align-middle";

const STATUSES = Object.values(Status);

export function PipelineBar({ counts }: { counts: StatusCounts }) {
  if (!hasAnyCount(counts)) return null;
  return (
    <div className={cardClass}>
      <div aria-hidden="true" data-pipeline-bar className={barClass}>
        {/* Basis 0, so widths are proportional to the counts, not to the
            leftover space; min-w-1 keeps a count of 1 visible. */}
        {STATUSES.filter((status) => counts[status] > 0).map((status) => (
          <span
            key={status}
            className={`min-w-1 ${STATUS_STYLES[status].fill}`}
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
            {STATUS_LABELS[status]}
            <span className={countClass}>
              {" · "}
              <span className={countNumberClass}>{counts[status]}</span>
            </span>
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
        className={`${barClass} animate-pulse bg-line`}
      />
      <ul className={legendClass}>
        {STATUSES.map((status) => (
          <li key={status} className={itemClass}>
            <span className={`${dotClass} ${STATUS_STYLES[status].fill}`} />
            {STATUS_LABELS[status]}
            <span className={countClass}>
              {" · "}
              <CountPulse />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Replaces only the number: same width as a one- to three-digit count.
export function CountPulse() {
  return (
    <span
      className={`${countNumberClass} h-3 animate-pulse rounded bg-line align-middle`}
    />
  );
}
