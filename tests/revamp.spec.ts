import { test, expect, type APIRequestContext } from "@playwright/test";

const empty = {
  version: 2,
  tables: {
    people: [],
    thoughts: [],
    mentions: [],
    edge_overrides: [],
    bucket_names: [],
    cluster_edges: [],
  },
};
type Node = {
  id: number;
  name: string;
  description: string;
  nextStep: string;
  lastContact: string;
  circles: string[];
};
async function create(api: APIRequestContext, data: Record<string, unknown>) {
  const res = await api.post("/api/people", { data });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).id as number;
}
const people = async (api: APIRequestContext) =>
  (await (await api.get("/api/graph")).json()).nodes as Node[];

test.beforeEach(async ({ request, page }) => {
  expect(
    (await request.post("/api/snapshot", { data: empty })).ok(),
  ).toBeTruthy();
  await page.addInitScript(() =>
    localStorage.setItem("socialweb-mode", "personal"),
  );
});

test("a reviewed brain dump files onto profiles as one undoable change", async ({
  request,
}) => {
  const sam = await create(request, { name: "Sam Rivera" });
  await request.patch(`/api/people/${sam}`, {
    data: { description: "• met at the gym", circles: ["Fitness"] },
  });
  const res = await request.post("/api/capture", {
    data: {
      text: "Sam wants a running buddy. Met Jo Park who does design.",
      items: [
        {
          personId: sam,
          name: "Sam Rivera",
          bullets: ["Wants a running buddy"],
          nextStep: "Plan a run",
          circles: ["fitness", "Half Marathon"],
        },
        {
          personId: null,
          name: "Jo Park",
          bullets: ["- Does design"],
          nextStep: "",
          circles: [],
        },
      ],
    },
  });
  expect(res.ok()).toBeTruthy();
  let all = await people(request);
  expect(all.find((p) => p.id === sam)).toMatchObject({
    description: "• met at the gym\n• Wants a running buddy",
    nextStep: "Plan a run",
    // An existing circle is not duplicated under different casing.
    circles: ["Fitness", "Half Marathon"],
  });
  expect(all.find((p) => p.id === sam)!.lastContact).toMatch(
    /^\d{4}-\d{2}-\d{2}$/,
  );
  expect(all.find((p) => p.name === "Jo Park")).toMatchObject({
    description: "• Does design",
  });
  const memories = await (await request.get("/api/memories")).json();
  expect(memories.thoughts).toHaveLength(1);
  expect(memories.thoughts[0].personIds).toHaveLength(2);

  expect((await request.post("/api/history")).ok()).toBeTruthy();
  all = await people(request);
  expect(all).toHaveLength(1);
  expect(all[0]).toMatchObject({
    description: "• met at the gym",
    nextStep: "",
    circles: ["Fitness"],
  });
  expect((await (await request.get("/api/memories")).json()).thoughts).toEqual(
    [],
  );
});

test("capture rejects empty input and unnamed people without writing", async ({
  request,
}) => {
  for (const data of [
    { text: "", items: [] },
    { text: "hello", items: [] },
    {
      text: "hello",
      items: [{ name: "", bullets: ["x"], nextStep: "", circles: [] }],
    },
  ])
    expect((await request.post("/api/capture", { data })).status()).toBe(400);
  expect(await people(request)).toEqual([]);
});

test("the profile opens on bullet notes with a next step that feeds the radar", async ({
  page,
  request,
}) => {
  const id = await create(request, { name: "Radar Person" });
  await page.goto("/");
  await page.locator(`[data-person-id="${id}"]`).press("Enter");
  const notes = page.getByLabel("About this person");
  await notes.click();
  await page.keyboard.type("first thing");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second thing");
  // Enter on an empty bullet ends the list rather than adding another.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(notes).toHaveValue("• first thing\n• second thing\n");
  await page.getByLabel("Next step").fill("Grab lunch");
  await expect
    .poll(async () => (await people(request))[0])
    .toMatchObject({
      description: "• first thing\n• second thing",
      nextStep: "Grab lunch",
    });
  expect((await people(request))[0].lastContact).not.toBe("");

  await page.getByRole("button", { name: /^◔ Radar/ }).click();
  const radar = page.getByRole("region", { name: "On your radar" });
  await expect(radar.getByRole("button", { name: /Grab lunch/ })).toBeVisible();
  await radar.getByRole("button", { name: /Grab lunch/ }).click();
  await page.getByRole("button", { name: "✓ Done" }).click();
  await expect.poll(async () => (await people(request))[0].nextStep).toBe("");
});

test("the Doing view groups by circle and dragging changes membership, not map positions", async ({
  page,
  request,
}) => {
  const a = await create(request, { name: "Circle Member", x: 300, y: 0 });
  const b = await create(request, { name: "Loose Person", x: -300, y: 0 });
  await request.patch(`/api/people/${a}`, { data: { circles: ["Party"] } });
  await page.goto("/");
  await page.getByRole("tab", { name: "What's going on" }).click();
  await expect(
    page.locator(".map-wrap:not(.map-hidden) .group-label"),
  ).toHaveText([/PARTY · 1/, /NOTHING GOING ON YET · 1/]);
  await expect(
    page.locator(".map-wrap:not(.map-hidden) .map-stage"),
  ).toHaveAttribute("data-settling", "false");
  const center = async (name: string) => {
    const box = (await page
      .locator(".map-wrap:not(.map-hidden) .map-person", { hasText: name })
      .locator(".map-star")
      .boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const from = await center("Loose Person"),
    to = await center("Circle Member");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x + 30, to.y + 30, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => (await people(request)).find((p) => p.id === b)!.circles)
    .toEqual(["Party"]);
  await expect(
    page.locator(".map-wrap:not(.map-hidden) .group-label"),
  ).toHaveText([/PARTY · 2/]);
  const saved = (await (await request.get("/api/graph")).json()).nodes;
  expect(saved.find((p: { id: number }) => p.id === b)).toMatchObject({
    x: -300,
    y: 0,
  });
});

test("a placed person stays where they were dropped after the map settles", async ({
  page,
  request,
}) => {
  const ids = [];
  for (const [i, x] of [-200, 0, 200].entries())
    ids.push(
      await create(request, { name: `Placed ${i}`, bg: "ut", x, y: 400 }),
    );
  await page.goto("/");
  await expect(page.locator(".map-stage")).toHaveAttribute(
    "data-settling",
    "false",
  );
  const xs = [];
  for (const id of ids)
    xs.push(
      (await page.locator(`[data-person-id="${id}"] .map-star`).boundingBox())!
        .x,
    );
  // Left-to-right order and even spacing survive; nobody is re-seated in a formation.
  expect(xs[0]).toBeLessThan(xs[1]);
  expect(xs[1]).toBeLessThan(xs[2]);
  expect(Math.abs(xs[1] - xs[0] - (xs[2] - xs[1]))).toBeLessThan(3);
});

test("a line from you appears only for close people and thickens with closeness", async ({
  page,
  request,
}) => {
  const know = await create(request, {
    name: "Know Well",
    strength: 5,
    x: -300,
    y: 200,
  });
  const close = await create(request, {
    name: "Close One",
    strength: 8,
    x: 0,
    y: 300,
  });
  const inner = await create(request, {
    name: "Inner One",
    strength: 10,
    x: 300,
    y: 200,
  });
  await page.goto("/");
  await expect(page.locator(".map-stage")).toHaveAttribute(
    "data-settling",
    "false",
  );
  await expect(page.locator(`[data-bond="${know}"]`)).toHaveCount(0);
  const width = async (id: number) =>
    (await page.locator(`[data-bond="${id}"]`).evaluate((el) => {
      const line = el as SVGLineElement;
      return Number(line.getAttribute("stroke-width")) * line.getScreenCTM()!.a;
    })) as number;
  const thin = await width(close),
    thick = await width(inner);
  expect(thin).toBeGreaterThanOrEqual(2);
  expect(thick).toBeGreaterThanOrEqual(thin * 2);
  // No demo and no mode switch: the app is only ever your own people.
  await expect(page.getByText(/demo/i)).toHaveCount(0);
});

test("the list lies over the map without rebuilding it", async ({
  page,
  request,
}) => {
  const id = await create(request, { name: "Stays Put", x: 250, y: 120 });
  await create(request, { name: "Other One", x: -250, y: -120 });
  await page.goto("/");
  await expect(page.locator(".map-stage")).toHaveAttribute(
    "data-settling",
    "false",
  );
  const star = page.locator(`[data-person-id="${id}"] .map-star`);
  // Tag the live element: a rebuilt map would hand back a fresh, untagged one.
  await star.evaluate((el) => el.setAttribute("data-same", "yes"));
  const before = await star.boundingBox();
  await page.getByRole("button", { name: "☰ List", exact: true }).click();
  await expect(page.locator(".list-overlay .person-card")).toHaveCount(2);
  await page.getByRole("button", { name: "☰ List", exact: true }).click();
  await expect(page.locator(".list-overlay")).toHaveCount(0);
  await expect(star).toHaveAttribute("data-same", "yes");
  expect(await star.boundingBox()).toEqual(before);
  await expect(page.locator(".map-stage")).toHaveAttribute(
    "data-settling",
    "false",
  );
  // Switching arrangement and back keeps it too.
  await page.getByRole("tab", { name: "What's going on" }).click();
  await page.getByRole("tab", { name: "Where they're from" }).click();
  await expect(star).toHaveAttribute("data-same", "yes");
  expect(await star.boundingBox()).toEqual(before);
});

test("moves save a moment after the drag, scenarios are drop zones, and shortcuts work", async ({
  page,
  request,
}) => {
  const a = await create(request, {
    name: "Mover One",
    bg: "ut",
    x: 200,
    y: 0,
  });
  await create(request, { name: "Stayer Two", bg: "ut", x: 320, y: 60 });
  await page.goto("/");
  await expect(page.locator(".map-stage")).toHaveAttribute(
    "data-settling",
    "false",
  );
  const star = page.locator(`[data-person-id="${a}"] .map-star`);
  const box = (await star.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 320, box.y - 160, { steps: 12 });
  // Outside every outline: the app says what dropping here will do.
  await expect(page.locator(".new-group-ghost")).toHaveCount(1);
  await page.mouse.up();
  // Shown at once as its own group, written to the server shortly after.
  await expect(page.locator(".group-label")).toHaveCount(2);
  expect((await people(request)).find((p) => p.id === a)).toMatchObject({
    name: "Mover One",
  });
  const saved = async () =>
    (await (await request.get("/api/graph")).json()).nodes.find(
      (p: { id: number }) => p.id === a,
    ).bg as string;
  expect(await saved()).toBe("ut");
  await expect.poll(saved, { timeout: 6000 }).not.toBe("ut");

  // Keys: 2 switches view, where unused scenarios wait as drop zones.
  await page.keyboard.press("2");
  await expect(page.locator(".empty-group")).toHaveCount(8);
  await page.keyboard.press("l");
  await expect(page.locator(".list-overlay .person-card")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(page.locator(".list-overlay")).toHaveCount(0);
  await page.keyboard.press("?");
  await expect(
    page.getByRole("heading", { name: "Shortcuts", exact: true }),
  ).toBeVisible();
});
