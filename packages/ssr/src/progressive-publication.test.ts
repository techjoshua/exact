import { expect, it } from 'vitest';
import { progressiveHtmlChunk, type ProgressiveDocumentState } from './stream/protocol.js';

it('installs one response-local progressive replacement helper', () => {
	const state: ProgressiveDocumentState = {};
	const options = { rootId: 'page', nonce: 'nonce' };
	progressiveHtmlChunk({ event: 'shell', version: 1, html: '<p>shell</p>' }, options, state);
	const first = progressiveHtmlChunk(
		{ event: 'replace', version: 1, id: 'one', html: '<b>one</b>' },
		options,
		state
	);
	const second = progressiveHtmlChunk(
		{ event: 'replace', version: 1, id: 'two', html: '<b>two</b>' },
		options,
		state
	);
	expect(first).toContain('=function(i,h)');
	expect(first).toContain('nonce="nonce"');
	expect(second).not.toContain('=function(i,h)');
	expect(second.length).toBeLessThan(first.length);
});
