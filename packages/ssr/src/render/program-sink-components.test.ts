import { createPreparedServerComponentReference } from '@exactjs/core/framework/server-render-structure';
import { createCompiledIntrinsicReceipt } from '@exactjs/core/runtime/component-operations';
import { expect, it } from 'vitest';
import { createSsrResumptionCapture } from '../resumption.js';
import { renderChildren } from './children.js';
import { createSsrContext } from './context.js';
import { SsrOperationTarget } from './operation-target.js';
import {
	RoutedStreamPage,
	resetRoutedStreamFixture,
	readRoutedStreamTargetSetups
} from '../streams.fixtures.test.js';
import { StreamEnhancement } from '../streams-enhancement.fixtures.test.js';
import {
	SinkDocument,
	SinkFragments,
	SynchronousSinkDocument,
	resetSinkFixture,
	sinkFixtureDisposals,
	sinkFixtureStarts
} from './program-sink.fixtures.test.js';

it('keeps descendant capture on its execution scope across suspension with a shared output context', async () => {
	const settle = resetSinkFixture();
	const surrounding = createSsrResumptionCapture({});
	const application = createSsrResumptionCapture({});
	const context = createSsrContext(surrounding.options);
	const target = new SsrOperationTarget(
		context,
		undefined,
		application.options,
		false,
		renderChildren
	);
	const rendered = Promise.resolve(
		target.renderDirectServerComponent(createPreparedServerComponentReference(SinkFragments, {}))
	);
	void rendered.catch(() => undefined);
	try {
		for (let turn = 0; turn < 100 && sinkFixtureStarts() === 0; turn++) await Promise.resolve();
		expect(sinkFixtureStarts()).toBe(1);
		settle();
		expect(await rendered).toContain('Ready');
		expect(surrounding.serializedRecords()).toEqual([]);
		expect(application.serializedRecords().length).toBeGreaterThan(0);
		expect(JSON.stringify(application.serializedRecords())).toContain('Ready');
		expect(sinkFixtureDisposals()).toBe(1);
	} finally {
		settle();
		await rendered.catch(() => undefined);
	}
});

it.each([false, true])(
	'preserves compiled document and fragment output with markers=%s',
	async (markers) => {
		for (const component of [SinkDocument, SinkFragments, SynchronousSinkDocument]) {
			let expected;
			for (const shared of [false, true]) {
				const settle = resetSinkFixture();
				const capture = createSsrResumptionCapture({ markers });
				const context = createSsrContext(capture.options);
				const writes: string[] = [];
				const sink = {
					write(html: string) {
						writes.push(html);
					},
					ready() {},
					flush() {}
				};
				if (shared) context.writerSink = sink;
				const root = createPreparedServerComponentReference(component, {});
				const target = new SsrOperationTarget(
					context,
					undefined,
					capture.options,
					false,
					renderChildren
				);
				try {
					settle();
					const remainder = await target.renderCompilerClosedRootComponent(root);
					const result = {
						html: writes.join('') + remainder,
						records: capture.serializedRecords(),
						traversedNodes: context.traversedNodes
					};
					expect(sinkFixtureDisposals()).toBe(1);
					expect(context.hostStack).toEqual([]);
					expect(context.traversalDepth).toBe(0);
					if (shared) expect(result).toEqual(expected);
					else expected = result;
				} finally {
					settle();
				}
			}
		}
	}
);

it('flushes a compiled document head before its scheduled body settles', async () => {
	const settle = resetSinkFixture();
	const capture = createSsrResumptionCapture({ markers: true });
	const context = createSsrContext(capture.options);
	const writes: string[] = [];
	let headReady!: () => void;
	const head = new Promise<void>((resolve) => {
		headReady = resolve;
	});
	context.writerSink = {
		write(html) {
			writes.push(html);
		},
		ready() {},
		flush(reason) {
			if (reason === 'head') headReady();
		}
	};
	const root = createPreparedServerComponentReference(SinkDocument, {});
	const target = new SsrOperationTarget(context, undefined, capture.options, false, renderChildren);
	let completed = false;
	const rendered = Promise.resolve(target.renderCompilerClosedRootComponent(root)).then((value) => {
		completed = true;
		return value;
	});
	void rendered.catch(() => undefined);
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			head,
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error('Head remained buffered behind body task')),
					1000
				);
			})
		]);
		expect(completed).toBe(false);
		expect(writes.join('')).toContain('<link rel="stylesheet" href="/app.css"></head>');
		expect(writes.join('')).not.toContain('Ready');
		expect(writes.join('')).not.toContain('</body>');
		settle();
		const remainder = await rendered;
		expect(writes.join('') + remainder).toContain('<em>Ready</em>');
		expect(context.hostStack).toEqual([]);
		expect(sinkFixtureDisposals()).toBe(1);
	} finally {
		clearTimeout(timer);
		settle();
		await rendered.catch(() => undefined);
	}
});

it('releases captured component ownership when the request aborts after head publication', async () => {
	const settle = resetSinkFixture();
	const controller = new AbortController();
	const capture = createSsrResumptionCapture({ markers: true, signal: controller.signal });
	const context = createSsrContext(capture.options);
	const writes: string[] = [];
	let headPublished = false;
	const sink = {
		write(html: string) {
			writes.push(html);
		},
		ready() {},
		flush(reason: string) {
			if (reason === 'head') headPublished = true;
		}
	};
	context.writerSink = sink;
	const target = new SsrOperationTarget(context, undefined, capture.options, false, renderChildren);
	const root = createPreparedServerComponentReference(SinkDocument, {});
	const rendered = Promise.resolve(target.renderCompilerClosedRootComponent(root));
	void rendered.catch(() => undefined);
	try {
		for (let turn = 0; turn < 100 && (!headPublished || sinkFixtureStarts() === 0); turn++)
			await Promise.resolve();
		expect(headPublished).toBe(true);
		expect(sinkFixtureStarts()).toBe(1);
		controller.abort();
		await expect(rendered).rejects.toMatchObject({ name: 'AbortError' });
		expect(sinkFixtureDisposals()).toBe(sinkFixtureStarts());
		expect(context.hostStack).toEqual([]);
		expect(context.writerSink).toBe(sink);
		expect(writes.join('')).not.toContain('</body>');
	} finally {
		controller.abort();
		settle();
		await rendered.catch(() => undefined);
	}
});

it.each([
	[false, false],
	[false, true],
	[true, false],
	[true, true]
])(
	'orders scalar siblings with markers=%s and intrinsic capture=%s',
	async (markers, intrinsic) => {
		let expected;
		for (const shared of [false, true]) {
			const settle = resetSinkFixture();
			const capture = createSsrResumptionCapture({ markers });
			const context = createSsrContext(capture.options);
			context.textSeparators = true;
			const writes: string[] = [];
			if (shared)
				context.writerSink = {
					write(html) {
						writes.push(html);
					},
					ready() {},
					flush() {}
				};
			try {
				settle();
				const component = createPreparedServerComponentReference(SinkFragments, {});
				const child = intrinsic
					? createCompiledIntrinsicReceipt('section', null, 'Inside', component, 'End')
					: component;
				const remainder = await renderChildren(
					context,
					['One', 'Two', child, 'Three'],
					undefined,
					capture.options
				);
				const result = { html: writes.join('') + remainder, records: capture.serializedRecords() };
				expect(result.html).toMatch(/^One<!-- -->Two/);
				expect(result.html).toMatch(/Three$/);
				if (shared) expect(result).toEqual(expected);
				else expected = result;
			} finally {
				settle();
			}
		}
	}
);

it.each([false, true])('captures routed enhancement prefixes with markers=%s', async (markers) => {
	let expected;
	for (const shared of [false, true]) {
		resetRoutedStreamFixture();
		const options = {
			markers,
			enhancementCatalog: new Map([
				['./stream-enhancements.fixtures.test.js#routed', StreamEnhancement]
			])
		};
		const capture = createSsrResumptionCapture(options);
		const context = createSsrContext(capture.options);
		const writes: string[] = [];
		const sink = {
			write(html: string) {
				writes.push(html);
			},
			ready() {},
			flush() {}
		};
		if (shared) context.writerSink = sink;
		const target = new SsrOperationTarget(
			context,
			undefined,
			capture.options,
			false,
			renderChildren
		);
		const remainder = await target.renderCompilerClosedRootComponent(
			createPreparedServerComponentReference(RoutedStreamPage, {})
		);
		const result = { html: writes.join('') + remainder, records: capture.serializedRecords() };
		expect(readRoutedStreamTargetSetups()).toBe(1);
		expect(context.enhancementOperationRoutes?.length ?? 0).toBe(0);
		if (shared) {
			expect(result).toEqual(expected);
			expect(context.writerSink).toBe(sink);
		} else expected = result;
	}
});
