import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, expect, it, vi } from 'vitest';
import { createNodeHandler } from './handler.js';

const admission = vi.hoisted(() => ({ enter: vi.fn(), create: vi.fn() }));
vi.mock('./admission.js', () => ({
	createNodeRequestAdmission: (options: unknown) => {
		admission.create(options);
		return admission.enter;
	}
}));

beforeEach(() => {
	vi.clearAllMocks();
	admission.enter.mockReset().mockReturnValue(undefined);
});

function exchange() {
	const request = new EventEmitter() as IncomingMessage;
	const response = Object.assign(new EventEmitter(), {
		writableFinished: false,
		writableEnded: false,
		destroyed: false,
		headersSent: false,
		statusCode: 200,
		getHeaderNames: () => [],
		setHeader: vi.fn(),
		end: vi.fn(),
		destroy: vi.fn()
	}) as unknown as ServerResponse;
	return { request, response };
}

it('enters the default admission policy before executing quiet handlers synchronously', () => {
	const { request, response } = exchange();
	const work = vi.fn(() => expect(admission.enter).toHaveBeenCalledOnce());
	const handler = createNodeHandler(work);
	handler(request, response);
	expect(admission.create).toHaveBeenCalledWith({});
	expect(work).toHaveBeenCalledOnce();
	expect(work.mock.calls[0]).toHaveLength(3);
	response.emit('finish');
	expect(request.listenerCount('aborted')).toBe(0);
	expect(response.listenerCount('close')).toBe(0);
});

it('never executes a queued request after the client disconnects', async () => {
	const { request, response } = exchange();
	let signal: AbortSignal | undefined;
	admission.enter.mockImplementation((_response: ServerResponse, received: AbortSignal) => {
		signal = received;
		return new Promise<void>((_resolve, reject) =>
			received.addEventListener('abort', () => reject(received.reason), { once: true })
		);
	});
	const work = vi.fn();
	createNodeHandler(work)(request, response);
	expect(work).not.toHaveBeenCalled();
	response.emit('close');
	await Promise.resolve();
	await Promise.resolve();
	expect(signal?.aborted).toBe(true);
	expect(work).not.toHaveBeenCalled();
	expect(response.end).not.toHaveBeenCalled();
	expect(request.listenerCount('aborted')).toBe(0);
});

it('passes disconnect cancellation to already-running handler work', () => {
	const { request, response } = exchange();
	let signal: AbortSignal | undefined;
	createNodeHandler((_request, _response, received) => {
		signal = received;
	})(request, response);
	expect(signal?.aborted).toBe(false);
	request.emit('aborted');
	expect(signal?.aborted).toBe(true);
	expect(response.listenerCount('finish')).toBe(0);
});

it.each(['sync', 'async'])(
	'reports %s handler failures without exposing their details',
	async (kind) => {
		const { request, response } = exchange();
		const logger = { log: vi.fn() };
		const error = new Error('private detail');
		createNodeHandler(
			() => {
				if (kind === 'sync') throw error;
				return Promise.reject(error);
			},
			{ logger }
		)(request, response);
		await Promise.resolve();
		expect(logger.log).toHaveBeenCalled();
		expect(response.statusCode).toBe(500);
		expect(response.end).toHaveBeenCalledWith('{"error":"internal_error"}');
		expect(request.listenerCount('aborted')).toBe(0);
	}
);
