import { expect, test } from "@playwright/test";

test("calculates, updates the map, and stays within the viewport", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Find the right way to send it." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "DOOP Standard" })).toBeVisible();
  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(viewportWidth);

  await page.getByLabel("To ZIP").fill("97209");
  await expect(page.getByRole("heading", { name: "DOOP Today" })).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".route-arc")).toBeVisible();
});

test("is keyboard operable and exposes status semantics", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("From ZIP").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Swap origin and destination" })).toBeFocused();
  await expect(page.getByRole("status")).toContainText(/Showing rates|Refreshing/);
});

test("keeps controls labeled and touch-sized and honors reduced motion", async ({ page }, testInfo) => {
  await page.goto("/");
  const unnamed = await page.locator("button, input, select, summary").evaluateAll(elements => elements.filter(element => {
    const control = element as HTMLInputElement;
    return !control.labels?.length && !element.getAttribute("aria-label") && !element.textContent?.trim();
  }).length);
  expect(unnamed).toBe(0);
  const undersized = await page.locator("button, input:not([type=checkbox]), select, summary").evaluateAll(elements => elements.filter(element => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.height < 44;
  }).length);
  expect(undersized).toBe(0);
  if (testInfo.project.name === "tablet-dark") {
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await expect(page.locator(".route-arc")).toHaveCSS("animation-iteration-count", "1");
    const background = await page.locator("body").evaluate(element => getComputedStyle(element).backgroundColor);
    expect(background).not.toBe("rgb(255, 255, 255)");
  }
});
