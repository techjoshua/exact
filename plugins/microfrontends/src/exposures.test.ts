import { compileProjectArtifacts, createExactArtifactGraph } from '@exactjs/compiler';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createExactRemoteArtifactPlan } from './build.js';
import {
	createExactExposureRegistrationModules,
	createExactRemoteBuildRegistration
} from './exposures.js';

const buildKey = '0123456789abcdef0123456789abcdef01234567';
const temporaryRoots: string[] = [];

describe('remote exposure registrations', () => {
	afterEach(async () => {
		await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
	});

	it('selects the reachable graph and imports authored client modules', async () => {
		const root = await workspace();
		const sourceRoot = path.join(root, 'src');
		const area = path.join(sourceRoot, 'Area.tsx');
		const clientButton = path.join(sourceRoot, 'ClientButton.tsx');
		const unused = path.join(sourceRoot, 'Unused.tsx');
		await writeFile(
			clientButton,
			`export default function ClientButton(this: Component<{ width: number }>) {
	this.state.width = window.innerWidth;
	return () => <button onClick={() => this.state.width++}>{this.state.width}</button>;
}
`
		);
		await writeFile(
			area,
			`import { TaskContext } from '@exactjs/core';
import ClientButton from './ClientButton';

export default function Area(this: Component<{ count: number }>) {
	const increment = async (_task: TaskContext = TaskContext.server()) => { this.state.count++; };
	increment();
	return () => <main>{this.state.count}<ClientButton /></main>;
}
`
		);
		await writeFile(
			unused,
			`import { TaskContext } from '@exactjs/core';
export default function Unused(this: Component<{}>) {
	async function load(_task: TaskContext = TaskContext.server()) {}
	load();
	return () => <aside>unused</aside>;
}
`
		);
		const results = await compileProjectArtifacts([sourceRoot], {
			outDir: path.join(root, 'artifacts'),
			rootDir: sourceRoot
		});
		const graph = createExactArtifactGraph(results, {
			packageRoot: root,
			sourceRoot,
			rootDir: root
		});
		const plan = createExactRemoteArtifactPlan(
			{
				exposes: { './Area': { component: './src/Area.tsx' } },
				remotes: {},
				providedPackages: []
			},
			{ packageName: '@company/remote', buildKey }
		);
		const registration = createExactExposureRegistrationModules(plan, graph, {
			applicationRoot: root
		})['./Area']!;

		expect(registration).toContain(slash(clientButton).replace(/\.tsx$/, '.js'));
		expect(registration).not.toContain(slash(unused));
		expect(registration).toContain('continuations');
		expect(registration).not.toContain('stateContracts');
		expect(registration).not.toContain('actionBoundaries');

		const areaInvocation = Object.keys(
			results.find((result) => path.resolve(result.inputFile) === path.resolve(area))!.analysis
				.serverActions
		)[0]!;
		const unusedInvocation = Object.keys(
			results.find((result) => path.resolve(result.inputFile) === path.resolve(unused))!.analysis
				.serverActions
		)[0]!;
		const areaHandler = () => ({ state: { area: true } });
		const build = createExactRemoteBuildRegistration(plan, graph, {
			applicationRoot: root,
			handlers: {
				'@company/remote#./Area': {
					invocations: {
						[areaInvocation]: areaHandler,
						[unusedInvocation]: () => ({ state: { unused: true } })
					}
				}
			}
		});
		const dispatch = build.roots['@company/remote#./Area']!;
		expect(build.buildKey).toBe(buildKey);
		expect(Object.keys(dispatch.contract.invocations)).toEqual([areaInvocation]);
		expect(dispatch.invocations).toEqual({ [areaInvocation]: areaHandler });
		expect(dispatch.invocations).not.toHaveProperty(unusedInvocation);
	});

	it('keeps colliding local handler ids separate for each exposure root', async () => {
		const root = await workspace();
		const sourceRoot = path.join(root, 'src');
		const area = path.join(sourceRoot, 'Area.tsx');
		await writeFile(
			area,
			`import { TaskContext } from '@exactjs/core';
export default function Area(this: Component<{ count: number }>) {
	const increment = async (_task: TaskContext = TaskContext.server()) => { this.state.count++; };
	increment();
	return () => <main>{this.state.count}</main>;
}
`
		);
		const results = await compileProjectArtifacts([sourceRoot], {
			outDir: path.join(root, 'artifacts'),
			rootDir: sourceRoot
		});
		const graph = createExactArtifactGraph(results, {
			packageRoot: root,
			sourceRoot,
			rootDir: root
		});
		const plan = createExactRemoteArtifactPlan(
			{
				exposes: {
					'./Left': { component: './src/Area.tsx' },
					'./Right': { component: './src/Area.tsx' }
				},
				remotes: {},
				providedPackages: []
			},
			{ packageName: '@company/remote', buildKey }
		);
		const invocation = Object.keys(results[0]!.analysis.serverActions)[0]!;
		const left = () => ({ state: { source: 'left' } });
		const right = () => ({ state: { source: 'right' } });
		const build = createExactRemoteBuildRegistration(plan, graph, {
			applicationRoot: root,
			handlers: {
				'@company/remote#./Left': { invocations: { [invocation]: left } },
				'@company/remote#./Right': { invocations: { [invocation]: right } }
			}
		});

		expect(build.roots['@company/remote#./Left']?.invocations?.[invocation]).toBe(left);
		expect(build.roots['@company/remote#./Right']?.invocations?.[invocation]).toBe(right);
	});

	it('rejects a module without a default-exported component root', async () => {
		const root = await workspace();
		const sourceRoot = path.join(root, 'src');
		await writeFile(
			path.join(sourceRoot, 'Named.tsx'),
			`export function Named() { return () => <main>named</main>; }
`
		);
		const results = await compileProjectArtifacts([sourceRoot], {
			outDir: path.join(root, 'artifacts'),
			rootDir: sourceRoot
		});
		const graph = createExactArtifactGraph(results, {
			packageRoot: root,
			sourceRoot,
			rootDir: root
		});
		const plan = createExactRemoteArtifactPlan(
			{
				exposes: { './Named': { component: './src/Named.tsx' } },
				remotes: {},
				providedPackages: []
			},
			{ packageName: '@company/remote', buildKey }
		);

		expect(() =>
			createExactExposureRegistrationModules(plan, graph, { applicationRoot: root })
		).toThrow('default-exported eXact component root');
	});
});

async function workspace(): Promise<string> {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-remote-exposure-'));
	temporaryRoots.push(root);
	await mkdir(path.join(root, 'src'));
	return root;
}

function slash(value: string): string {
	return value.replaceAll(path.sep, '/');
}
