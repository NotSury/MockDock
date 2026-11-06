/**
 * Browser walkthrough of the core MockDock workflow, driven with Playwright.
 *
 *   node e2e/ui-workflow.cjs [baseUrl] [screenshotDir]
 *
 * Requires the backend + frontend to be running (default http://127.0.0.1:5173).
 * Creates a throwaway project, builds an endpoint through the UI, calls it
 * from the API tester, edits it, checks the inspector, then deletes the project.
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:5173";
const SHOTS = process.argv[3];
const slug = `e2e-${Date.now().toString(36)}`;

function step(name) {
  process.stdout.write(`• ${name} … `);
}
function ok(extra = "") {
  console.log(`ok${extra ? ` (${extra})` : ""}`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Ignore "Failed to load resource" noise: the test deliberately requests 404/500 mocks.
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
  const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });

  try {
    step("open dashboard");
    await page.goto(BASE + "/");
    await page.getByRole("heading", { name: "Dashboard" }).waitFor();
    ok();

    step("create project via dialog");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill("E2E Project");
    await page.getByLabel("URL slug").fill(slug);
    await page.getByRole("button", { name: "Create project" }).click();
    await page.waitForURL(/\/projects\/\d+$/);
    const projectId = page.url().match(/projects\/(\d+)/)[1];
    ok(`id ${projectId}`);

    step("create GET endpoint");
    await page.getByRole("button", { name: "New endpoint" }).first().click();
    await page.getByLabel("Endpoint path").fill("/users/:id");
    const editor = page.locator(".monaco-editor").first();
    await editor.waitFor();
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Delete");
    await page.keyboard.insertText('{"id": {{params.id}}, "name": "Alice"}');
    await page.getByText("Valid JSON").waitFor();
    await page.getByRole("button", { name: "Create" }).click();
    await page.waitForURL(/endpoints\/\d+$/);
    await page.getByText("Endpoint created").waitFor();
    await shot("e2e-editor");
    ok();

    step("call it from the API tester");
    await page.goto(BASE + "/tester");
    await page.getByLabel("Request URL").fill(`/mock/${slug}/users/42`);
    await page.getByRole("button", { name: "Send" }).click();
    await page.locator(".monaco-editor .view-lines", { hasText: "Alice" }).first().waitFor();
    const body = (await page.locator(".monaco-editor .view-lines").first().innerText()).replace(/\u00a0/g, " ");
    if (!body.includes('"id": 42') || !body.includes("Alice")) throw new Error("unexpected body: " + body);
    await shot("e2e-tester");
    ok();

    step("edit the response and verify the change is live");
    await page.goto(`${BASE}/projects/${projectId}`);
    await page.getByText("/users/:id").first().click();
    await page.getByRole("spinbutton", { name: "Status code" }).fill("201");
    await page.keyboard.press("ControlOrMeta+S");
    await page.getByText("Saved — live immediately").waitFor();
    const res = await page.evaluate(async (u) => (await fetch(u)).status, `/mock/${slug}/users/1`);
    if (res !== 201) throw new Error("expected 201, got " + res);
    ok();

    step("simulate failures at 100%");
    await page.getByRole("tab", { name: /Failure simulation/ }).click();
    await page.getByLabel("Failure probability").fill("100");
    await page.keyboard.press("ControlOrMeta+S");
    await page.getByText("Saved — live immediately").first().waitFor();
    await page.waitForTimeout(300);
    const failed = await page.evaluate(async (u) => (await fetch(u)).status, `/mock/${slug}/users/1`);
    if (failed !== 500) throw new Error("expected simulated 500, got " + failed);
    ok();

    step("inspect the logged requests");
    await page.goto(`${BASE}/inspector?project=${projectId}`);
    await page.locator("tbody tr").first().waitFor();
    const rows = await page.locator("tbody tr").count();
    if (rows < 3) throw new Error("expected >= 3 logged requests, saw " + rows);
    await page.locator("tbody tr").first().click();
    await page.getByRole("button", { name: "Replay in tester" }).waitFor();
    await shot("e2e-inspector");
    ok(`${rows} rows`);

    step("delete the project");
    await page.goto(`${BASE}/projects/${projectId}`);
    await page.getByRole("button", { name: "Project actions" }).click();
    await page.getByRole("menuitem", { name: "Delete project" }).click();
    await page.getByRole("button", { name: "Delete project" }).click();
    await page.waitForURL(/\/projects$/);
    const gone = await page.evaluate(async (u) => (await fetch(u)).status, `/mock/${slug}/users/1`);
    if (gone !== 404) throw new Error("expected 404 after delete, got " + gone);
    ok();

    if (errors.length) throw new Error("browser errors:\n" + errors.join("\n"));
    console.log("\nUI workflow passed ✔");
  } catch (e) {
    console.log("FAILED");
    console.error(e.message);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-failure.png` });
    process.exitCode = 1;
  } finally {
    // Clean up even if a step failed, so reruns don't accumulate projects.
    await page.evaluate(async (slug) => {
      const projects = await (await fetch("/api/projects")).json();
      for (const p of projects.filter((p) => p.slug === slug)) await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
    }, slug).catch(() => {});
    await browser.close();
  }
})();
