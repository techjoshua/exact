/** @vitest-environment jsdom */
import { expect, it, onTestFinished } from 'vitest';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { unmount } from '@exactjs/dom';
import { hydrate } from './index.js';
import {
	ScalarArrayPage,
	MixedScalarPage,
	ScalarBindingsPage,
	ScalarClickPage,
	GenericScalarClickPage,
	clickOwner,
	bindingState,
	scalarOwner
} from './test-support/coalesced-scalars.fixtures.js';
import {
	ScalarArrayPage as ServerPage,
	MixedScalarPage as ServerMixedPage,
	ScalarBindingsPage as ServerBindingsPage,
	ScalarClickPage as ServerClickPage,
	GenericScalarClickPage as ServerGenericPage,
	bindingState as serverBindingState
} from './test-support/coalesced-scalars.fixtures.js?exact-target=server';

it.each([
	['strings', ['a', ' / ', 'b'], 'a / b'],
	['numbers', [1, 2, 3], '123'],
	['empty and absent', ['', null, false, 'a', '', true, 'b'], 'ab'],
	['Unicode', ['café ', '😀', ' & <'], 'café 😀 & <']
] as const)('adopts coalesced %s without replacing the host', async (_name, initial, expected) => {
	const host = document.createElement('div');
	onTestFinished(() => {
		unmount(host);
	});
	const output = await renderToHydratableString(receipt(ServerPage, { initial: [...initial] }));
	host.innerHTML = output.html;
	const original = host.querySelector('p')!;
	const text = [...original.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
	const outcomes: string[] = [];
	const root = hydrate(receipt(ScalarArrayPage, { initial: [...initial] }), host, {
		resumptions: output.resumptions,
		onMismatch: 'throw',
		onHydration: (event) => outcomes.push(event.outcome)
	});
	expect(outcomes).toEqual(['adopted']);
	expect(host.querySelector('p')).toBe(original);
	expect(original.textContent).toBe(expected);
	expect([...original.childNodes]).toContain(text);
	scalarOwner.state.values = ['next', ' 😀', 4];
	flushSync();
	expect(original.textContent).toBe('next 😀4');
	scalarOwner.state.values = [];
	flushSync();
	expect(original.textContent).toBe('');
	scalarOwner.state.values = ['again', 5];
	flushSync();
	expect(original.textContent).toBe('again5');
	expect(host.querySelector('p')).toBe(original);
	root.dispose();
	expect(host.childNodes.length).toBe(0);
});

it.each(['throw', 'replace'] as const)(
	'honors %s for a marked root text mismatch',
	async (policy) => {
		const host = document.createElement('div');
		onTestFinished(() => {
			unmount(host);
		});
		const output = await renderToHydratableString(receipt(ServerPage, { initial: ['expected'] }));
		host.innerHTML = output.html;
		const original = host.querySelector('p')!;
		[...original.childNodes].find((node) => node.nodeType === Node.TEXT_NODE)!.textContent =
			'wrong';
		const diagnostics: unknown[] = [];
		const invoke = () =>
			hydrate(receipt(ScalarArrayPage, { initial: ['expected'] }), host, {
				resumptions: output.resumptions,
				onMismatch: policy,
				onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
				logger: { log() {} }
			});
		if (policy === 'throw') {
			expect(invoke).toThrow(/match/);
			expect(host.querySelector('p')).toBe(original);
			expect(original.textContent).toBe('wrong');
		} else {
			const root = invoke();
			expect(host.querySelector('p')).not.toBe(original);
			expect(host.textContent).toBe('expected');
			root.dispose();
		}
		expect(diagnostics).toEqual([expect.objectContaining({ code: 'adoption-mismatch' })]);
	}
);

it('keeps independent scalar runs on each side of an opaque intrinsic', async () => {
	const host = document.createElement('div');
	onTestFinished(() => {
		unmount(host);
	});
	const output = await renderToHydratableString(receipt(ServerMixedPage, {}));
	host.innerHTML = output.html;
	const paragraph = host.querySelector('p')!;
	const bold = host.querySelector('b')!;
	const root = hydrate(receipt(MixedScalarPage, {}), host, {
		resumptions: output.resumptions,
		onMismatch: 'throw'
	});
	expect(host.querySelector('p')).toBe(paragraph);
	expect(host.querySelector('b')).toBe(bold);
	expect(paragraph.textContent).toBe('a / opaqueb!');
	root.dispose();
	expect(host.childNodes).toHaveLength(0);
});
it.each(['throw', 'replace'] as const)('honors %s when markers are absent', (policy) => {
	const host = document.createElement('div');
	host.innerHTML = '<p>expected</p>';
	const original = host.firstChild;
	onTestFinished(() => {
		unmount(host);
	});
	const diagnostics: unknown[] = [];
	const invoke = () =>
		hydrate(receipt(ScalarArrayPage, { initial: ['expected'] }), host, {
			onMismatch: policy,
			onDiagnostic: (event) => diagnostics.push(event),
			logger: { log() {} }
		});
	if (policy === 'throw') {
		expect(invoke).toThrow(/markers/);
		expect(host.firstChild).toBe(original);
	} else {
		const root = invoke();
		expect(host.querySelector('p')).not.toBe(original);
		expect(host.textContent).toBe('expected');
		root.dispose();
	}
	expect(diagnostics).toEqual([expect.objectContaining({ code: 'missing-markers' })]);
});
it('adopts an explicitly allowed markerless root with retained structural boundaries', async () => {
	const host = document.createElement('div');
	const output = await renderToHydratableString(receipt(ServerPage, { initial: ['a', 'b'] }));
	host.innerHTML = output.html;
	host.firstChild?.remove();
	host.lastChild?.remove();
	const original = host.querySelector('p');
	onTestFinished(() => {
		unmount(host);
	});
	const root = hydrate(receipt(ScalarArrayPage, { initial: ['a', 'b'] }), host, {
		allowMarkerless: true,
		markerlessRoot: true,
		resumptions: output.resumptions,
		onMismatch: 'throw'
	});
	expect(host.querySelector('p')).toBe(original);
	scalarOwner.state.values = ['c', 'd'];
	flushSync();
	expect(host.textContent).toBe('cd');
	root.dispose();
});

it.each([
	['', 'a'],
	['a', ''],
	['', ''],
	['a', 'b']
])('adopts independent reactive scalars %j + %j', async (first, last) => {
	const host = document.createElement('div');
	onTestFinished(() => {
		unmount(host);
	});
	Object.assign(bindingState, { first, last });
	Object.assign(serverBindingState, { first, last });
	const props = {};
	const output = await renderToHydratableString(receipt(ServerBindingsPage, props));
	host.innerHTML = output.html;
	const original = host.querySelector('p');
	const root = hydrate(receipt(ScalarBindingsPage, props), host, {
		resumptions: output.resumptions,
		onMismatch: 'throw'
	});
	expect(host.querySelector('p')).toBe(original);
	expect(original?.textContent).toBe(first + last);
	bindingState.first = 'next';
	bindingState.last = '😀';
	flushSync();
	expect(original?.textContent).toBe('next😀');
	bindingState.first = '';
	bindingState.last = '';
	flushSync();
	expect(original?.textContent).toBe('');
	root.dispose();
	expect(host.childNodes).toHaveLength(0);
});

it.each(['mount', 'hydrate'])(
	'updates mixed scalar lanes from an authored click after %s',
	async (mode) => {
		const host = document.createElement('div');
		onTestFinished(() => {
			unmount(host);
		});
		if (mode === 'hydrate') {
			const output = await renderToHydratableString(receipt(ServerClickPage, {}));
			host.innerHTML = output.html;
			hydrate(receipt(ScalarClickPage, {}), host, {
				resumptions: output.resumptions,
				onMismatch: 'throw'
			});
		} else {
			const { render } = await import('@exactjs/dom');
			render(receipt(ScalarClickPage, {}), host);
		}
		const paragraph = host.querySelector('p');
		host.querySelector('button')!.click();
		flushSync();
		expect(clickOwner.state.step).toBe(1);
		expect([...clickOwner.state.values]).toEqual(['next', '!']);
		expect(paragraph?.textContent).toBe('next!');
		expect(host.querySelector('output')?.textContent).toBe('1');
		host.querySelector('button')!.click();
		flushSync();
		expect(paragraph?.textContent).toBe('');
		expect(host.querySelector('p')).toBe(paragraph);
	}
);

it.each(['mount', 'hydrate'])('updates a generic scalar range after %s', async (mode) => {
	const host = document.createElement('div');
	onTestFinished(() => {
		unmount(host);
	});
	if (mode === 'hydrate') {
		const output = await renderToHydratableString(receipt(ServerGenericPage, {}));
		host.innerHTML = output.html;
		hydrate(receipt(GenericScalarClickPage, {}), host, {
			resumptions: output.resumptions,
			onMismatch: 'throw'
		});
	} else {
		const { render } = await import('@exactjs/dom');
		render(receipt(GenericScalarClickPage, {}), host);
	}
	const paragraph = host.querySelector('p');
	host.querySelector('button')!.click();
	flushSync();
	expect(paragraph?.textContent).toBe('next!');
	expect(host.querySelector('p')).toBe(paragraph);
});
