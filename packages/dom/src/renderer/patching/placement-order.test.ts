/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { createEffectScope } from '@exactjs/reactive/framework/runtime';
import { createRendererRoot } from '../root-construction.js';
import type { Mounted } from '../../types.js';
import { SuppliedPlacementPlan } from './supplied-placement-plan.js';

/** Owns the same nested ranges while their initial moves and enhancement assembly are pending. */
function pendingWrapper() {
	const container = document.createElement('main');
	const root = createRendererRoot(container, undefined, {}, { mode: 'client', version: 0 });
	root.componentInputAttempt = { operation: undefined, deliveryStarted: false };
	const scope = createEffectScope();
	const host = (tag: string, children: Mounted[] = []): Mounted => ({
		dom: document.createElement(tag),
		scope: createEffectScope(scope),
		children
	});
	const range = (children: Mounted[]): Mounted => ({
		dom: document.createTextNode(''),
		end: document.createTextNode(''),
		range: 'root',
		scope: createEffectScope(scope),
		children
	});
	const input = host('input'),
		provider = host('div', [input]);
	const providerOwner = range([provider]),
		wrapper = range([providerOwner]);
	const receiver = range([wrapper]),
		section = host('section', [receiver]);
	const aside = host('aside', [section]),
		outer = range([aside]);
	const temporary = document.createDocumentFragment();
	const plan = new SuppliedPlacementPlan(root);
	root.suppliedPlacementPlan = plan;
	plan.place(section.dom, receiver, null);
	plan.place(provider.dom, input, null);
	plan.place(temporary, providerOwner, null);
	plan.place(aside.dom, section, null);
	plan.place(container, outer, null);
	return { container, root, scope, input, provider, section, aside, plan, temporary };
}

describe('pending enhancement placement ownership', () => {
	it('assembles a later wrapper before the enclosing receiver publishes its retained range', () => {
		const fixture = pendingWrapper();
		try {
			fixture.plan.commit();
			expect(fixture.container.querySelector('aside > section > div > input')).toBe(
				fixture.input.dom
			);
			expect(fixture.provider.dom.parentNode).toBe(fixture.section.dom);
			expect(fixture.temporary.childNodes).toHaveLength(0);
		} finally {
			fixture.scope.stop();
		}
	});

	it('stops dependent enclosing moves when an inner placement cancels its receiving attempt', () => {
		const fixture = pendingWrapper();
		try {
			fixture.input.afterPlacement = () => {
				fixture.root.componentInputAttempt!.disposed = true;
			};
			fixture.plan.commit();
			expect(fixture.plan.isCurrent()).toBe(false);
			expect(fixture.container.childNodes).toHaveLength(0);
			expect(fixture.provider.dom.parentNode).not.toBe(fixture.section.dom);
		} finally {
			fixture.plan.abort();
			fixture.scope.stop();
		}
	});
});
