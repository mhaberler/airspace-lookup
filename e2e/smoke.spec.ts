import { test, expect, stabilizeTileRequests } from './_helpers';

test('smoke: page loads and map container exists', async ({ page }) => {
  await stabilizeTileRequests(page);

  await page.goto('/');
  await expect(page.locator('.airspace-map-container')).toBeVisible();

  // Leaflet attaches .leaflet-container to the element it initialises on.
  await expect(page.locator('.airspace-map-container.leaflet-container')).toBeVisible({ timeout: 15_000 });
});
