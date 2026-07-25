/**
 * @vitest-environment jsdom
 */
import {
	composeExactComponentContracts,
	createVNode,
	withComponentDomain,
	type ComponentFunction
} from '@exactjs/core';
import { render } from '@exactjs/dom';
import { createExactClient, type FetchLike } from '@exactjs/hydrate';
import {
	composeExactExecutorContract,
	handleExactRequest,
	type ExactInvocationRequest,
	type ExactServerContext
} from '@exactjs/server';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextEncoder as NodeTextEncoder } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { compileFileArtifacts } from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';

describe('@exactjs/compiler distributed continuation loopback', () => {
	it('advances a compiled server task and commits its result to the live client instance', async () => {
		const root = await createTestWorkspace('.exact-continuation-loopback-', process.cwd());
		const sourceRoot = path.join(root, 'src');
		const generatedRoot = path.join(root, 'generated');
		const source = path.join(sourceRoot, 'search.tsx');
		await mkdir(sourceRoot, { recursive: true });
		await writeFile(
			source,
			`
				export function Search(this: Component<{ query: string; result: string }>) {
					this.state.query = "first";
					this.state.result = "waiting";

					this.task.server(async () => {
						const query = this.state.query;
						await Promise.resolve();
						this.state.result = query.toUpperCase();
					});

					return () => (
						<label>
							Query
							<button
								type="button"
								onClick={() => {
									this.state.query = "second";
								}}
							>
								Change
							</button>
							<output>{this.state.result}</output>
						</label>
					);
				}
			`
		);
		const compiled = await compileFileArtifacts(source, {
			outDir: generatedRoot,
			rootDir: sourceRoot
		});
		const clientModule = await importArtifact(compiled.clientFile, path.join(root, 'client.mjs'));
		const serverModule = await importArtifact(compiled.serverFile, path.join(root, 'server.mjs'));
		const ClientSearch = componentExport(clientModule, 'Search');
		const ServerSearch = componentExport(serverModule, 'Search');
		const clientContracts = composeExactComponentContracts([ClientSearch], 'client');
		const serverContract = composeExactExecutorContract([ServerSearch], {
			endpoint: '/__exact'
		});
		const requests: ExactInvocationRequest[] = [];
		const server: ExactServerContext = {
			contract: serverContract,
			actions: {}
		};
		const container = document.createElement('main');
		const client = createExactClient(container, {
			endpoint: '/__exact',
			batch: false,
			continuations: clientContracts.continuations,
			fetch: loopbackFetch(server, requests)
		});

		render(
			withComponentDomain(client.domain, () => createVNode(ClientSearch, {})),
			container
		);
		await client.whenSettled();

		expect(container.querySelector('output')?.textContent).toBe('FIRST');
		expect(requests).toHaveLength(1);
		expect(requests[0]).toMatchObject({
			type: 'action',
			root: 'page',
			payload: { dependencies: ['first'] },
			state: { query: 'first' }
		});

		container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await vi.waitFor(() => expect(requests).toHaveLength(2));
		await client.whenSettled();

		expect(container.querySelector('output')?.textContent).toBe('SECOND');
		expect(requests[1]).toMatchObject({
			type: 'action',
			root: 'page',
			payload: { dependencies: ['second'] },
			state: { query: 'second' }
		});
		client.dispose();
	});
});

/** Bundles one generated target while retaining the workspace runtime as shared package imports. */
async function importArtifact(entry: string, output: string): Promise<Record<string, unknown>> {
	const previousTextEncoder = globalThis.TextEncoder;
	const previousUint8Array = globalThis.Uint8Array;
	globalThis.TextEncoder = NodeTextEncoder;
	globalThis.Uint8Array = new NodeTextEncoder().encode('').constructor as Uint8ArrayConstructor;
	const { build } = await import('esbuild');
	try {
		await build({
			stdin: {
				contents: await readFile(entry, 'utf8'),
				loader: 'ts',
				resolveDir: path.dirname(entry),
				sourcefile: path.basename(entry)
			},
			outfile: output,
			bundle: true,
			format: 'esm',
			platform: 'node',
			target: 'node22',
			packages: 'external',
			external: ['@exactjs/*']
		});
	} finally {
		globalThis.TextEncoder = previousTextEncoder;
		globalThis.Uint8Array = previousUint8Array;
	}
	return import(pathToFileURL(output).href);
}

/** Reads one expected generated component export without coupling to its private descriptor. */
function componentExport(
	module: Record<string, unknown>,
	name: string
): ComponentFunction<any, any> {
	const component = module[name];
	if (typeof component !== 'function')
		throw new Error(`Missing generated component export ${name}`);
	return component as ComponentFunction<any, any>;
}

/** Adapts the browser transport directly to the runtime-neutral server request handler. */
function loopbackFetch(server: ExactServerContext, requests: ExactInvocationRequest[]): FetchLike {
	return async (input, init) => {
		const body = JSON.parse(init.body) as ExactInvocationRequest;
		requests.push(body);
		const response = await handleExactRequest(
			{
				method: init.method,
				url: input,
				headers: init.headers,
				body,
				signal: init.signal
			},
			server
		);
		return {
			ok: response.status >= 200 && response.status < 300,
			status: response.status,
			headers: {
				get(name) {
					const expected = name.toLowerCase();
					const entry = Object.entries(response.headers).find(
						([key]) => key.toLowerCase() === expected
					);
					return entry?.[1] ?? null;
				}
			},
			async json() {
				return JSON.parse(response.body);
			}
		};
	};
}
