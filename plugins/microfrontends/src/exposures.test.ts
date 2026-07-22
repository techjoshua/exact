import { compileProjectArtifacts, createExactArtifactGraph } from '@exact/compiler';
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
			`import ClientButton from './ClientButton';

export default function Area(this: Component<{ count: number }>) {
	this.task.server(async () => { this.state.count++; });
	return () => <main>{this.state.count}<ClientButton /></main>;
}
`
		);
		await writeFile(
			unused,
			`export default function Unused(this: Component<{}>) {
	this.task.server(async () => undefined);
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

		expect(registration).toContain(slash(clientButton));
		expect(registration).not.toContain(slash(unused));
		expect(registration).toContain('stateContracts');
		expect(registration).toContain('actionBoundaries');

		const areaAction = Object.keys(
			results.find((result) => path.resolve(result.inputFile) === path.resolve(area))!.manifest
				.serverActions
		)[0]!;
		const unusedAction = Object.keys(
			results.find((result) => path.resolve(result.inputFile) === path.resolve(unused))!.manifest
				.serverActions
		)[0]!;
		const areaHandler = () => ({ state: { area: true } });
		const build = createExactRemoteBuildRegistration(plan, graph, {
			applicationRoot: root,
			handlers: {
				'@company/remote#./Area': {
					actions: {
						[areaAction]: areaHandler,
						[unusedAction]: () => ({ state: { unused: true } })
					}
				}
			}
		});
		const dispatch = build.roots['@company/remote#./Area']!;
		expect(build.buildKey).toBe(buildKey);
		expect(Object.keys(dispatch.manifest.actions ?? {})).toEqual([areaAction]);
		expect(dispatch.actions).toEqual({ [areaAction]: areaHandler });
		expect(dispatch.actions).not.toHaveProperty(unusedAction);
	});

	it('keeps colliding local handler ids separate for each exposure root', async () => {
		const root = await workspace();
		const sourceRoot = path.join(root, 'src');
		const area = path.join(sourceRoot, 'Area.tsx');
		await writeFile(
			area,
			`export default function Area(this: Component<{ count: number }>) {
	this.task.server(async () => { this.state.count++; });
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
		const action = Object.keys(results[0]!.manifest.serverActions)[0]!;
		const left = () => ({ state: { source: 'left' } });
		const right = () => ({ state: { source: 'right' } });
		const build = createExactRemoteBuildRegistration(plan, graph, {
			applicationRoot: root,
			handlers: {
				'@company/remote#./Left': { actions: { [action]: left } },
				'@company/remote#./Right': { actions: { [action]: right } }
			}
		});

		expect(build.roots['@company/remote#./Left']?.actions?.[action]).toBe(left);
		expect(build.roots['@company/remote#./Right']?.actions?.[action]).toBe(right);
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
