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
			serverComponents: true
		});
		const server = transform(source, {
			filename: 'Panel.tsx',
			target: 'server',
			serverComponents: true
		});

		expect(client).toContain('export function Panel_ExactClient_1(this: any, props: any = {})');
		expect(client).toContain('title: props.title');
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
	});

	it('defers islands with statically inspectable prop spreads and sanitizes their fallback', () => {
		const source =
			'import { TaskContext } from "@exactjs/core";\n\n\t\t\timport { readFile } from "node:fs/promises";\n\t\t\texport function Panel(this: Component<{ count: number }>) {\n\t\t\t\tconst runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n\t\t\t\t\tawait readFile("panel.txt", "utf8");\n\t\t\t\t};\nrunFixtureTask();\n\t\t\t\treturn () => (\n\t\t\t\t\t<button\n\t\t\t\t\t\t{...{ title: "Save" }}\n\t\t\t\t\t\tonPointerUp={() => this.state.count++}\n\t\t\t\t\t>\n\t\t\t\t\t\tSave\n\t\t\t\t\t</button>\n\t\t\t\t);\n\t\t\t}\n\t\t';
		const server = transform(source, {
			filename: 'Panel.tsx',
			target: 'server',
			serverComponents: true
		});

		expect(server).toContain('__exactHydration: "interaction"');
		expect(server).toContain('...{ title: "Save" }');
		expect(server).not.toContain('onPointerUp');
	});

	it('lowers namespaced form bindings inside generated client islands', () => {
		const source =
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n      declare class Component<S> {\n        state: S;\n        task: { server(work: () => Promise<void>): void };\n      }\n\n      export function Panel(this: Component<{ name: string }>) {\n        this.state.name = "";\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask();\n        return () => <input value:onInput={this.state.name} />;\n      }\n    ';
		const client = transform(source, {
			filename: 'Panel.tsx',
			target: 'client',
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
	});

	it('bridges owner-local captures into generated client islands', () => {
		const source =
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      export function Panel(this: Component<{ count: number }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask();\n        const label = String(this.state.count);\n        return () => <button onClick={() => console.log(label)}>\n          {label}\n        </button>;\n      }\n    ';
		const client = transform(source, {
			filename: 'Panel.tsx',
			target: 'client',
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
	});

	it('keeps server-only child subgraphs server-owned inside generated element islands', () => {
		const source =
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      function ServerSummary(this: Component<{ title: string }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          this.state.title = await readFile("summary.txt", "utf8");\n        };\nrunFixtureTask();\n        return () => <p>{this.state.title}</p>;\n      }\n\n      export function Panel(this: Component<{ count: number }>) {\n        this.state.count = 0;\n        const runFixtureTask2 = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask2();\n        return () => <section onClick={() => this.state.count++}>\n          <div className="summary"><ServerSummary /></div>\n        </section>;\n      }\n    ';
		const analysis = analyzeSource(source, { filename: 'Panel.tsx' });
		const client = transform(source, {
			filename: 'Panel.tsx',
			target: 'client',
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
		expect(server).toContain('Panel_ExactClient_1');
		expect(server).toContain('__exactVNode("div"');
		expect(server).toContain('__exactVNode(ServerSummary');
		expect(server).toContain('readFile');
	});
});
