// Postgres text can't hold a NUL byte: without this check the value passes Zod
// and fails in the database, so the user gets a generic error.
export function hasNoNul(value: string) {
  return !value.includes("\0");
}

export const NUL_MESSAGE = "Contains an invalid character";
