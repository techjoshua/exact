import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { transformSource } from './index.js';

describe('@exactjs/compiler explanation', () => {
	it('explains transport and SSR liveness without exposing server context values', () => {
		const result = transformSource(
			`
      import { createContext, type Component } from "@exactjs/core";
      const DatabaseContext = createContext<{ count(): Promise<number> }>(
        "database",
        { scope: "application" }
      );
      const PublicStatus = createContext<string>("status", { keep: "shared" });
      export function Counter(this: Component<{ count: number; label: string }>) {
        const database = this.getContext(DatabaseContext);
        this.task.server(async () => {
          this.state.count = await database.count();
          this.setContext(PublicStatus, "ready");
        });
        return () => <button title={this.state.label} onClick={() => this.state.label = "next"}>
          {this.state.count}
        </button>;
      }
    `,
			{
				filename: path.join(process.cwd(), 'explanation.fixture.tsx'),
				explain: true
			}
		);

		expect(result.explanation?.components).toHaveLength(1);
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

	it('keeps action labels diagnostic while explaining invocation policy', () => {
		const result = transformSource(
			`
				export function Editor(this: Component<{ title: string }>) {
					this.action.server(
						"save title",
						async (title: string) => {
							this.state.title = title;
						},
						"latest"
					);
					return () => <p>{this.state.title}</p>;
				}
			`,
			{
				filename: path.join(process.cwd(), 'action-explanation.fixture.tsx'),
				explain: true
			}
		);

		expect(result.explanation?.components[0]?.continuations[0]).toMatchObject({
			kind: 'action',
			label: 'save title',
			invocation: {
				concurrency: 'latest',
				arguments: [0]
			}
		});
	});
});
