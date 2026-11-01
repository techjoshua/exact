/** @vitest-environment jsdom */
import { repositoryPath } from './workspace.js';
import { beforeAll, afterAll, onTestFinished } from 'vitest';
import path from 'node:path';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { compileProjectArtifacts } from '../index.js';
import { createCompilerSession } from '../expression/session.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import {
	composeExactComponentContracts,
	type AnyExactComponentCallable
} from '@exactjs/core/framework/component-contracts';
import {
	composeExactExecutorContract,
	handleExactRequest,
	exactResponseToFetchResponse
} from '@exactjs/server';
import { dispatchExactOperation } from '../../../server/src/operations.js';
import { parseExactRequestBody, jsonResponse } from '../../../server/src/protocol.js';
import { renderToHydratableString } from '@exactjs/ssr';
import { hydrate } from '@exactjs/hydrate';
import { findElementOwner } from '@exactjs/dom/testing';
import { flushSync, unwrap } from '@exactjs/reactive';
/** Normal generated modules shared by the owned Array runtime and root-registration journeys. */
export const modules = new Map<
	string,
	{
		client: Record<string, unknown>;
		server: Record<string, unknown>;
		override?: unknown;
	}
>();
const fixtureKinds = [
	'completion',
	'ordering',
	'child',
	'member-only',
	'scalar',
	'ancestor',
	'duplicates',
	'unions'
];
let root: string | undefined;
afterAll(async () => {
	if (root) await rm(root, { recursive: true, force: true });
});
beforeAll(async () => {
	root = await mkdtemp(path.join(process.cwd(), '.exact-array-completion-'));
	const fixture = repositoryPath(
		'packages/component-composition-corpus/test-support/array-completions'
	);
	for (const kind of fixtureKinds) {
		await mkdir(path.join(root, kind), { recursive: true });
		for (const name of ['page.tsx', 'helper.ts'])
			await writeFile(
				path.join(root, kind, name),
				await readFile(path.join(fixture, kind, name), 'utf8')
			);
	}
	await writeFile(
		path.join(root, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				target: 'ES2022',
				module: 'ESNext',
				moduleResolution: 'bundler',
				jsx: 'preserve',
				jsxImportSource: '@exactjs/jsx',
				strict: true,
				skipLibCheck: true
			},
			include: ['**/*.ts', '**/*.tsx']
		})
	);
	const session = createCompilerSession();
	try {
		const artifacts = await compileProjectArtifacts(
			fixtureKinds.map((kind) => path.join(root!, kind, 'page.tsx')),
			{ rootDir: root, outDir: path.join(root, 'generated'), session }
		);
		for (const kind of fixtureKinds) {
			const artifact = artifacts.find((a) => a.inputFile === path.join(root!, kind, 'page.tsx'))!;
			const client = await importArtifact(artifact.clientFile, path.join(root, kind, 'client.mjs'));
			const server = await importArtifact(artifact.serverFile, path.join(root, kind, 'server.mjs'));
			const helper = artifacts.find((a) => a.inputFile === path.join(root!, kind, 'helper.ts'));
			const override =
				kind === 'completion' && helper
					? (await importArtifact(helper.serverFile, path.join(root, kind, 'helper.mjs')))
							.overriddenPush
					: undefined;
			modules.set(kind, { client, server, override });
		}
	} finally {
		session.dispose();
	}
});
/** Mounts actual normal paired artifacts and owns transport, DOM and task cleanup. */
export async function mounted(
	kind: string,
	mode?: string,
	constraint?: 'partial' | 'override',
	hold?: {
		value: boolean;
		release?: () => void;
	},
	componentName = 'Page'
) {
	const mod = modules.get(kind)!;
	(mod.server.gates as Map<string, () => void> | undefined)?.clear();
	if (Array.isArray(mod.server.cleaned)) mod.server.cleaned.length = 0;
	if (Array.isArray(mod.server.observations)) mod.server.observations.length = 0;
	const Client = mod.client[componentName] as AnyExactComponentCallable,
		Server = mod.server[componentName] as AnyExactComponentCallable;
	const contract = composeExactExecutorContract([Server]),
		registration = composeExactComponentContracts([Client], 'client');
	const rendered = await renderToHydratableString(createCompiledComponentInputReceipt(Server, {}));
	const container = document.createElement('main');
	container.innerHTML = rendered.htmlWithHydration;
	document.body.append(container);
	const requests: unknown[] = [],
		responses: unknown[] = [],
		reports: unknown[] = [],
		operations: unknown[] = [];
	const client = hydrate(createCompiledComponentInputReceipt(Client, {}), container, {
		...registration,
		resumptions: rendered.resumptions,
		endpoint: '/__exact',
		batch: false,
		onMismatch: 'throw',
		onErrorReport: (r) => reports.push(r),
		onOperation: (o) => operations.push(o),
		fetch: async (url, init) => {
			const body = JSON.parse(init.body);
			requests.push(body);
			const request = {
				method: init.method,
				url,
				headers: init.headers,
				body,
				signal: init.signal
			};
			let response;
			if (constraint) {
				const input = parseExactRequestBody(body);
				if (input.type !== 'invoke') throw new Error('Expected actual generated invocation');
				const rows = (
					input.state as {
						rows: unknown[];
					}
				).rows;
				if (constraint === 'partial')
					Object.defineProperty(rows, '1', { writable: false, configurable: true });
				else Object.defineProperty(rows, 'push', { value: mod.override, configurable: true });
				// The method is authored in the generated helper module. Obtain its ordinary export from the bundled page below.
				const result = await dispatchExactOperation(request, input, {
					contract,
					invocations: {},
					signal: init.signal
				});
				response = jsonResponse(result.ok ? 200 : result.status, result);
			} else response = await handleExactRequest(request, { contract, invocations: {} });
			const result = exactResponseToFetchResponse(response);
			responses.push({ status: result.status, body: await result.clone().text() });
			if (hold?.value)
				await new Promise<void>((resolve) => {
					hold.release = resolve;
				});
			return result;
		}
	});
	onTestFinished(() => {
		hold?.release?.();
		for (const resolve of (mod.server.gates as Map<string, () => void> | undefined)?.values() ?? [])
			resolve();
		client.dispose();
		container.remove();
	});
	flushSync();
	const button = container.querySelector('button')!,
		owner = findElementOwner(button)!;
	const state = owner.state;
	const initial = unwrap(state.rows ?? state.values ?? state.group?.rows) as unknown[];
	const initialMembers = initial.map((v) => unwrap(v));
	const output = container.querySelector('output');
	const snapshot = () => ({
		state,
		original: initial,
		originalMembers: initialMembers,
		sameArray: unwrap(state.rows ?? state.values ?? state.group?.rows) === initial,
		sameMembers: (unwrap(state.rows ?? state.values ?? state.group?.rows) as unknown[]).map(
			(v, i) => unwrap(v) === initialMembers[i]
		),
		text: output?.textContent,
		outputSame: container.querySelector('output') === output,
		requests,
		responses,
		reports,
		operations,
		cleaned: mod.server.cleaned
	});
	return {
		mod,
		client,
		container,
		owner,
		state,
		initial,
		initialMembers,
		output,
		requests,
		responses,
		reports,
		operations,
		snapshot,
		click() {
			container
				.querySelector<HTMLButtonElement>(mode ? '[data-mode="' + mode + '"]' : 'button')!
				.click();
		}
	};
}
