import { expect, it } from 'vitest';
import { createCompiledComponentRegistry } from '@exactjs/core/runtime/registry';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-abi';
import { renderComponentReference } from './component.js';
import { createSsrContext } from './context.js';
import {
	readServerComponentReference,
	receiptExecutionContract
} from './server-component-reference.js';
import { SynchronousBody } from './program-sink.fixtures.test.js';
import { renderToString } from '../index.js';
import { prepareResumptionChildren } from './resumption-children.js';
import { serverSlotReceiptReference, serverSlotReference } from './server-slots.js';
import { createServerSlot } from '@exactjs/core/runtime/render-operations';
import { readServerSlotReceipt } from '@exactjs/core/runtime/component-abi';

it.each([null, undefined, false, 0, 'text'])(
	'preserves scalar authored children in publication: %j',
	(children) => {
		const operation = createCompiledComponentReceipt(SynchronousBody, { children });
		const reference = readServerComponentReference(operation)!;
		const prepared = prepareResumptionChildren(reference, 'owner', createSsrContext({}));
		expect(prepared.component.children).toEqual([]);
		expect(prepared.component.props).toBe(prepared.props);
		expect(prepared.props.children).toBe(children);
	}
);

it('snapshots a scalar child accessor before later publication', () => {
	const reference = readServerComponentReference(
		createCompiledComponentReceipt(SynchronousBody, null)
	)!;
	let reads = 0;
	const props = {
		get children() {
			reads++;
			return 'text-' + reads;
		}
	};
	const prepared = prepareResumptionChildren(
		{ ...reference, props },
		'owner',
		createSsrContext({})
	);
	expect(reads).toBe(2);
	expect(prepared.props.children).toBe('text-1');
	expect(reads).toBe(2);
	expect(prepared.props).not.toBe(props);
});

it.each([
	['range', { kind: 'single' }],
	['range', { kind: 'branch', branch: 'selected' }],
	['range:key:first', { kind: 'keyed', list: 'rows', keyToken: 'first' }]
])('preserves complete authority for %s', (id, discriminator) => {
	const authority = {
		planVersion: 1,
		buildKey: 'build',
		planEdgeId: 'range',
		ownerComponentId: 'owner',
		discriminator,
		generation: 1
	};
	const receipt = readServerSlotReceipt(createServerSlot(id, authority, 'content'))!;
	expect(serverSlotReceiptReference(receipt)).toEqual({ id, ...authority });
	expect(serverSlotReference({ __exactServerSlot: id, ...authority })).toBe(true);
	expect(serverSlotReference({ __exactServerSlot: 'foreign', ...authority })).toBe(false);
});

it('writes an adopted synchronous publication directly to the enclosing sink', async () => {
	const operation = createCompiledComponentReceipt(SynchronousBody, null);
	const reference = readServerComponentReference(operation)!;
	expect(receiptExecutionContract(reference).artifact.execution.publication?.kind).toBe(
		'resumption'
	);
	const options = { markers: false, clientResumptionOwner: true };
	const context = createSsrContext(options);
	const spans: string[] = [];
	context.writerSink = {
		write: (html) => spans.push(html),
		ready: () => undefined,
		flush: () => undefined
	};
	// An adopted child needs neither an island wrapper nor private output capture.
	const tail = await renderComponentReference(context, reference, undefined, options, true, true);
	expect(spans.length).toBeGreaterThan(0);
	expect(spans.join('') + tail).toBe((await renderToString(operation, options)).html);
});

it.each([false, true])(
	'keeps selected artifact publication under client ownership %j',
	async (clientResumptionOwner) => {
		const registry = createCompiledComponentRegistry(
			'test:ssr:selected-publication:' + clientResumptionOwner,
			'SelectedBody',
			'server',
			({ lazy }) => ({ body: lazy(async () => SynchronousBody) })
		);
		const reference = readServerComponentReference(
			createCompiledComponentReceipt(registry.body, null)
		)!;
		expect(receiptExecutionContract(reference).artifact.execution.publication).toBeUndefined();
		const options = { markers: false, clientResumptionOwner };
		const html = await renderComponentReference(
			createSsrContext(options),
			reference,
			undefined,
			options,
			true
		);
		expect(html).toContain('Ready');
		expect(html.includes('data-exact-client-boundary')).toBe(!clientResumptionOwner);
	}
);
