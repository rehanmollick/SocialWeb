import { test, expect } from "@playwright/test";
import { nameFont, placeNames, type LabelItem } from "../lib/graph/labels";

test("name packing preserves readable screen-space sizes and collision handling", () => {
  const items: LabelItem[] = Array.from({ length: 100 }, (_, id) => ({
    id,
    name: `Constellation Friend ${id + 1}`,
    x: (id % 10) * 42,
    y: Math.floor(id / 10) * 42,
    radius: 5,
    halo: 10,
    priority: id === 0 ? 100 : 0,
    force: id === 0,
  }));
  for (const zoom of [0.15, 0.4, 1, 3]) {
    expect(nameFont(zoom)).toBeGreaterThanOrEqual(11);
    const labels = placeNames(
      items,
      zoom,
      (name, font) => name.length * font * 0.55,
    );
    expect(labels.get(0)?.font).toBeGreaterThanOrEqual(12);
    expect(labels.size).toBeGreaterThan(1);
    expect(labels.size).toBeLessThan(items.length);
    const packed = [...labels.values()];
    for (let i = 0; i < packed.length; i++) {
      expect(packed[i].font).toBeGreaterThanOrEqual(10.5);
      for (let j = i + 1; j < packed.length; j++) {
        const a = packed[i].rect,
          b = packed[j].rect;
        expect(
          a.left < b.right &&
            a.right > b.left &&
            a.top < b.bottom &&
            a.bottom > b.top,
        ).toBe(false);
      }
    }
  }
});

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });

test("desktop profile selection preserves a visible overview and exposes keyboard stars", async ({
  page,
  request,
}) => {
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
  const seeded = await request.post("/api/people/batch", {
    data: {
      people: Array.from({ length: 25 }, (_, i) => ({
        name: `Star Person ${String.fromCharCode(65 + i)}`,
        bg: ["ut", "sf", "family", "climb", "plano"][i % 5],
      })),
    },
  });
  expect(seeded.ok()).toBeTruthy();
  const firstId = (await seeded.json()).ids[0] as number;
  await page.goto("/");
  const map = page.getByRole("group", { name: /^Relationship map\./ });
  await expect(map.getByRole("button")).toHaveCount(25);
  await expect(page.locator(".map-stage")).toHaveAttribute(
    "data-settling",
    "false",
  );
  await page.getByRole("button", { name: "Fit map", exact: true }).click();
  const fonts = await page
    .locator(".person-name")
    .evaluateAll((labels) =>
      labels.map(
        (el) =>
          Number(el.getAttribute("font-size")) *
          Math.hypot(
            (el as SVGGraphicsElement).getScreenCTM()!.a,
            (el as SVGGraphicsElement).getScreenCTM()!.b,
          ),
      ),
    );
  expect(fonts.length).toBeGreaterThanOrEqual(20);
  expect(Math.min(...fonts)).toBeGreaterThanOrEqual(10.49);
  await map.locator(`[data-person-id="${firstId}"]`).press("Enter");
  await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
  await expect
    .poll(async () =>
      Math.round((await page.locator(".right-panel").boundingBox())!.width),
    )
    .toBe(370);
  // Establish the docked overview before comparing two selections.
  await page.getByRole("button", { name: "Fit map", exact: true }).click();
  const camera = map.locator(":scope > g");
  const before = await camera.getAttribute("transform");
  const zoom = await page
    .getByLabel("Zoom level", { exact: true })
    .textContent();
  const candidate = await map.evaluate((el) => {
    const area = el.getBoundingClientRect();
    return [...el.querySelectorAll<SVGGElement>(".map-person")].find(
      (person) => {
        if (person.dataset.personId === "1") return false;
        const box = person.getBoundingClientRect();
        return (
          box.left > area.left + 65 &&
          box.right < area.right - 65 &&
          box.top > area.top + 80 &&
          box.bottom < area.bottom - 110
        );
      },
    )?.dataset.personId;
  });
  expect(candidate).toBeDefined();
  const person = map.locator(`[data-person-id="${candidate}"]`);
  await person.focus();
  await expect(person).toBeFocused();
  await person.press("Enter");
  await expect(camera).toHaveAttribute("transform", before!);
  await expect(page.getByLabel("Zoom level", { exact: true })).toHaveText(
    zoom!,
  );
  const selectedFont = await person
    .locator(".person-name")
    .evaluate(
      (el) =>
        Number(el.getAttribute("font-size")) *
        Math.hypot(
          (el as SVGGraphicsElement).getScreenCTM()!.a,
          (el as SVGGraphicsElement).getScreenCTM()!.b,
        ),
    );
  expect(selectedFont).toBeGreaterThanOrEqual(11.99);
  await page.screenshot({ path: "artifacts/map-polish-profile.png" });

  // A selected person outside the manually zoomed view needs only enough pan
  // to reveal them, while the user's zoom remains in charge.
  await page.getByLabel("Map zoom", { exact: true }).press("End");
  await expect(page.getByLabel("Zoom level", { exact: true })).toHaveText(
    "300%",
  );
  const outside = await map.evaluate((el) => {
    const area = el.getBoundingClientRect();
    return [...el.querySelectorAll<SVGGElement>(".map-person")].find(
      (person) => person.getBoundingClientRect().left > area.right,
    )?.dataset.personId;
  });
  expect(outside).toBeDefined();
  const revealed = map.locator(`[data-person-id="${outside}"]`);
  await revealed.press("Enter");
  await expect(page.getByLabel("Zoom level", { exact: true })).toHaveText(
    "300%",
  );
  const area = (await map.boundingBox())!;
  const box = (await revealed.boundingBox())!;
  // Margins are 48/60/90px in the map; allow 1px for subpixel text bounds.
  expect(box.x).toBeGreaterThanOrEqual(area.x + 47 - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width - 47 + 1);
  expect(box.y).toBeGreaterThanOrEqual(area.y + 59 - 1);
  expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height - 89 + 1);
});
