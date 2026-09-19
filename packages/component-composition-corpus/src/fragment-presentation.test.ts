import '@exactjs/dom/runtime/target';
import {
	createCompiledFragmentReceipt as fragment,
	createCompiledIntrinsicReceipt as element
} from '@exactjs/core/runtime/component-abi';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import { beforeEach, describe, expect, it } from 'vitest';
import { FragmentPresentationHosts } from '@exactjs/core/framework/render-structure';
import { prototypeFragmentPlacement } from './prototypes/supplied-target.js';
import { prototypeRoot } from './prototypes/placement.fixtures.js';
import { prototypeRoot as serverRoot } from './prototypes/placement.fixtures.js?exact-target=server';
import {
	preparationRoot,
	preparationAudit,
	preparationInstance
} from './prototypes/preparation.fixtures.js';
import { preparationRoot as serverPreparationRoot } from './prototypes/preparation.fixtures.js?exact-target=server';

beforeEach(() => Object.assign(preparationAudit, { setup: 0, mounted: 0, disposed: 0 }));

describe('retained fragment presentation', () => {
	it.each([false, true])(
		'wraps on the first spread key and unwraps the final owner without remounting (hydrate: %s)',
		async (adopt) => {
			const hosts = new FragmentPresentationHosts();
			const owner = Symbol('dynamic contribution');
			const target = fragment(null, preparationRoot(element('button', null, 'stateful')), 'tail');
			const container = document.createElement('div');
			const present = (props?: Record<string, unknown>) =>
				prototypeRoot(
					prototypeFragmentPlacement(
						target,
						hosts.reconcile(props === undefined ? [] : [{ owner, props }])
					)
				);
			try {
				if (adopt) {
					const serverTarget = fragment(
						null,
						serverPreparationRoot(element('button', null, 'stateful')),
						'tail'
					);
					const result = await renderToHydratableString(
						serverRoot(prototypeFragmentPlacement(serverTarget, []))
					);
					container.innerHTML = result.html;
					const button = container.querySelector('button');
					hydrate(present({}), container, { resumptions: result.resumptions, onMismatch: 'throw' });
					expect(container.querySelector('button')).toBe(button);
				} else render(present({}), container);
				const button = container.querySelector('button')!;
				const text = button.firstChild;
				const tail = [...container.childNodes].find((node) => node.textContent === 'tail');
				expect(container.querySelector('span')).toBeNull();
				render(present({ className: undefined }), container);
				flushSync();
				const span = container.querySelector('span')!;
				expect(span).not.toBeNull();
				expect(span.contains(button)).toBe(true);
				expect(span.contains(tail!)).toBe(true);
				render(present({}), container);
				flushSync();
				expect(container.querySelector('span')).toBe(span);
				render(present(), container);
				flushSync();
				expect(container.querySelector('span')).toBeNull();
				expect(container.querySelector('button')).toBe(button);
				expect(button.firstChild).toBe(text);
				expect([...container.childNodes]).toContain(tail);
				preparationInstance!.state.label = 'still alive';
				flushSync();
				expect(button.title).toBe('still alive');
				expect(preparationAudit).toEqual({ setup: 1, mounted: 1, disposed: 0 });
			} finally {
				unmount(container);
				hosts.dispose();
			}
			expect(preparationAudit.disposed).toBe(1);
		}
	);

	it('removes a middle host while retaining both surrounding hosts and their children', () => {
		const hosts = new FragmentPresentationHosts();
		const owners = ['span', 'em', 'span'].map((tag) => ({
			owner: Symbol(),
			tag,
			props: { title: tag }
		}));
		const target = fragment(null, element('input', { defaultValue: 'initial' }), 'text');
		const container = document.createElement('div');
		try {
			render(prototypeRoot(prototypeFragmentPlacement(target, hosts.reconcile(owners))), container);
			const spans = [...container.querySelectorAll('span')];
			const input = container.querySelector('input')!;
			input.value = 'edited';
			render(
				prototypeRoot(
					prototypeFragmentPlacement(target, hosts.reconcile([owners[0]!, owners[2]!]))
				),
				container
			);
			flushSync();
			expect(container.querySelector('em')).toBeNull();
			expect([...container.querySelectorAll('span')]).toEqual(spans);
			expect(container.querySelector('input')).toBe(input);
			expect(input.value).toBe('edited');
			render(prototypeRoot(prototypeFragmentPlacement(target, hosts.reconcile([]))), container);
			flushSync();
			expect(container.querySelectorAll('span')).toHaveLength(0);
			expect(container.querySelector('input')).toBe(input);
			expect(input.value).toBe('edited');
		} finally {
			unmount(container);
			hosts.dispose();
		}
	});
});
