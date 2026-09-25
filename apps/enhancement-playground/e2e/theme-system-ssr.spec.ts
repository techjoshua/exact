import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { AnyComponentFunction } from '@exactjs/core';
import {
	createCompiledComponentReceipt,
	createCompiledIntrinsicReceipt
} from '@exactjs/core/runtime/component-abi';
import { renderToString } from '@exactjs/ssr';
import { scope } from '@exactjs/theme/enhancements';
import { resolveTheme, serializeThemeVariables, type ThemeSystemPreferences } from '@exactjs/theme';

const stylesheet = readFileSync(
	new URL('../../../packages/theme/styles.css', import.meta.url),
	'utf8'
);
const component = scope as unknown as AnyComponentFunction;

for (const initial of ['light', 'dark'] as const) {
	test(`lets Chromium paint SSR system themes without JavaScript, initially ${initial}`, async ({
		browser
	}) => {
		const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: initial });
		try {
			const page = await context.newPage();
			const content = createCompiledIntrinsicReceipt('p', {}, 'Server-rendered content');
			const inherited = createCompiledComponentReceipt(component, {
				tonic: '#7357d9',
				children: content
			});
			const explicit = createCompiledComponentReceipt(component, {
				appearance: 'light',
				contrast: 'standard',
				motion: 'full',
				children: content
			});
			const inverse = createCompiledComponentReceipt(component, {
				appearance: 'inverse',
				children: content
			});
			const inverseSystem = createCompiledComponentReceipt(component, {
				appearance: 'inverse-system',
				children: content
			});
			const explicitParent = createCompiledComponentReceipt(component, {
				appearance: 'dark',
				children: [inverse, inverseSystem]
			});
			const root = createCompiledComponentReceipt(component, {
				children: [inherited, explicit, inverse, explicitParent]
			});
			const { html } = await renderToString(root);
			await page.setContent(`<!doctype html><style>${stylesheet}</style>${html}`);
			const preferences: ThemeSystemPreferences[] = [
				{ appearance: initial, contrast: 'standard', motion: 'full' },
				...Array.from({ length: 8 }, (_, mask) => ({
					appearance: mask & 1 ? ('dark' as const) : ('light' as const),
					contrast: mask & 2 ? ('more' as const) : ('standard' as const),
					motion: mask & 4 ? ('reduced' as const) : ('full' as const)
				}))
			];
			for (const environment of preferences) {
				await page.emulateMedia({
					colorScheme: environment.appearance,
					contrast: environment.contrast === 'more' ? 'more' : 'no-preference',
					reducedMotion: environment.motion === 'reduced' ? 'reduce' : 'no-preference'
				});
				const parent = resolveTheme({ source: {}, environment });
				const darkParent = resolveTheme({ source: { appearance: 'dark' }, parent, environment });
				const expected = [
					parent,
					resolveTheme({ source: { keyColor: '#7357d9' }, parent, environment }),
					resolveTheme({
						source: { appearance: 'light', contrast: 'standard', motion: 'full' },
						parent,
						environment
					}),
					resolveTheme({ source: { appearance: 'inverse' }, parent, environment }),
					darkParent,
					resolveTheme({ source: { appearance: 'inverse' }, parent: darkParent, environment }),
					resolveTheme({
						source: { appearance: 'inverse-system' },
						parent: darkParent,
						environment
					})
				].map((theme) => ({
					...serializeThemeVariables(theme),
					'color-scheme': theme.source.appearance
				}));
				const actual = await page.locator('[data-exact-theme]').evaluateAll(
					(nodes, names) =>
						nodes.map((node) => {
							const style = getComputedStyle(node);
							return Object.fromEntries(
								names.map((name) => [name, style.getPropertyValue(name).trim()])
							);
						}),
					Object.keys(expected[0]!)
				);
				expect(actual, JSON.stringify(environment)).toEqual(expected);
			}
			await expect(page.locator('[data-exact-theme]').first()).toHaveAttribute(
				'data-exact-theme-appearance',
				'system'
			);
		} finally {
			await context.close();
		}
	});
}
