/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { createExactClient } from './index.js';
import { applyPatches } from './patches.js';
import { ndjsonResponse, noopLogger, testContinuation } from './test-support/responses.js';

describe('@exactjs/hydrate patch-application', () => {
	it('applies text patches to exact marker ranges', () => {
		const container = document.createElement('div');
		container.innerHTML = '<!--exact:title-->Old<!--/exact:title-->';

		expect(applyPatches(container, [{ type: 'text', id: 'title', value: 'New' }])).toBe(true);

		expect(container.textContent).toBe('New');
	});

	it('applies text and replacement patches to server child slots', () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<span data-exact-server-slot="slot-1" style="display: contents;"><p>Old</p></span>';

		applyPatches(container, [{ type: 'text', id: 'slot-1', value: 'Plain' }]);
		expect(container.querySelector('[data-exact-server-slot="slot-1"]')?.textContent).toBe('Plain');

		applyPatches(container, [{ type: 'replace', id: 'slot-1', html: '<strong>Rich</strong>' }]);
		expect(container.querySelector('[data-exact-server-slot="slot-1"] strong')?.textContent).toBe(
			'Rich'
		);
	});

	it('applies replacement patches to exact marker ranges', () => {
		const container = document.createElement('div');
		container.innerHTML = '<!--exact:panel--><p>Old</p><!--/exact:panel-->';

		applyPatches(container, [{ type: 'replace', id: 'panel', html: '<section>New</section>' }]);

		expect(container.innerHTML).toBe('<!--exact:panel--><section>New</section><!--/exact:panel-->');
	});

	it('applies replacement patches to exact id elements', () => {
		const container = document.createElement('div');
		container.innerHTML = '<section data-exact-id="panel"><p>Old</p></section>';

		applyPatches(container, [
			{
				type: 'replace',
				id: 'panel',
				html: '<section data-exact-id="panel"><strong>New</strong></section>'
			}
		]);

		expect(container.querySelector('[data-exact-id="panel"] strong')?.textContent).toBe('New');
	});

	it('applies prop and style patches to exact id elements', () => {
		const container = document.createElement('div');
		container.innerHTML = '<button data-exact-id="save">Save</button>';

		applyPatches(container, [
			{ type: 'prop', id: 'save', name: 'disabled', value: true },
			{ type: 'style', id: 'save', name: 'color', value: 'red' }
		]);

		const button = container.querySelector('button')!;
		expect(button.hasAttribute('disabled')).toBe(true);
		expect(button.getAttribute('style')).toContain('color: red');
	});

	it('applies prop patches to the first element in an exact marker range', () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<!--exact:panel--><p class="old" hidden="true">Loading</p><!--/exact:panel-->';

		applyPatches(container, [
			{ type: 'prop', id: 'panel', name: 'class', value: 'new' },
			{ type: 'prop', id: 'panel', name: 'hidden', value: null },
			{ type: 'text', id: 'panel', value: 'Ready' }
		]);

		const paragraph = container.querySelector('p')!;
		expect(paragraph.getAttribute('class')).toBe('new');
		expect(paragraph.hasAttribute('hidden')).toBe(false);
		expect(paragraph.textContent).toBe('Ready');
	});

	it('applies keyed list insert, move, and remove patches', () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<ul><!--exact:list--><!--exact:item:1:a--><li>A</li><!--/exact:item:1:a--><!--exact:item:2:b--><li>B</li><!--/exact:item:2:b--><!--/exact:list--></ul>';

		applyPatches(container, [
			{
				type: 'list',
				id: 'list',
				op: 'insert',
				key: 'c',
				before: 'b',
				html: '<!--exact:item:3:c--><li>C</li><!--/exact:item:3:c-->'
			},
			{ type: 'list', id: 'list', op: 'move', key: 'a', before: 'c' },
			{ type: 'list', id: 'list', op: 'remove', key: 'b' }
		]);

		expect(Array.from(container.querySelectorAll('li')).map((item) => item.textContent)).toEqual([
			'A',
			'C'
		]);
	});

	it('rejects list HTML whose declared marker does not match the patch key', () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<ul><!--exact:list--><!--exact:item:1:a--><li>A</li><!--/exact:item:1:a--><!--/exact:list--></ul>';
		const before = container.innerHTML;

		expect(
			applyPatches(
				container,
				[
					{
						type: 'list',
						id: 'list',
						op: 'insert',
						key: 'b',
						html: '<!--exact:item:2:c--><li>C</li><!--/exact:item:2:c-->'
					}
				],
				{ logger: noopLogger }
			)
		).toBe(false);
		expect(container.innerHTML).toBe(before);
	});

	it('rejects nested list-item markers that the direct list index cannot own', () => {
		const container = document.createElement('div');
		container.innerHTML = '<ul><!--exact:list--><!--/exact:list--></ul>';
		const before = container.innerHTML;

		expect(
			applyPatches(
				container,
				[
					{
						type: 'list',
						id: 'list',
						op: 'insert',
						key: 'a',
						html: '<div><!--exact:item:1:a--><li>A</li><!--/exact:item:1:a--></div>'
					}
				],
				{ logger: noopLogger }
			)
		).toBe(false);
		expect(container.innerHTML).toBe(before);
	});

	it('rejects DOM outside the keyed range while allowing nested protocol boundaries', () => {
		const invalid = document.createElement('div');
		invalid.innerHTML = '<ul><!--exact:list--><!--/exact:list--></ul>';
		expect(
			applyPatches(
				invalid,
				[
					{
						type: 'list',
						id: 'list',
						op: 'insert',
						key: 'a',
						html: 'stray<!--exact:item:1:a--><li>A</li><!--/exact:item:1:a-->'
					}
				],
				{ logger: noopLogger }
			)
		).toBe(false);
		expect(invalid.textContent).toBe('');

		const nested = document.createElement('div');
		nested.innerHTML = '<ul><!--exact:list--><!--/exact:list--></ul>';
		expect(
			applyPatches(nested, [
				{
					type: 'list',
					id: 'list',
					op: 'insert',
					key: 'a',
					html: ' <!--exact:item:1:a--><!--exact:detail--><li>A</li><!--/exact:detail--><!--/exact:item:1:a--> '
				}
			])
		).toBe(true);
		expect(nested.querySelector('li')?.textContent).toBe('A');
	});

	it('tracks a recovered missing move through later patches in the same batch', () => {
		const container = document.createElement('div');
		container.innerHTML = '<ul><!--exact:list--><!--/exact:list--></ul>';

		expect(
			applyPatches(container, [
				{
					type: 'list',
					id: 'list',
					op: 'move',
					key: 'a',
					html: '<!--exact:item:1:a--><li>A</li><!--/exact:item:1:a-->'
				},
				{ type: 'list', id: 'list', op: 'remove', key: 'a' }
			])
		).toBe(true);
		expect(container.querySelectorAll('li')).toHaveLength(0);
	});

	it('throws on patch mismatch in strict mode', () => {
		const container = document.createElement('div');

		expect(() =>
			applyPatches(container, [{ type: 'text', id: 'missing', value: 'x' }], {
				onMismatch: 'throw',
				logger: noopLogger
			})
		).toThrow('Could not apply exact patch');
	});

	it('invokes the configured endpoint and applies returned patches', async () => {
		const container = document.createElement('div');
		container.innerHTML = '<!--exact:title-->Old<!--/exact:title-->';
		const requests: unknown[] = [];
		const fetch = async (_input: string, init: { body: string }) => {
			requests.push(JSON.parse(init.body));
			return {
				ok: true,
				status: 200,
				async json() {
					return {
						ok: true,
						type: 'invoke',
						id: 'save-title',
						state: { saved: true },
						patches: [{ type: 'text', id: 'title', value: 'New' }]
					};
				}
			};
		};

		const client = createExactClient(container, {
			endpoint: '/__exact',
			state: { saved: false },
			continuations: {
				'save-title': testContinuation('save-title', { boundaries: ['title'] })
			},
			fetch
		});
		await client.invokeTask('save-title', { title: 'New' });

		expect(requests).toEqual([
			{
				type: 'invoke',
				root: 'page',
				id: 'save-title',
				payload: { title: 'New' },
				state: { saved: false },
				boundaryHtmls: { title: 'Old' }
			}
		]);
		expect(container.textContent).toBe('New');
		expect(client.state).toEqual({ saved: true });
	});

	it('invokes streaming endpoints and applies returned patches', async () => {
		const container = document.createElement('div');
		container.innerHTML = '<!--exact:title-->Old<!--/exact:title-->';
		let requestHeaders: Record<string, string> | undefined;

		const client = createExactClient(container, {
			endpoint: '/__exact',
			state: { saved: false },
			continuations: {
				'save-title': testContinuation('save-title', { boundaries: ['title'] })
			},
			stream: true,
			fetch: async (_input, init) => {
				requestHeaders = init.headers;
				return {
					ok: true,
					status: 200,
					body: ndjsonResponse([
						{ event: 'start', version: 1, operations: 1 },
						{
							event: 'patch',
							version: 1,
							index: 0,
							type: 'invoke',
							id: 'save-title',
							patch: { type: 'text', id: 'title', value: 'Streamed' }
						},
						{
							event: 'state',
							version: 1,
							index: 0,
							type: 'invoke',
							id: 'save-title',
							value: { saved: true }
						},
						{
							event: 'result',
							version: 1,
							index: 0,
							result: { ok: true, type: 'invoke', id: 'save-title' }
						},
						{ event: 'complete', version: 1 }
					]),
					async json() {
						throw new Error('json should not be read for streaming responses');
					}
				};
			}
		});

		await client.invokeTask('save-title', { title: 'Streamed' });

		expect(requestHeaders?.accept).toBe('application/x-ndjson');
		expect(container.textContent).toBe('Streamed');
		expect(client.state).toEqual({ saved: true });
	});
});
