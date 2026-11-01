import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { computed, flushSync, reactive } from '@exactjs/reactive';
import { createForwardedExpression } from '@exactjs/core/framework/render-structure';
import { unwrap } from '@exactjs/reactive/framework/values';
import { expect, it } from 'vitest';
import {
	structuralPropInputsRoot,
	portalInputRoot
} from './test-support/structural-prop-inputs.fixtures.js';
import { structuralPropInputsRoot as serverRoot } from './test-support/structural-prop-inputs.fixtures.js?exact-target=server';

it.each(['mount', 'hydrate'] as const)(
	'preserves structural prop updates and cleanup after %s',
	async (entry) => {
		const container = document.createElement('div');
		document.body.append(container);
		const state = reactive({
			mode: 'active' as 'active' | 'parked'
		});
		const inputs = () => ({ mode: state.mode });
		let client: ReturnType<typeof hydrate> | undefined;
		try {
			let original: Element | null = null;
			if (entry === 'hydrate') {
				const output = await renderToHydratableString(serverRoot({ mode: 'active' }));
				container.innerHTML = output.htmlWithHydration;
				original = container.querySelector('[data-role="retained"]');
				const outcomes: string[] = [];
				client = hydrate(structuralPropInputsRoot(inputs()), container, {
					onMismatch: 'throw',
					onHydration: ({ outcome }) => outcomes.push(outcome)
				});
				expect(outcomes).toEqual(['adopted']);
				expect(container.querySelector('[data-role="retained"]')).toBe(original);
			} else render(structuralPropInputsRoot(inputs()), container);
			const retained = container.querySelector('[data-role="retained"]');
			expect(retained?.textContent).toBe('retained');
			state.mode = 'parked';
			render(structuralPropInputsRoot(inputs()), container);
			flushSync();
			expect(container.querySelector('[data-role="retained"]')).toBeNull();
			state.mode = 'active';
			render(structuralPropInputsRoot(inputs()), container);
			flushSync();
			expect(container.querySelector('[data-role="retained"]')).toBe(retained);
		} finally {
			if (client) client.dispose();
			else unmount(container);
			container.remove();
		}
	}
);

// The compiler selects this existing helper for a complete structural input slot.
it('preserves an authored reactive value identity and observes an ordinary forwarded scalar', () => {
	const state = reactive({ value: 'before' });
	const authored = computed(() => state.value);
	expect(createForwardedExpression(() => authored)).toBe(authored);
	const scalar = createForwardedExpression(() => state.value);
	expect(unwrap(scalar)).toBe('before');
	state.value = 'after';
	flushSync();
	expect(unwrap(scalar)).toBe('after');
	expect(unwrap(authored)).toBe('after');
});

it('places portal children in the current target and cleans up both targets', () => {
	const container = document.createElement('div');
	const first = document.createElement('aside');
	const second = document.createElement('aside');
	document.body.append(container, first, second);
	try {
		render(portalInputRoot(first), container);
		const original = first.querySelector('[data-role="portal"]');
		expect(original?.textContent).toBe('portal');
		render(portalInputRoot(second), container);
		flushSync();
		expect(second.querySelector('[data-role="portal"]')?.textContent).toBe('portal');
		expect(first.childNodes).toHaveLength(0);
	} finally {
		unmount(container);
		container.remove();
		first.remove();
		second.remove();
	}
	expect(first.childNodes).toHaveLength(0);
	expect(second.childNodes).toHaveLength(0);
});
