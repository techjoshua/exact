/**
 * @vitest-environment jsdom
 */
import { createComponentDomain } from '@exactjs/core';
import { render, unmount } from '@exactjs/dom';
import { describe, expect, it, vi } from 'vitest';
import { applyPatches } from './patches.js';
import { confinedLabelsRoot, foreignShellRoot } from './test-support/root-confinement.fixtures.js';

describe('execution-root patch confinement', () => {
	it('selects only targets owned by the issuing root when local ids collide', () => {
		const container = document.createElement('div');
		const page = createComponentDomain({ executionRoot: 'page' });
		const remote = createComponentDomain({ executionRoot: '@company/billing#./Area' });
		render(confinedLabelsRoot(page, remote), container);
		// Explicit protocol input creates the deliberate cross-root collision.
		for (const span of container.querySelectorAll('span'))
			span.setAttribute('data-exact-id', 'title');

		expect(
			applyPatches(
				container,
				[
					{
						type: 'text',
						id: container.querySelector('span')!.getAttribute('data-exact-id')!,
						value: 'Updated'
					}
				],
				{
					executionRoot: '@company/billing#./Area'
				}
			)
		).toBe(true);
		expect(Array.from(container.querySelectorAll('span'), (span) => span.textContent)).toEqual([
			'Page',
			'Updated'
		]);
		unmount(container);
	});

	it('reports a structural patch that replaces an ancestor of a foreign-root child', () => {
		const container = document.createElement('div');
		const page = createComponentDomain({ executionRoot: 'page' });
		const remote = createComponentDomain({ executionRoot: '@company/brand#./Shell' });
		render(foreignShellRoot(page, remote), container);
		// This test owns a manual patch protocol address, not an authored JSX attribute.
		container.querySelector('section')!.setAttribute('data-exact-id', 'shell');
		const onCrossRootReplacement = vi.fn();

		expect(
			applyPatches(
				container,
				[
					{
						type: 'replace',
						id: container.querySelector('section')!.getAttribute('data-exact-id')!,
						html: `<section data-exact-id="${container.querySelector('section')!.getAttribute('data-exact-id')}"></section>`
					}
				],
				{ executionRoot: '@company/brand#./Shell', onCrossRootReplacement }
			)
		).toBe(true);
		expect(onCrossRootReplacement).toHaveBeenCalledOnce();
		unmount(container);
	});
});
