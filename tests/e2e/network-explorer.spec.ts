import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { demoAnalysis } from "../../src/ui/demo";
import { openGraphOptions } from "./helpers";

async function network(
  page: import("@playwright/test").Page,
  inferredFixture = false,
) {
  await page.goto("/#workspace");
  const a = demoAnalysis();
  if (inferredFixture) a.graph.edges.at(-1)!.kind = "inferred";
  Object.assign(a.settings, {
    nodeShape: "dot",
    colorBy: "community",
    edgeLabelMode: "selection",
    layout: "cose",
    positions: undefined,
    edgeLength: 100,
    nodeFontSize: 13,
  });
  await page.locator("#import-file").setInputFiles({
    name: "network.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(a)),
  });
  return page.locator("#graph-root");
}
const geometry = (root: import("@playwright/test").Locator) =>
  root.locator(".graph-canvas").evaluate((el) => {
    const cy = (el as any)._cyreg.cy;
    return cy.nodes().map((n: any) => ({
      id: n.id(),
      position: n.position(),
      width: n.width(),
      label: n.boundingBox({ includeLabels: true }),
      shell: n.boundingBox({ includeLabels: false }),
    }));
  });

test("collapsible controls, compact hub nodes, community colors and label modes", async ({
  page,
}) => {
  const root = await network(page);
  await expect(root.locator(".graph-options")).toBeHidden();
  await expect(root.locator('[data-action="options"]')).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  const before = await geometry(root);
  expect(Math.max(...before.map((n: any) => n.width))).toBeLessThan(50);
  expect(new Set(before.map((n: any) => n.width)).size).toBeGreaterThan(1);
  expect(before.every((n: any) => n.label.y2 > n.shell.y2)).toBe(true);
  const metrics = () =>
    root.locator(".graph-canvas").evaluate((el) => {
      const cy = (el as any)._cyreg.cy;
      return {
        labels: cy.edges().filter((e: any) => !!e.style("label")).length,
        colors: new Set(cy.nodes().map((n: any) => n.data("renderColor"))).size,
        collisions: cy
          .nodes()
          .toArray()
          .some((a: any, i: number, all: any[]) =>
            all.slice(i + 1).some((b: any) => {
              const x = a.boundingBox(),
                y = b.boundingBox();
              return x.x1 < y.x2 && x.x2 > y.x1 && x.y1 < y.y2 && x.y2 > y.y1;
            }),
          ),
      };
    });
  expect((await metrics()).labels).toBe(0);
  expect((await metrics()).colors).toBeGreaterThan(1);
  expect((await metrics()).collisions).toBe(false);
  await openGraphOptions(root);
  await expect(root.getByLabel("Node shape", { exact: true })).toHaveValue(
    "dot",
  );
  await root.getByLabel("Connection label mode").selectOption("all");
  expect((await metrics()).labels).toBe(19);
  await root.getByLabel("Connection label mode").selectOption("selection");
  await root.locator(".accessible-graph summary").click();
  await root.locator(".graph-list [data-node]").first().click();
  expect((await metrics()).labels).toBeGreaterThan(0);
  await root.locator('[data-action="close-evidence"]').click();
  expect((await metrics()).labels).toBe(0);
  await root.locator('[data-action="options"]').click();
  expect((await geometry(root)).map((n: any) => n.position)).toEqual(
    before.map((n: any) => n.position),
  );
  await root.locator(".accessible-graph summary").click();
  await root.locator('[data-action="fit"]').click();
  await mkdir("output/evaluation/network-explorer", { recursive: true });
  await root.screenshot({
    path: "output/evaluation/network-explorer/network-dark.png",
  });
  await root.locator('[data-action="theme"]').click();
  await root.screenshot({
    path: "output/evaluation/network-explorer/network-light.png",
  });
});

test("community and evidence filters restrict path finding and preserve source inspection", async ({
  page,
}) => {
  const root = await network(page, true);
  await openGraphOptions(root);
  await root.locator(".graph-path summary").click();
  const edge = await root.locator(".graph-canvas").evaluate((el) => {
    const e = (el as any)._cyreg.cy.edges()[0];
    return { source: e.source().id(), target: e.target().id() };
  });
  await root.getByLabel("Path from", { exact: true }).selectOption(edge.source);
  await root.getByLabel("Path to", { exact: true }).selectOption(edge.target);
  await root.locator('[data-action="find-path"]').click();
  await expect(root.locator(".path-result")).toContainText("1 connection");
  await root.locator(".path-result [data-edge]").click();
  await expect(root.locator(".evidence-content blockquote")).toBeVisible();
  await root.locator('[data-action="close-evidence"]').click();
  await root.getByLabel("Show inferred relationships").uncheck();
  await expect(root.locator(".graph-count")).toContainText("18 relationships");
  await root.locator(".graph-communities summary").click();
  await root.locator("[data-community]").first().uncheck();
  expect(
    await root
      .locator(".graph-canvas")
      .evaluate((el) => (el as any)._cyreg.cy.nodes(":visible").length),
  ).toBeLessThan(18);
  await root.locator('[data-action="reset"]').click();
  await expect(root.locator(".graph-count")).toContainText(
    "18 concepts · 19 relationships",
  );
});

test("HTML fills the window offline and keeps explorer settings after an edited export", async ({
  page,
  context,
}) => {
  const root = await network(page);
  const pending = page.waitForEvent("download");
  await page.locator("#export-html").click();
  const download = await pending;
  await mkdir("output/evaluation/network-explorer", { recursive: true });
  const exportedPath = resolve(
    "output/evaluation/network-explorer/research-network.html",
  );
  await download.saveAs(exportedPath);
  const offline = await context.newPage();
  const requests: string[] = [],
    errors: string[] = [];
  offline.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  offline.on("pageerror", (error) => errors.push(error.message));
  await context.setOffline(true);
  await offline.goto(`file://${exportedPath}`);
  const viewer = offline.locator("#viewer");
  await expect(viewer.locator(".graph-options")).toBeHidden();
  expect(
    (await viewer.locator(".graph-stage").boundingBox())!.height,
  ).toBeGreaterThan(800);
  await openGraphOptions(viewer);
  await viewer.getByLabel("Color nodes by").selectOption("type");
  await viewer.getByLabel("Connection label mode").selectOption("none");
  await viewer.locator('[data-action="options"]').click();
  const editedPending = offline.waitForEvent("download");
  await offline.locator("#html").click();
  const edited = await editedPending;
  const editedPath = resolve(
    "output/evaluation/network-explorer/research-network-edited.html",
  );
  await edited.saveAs(editedPath);
  const text = await readFile(editedPath, "utf8");
  expect(text).toContain('"edgeLabelMode":"none"');
  await offline.goto(`file://${editedPath}`);
  await expect(viewer.locator(".graph-options")).toBeHidden();
  await openGraphOptions(viewer);
  await expect(viewer.getByLabel("Color nodes by")).toHaveValue("type");
  await expect(viewer.getByLabel("Connection label mode")).toHaveValue("none");
  await viewer.locator('[data-action="options"]').click();
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await offline.setViewportSize(viewport);
    expect(
      (await viewer.locator(".graph-stage").boundingBox())!.height,
    ).toBeGreaterThan(viewport.height * 0.6);
    expect(
      await offline.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    await offline.screenshot({
      path: `output/evaluation/network-explorer/offline-${viewport.width}.png`,
    });
  }
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
});
