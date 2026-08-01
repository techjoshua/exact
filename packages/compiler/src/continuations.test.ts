import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeSource } from './index.js';

const fixture = (name: string) => path.join(process.cwd(), `${name}.continuation-fixture.tsx`);

describe('distributed component continuation IR', () => {
	it('separates transported snapshots, server context, response effects, and ownership', () => {
		const analysis = analyzeSource(
			'import { TaskContext } from "@exactjs/core";\n\n      import { createContext, type Component } from "@exactjs/core";\n      const RepositoryContext = createContext<{ find(query: string): Promise<string[]> }>(\n        "repository",\n        { scope: "request" }\n      );\n      export function Search(this: Component<{ query: string; results: string[] }>) {\n        const repository = this.getContext(RepositoryContext);\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          this.state.results = await repository.find(this.state.query);\n        };\nrunFixtureTask();\n        return () => <button onClick={() => this.state.query = "next"}>{this.state.results.length}</button>;\n      }\n    ',
			{ filename: fixture('activation') }
		);

		const component = analysis.components[0]!;
		const continuation = analysis.continuations[0]!;
		expect(continuation).toMatchObject({
			id: component.tasks[0]!.id,
			componentId: component.id,
			placement: 'server',
			activation: {
				stateReads: expect.arrayContaining([expect.objectContaining({ path: 'query' })]),
				dependencies: [{ index: 1, source: 'state' }],
				serverContexts: [{ token: 'RepositoryContext', kind: 'read', confidence: 'exact' }],
				publicContexts: []
			},
			effects: {
				stateWrites: expect.arrayContaining([expect.objectContaining({ path: 'results' })]),
				contextWrites: [],
				serverContextWrites: [],
				boundaries: expect.any(Array)
			},
			ownership: { componentId: component.id, lifetime: 'component' },
			cancellation: 'abort-signal'
		});
		expect(analysis.serverActions[continuation.id]).toEqual({
			id: continuation.id,
			componentId: continuation.componentId,
			taskId: continuation.taskId,
			placement: continuation.placement,
			stateContract: {
				reads: continuation.activation.stateReads,
				writes: continuation.effects.stateWrites
			},
			serverContextContract: continuation.activation.serverContexts,
			publicContextContract: continuation.activation.publicContexts
		});
	});

	it('keeps server render authority out of the client resumption record', () => {
		const analysis = analyzeSource(
			'import { TaskContext } from "@exactjs/core";\n\n      import { createContext, type Component } from "@exactjs/core";\n      const DatabaseContext = createContext<{ count(): Promise<number> }>(\n        "database",\n        { scope: "application" }\n      );\n      export function Counter(this: Component<{ count: number; label: string }>) {\n        const database = this.getContext(DatabaseContext);\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          this.state.count = await database.count();\n        };\nrunFixtureTask();\n        return () => <button title={this.state.label} onClick={() => this.state.count++}>\n          {this.state.count}\n        </button>;\n      }\n    ',
			{ filename: fixture('resumption') }
		);

		const resumption = analysis.resumptions[0]!;
		expect(resumption.serverRender.serverContexts).toContainEqual({
			token: 'DatabaseContext',
			kind: 'read',
			confidence: 'exact'
		});
		expect(resumption.client.statePaths).toEqual(expect.arrayContaining(['count', 'label']));
		expect(JSON.stringify(resumption.client)).not.toContain('DatabaseContext');
	});

	it('does not treat methods invoked on captured values as transport state paths', () => {
		const analysis = analyzeSource(
			'import { TaskContext } from "@exactjs/core";\n\n      export function Search(this: Component<{ query: string; result: string }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          const query = this.state.query;\n          await Promise.resolve();\n          this.state.result = query.toUpperCase();\n        };\nrunFixtureTask();\n        return () => <output>{this.state.result}</output>;\n      }\n    ',
			{ filename: fixture('captured-value-method') }
		);

		expect(analysis.continuations[0]?.activation.stateReads).toEqual([
			{ path: 'query', kind: 'read', confidence: 'exact' }
		]);
	});

	it('separates explicitly shared context projections from server context lookups', () => {
		const analysis = analyzeSource(
			'import { TaskContext } from "@exactjs/core";\n\n      import { createContext, type Component } from "@exactjs/core";\n      const PublicConfig = createContext<{ domain: string }>(\n        "public config",\n        { scope: "application", keep: "shared" }\n      );\n      export function Link(this: Component<{ href: string }>) {\n        const config = this.getContext(PublicConfig);\n        const runFixtureTask = (_task: TaskContext = TaskContext.server()) => {\n          this.state.href = config.domain;\n        };\nrunFixtureTask();\n        return () => <a href={this.state.href}>Home</a>;\n      }\n    ',
			{ filename: fixture('public-context') }
		);

		expect(analysis.continuations[0]?.activation).toMatchObject({
			serverContexts: [],
			publicContexts: [{ token: 'PublicConfig', kind: 'read', confidence: 'exact' }]
		});
	});

	it('includes only shared component-context writes in browser resumption data', () => {
		const analysis = analyzeSource(
			'import { TaskContext } from "@exactjs/core";\n\n      import { createContext, type Component } from "@exactjs/core";\n      const PublicStatus = createContext<{ text: string }>("status", { keep: "shared" });\n      const ServerResource = createContext<{ connected: boolean }>(\n        "resource",\n        { scope: "application" }\n      );\n      export function Provider(this: Component<{}>) {\n        const runFixtureTask = (_task: TaskContext = TaskContext.server()) => {\n          this.setContext(PublicStatus, { text: "ready" });\n          this.setContext(ServerResource, { connected: true });\n        };\nrunFixtureTask();\n        return () => <button onClick={() => undefined}>Ready</button>;\n      }\n    ',
			{ filename: fixture('resumed-context') }
		);

		expect(analysis.resumptions[0]?.client.contexts).toEqual(['PublicStatus']);
		expect(analysis.continuations[0]?.effects).toMatchObject({
			contextWrites: [expect.objectContaining({ token: 'PublicStatus' })],
			serverContextWrites: [expect.objectContaining({ token: 'ServerResource' })]
		});
	});
});
