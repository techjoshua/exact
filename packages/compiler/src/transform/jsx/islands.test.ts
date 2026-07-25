import { describe, expect, it } from 'vitest';
import { analyzeSource, transform } from '../../index.js';

describe('@exactjs/compiler: islands', () => {
	it('generates child-bearing client island components with state bridge props', () => {
		const source = `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number; label: string }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        return () => <button title={this.state.label} onClick={() => this.state.count++}>
          Save {this.state.count}
        </button>;
      }
    `;
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
		expect(client).toContain('onClick: () => this.state.count++');
		expect(client).toContain('__exactDynamic(() => this.state.count)');
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
		const source = `
			import { readFile } from "node:fs/promises";
			export function Panel(
				this: Component<{ count: number }>,
				props: { events: { onClick(): void } }
			) {
				this.task.server(async () => {
					await readFile("panel.txt", "utf8");
				});
				return () => (
					<button {...props.events} onClick={() => this.state.count++}>
						Save
					</button>
				);
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

	it('lowers namespaced form bindings inside generated client islands', () => {
		const source = `
      import { readFile } from "node:fs/promises";
      declare class Component<S> {
        state: S;
        task: { server(work: () => Promise<void>): void };
      }

      export function Panel(this: Component<{ name: string }>) {
        this.state.name = "";
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        return () => <input value:input={this.state.name} />;
      }
    `;
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
		expect(client).not.toContain('value:input');
		expect(server).toContain('"__exactState": { name: this.state.name }');
		expect(server).not.toContain('value:input');
	});

	it('bridges owner-local captures into generated client islands', () => {
		const source = `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        const label = String(this.state.count);
        return () => <button onClick={() => console.log(label)}>
          {label}
        </button>;
      }
    `;
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

		expect(server).toContain('"__exactCapture": { label: label }');
		expect(client).toContain('console.log(props.__exactCapture.label)');
		expect(client).toContain('__exactDynamic(() => props.__exactCapture.label)');
	});

	it('does not capture shadowed client island identifiers', () => {
		const source = `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        const label = String(this.state.count);
        return () => <button onClick={(label) => console.log(label)}>Save</button>;
      }
    `;
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
		const source = `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        function save() {
          this.state.count++;
        }
        return () => <button onClick={() => save()}>Save</button>;
      }
    `;
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
		const source = `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        const save = () => this.state.count++;
        return () => <button onClick={() => save()}>Save</button>;
      }
    `;
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
		expect(client).toContain('const save = () => this.state.count++;');
		expect(client).toContain('onClick: () => save()');
	});

	it('does not generate nested client islands inside an extracted element island', () => {
		const source = `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        return () => <section onClick={() => this.state.count++}>
          <button onClick={() => this.state.count++}>Nested</button>
        </section>;
      }
    `;
		const manifest = analyzeSource(source, { filename: 'Panel.tsx' });
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

		expect(manifest.components[0]!.clientIslandCount).toBe(1);
		expect(client).toContain('export function Panel_ExactClient_1(this: any, props: any = {})');
		expect(client).not.toContain('export function Panel_ExactClient_2');
		expect(server).toContain('Panel_ExactClient_1');
		expect(server).not.toContain('Panel_ExactClient_2');
	});

	it('keeps server-only child subgraphs server-owned inside generated element islands', () => {
		const source = `
      import { readFile } from "node:fs/promises";

      function ServerSummary(this: Component<{ title: string }>) {
        this.task.server(async () => {
          this.state.title = await readFile("summary.txt", "utf8");
        });
        return () => <p>{this.state.title}</p>;
      }

      export function Panel(this: Component<{ count: number }>) {
        this.state.count = 0;
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        return () => <section onClick={() => this.state.count++}>
          <div className="summary"><ServerSummary /></div>
        </section>;
      }
    `;
		const manifest = analyzeSource(source, { filename: 'Panel.tsx' });
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
			manifest.components.find((component) => component.name === 'Panel')!.clientIslandCount
		).toBe(1);
		expect(manifest.boundaries).toContainEqual(
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

	it('keeps imported server child subgraphs server-owned inside generated element islands', () => {
		const childManifest = analyzeSource(
			`
      import { readFile } from "node:fs/promises";

      export function ServerSummary(this: Component<{ title: string }>) {
        this.task.server(async () => {
          this.state.title = await readFile("summary.txt", "utf8");
        });
        return () => <p>{this.state.title}</p>;
      }
    `,
			{ filename: '/pkg/ServerSummary.tsx' }
		);
		const source = `
      import { readFile } from "node:fs/promises";
      import { ServerSummary } from "./ServerSummary";

      export function Panel(this: Component<{ count: number }>) {
        this.state.count = 0;
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        return () => <section onClick={() => this.state.count++}>
          <div className="summary"><ServerSummary /></div>
        </section>;
      }
    `;
		const client = transform(source, {
			filename: '/pkg/Panel.tsx',
			target: 'client',
			serverComponents: true,
			importedManifests: [childManifest]
		});
		const server = transform(source, {
			filename: '/pkg/Panel.tsx',
			target: 'server',
			serverComponents: true,
			importedManifests: [childManifest]
		});

		expect(client).toContain('export function Panel_ExactClient_1(this: any, props: any = {})');
		expect(client).toContain('props.children');
		expect(client).not.toContain('ServerSummary');
		expect(server).toContain('__exactVNode(ServerSummary');
		expect(server).toContain('from "./ServerSummary"');
	});
});
