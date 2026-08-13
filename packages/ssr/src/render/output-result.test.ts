import { describe, expect, it } from 'vitest';
import { hydratableChunksOf } from './output-buffer.js';
import { createChunkedHydratableResult, createChunkedStringResult } from './output-result.js';

describe('chunked SSR results', () => {
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
