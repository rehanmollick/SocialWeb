import { test, expect } from "@playwright/test";

// Playwright's server uses /tmp/socialweb-e2e.db, never the personal database.
test.beforeEach(async ({ request, page }) => {
  expect(
    (
      await request.post("/api/snapshot", {
        data: {
          version: 2,
          tables: {
            people: [],
            thoughts: [],
            mentions: [],
            edge_overrides: [],
            bucket_names: [],
            cluster_edges: [],
          },
        },
      })
    ).ok(),
  ).toBeTruthy();
  await page.addInitScript(() =>
    localStorage.setItem("socialweb-mode", "personal"),
  );
});

test("quick add explains malformed lines, batch limits, and duplicates before writing", async ({
  page,
  request,
}) => {
  expect(
    (
      await request.post("/api/people", { data: { name: "Existing Friend" } })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/");
  await page.getByRole("button", { name: "+ Add people", exact: true }).click();
  const capture = page.getByRole("region", { name: "Who’s in your orbit?" });
  const names = capture.getByLabel("Names to add");
  let writes = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith("/api/people/batch"))
      writes++;
  });

  await names.fill("Valid Friend\n\n| missing name");
  await expect(capture.getByRole("alert")).toContainText(
    "Line 3: add a name before the |",
  );
  await expect(names).toHaveAttribute("aria-invalid", "true");
  await expect(
    capture.getByRole("button", { name: "Add 2 people", exact: true }),
  ).toBeDisabled();

  await names.fill(
    Array.from({ length: 101 }, (_, i) => `Friend ${i + 1}`).join("\n"),
  );
  await expect(capture.getByRole("status")).toHaveText(
    "101 / 100 people in this batch",
  );
  await expect(capture.getByRole("alert")).toContainText("Remove 1 line");
  await expect(
    capture.getByRole("button", { name: "Add 101 people", exact: true }),
  ).toBeDisabled();

  await names.fill("existing friend\nNew Friend\nnew friend");
  await expect(capture.getByRole("alert")).toContainText(
    "2 duplicate names to review",
  );
  await expect(capture.getByRole("alert")).toContainText("Existing Friend");
  await expect(capture.getByRole("alert")).toContainText(
    "No profiles will be merged",
  );
  await expect(
    capture.getByRole("button", { name: "Add 3 people", exact: true }),
  ).toBeDisabled();
  expect(writes).toBe(0);

  await names.fill("New Friend | a useful note\nAnother Friend");
  await expect(capture.getByRole("alert")).toHaveCount(0);
  await expect(names).toHaveAttribute("aria-invalid", "false");
  await capture
    .getByRole("button", { name: "Add 2 people", exact: true })
    .click();
  await expect(capture).toHaveCount(0);
  const graph = await (await request.get("/api/graph")).json();
  expect(graph.nodes).toHaveLength(3);
  expect(
    graph.nodes.find(
      (person: { name: string }) => person.name === "New Friend",
    ),
  ).toMatchObject({
    description: "a useful note",
  });
  expect(writes).toBe(1);
});

test("memory links remain visible through searches, can be removed, and show saving accurately", async ({
  page,
  request,
}) => {
  const first = await request.post("/api/people", {
    data: { name: "Ada Memory" },
  });
  const second = await request.post("/api/people", {
    data: { name: "Ben Memory" },
  });
  expect(first.ok() && second.ok()).toBeTruthy();
  const { id: ada } = await first.json();
  const { id: ben } = await second.json();
  await page.goto("/");
  await page.locator(`[data-person-id="${ada}"]`).press("Enter");
  await page.getByRole("button", { name: "+ Memory", exact: true }).click();
  const capture = page.getByRole("region", {
    name: "A moment worth remembering.",
  });
  await capture.getByLabel("Memory note").fill("A memorable conversation.");
  const search = capture.getByLabel("Find people to link");
  await search.fill("Ben");
  await expect(
    capture.getByRole("button", {
      name: "Remove Ada Memory from memory",
      exact: true,
    }),
  ).toBeVisible();
  await capture
    .getByRole("button", { name: "Link Ben Memory to memory", exact: true })
    .click();
  await expect(capture.locator(".memory-link-label")).toHaveText(
    "2 people linked",
  );
  await expect(page.locator(".map-stage")).toHaveAttribute(
    "data-settling",
    "false",
    { timeout: 10000 },
  );
  await page.screenshot({ path: "artifacts/memory-linked-selection.png" });
  await search.fill("Nobody matches");
  await expect(capture.getByRole("status")).toContainText(
    "No unlinked people match",
  );
  await expect(
    capture.getByRole("button", {
      name: "Remove Ben Memory from memory",
      exact: true,
    }),
  ).toBeVisible();
  await capture
    .getByRole("button", { name: "Remove Ada Memory from memory", exact: true })
    .click();
  await expect(capture.locator(".memory-link-label")).toHaveText(
    "1 person linked",
  );
  await search.fill("Ada");
  await expect(
    capture.getByRole("button", {
      name: "Link Ada Memory to memory",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "false");

  let releaseSave!: () => void;
  const saving = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await page.route("**/api/memories", async (route) => {
    if (route.request().method() === "POST") await saving;
    await route.continue();
  });
  await capture
    .getByRole("button", { name: "Save memory", exact: true })
    .click();
  await expect(
    capture.getByRole("button", { name: "Saving memory…", exact: true }),
  ).toBeDisabled();
  await expect(
    capture.getByRole("button", { name: "Find known names", exact: true }),
  ).toBeDisabled();
  await expect(
    capture.getByRole("button", { name: "Finding people…", exact: true }),
  ).toHaveCount(0);
  await expect(capture.getByLabel("Memory note")).toBeDisabled();
  await expect(capture.getByLabel("Find people to link")).toBeDisabled();
  await expect(
    capture.getByRole("button", {
      name: "Remove Ben Memory from memory",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    capture.getByRole("button", { name: "Discard draft", exact: true }),
  ).toBeDisabled();
  await capture
    .getByRole("button", { name: "Close memory", exact: true })
    .click();
  await page.getByRole("button", { name: "+ Memory", exact: true }).click();
  await expect(capture.getByLabel("Memory note")).toHaveValue(
    "A memorable conversation.",
  );
  await expect(capture.getByLabel("Memory note")).toBeDisabled();
  await expect(
    capture.getByRole("button", { name: "Save memory", exact: true }),
  ).toBeDisabled();
  await expect(
    capture.getByRole("button", { name: "Discard draft", exact: true }),
  ).toBeDisabled();
  releaseSave();
  await expect(capture).toHaveCount(0);
  const memories = await (await request.get("/api/memories")).json();
  expect(memories.thoughts[0]).toMatchObject({
    body: "A memorable conversation.",
    personIds: [ben],
  });
  await page.getByRole("button", { name: "+ Memory", exact: true }).click();
  await expect(capture.getByLabel("Memory note")).toHaveValue("");
});

test("quick add drafts survive panel changes, stay in their universe, and clear on save or discard", async ({
  page,
  request,
}) => {
  const res = await request.post("/api/people", {
    data: { name: "Draft Anchor" },
  });
  expect(res.ok()).toBeTruthy();
  const { id } = await res.json();
  await page.goto("/");
  const open = () =>
    page.getByRole("button", { name: "+ Add people", exact: true }).click();
  const capture = page.getByRole("region", { name: "Who’s in your orbit?" });
  const names = capture.getByLabel("Names to add");
  await open();
  await names.fill("Personal Draft | keep this context");
  await capture.getByText("Add everyone to a group", { exact: true }).click();
  await capture.getByLabel("New group for people").fill("Draft Crew");
  await page.getByRole("button", { name: "✧ Ask", exact: true }).click();
  await expect(capture).toHaveCount(0);
  await open();
  await expect(names).toHaveValue("Personal Draft | keep this context");
  await capture.getByText("Add everyone to a group", { exact: true }).click();
  await expect(capture.getByLabel("New group for people")).toHaveValue(
    "Draft Crew",
  );
  await capture
    .getByRole("button", { name: "Close add people", exact: true })
    .click();
  await page.locator(`[data-person-id="${id}"]`).press("Enter");
  await open();
  await expect(names).toHaveValue("Personal Draft | keep this context");
  await page.getByRole("button", { name: "Try demo ↗", exact: true }).click();
  await open();
  await expect(names).toHaveValue("");
  await names.fill("Demo Draft");
  await page
    .getByRole("button", { name: "Open My people ↗", exact: true })
    .click();
  await open();
  await expect(names).toHaveValue("Personal Draft | keep this context");

  await page.route("**/api/people/batch", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Capture test failure" }),
    }),
  );
  await capture
    .getByRole("button", { name: "Add person", exact: true })
    .click();
  await expect(capture.getByRole("alert")).toHaveText("Capture test failure");
  await capture
    .getByRole("button", { name: "Close add people", exact: true })
    .click();
  await open();
  await expect(names).toHaveValue("Personal Draft | keep this context");
  await capture.getByText("Add everyone to a group", { exact: true }).click();
  await expect(capture.getByLabel("New group for people")).toHaveValue(
    "Draft Crew",
  );
  await page.unroute("**/api/people/batch");
  await capture
    .getByRole("button", { name: "Add person", exact: true })
    .click();
  await expect(capture).toHaveCount(0);
  const graph = await (await request.get("/api/graph")).json();
  expect(
    graph.nodes.find(
      (person: { name: string }) => person.name === "Personal Draft",
    ),
  ).toMatchObject({ description: "keep this context" });
  expect(Object.values(graph.bucketNames)).toContain("Draft Crew");
  await open();
  await expect(names).toHaveValue("");
  await names.fill("Discard Me");
  await capture
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await expect(capture).toHaveCount(0);
  await open();
  await expect(names).toHaveValue("");
  await page.getByRole("button", { name: "Try demo ↗", exact: true }).click();
  await open();
  await expect(names).toHaveValue("Demo Draft");
});

test("memory drafts preserve links, isolate new and edited memories, and retain failed saves", async ({
  page,
  request,
}) => {
  const person = await request.post("/api/people", {
    data: { name: "Draft Friend" },
  });
  expect(person.ok()).toBeTruthy();
  const { id } = await person.json();
  expect(
    (
      await request.post("/api/memories", {
        data: { body: "Saved original memory.", personIds: [id] },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/");
  const open = () =>
    page.getByRole("button", { name: "+ Memory", exact: true }).click();
  const capture = page.getByRole("region", {
    name: "A moment worth remembering.",
  });
  const note = capture.getByLabel("Memory note");
  await open();
  await note.fill("New personal memory draft.");
  await capture
    .getByRole("button", { name: "Link Draft Friend to memory", exact: true })
    .click();
  await page.getByRole("button", { name: "✧ Ask", exact: true }).click();
  await open();
  await expect(note).toHaveValue("New personal memory draft.");
  await expect(
    capture.getByRole("button", {
      name: "Remove Draft Friend from memory",
      exact: true,
    }),
  ).toBeVisible();
  await capture
    .getByRole("button", { name: "Close memory", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Find and filter people", exact: true })
    .click();
  await page.getByRole("button", { name: /≡.*Memories/ }).click();
  await page.getByRole("button", { name: "Edit memory", exact: true }).click();
  await expect(note).toHaveValue("Saved original memory.");
  await note.fill("Edited memory draft.");
  await capture
    .getByRole("button", { name: "Close memory", exact: true })
    .click();
  await open();
  await expect(note).toHaveValue("New personal memory draft.");
  await capture
    .getByRole("button", { name: "Close memory", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit memory", exact: true }).click();
  await expect(note).toHaveValue("Edited memory draft.");
  await capture
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit memory", exact: true }).click();
  await expect(note).toHaveValue("Saved original memory.");
  await page.getByRole("button", { name: "Try demo ↗", exact: true }).click();
  await open();
  await expect(note).toHaveValue("");
  await note.fill("Demo memory draft.");
  await page
    .getByRole("button", { name: "Open My people ↗", exact: true })
    .click();
  await open();
  await expect(note).toHaveValue("New personal memory draft.");
  await expect(
    capture.getByRole("button", {
      name: "Remove Draft Friend from memory",
      exact: true,
    }),
  ).toBeVisible();
  await page.route("**/api/memories", async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Memory test failure" }),
      });
    else await route.continue();
  });
  await capture
    .getByRole("button", { name: "Save memory", exact: true })
    .click();
  await expect(capture.locator(".inline-notice")).toHaveText(
    "Memory test failure",
  );
  await capture
    .getByRole("button", { name: "Close memory", exact: true })
    .click();
  await open();
  await expect(note).toHaveValue("New personal memory draft.");
  await expect(
    capture.getByRole("button", {
      name: "Remove Draft Friend from memory",
      exact: true,
    }),
  ).toBeVisible();
  await page.unroute("**/api/memories");
  await capture
    .getByRole("button", { name: "Save memory", exact: true })
    .click();
  await expect(capture).toHaveCount(0);
  await open();
  await expect(note).toHaveValue("");
  await page.getByRole("button", { name: "Try demo ↗", exact: true }).click();
  await open();
  await expect(note).toHaveValue("Demo memory draft.");
  await capture
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await open();
  await expect(note).toHaveValue("");
});
