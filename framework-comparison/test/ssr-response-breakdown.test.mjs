import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { comparisonDocumentHtml, responseByteBreakdown } from '../src/ssr-response-breakdown.mjs';

describe('SSR response byte breakdown', () => {
	it('separates semantic markup, Exact markers, identities, and hydration data', () => {
		const rendered =
			'<!--exact:dynamic:x--><button data-exact-id="b">Ready</button><!--/exact:dynamic:x-->' +
			'<script type="application/json" id="__exact_hydration">{"state":1}</script>';
		const result = responseByteBreakdown('exact', rendered, { state: 1 });
		assert.equal(
			result.documentBytes,
			Buffer.byteLength(comparisonDocumentHtml('exact', rendered, {}))
		);
		assert.equal(result.frameworkMarkerBytesByKind.dynamic, 45);
		assert.equal(result.frameworkIdentityAttributeBytes, 18);
		assert.ok(result.hydrationScriptBytes > 0);
		assert.equal(result.hydrationPayloadBytes, 11);
		assert.deepEqual(result.hydrationFieldsBytes, { state: 9 });
		assert.equal(result.comparisonDataScriptBytes, 0);
	});

	it('accounts for the comparison data script independently of React markup', () => {
		const result = responseByteBreakdown('react', '<button>Ready</button>', { value: '<safe>' });
		assert.equal(result.frameworkMarkerCommentBytes, 0);
		assert.equal(result.hydrationScriptBytes, 0);
		assert.ok(result.comparisonDataScriptBytes > 0);
	});
});
