"use client";

import { useId } from "react";
import { InlineScript } from "./inline-script";

type Props = {
  // ISO 8601 UTC timestamp, e.g. from Date.toISOString().
  date: string;
  options?: Intl.DateTimeFormatOptions;
};

// Shows a UTC timestamp in the browser's locale and timezone.
// Hard load: the inline script rewrites the server-formatted text before first
// paint, and suppressHydrationWarning keeps that DOM. Soft navigation: this
// component renders in the browser and formats locally.
export function LocalDate({ date, options = { dateStyle: "medium" } }: Props) {
  const id = useId();
  const text = new Intl.DateTimeFormat(undefined, options).format(
    new Date(date),
  );
  const script = `{var n=document.getElementById(${JSON.stringify(id)});if(n)n.textContent=new Intl.DateTimeFormat(undefined,${JSON.stringify(options)}).format(new Date(${JSON.stringify(date)}))}`;

  return (
    <>
      <time id={id} dateTime={date} suppressHydrationWarning>
        {text}
      </time>
      <InlineScript html={script} />
    </>
  );
}
