import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { transformSource } from './index.js';

describe('@exactjs/compiler explanation', () => {
	it('explains transport and SSR liveness without exposing server context values', () => {
		const result = transformSource(
			'import { TaskContext } from "@exactjs/core";\n\n      import { createContext, type Component } from "@exactjs/core";\n      const DatabaseContext = createContext<{ count(): Promise<number> }>(\n        "database",\n        { scope: "application" }\n      );\n      const PublicStatus = createContext<string>("status", { keep: "shared" });\n      export function Counter(this: Component<{ count: number; label: string }>) {\n        const database = this.getContext(DatabaseContext);\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          this.state.count = await database.count();\n          this.setContext(PublicStatus, "ready");\n        };\nrunFixtureTask();\n        return () => <button title={this.state.label} onClick={() => this.state.label = "next"}>\n          {this.state.count}\n        </button>;\n      }\n    ',
			{
				filename: path.join(process.cwd(), 'explanation.fixture.tsx'),
				explain: true
			}
		);

		expect(result.explanation?.components).toHaveLength(1);
		expect(result.explanation?.islands[0]?.activation).toEqual(
			expect.objectContaining({
				mode: 'interaction',
				targets: [expect.objectContaining({ events: [{ type: 'click', replay: 'native-click' }] })]
			})
		);
		expect(result.explanation?.components[0]).toMatchObject({
			name: 'Counter',
			continuations: [
				{
					clientToServer: { publicContexts: [] },
					serverOnlyContexts: ['DatabaseContext'],
					serverToClient: {
						state: ['count'],
						contexts: ['PublicStatus']
					}
				}
			],
			ssr: {
				serverOnlyContexts: ['DatabaseContext'],
				resumption: expect.arrayContaining([
					{
						kind: 'state',
						name: 'count',
						reason: 'server-continuation-result'
					},
					{
						kind: 'state',
						name: 'label',
						reason: 'client-render-dependency'
					},
					{
						kind: 'context',
						name: 'PublicStatus',
						reason: 'shared-context-result'
					}
				])
			}
		});
		expect(JSON.stringify(result.explanation)).not.toContain('database credentials');
	});

	it('stays absent unless explicitly requested', () => {
		expect(
			transformSource('export const value = 1;', {
				filename: path.join(process.cwd(), 'quiet-explanation.fixture.ts')
			}).explanation
		).toBeUndefined();
	});

	it('explains component registry entry provenance and artifact targets', () => {
		const result = transformSource(
			`
				function Grid() { return () => <p>grid</p>; }
				const Widget = createComponentRegistry(({ lazy }) => ({
					grid: Grid,
					table: lazy(() => import('./table.js').then(({ Table }) => Table))
				}));
			`,
			{
				filename: path.join(process.cwd(), 'registry-explanation.fixture.tsx'),
				explain: true
			}
		);

		expect(result.explanation?.registries).toEqual([
			expect.objectContaining({
				name: 'Widget',
				entries: [
					expect.objectContaining({
						key: 'grid',
						mode: 'eager',
						componentName: 'Grid'
					}),
					expect.objectContaining({
						key: 'table',
						mode: 'lazy',
						moduleSpecifier: './table.js',
						exportName: 'Table'
					})
				]
			})
		]);
	});

	it('explains function-defined task invocation policy', () => {
		const result = transformSource(
			`
				import { TaskContext } from "@exactjs/core";
				export function Editor(this: Component<{ title: string }>) {
					async function saveTitle(
						title: string,
						_task: TaskContext = TaskContext.server().latest()
					) {
						this.state.title = title;
					}
					return () => <button onClick={() => saveTitle(this.state.title)}>Save</button>;
				}
			`,
			{
				filename: path.join(process.cwd(), 'task-explanation.fixture.tsx'),
				explain: true
			}
		);

		expect(result.explanation?.components[0]?.continuations[0]).toMatchObject({
			kind: 'task',
			invocation: {
				concurrency: 'latest',
				arguments: [0]
			}
		});
	});
});
