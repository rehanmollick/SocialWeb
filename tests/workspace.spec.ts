import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
async function settledDocks(page: Page, left: number, right: number) {
  const viewport = page.viewportSize()!;
  await expect
    .poll(async () =>
      Math.round((await page.locator(".main-workspace").boundingBox())!.width),
    )
    .toBe(viewport.width - left - right);
}
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
async function create(api: APIRequestContext, data: Record<string, unknown>) {
  const res = await api.post("/api/people", { data });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).id as number;
}
test.beforeEach(async ({ request }) => {
  expect(
    (await request.post("/api/snapshot", { data: empty })).ok(),
  ).toBeTruthy();
});
test("invalid writes are rejected and failed restore is atomic", async ({
  request,
}) => {
  const a = await create(request, {
    name: "Ada",
    circles: ["UGC"],
    tags: ["highsignal"],
    x: 123,
    y: 456,
  });
  const b = await create(request, { name: "Ben" });
  expect(
    (await request.post("/api/edges", { data: { a, b, weight: 7 } })).ok(),
  ).toBeTruthy();
  expect(
    (
      await request.patch(`/api/people/${a}`, { data: { circles: "bad" } })
    ).status(),
  ).toBe(400);
  expect(
    (await request.post("/api/people", { data: { name: 123 } })).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/edges", { data: { a, b: 99999, weight: 3 } })
    ).status(),
  ).toBe(400);
  const backup = await (await request.get("/api/snapshot")).json();
  const bad = structuredClone(backup);
  bad.tables.people.push({ ...bad.tables.people[0] });
  expect((await request.post("/api/snapshot", { data: bad })).ok()).toBeFalsy();
  expect(await (await request.get("/api/snapshot")).json()).toEqual(backup);
  await request.delete(`/api/people/${a}`);
  let graph = await (await request.get("/api/graph")).json();
  expect(graph.nodes).toHaveLength(1);
  expect(graph.edges).toHaveLength(0);
  await request.post("/api/history");
  expect(await (await request.get("/api/snapshot")).json()).toEqual(backup);
  await request.patch(`/api/people/${a}`, {
    data: { circles: ["Career"], x: 900, y: 800 },
  });
  await request.post("/api/snapshot", { data: backup });
  graph = await (await request.get("/api/graph")).json();
  expect(graph.nodes.find((p: { id: number }) => p.id === a)).toMatchObject({
    circles: ["UGC"],
    x: 123,
    y: 456,
  });
});
test("new group creation is atomic, malformed backups cannot corrupt numeric fields", async ({
  request,
}) => {
  const before = await (await request.get("/api/snapshot")).json();
  const id = await create(request, {
    name: "Jun Park",
    bg: "group:Creative partners",
    circles: ["UGC", "Friends"],
  });
  let graph = await (await request.get("/api/graph")).json();
  expect(Object.values(graph.bucketNames)).toContain("Creative partners");
  await request.post("/api/history");
  expect(await (await request.get("/api/snapshot")).json()).toEqual(before);
  await create(request, { name: "Jun Park", x: 10, y: 20 });
  const saved = await (await request.get("/api/snapshot")).json();
  const invalid = structuredClone(saved);
  invalid.tables.people[0].x = "not a coordinate";
  expect(
    (await request.post("/api/snapshot", { data: invalid })).status(),
  ).toBe(400);
  expect(await (await request.get("/api/snapshot")).json()).toEqual(saved);
});

test("personal quick add, manual labels, memory and persistence", async ({
  page,
  request,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("socialweb-mode", "personal"),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "+ Add people", exact: true }).click();
  await page
    .getByLabel("Names to add")
    .fill("Avery Chen | UGC creator\nLeo Park");
  await page.getByRole("button", { name: "Add 2 people", exact: true }).click();
  await expect(page.locator(".map-person")).toHaveCount(2);
  const graph = await (await request.get("/api/graph")).json();
  const id = graph.nodes[0].id;
  await page.locator(`[data-person-id="${id}"]`).press("Enter");
  await page.locator(".judgment-details > summary").click();
  await page
    .getByRole("button", { name: "✦ High signal", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ϟ High agency", exact: true })
    .click();
  await page.getByLabel("Inner circle", { exact: true }).click();
  await page.getByRole("button", { name: "+ ◉ UGC", exact: true }).click();
  await expect(page.locator(".autosave-status")).toHaveText(
    "All changes saved",
  );
  await expect(page.locator(".right-panel")).toBeVisible();
  await page
    .getByRole("button", { name: "Close person details", exact: true })
    .click();
  await expect(page.locator(".right-panel")).toBeHidden();
  const saved = (await (await request.get("/api/graph")).json()).nodes[0];
  expect(saved).toMatchObject({
    strength: 10,
    tags: ["highsignal", "highagency"],
    circles: ["UGC"],
  });
  await page.getByRole("button", { name: "+ Memory", exact: true }).click();
  await page
    .getByPlaceholder("Who did you meet?")
    .fill("Avery Chen shared a great UGC idea.");
  await page
    .getByRole("button", { name: "Find known names", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "known people suggested" }),
  ).toContainText("1 known");
  await page.getByRole("button", { name: "Save memory", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "A moment worth remembering." }),
  ).toHaveCount(0);
  expect(
    (await (await request.get("/api/memories")).json()).thoughts[0].personIds,
  ).toEqual([id]);
  await page.reload();
  await expect(page.locator(`[data-person-id="${id}"]`)).toHaveAttribute(
    "aria-label",
    /Inner circle.*High signal.*High agency.*UGC/,
  );
});

test("docked tools resize the map, the key explains all circles, and zoom is directly controllable", async ({
  page,
  request,
}) => {
  const id = await create(request, {
    name: "Dock Person",
    strength: 10,
    circles: ["Content", "Close friends"],
  });
  expect(
    (
      await request.post("/api/people/batch", {
        data: {
          people: Array.from({ length: 24 }, (_, i) => ({
            name: `Dock Extra ${String.fromCharCode(65 + i)}`,
            bg: ["ut", "sf", "family", "climb"][i % 4],
          })),
        },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/");
  await expect(page.locator(".map-person")).toHaveCount(25);
  const map = page.locator(".map-wrap");
  const full = (await map.boundingBox())!.width;
  await page
    .getByRole("button", { name: "Slide Explore open", exact: true })
    .click();
  await expect
    .poll(async () => Math.round((await map.boundingBox())!.width))
    .toBe(full - 260);
  await page.locator(`[data-person-id="${id}"]`).press("Enter");
  await expect
    .poll(async () => Math.round((await map.boundingBox())!.width))
    .toBe(full - 260 - 370);
  const bounds = await map.boundingBox(),
    dock = await page.locator(".right-panel").boundingBox();
  expect(dock!.x).toBeGreaterThanOrEqual(bounds!.x + bounds!.width - 1);
  await page.getByText("Browse all circles", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Circle: UGC", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Circle: UGC", exact: true }).click();
  await page
    .getByRole("button", { name: "Circle: Startups", exact: true })
    .click();
  await expect(
    page.locator(`[data-person-id="${id}"] .map-category-segment`),
  ).toHaveCount(4);
  await expect(
    page.locator(`[data-person-id="${id}"] .map-closeness`),
  ).toHaveText(/5/);
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "ⓘ Map key", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Map key", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".key-items").getByText("◉ UGC", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Slide Explore closed", exact: true })
    .click();
  await expect
    .poll(async () => Math.round((await map.boundingBox())!.width))
    .toBe(full - 370);
  await page.getByRole("button", { name: "Fit map", exact: true }).click();
  await page.screenshot({ path: "artifacts/map-key-docked.png" });
  await page
    .getByRole("button", { name: "Close map key", exact: true })
    .click();
  await expect
    .poll(async () => Math.round((await map.boundingBox())!.width))
    .toBe(full);
  await page.getByLabel("Map zoom", { exact: true }).focus();
  await page.keyboard.press("End");
  await expect(page.getByLabel("Zoom level", { exact: true })).toHaveText(
    "300%",
  );
  await page.getByRole("button", { name: "Names", exact: true }).focus();
  await page.keyboard.press("-");
  await expect(page.getByLabel("Zoom level", { exact: true })).toHaveText(
    "240%",
  );
  await page.getByLabel("Map zoom", { exact: true }).focus();
  await page.keyboard.press("Home");
  await page.locator(".relationship-canvas").dispatchEvent("wheel", {
    deltaY: -30,
    ctrlKey: true,
    clientX: 600,
    clientY: 400,
  });
  await expect(page.getByLabel("Zoom level", { exact: true })).not.toHaveText(
    "15%",
  );
  await expect(page.locator(".modal-backdrop")).toHaveCount(0);
});

test("autosave serializes rapid edits, flushes when switching people, and retries a failed write", async ({
  page,
  request,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("socialweb-mode", "personal"),
  );
  const a = await create(request, { name: "Autosave Alpha" }),
    b = await create(request, { name: "Autosave Beta" });
  let failNext = false;
  await page.route("**/api/people/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await new Promise((r) => setTimeout(r, 250));
    if (failNext) {
      failNext = false;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary test failure" }),
      });
    }
    return route.continue();
  });
  await page.goto("/");
  await expect(page.locator(".map-person")).toHaveCount(2);
  await page.locator(`[data-person-id="${a}"]`).press("Enter");
  const color = await page
    .locator(`[data-person-id="${a}"] .map-star`)
    .getAttribute("fill");
  await page
    .getByLabel("About this person")
    .fill("Alpha draft kept when switching");
  await page.locator(".judgment-details > summary").click();
  await page
    .getByRole("button", { name: "✦ High signal", exact: true })
    .click();
  await page.getByText("Browse all circles", { exact: true }).click();
  await page.getByRole("button", { name: "Circle: UGC", exact: true }).click();
  await page.locator(`[data-person-id="${b}"]`).press("Enter");
  await page.getByLabel("Name", { exact: true }).fill("Autosave Beta renamed");
  await page.getByLabel("About this person").fill("Beta first draft");
  await page.locator(".judgment-details > summary").click();
  await page.getByRole("button", { name: "✓ Reliable", exact: true }).click();
  await page.getByText("Browse all circles", { exact: true }).click();
  await page
    .getByRole("button", { name: "Circle: Startups", exact: true })
    .click();
  await page.getByLabel("About this person").fill("Beta final draft");
  await expect
    .poll(async () => {
      const g = await (await request.get("/api/graph")).json();
      return g.nodes.find((p: { id: number }) => p.id === b).description;
    })
    .toBe("Beta final draft");
  let g = await (await request.get("/api/graph")).json();
  expect(g.nodes.find((p: { id: number }) => p.id === a)).toMatchObject({
    // Clicking into empty notes starts a bullet list.
    description: "• Alpha draft kept when switching",
    tags: ["highsignal"],
    circles: ["UGC"],
  });
  expect(g.nodes.find((p: { id: number }) => p.id === b)).toMatchObject({
    name: "Autosave Beta renamed",
    tags: ["reliable"],
    circles: ["Startups"],
  });
  expect(
    await page
      .locator(`[data-person-id="${a}"] .map-star`)
      .getAttribute("fill"),
  ).toBe(color);
  await expect(page.locator(".autosave-status")).toHaveText(
    "All changes saved",
  );
  failNext = true;
  await page.getByLabel("About this person").fill("Recover this draft");
  await expect(page.locator(".autosave-status")).toContainText(
    "Not saved: Temporary test failure",
  );
  await page
    .locator(".autosave-status")
    .getByRole("button", { name: "Retry", exact: true })
    .click();
  await expect(page.locator(".autosave-status")).toHaveText(
    "All changes saved",
  );
  g = await (await request.get("/api/graph")).json();
  expect(g.nodes.find((p: { id: number }) => p.id === b).description).toBe(
    "Recover this draft",
  );
  await page
    .getByRole("button", { name: "Close person details", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /^Autosave Beta renamed ·/ }),
  ).toBeVisible();
});

test("bulk creation is atomic and one undo reverses the whole batch", async ({
  request,
}) => {
  await create(request, { name: "Already here" });
  const before = await (await request.get("/api/snapshot")).json();
  expect(
    (
      await request.post("/api/people/batch", {
        data: {
          people: [
            { name: "New person", bg: "group:Temporary" },
            { name: "Already here" },
          ],
        },
      })
    ).status(),
  ).toBe(409);
  expect(await (await request.get("/api/snapshot")).json()).toEqual(before);
  expect(
    (
      await request.post("/api/people/batch", {
        data: {
          people: [
            { name: "New person", bg: "group:Crew" },
            { name: "Another person", bg: "group:Crew" },
          ],
        },
      })
    ).ok(),
  ).toBeTruthy();
  const g = await (await request.get("/api/graph")).json();
  expect(g.nodes).toHaveLength(3);
  expect(Object.values(g.bucketNames)).toEqual(["Crew"]);
  await request.post("/api/history");
  expect(await (await request.get("/api/snapshot")).json()).toEqual(before);
});

test("drag joins groups without overlap or changing circles, survives reload", async ({
  page,
  request,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("socialweb-mode", "personal"),
  );
  const a = await create(request, {
    name: "Maya Rivera",
    bg: "creators",
    circles: ["UGC"],
    x: -200,
    y: -80,
  });
  await create(request, { name: "Leo Park", bg: "creators", x: -230, y: 0 });
  const b = await create(request, {
    name: "Noor Ali",
    bg: "builders",
    x: 230,
    y: -30,
  });
  await create(request, { name: "Sam Cole", bg: "builders", x: 270, y: 50 });
  await page.goto("/");
  await expect(page.locator(".map-person")).toHaveCount(4);
  await expect(page.locator(".map-stage")).toHaveAttribute(
    "data-settling",
    "false",
    { timeout: 10000 },
  );
  await page.getByRole("button", { name: "Fit map", exact: true }).click();
  const center = async (id: number) =>
    page.locator(`[data-person-id="${id}"]`).evaluate((el) => {
      const p = new DOMPoint(0, 0).matrixTransform(
        (el as SVGGraphicsElement).getScreenCTM()!,
      );
      return { x: p.x, y: p.y };
    });
  const from = await center(a),
    to = await center(b);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('.workspace-footer [role="status"]')).toContainText(
    "Arrangement saved",
  );
  const graph = await (await request.get("/api/graph")).json();
  const moved = graph.nodes.find((p: { id: number }) => p.id === a);
  expect(moved).toMatchObject({ bg: "builders", circles: ["UGC"] });
  expect(
    graph.nodes.every(
      (p: { x: number | null; y: number | null }) =>
        p.x !== null && p.y !== null,
    ),
  ).toBe(true);
  // Dragging saves the displayed, settled coordinates of every person.
  // Compare against those positions, not the target's earlier DB anchor.
  for (const other of graph.nodes.filter((p: { id: number }) => p.id !== a))
    expect(
      Math.hypot(moved.x - other.x, moved.y - other.y),
    ).toBeGreaterThanOrEqual(44);
  await page.reload();
  await expect(page.locator(".map-person")).toHaveCount(4);
  expect(
    (await (await request.get("/api/graph")).json()).nodes.find(
      (p: { id: number }) => p.id === a,
    ),
  ).toMatchObject(moved);
  await page
    .getByRole("button", { name: "Find and filter people", exact: true })
    .click();
  await page.getByLabel("Search people").fill("Maya");
  await expect(page.getByText("1 matches", { exact: true })).toBeVisible();
});

test("whole-group drag keeps geometry, canceled drag makes no write, map double-click adds in place", async ({
  page,
  request,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("socialweb-mode", "personal"),
  );
  const a = await create(request, {
    name: "North Star",
    bg: "crew",
    x: -100,
    y: -100,
  });
  const b = await create(request, {
    name: "South Star",
    bg: "crew",
    x: 0,
    y: -170,
  });
  await page.goto("/");
  await expect(page.locator(".map-person")).toHaveCount(2);
  await page.getByRole("button", { name: "Fit map", exact: true }).click();
  const label = page.locator('[data-group-label="crew"]');
  await expect(page.locator(".map-stage")).toHaveAttribute(
    "data-settling",
    "false",
    { timeout: 10000 },
  );
  const arrangement = await page.locator(".map-person").evaluateAll((els) =>
    els.map((el) => {
      const m = (el as SVGGraphicsElement).transform.baseVal.consolidate()!
        .matrix;
      return { x: m.e, y: m.f };
    }),
  );
  const box = await label.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + 100,
    box!.y + box!.height / 2 + 60,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect(page.locator('.workspace-footer [role="status"]')).toContainText(
    "Arrangement saved",
  );
  const g = await (await request.get("/api/graph")).json();
  const p = g.nodes.find((p: { id: number }) => p.id === a),
    q = g.nodes.find((p: { id: number }) => p.id === b);
  expect(p.bg).toBe("crew");
  expect(q.bg).toBe("crew");
  expect(q.x - p.x).toBeCloseTo(arrangement[1].x - arrangement[0].x, 4);
  expect(q.y - p.y).toBeCloseTo(arrangement[1].y - arrangement[0].y, 4);
  const pos = await page.locator(`[data-person-id="${a}"]`).evaluate((el) => {
    const p = new DOMPoint().matrixTransform(
      (el as SVGGraphicsElement).getScreenCTM()!,
    );
    return { x: p.x, y: p.y };
  });
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
  await page.mouse.move(pos.x + 160, pos.y + 140, { steps: 10 });
  await page.locator(".relationship-canvas").dispatchEvent("pointercancel");
  await page.mouse.up();
  expect(await (await request.get("/api/graph")).json()).toEqual(g);
  await page.mouse.dblclick(350, 500);
  await expect(
    page.getByRole("region", { name: "Who’s in your orbit?" }),
  ).toBeVisible();
  await page.getByLabel("Names to add").fill("New Star");
  await page.getByRole("button", { name: "Add person", exact: true }).click();
  await expect(page.locator(".map-person")).toHaveCount(3);
  const added = (await (await request.get("/api/graph")).json()).nodes.find(
    (p: { name: string }) => p.name === "New Star",
  );
  expect(Number.isFinite(added.x) && Number.isFinite(added.y)).toBe(true);
});

test("one hundred people remain searchable with a quiet map and readable selected labels", async ({
  page,
  request,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("socialweb-mode", "personal"),
  );
  const people = Array.from({ length: 100 }, (_, i) => ({
    name: `Test Person ${i + 1}`,
    bg: `group:Constellation ${Math.floor(i / 20) + 1}`,
    circles: [i % 2 ? "UGC" : "Startups"],
    strength: i % 11,
    tags: i % 7 === 0 ? ["highsignal", "highagency"] : [],
  }));
  expect(
    (await request.post("/api/people/batch", { data: { people } })).ok(),
  ).toBeTruthy();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.locator(".map-person")).toHaveCount(100);
  await expect(page.locator(".map-stage")).toHaveAttribute(
    "data-settling",
    "false",
    { timeout: 10000 },
  );
  await page.getByRole("button", { name: "Fit map", exact: true }).click();
  await page.screenshot({ path: "artifacts/universe-100-people.png" });
  const packed = await page.locator(".person-name").evaluateAll((els) =>
    els.map((el) => {
      const rect = el.getBoundingClientRect();
      const matrix = (el as SVGGraphicsElement).getScreenCTM()!;
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        font:
          Number(el.getAttribute("font-size")) * Math.hypot(matrix.a, matrix.b),
      };
    }),
  );
  // Dense views may omit names to retain a readable type size. At least half
  // remain available in the overview, with every person available on demand.
  expect(packed.length).toBeGreaterThanOrEqual(50);
  for (let i = 0; i < packed.length; i++) {
    expect(packed[i].font).toBeGreaterThanOrEqual(10.49);
    for (let j = i + 1; j < packed.length; j++) {
      const a = packed[i],
        b = packed[j];
      expect(
        a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top,
      ).toBe(false);
    }
  }
  const headings = await page.locator(".group-label").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }),
  );
  for (const name of packed)
    for (const heading of headings)
      expect(
        name.left < heading.right &&
          name.right > heading.left &&
          name.top < heading.bottom &&
          name.bottom > heading.top,
      ).toBe(false);
  await page
    .getByRole("button", { name: "Find and filter people", exact: true })
    .click();
  await page.getByLabel("Search people").fill("Person 100");
  await expect(page.getByText("1 matches", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Find and filter people", exact: true })
    .click();
  await page.getByRole("button", { name: /^Test Person 100 ·/ }).press("Enter");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Test Person 100",
  );
  const revealedFont = await page
    .getByRole("button", { name: /^Test Person 100 ·/ })
    .locator(".person-name")
    .evaluate(
      (el) =>
        Number(el.getAttribute("font-size")) *
        Math.hypot(
          (el as SVGGraphicsElement).getScreenCTM()!.a,
          (el as SVGGraphicsElement).getScreenCTM()!.b,
        ),
    );
  expect(revealedFont).toBeGreaterThanOrEqual(11.99);
});

test("orbs settle into varied formations without writing data; all judgments have visible markers", async ({
  page,
  request,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("socialweb-mode", "personal"),
  );
  const traits = [
    "highsignal",
    "highagency",
    "important",
    "friends",
    "fun",
    "helpful",
    "interesting",
    "reliable",
    "inspiring",
    "connector",
  ];
  const people = Array.from({ length: 24 }, (_, i) => ({
    name: `Constellation Friend ${i + 1}`,
    bg: `shape-${Math.floor(i / 6)}`,
    x: Math.floor(i / 6) * 500 + (i % 6) * 5,
    y: -150 + (i % 6) * 3,
    tags: i === 0 ? traits : [],
    circles: ["UGC", "Startups"],
  }));
  expect(
    (await request.post("/api/people/batch", { data: { people } })).ok(),
  ).toBeTruthy();
  const before = await (await request.get("/api/snapshot")).json();
  await page.goto("/");
  await expect(page.locator(".map-person")).toHaveCount(24);
  const first = page.locator(".map-person").first();
  const start = await first.getAttribute("transform");
  await expect(page.locator(".map-stage")).toHaveAttribute(
    "data-settling",
    "false",
    { timeout: 10000 },
  );
  expect(await first.getAttribute("transform")).not.toBe(start);
  const points = await page.locator(".map-person").evaluateAll((els) =>
    els.map((el) => {
      const m = (el as SVGGraphicsElement).transform.baseVal.consolidate()!
        .matrix;
      return { x: m.e, y: m.f };
    }),
  );
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++)
      expect(
        Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y),
      ).toBeGreaterThan(80);
  expect(
    new Set(
      await page
        .locator("[data-formation]")
        .evaluateAll((els) => els.map((e) => e.getAttribute("data-formation"))),
    ).size,
  ).toBe(4);
  await expect(first.locator(".judgment-marker")).toHaveCount(10);
  for (const tag of traits)
    await expect(first.locator(`[data-trait="${tag}"]`)).toBeVisible();
  await expect(first.locator(".high-signal-aura circle")).toHaveCount(2);
  expect(await (await request.get("/api/snapshot")).json()).toEqual(before);
  await page.getByRole("button", { name: "Fit map", exact: true }).click();
  await page.screenshot({ path: "artifacts/geometric-formations.png" });
  const normalFont = await first
    .locator(".person-name")
    .evaluate(
      (el) =>
        Number(el.getAttribute("font-size")) *
        Math.hypot(
          (el as SVGGraphicsElement).getScreenCTM()!.a,
          (el as SVGGraphicsElement).getScreenCTM()!.b,
        ),
    );
  await page.getByLabel("Map zoom", { exact: true }).focus();
  await page.keyboard.press("Home");
  const label = page.locator(".person-name").first();
  const zoomedFont = await label.evaluate(
    (el) =>
      Number(el.getAttribute("font-size")) *
      Math.hypot(
        (el as SVGGraphicsElement).getScreenCTM()!.a,
        (el as SVGGraphicsElement).getScreenCTM()!.b,
      ),
  );
  expect(zoomedFont).toBeLessThan(normalFont);
  await expect(first.locator(".judgment-marker")).toHaveCount(10);
});

test("Explore finds people immediately, opens by keyboard, and clears no matches", async ({
  page,
  request,
}) => {
  const id = await create(request, {
    name: "Mira Vale",
    description: "Designs thoughtful accessible products",
    bg: "ut",
    strength: 8,
    circles: ["Freelance"],
  });
  await create(request, {
    name: "Owen Lake",
    description: "Loves climbing",
    bg: "climb",
  });
  await page.addInitScript(() =>
    localStorage.setItem("socialweb-mode", "personal"),
  );
  await page.goto("/");
  await expect(page.locator(".map-person")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Find and filter people", exact: true })
    .click();
  await page.getByLabel("Search people").fill("accessible");
  await page.setViewportSize({ width: 1280, height: 800 });
  const results = page.getByRole("region", { name: "People search results" });
  await expect(results).toContainText("1 person found");
  await expect(results.getByRole("button")).toContainText("Mira Vale");
  await settledDocks(page, 260, 0);
  await page.screenshot({ path: "artifacts/explore-results.png" });
  await page.getByLabel("Search people").press("Enter");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Mira Vale",
  );
  await settledDocks(page, 260, 370);
  await page.screenshot({ path: "artifacts/profile-polished.png" });
  await expect(page.locator(`[data-person-id="${id}"]`)).toHaveAttribute(
    "aria-label",
    /Close/,
  );
  await page
    .getByRole("button", { name: "Close person details", exact: true })
    .click();
  await page.getByLabel("Search people").fill("no-such-person");
  await expect(results).toContainText("0 people found");
  await results
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page.getByLabel("Search people")).toHaveValue("");
  await expect(results).toHaveCount(0);
  await page.getByRole("button", { name: "☰ List", exact: true }).click();
  await expect(
    page.locator(".person-card").filter({ hasText: "Mira Vale" }),
  ).toContainText("Close (4/5)");
  await settledDocks(page, 260, 0);
  await page.screenshot({ path: "artifacts/people-polished.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await settledDocks(page, 0, 0);
  const cardBounds = await page.locator(".person-card").first().boundingBox();
  expect(cardBounds!.x).toBeGreaterThanOrEqual(0);
  expect(cardBounds!.x + cardBounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "artifacts/mobile-people.png" });
  await page.locator(".person-card").first().click();
  await settledDocks(page, 0, 340);
  const nameBounds = await page
    .getByLabel("Name", { exact: true })
    .boundingBox();
  expect(nameBounds!.x).toBeGreaterThanOrEqual(0);
  expect(nameBounds!.x + nameBounds!.width).toBeLessThanOrEqual(390);
  await expect(
    page.getByRole("button", { name: "Close person details", exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: "artifacts/mobile-profile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("Circle picker prioritizes selected and suggested circles and saves additions and removal", async ({
  page,
  request,
}) => {
  const id = await create(request, {
    name: "Kai Rowan",
    description: "Makes UGC videos",
    circles: ["Weekend crew"],
  });
  await page.addInitScript(() =>
    localStorage.setItem("socialweb-mode", "personal"),
  );
  await page.goto("/");
  await expect(page.locator(".map-person")).toHaveCount(1);
  await page.locator(`[data-person-id="${id}"]`).press("Enter");
  await expect(
    page.getByRole("button", { name: "Circle: Weekend crew", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Circle: Career", exact: true }),
  ).toBeHidden();
  await page.getByRole("button", { name: "+ ◉ UGC", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Circle: UGC", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByText("Browse all circles", { exact: true }).click();
  await page
    .getByRole("button", { name: "Circle: Career", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Circle: Weekend crew", exact: true })
    .click();
  await page.getByLabel("New custom circle").fill("Coffee club");
  await page.getByLabel("New custom circle").press("Enter");
  await expect(page.locator(".autosave-status")).toHaveText(
    "All changes saved",
  );
  const graph = await (await request.get("/api/graph")).json();
  expect(graph.nodes[0].circles).toEqual(["UGC", "Career", "Coffee club"]);
  await page.reload();
  await page.locator(`[data-person-id="${id}"]`).press("Enter");
  await expect(
    page.getByRole("button", { name: "Circle: Coffee club", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Circle: Career", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("Memories search linked names and offer recovery when nothing matches", async ({
  page,
  request,
}) => {
  const id = await create(request, {
    name: "Lena Hart",
    circles: ["Photography"],
  });
  expect(
    (
      await request.post("/api/memories", {
        data: {
          body: "Talked about a new photography project",
          personIds: [id],
        },
      })
    ).ok(),
  ).toBeTruthy();
  await page.addInitScript(() =>
    localStorage.setItem("socialweb-mode", "personal"),
  );
  await page.goto("/");
  await expect(page.locator(".map-person")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Find and filter people", exact: true })
    .click();
  await page.getByRole("button", { name: /≡.*Memories/ }).click();
  await page.getByLabel("Search people").fill("Lena Hart");
  await expect(page.locator(".memory-card")).toHaveCount(1);
  await expect(page.locator(".active-filters")).toContainText("1 memory");
  await page.getByRole("button", { name: /Photography.*1/ }).click();
  await page.getByLabel("Search people").fill("photography project");
  await expect(page.locator(".memory-card")).toHaveCount(1);
  await page.getByLabel("Search people").fill("nonexistent memory");
  await expect(page.locator(".memory-card")).toHaveCount(0);
  await expect(
    page.getByText("No memories match those filters."),
  ).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await settledDocks(page, 260, 0);
  await page.screenshot({ path: "artifacts/memory-empty.png" });
  await page
    .locator(".empty-state")
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page.locator(".memory-card")).toHaveCount(1);
});

test("Ask retains conversation and draft while following a person reference", async ({
  page,
  request,
}) => {
  const id = await create(request, {
    name: "Quinn Sol",
    description: "A helpful design collaborator",
  });
  await page.addInitScript(() =>
    localStorage.setItem("socialweb-mode", "personal"),
  );
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { ai: true } }),
  );
  await page.route("**/api/ask", (route) =>
    route.fulfill({
      json: {
        answer: "Quinn Sol can help with your design project.",
        refs: ["Quinn Sol"],
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".map-person")).toHaveCount(1);
  await page.getByRole("button", { name: "✧ Ask", exact: true }).click();
  await page.getByLabel("Ask your memory").fill("Who can help me design?");
  await page.getByLabel("Ask your memory").press("Enter");
  await expect(page.locator(".chat-message.assistant")).toContainText(
    "Quinn Sol can help",
  );
  await page.getByLabel("Ask your memory").fill("And what should I ask them?");
  await page
    .locator(".assistant-panel")
    .getByRole("button", { name: "Quinn Sol ↗", exact: true })
    .click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Quinn Sol",
  );
  await expect(page.getByLabel("Ask your memory")).toBeHidden();
  await page.getByRole("button", { name: "✧ Ask", exact: true }).click();
  await expect(page.getByLabel("Ask your memory")).toHaveValue(
    "And what should I ask them?",
  );
  await expect(page.locator(".chat-message.assistant")).toContainText(
    "Quinn Sol can help",
  );
  await expect(page.locator(".context-pill")).toContainText("Quinn Sol");
});

test("Offline Ask never calls the provider from keyboard Enter", async ({
  page,
}) => {
  let calls = 0;
  await page.addInitScript(() =>
    localStorage.setItem("socialweb-mode", "personal"),
  );
  await page.route("**/api/ask", (route) => {
    calls++;
    return route.fulfill({ json: { answer: "Should not be requested" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "✧ Ask", exact: true }).click();
  await expect(page.locator(".assistant-compose")).toContainText(
    "Claude is not connected",
  );
  await page.getByLabel("Ask your memory").fill("Who do I know?");
  await page.getByLabel("Ask your memory").press("Enter");
  await expect(page.getByLabel("Ask your memory")).toHaveValue(
    "Who do I know?",
  );
  await expect(page.locator(".chat-message")).toHaveCount(0);
  expect(calls).toBe(0);
});
