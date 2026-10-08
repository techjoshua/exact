import { describe, expect, it } from 'vitest';
import { hydratableChunksOf } from './output-buffer.js';
import { documentHydrationSlot, fillDocumentHydration } from './document-output.js';
import { createChunkedHydratableResult, createChunkedStringResult } from './output-result.js';

describe('chunked SSR results', () => {
	it('fills only the first slot and preserves literal hydration text and surrounding Unicode', () => {
		const hydration = '<script>const text = "$& $` $\' 日本語 🚀";</script>';
		const html = `前🚀${documentHydrationSlot}後${documentHydrationSlot}`;
		expect(fillDocumentHydration(html, hydration)).toBe(
			`前🚀<!--exact:framework-body:start-->${hydration}<!--exact:framework-body:end-->後${documentHydrationSlot}`
		);
		expect(fillDocumentHydration(html, '')).toBe(`前🚀後${documentHydrationSlot}`);
		expect(fillDocumentHydration('unchanged 🚀', hydration)).toBe('unchanged 🚀');
	});

	it('fills a hydration slot split across chunks without exposing the marker in plain HTML', () => {
		const html = `before${documentHydrationSlot}after`;
		for (const knownSlot of [undefined, true]) {
			const source = createChunkedStringResult(
				[...html],
				undefined,
				undefined,
				undefined,
				undefined,
				knownSlot
			);
			const result = createChunkedHydratableResult(source, [], 'hydrate');
			expect(result.html).toBe('beforeafter');
			expect(result.htmlWithHydration).toBe(
				'before<!--exact:framework-body:start-->hydrate<!--exact:framework-body:end-->after'
			);
		}
		const foreign = createChunkedHydratableResult({ html, state: undefined }, [], 'hydrate');
		expect(foreign.htmlWithHydration).toBe(
			'before<!--exact:framework-body:start-->hydrate<!--exact:framework-body:end-->after'
		);
	});
	it('publishes completed HTML snapshots and keeps metadata isolated between results', () => {
		const chunks = ['first'];
		const first = createChunkedStringResult(chunks, { owner: 1 }, undefined, ['asset'], 7);
		const second = createChunkedStringResult(['second'], { owner: 2 });
		chunks.push(' read');
		expect(first.html).toBe('first');
		chunks.push(' later');
		expect(first.html).toBe('first');
		expect(second.html).toBe('second');
		expect(Object.keys(first)).toEqual(['html', 'state', 'wallClockSnapshot', 'preloadLinks']);
		expect(Object.isFrozen(first.preloadLinks)).toBe(true);
		expect(Object.getOwnPropertyDescriptor(first, 'html')).toMatchObject({
			enumerable: true,
			configurable: true,
			value: 'first'
		});
	});

	it('defers resumption reads and independently memoizes each hydrated output', () => {
		let reads = 0;
		const source = createChunkedStringResult(['plain'], { owner: 1 }, undefined, ['asset'], 7);
		const first = createChunkedHydratableResult(
			source,
			() => {
				reads++;
				return [];
			},
			'one'
		);
		const second = createChunkedHydratableResult(source, [], 'two');
		expect(first.state).toEqual({ owner: 1 });
		expect(first.wallClockSnapshot).toBe(7);
		expect(first.preloadLinks).toEqual(['asset']);
		expect(Object.isFrozen(first.preloadLinks)).toBe(true);
		expect(reads).toBe(0);
		expect(Object.getPrototypeOf(first)).toBe(Object.prototype);
		for (const key of ['resumptions', 'htmlWithHydration']) {
			expect(Object.getOwnPropertyDescriptor(first, key)).toMatchObject({
				get: expect.any(Function),
				set: undefined,
				enumerable: true,
				configurable: true
			});
		}
		expect(first.htmlWithHydration).toBe('plainone');
		expect(second.htmlWithHydration).toBe('plaintwo');
		expect(first.html).toBe('plain');
		expect(reads).toBe(0);
		expect(first.resumptions).toEqual([]);
		expect(first.resumptions).toEqual([]);
		expect(reads).toBe(2);
		expect({ ...first }).toMatchObject({ html: 'plain', htmlWithHydration: 'plainone' });
	});

	it('defines result data as own fields without invoking inherited setters', () => {
		const fields = ['html', 'state', 'hydrationScript'] as const;
		const previous = fields.map((key) => Object.getOwnPropertyDescriptor(Object.prototype, key));
		const inheritedWrite = () => {
			throw new Error('Result initialization invoked an inherited setter');
		};
		let result: ReturnType<typeof createChunkedHydratableResult>;
		try {
			for (const key of fields)
				Object.defineProperty(Object.prototype, key, { set: inheritedWrite, configurable: true });
			result = createChunkedHydratableResult({ html: 'plain', state: 7 }, [], 'hydrate');
		} finally {
			for (const [index, key] of fields.entries()) {
				const descriptor = previous[index];
				if (descriptor) Object.defineProperty(Object.prototype, key, descriptor);
				else Reflect.deleteProperty(Object.prototype, key);
			}
		}
		expect(result.html).toBe('plain');
		expect(result.state).toBe(7);
		expect(result.hydrationScript).toBe('hydrate');
		for (const key of fields)
			expect(Object.getOwnPropertyDescriptor(result, key)).toMatchObject({
				writable: true,
				enumerable: true,
				configurable: true
			});
	});

	it('places hydration before the final body close regardless of chunk boundaries or tag case', () => {
		const html = '<!doctype html><html><body><template></body></template>Ready</BoDy></html>';
		const expected = html.replace(
			'Ready</BoDy>',
			'Ready<!--exact:framework-body:start-->hydrate<!--exact:framework-body:end--></BoDy>'
		);
		for (let split = 0; split <= html.length; split++) {
			const result = createChunkedStringResult(
				[html.slice(0, split), '', html.slice(split)],
				undefined
			);
			expect(createChunkedHydratableResult(result, [], 'hydrate').htmlWithHydration).toBe(expected);
		}
		const characters = createChunkedStringResult([...html], undefined);
		expect(createChunkedHydratableResult(characters, [], 'hydrate').htmlWithHydration).toBe(
			expected
		);
	});

	it('rejects a normalized document without its body close', () => {
		const result = createChunkedStringResult(
			['<!doctype html><html><body>Ready</html>'],
			undefined
		);
		expect(() => createChunkedHydratableResult(result, [], 'hydrate')).toThrow(
			'missing its closing </body>'
		);
		expect(Object.keys(result)).toEqual(['html', 'state']);
	});

	it('inserts document hydration across a split body-close token without joining', () => {
		const result = createChunkedStringResult(
			['<!doctype html><html><body>Ready</bo', 'dy></html>'],
			undefined
		);
		const hydrated = createChunkedHydratableResult(result, [], '<script>hydrate()</script>');
		const chunks = hydratableChunksOf(hydrated)!;

		expect(chunks.length).toBeGreaterThan(2);
		expect(chunks.join('')).toBe(
			'<!doctype html><html><body>Ready<!--exact:framework-body:start--><script>hydrate()</script><!--exact:framework-body:end--></body></html>'
		);
	});
});
