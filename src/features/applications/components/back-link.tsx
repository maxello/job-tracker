import Link from "next/link";
import { ArrowIcon } from "./arrow-icon";

// "Applications" with a back arrow, at the top of the detail, new, edit and
// not-found pages. The arrow is decoration, so the link's name is
// "Applications".
export function BackLink() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1 text-sm font-medium text-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <ArrowIcon direction="left" />
      Applications
    </Link>
  );
}
