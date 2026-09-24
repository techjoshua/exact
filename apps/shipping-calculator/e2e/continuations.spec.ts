import { expect, test } from '@playwright/test';

const endpoint = '**/__exact';
const hydrated = '[data-exact-client-hydrated="true"]';

test('adopts SSR controls and executes repeated server continuations', async ({ page }) => {
	let release!: () => void;
	const scripts = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route('**/*.js', async (route) => {
		await scripts;
		await route.continue();
	});
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	let requests = 0;
	page.on('request', (request) => {
		if (new URL(request.url()).pathname === '/__exact') requests++;
	});
	try {
		await page.goto('/', { waitUntil: 'commit' });
		const destination = page.getByLabel('To ZIP');
		await expect(destination).toBeVisible();
		const original = await destination.elementHandle();
		await expect(page.getByRole('heading', { name: 'DOOP Standard' })).toBeVisible();
		release();
		await expect(page.locator(hydrated).first()).toBeAttached();
		expect(
			await original!.evaluate((node) => node === document.querySelector('[name="destinationZip"]'))
		).toBe(true);
		await page.waitForTimeout(600);
		expect(requests).toBe(0);
		const arc = page.locator('.route-arc');
		const initialArc = await arc.getAttribute('d');
		await destination.fill('94105');
		await expect(arc).not.toHaveAttribute('d', initialArc!);
		await expect(page.getByRole('status')).toContainText('Showing rates from 1 source');
		const price = page
			.locator('.rate-card')
			.filter({ has: page.getByRole('heading', { name: 'DOOP Standard', exact: true }) })
			.locator('.price strong');
		const firstPrice = await price.textContent();
		await page.getByLabel('Pounds', { exact: true }).fill('10');
		await expect(price).not.toHaveText(firstPrice!);
		await expect(page.getByRole('status')).toContainText('Showing rates from 1 source');
		expect(requests).toBeGreaterThanOrEqual(2);
		expect(errors).toEqual([]);
	} finally {
		release();
	}
});

test('recovers from transport failure on the next valid edit', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator(hydrated).first()).toBeAttached();
	await page.route(endpoint, (route) =>
		route.fulfill({ status: 503, body: 'Temporarily unavailable' })
	);
	await page.getByLabel('To ZIP').fill('94105');
	await expect(page.getByRole('alert')).toContainText('could not be refreshed');
	await expect(page.getByRole('status')).toContainText('Showing rates from 0 sources');
	await page.unroute(endpoint);
	await page.getByLabel('To ZIP').fill('97209');
	await expect(page.getByRole('status')).toContainText('Showing rates from 1 source');
	await expect(page.getByRole('heading', { name: 'DOOP Standard' })).toBeVisible();
	await expect(page.getByRole('alert')).not.toContainText('could not be refreshed');
});

test('a delayed superseded response cannot replace the latest result', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator(hydrated).first()).toBeAttached();
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let held = false;
	let delivered = false;
	await page.route(endpoint, async (route) => {
		if (held) {
			await route.continue();
			return;
		}
		held = true;
		const response = await route.fetch();
		await gate;
		await route.fulfill({ response });
		delivered = true;
	});
	try {
		await page.getByLabel('To ZIP').fill('94105');
		await expect.poll(() => held).toBe(true);
		await page.getByLabel('To ZIP').fill('97209');
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						JSON.parse(localStorage.getItem('parcel-lab:last-shipment') ?? 'null')?.destinationZip
				)
			)
			.toBe('97209');
		await expect(page.getByRole('status')).toContainText('Showing rates from 1 source');
		const arc = await page.locator('.route-arc').getAttribute('d');
		const prices = await page.locator('.price strong').allTextContents();
		release();
		await expect.poll(() => delivered).toBe(true);
		// Allow the released response to cross the browser's asynchronous transport boundary.
		await page.waitForTimeout(600);
		await expect(page.getByLabel('To ZIP')).toHaveValue('97209');
		await expect(page.locator('.route-arc')).toHaveAttribute('d', arc!);
		expect(await page.locator('.price strong').allTextContents()).toEqual(prices);
	} finally {
		release();
	}
});
