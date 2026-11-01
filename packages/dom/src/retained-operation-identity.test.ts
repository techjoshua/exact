/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { flushSync } from '@exactjs/reactive';
import { unmount } from '@exactjs/dom/root';
import { renderToHydratableString } from '@exactjs/ssr';
import { hydrate } from '../../hydrate/src/root.js';
import { verifyRetainedOperationIdentity } from '../../component-composition-corpus/test-support/retained-operation-journey.js';
import * as fixture from '../../component-composition-corpus/test-support/retained-operation.fixtures.js';
import * as server from '../../component-composition-corpus/test-support/retained-operation.fixtures.js?exact-target=server';

it('retains unique supplied operations across conditional and scalar siblings', async () => {
	expect(await verifyRetainedOperationIdentity()).toEqual({
		retained: true,
		restored: true,
		interaction: true,
		cleanup: true,
		fresh: true,
		reports: []
	});
});

it('retains adopted supplied operations through removal, restoration and the next interaction', async () => {
	const host = document.createElement('main');
	const reports: unknown[] = [];
	const options = { onErrorReport: (report: unknown) => reports.push(report) };
	const rendered = await renderToHydratableString(
		server.root([server.spanOperation, server.stableOperation])
	);
	host.innerHTML = rendered.html;
	document.body.append(host);
	const button = host.querySelector('button');
	const section = host.querySelector('section');
	const span = host.querySelector('span');
	expect(button).not.toBeNull();
	expect(section).not.toBeNull();
	expect(span).not.toBeNull();
	const root = hydrate(fixture.root([fixture.spanOperation, fixture.stableOperation]), host, {
		...options,
		onMismatch: 'throw',
		resumptions: rendered.resumptions
	});
	try {
		await root.whenSettled();
		const owner = fixture.buttonOwner;
		const parent = fixture.parentOwner;
		expect(host.querySelector('button')).toBe(button);
		expect(host.querySelector('section')).toBe(section);
		expect(host.querySelector('span')).toBe(span);
		expect(owner.refs.get(fixture.buttonRef)).toBe(button);
		fixture.mount(host, [fixture.stableOperation], options);
		flushSync();
		expect(host.querySelector('button')).toBe(button);
		expect(host.querySelector('span')).toBeNull();
		fixture.mount(host, [fixture.spanOperation, fixture.stableOperation], options);
		flushSync();
		expect(host.querySelector('button')).toBe(button);
		expect(host.querySelector('span')).not.toBe(span);
		expect(fixture.parentOwner).toBe(parent);
		expect(fixture.buttonOwner).toBe(owner);
		button?.click();
		flushSync();
		expect(button?.textContent).toBe('1');
		root.dispose();
		expect(owner.refs.get(fixture.buttonRef)).toBeUndefined();
		expect(host.childNodes).toHaveLength(0);
		expect(reports).toEqual([]);
	} finally {
		root.dispose();
		host.remove();
	}
});

it('keeps repeated supplied handles positional without merging their mounted owners', () => {
	const host = document.createElement('main');
	const reports: unknown[] = [];
	const options = { onErrorReport: (report: unknown) => reports.push(report) };
	try {
		fixture.mount(host, [fixture.stableOperation, fixture.stableOperation], options);
		const buttons = [...host.querySelectorAll('button')];
		expect(buttons).toHaveLength(2);
		expect(buttons[0]).not.toBe(buttons[1]);
		buttons[0]!.click();
		flushSync();
		expect(buttons[0]?.textContent).toBe('1');
		expect(buttons[1]?.textContent).toBe('0');
		fixture.mount(host, [fixture.spanOperation, fixture.stableOperation], options);
		flushSync();
		expect(host.querySelector('button')).toBe(buttons[1]);
		fixture.mount(host, [fixture.stableOperation, fixture.stableOperation], options);
		flushSync();
		const next = [...host.querySelectorAll('button')];
		expect(next).toHaveLength(2);
		expect(next[0]).not.toBe(next[1]);
		expect(next[1]).toBe(buttons[1]);
		next[0]!.click();
		flushSync();
		expect(next[0]?.textContent).toBe('1');
		expect(next[1]?.textContent).toBe('0');
		expect(reports).toEqual([]);
	} finally {
		unmount(host);
		host.remove();
	}
});

it('reserves a supplied static render-program handle before positional fallback', async () => {
	const { createTestCompiledRenderProgram } = await import('./test-support/render-program.js');
	const { createOperation } = await import('./test-support/native-operations.js');
	const { renderTestTree } = await import('./testing.js');
	const stable = createTestCompiledRenderProgram(
		'render-program:retained-sibling-selection',
		() => ({
			version: 4,
			id: 'render-program:retained-sibling-selection',
			namespace: 'html',
			template: '<button>stable</button>',
			slots: [],
			bindings: [],
			nodes: [[0, 'button']]
		}),
		[]
	);
	const conditional = createOperation('span', null, 'conditional');
	const keyed = createOperation('em', { key: 'marker' }, 'keyed');
	const host = document.createElement('main');
	const reports: unknown[] = [];
	const options = { onErrorReport: (report: unknown) => reports.push(report) };
	try {
		renderTestTree([conditional, keyed, stable], host, options);
		const button = host.querySelector('button');
		const marker = host.querySelector('em');
		expect(marker).not.toBeNull();
		expect(button).not.toBeNull();
		renderTestTree([keyed, stable], host, options);
		expect(host.querySelector('button')).toBe(button);
		renderTestTree([conditional, keyed, stable], host, options);
		expect(host.querySelector('button')).toBe(button);
		expect(host.querySelector('em')).toBe(marker);
		renderTestTree([stable, createOperation('em', { key: 'marker' }, 'next')], host, options);
		expect(host.querySelector('em')).toBe(marker);
		expect(host.querySelector('button')).toBe(button);
		renderTestTree([stable, createOperation('em', { key: 'changed' }, 'new')], host, options);
		expect(host.querySelector('em')).not.toBe(marker);
		expect(host.querySelector('button')).toBe(button);
		expect(reports).toEqual([]);
	} finally {
		unmount(host);
	}
});
