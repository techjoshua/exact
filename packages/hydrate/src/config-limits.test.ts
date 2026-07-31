/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { createExactClient, hydrate, readExactHydrationConfig } from './index.js';
import { createVNode } from './test-support/native-vnode.js';

describe('bounded hydration bootstrap and adoption', () => {
	it('merges serialized server continuations with client component continuations', () => {
		const container = document.createElement('main');
		const continuation = (id: string) => ({
			id,
			componentId: `component:${id}`,
			readiness: 'nonblocking' as const,
			dependencies: [],
			stateReads: [],
			stateWrites: [],
			publicContexts: [],
			serverContexts: [],
			contextWrites: [],
			boundaries: []
		});
		container.innerHTML = `<script type="application/json" id="__exact_hydration">${JSON.stringify({
			endpoint: '/__exact',
			continuations: { server: continuation('server') }
		})}</script>`;

		const client = createExactClient(container, {
			continuations: { client: continuation('client') }
		});

		expect(Object.keys(client.continuations ?? {})).toEqual(['server', 'client']);
		client.dispose();
	});

	it('rejects bootstrap data before parsing when it exceeds the byte budget', () => {
		const root = document.createElement('main');
		root.innerHTML = `<script type="application/json" id="__exact_hydration">${JSON.stringify({ state: { text: 'x'.repeat(100) } })}</script>`;
		expect(readExactHydrationConfig(root, '__exact_hydration', { maxBytes: 32 })).toEqual({});
	});

	it('rejects unknown protocol fields and over-deep bootstrap graphs', () => {
		const unknown = document.createElement('main');
		unknown.innerHTML =
			'<script id="__exact_hydration">{"endpoint":"/__exact","surprise":true}</script>';
		expect(readExactHydrationConfig(unknown)).toEqual({});

		const deep = document.createElement('main');
		deep.innerHTML =
			'<script id="__exact_hydration">{"state":{"one":{"two":{"three":true}}}}</script>';
		expect(readExactHydrationConfig(deep, '__exact_hydration', { maxDepth: 2 })).toEqual({});
	});

	it('passes the DOM work budget through hydration fallback rendering', () => {
		const container = document.createElement('div');
		const vnode = createVNode(
			'main',
			null,
			...Array.from({ length: 20 }, (_, index) => createVNode('span', null, String(index)))
		);
		expect(() => hydrate(vnode, container, { maxTreeNodes: 8 })).toThrow(
			'eXact DOM traversal exceeds the configured maximum of 8 nodes'
		);
		expect(container.childNodes).toHaveLength(0);
	});
});
