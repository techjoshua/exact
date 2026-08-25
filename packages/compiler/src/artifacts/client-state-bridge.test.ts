import { describe, expect, it } from 'vitest';
import { transform } from '../index.js';

describe('@exactjs/compiler: client state bridges', () => {
	it('emits valid state snapshots for non-identifier path segments', () => {
		const output = transform(
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      export function Panel(this: Component<{ items: Record<string, { title: string }> }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask();\n        return () => <button title={this.state.items["first-item"].title} onClick={() => save()} />;\n      }\n    ',
			{ filename: 'Panel.tsx', target: 'server', serverComponents: true }
		);

		expect(output).toContain('"first-item": { title: this.state.items["first-item"].title }');
		expect(output).not.toContain('this.state.items.first-item');
	});

	it('generates client island components with state bridge initialization', () => {
		const output = transform(
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      export function Panel(this: Component<{ count: number }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask();\n        return () => <button title={this.state.count} onClick={() => this.state.count++} />;\n      }\n    ',
			{
				filename: 'Panel.tsx',
				target: 'client',
				componentContractProjection: 'hydrate',
				serverComponents: true
			}
		);

		expect(output).toContain('export function Panel_ExactClient_1(this: any, props: any = {})');
		expect(output).toContain('Object.assign(this.state, props.__exactState)');
		expect(output).toContain('title: __exactExpression(() => __exactReadState(this.state, 0)');
		expect(output).toContain(
			'onClick: () => __exactUpdateStateResult(this.state, 0, previous =>'
		);
		expect(output).not.toContain('export const Panel_ExactClient_1 = Panel');
	});

	it('omits server-owned roots from client artifacts in server component mode', () => {
		const output = transform(
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      export function Panel(this: Component<{ count: number }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask();\n        return () => <button title={this.state.count} onClick={() => this.state.count++} />;\n      }\n    ',
			{
				filename: 'Panel.tsx',
				target: 'client',
				componentContractProjection: 'hydrate',
				serverComponents: true
			}
		);

		expect(output).toContain('export function Panel_ExactClient_1(this: any, props: any = {})');
		expect(output).toMatch(/export const Panel = \/\* @__PURE__ \*\/ \(\(\) => Object\.assign/);
		expect(output).toContain('__exactBoundary(');
		expect(output).not.toContain('node:fs/promises');
		expect(output).not.toContain('readFile');
		expect(output).toContain(
			'onClick: () => __exactUpdateStateResult(this.state, 0, previous =>'
		);
	});

	it('keeps pure client components in client artifacts during server component mode', () => {
		const output = transform(
			`
      function ClientWidget() {
        return () => <button onClick={() => save()}>Save</button>;
      }

      export function Page() {
        return () => <main><ClientWidget /></main>;
      }
    `,
			{ filename: 'Page.tsx', target: 'client', serverComponents: true }
		);

		expect(output).toContain('function ClientWidget(this: object)');
		expect(output).toMatch(/export const Page = \/\* @__PURE__ \*\/ \(\(\) => Object\.assign/);
		expect(output).toContain('__exactApply("__exactClosedInteraction:onClick", () => save())');
		expect(output).toContain('directClaims: true');
	});
});
