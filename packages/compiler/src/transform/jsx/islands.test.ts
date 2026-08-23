import { describe, expect, it } from 'vitest';
import { transform } from '../../index.js';
import { analyzeSource } from '../../compilation/source-analysis.js';

describe('@exactjs/compiler: islands', () => {
	it('generates child-bearing client island components with state bridge props', () => {
		const source =
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      export function Panel(this: Component<{ count: number; label: string }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask();\n        return () => <button title={this.state.label} onClick={() => this.state.count++}>\n          Save {this.state.count}\n        </button>;\n      }\n    ';
		const client = transform(source, {
			filename: 'Panel.tsx',
			target: 'client',
			componentContractProjection: 'hydrate',
			serverComponents: true
		});
		const server = transform(source, {
			filename: 'Panel.tsx',
			target: 'server',
			serverComponents: true
		});

		expect(client).toContain('export function Panel_ExactClient_1(this: any, props: any = {})');
		expect(client).toContain('title: __exactExpression(() => this.state.label)');
		expect(client).toContain('__exactUpdateResult(this.state, ["count"]');
		expect(client).toContain('__exactDynamic(() => this.state.count');
		expect(server).toContain(
			'"__exactState": { count: this.state.count, label: this.state.label }'
		);
		expect(server).toContain('__exactHydration: "interaction"');
		expect(server).toContain('__exactHydrationFallback: __exactVNode("button"');
		expect(server).toContain('title: this.state.label');
		expect(server).not.toContain('onClick');
	});

	it('keeps ref and non-activation-event islands eager', () => {
		const source = `
			export function Panel(this: Component<{}>) {
				return () => <>
					<div ref={undefined}>Referenced</div>
					<div onMouseMove={() => undefined}>Pointer</div>
				</>;
			}
		`;
		const server = transform(source, {
			filename: 'Panel.tsx',
			target: 'server',
			serverComponents: true
		});

		expect(server).toContain('__exactBoundary(');
		expect(server).not.toContain('__exactHydration: "interaction"');
		const analysis = analyzeSource(source, { filename: 'Panel.tsx' });
		expect(
			analysis.boundaries
				.filter((boundary) => boundary.activation)
				.map((boundary) => boundary.activation!.reasons[0]?.code)
		).toEqual(['ref', 'unsupported-event']);
	});

	it('keeps islands with opaque spread attributes eager', () => {
		const source =
			'import { TaskContext } from "@exactjs/core";\n\n\t\t\timport { readFile } from "node:fs/promises";\n\t\t\texport function Panel(\n\t\t\t\tthis: Component<{ count: number }>,\n\t\t\t\tprops: { events: { onClick(): void } }\n\t\t\t) {\n\t\t\t\tconst runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n\t\t\t\t\tawait readFile("panel.txt", "utf8");\n\t\t\t\t};\nrunFixtureTask();\n\t\t\t\treturn () => (\n\t\t\t\t\t<button {...props.events} onClick={() => this.state.count++}>\n\t\t\t\t\t\tSave\n\t\t\t\t\t</button>\n\t\t\t\t);\n\t\t\t}\n\t\t';
		const server = transform(source, {
			filename: 'Panel.tsx',
			target: 'server',
			serverComponents: true
		});

		expect(server).toContain('__exactBoundary(');
		expect(server).not.toContain('__exactHydration: "interaction"');
		expect(
			analyzeSource(source, { filename: 'Panel.tsx' }).boundaries[0]?.activation?.reasons[0]?.code
		).toBe('opaque-spread');
	});

	it('does not broaden an interaction sibling for unrelated eager work', () => {
		const source = `
			export function Panel(this: Component<{}>) {
				return () => <>
					<div onMouseMove={() => undefined}>Track</div>
					<button onClick={() => undefined}>Open</button>
				</>;
			}
		`;
		const decisions = analyzeSource(source, { filename: 'Panel.tsx' })
			.boundaries.filter((boundary) => boundary.activation)
			.map((boundary) => boundary.activation!.mode);
		expect(decisions).toEqual(['eager', 'interaction']);
	});

	it('rejects named handlers that observe event data outside the replay policy', () => {
		const source = `
			export function Panel(this: Component<{}>) {
				function inspect(event: InputEvent) { console.log(event.data); }
				return () => <input onInput={inspect} />;
			}
		`;
		const analysis = analyzeSource(source, { filename: 'Panel.tsx' });
		expect(analysis.boundaries[0]?.activation?.reasons).toEqual([
			expect.objectContaining({ code: 'unsupported-event-data', detail: 'onInput' })
		]);
	});

	it('rejects retained, forwarded, and policy-incompatible event data', () => {
		const source = `
			declare function inspect(value: unknown): void;
			export function Panel(this: Component<{}>) {
				return () => <>
					<button onClick={(event) => inspect(event)}>Forwarded</button>
					<button onClick={(event) => inspect(event.target.value)}>Value</button>
					<input onInput={async (event) => { await Promise.resolve(); inspect(event.target.value); }} />
				</>;
			}
		`;
		const reasons = analyzeSource(source, { filename: 'Panel.tsx' })
			.boundaries.filter((boundary) => boundary.activation)
			.map((boundary) => boundary.activation!.reasons[0]?.code);

		expect(reasons).toEqual([
			'unsupported-event-data',
			'unsupported-event-data',
			'unsupported-event-data'
		]);
	});

	it('defers islands with statically inspectable prop spreads and sanitizes their fallback', () => {
		const source =
			'import { TaskContext } from "@exactjs/core";\n\n\t\t\timport { readFile } from "node:fs/promises";\n\t\t\texport function Panel(this: Component<{ count: number }>) {\n\t\t\t\tconst runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n\t\t\t\t\tawait readFile("panel.txt", "utf8");\n\t\t\t\t};\nrunFixtureTask();\n\t\t\t\treturn () => (\n\t\t\t\t\t<button\n\t\t\t\t\t\t{...{ title: "Save" }}\n\t\t\t\t\t\tonClick={() => this.state.count++}\n\t\t\t\t\t>\n\t\t\t\t\t\tSave\n\t\t\t\t\t</button>\n\t\t\t\t);\n\t\t\t}\n\t\t';
		const server = transform(source, {
			filename: 'Panel.tsx',
			target: 'server',
			serverComponents: true
		});

		expect(server).toContain('__exactHydration: "interaction"');
		expect(server).toContain('title: "Save"');
		expect(server).not.toContain('onClick');
		const decision = analyzeSource(source, { filename: 'Panel.tsx' }).boundaries[0]?.activation;
		expect(decision).toEqual(
			expect.objectContaining({
				mode: 'interaction',
				reasons: [],
				targets: [
					expect.objectContaining({
						events: [{ type: 'click', replay: 'native-click' }]
					})
				]
			})
		);
	});

	it('proves immutable finite spreads and preserves handler overwrite order across artifacts', () => {
		const source = `
			import { TaskContext } from '@exactjs/core';
			import { readFile } from 'node:fs/promises';
			const base = { title: 'Base', onClick: () => console.log('base') } as const;
			const attrs = { ...base, title: 'Final', onClick: () => console.log('final') } satisfies { title: string; onClick(): void };
			export function Panel(this: Component<{}>) {
				const load = async (_task: TaskContext = TaskContext.server()) => { await readFile('panel.txt'); };
				load();
				return () => <button {...attrs}>Save</button>;
			}
		`;
		const analysis = analyzeSource(source, { filename: 'Panel.tsx' });
		const client = transform(source, {
			filename: 'Panel.tsx',
			target: 'client',
			componentContractProjection: 'hydrate',
			serverComponents: true
		});
		const server = transform(source, {
			filename: 'Panel.tsx',
			target: 'server',
			serverComponents: true
		});

		expect(analysis.boundaries[0]?.activation?.mode).toBe('interaction');
		expect(client).toContain("onClick: () => console.log('final')");
		expect(client.indexOf("onClick: () => console.log('final')")).toBeGreaterThan(
			client.indexOf("onClick: () => console.log('base')")
		);
		expect(client).not.toContain('__exactClientProps');
		expect(server).toContain("title: 'Final'");
		expect(server).toContain(
			'{ title: \'Final\', __exactHydration: "interaction", __exactHydrationFallback:'
		);
	});

	it('expands owner-local finite spreads without serializing their function container', () => {
		const source = `
			import { TaskContext } from '@exactjs/core';
			import { readFile } from 'node:fs/promises';
			declare class Component<S> { state: S; }
			export function Panel(this: Component<{ count: number; label: string }>) {
				const load = async (_task: TaskContext = TaskContext.server()) => { await readFile('panel.txt'); };
				load();
				const attrs = {
					title: this.state.label,
					onClick: () => this.state.count++
				};
				return () => <button {...attrs}>Save</button>;
			}
		`;
		const client = transform(source, {
			filename: 'Panel.tsx',
			target: 'client',
			componentContractProjection: 'hydrate',
			serverComponents: true
		});
		const server = transform(source, {
			filename: 'Panel.tsx',
			target: 'server',
			serverComponents: true
		});

		expect(analyzeSource(source, { filename: 'Panel.tsx' }).boundaries[0]?.activation?.mode).toBe(
			'interaction'
		);
		expect(server).not.toContain('__exactCapture: attrs');
		expect(server).toContain('"__exactState": { count: this.state.count }');
		expect(server).toContain('title: this.state.label');
		expect(client).toContain('__exactUpdateResult(this.state, ["count"]');
		expect(client).not.toContain('__exactClientProps');
	});

	it('accepts conditional finite spreads only when every branch has the same keys', () => {
		const finite = `
			import { TaskContext } from '@exactjs/core';
			import { readFile } from 'node:fs/promises';
			declare class Component<S> { state: S; }
			export function Panel(this: Component<{ alternate: boolean; count: number }>) {
				const load = async (_task: TaskContext = TaskContext.server()) => { await readFile('panel.txt'); };
				load();
				const attrs = this.state.alternate
					? { title: 'First', onClick: () => this.state.count++ }
					: { onClick: () => this.state.count--, title: 'Second' };
				return () => <button {...attrs}>Save</button>;
			}
		`;
		const mismatched = `
			import { TaskContext } from '@exactjs/core';
			import { readFile } from 'node:fs/promises';
			declare class Component<S> { state: S; }
			export function Panel(this: Component<{ alternate: boolean }>) {
				const load = async (_task: TaskContext = TaskContext.server()) => { await readFile('panel.txt'); };
				load();
				const attrs = this.state.alternate
					? { title: 'First', onClick: () => undefined }
					: { title: 'Second' };
				return () => <button {...attrs}>Save</button>;
			}
		`;
		const client = transform(finite, {
			filename: 'Panel.tsx',
			target: 'client',
			componentContractProjection: 'hydrate',
			serverComponents: true
		});
		const server = transform(finite, {
			filename: 'Panel.tsx',
			target: 'server',
			serverComponents: true
		});

		expect(analyzeSource(finite, { filename: 'Panel.tsx' }).boundaries[0]?.activation?.mode).toBe(
			'interaction'
		);
		expect(client).toContain('this.state.alternate ? () =>');
		expect(server).toContain("this.state.alternate ? 'First' : 'Second'");
		expect(
			analyzeSource(mismatched, { filename: 'Panel.tsx' }).boundaries[0]?.activation?.reasons[0]
				?.code
		).toBe('opaque-spread');
	});

	it('lowers namespaced form bindings inside generated client islands', () => {
		const source =
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n      declare class Component<S> {\n        state: S;\n        task: { server(work: () => Promise<void>): void };\n      }\n\n      export function Panel(this: Component<{ name: string }>) {\n        this.state.name = "";\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask();\n        return () => <input value:onInput={this.state.name} />;\n      }\n    ';
		const client = transform(source, {
			filename: 'Panel.tsx',
			target: 'client',
			componentContractProjection: 'hydrate',
			serverComponents: true
		});
		const server = transform(source, {
			filename: 'Panel.tsx',
			target: 'server',
			serverComponents: true
		});

		expect(client).toContain('value: __exactExpression(() => this.state.name ?? "")');
		expect(client).toContain('__exactBindInput:');
		expect(client).not.toContain('value:onInput');
		expect(server).toContain('"__exactState": { name: this.state.name }');
		expect(server).not.toContain('value:onInput');
		expect(server).toContain('__exactHydration: "interaction"');
		expect(
			analyzeSource(source, { filename: 'Panel.tsx' }).boundaries[0]?.activation?.targets[0]?.events
		).toEqual([{ type: 'input', replay: 'latest-value' }]);
	});

	it('bridges owner-local captures into generated client islands', () => {
		const source =
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      export function Panel(this: Component<{ count: number }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask();\n        const label = String(this.state.count);\n        return () => <button onClick={() => console.log(label)}>\n          {label}\n        </button>;\n      }\n    ';
		const client = transform(source, {
			filename: 'Panel.tsx',
			target: 'client',
			componentContractProjection: 'hydrate',
			serverComponents: true
		});
		const server = transform(source, {
			filename: 'Panel.tsx',
			target: 'server',
			serverComponents: true
		});

		expect(server).not.toContain('"__exactCapture"');
		expect(server).toContain('"__exactState": { count: this.state.count }');
		expect(client).toContain('const label = __exactDerived(() => String(this.state.count));');
		expect(client).toContain('console.log(label.get())');
		expect(client).toContain('__exactDynamic(() => label.get()');
	});

	it('does not capture shadowed client island identifiers', () => {
		const source =
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      export function Panel(this: Component<{ count: number }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask();\n        const label = String(this.state.count);\n        return () => <button onClick={(label) => console.log(label)}>Save</button>;\n      }\n    ';
		const client = transform(source, {
			filename: 'Panel.tsx',
			target: 'client',
			componentContractProjection: 'hydrate',
			serverComponents: true
		});
		const server = transform(source, {
			filename: 'Panel.tsx',
			target: 'server',
			serverComponents: true
		});

		expect(server).not.toContain('__exactCapture');
		expect(client).toContain('onClick: (label) => console.log(label)');
		expect(client).not.toContain('props.__exactCapture.label');
	});

	it('bridges component-local function captures into generated client islands', () => {
		const source =
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      export function Panel(this: Component<{ count: number }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask();\n        function save() {\n          this.state.count++;\n        }\n        return () => <button onClick={() => save()}>Save</button>;\n      }\n    ';
		const client = transform(source, {
			filename: 'Panel.tsx',
			target: 'client',
			componentContractProjection: 'hydrate',
			serverComponents: true
		});
		const server = transform(source, {
			filename: 'Panel.tsx',
			target: 'server',
			serverComponents: true
		});

		expect(server).not.toContain('__exactCapture');
		expect(client).toContain('function save()');
		expect(client).toContain('onClick: () => save()');
	});

	it('clones component-local arrow function captures into generated client islands', () => {
		const source =
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      export function Panel(this: Component<{ count: number }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask();\n        const save = () => this.state.count++;\n        return () => <button onClick={() => save()}>Save</button>;\n      }\n    ';
		const client = transform(source, {
			filename: 'Panel.tsx',
			target: 'client',
			componentContractProjection: 'hydrate',
			serverComponents: true
		});
		const server = transform(source, {
			filename: 'Panel.tsx',
			target: 'server',
			serverComponents: true
		});

		expect(server).not.toContain('__exactCapture');
		expect(client).toContain('const save = () => __exactUpdateResult(this.state, ["count"]');
		expect(client).toContain('onClick: () => save()');
	});

	it('does not generate nested client islands inside an extracted element island', () => {
		const source =
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      export function Panel(this: Component<{ count: number }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask();\n        return () => <section onClick={() => this.state.count++}>\n          <button onClick={() => this.state.count++}>Nested</button>\n        </section>;\n      }\n    ';
		const analysis = analyzeSource(source, { filename: 'Panel.tsx' });
		const client = transform(source, {
			filename: 'Panel.tsx',
			target: 'client',
			componentContractProjection: 'hydrate',
			serverComponents: true
		});
		const server = transform(source, {
			filename: 'Panel.tsx',
			target: 'server',
			serverComponents: true
		});

		expect(analysis.components[0]!.clientIslandCount).toBe(1);
		expect(client).toContain('export function Panel_ExactClient_1(this: any, props: any = {})');
		expect(client).not.toContain('export function Panel_ExactClient_2');
		expect(server).toContain('Panel_ExactClient_1');
		expect(server).not.toContain('Panel_ExactClient_2');
		expect(analysis.boundaries[0]?.activation?.targets).toHaveLength(2);
	});

	it('broadens only an unsplittable island owner for nested eager work', () => {
		const source = `
			export function Panel(this: Component<{}>) {
				return () => <section onClick={() => undefined}>
					<input ref={undefined} />
				</section>;
			}
		`;
		const decision = analyzeSource(source, { filename: 'Panel.tsx' }).boundaries[0]?.activation;
		expect(decision?.mode).toBe('eager');
		expect(decision?.reasons.map((reason) => reason.code)).toEqual(['ref', 'unsplittable-owner']);
	});

	it('keeps server-only child subgraphs server-owned inside generated element islands', () => {
		const source =
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      function ServerSummary(this: Component<{ title: string }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          this.state.title = await readFile("summary.txt", "utf8");\n        };\nrunFixtureTask();\n        return () => <p>{this.state.title}</p>;\n      }\n\n      export function Panel(this: Component<{ count: number }>) {\n        this.state.count = 0;\n        const runFixtureTask2 = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask2();\n        return () => <section onClick={() => this.state.count++}>\n          <div className="summary"><ServerSummary /></div>\n        </section>;\n      }\n    ';
		const analysis = analyzeSource(source, { filename: 'Panel.tsx' });
		const client = transform(source, {
			filename: 'Panel.tsx',
			target: 'client',
			componentContractProjection: 'hydrate',
			serverComponents: true
		});
		const server = transform(source, {
			filename: 'Panel.tsx',
			target: 'server',
			serverComponents: true
		});

		expect(
			analysis.components.find((component) => component.name === 'Panel')!.clientIslandCount
		).toBe(1);
		expect(analysis.boundaries).toContainEqual(
			expect.objectContaining({
				name: 'Panel_ExactClient_1:children',
				kind: 'server-slot'
			})
		);
		expect(client).toContain('export function Panel_ExactClient_1(this: any, props: any = {})');
		expect(client).toContain('props.children');
		expect(client).not.toContain('ServerSummary');
		expect(client).not.toContain('readFile');
		expect(server).toContain('__exactBoundary');
		expect(server).toContain('__exactHydration: "interaction"');
		expect(server).toContain('Panel_ExactClient_1');
		expect(server).toContain('__exactVNode("div"');
		expect(server).toContain('__exactComponentVNode(ServerSummary');
		expect(server).toContain('readFile');
		expect(
			analysis.boundaries.find((boundary) => boundary.name === 'Panel_ExactClient_1')?.activation
		).toEqual(expect.objectContaining({ mode: 'interaction' }));
	});
});
