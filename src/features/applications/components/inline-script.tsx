// Runs during HTML parsing on a full page load. On the client the type is
// "text/plain", so React doesn't warn about rendering a <script> and nothing
// re-executes; suppressHydrationWarning covers the type mismatch.
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
