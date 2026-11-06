import type { Application } from "@/generated/prisma/client";
import type { ApplicationFieldName } from "./actions";

export type ApplicationFormValues = Record<ApplicationFieldName, string>;

// A stored application as the text the form submits, so saving an unchanged
// form gives the same data back.
export function toFormValues(
  application: Pick<Application, ApplicationFieldName>,
): ApplicationFormValues {
  return {
    company: application.company,
    role: application.role,
    url: application.url ?? "",
    notes: application.notes ?? "",
    location: application.location ?? "",
    level: application.level ?? "",
    stack: application.stack.join(", "),
    salaryMin: application.salaryMin?.toString() ?? "",
    salaryMax: application.salaryMax?.toString() ?? "",
    salaryCurrency: application.salaryCurrency ?? "",
  };
}
