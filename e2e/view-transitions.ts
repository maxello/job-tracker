import { expect, type Page } from "@playwright/test";

// Records view transitions and clicks in the page (SPEC section 7, motion).
// The init script wraps document.startViewTransition, so it sees every
// transition React starts: its types, whether `ready` rejected (skipped), and
// at `ready` every ::view-transition-* animation with its keyframes. Clicks
// are recorded with where they landed, for the overlay checks.

export type VtAnimation = {
  pseudo: string;
  name: string;
  duration: number;
  // Keyframe properties other than offset, easing and composite.
  props: string[];
  // Each keyframe's `translate`, as getKeyframes() returns it.
  translates: string[];
};

export type VtRecord = {
  at: number;
  types: string[] | null;
  skipped: string | null;
  readyAt: number | null;
  finishedAt: number | null;
  animations: VtAnimation[] | null;
};

export type ClickRecord = {
  at: number;
  tag: string;
  inSiteHeader: boolean;
  // The text of the link the click landed in, if any.
  link: string | null;
};

const RECORDER = `
(() => {
  window.__vt = [];
  window.__clicks = [];
  const start = document.startViewTransition && document.startViewTransition.bind(document);
  if (start) {
    document.startViewTransition = function (arg) {
      const record = {
        at: performance.now(),
        types: arg && typeof arg === "object" && arg.types ? Array.from(arg.types) : null,
        skipped: null, readyAt: null, finishedAt: null, animations: null,
      };
      window.__vt.push(record);
      const transition = start(arg);
      transition.ready.then(() => {
        record.readyAt = performance.now();
        record.animations = document.getAnimations()
          .filter((a) => a.effect && a.effect.pseudoElement &&
            a.effect.pseudoElement.startsWith("::view-transition"))
          .map((a) => {
            const frames = a.effect.getKeyframes();
            return {
              pseudo: a.effect.pseudoElement,
              name: a.animationName || "",
              duration: Number(a.effect.getComputedTiming().duration) || 0,
              props: Array.from(new Set(frames.flatMap((k) => Object.keys(k).filter(
                (p) => !["offset", "computedOffset", "easing", "composite"].includes(p))))),
              translates: frames.map((k) => k.translate).filter((t) => t !== undefined),
            };
          });
      }, (error) => { record.skipped = String(error && error.name); });
      transition.finished.then(
        () => { record.finishedAt = performance.now(); },
        () => { record.finishedAt = performance.now(); });
      return transition;
    };
  }
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    window.__clicks.push({
      at: performance.now(),
      tag: target ? target.tagName : "",
      inSiteHeader: !!(target && target.closest("header") && !target.closest("main")),
      link: target && target.closest("a") ? target.closest("a").textContent.trim() : null,
    });
  }, true);
})();
`;

// Call before the first page.goto.
export async function recordViewTransitions(page: Page) {
  await page.addInitScript(RECORDER);
}

// Forgets everything recorded so far.
export async function resetRecords(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown[]>;
    w.__vt = [];
    w.__clicks = [];
  });
}

export async function transitions(page: Page): Promise<VtRecord[]> {
  return page.evaluate(() => (window as unknown as { __vt: VtRecord[] }).__vt);
}

export async function clicks(page: Page): Promise<ClickRecord[]> {
  return page.evaluate(
    () => (window as unknown as { __clicks: ClickRecord[] }).__clicks,
  );
}

// Waits until every recorded transition has finished or was skipped.
export async function settled(page: Page) {
  await page.waitForFunction(() =>
    (window as unknown as { __vt: VtRecord[] }).__vt.every(
      (r) => r.finishedAt !== null || r.skipped !== null,
    ),
  );
  return transitions(page);
}

// Waits until a transition has reached `ready`; fails as an assertion when
// none does.
export async function waitForReady(page: Page) {
  await expect
    .poll(
      async () => (await transitions(page)).some((r) => r.readyAt !== null),
      { message: "a view transition reached ready" },
    )
    .toBe(true);
  const records = await transitions(page);
  return records.find((r) => r.readyAt !== null)!;
}

export function allAnimations(records: VtRecord[]) {
  return records.flatMap((r) => r.animations ?? []);
}

// The app's own animations: the browser animates root (a fade-out) and the
// bare ::view-transition in every transition, and the header never animates,
// so only an animation elsewhere, longer than 0ms, is the app's.
function isAppAnimation(a: VtAnimation) {
  return (
    a.duration > 0 &&
    a.pseudo !== "::view-transition" &&
    !a.pseudo.endsWith("(root)") &&
    !a.pseudo.endsWith("(site-header)")
  );
}

// At least one transition with at least one of the app's animations: zero
// is a failure.
export function expectAnimated(records: VtRecord[]) {
  expect(records.length, "view transitions started").toBeGreaterThan(0);
  expect(
    allAnimations(records).filter(isAppAnimation).length,
    `animations collected: ${JSON.stringify(records)}`,
  ).toBeGreaterThan(0);
}

export function expectTypes(records: VtRecord[], type: string) {
  expect(
    records.some((r) => r.types?.includes(type)),
    `a transition with type ${type}: ${JSON.stringify(records.map((r) => r.types))}`,
  ).toBe(true);
}

export function expectUntyped(records: VtRecord[]) {
  for (const r of records) {
    expect(r.types ?? [], "transition types").toEqual([]);
  }
}

function describe(a: VtAnimation) {
  return `${a.pseudo} ${a.name} ${a.duration}ms ${a.props.join("+")}`;
}

// Reduced motion: every animation lasts 0ms or animates opacity only.
export function expectFadeOnly(records: VtRecord[]) {
  expectAnimated(records);
  for (const a of allAnimations(records)) {
    expect(
      a.duration === 0 || a.props.every((p) => p === "opacity"),
      `fade only: ${describe(a)}`,
    ).toBe(true);
  }
}

function moves(a: VtAnimation) {
  return (
    a.duration > 0 &&
    (a.props.includes("translate") || a.props.includes("transform"))
  );
}

export function expectNoTranslate(records: VtRecord[]) {
  for (const a of allAnimations(records)) {
    expect(moves(a), `no movement: ${describe(a)}`).toBe(false);
  }
}

// The side an image slides to or from: the sign of its non-zero translate.
function side(a: VtAnimation) {
  for (const t of a.translates) {
    expect(t, `a resolved translate in ${describe(a)}`).not.toContain("var(");
    const x = parseFloat(t);
    if (x !== 0 && !Number.isNaN(x)) return Math.sign(x);
  }
  return 0;
}

// Forward: the old content leaves to the left, the new comes from the right.
// Back: the other way round. `oldSlides: false` for a page without a slide
// wrapper (the not-found page, A2): only the incoming content slides.
export function expectSlide(
  records: VtRecord[],
  direction: "forward" | "back",
  { oldSlides = true }: { oldSlides?: boolean } = {},
) {
  expectAnimated(records);
  const sliding = allAnimations(records).filter(
    (a) => a.duration > 0 && a.props.includes("translate"),
  );
  const olds = sliding.filter((a) =>
    a.pseudo.startsWith("::view-transition-old"),
  );
  const news = sliding.filter((a) =>
    a.pseudo.startsWith("::view-transition-new"),
  );
  if (oldSlides) {
    expect(olds.length, "old content slides").toBeGreaterThan(0);
  } else {
    expect(olds.map(describe), "old content doesn't slide").toEqual([]);
  }
  expect(news.length, "new content slides").toBeGreaterThan(0);
  const sign = direction === "forward" ? 1 : -1;
  for (const a of olds) expect(side(a), `old side: ${describe(a)}`).toBe(-sign);
  for (const a of news) expect(side(a), `new side: ${describe(a)}`).toBe(sign);
}

// Stretches every view transition to 3s, so a test can act while one runs.
export async function stretchTransitions(page: Page) {
  await page.addStyleTag({
    content:
      "::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation-duration: 3s !important; }",
  });
}
