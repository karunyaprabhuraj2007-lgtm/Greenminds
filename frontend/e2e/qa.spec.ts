import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Visual QA: every role, empty states, and a real survey created through the UI
 * (AOI drawn in the real Baramati taluka, plots drawn on the map).
 * Screenshots are written to docs/screenshots/.
 */
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/screenshots");
const PASSWORD = process.env.E2E_PASSWORD ?? "GreenMinds@2026";
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
}

const navLabels = (page: Page) => page.getByRole("navigation", { name: "Main" }).getByRole("link").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));

test.describe.serial("GreenMinds QA", () => {
  let surveyUrl = "";

  test("login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible(); // inline validation
    await shot(page, "01-login");
    await page.getByLabel("Email").fill("officer.pune@greenminds.demo");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText("Invalid email or password");
  });

  test("officer: empty states on a fresh installation", async ({ page }) => {
    await login(page, "officer.pune@greenminds.demo");
    expect(await navLabels(page)).toEqual(["GreenMinds home", "Dashboard", "GIS map", "Surveys", "New survey", "Account & data sources"]);
    await expect(page.getByText("No surveys yet")).toBeVisible();
    await page.waitForTimeout(1500);
    await shot(page, "02-dashboard-empty", true);
    await page.goto("/surveys");
    await expect(page.getByText("No surveys yet")).toBeVisible();
    await shot(page, "03-surveys-empty");
    await page.goto("/map");
    await expect(page.getByText("District and taluka boundaries are loaded")).toBeVisible();
    await page.waitForTimeout(2500);
    await shot(page, "04-map-real-boundaries");
  });

  test("officer: create a survey by drawing the AOI in Baramati", async ({ page }) => {
    await login(page, "officer.pune@greenminds.demo");
    await page.goto("/surveys/new");
    await page.getByLabel("Survey name").fill("Baramati Rabi crop health");
    await page.getByLabel("Survey type").selectOption("crop_health");
    await page.getByLabel("Taluka").selectOption({ label: "Baramati" });
    await page.getByLabel("Season").fill("Rabi 2026");
    await page.getByRole("button", { name: "Next: area of interest" }).click();
    const canvas = page.locator(".maplibregl-canvas");
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(2000);
    for (let i = 0; i < 5; i++) { await page.locator(".maplibregl-ctrl-zoom-in").click(); await page.waitForTimeout(250); }
    await page.waitForTimeout(1000);
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    for (const [dx, dy] of [[-180, -110], [170, -130], [190, 120], [-160, 140]]) { await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(150); }
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByText("Area ready.")).toBeVisible();
    await shot(page, "05-new-survey-aoi");
    await page.getByRole("button", { name: "Review" }).click();
    await page.getByRole("button", { name: "Create survey" }).click();
    await page.waitForURL(/\/surveys\/[0-9a-f-]{36}$/);
    surveyUrl = page.url();
    await expect(page.getByRole("tab", { name: /Overview/ })).toBeVisible();
    await page.waitForTimeout(2500);
    await shot(page, "06-survey-overview");
  });

  test("officer: Sentinel-2 and weather fetch (graceful failure when unreachable)", async ({ page }) => {
    await login(page, "officer.pune@greenminds.demo");
    await page.goto(surveyUrl);
    await page.getByRole("tab", { name: "Sentinel-2" }).click();
    await page.getByRole("button", { name: /Fetch Sentinel-2/ }).first().click();
    await expect(page.getByText(/The last Sentinel-2 refresh failed|No Sentinel-2 scenes found|Mean NDVI/)).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(800);
    await shot(page, "07-survey-sentinel2");
    await page.getByRole("tab", { name: "Weather" }).click();
    await page.getByRole("button", { name: /Fetch weather/ }).first().click();
    await expect(page.getByText(/The last Open-Meteo refresh failed|Daily rainfall/)).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(800);
    await shot(page, "08-survey-weather");
  });

  test("officer: draw plots on the map and inspect one", async ({ page }) => {
    await login(page, "officer.pune@greenminds.demo");
    await page.goto(surveyUrl);
    await page.getByRole("tab", { name: /Plots/ }).click();
    await expect(page.getByText("No plots yet")).toBeVisible();
    await shot(page, "09-plots-empty");
    await page.getByRole("button", { name: "Draw on map" }).first().click();
    await expect(page.getByText(/Click the plot corners/)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2000);
    const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
    const cx = box.x + box.width / 2 - 80, cy = box.y + box.height / 2;
    const plots = [
      { code: "B-101", parcel: "Gat 214", pts: [[-150, -90], [-20, -95], [-15, 60], [-155, 65]] },
      { code: "B-102", parcel: "Gat 215", pts: [[0, -95], [140, -100], [150, 55], [5, 60]] },
    ];
    for (const [i, p] of plots.entries()) {
      if (i > 0) await page.getByRole("button", { name: "Draw plot" }).click();
      for (const [dx, dy] of p.pts) { await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(120); }
      await page.getByRole("button", { name: "Finish" }).click();
      await page.getByLabel("Plot code").fill(p.code);
      await page.getByLabel("Parcel reference").fill(p.parcel);
      await page.getByRole("button", { name: "Save plot" }).click();
      await expect(page.getByText(`Plot ${p.code} saved`)).toBeVisible();
      await page.waitForTimeout(800);
    }
    await expect(page.getByRole("complementary", { name: "Details" })).toContainText("Gat 215");
    await page.waitForTimeout(1500);
    await shot(page, "10-map-plot-drawer");
    await page.getByRole("button", { name: "Close panel (Esc)" }).click();
    await page.waitForTimeout(800);
    await shot(page, "11-map-survey-drawer");
  });

  test("officer: dashboard and survey list with real rows", async ({ page }) => {
    await login(page, "officer.pune@greenminds.demo");
    await expect(page.getByText("Plots mapped").first()).toBeVisible();
    await page.waitForTimeout(2000);
    await shot(page, "12-dashboard-with-data", true);
    await page.goto("/surveys");
    await expect(page.getByRole("cell", { name: "Baramati Rabi crop health", exact: true })).toBeVisible();
    await shot(page, "13-surveys-table");
    await page.goto(surveyUrl);
    await page.getByRole("tab", { name: /Plots/ }).click();
    await expect(page.getByRole("cell", { name: "B-101", exact: true })).toBeVisible();
    await shot(page, "14-survey-plots-table");
  });

  test("command palette and keyboard shortcuts", async ({ page }) => {
    await login(page, "officer.pune@greenminds.demo");
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox").fill("B-10");
    await expect(page.getByRole("option", { name: /B-101/ })).toBeVisible();
    await shot(page, "15-command-palette");
    await page.keyboard.press("Escape");
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await shot(page, "16-shortcuts");
  });

  test("state admin: users, audit log, data sources", async ({ page }) => {
    await login(page, "admin@greenminds.demo");
    expect(await navLabels(page)).toContain("Users");
    await page.goto("/users");
    await expect(page.getByRole("cell", { name: "officer.pune@greenminds.demo" })).toBeVisible();
    await shot(page, "17-users");
    await page.goto("/audit-log");
    await expect(page.getByRole("cell", { name: "survey" }).first()).toBeVisible();
    await shot(page, "18-audit-log");
    await page.goto("/account");
    await expect(page.getByText("Data sources and licences")).toBeVisible();
    await shot(page, "19-account-data-sources", true);
  });

  test("drone operator and field verifier navigation", async ({ page }) => {
    await login(page, "operator@greenminds.demo");
    expect(await navLabels(page)).toEqual(["GreenMinds home", "Dashboard", "GIS map", "Surveys", "New survey", "Account & data sources"]);
    await page.waitForTimeout(1500);
    await shot(page, "20-operator-dashboard");
    await login(page, "verifier@greenminds.demo");
    expect(await navLabels(page)).toEqual(["GreenMinds home", "Account & data sources"]);
    await expect(page.getByText("No plots assigned to you yet")).toBeVisible();
    await shot(page, "21-verifier-account");
  });

  test("tablet width layout", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await login(page, "officer.pune@greenminds.demo");
    await page.waitForTimeout(1500);
    await shot(page, "22-tablet-dashboard");
    await page.goto(surveyUrl.replace(/\/surveys\/.*/, "/map"));
    await page.waitForTimeout(2500);
    await shot(page, "23-tablet-map");
  });
});
