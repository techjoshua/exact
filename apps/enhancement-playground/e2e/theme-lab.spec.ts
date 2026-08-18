import { expect, test as base, type Locator, type Page } from '@playwright/test';

const test = base.extend<{ browserErrors: string[] }>({
	browserErrors: async ({ page }, use) => {
		const errors: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(`console: ${message.text()}`);
		});
		page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
		await use(errors);
		expect(errors).toEqual([]);
	}
});

test.beforeEach(async ({ page, browserErrors: _browserErrors }) => {
	await page.goto('/#theme-lab');
	await expect(page.getByRole('heading', { name: 'Theme Lab', exact: true })).toBeVisible();
	await expect(page.locator('.theme-lab-workbench [data-exact-theme]')).toHaveCount(2);
});

test('starts with the documentation theme defaults', async ({ page }) => {
	await page.locator('.theme-customize-control > summary').click();
	const controls = page.locator('.theme-control-panel');

	await expect(controls.getByLabel('Color')).toHaveValue('blue');
	await expect(controls.getByLabel('Temperament')).toHaveValue('balanced');
	await expect(controls.getByLabel('Depth')).toHaveValue('elevated');
	await expect(controls.getByLabel('Typography')).toHaveValue('humanist');
});

test('changes tab content without overlapping or shifting layout', async ({ page }) => {
	const panel = page.locator('.tab-panel');
	const transition = await panel.evaluate(async (element) => {
		const initialHeight = element.getBoundingClientRect().height;
		const samples: Array<{ count: number; height: number; text: string }> = [];
		const sample = () => {
			const panels = element.querySelectorAll('[role="tabpanel"]');
			samples.push({
				count: panels.length,
				height: element.getBoundingClientRect().height,
				text: element.textContent ?? ''
			});
		};
		const activity = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
			(tab) => tab.textContent?.trim() === 'Activity'
		)!;
		activity.click();
		for (let elapsed = 0; elapsed <= 400; elapsed += 10) {
			sample();
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		return { initialHeight, samples };
	});

	expect(Math.max(...transition.samples.map((sample) => sample.count))).toBe(1);
	expect(Math.max(...transition.samples.map((sample) => sample.height))).toBeCloseTo(
		transition.initialHeight,
		1
	);
	expect(transition.samples.at(-1)?.text).toContain('Three updates today');
});

test('uses an on-solid foreground while hold confirmation is filled', async ({ page }) => {
	await page.getByRole('button', { name: 'Hold to confirm' }).press('Enter');
	const hold = page.locator('.hold-button');
	await expect(hold).toHaveAccessibleName('Confirmed ✓');
	await expect(hold).toHaveAttribute('data-exact-theme-variant', 'primary');
	await expect
		.poll(() =>
			hold.evaluate((element) => {
				const reference = document.createElement('span');
				reference.style.color = 'var(--exact-theme-accent-on-solid)';
				element.append(reference);
				const colors = {
					label: getComputedStyle(element.querySelector('.hold-label')!).color,
					onSolid: getComputedStyle(reference).color
				};
				reference.remove();
				return colors.label === colors.onSolid;
			})
		)
		.toBe(true);
});

test('reactively republishes root and inherited nested themes without replacing content', async ({
	page
}) => {
	const rootControls = page.getByRole('complementary', { name: 'Root theme configuration' });
	const rootScope = themeScope(page, 0);
	const nestedScope = themeScope(page, 1);
	const rootSpecimen = page.getByRole('region', { name: 'Root theme themed specimen' });
	const rootName = rootSpecimen.getByRole('textbox', { name: 'Name' });
	const nestedControls = nestedScope.locator('.theme-lab-nested-controls');

	await rootSpecimen.evaluate((element) => element.setAttribute('data-browser-identity', 'stable'));
	await rootName.fill('State survives a theme change');
	await rootName.focus();
	await nestedControls.getByLabel('Tonic preset').selectOption('inherit');
	const inheritedNestedFingerprint = await fingerprint(nestedScope);
	const originalRootFingerprint = await fingerprint(rootScope);

	await rootControls.getByLabel('Tonic preset').selectOption('rose');
	await expect.poll(() => fingerprint(rootScope)).not.toBe(originalRootFingerprint);
	await expect.poll(() => fingerprint(nestedScope)).not.toBe(inheritedNestedFingerprint);
	await expect(rootSpecimen).toHaveAttribute('data-browser-identity', 'stable');
	await expect(rootName).toHaveValue('State survives a theme change');
	await expect(rootName).toBeFocused();

	await nestedControls.getByLabel('Tonic preset').selectOption('blue');
	const explicitNestedFingerprint = await fingerprint(nestedScope);
	await rootControls.getByLabel('Tonic preset').selectOption('green');
	await expect.poll(() => fingerprint(nestedScope)).toBe(explicitNestedFingerprint);
});

test('renders every temperament in light and dark and applies typography to the whole scope', async ({
	page
}) => {
	const controls = page.getByRole('complementary', { name: 'Root theme configuration' });
	const scope = themeScope(page, 0);
	const specimen = page.getByRole('region', { name: 'Root theme themed specimen' });
	const temperaments = [
		'balanced',
		'restrained',
		'expressive',
		'dramatic',
		'soft',
		'stark',
		'monochrome'
	];

	for (const appearance of ['light', 'dark']) {
		await controls.getByLabel('Mode').selectOption(appearance);
		for (const temperament of temperaments) {
			await controls.getByLabel('Temperament').selectOption(temperament);
			await expect(scope).toHaveAttribute('data-exact-theme-appearance', appearance);
			const rendering = await renderedThemeReport(scope, specimen);
			expect(rendering.missingVariables, `${appearance}/${temperament}`).toEqual([]);
			expect(
				rendering.headingContrast,
				`${appearance}/${temperament} heading`
			).toBeGreaterThanOrEqual(4.5);
			expect(
				rendering.actionContrast,
				`${appearance}/${temperament} primary action`
			).toBeGreaterThanOrEqual(4.5);
		}
	}

	await controls.getByLabel('Typography').selectOption('monospace');
	const families = await specimen.evaluate((element) => {
		const nodes = [
			element,
			element.querySelector('h2'),
			element.querySelector('p'),
			element.querySelector('input'),
			element.querySelector('button')
		].filter((node): node is Element => node !== null);
		return nodes.map((node) => getComputedStyle(node).fontFamily);
	});
	expect(new Set(families).size).toBe(1);
	expect(families[0]).toContain('monospace');
});

test('lets Chromium paint native controls and interaction depth from the active tonic', async ({
	page
}) => {
	const controls = page.getByRole('complementary', { name: 'Root theme configuration' });
	const scope = themeScope(page, 0);
	const specimen = page.getByRole('region', { name: 'Root theme themed specimen' });
	const progress = specimen.getByRole('progressbar', { name: 'Confidence' });
	const checkbox = specimen.getByRole('checkbox', { name: 'Receive updates' });
	const save = specimen.getByRole('button', { name: 'Save changes' });
	const drag = specimen.getByRole('button', { name: 'Drag me' });
	const state = specimen.getByRole('status', { name: 'Current depth demonstration state' });

	await controls.getByLabel('Tonic preset').selectOption('rose');
	await controls.getByLabel('Mode').selectOption('light');
	await controls.getByLabel('Shape').selectOption('pill');
	await controls.getByLabel('Depth').selectOption('elevated');
	await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });

	const nativeColors = await scope.evaluate((element) => {
		const checkbox = element.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
		const progress = element.querySelector<HTMLProgressElement>('progress')!;
		const style = getComputedStyle(element);
		return {
			accent: style.getPropertyValue('--exact-theme-accent-solid').trim(),
			checkbox: getComputedStyle(checkbox).accentColor,
			progressAppearance: getComputedStyle(progress).appearance,
			progressFill: getComputedStyle(progress)
				.getPropertyValue('--_exact-theme-progress-fill')
				.trim()
		};
	});
	expect(nativeColors.checkbox).toBe(nativeColors.accent);
	expect(nativeColors.progressAppearance).toBe('none');
	expect(nativeColors.progressFill).toBe(nativeColors.accent);
	const restingShadows = await Promise.all([
		save.evaluate((element) => getComputedStyle(element).boxShadow),
		drag.evaluate((element) => getComputedStyle(element).boxShadow)
	]);
	// A saturated primary fill needs an appearance-aware contact layer in addition to the generic
	// depth shadow used by secondary and draggable actions.
	expect(restingShadows[0]).not.toBe(restingShadows[1]);
	expect(restingShadows[0]).not.toBe('none');
	await progress.scrollIntoViewIfNeeded();
	const progressImage = await progress.screenshot({ animations: 'disabled' });
	expect(progressImage).toMatchSnapshot('rose-pill-progress.png', { maxDiffPixelRatio: 0.01 });

	await save.hover();
	await expect(state).toContainText('hover → shadow-md');
	const hover = await save.evaluate((element) => getComputedStyle(element).boxShadow);
	const hoverColors = await actionColorReport(save, scope);
	expect(hoverColors.foreground).toBe(hoverColors.onSolid);
	expect(hoverColors.background).toBe(hoverColors.hoverBackground);

	const bounds = await save.boundingBox();
	if (bounds === null) throw new Error('Save changes button has no rendered bounds');
	await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
	await page.mouse.down();
	await expect(state).toContainText('pressed → surface-sunken-shadow');
	const pressed = await save.evaluate((element) => getComputedStyle(element).boxShadow);
	expect(pressed).not.toBe(hover);
	expect(pressed).toContain('inset');
	await page.mouse.up();

	await controls.getByLabel('Mode').selectOption('dark');
	await save.hover();
	await expect
		.poll(() => save.evaluate((element) => getComputedStyle(element).boxShadow))
		.toContain('255');
	await expect(checkbox).toBeChecked();
});

test('keeps documentation code blocks on the reactive application theme', async ({ page }) => {
	await page.goto('/#/components/theme');
	await expect(
		page.getByRole('heading', { name: 'Theme by meaning, not selector surgery' })
	).toBeVisible();
	const appearance = page.locator('.theme-appearance-control').getByLabel('Appearance');
	await expect(appearance).toBeVisible();
	await expect(appearance.locator('option')).toHaveText(['System', 'Light', 'Dark']);
	await page.locator('.theme-customize-control > summary').click();
	const depth = page.locator('.theme-control-panel').getByLabel('Depth');
	const tonic = page.locator('.theme-control-panel').getByLabel('Color');
	const codeBlock = page
		.locator('.code-block')
		.filter({ has: page.locator('.syntax--keyword') })
		.first();

	await appearance.selectOption('light');
	await expect(page.locator('#app > [data-exact-theme]')).toHaveAttribute(
		'data-exact-theme-appearance',
		'light'
	);
	const light = await codeThemeReport(codeBlock);
	await tonic.selectOption('rose');
	await expect
		.poll(async () => (await codeThemeReport(codeBlock)).keywordColor)
		.not.toBe(light.keywordColor);

	await appearance.selectOption('dark');
	await expect(page.locator('#app > [data-exact-theme]')).toHaveAttribute(
		'data-exact-theme-appearance',
		'dark'
	);
	const dark = await codeThemeReport(codeBlock);

	expect(light.surfaceColor).not.toBe(light.neutralSubtle);
	expect(dark.surfaceColor).not.toBe(dark.neutralSubtle);
	expect(light.keyword).not.toBe(light.accentSolidActive);
	expect(light.keywordChroma).toBeGreaterThanOrEqual(0.08);
	expect(light.keywordContrast).toBeGreaterThanOrEqual(4.5);
	expect(light.copyContrast).toBeGreaterThanOrEqual(4.5);
	expect(dark.keyword).not.toBe(dark.accentText);
	expect(dark.keywordChroma).toBeGreaterThanOrEqual(0.08);
	expect(dark.keywordContrast).toBeGreaterThanOrEqual(4.5);
	expect(dark.copyContrast).toBeGreaterThanOrEqual(4.5);
	expect(dark.surfaceColor).not.toBe(light.surfaceColor);
	expect(light.rootColorScheme).toBe('light');
	expect(dark.rootColorScheme).toBe('dark');

	await depth.selectOption('flat');
	const flat = await codeThemeReport(codeBlock);
	await depth.selectOption('bordered');
	const bordered = await codeThemeReport(codeBlock);
	await depth.selectOption('elevated');
	const elevated = await codeThemeReport(codeBlock);
	expect(flat.borderWidth).toBe('0px');
	expect(bordered.borderWidth).not.toBe('0px');
	expect(elevated.shadow).not.toBe('none');
});

test('keeps theme customization inside the viewport and themes article callouts', async ({
	page
}) => {
	await page.goto('/#/story');
	await page.locator('.theme-customize-control > summary').click();
	const panel = page.locator('.theme-control-panel');
	await expect(panel).toBeVisible();
	const bounds = await panel.boundingBox();
	expect(bounds).not.toBeNull();
	expect(bounds!.x).toBeGreaterThanOrEqual(0);
	expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));

	const originalFingerprint = await page
		.locator('#app > [data-exact-theme]')
		.getAttribute('data-exact-theme-fingerprint');
	await panel.getByLabel('Color').selectOption('violet');
	await panel.getByLabel('Shape').selectOption('pill');
	await expect
		.poll(() =>
			page.locator('#app > [data-exact-theme]').getAttribute('data-exact-theme-fingerprint')
		)
		.not.toBe(originalFingerprint);
	expect(await page.evaluate(() => localStorage.getItem('exact-docs-theme-settings'))).toContain(
		'"shape":"pill"'
	);

	const callout = page.locator('.callout').filter({ hasText: 'How the pieces fit' });
	await expect(callout).toHaveClass(/exact-theme-surface/);
	const colors = await callout.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			background: style.backgroundColor,
			infoSubtle: style.getPropertyValue('--exact-theme-info-subtle').trim()
		};
	});
	expect(colors.background).toBe(colors.infoSubtle);
});

test('clips definition-grid cells to the rounded semantic surface', async ({ page }) => {
	await page.goto('/#/react-developers');
	const grid = page.locator('.definition-grid').first();
	await expect(grid).toBeVisible();
	const geometry = await grid.evaluate((element) => {
		const codes = element.querySelectorAll(':scope > code');
		const first = getComputedStyle(codes[0]!);
		const last = getComputedStyle(codes[codes.length - 1]!);
		const container = getComputedStyle(element);
		return {
			overflow: container.overflow,
			radius: container.borderTopLeftRadius,
			firstTop: first.borderTopWidth,
			firstLeft: first.borderLeftWidth,
			lastBottom: last.borderBottomWidth
		};
	});
	expect(geometry.overflow).toBe('hidden');
	expect(geometry.radius).not.toBe('0px');
	expect(geometry.firstTop).toBe('0px');
	expect(geometry.firstLeft).toBe('0px');
	expect(geometry.lastBottom).toBe('0px');
});

function themeScope(page: Page, index: number): Locator {
	return page.locator('.theme-lab-workbench [data-exact-theme]').nth(index);
}

async function codeThemeReport(codeBlock: Locator) {
	return codeBlock.evaluate((element) => {
		const surface = element.querySelector('pre')!;
		const style = getComputedStyle(surface);
		const containerStyle = getComputedStyle(element);
		const keywordColor = getComputedStyle(element.querySelector('.syntax--keyword')!).color;
		const copyColor = getComputedStyle(element.querySelector('.copy-button')!).color;
		const surfaceColor = style.backgroundColor;
		return {
			surface: style.getPropertyValue('--code-surface').trim(),
			surfaceColor,
			neutralSubtle: style.getPropertyValue('--exact-theme-neutral-subtle').trim(),
			keyword: style.getPropertyValue('--syntax-keyword').trim(),
			accentText: style.getPropertyValue('--exact-theme-accent-text').trim(),
			accentSolidActive: style.getPropertyValue('--exact-theme-accent-solid-active').trim(),
			keywordChroma: Number(keywordColor.match(/oklch\([^ ]+ ([^ ]+)/)?.[1]),
			keywordColor,
			keywordContrast: contrastRatio(keywordColor, surfaceColor),
			copyContrast: contrastRatio(copyColor, surfaceColor),
			rootColorScheme: getComputedStyle(document.documentElement).colorScheme,
			borderWidth: containerStyle.borderTopWidth,
			shadow: containerStyle.boxShadow
		};

		function contrastRatio(foreground: string, background: string): number {
			const luminance = (color: string) => {
				const context = document.createElement('canvas').getContext('2d', {
					willReadFrequently: true
				})!;
				context.fillStyle = color;
				context.fillRect(0, 0, 1, 1);
				const rgb = context.getImageData(0, 0, 1, 1).data;
				const channels = [rgb[0]!, rgb[1]!, rgb[2]!].map((channel) => {
					const value = channel / 255;
					return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
				});
				return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
			};
			const a = luminance(foreground),
				b = luminance(background);
			return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
		}
	});
}

async function fingerprint(scope: Locator): Promise<string | null> {
	return scope.getAttribute('data-exact-theme-fingerprint');
}

async function actionColorReport(action: Locator, scope: Locator) {
	return action.evaluate(
		(element, scopeElement) => {
			const actionStyle = getComputedStyle(element);
			const themeStyle = getComputedStyle(scopeElement as Element);
			return {
				foreground: actionStyle.color,
				background: actionStyle.backgroundColor,
				onSolid: themeStyle.getPropertyValue('--exact-theme-accent-on-solid').trim(),
				hoverBackground: themeStyle.getPropertyValue('--exact-theme-accent-solid-hover').trim()
			};
		},
		await scope.elementHandle()
	);
}

async function renderedThemeReport(scope: Locator, specimen: Locator) {
	return scope.evaluate(
		(element, specimenElement) => {
			const requiredVariables = [
				'--exact-theme-accent-solid',
				'--exact-theme-accent-on-solid',
				'--exact-theme-accent-focus',
				'--exact-theme-font-body',
				'--exact-theme-surface-1-background',
				'--exact-theme-surface-1-foreground',
				'--exact-theme-shadow-md'
			];
			const themeStyle = getComputedStyle(element);
			const specimenNode = specimenElement as Element;
			const specimenStyle = getComputedStyle(specimenNode);
			const headingStyle = getComputedStyle(specimenNode.querySelector('h2')!);
			const actionStyle = getComputedStyle(specimenNode.querySelector('button')!);
			return {
				missingVariables: requiredVariables.filter(
					(variable) => themeStyle.getPropertyValue(variable).trim() === ''
				),
				headingContrast: contrastRatio(headingStyle.color, specimenStyle.backgroundColor),
				actionContrast: contrastRatio(actionStyle.color, actionStyle.backgroundColor)
			};

			function contrastRatio(foreground: string, background: string): number {
				const foregroundRgb = rasterize(foreground);
				const backgroundRgb = rasterize(background);
				const foregroundLuminance = luminance(foregroundRgb);
				const backgroundLuminance = luminance(backgroundRgb);
				return (
					(Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
					(Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
				);
			}

			function rasterize(color: string): Uint8ClampedArray {
				const canvas = document.createElement('canvas');
				canvas.width = 1;
				canvas.height = 1;
				const context = canvas.getContext('2d', { willReadFrequently: true })!;
				context.fillStyle = color;
				context.fillRect(0, 0, 1, 1);
				return context.getImageData(0, 0, 1, 1).data;
			}

			function luminance(rgb: Uint8ClampedArray): number {
				const channels = [rgb[0]!, rgb[1]!, rgb[2]!].map((channel) => {
					const value = channel / 255;
					return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
				});
				return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
			}
		},
		await specimen.elementHandle()
	);
}
