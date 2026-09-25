import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeSource } from './compilation/source-analysis.js';

const progressFixture = `import { TaskContext, type Component } from '@exactjs/core';
export function ProgressExample(this: Component<{ progress: number; result: number }>) {
 this.state.progress = 0;
 this.state.result = 0;
 async function reportProgress(snapshot: number, task: TaskContext = TaskContext.client().progress()) {
  await Promise.resolve();
  this.state.progress = snapshot;
 }
 async function start(task: TaskContext = TaskContext.server()) {
  reportProgress(1);
  await Promise.resolve();
  reportProgress(2);
  this.state.result = 100;
 }
 return () => <button onClick={() => start()}>{this.state.progress}:{this.state.result}</button>;
}`;

describe('task progress compilation', () => {
	it.each([
		'TaskContext.client().progress()',
		'TaskContext.client /* placement */ ().progress /* receiver */ ()'
	])('recognizes progress policy %s', (policy) => {
		const analysis = analyzeSource(
			progressFixture.replace('TaskContext.client().progress()', policy),
			{
				filename: path.join(process.cwd(), 'progress-fixture.tsx')
			}
		);
		const component = analysis.components[0]!;
		const receiver = component.tasks.find((task) => task.progress);
		expect(receiver).toMatchObject({ placement: 'client', readiness: 'nonblocking' });
		expect(analysis.continuations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					progress: [{ id: receiver!.id, label: 'ProgressExample.reportProgress' }],
					placement: 'server'
				})
			])
		);
		expect(
			component.tasks
				.flatMap((task) => task.diagnostics)
				.filter((message) => message.startsWith('error:'))
		).toEqual([]);
	});
	it.each([
		['server placement', 'TaskContext.client().progress()', 'TaskContext.server().progress()'],
		[
			'receiver concurrency',
			'TaskContext.client().progress()',
			'TaskContext.client().progress().latest()'
		],
		['consumed result', 'reportProgress(1);', 'const clientResult = await reportProgress(1);']
	])('diagnoses %s instead of silently changing its semantics', (_label, before, after) => {
		const analysis = analyzeSource(progressFixture.replace(before, after), {
			filename: fixturePath()
		});
		expect(
			analysis.components
				.flatMap((component) => component.tasks)
				.flatMap((task) => task.diagnostics)
				.some((message) => message.startsWith('error:'))
		).toBe(true);
	});
});

function fixturePath() {
	return path.join(process.cwd(), 'invalid-progress-fixture.tsx');
}
