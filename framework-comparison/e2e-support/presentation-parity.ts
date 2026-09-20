import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, type Page, type TestInfo } from '@playwright/test';

/** Visible copy and computed style observations for a same-run reference. */
export type Presentation = { text: string; styles: string[][][] };

/** Compares current participants on one browser/OS instead of accepting platform-specific golden images. */
export async function comparePresentation(
	page: Page,
	references: Map<string, Presentation>,
	participant: string,
	state: string,
	info: TestInfo
) {
	await page.mouse.move(0, 0);
	await page.evaluate(() => window.scrollTo(0, 0));
	const text = (await page.locator('.app-shell').innerText()).replace(/\s+/g, ' ').trim();
	const styles = await page.evaluate(() => {
		const selectors = [
			'.app-shell',
			'.masthead',
			'h1',
			'main',
			'.queue-panel',
			'#queue-title',
			'.incident',
			'.severity',
			'.detail-panel',
			'.detail-heading h2',
			'.facts strong',
			'textarea',
			'button.primary',
			'.analysis-card'
		];
		const properties = [
			'color',
			'background-color',
			'background-image',
			'font-family',
			'font-size',
			'font-weight',
			'line-height',
			'padding',
			'margin',
			'border-width',
			'border-style',
			'border-color',
			'border-radius',
			'display',
			'gap',
			'text-transform'
		];
		return selectors.map((selector) =>
			Array.from(document.querySelectorAll(selector), (element) => {
				const style = getComputedStyle(element);
				return properties.map((property) => style.getPropertyValue(property));
			})
		);
	});
	const png = await page.screenshot({
		path: info.outputPath(`${participant}-${state}.png`),
		fullPage: true,
		animations: 'disabled',
		caret: 'hide',
		scale: 'css'
	});
	if (['all', 'changed'].includes(info.config.updateSnapshots))
		throw new Error(
			'Presentation parity cannot accept snapshot updates from a compared participant'
		);
	const reference = references.get(state);
	if (!reference) {
		const path = info.snapshotPath(`${state}.png`);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, png);
		references.set(state, { text, styles });
		return;
	}
	expect(text, `${participant}: ${state} visible copy`).toBe(reference.text);
	expect(styles, `${participant}: ${state} presentation styles`).toEqual(reference.styles);
	// Text-node segmentation can change glyph antialiasing. Geometry and perceptible pixels must match.
	expect(png, `${participant}: ${state} presentation`).toMatchSnapshot(`${state}.png`, {
		threshold: 0.2,
		maxDiffPixels: 0
	});
}
