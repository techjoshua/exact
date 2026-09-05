import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeStartupTrace, startupPercentile } from '../src/startup-cpu-analysis.mjs';

test('startup trace analysis separates parse, compile, and evaluation around FCP', () => {
	const result = analyzeStartupTrace(
		[
			{
				name: 'TimeStamp',
				ph: 'I',
				ts: 1_000,
				args: { data: { message: '__framework_comparison_navigation_start__' } }
			},
			{ name: 'V8.ParseProgram', cat: 'v8', ph: 'X', ts: 2_000, dur: 2_000 },
			{
				name: 'V8.ParseFunction',
				cat: 'v8',
				ph: 'X',
				ts: 2_500,
				dur: 500,
				args: {
					data: { url: 'http://127.0.0.1/app.js', startPosition: 10, endPosition: 20 }
				}
			},
			{
				name: 'V8.CompileCode',
				cat: 'v8',
				ph: 'X',
				ts: 4_000,
				dur: 3_000,
				args: { data: { url: 'http://127.0.0.1/app.js', startPosition: 30, endPosition: 40 } }
			},
			{ name: 'firstContentfulPaint', ph: 'I', ts: 8_000 },
			{ name: 'EvaluateScript', cat: 'devtools.timeline', ph: 'X', ts: 9_000, dur: 4_000 },
			{
				name: 'TimeStamp',
				ph: 'I',
				ts: 14_000,
				args: { data: { message: '__framework_comparison_ready__' } }
			}
		],
		{ includeFunctionSites: true }
	);

	assert.deepEqual(result.totals, { parseMs: 2.5, compileMs: 3, evaluationMs: 4 });
	assert.deepEqual(result.beforeFcp, { parseMs: 2.5, compileMs: 3, evaluationMs: 0 });
	assert.deepEqual(result.functionCounts, { parsed: 1, compiled: 1 });
	assert.deepEqual(result.functionSiteLocations, { available: 2, unavailable: 0 });
	assert.deepEqual(result.functionCountsBeforeFcp, { parsed: 1, compiled: 1 });
	assert.equal(result.byUrl[0].compileMs, 3);
	assert.deepEqual(result.functionSites, [
		{
			kind: 'parsed',
			url: 'http://127.0.0.1/app.js',
			scriptId: null,
			startOffset: 10,
			endOffset: 20,
			fields: ['endPosition', 'startPosition', 'url']
		},
		{
			kind: 'compiled',
			url: 'http://127.0.0.1/app.js',
			scriptId: null,
			startOffset: 30,
			endOffset: 40,
			fields: ['endPosition', 'startPosition', 'url']
		}
	]);
	assert.deepEqual(result.markers, {
		navigationStartFound: true,
		firstContentfulPaintFound: true,
		readyFound: true
	});
});

test('startup percentiles use the harness nearest-rank convention', () => {
	assert.equal(startupPercentile([4, 1, 3, 2], 0.5), 2);
	assert.equal(startupPercentile([4, 1, 3, 2], 0.95), 4);
});
