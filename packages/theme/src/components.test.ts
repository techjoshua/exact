// @vitest-environment jsdom
import '@exactjs/dom/framework/enhancements';
import '@exactjs/core/runtime/contexts';
import { renderTestTree as render } from '@exactjs/dom/testing';
import { hydrate } from '@exactjs/hydrate';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableStringAsync, renderToStringAsync } from '@exactjs/ssr';
import { describe, expect, it } from 'vitest';
import {
	atomicMountCount,
	atomicRoot,
	CompiledThemeScope,
	customTonicRoot,
	densityRoot,
	designTokenRoot,
	explicitInheritRoot,
	reactiveAxisRoot,
	resetAtomicMounts,
	setAtomicTonic,
	setCustomTonic,
	setDensity,
	setReactiveTemperament
} from './components.fixtures.js';
import { themeDocumentRoot } from './theme-document.fixtures.js';
import { themeDocumentRoot as serverThemeDocumentRoot } from './theme-document.fixtures.js?exact-target=server';

describe('reactive theme scopes', () => {
	it('updates an explicit reactive axis on a nested scope enhancement', () => {
		const container = document.createElement('div');
		render(reactiveAxisRoot(), container, {
			enhancementCatalog: new Map([['@exactjs/theme/enhancements#scope', CompiledThemeScope]])
		});
		const nested = container.querySelectorAll<HTMLElement>('[data-exact-theme]')[1]!;
		const before = nested.dataset.exactThemeFingerprint;
		setReactiveTemperament('monochrome');
		flushSync();
		expect(nested.dataset.exactThemeFingerprint).not.toBe(before);
	});

	it('reactively inherits omitted axes through nested scope contexts', () => {
		const container = document.createElement('div');
		render(densityRoot(), container);
		const nested = container.querySelectorAll<HTMLElement>('[data-exact-theme]')[1]!;
		const before = nested.dataset.exactThemeFingerprint;
		setDensity('compact');
		flushSync();
		expect(nested.dataset.exactThemeFingerprint).not.toBe(before);
		expect(nested.style.getPropertyValue('--exact-theme-space-4')).toBe('0.8rem');
	});

	it('accepts explicit inherit for nested tonic and temperament axes', () => {
		const container = document.createElement('div');
		render(explicitInheritRoot(), container);
		const scopes = container.querySelectorAll<HTMLElement>('[data-exact-theme]');
		const outer = scopes[0]!;
		const nested = scopes[1]!;
		expect(nested.style.getPropertyValue('--exact-theme-accent-solid')).toBe(
			outer.style.getPropertyValue('--exact-theme-accent-solid')
		);
		expect(nested.dataset.exactThemeFingerprint).toBe(outer.dataset.exactThemeFingerprint);
	});

	it('accepts arbitrary reactive CSS colors as declarative tonics', () => {
		const container = document.createElement('div');
		render(customTonicRoot(), container);
		const scope = container.querySelector<HTMLElement>('[data-exact-theme]')!;
		const before = scope.dataset.exactThemeFingerprint;
		expect(scope.style.getPropertyValue('--exact-theme-accent-solid')).not.toBe('');
		setCustomTonic('rgb(14 165 233)');
		flushSync();
		expect(scope.dataset.exactThemeFingerprint).not.toBe(before);
		expect(container.querySelector('[data-exact-theme]')).toBe(scope);
	});

	it('accepts a Design Tokens color as a declarative tonic', () => {
		const container = document.createElement('div');
		render(designTokenRoot(), container);
		expect(container.querySelector<HTMLElement>('[data-exact-theme]')?.style.length).toBe(164);
	});

	it('atomically updates one scope without replacing descendants or their native state', () => {
		resetAtomicMounts();
		const container = document.createElement('div');
		document.body.append(container);
		render(atomicRoot(), container);
		const scope = container.querySelector('[data-exact-theme]') as HTMLElement;
		const input = container.querySelector('#stable') as HTMLInputElement;
		const before = scope.dataset.exactThemeFingerprint;
		input.value = 'Preserved';
		input.focus();
		setAtomicTonic('amber');
		flushSync();
		expect(scope.dataset.exactThemeFingerprint).not.toBe(before);
		expect(input.dataset.fingerprint).toBe(scope.dataset.exactThemeFingerprint);
		expect(container.querySelector('[data-exact-theme]')).toBe(scope);
		expect(container.querySelector('#stable')).toBe(input);
		expect(input.value).toBe('Preserved');
		expect(document.activeElement).toBe(input);
		expect(atomicMountCount()).toBe(1);
		expect(scope.style.length).toBe(164);
		container.remove();
	});

	it('serializes the same ordered complete map during SSR', async () => {
		const html = (await renderToStringAsync(serverThemeDocumentRoot('Ready'), { markers: false }))
			.html;
		expect(html).toContain('data-exact-theme="exact-theme/1"');
		expect(html).toContain('--exact-theme-accent-border:');
		expect(html.indexOf('--exact-theme-accent-border:')).toBeLessThan(
			html.indexOf('--exact-theme-accent-focus:')
		);
		expect(html).toContain('<p>Ready</p>');
	});

	it('hydrates the server-published map without replacing the scope', async () => {
		const rendered = await renderToHydratableStringAsync(serverThemeDocumentRoot('Hydrated'));
		const container = document.createElement('div');
		container.innerHTML = rendered.html;
		const scope = container.querySelector('[data-exact-theme]');
		hydrate(themeDocumentRoot('Hydrated'), container, {
			onMismatch: 'throw',
			resumptions: rendered.resumptions
		});
		expect(container.querySelector('[data-exact-theme]')).toBe(scope);
		expect(scope?.getAttribute('style')).toContain('--exact-theme-accent-solid:');
	});
});
