import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { analyzeSource } from './compilation/source-analysis.js';

describe('placement inference performance guard', () => {
	it('keeps a deep fixed-point fixture within investigated time and analysis bounds', () => {
		const depth = 120;
		const helpers = Array.from({ length: depth }, (_, index) =>
			index === depth - 1
				? `function helper${index}() { return process.env.VALUE; }`
				: `function helper${index}() { return helper${index + 1}(); }`
		).join('\n');
		const source = `import { TaskContext } from "@exactjs/core";
${helpers}
      export function Page(this: Component<{ value?: string }>) {
        function load(_task: TaskContext = TaskContext.latest()) { this.state.value = helper0(); }
        load();
        return () => <p />;
      }`;
		const started = performance.now();
		const analysis = analyzeSource(source, { filename: 'C:/fixtures/deep-placement.tsx' });
		const elapsed = performance.now() - started;

		expect(analysis.components[0]!.tasks[0]!.placement).toBe('server');
		expect(analysis.callables).toHaveLength(depth + 3);
		expect(JSON.stringify(analysis).length).toBeLessThan(750_000);
		expect(elapsed).toBeLessThan(10_000);
	});
});
