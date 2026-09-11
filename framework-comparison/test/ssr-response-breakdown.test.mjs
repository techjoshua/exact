import assert from 'node:assert/strict';
import { it } from 'node:test';
import { responseDocumentByteBreakdown } from '../src/ssr-response-breakdown.mjs';

function document(markup, scripts = '') {
	return `<!doctype html><html><head><title>Fixture</title></head><body><div id="app" data-render-mode="ssr">${markup}</div>${scripts}</body></html>`;
}

it('counts hydration after the application root in the actual document', () => {
	const markup =
		'<!--exact:dynamic:x--><button data-exact-id="b">Ready</button><!--/exact:dynamic:x-->';
	const script = '<script type="application/json" id="__exact_hydration">{"state":1}</script>';
	for (const html of [document(markup, script), document(markup + script)]) {
		const result = responseDocumentByteBreakdown('exact', html);
		assert.equal(result.documentBytes, Buffer.byteLength(html));
		assert.equal(result.frameworkMarkerBytesByKind.dynamic, 45);
		assert.equal(result.frameworkIdentityAttributeBytes, 18);
		assert.equal(result.hydrationScriptBytes, Buffer.byteLength(script));
		assert.equal(result.hydrationPayloadBytes, 11);
		assert.deepEqual(result.hydrationFieldsBytes, { state: 9 });
		assert.equal(result.semanticMarkupBytes, Buffer.byteLength('<button>Ready</button>'));
		assertReconciled(result);
	}
});

it('counts the React data script and application shell from their actual bytes', () => {
	const script = '<script id="comparison-data" type="application/json">{"value":"safe"}</script>';
	const html = document('<div>Nested</div><!-- -->', script).replace(
		'<head>',
		'<head><meta charset="UTF-8"/>'
	);
	const result = responseDocumentByteBreakdown('react', html);
	assert.equal(result.documentBytes, Buffer.byteLength(html));
	assert.equal(result.comparisonDataScriptBytes, Buffer.byteLength(script));
	assert.equal(result.hydrationScriptBytes, 0);
	assertReconciled(result);
});

it('rejects a document missing its application root', () => {
	assert.throws(
		() => responseDocumentByteBreakdown('react', '<html></html>'),
		/missing the comparison root/
	);
});

function assertReconciled(result) {
	assert.equal(
		result.documentBytes,
		result.documentEnvelopeBytes +
			result.semanticMarkupBytes +
			result.frameworkMarkerCommentBytes +
			result.frameworkIdentityAttributeBytes +
			result.hydrationScriptBytes +
			result.comparisonDataScriptBytes
	);
}
