import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeSource } from './index.js';

const fixture = (name: string) => path.join(process.cwd(), `${name}.continuation-fixture.tsx`);

describe('distributed component continuation IR', () => {
	it('separates transported snapshots, server context, response effects, and ownership', () => {
		const manifest = analyzeSource(
			`
      import { createContext, type Component } from "@exactjs/core";
      const RepositoryContext = createContext<{ find(query: string): Promise<string[]> }>(
        "repository",
        { scope: "request" }
      );
      export function Search(this: Component<{ query: string; results: string[] }>) {
        const repository = this.getContext(RepositoryContext);
        this.task.server(async () => {
          this.state.results = await repository.find(this.state.query);
        });
        return () => <button onClick={() => this.state.query = "next"}>{this.state.results.length}</button>;
      }
    `,
			{ filename: fixture('activation') }
		);

		const component = manifest.components[0]!;
		const continuation = manifest.continuations[0]!;
		expect(continuation).toMatchObject({
			id: component.tasks[0]!.id,
			componentId: component.id,
			placement: 'server',
			activation: {
				stateReads: expect.arrayContaining([expect.objectContaining({ path: 'query' })]),
				dependencies: [{ index: 1, source: 'state' }],
				serverContexts: [{ token: 'RepositoryContext', kind: 'read', confidence: 'exact' }]
			},
			effects: {
				stateWrites: expect.arrayContaining([expect.objectContaining({ path: 'results' })]),
				contextWrites: [],
				boundaries: expect.any(Array)
			},
			ownership: { componentId: component.id, lifetime: 'component' },
			cancellation: 'abort-signal'
		});
		expect(manifest.serverActions[continuation.id]).toEqual({
			id: continuation.id,
			componentId: continuation.componentId,
			taskId: continuation.taskId,
			placement: continuation.placement,
			stateContract: {
				reads: continuation.activation.stateReads,
				writes: continuation.effects.stateWrites
			},
			contextContract: continuation.activation.serverContexts
		});
	});

	it('keeps server render authority out of the client resumption record', () => {
		const manifest = analyzeSource(
			`
      import { createContext, type Component } from "@exactjs/core";
      const DatabaseContext = createContext<{ count(): Promise<number> }>(
        "database",
        { scope: "application" }
      );
      export function Counter(this: Component<{ count: number; label: string }>) {
        const database = this.getContext(DatabaseContext);
        this.task.server(async () => {
          this.state.count = await database.count();
        });
        return () => <button title={this.state.label} onClick={() => this.state.count++}>
          {this.state.count}
        </button>;
      }
    `,
			{ filename: fixture('resumption') }
		);

		const resumption = manifest.resumptions[0]!;
		expect(resumption.serverRender.serverContexts).toContainEqual({
			token: 'DatabaseContext',
			kind: 'read',
			confidence: 'exact'
		});
		expect(resumption.client.statePaths).toEqual(expect.arrayContaining(['count', 'label']));
		expect(JSON.stringify(resumption.client)).not.toContain('DatabaseContext');
	});
});
