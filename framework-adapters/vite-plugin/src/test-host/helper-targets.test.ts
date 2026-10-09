import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { ExactViteTestHelperTargets } from './helper-targets.js';

it.each([undefined, 'client', 'server'] as const)(
	'keeps Vitest transport separate from the configured %s component target',
	(target) => {
		const planner = new ExactViteTestHelperTargets({
			serverExecutionReason: 'server-test',
			target
		});
		const id = '/virtual/View.tsx';
		const source = 'export function View(){return()=> <button>Ready</button>;}';
		expect(planner.transform(source, id, true, {})).toBe(target ?? 'client');
		expect(planner.request(id, true)).toBe(target ?? 'client');
		expect(planner.request('/virtual/Test.test.tsx', true)).toBe(target ?? 'client');
	}
);

it('keeps real SSR requests and explicit paired projections on their owning targets', () => {
	const application = new ExactViteTestHelperTargets({});
	const source = 'export function View(){return()=> <button>Ready</button>;}';
	expect(application.transform(source, '/virtual/View.tsx', true, {})).toBe('server');
	const test = new ExactViteTestHelperTargets({
		serverExecutionReason: 'server-test',
		compileTestModules: true
	});
	expect(test.request('/virtual/View.tsx?exact-target=server', true)).toBe('server');
	expect(test.request('/virtual/View.tsx?exact-target=client', true)).toBe('client');
});

it('retains the target of generated artifacts inside a paired Vitest graph', () => {
	const planner = new ExactViteTestHelperTargets({ serverExecutionReason: 'server-test' });
	expect(planner.request('/fixture/Page.test.ts', true, '@exactjs/ssr')).toBe('server');
	expect(planner.request('/fixture/Page.test.ts', true, '@exactjs/server')).toBe('server');
	expect(planner.request('/fixture/Page.test.ts', true, '@exactjs/dom')).toBe('client');
	for (const extension of ['ts', 'js', 'mts', 'mjs']) {
		expect(planner.request(`/fixture/Page.exact.server.${extension}`, true)).toBe('server');
		expect(planner.transform('', `/fixture/Page.exact.server.${extension}`, true, {})).toBe(
			'server'
		);
		expect(planner.request(`/fixture/Page.exact.client.${extension}`, true)).toBe('client');
	}
});

it('preserves inherited server ownership for relative enhancement facades', async () => {
	const planner = new ExactViteTestHelperTargets({ serverExecutionReason: 'server-test' });
	planner.configure({ createResolver: () => async () => undefined });
	await planner.resolve(
		'./enhancement.mjs',
		'/fixture/Page.exact.server.js',
		'server',
		async () => ({ id: '/fixture/enhancement.mjs' })
	);
	expect(
		planner.transform('export const registration = {};', '/fixture/enhancement.mjs', true, {})
	).toBe('server');
	expect(planner.request('/fixture/enhancement.mjs', true)).toBe('server');
	expect(planner.request('/fixture/unrelated.ts', true)).toBe('client');
});

it('isolates server source projections from the same authored client enhancement', async () => {
	const planner = new ExactViteTestHelperTargets({
		serverExecutionReason: 'server-test',
		compileTestModules: true,
		include: /\.fixtures\.tsx$/
	});
	planner.configure({ createResolver: () => async () => undefined });
	const result = await planner.resolve(
		'./tone.fixtures.js',
		'/fixture/Page.exact.server.js',
		'server',
		async () => ({ id: '/fixture/tone.fixtures.tsx' })
	);
	expect(result?.id).toBe('/fixture/tone.fixtures.tsx?exact-target=server');
	expect(planner.request('/fixture/tone.fixtures.tsx')).toBe('client');
	expect(planner.request(result?.id)).toBe('server');
});

it('separates aliased bundle catalogs while preserving shared task authority', async () => {
	const planner = new ExactViteTestHelperTargets({
		serverExecutionReason: 'server-test',
		compileTestModules: true,
		include: /\.fixtures\.tsx$/
	});
	planner.configure({ createResolver: () => async () => undefined });
	const catalog = '/workspace/packages/core/src/framework/enhancement-catalog.ts';
	expect(
		(
			await planner.resolve(catalog, '/fixture/Page.exact.server.js', 'server', async () => ({
				id: catalog
			}))
		)?.id
	).toBe(catalog + '?exact-target=server');
	const frames = '/workspace/packages/core/src/framework/task-frames.ts';
	expect(
		(
			await planner.resolve(frames, '/fixture/Page.exact.server.js', 'server', async () => ({
				id: frames
			}))
		)?.id
	).toBe(frames);
});

it('projects JSX under default filters while preserving ordinary context identity', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-test-targets-'));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	const component = path.join(root, 'View.tsx');
	const context = path.join(root, 'context.ts');
	await writeFile(component, 'export function View(){return()=> <button>Ready</button>;}');
	await writeFile(context, 'export const token = {};');
	const planner = new ExactViteTestHelperTargets({
		serverExecutionReason: 'server-test',
		compileTestModules: true
	});
	planner.configure({ createResolver: () => async () => undefined });
	expect(
		(await planner.resolve('./View.js', undefined, 'server', async () => ({ id: component })))?.id
	).toBe(component + '?exact-target=server');
	expect(
		(await planner.resolve('./context.js', undefined, 'server', async () => ({ id: context })))?.id
	).toBe(context);
	expect(planner.request(component)).toBe('client');
});
