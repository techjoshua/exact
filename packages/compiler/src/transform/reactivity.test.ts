import { describe, expect, it } from 'vitest';
import { analyzeSource, transform, transformSource } from '../index.js';

describe('@exactjs/compiler: reactivity', () => {
	it('lowers JSX to eXact compiled vnode helpers', () => {
		const output = transform('const view = <button title={label}>Save</button>;');

		expect(output).toContain('createCompiledVNode as __exactVNode');
		expect(output).toContain('createDynamicChild as __exactDynamic');
		expect(output).toContain('__exactVNode("button"');
		expect(output).toContain('title: __exactExpression(() => label)');
		expect(output).toContain('"Save"');
	});

	it('keeps conditional JSX inside one dynamic child boundary', () => {
		const output = transform(`
      function Panel(this: Component<{ ready: boolean }>) {
        return () => (
          <section>
            {this.state.ready ? <strong>Ready</strong> : <span>Loading</span>}
          </section>
        );
      }
    `);

		expect(output.match(/__exactDynamic\(/g)).toHaveLength(1);
		expect(output).toContain('this.state.ready ? __exactVNode("strong"');
		expect(output).toContain(': __exactVNode("span"');
	});

	it('returns transform results for generic adapters', () => {
		const result = transformSource('const view = <span />;', { filename: 'view.tsx' });

		expect(result.filename).toBe('view.tsx');
		expect(result.map).toBeNull();
		expect(result.code).toContain('__exactVNode("span"');
		expect(result.manifest.filename).toBe('view.tsx');
	});

	it('attaches the component root in client-only builds instead of un-emitted island symbols', () => {
		const output = transform(
			`export function View(this: Component<{ count: number }>) {
				this.state.count = 0;
				return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
			}`,
			{ filename: 'View.tsx', target: 'client', serverComponents: false }
		);

		expect(output).toMatch(/role: "root", implementation: __exactImplementation_View_\d+/);
		expect(output).not.toContain('implementation: View_ExactClient_1');
	});

	it('emits stable exact ids for compiled dom elements', () => {
		const output = transform('const view = <section><Label /><span>Ready</span></section>;', {
			filename: 'view.tsx'
		});

		expect(output).toMatch(/"data-exact-id": "x[A-Za-z0-9_-]{22}"/);
		expect(output.match(/"data-exact-id":/g)).toHaveLength(2);
		expect(output).toContain('__exactVNode(Label, {})');
	});

	it('retains emitted element and list ids across unrelated preceding edits', () => {
		const source = `function View(this: Component<{}>) {
      return () => <section><i /><i />{this.map(items, item => item.id, item => <span>{item.id}</span>)}</section>;
    }`;
		const first = transform(source, { filename: 'stable-hmr.tsx' });
		const second = transform(`const unrelated = true;\n${source}`, { filename: 'stable-hmr.tsx' });
		const ids = (output: string) =>
			Array.from(output.matchAll(/"(x[A-Za-z0-9_-]{22})"/g), (match) => match[1]);
		expect(ids(second)).toEqual(ids(first));
	});

	it('builds semantic task metadata for server component planning', () => {
		const manifest = analyzeSource(
			`
      import { readFile } from "node:fs/promises";

      export function ProjectPage(this: Component<{ project?: string; width?: number }>) {
        this.task(async ({ signal }: { signal: AbortSignal }) => {
          this.state.project = await readFile("project.txt", "utf8");
        });
        this.task(({ signal }: { signal: AbortSignal }) => {
          this.state.width = window.innerWidth;
        });
        this.task(({ signal }: { signal: AbortSignal }) => {
          window.addEventListener("resize", () => {});
        });
        return () => <button onClick={() => save()} ref={this.ref(button)}>{this.state.project}</button>;
      }
    `,
			{ filename: 'ProjectPage.tsx' }
		);

		const component = manifest.components[0]!;
		expect(component.name).toBe('ProjectPage');
		expect(component.exported).toBe(true);
		expect(component.placement).toBe('isomorphic');
		expect(manifest.exports).toContainEqual({
			name: 'ProjectPage',
			kind: 'component',
			placement: 'isomorphic'
		});
		expect(manifest.symbols).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: expect.stringMatching(/^x/),
					componentId: component.id,
					exportName: 'ProjectPage',
					localName: 'ProjectPage',
					generatedName: 'ProjectPage',
					debugName: 'ProjectPage',
					kind: 'component',
					role: 'root',
					target: 'both',
					placement: 'isomorphic'
				}),
				expect.objectContaining({
					componentId: component.id,
					exportName: 'ProjectPage_ExactServer_1',
					localName: 'ProjectPage',
					generatedName: 'ProjectPage_ExactServer_1',
					role: 'server-part',
					target: 'server',
					placement: 'isomorphic'
				}),
				expect.objectContaining({
					componentId: component.id,
					exportName: 'ProjectPage_ExactClient_1',
					localName: 'ProjectPage_ExactClient_1',
					generatedName: 'ProjectPage_ExactClient_1',
					role: 'client-island',
					target: 'client',
					placement: 'client'
				})
			])
		);
		expect(component.splitBoundaries).toEqual(
			expect.arrayContaining(['browser:window', 'event-handler', 'ref', 'server-import:readFile'])
		);
		expect(component.tasks.map((task) => task.placement)).toEqual(['server', 'client', 'client']);
		expect(component.tasks[0]!.writes).toContainEqual({
			path: 'project',
			kind: 'write',
			confidence: 'exact'
		});
		expect(component.tasks[0]!.reads).toEqual([]);
		expect(Object.values(manifest.serverActions)[0]!.stateContract).toMatchObject({
			reads: [],
			writes: [{ path: 'project', kind: 'write', confidence: 'exact' }]
		});
		expect(component.tasks[1]!.diagnostics).toContain(
			'task writes component state and references browser-only globals; classify as client and split at this boundary'
		);
		expect(Object.keys(manifest.serverActions)).toEqual([component.tasks[0]!.id]);
	});

	it('uses semantic export metadata for aliased component exports', () => {
		const manifest = analyzeSource(
			`
      function ProjectPage() {
        return () => <p>Ready</p>;
      }

      export { ProjectPage as Page };
    `,
			{ filename: 'ProjectPage.tsx' }
		);

		expect(manifest.components[0]!.exported).toBe(true);
		expect(manifest.exports).toContainEqual({
			name: 'Page',
			kind: 'component',
			placement: 'isomorphic'
		});
		expect(manifest.symbols).toContainEqual(
			expect.objectContaining({
				exportName: 'Page',
				localName: 'ProjectPage',
				role: 'root'
			})
		);
	});

	it('traces state aliases in task state contracts', () => {
		const manifest = analyzeSource(
			`
      export function ProjectPage(this: Component<{ project: { title: string }; count: number }>) {
        this.task(() => {
          const state = this.state;
          const project = state.project;
          project.title = project.title.trim();
          Object.assign(state, { count: 1 });
        });
        return () => <p>{this.state.project.title}</p>;
      }
    `,
			{ filename: 'ProjectPage.tsx' }
		);

		const task = manifest.components[0]!.tasks[0]!;
		expect(task.writes).toEqual(
			expect.arrayContaining([
				{ path: 'project.title', kind: 'write', confidence: 'exact' },
				{ path: '*', kind: 'write', confidence: 'broad' }
			])
		);
		expect(task.reads).toEqual(
			expect.arrayContaining([
				{ path: 'project', kind: 'read', confidence: 'exact' },
				{ path: 'project.title', kind: 'read', confidence: 'exact' }
			])
		);
	});

	it('traces destructured state aliases in task state contracts', () => {
		const manifest = analyzeSource(
			`
      export function ProjectPage(this: Component<{ project: { title: string }; queue: string[] }>) {
        this.task(() => {
          const { project: currentProject, queue } = this.state;
          const { title } = currentProject;
          currentProject.title = title.trim();
          queue.push("done");
        });
        return () => <p>{this.state.project.title}</p>;
      }
    `,
			{ filename: 'ProjectPage.tsx' }
		);

		const task = manifest.components[0]!.tasks[0]!;
		expect(task.writes).toEqual(
			expect.arrayContaining([
				{ path: 'project.title', kind: 'write', confidence: 'exact' },
				{ path: 'queue', kind: 'write', confidence: 'broad' }
			])
		);
		expect(task.reads).toEqual(
			expect.arrayContaining([{ path: 'project.title', kind: 'read', confidence: 'exact' }])
		);
	});

	it('does not treat shadowed Object.assign as a built-in state mutator', () => {
		const manifest = analyzeSource(
			`
      export function ProjectPage(this: Component<{ title: string }>) {
        this.task(() => {
          const Object = { assign() {} };
          Object.assign(this.state, { title: "Ready" });
        });
        return () => <p>{this.state.title}</p>;
      }
    `,
			{ filename: 'ProjectPage.tsx' }
		);

		expect(manifest.components[0]!.tasks[0]!.writes).toEqual([]);
	});

	it('uses state aliases in server action contracts', () => {
		const manifest = analyzeSource(
			`
      import { readFile } from "node:fs/promises";

      export function ProjectPage(this: Component<{ project: { title?: string } }>) {
        this.task(async () => {
          const project = this.state.project;
          project.title = await readFile("project.txt", "utf8");
        });
        return () => <p>{this.state.project.title}</p>;
      }
    `,
			{ filename: 'ProjectPage.tsx' }
		);

		const task = manifest.components[0]!.tasks[0]!;
		const action = Object.values(manifest.serverActions)[0]!;
		expect(task.placement).toBe('server');
		expect(action.stateContract.writes).toContainEqual({
			path: 'project.title',
			kind: 'write',
			confidence: 'exact'
		});
	});

	it('records component and task context contracts', () => {
		const manifest = analyzeSource(
			`
      import { LocaleContext } from "./contexts";

      export function ProjectPage(this: Component<{ title?: string }>) {
        const locale = this.getContext(LocaleContext);
        this.task.server(() => {
          const logger = this.getContext(Services.Logger);
          this.setContext(LocaleContext, locale);
          this.state.title = logger.current;
        });
        this.getContext(createDynamicToken());
        return () => <p>{this.state.title}</p>;
      }
    `,
			{ filename: 'ProjectPage.tsx' }
		);

		const component = manifest.components[0]!;
		const task = component.tasks[0]!;
		const action = Object.values(manifest.serverActions)[0]!;

		expect(component.contexts).toEqual([
			{ token: 'LocaleContext', kind: 'read', confidence: 'exact' },
			{ token: 'Services.Logger', kind: 'read', confidence: 'exact' },
			{ token: 'unknown', kind: 'read', confidence: 'unknown' },
			{ token: 'LocaleContext', kind: 'write', confidence: 'exact' }
		]);
		expect(task.contexts).toEqual([
			{ token: 'Services.Logger', kind: 'read', confidence: 'exact' },
			{ token: 'LocaleContext', kind: 'write', confidence: 'exact' }
		]);
		expect(action.serverContextContract).toEqual([
			{ token: 'LocaleContext', kind: 'read', confidence: 'exact' },
			{ token: 'Services.Logger', kind: 'read', confidence: 'exact' }
		]);
	});

	it('uses resolved references when classifying task environments', () => {
		const manifest = analyzeSource(
			`
      import { readFile } from "node:fs/promises";

      export function ProjectPage(this: Component<{ title?: string; width?: number }>) {
        this.task(() => {
          const readFile = () => "local";
          this.state.title = readFile();
        });
        this.task(() => {
          const window = { innerWidth: 42 };
          this.state.width = window.innerWidth;
        });
        return () => <p>{this.state.title}</p>;
      }
    `,
			{ filename: 'ProjectPage.tsx' }
		);

		const component = manifest.components[0]!;
		expect(component.tasks.map((task) => task.placement)).toEqual(['isomorphic', 'isomorphic']);
		expect(component.tasks[0]!.diagnostics).toContain(
			'task writes component state without environment-specific effects; classify as isomorphic so SSR can run it and hydration can skip duplicate initial work'
		);
		expect(component.tasks[1]!.diagnostics).toContain(
			'task writes component state without environment-specific effects; classify as isomorphic so SSR can run it and hydration can skip duplicate initial work'
		);
		expect(manifest.diagnostics).toContain(
			'task writes component state without environment-specific effects; classify as isomorphic so SSR can run it and hydration can skip duplicate initial work'
		);
		expect(component.splitBoundaries).not.toContain('server-import:readFile');
		expect(component.splitBoundaries).not.toContain('browser:window');
	});

	it('does not classify type-only server imports as runtime server effects', () => {
		const manifest = analyzeSource(
			`
      import type { Stats } from "node:fs";

      export function ProjectPage(this: Component<{ title?: string }>) {
        this.task(() => {
          const stats: Stats | undefined = undefined;
          this.state.title = stats ? "ready" : "missing";
        });
        return () => <p>{this.state.title}</p>;
      }
    `,
			{ filename: 'ProjectPage.tsx' }
		);

		const component = manifest.components[0]!;
		expect(component.tasks[0]!.placement).toBe('isomorphic');
		expect(component.tasks[0]!.diagnostics).toContain(
			'task writes component state without environment-specific effects; classify as isomorphic so SSR can run it and hydration can skip duplicate initial work'
		);
		expect(component.splitBoundaries).not.toContain('server-import:Stats');
		expect(Object.values(manifest.serverActions)[0]!.stateContract.writes).toContainEqual({
			path: 'title',
			kind: 'write',
			confidence: 'exact'
		});
	});

	it('preserves type-only server imports in client artifacts', () => {
		const client = transform(
			`
      import type { Stats } from "node:fs";
      import { readFile } from "node:fs/promises";

      export function ProjectPage(this: Component<{ title?: string }>) {
        this.task.server(async () => {
          this.state.title = await readFile("title.txt", "utf8");
        });
        const stats: Stats | undefined = undefined;
        return () => <p>{stats ? this.state.title : "missing"}</p>;
      }
    `,
			{ filename: 'ProjectPage.tsx', target: 'client' }
		);

		expect(client).toContain('import type { Stats } from "node:fs";');
		expect(client).not.toContain('node:fs/promises');
		expect(client).not.toContain('readFile');
	});

	it('emits target-specific client and server task artifacts', () => {
		const source = `
      import { readFile } from "node:fs/promises";

      export function ProjectPage(this: Component<{ project?: string; width?: number }>) {
        this.task(async ({ signal }: { signal: AbortSignal }) => {
          this.state.project = await readFile("project.txt", "utf8");
        });
        this.task(({ signal }: { signal: AbortSignal }) => {
          this.state.width = window.innerWidth;
        });
        return () => <button onClick={() => this.state.width++}>{this.state.project}</button>;
      }
    `;

		const client = transform(source, { filename: 'ProjectPage.tsx', target: 'client' });
		const server = transform(source, { filename: 'ProjectPage.tsx', target: 'server' });

		expect(client).not.toContain('node:fs/promises');
		expect(client).not.toContain('readFile');
		expect(client).toContain('window.innerWidth');
		expect(server).toContain('node:fs/promises');
		expect(server).toContain('readFile');
		expect(server).not.toContain('window.innerWidth');
		expect(server).toContain('export const ProjectPage');
	});

	it('honors explicit task placement aliases as compiler escape hatches', () => {
		const source = `
      function Page(this: Component<{ title?: string; width?: number }>) {
        this.task.server.deferred.blocking(() => {
          this.state.title = "server";
        });
        this.task.client(this.state.width, width => {
          this.state.width = 1;
        });
        return () => <p>{this.state.title}</p>;
      }
    `;

		const manifest = analyzeSource(source, { filename: 'Page.tsx' });
		const client = transform(source, { filename: 'Page.tsx', target: 'client' });
		const server = transform(source, { filename: 'Page.tsx', target: 'server' });

		expect(manifest.components[0]!.tasks.map((task) => task.placement)).toEqual([
			'server',
			'client'
		]);
		expect(manifest.components[0]!.tasks.map((task) => task.requestedPlacement)).toEqual([
			'server',
			'client'
		]);
		expect(manifest.components[0]!.tasks[0]).toMatchObject({
			priority: 'deferred',
			readiness: 'blocking'
		});
		expect(manifest.components[0]!.tasks[0]!.diagnostics).toContain(
			'task placement explicitly requested as server'
		);
		expect(client).toContain('placement: "server"');
		expect(client).toContain('dispatchComponentContinuation as __exactDispatchContinuation');
		expect(client).toContain(
			`__exactDispatchContinuation(this as any, "${manifest.components[0]!.tasks[0]!.id}"`
		);
		expect(client).toContain('priority: "deferred"');
		expect(client).toContain('readiness: "blocking"');
		expect(client).toContain('__exactWrite(this.state, ["width"], () => 1)');
		expect(client).toContain('placement: "client"');
		expect(client).toContain('this.reactive(() => this.state.width)');
		expect(server).toContain('server');
		expect(server).not.toContain('width = 1');
	});

	it('lowers shared component-context writes into the distributed response contract', () => {
		const source = `
      const StatusContext = createContext<{ message: string }>("status", {
        global: true,
        keep: "shared"
      });

      export function Page(this: Component<{ count: number }>) {
        this.task.server(() => {
          this.setContext(StatusContext, { message: "ready" });
        });
        return () => <button onClick={() => this.state.count++}>Page</button>;
      }
    `;
		const manifest = analyzeSource(source, { filename: 'Page.tsx' });
		const client = transform(source, { filename: 'Page.tsx', target: 'client' });
		const server = transform(source, { filename: 'Page.tsx', target: 'server' });
		const continuation = manifest.continuations[0]!;

		expect(continuation.effects.contextWrites).toEqual([
			expect.objectContaining({ token: 'StatusContext', kind: 'write' })
		]);
		expect(client).toContain('name: "StatusContext", token: StatusContext');
		expect(client).toContain(
			'registerComponentContinuationContexts as __exactRegisterContinuationContexts'
		);
		expect(server).toContain(
			'registerComponentContinuationContexts as __exactRegisterContinuationContexts'
		);
		expect(client).toContain('contextWrites:');
		expect(server).toContain('contextWrites:');
		expect(server).toContain('["StatusContext"]');
		expect(server).toContain('contexts: __exactContextWrites_');
	});

	it('keeps server-resident component-context writes out of client response contracts', () => {
		const source = `
      const DatabaseContext = createContext<{ query(): Promise<string> }>("database", {
        global: true,
        scope: "application"
      });

      export function Page(this: Component<{ count: number }>) {
        this.task.server(() => {
          this.setContext(DatabaseContext, { query: async () => "private" });
        });
        return () => <button onClick={() => this.state.count++}>Page</button>;
      }
    `;
		const manifest = analyzeSource(source, { filename: 'Page.tsx' });
		const client = transform(source, { filename: 'Page.tsx', target: 'client' });
		const continuation = manifest.continuations[0]!;

		expect(continuation.effects.contextWrites).toEqual([]);
		expect(continuation.effects.serverContextWrites).toEqual([
			expect.objectContaining({ token: 'DatabaseContext', kind: 'write' })
		]);
		expect(client).not.toContain('name: "DatabaseContext"');
	});

	it('fails compilation when explicit task placement contradicts detected environment usage', () => {
		expect(() =>
			transform(`
      function Page(this: Component<{}>) {
        this.task.server(() => {
          window.addEventListener("resize", () => {});
        });
        return () => <p />;
      }
    `)
		).toThrow('task requests server placement but references browser-only globals');

		expect(() =>
			transform(`
      import { readFile } from "node:fs/promises";
      function Page(this: Component<{}>) {
        this.task.client(async () => {
          await readFile("title.txt", "utf8");
        });
        return () => <p />;
      }
    `)
		).toThrow('task requests client placement but references server-only imports');
	});
});
