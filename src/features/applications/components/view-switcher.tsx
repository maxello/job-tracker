import Link from "next/link";

const VIEWS = [
  { key: "list", name: "List", href: "/" },
  { key: "board", name: "Board", href: "/board" },
] as const;

const linkClass =
  "rounded-md px-3 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// The two main views (US-5). Plain hrefs: list filters aren't carried over.
// A link's focus ring reaches 4px outside it (2px offset + 2px outline):
// p-1.5 and gap-2 leave it clear of the nav's border and the other link.
export function ViewSwitcher({ current }: { current: "list" | "board" }) {
  return (
    <nav
      aria-label="Views"
      className="inline-flex gap-2 rounded-lg border border-line bg-surface p-1.5"
    >
      {VIEWS.map(({ key, name, href }) => (
        <Link
          key={key}
          href={href}
          aria-current={key === current ? "page" : undefined}
          className={`${linkClass} ${
            key === current
              ? "bg-ink text-on-ink"
              : "text-muted hover:bg-row-hover hover:text-text"
          }`}
        >
          {name}
        </Link>
      ))}
    </nav>
  );
}
