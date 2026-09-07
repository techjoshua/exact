import { createContext } from '@exactjs/core';
import { RequestContext } from '@exactjs/request';
import { describe, expect, it } from 'vitest';
import { createExactContextRuntime } from './index.js';
const ApplicationValue = createContext<{ prefix: string }>('value-disposal.application', {
	global: true,
	reactive: false,
	scope: 'application'
});
const RequestValue = createContext<string>('value-disposal.request', {
	global: true,
	reactive: false,
	scope: 'request'
});
const request = (path: string) => ({
	method: 'GET',
	url: 'http://example.test/' + path,
	headers: {}
});
describe('value-only context disposal', () => {
	it.each([false, true])(
		'closes a scope without owned factories (plain registration: %s)',
		async (registered) => {
			const runtime = createExactContextRuntime({
				applicationContexts: [[ApplicationValue, { value: { prefix: 'shared' } }]],
				requestContexts: registered ? [[RequestValue, { value: 'local' }]] : []
			});
			try {
				const opened = await runtime.open(request('plain'));
				expect(opened.context.getSync(RequestContext)).toBe(opened.request);
				if (registered) expect(opened.context.getSync(RequestValue)).toBe('local');
				await opened.dispose('complete');
				await opened.dispose('again');
				expect(opened.request.signal.aborted).toBe(true);
				expect(opened.request.signal.reason).toBe('complete');
				await expect(opened.context.get(RequestContext)).rejects.toThrow('disposed request');
				expect(() => opened.context.getSync(RequestContext)).toThrow('has not been initialized');
				const next = await runtime.open(request('next'));
				try {
					expect(next.context.getSync(ApplicationValue).prefix).toBe('shared');
				} finally {
					await next.dispose();
				}
			} finally {
				await runtime.dispose();
			}
		}
	);
});
