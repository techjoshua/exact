/**
 * @vitest-environment jsdom
 */
import { type AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import '@exactjs/core/runtime/refs';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { render, unmount } from '@exactjs/dom';
import { hydrate, type FetchLike } from '@exactjs/hydrate';
import {
	RemoteComponent as RemoteComponentDefinition,
	registerExactRemoteClientBindings
} from '../../../../plugins/microfrontends/src/client.js';
import {
	composeExactExecutorContract,
	handleExactRequest,
	type ExactInvocationRequest,
	type ExactResponseLike,
	type ExactServerContext
} from '@exactjs/server';
import { renderToHydratableStringAsync } from '@exactjs/ssr';
import { createTestOperation, markTestComponent } from '@exactjs/testing/internal/fixtures';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextEncoder as NodeTextEncoder } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { compileFileArtifacts } from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';

describe('@exactjs/compiler distributed continuation loopback', () => {
	it('resumes compiled SSR work and advances the server task after a client change', async () => {
		const root = await createTestWorkspace('.exact-continuation-loopback-', process.cwd());
		const sourceRoot = path.join(root, 'src');
		const generatedRoot = path.join(root, 'generated');
		const source = path.join(sourceRoot, 'search.tsx');
		await mkdir(sourceRoot, { recursive: true });
		await writeFile(
			source,
			'import { TaskContext } from "@exactjs/core";\n\n\t\t\t\timport { createContext, type Component } from "@exactjs/core";\n\n\t\t\t\tconst StatusContext = createContext<{ message: string }>("status", {\n\t\t\t\t\tkeep: "shared"\n\t\t\t\t});\n\n\t\t\t\tfunction Status(this: Component<{}>) {\n\t\t\t\t\tconst status = this.getContext(StatusContext);\n\t\t\t\t\treturn () => <output data-status>{status.message}</output>;\n\t\t\t\t}\n\n\t\t\t\texport function Search(this: Component<{ query: string; result: string }>) {\n\t\t\t\t\tthis.state.query = "first";\n\t\t\t\t\tthis.state.result = "waiting";\n\n\t\t\t\t\tconst runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n\t\t\t\t\t\tconst query = this.state.query;\n\t\t\t\t\t\tawait Promise.resolve();\n\t\t\t\t\t\tconst result = query.toUpperCase();\n\t\t\t\t\t\tthis.state.result = result;\n\t\t\t\t\t\tthis.setContext(StatusContext, { message: result });\n\t\t\t\t\t};\nrunFixtureTask();\n\n\t\t\t\t\treturn () => (\n\t\t\t\t\t\t<label>\n\t\t\t\t\t\t\tQuery\n\t\t\t\t\t\t\t<button\n\t\t\t\t\t\t\t\ttype="button"\n\t\t\t\t\t\t\t\tonClick={() => {\n\t\t\t\t\t\t\t\t\tthis.state.query = "second";\n\t\t\t\t\t\t\t\t}}\n\t\t\t\t\t\t\t>\n\t\t\t\t\t\t\t\tChange\n\t\t\t\t\t\t\t</button>\n\t\t\t\t\t\t\t<output>{this.state.result}</output>\n\t\t\t\t\t\t\t<Status />\n\t\t\t\t\t\t</label>\n\t\t\t\t\t);\n\t\t\t\t}\n\t\t\t'
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
			invocations: {}
		};
		const rendered = await renderToHydratableStringAsync(
			createCompiledComponentReceipt(ServerSearch, {}),
			{
				endpoint: '/__exact',
				continuations: clientContracts.continuations,
				buildKey: 'loopback-build'
			}
		);
		expect(rendered.html).toContain('FIRST');
		expect(rendered.resumptions).toEqual([
			expect.objectContaining({
				values: expect.objectContaining({ query: 'first', result: 'FIRST' }),
				contexts: { StatusContext: { message: 'FIRST' } }
			})
		]);
		const container = document.createElement('main');
		container.innerHTML = rendered.htmlWithHydration;
		const serverOutput = container.querySelector('output');
		const serverStatus = container.querySelector('[data-status]');
		const client = hydrate(createCompiledComponentReceipt(ClientSearch, {}), container, {
			endpoint: '/__exact',
			buildKey: 'loopback-build',
			batch: false,
			continuations: clientContracts.continuations,
			fetch: loopbackFetch(server, requests),
			logger: {
				log(event) {
					if (event.error !== undefined) throw event.error;
				}
			},
			onErrorReport(report) {
				throw report.error;
			}
		});
		await client.whenSettled();

		expect(container.innerHTML).toContain('FIRST');
		expect(container.querySelector('output')?.textContent).toBe('FIRST');
		expect(container.querySelector('output')).toBe(serverOutput);
		expect(container.querySelector('[data-status]')).toBe(serverStatus);
		expect(serverStatus?.textContent).toBe('FIRST');
		expect(requests).toHaveLength(0);

		container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await vi.waitFor(() => expect(requests).toHaveLength(1));
		await client.whenSettled();

		expect(container.querySelector('output')?.textContent).toBe('SECOND');
		expect(container.querySelector('[data-status]')?.textContent).toBe('SECOND');
		expect(requests[0]).toMatchObject({
			type: 'invoke',
			root: 'page',
			payload: { dependencies: ['second'] },
			state: { query: 'second' }
		});
		client.dispose();
	});

	it('routes compiled server tasks through the client owned by each hidden root', async () => {
		const root = await createTestWorkspace('.exact-hidden-root-loopback-', process.cwd());
		const billing = await compileRemoteTask(root, 'billing');
		const branding = await compileRemoteTask(root, 'branding');
		const buildKey = '0123456789abcdef0123456789abcdef01234567';
		const moduleHost = globalThis as Record<string, unknown>;
		const bindings = Object.fromEntries(
			[billing, branding].map((fixture) => {
				const key = `__exactHiddenRoot${fixture.name}`;
				moduleHost[key] = Object.freeze({
					buildKey,
					root: fixture.root,
					component: fixture.client,
					registration: fixture.registration
				});
				const source = `export default globalThis[${JSON.stringify(key)}];`;
				return [
					fixture.name,
					{
						clientEntry: `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
					}
				];
			})
		);
		registerExactRemoteClientBindings(bindings);
		const exchanges: Array<{
			body: ExactInvocationRequest;
			binding: string | null;
			build: string | null;
			signal: AbortSignal | undefined;
		}> = [];
		const servers = new Map([
			[billing.root, remoteServer(billing, buildKey)],
			[branding.root, remoteServer(branding, buildKey)]
		]);
		let holdResponsesUntilAbort = false;
		const fetch: FetchLike = async (input, init) => {
			const body = JSON.parse(init.body) as ExactInvocationRequest;
			const headers = new Headers(init.headers);
			exchanges.push({
				body,
				binding: headers.get('x-exact-binding'),
				build: headers.get('x-exact-build'),
				signal: init.signal
			});
			const server = servers.get(String(body.root));
			if (!server) throw new Error(`Unexpected hidden execution root ${String(body.root)}`);
			const privateHeaders = new Headers(init.headers);
			privateHeaders.delete('x-exact-binding');
			const response = await handleExactRequest(
				{
					method: init.method,
					url: input,
					headers: privateHeaders,
					body,
					signal: init.signal
				},
				server
			);
			const signal = init.signal;
			if (holdResponsesUntilAbort && signal && !signal.aborted)
				await new Promise<void>((resolve) =>
					signal.addEventListener('abort', () => resolve(), { once: true })
				);
			return responseLike(response);
		};
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetch as typeof globalThis.fetch;
		const container = document.createElement('main');
		const billingContainer = document.createElement('div');
		const brandingContainer = document.createElement('div');
		container.append(billingContainer, brandingContainer);
		document.body.append(container);
		const mountHiddenRoots = () => {
			render(
				createTestOperation(RemoteComponent, {
					binding: 'billing',
					props: { name: 'billing' }
				}),
				billingContainer
			);
			render(
				createTestOperation(RemoteComponent, {
					binding: 'branding',
					props: { name: 'branding' }
				}),
				brandingContainer
			);
		};
		const unmountHiddenRoots = () => {
			unmount(billingContainer);
			unmount(brandingContainer);
		};
		try {
			mountHiddenRoots();
			await vi.waitFor(() => {
				expect(
					container.querySelector('[data-result="billing"]')?.textContent,
					container.innerHTML
				).toBe('BILLING-READY');
				expect(container.querySelector('[data-result="branding"]')?.textContent).toBe(
					'BRANDING-READY'
				);
			});
			exchanges.length = 0;

			click(container, '[data-task="billing"]');
			click(container, '[data-task="branding"]');
			await vi.waitFor(() => {
				expect(container.querySelector('[data-result="billing"]')?.textContent).toBe(
					'BILLING-NEXT'
				);
				expect(container.querySelector('[data-result="branding"]')?.textContent).toBe(
					'BRANDING-NEXT'
				);
			});
			expect(
				exchanges.map(({ body, binding, build }) => ({
					root: body.root,
					binding,
					build
				}))
			).toEqual(
				expect.arrayContaining([
					{ root: billing.root, binding: 'billing', build: buildKey },
					{ root: branding.root, binding: 'branding', build: buildKey }
				])
			);
			// Exercise disposal while the requests are still owned. Settled task frames deliberately
			// release their controllers so completed requests do not remain retained until unmount.
			unmountHiddenRoots();
			holdResponsesUntilAbort = true;
			exchanges.length = 0;
			mountHiddenRoots();
			await vi.waitFor(() => expect(exchanges).toHaveLength(2));
			const signals = exchanges.map((exchange) => exchange.signal);
			unmountHiddenRoots();
			expect(signals.every((signal) => signal?.aborted)).toBe(true);
		} finally {
			globalThis.fetch = originalFetch;
			unmountHiddenRoots();
			container.remove();
			delete moduleHost.__exactHiddenRootbilling;
			delete moduleHost.__exactHiddenRootbranding;
		}
	});
});

const RemoteComponent = markTestComponent(RemoteComponentDefinition);

async function compileRemoteTask(root: string, name: string) {
	const sourceRoot = path.join(root, name, 'src');
	const generatedRoot = path.join(root, name, 'generated');
	const source = path.join(sourceRoot, 'RemoteTask.tsx');
	await mkdir(sourceRoot, { recursive: true });
	await writeFile(
		source,
		'import { TaskContext } from "@exactjs/core";\n\n\t\t\timport type { Component } from "@exactjs/core";\n\t\t\texport function RemoteTask(\n\t\t\t\tthis: Component<{ query: string; result: string }>,\n\t\t\t\tprops: { name: string }\n\t\t\t) {\n\t\t\t\tthis.state.query = props.name + "-ready";\n\t\t\t\tthis.state.result = "waiting";\n\t\t\t\tconst runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n\t\t\t\t\tconst query = this.state.query;\n\t\t\t\t\tawait Promise.resolve();\n\t\t\t\t\tthis.state.result = query.toUpperCase();\n\t\t\t\t};\nrunFixtureTask();\n\t\t\t\treturn () => (\n\t\t\t\t\t<section>\n\t\t\t\t\t\t<button\n\t\t\t\t\t\t\tdata-task={props.name}\n\t\t\t\t\t\t\tonClick={() => this.state.query = props.name + "-next"}\n\t\t\t\t\t\t>\n\t\t\t\t\t\t\tRun\n\t\t\t\t\t\t</button>\n\t\t\t\t\t\t<output data-result={props.name}>{this.state.result}</output>\n\t\t\t\t\t</section>\n\t\t\t\t);\n\t\t\t}\n\t\t'
	);
	const compiled = await compileFileArtifacts(source, {
		outDir: generatedRoot,
		rootDir: sourceRoot
	});
	const clientModule = await importArtifact(
		compiled.clientFile,
		path.join(root, name, 'client.mjs')
	);
	const serverModule = await importArtifact(
		compiled.serverFile,
		path.join(root, name, 'server.mjs')
	);
	const client = componentExport(clientModule, 'RemoteTask');
	const server = componentExport(serverModule, 'RemoteTask');
	const clientContract = composeExactComponentContracts([client], 'client');
	const serverContract = composeExactExecutorContract([server], { endpoint: '/__exact' });
	return {
		name,
		root: `@exactjs/hidden-${name}#./RemoteTask`,
		client,
		registration: { continuations: clientContract.continuations },
		serverContract
	};
}

function remoteServer(
	fixture: Awaited<ReturnType<typeof compileRemoteTask>>,
	buildKey: string
): ExactServerContext {
	return {
		contract: { version: 1, invocations: {}, boundaries: {} },
		remoteBuilds: {
			[buildKey]: {
				buildKey,
				roots: {
					[fixture.root]: {
						contract: fixture.serverContract,
						invocations: {}
					}
				}
			}
		},
		authorize: () => true
	};
}

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
function componentExport(module: Record<string, unknown>, name: string): AnyComponentFunction {
	const component = module[name];
	if (typeof component !== 'function')
		throw new Error(`Missing generated component export ${name}`);
	return component as AnyComponentFunction;
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
		return responseLike(response);
	};
}

function responseLike(response: ExactResponseLike): Awaited<ReturnType<FetchLike>> {
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
}

function click(container: Element, selector: string): void {
	const element = container.querySelector(selector);
	if (!(element instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
	element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}
