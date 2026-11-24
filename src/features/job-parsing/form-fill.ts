import { PARSED_FIELD_NAMES, type ParsedFields } from "./schemas";

// The parse UI's link to the application form (US-7): only the 8 parsed
// fields are read or written, never Job URL or Notes. The callbacks keep the
// DOM out, so the rules run in unit tests.

// Whether any parsed field holds a value; whitespace-only counts as empty
// (the US-1 rule), so it doesn't ask to confirm.
export function hasParsedValue(read: (name: string) => string): boolean {
  return PARSED_FIELD_NAMES.some((name) => read(name).trim() !== "");
}

// Every parsed field gets its parsed value or "".
export function fillParsedFields(
  write: (name: string, value: string) => void,
  data: ParsedFields,
): void {
  for (const name of PARSED_FIELD_NAMES) write(name, data[name]);
}
