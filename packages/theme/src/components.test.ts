// @vitest-environment jsdom
import '@exactjs/dom/framework/enhancements';
import { Fragment, createEnhancementNode, createVNode, type Component } from '@exactjs/core';
import { createExpression } from '@exactjs/core/runtime/render';
import { createExactFrameworkFixtureArtifact } from '@exactjs/core/framework/component-contracts';
import '@exactjs/core/runtime/contexts';
import { render } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { flushSync } from '@exactjs/reactive';
import { renderToString } from '@exactjs/ssr';
import '@exactjs/ssr/runtime/generic-components';
import { describe, expect, it } from 'vitest';
import { ThemeContext, ThemeScopeEnhancement } from './components.js';

createExactFrameworkFixtureArtifact(ThemeScopeEnhancement, '@exactjs/theme:test-scope-artifact');

describe('reactive theme scopes', () => {
	it('updates an explicit reactive axis on a nested scope enhancement', () => {
		let parent!: Component<{ temperament: 'dramatic' | 'monochrome' }>;
		function App(this: Component<{ temperament: 'dramatic' | 'monochrome' }>) {
			parent = this;
			this.state.temperament = 'dramatic';
			const scope = (props: Record<string, unknown>, child: ReturnType<typeof createVNode>) =>
				createVNode(
					Fragment,
					{
						__exactEnhancements: createEnhancementNode([
							{ identity: '@exactjs/theme/enhancements#scope', props }
						])
					},
					child
				);
			return () =>
				scope(
					{ scope: true, tonic: 'teal' },
					scope(
						{
							scope: true,
							tonic: 'violet',
							temperament: createExpression(() => this.state.temperament)
						},
						createVNode('p', null, 'Nested')
					)
				);
		}
		createExactFrameworkFixtureArtifact(App, '@exactjs/theme:test-reactive-nested-axis');
		const container = document.createElement('div');
		render(createVNode(App, {}), container, {
			enhancementCatalog: new Map([['@exactjs/theme/enhancements#scope', ThemeScopeEnhancement]])
		});
		const nested = container.querySelectorAll<HTMLElement>('[data-exact-theme]')[1]!;
		const before = nested.dataset.exactThemeFingerprint;

		parent.state.temperament = 'monochrome';
		flushSync();

		expect(nested.dataset.exactThemeFingerprint).not.toBe(before);
	});

	it('reactively inherits omitted axes through nested scope contexts', () => {
		let parent!: Component<{ density: 'comfortable' | 'compact' }>;
		function App(this: Component<{ density: 'comfortable' | 'compact' }>) {
			parent = this;
			this.state.density = 'comfortable';
			return () =>
				createVNode(
					ThemeScopeEnhancement,
					{ scope: true, density: this.state.density },
					createVNode(
						ThemeScopeEnhancement,
						{ scope: true, temperament: 'dramatic' },
						createVNode('p', null, 'Nested')
					)
				);
		}
		createExactFrameworkFixtureArtifact(App, '@exactjs/theme:test-nested-app');
		const container = document.createElement('div');
		render(createVNode(App, {}), container);
		const scopes = container.querySelectorAll<HTMLElement>('[data-exact-theme]');
		const nested = scopes[1]!;
		const before = nested.dataset.exactThemeFingerprint;

		parent.state.density = 'compact';
		flushSync();

		expect(nested.dataset.exactThemeFingerprint).not.toBe(before);
		expect(nested.style.getPropertyValue('--exact-theme-space-4')).toBe('0.8rem');
	});

	it('accepts explicit inherit for nested tonic and temperament axes', () => {
		function App(this: Component<{}>) {
			return () =>
				createVNode(
					ThemeScopeEnhancement,
					{ scope: true, tonic: 'amber', temperament: 'monochrome' },
					createVNode(
						ThemeScopeEnhancement,
						{ scope: true, tonic: 'inherit', temperament: 'inherit' },
						createVNode('p', null, 'Nested')
					)
				);
		}
		createExactFrameworkFixtureArtifact(App, '@exactjs/theme:test-explicit-inherit');
		const container = document.createElement('div');
		render(createVNode(App, {}), container);
		const scopes = container.querySelectorAll<HTMLElement>('[data-exact-theme]');
		const outer = scopes[0]!,
			nested = scopes[1]!;

		expect(nested.style.getPropertyValue('--exact-theme-accent-solid')).toBe(
			outer.style.getPropertyValue('--exact-theme-accent-solid')
		);
		expect(nested.dataset.exactThemeFingerprint).toBe(outer.dataset.exactThemeFingerprint);
	});

	it('accepts arbitrary reactive CSS colors as declarative tonics', () => {
		let parent!: Component<{ tonic: string }>;
		function App(this: Component<{ tonic: string }>) {
			parent = this;
			this.state.tonic = '#7c3aed';
			return () =>
				createVNode(
					ThemeScopeEnhancement,
					{ scope: true, tonic: this.state.tonic },
					createVNode('p', null, 'Custom tonic')
				);
		}
		createExactFrameworkFixtureArtifact(App, '@exactjs/theme:test-custom-tonic');
		const container = document.createElement('div');
		render(createVNode(App, {}), container);
		const scope = container.querySelector<HTMLElement>('[data-exact-theme]')!;
		const before = scope.dataset.exactThemeFingerprint;

		expect(scope.style.getPropertyValue('--exact-theme-accent-solid')).not.toBe('');
		parent.state.tonic = 'rgb(14 165 233)';
		flushSync();

		expect(scope.dataset.exactThemeFingerprint).not.toBe(before);
		expect(container.querySelector('[data-exact-theme]')).toBe(scope);
	});

	it('accepts a Design Tokens color as a declarative tonic', () => {
		const tonic = {
			colorSpace: 'display-p3' as const,
			components: [0.45, 0.2, 0.72] as const
		};
		const container = document.createElement('div');
		render(
			createVNode(
				ThemeScopeEnhancement,
				{ scope: true, tonic },
				createVNode('p', null, 'Design token tonic')
			),
			container
		);

		expect(container.querySelector<HTMLElement>('[data-exact-theme]')?.style.length).toBe(164);
	});

	it('atomically updates one scope without replacing descendants or their native state', () => {
		let parent!: Component<{ tonic: 'teal' | 'amber' }>;
		let mounts = 0;
		function Child(this: Component<{}>) {
			mounts++;
			const theme = this.getContext(ThemeContext);
			return () =>
				createVNode('input', { id: 'stable', 'data-fingerprint': theme.current.fingerprint });
		}
		function App(this: Component<{ tonic: 'teal' | 'amber' }>) {
			parent = this;
			this.state.tonic = 'teal';
			return () =>
				createVNode(
					ThemeScopeEnhancement,
					{ scope: true, tonic: this.state.tonic },
					createVNode('div', null, createVNode(Child, {}))
				);
		}
		createExactFrameworkFixtureArtifact(Child, '@exactjs/theme:test-child');
		createExactFrameworkFixtureArtifact(App, '@exactjs/theme:test-app');
		const container = document.createElement('div');
		document.body.append(container);
		render(createVNode(App, {}), container);
		const scope = container.querySelector('[data-exact-theme]') as HTMLElement,
			input = container.querySelector('#stable') as HTMLInputElement;
		const before = scope.dataset.exactThemeFingerprint;
		input.value = 'Preserved';
		input.focus();
		parent.state.tonic = 'amber';
		flushSync();
		expect(scope.dataset.exactThemeFingerprint).not.toBe(before);
		expect(input.dataset.fingerprint).toBe(scope.dataset.exactThemeFingerprint);
		expect(container.querySelector('[data-exact-theme]')).toBe(scope);
		expect(container.querySelector('#stable')).toBe(input);
		expect(input.value).toBe('Preserved');
		expect(document.activeElement).toBe(input);
		expect(mounts).toBe(1);
		expect(scope.style.length).toBe(164);
		container.remove();
	});

	it('serializes the same ordered complete map during SSR', () => {
		const html = renderToString(
			createVNode(
				ThemeScopeEnhancement,
				{ scope: true, tonic: 'teal', appearance: 'light' },
				createVNode('div', null, createVNode('p', null, 'Ready'))
			),
			{ markers: false }
		).html;
		expect(html).toContain('data-exact-theme="exact-theme/1"');
		expect(html).toContain('--exact-theme-accent-border:');
		expect(html.indexOf('--exact-theme-accent-border:')).toBeLessThan(
			html.indexOf('--exact-theme-accent-focus:')
		);
		expect(html).toContain('<p>Ready</p>');
	});

	it('hydrates the server-published map without replacing the scope', () => {
		const app = () =>
			createVNode(
				ThemeScopeEnhancement,
				{ scope: true, tonic: 'teal', appearance: 'light' },
				createVNode('div', null, createVNode('p', null, 'Hydrated'))
			);
		const server = renderToString(app()).html;
		const container = document.createElement('div');
		container.innerHTML = server;
		const scope = container.querySelector('[data-exact-theme]');
		hydrate(app(), container, { onMismatch: 'throw' });
		expect(container.querySelector('[data-exact-theme]')).toBe(scope);
		expect(scope?.getAttribute('style')).toContain('--exact-theme-accent-solid:');
	});
});
