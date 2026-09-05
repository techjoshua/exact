import { type Component } from '@exactjs/core';
import { createExactFrameworkFixtureArtifact } from '@exactjs/core/testing';
import '@exactjs/core/runtime/contexts';
import { createComponentInstance } from '@exactjs/core/runtime/render';
import { describe, expect, it } from 'vitest';
import {
	commitRequestResponseState,
	createRequestContextValue,
	createRequestScope,
	getRequestContext,
	RequestContext,
	RequestProvider,
	runWithRequestContext
} from './index.js';
import { createNodeRequestScope } from './node.js';

createExactFrameworkFixtureArtifact(RequestProvider, '@exactjs/request:test:provider');

const request = (path: string) =>
	createRequestContextValue({
		url: `https://example.test/${path}`
	});

describe('request context', () => {
	it('restores nested values', () => {
		const scope = createNodeRequestScope();
		const outer = request('outer');
		const inner = request('inner');
		scope.run(outer, () => {
			expect(getRequestContext(scope)?.url.pathname).toBe('/outer');
			scope.run(inner, () => expect(getRequestContext(scope)?.url.pathname).toBe('/inner'));
			expect(getRequestContext(scope)?.url.pathname).toBe('/outer');
		});
		expect(getRequestContext(scope)).toBeUndefined();
	});

	it('keeps concurrent Node scopes isolated', async () => {
		const scope = createNodeRequestScope();
		const read = (path: string) =>
			scope.run(request(path), async () => {
				await Promise.resolve();
				return getRequestContext(scope)?.url.pathname;
			});
		expect(await Promise.all([read('a'), read('b')])).toEqual(['/a', '/b']);
	});

	it('supports the default synchronous scope', () => {
		runWithRequestContext(request('default'), () => {
			expect(getRequestContext()?.url.pathname).toBe('/default');
		});
	});

	it('rejects unsafe asynchronous use of the synchronous default', () => {
		expect(() =>
			runWithRequestContext(request('async'), async () => {
				await Promise.resolve();
			})
		).toThrow('configure async-safe storage');
	});

	it('creates isolated portable scopes without requiring storage plumbing', () => {
		const first = createRequestScope();
		const second = createRequestScope();
		first.run(request('first'), () => {
			expect(first.current()?.url.pathname).toBe('/first');
			expect(second.current()).toBeUndefined();
		});
	});

	it('publishes explicit request values through the component context', () => {
		const value = request('component');
		const provider = createComponentInstance(RequestProvider, { value });
		function Consumer(this: Component<{}>) {
			return () => null;
		}
		createExactFrameworkFixtureArtifact(Consumer, '@exactjs/request:test:consumer');
		const consumer = createComponentInstance(Consumer, {}, provider);
		expect(consumer.getContext(RequestContext).url.pathname).toBe('/component');
	});

	it('normalizes request data and records response controls', () => {
		const response: import('./index.js').RequestResponseState = {
			headers: new Headers(),
			committed: false
		};
		const value = createRequestContextValue(
			{
				url: '/orders?open=1',
				method: 'post',
				headers: { 'x-trace-id': 'trace-1' },
				locale: 'en-US',
				traceId: 'trace-1'
			},
			response
		);

		value.setStatus(201);
		value.setHeader('x-result', 'created');
		value.redirect('../complete', 303);

		expect(value.url.href).toBe('http://exact.invalid/orders?open=1');
		expect(value.method).toBe('POST');
		expect(value.headers.get('x-trace-id')).toBe('trace-1');
		expect(value.locale).toBe('en-US');
		expect(value.traceId).toBe('trace-1');
		expect(response.status).toBe(303);
		expect(response.redirect?.location.href).toBe('http://exact.invalid/complete');
		expect(response.headers.get('location')).toBe('../complete');
		expect(response.headers.get('x-result')).toBe('created');
	});

	it('freezes response controls at commit and validates redirects', () => {
		const response: import('./index.js').RequestResponseState = {
			headers: new Headers(),
			committed: false
		};
		const value = createRequestContextValue(
			{
				url: 'https://example.test/account',
				publicOrigin: 'https://example.test'
			},
			response
		);

		expect(() => value.redirect('/login', 200)).toThrow('Invalid HTTP redirect status');
		value.redirect('/login', 307);
		const committed = commitRequestResponseState(response);

		expect(committed.status).toBe(307);
		expect(committed.headers.get('location')).toBe('/login');
		expect(() => value.setStatus(204)).toThrow('after its status and headers are committed');
		expect(() => value.setHeader('x-late', 'no')).toThrow(
			'after its status and headers are committed'
		);
	});

	it('uses only an explicit public origin for relative adapter URLs', () => {
		const value = createRequestContextValue({
			url: '/orders',
			publicOrigin: 'https://shop.example.test',
			headers: {
				host: 'attacker.example',
				'x-forwarded-proto': 'javascript'
			}
		});
		expect(value.url.href).toBe('https://shop.example.test/orders');
		expect(value.publicOrigin?.href).toBe('https://shop.example.test/');
	});

	it('rejects malformed public origins and never adopts an absolute request authority', () => {
		expect(() =>
			createRequestContextValue({
				url: 'https://attacker.example/orders',
				publicOrigin: 'https://shop.example.test/base'
			})
		).toThrow(/publicOrigin/);

		const value = createRequestContextValue({
			url: 'https://attacker.example/orders?open=1',
			headers: { host: 'also-attacker.example', 'x-forwarded-proto': 'https' }
		});
		expect(value.url.href).toBe('http://exact.invalid/orders?open=1');
	});

	it('makes server-owned root contexts visible without changing component lifetime', () => {
		const value = request('ambient');
		function Consumer(this: Component<{}>) {
			expect(this.getContext(RequestContext)).toBe(value);
			return () => null;
		}
		createExactFrameworkFixtureArtifact(Consumer, '@exactjs/request:test:ambient-consumer');
		const consumer = createComponentInstance(
			Consumer,
			{},
			undefined,
			new Map([[RequestContext.id, value]])
		);
		expect(consumer.contexts.has(RequestContext.id)).toBe(false);
	});
});
