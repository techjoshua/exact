import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceMapGenerator } from 'source-map-js';
import { attributeClientModules } from '../src/module-attribution.mjs';

test('module attribution joins generated ranges, narrow coverage, and V8 function sites', () => {
	const map = new SourceMapGenerator({ file: 'bundle.js' });
	map.addMapping({
		generated: { line: 1, column: 0 },
		source: 'a.ts',
		original: { line: 1, column: 0 }
	});
	map.addMapping({
		generated: { line: 1, column: 5 },
		source: 'b.ts',
		original: { line: 1, column: 0 }
	});
	const result = attributeClientModules({
		code: 'aaaaabbbbb',
		sourceMap: map.toJSON(),
		coverage: {
			functions: [
				{ ranges: [{ startOffset: 0, endOffset: 10, count: 1 }] },
				{ ranges: [{ startOffset: 5, endOffset: 10, count: 0 }] }
			]
		},
		functionSites: [
			{ kind: 'parsed', startOffset: 1 },
			{ kind: 'compiled', startOffset: 6 }
		]
	});
	assert.deepEqual(result, [
		{
			source: 'a.ts',
			generatedBytes: 5,
			executedBytes: 5,
			parsedFunctions: 1,
			compiledFunctions: 0,
			profiledFunctions: 1,
			invokedFunctions: 1
		},
		{
			source: 'b.ts',
			generatedBytes: 5,
			executedBytes: 0,
			parsedFunctions: 0,
			compiledFunctions: 1,
			profiledFunctions: 1,
			invokedFunctions: 0
		}
	]);
});
