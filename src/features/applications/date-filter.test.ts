import { describe, expect, it } from "vitest";
import {
  dateRange,
  dayStart,
  parseDateParam,
  parseTimeZone,
} from "./date-filter";

// US-6 date range (`from`, `to`, `tz`), SPEC.md section 4 and the decision
// log, 2026-11-16 and 2026-11-17.

const iso = (date: Date) => date.toISOString();

describe("parseDateParam", () => {
  it("T1 US-6: a YYYY-MM-DD value is the date, trimmed", () => {
    expect(parseDateParam("2026-11-17")).toBe("2026-11-17");
    expect(parseDateParam(" 2026-11-17 ")).toBe("2026-11-17");
  });

  it.each([
    "2026-02-30",
    "2026-13-01",
    "2026-00-10",
    "2026-2-3",
    "20261117",
    "2026-11-17T00:00",
    "+2026-11-17",
    "0000-01-01",
    "10000-01-01",
    "",
    "   ",
  ])("T2 US-6: %j is ignored", (value) => {
    expect(parseDateParam(value)).toBeUndefined();
  });

  it("T2 US-6: a missing value is ignored", () => {
    expect(parseDateParam(undefined)).toBeUndefined();
  });

  it("T3 US-6: Feb 29 is valid only in a leap year", () => {
    expect(parseDateParam("2024-02-29")).toBe("2024-02-29");
    expect(parseDateParam("2025-02-29")).toBeUndefined();
  });

  // Date.UTC maps years 0–99 to 1900–1999, so a check built on it rejects
  // these (or accepts them as the wrong year).
  it("T4 US-6: years 0001 and 9999 are valid and keep their year", () => {
    expect(parseDateParam("0001-01-01")).toBe("0001-01-01");
    expect(parseDateParam("0099-12-31")).toBe("0099-12-31");
    expect(parseDateParam("9999-12-31")).toBe("9999-12-31");
    expect(iso(dayStart("0001-01-01", "UTC"))).toBe("0001-01-01T00:00:00.000Z");
  });

  it("T5 US-6: only the first value counts; later values are never tried", () => {
    expect(parseDateParam(["2026-11-17", "2026-11-18"])).toBe("2026-11-17");
    expect(parseDateParam(["bad", "2026-11-17"])).toBeUndefined();
  });
});

describe("parseTimeZone", () => {
  it.each([
    ["Europe/Kyiv", "Europe/Kyiv"],
    [" europe/kyiv ", "europe/kyiv"],
    ["UTC", "UTC"],
    ["+02:00", "+02:00"],
    [["Asia/Tokyo", "Europe/Kyiv"], "Asia/Tokyo"],
  ])("T6 US-6: %j is accepted as %j", (value, zone) => {
    expect(parseTimeZone(value)).toBe(zone);
  });

  it.each([
    ["Foo/Bar"],
    ["+2"],
    [""],
    ["   "],
    ["Europe/Kyiv\0"],
    [undefined],
    [["Foo/Bar", "Europe/Kyiv"]],
  ])("T6 US-6: %j falls back to UTC", (value) => {
    expect(parseTimeZone(value)).toBe("UTC");
  });
});

describe("dayStart", () => {
  it("T7 US-6: the first instant of the day in the zone", () => {
    expect(iso(dayStart("2026-11-17", "UTC"))).toBe("2026-11-17T00:00:00.000Z");
    expect(iso(dayStart("2026-11-17", "Europe/Kyiv"))).toBe(
      "2026-11-16T22:00:00.000Z",
    );
    expect(iso(dayStart("2026-11-17", "Asia/Tokyo"))).toBe(
      "2026-11-16T15:00:00.000Z",
    );
  });

  // Europe/Kyiv: 03:00 → 04:00 on 2026-03-29, 04:00 → 03:00 on 2026-10-25.
  it("T8 US-6: Kyiv's DST days last 23 h and 25 h", () => {
    const hours = (day: string, next: string) =>
      (dayStart(next, "Europe/Kyiv").getTime() -
        dayStart(day, "Europe/Kyiv").getTime()) /
      3_600_000;

    expect(iso(dayStart("2026-03-29", "Europe/Kyiv"))).toBe(
      "2026-03-28T22:00:00.000Z",
    );
    expect(iso(dayStart("2026-03-30", "Europe/Kyiv"))).toBe(
      "2026-03-29T21:00:00.000Z",
    );
    expect(hours("2026-03-29", "2026-03-30")).toBe(23);

    expect(iso(dayStart("2026-10-25", "Europe/Kyiv"))).toBe(
      "2026-10-24T21:00:00.000Z",
    );
    expect(iso(dayStart("2026-10-26", "Europe/Kyiv"))).toBe(
      "2026-10-25T22:00:00.000Z",
    );
    expect(hours("2026-10-25", "2026-10-26")).toBe(25);
  });

  // America/Santiago jumps from 24:00 on Sept 5 to 01:00 on Sept 6, 2026
  // (checked against Node's ICU), so Sept 6 has no 00:00.
  it("T9 US-6: a day whose midnight is skipped starts at its first instant", () => {
    expect(iso(dayStart("2026-09-05", "America/Santiago"))).toBe(
      "2026-09-05T04:00:00.000Z",
    );
    expect(iso(dayStart("2026-09-06", "America/Santiago"))).toBe(
      "2026-09-06T04:00:00.000Z",
    );
  });

  // ICU uses local mean time for year 1: Pago Pago is +12:37:12, so its
  // 0001-01-01 starts in 1 BC UTC; in 9999 it is −11:00, so the day after
  // 9999-12-31 starts in year 10000.
  it("T10 US-6: the extreme years compute without throwing", () => {
    expect(iso(dayStart("0001-01-01", "Pacific/Pago_Pago"))).toBe(
      "0000-12-31T11:22:48.000Z",
    );
    const lt = dateRange(undefined, "9999-12-31", "Pacific/Pago_Pago").lt;
    expect(lt && iso(lt)).toBe("+010000-01-01T11:00:00.000Z");
  });
});

describe("dateRange", () => {
  it("T11 US-6: from only is a lower bound at the start of that day", () => {
    expect(dateRange("2026-11-17", undefined, "Europe/Kyiv")).toEqual({
      gte: new Date("2026-11-16T22:00:00.000Z"),
    });
  });

  it("T11 US-6: to only is an upper bound at the start of the next day (inclusive)", () => {
    expect(dateRange(undefined, "2026-11-17", "Europe/Kyiv")).toEqual({
      lt: new Date("2026-11-17T22:00:00.000Z"),
    });
  });

  it("T11 US-6: to on the last day of a month and a year rolls over", () => {
    expect(dateRange(undefined, "2026-12-31", "UTC")).toEqual({
      lt: new Date("2027-01-01T00:00:00.000Z"),
    });
    expect(dateRange(undefined, "9999-12-31", "Pacific/Pago_Pago")).toEqual({
      lt: new Date("+010000-01-01T11:00:00.000Z"),
    });
  });

  it("T11 US-6: from and to on the same day cover that whole day", () => {
    expect(dateRange("2026-10-25", "2026-10-25", "Europe/Kyiv")).toEqual({
      gte: new Date("2026-10-24T21:00:00.000Z"),
      lt: new Date("2026-10-25T22:00:00.000Z"),
    });
  });

  it("T11 US-6: from later than to is kept as given, so nothing can match (no swap)", () => {
    const range = dateRange("2026-11-18", "2026-11-17", "UTC");

    expect(range).toEqual({
      gte: new Date("2026-11-18T00:00:00.000Z"),
      lt: new Date("2026-11-18T00:00:00.000Z"),
    });
  });

  it("T11 US-6: no dates means no bounds", () => {
    expect(dateRange(undefined, undefined, "Europe/Kyiv")).toEqual({});
  });
});

// One function checks the zone and computes with it, so a zone that passes
// the check can always be computed and one that fails can't be (answer 3 in
// the plan).
describe("tz validation and day boundaries agree", () => {
  it.each([
    "Europe/Kyiv",
    "europe/kyiv",
    "UTC",
    "+02:00",
    "EST",
    "Foo/Bar",
    "+2",
    "",
  ])("T12 US-6: %j is accepted exactly when dayStart can use it", (zone) => {
    const accepted = parseTimeZone(zone) !== "UTC" || zone === "UTC";
    const compute = () => dayStart("2026-11-17", zone);

    if (accepted) expect(compute).not.toThrow();
    else expect(compute).toThrow(RangeError);
  });
});
