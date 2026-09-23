import { expect, it, vi } from 'vitest';
import { exactResponseBodyOf } from '@exactjs/server';
import { renderToHydratableProgressiveHtmlResponse } from './entrypoints.js';
import { createOperation } from '../test-support/native-operations.js';
import {
	SinkDocument,
	resetSinkFixture,
	sinkFixtureDisposals,
	sinkFixtureStarts
} from './program-sink.fixtures.test.js';

it('propagates render cancellation to the body owner and unwinds its pending component', async () => {
	const settle = resetSinkFixture();
	const request = new AbortController();
	const response = renderToHydratableProgressiveHtmlResponse(createOperation(SinkDocument, {}), {
		signal: request.signal
	});
	const body = exactResponseBodyOf(response)!;
	if (body.kind !== 'asynchronous') throw new Error('Expected a progressive response body');
	const reader = body.toReadableStream().getReader();
	try {
		expect(new TextDecoder().decode((await reader.read()).value)).toContain('</head>');
		await vi.waitFor(() => expect(sinkFixtureStarts()).toBe(1));
		const reason = new Error('render request cancelled');
		request.abort(reason);
		expect(body.signal.aborted).toBe(true);
		expect(body.signal.reason).toBe(reason);
		await body.cancel(reason);
		expect(sinkFixtureDisposals()).toBe(1);
		await expect(reader.read()).rejects.toBe(reason);
	} finally {
		settle();
		await reader.cancel().catch(() => undefined);
		reader.releaseLock();
	}
});
