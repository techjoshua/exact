import { describe, expect, it } from 'vitest';
import { analyzeReactiveProvenance, clearExpressionProjectCache } from './index.js';

describe('expression-backed reactive provenance', () => {
	it('classifies calculated locals and explicit snapshots through canonical variables', () => {
		clearExpressionProjectCache();
		const graph = analyzeReactiveProvenance(
			`
      declare function peek<T>(read: () => T): T;
      export function Board(this: { state: { tasks: { done: boolean }[] } }) {
        const visible = this.state.tasks.filter(task => !task.done);
        const snapshot = peek(() => this.state.tasks);
        return <section>{visible.length}:{snapshot.length}</section>;
      }
    `,
			{ filename: 'provenance.tsx' }
		);

		const visible = graph.entries.find((entry) => entry.variable.name === 'visible');
		const snapshot = graph.entries.find((entry) => entry.variable.name === 'snapshot');
		expect(visible?.provenance).toBe('derived');
		expect(visible?.dependencies.some((variable) => variable.name === 'state')).toBe(true);
		expect(snapshot?.provenance).toBe('snapshot');
		expect(visible?.safeToReevaluate).toBe(true);
	});

	it('allows callback-local mutation but rejects captured writes during derived reevaluation', () => {
		clearExpressionProjectCache();
		const graph = analyzeReactiveProvenance(
			`
      export function Totals(props: { values: number[] }) {
        let captured = 0;
        const safe = props.values.reduce((sum, value) => { sum += value; return sum; }, 0);
        const unsafe = props.values.map(value => { captured += value; return value; });
        return <p>{safe}:{unsafe.length}</p>;
      }
    `,
			{ filename: 'derived-safety.tsx' }
		);
		expect(graph.entries.find((entry) => entry.variable.name === 'safe')?.safeToReevaluate).toBe(
			true
		);
		expect(graph.entries.find((entry) => entry.variable.name === 'unsafe')?.safeToReevaluate).toBe(
			false
		);
	});

	it('propagates reactivity through collection callbacks and JSX cells', () => {
		clearExpressionProjectCache();
		const graph = analyzeReactiveProvenance(
			`
      export function Column(props: { tasks: { status: string }[]; status: string }) {
        const visible = props.tasks.filter(task => task.status === props.status);
        return <section>{visible.map(task => task.status)}</section>;
      }
    `,
			{ filename: 'column-provenance.tsx' }
		);

		expect(graph.entries.find((entry) => entry.variable.name === 'props')?.provenance).toBe(
			'props'
		);
		expect(graph.entries.find((entry) => entry.variable.name === 'visible')?.provenance).toBe(
			'derived'
		);
		expect(
			graph.entries
				.filter((entry) => entry.variable.name === 'task')
				.every((entry) => entry.provenance === 'derived')
		).toBe(true);
		expect(graph.cells).toHaveLength(1);
		expect(graph.cells[0]!.kind).toBe('jsx-child');
	});

	it('does not trust collection-like method names on custom objects', () => {
		clearExpressionProjectCache();
		const graph = analyzeReactiveProvenance(
			`
      class SideEffects { filter(callback: (value: number) => boolean) { external(); return [1]; } }
      declare function external(): void;
      export function View(props: { values: SideEffects }) {
        const unsafe = props.values.filter(value => value > 0);
        return <p>{unsafe.length}</p>;
      }
    `,
			{ filename: 'custom-filter.tsx' }
		);
		expect(graph.entries.find((entry) => entry.variable.name === 'unsafe')?.safeToReevaluate).toBe(
			false
		);
	});

	it('propagates initializer dependencies through every destructured binding', () => {
		clearExpressionProjectCache();
		const graph = analyzeReactiveProvenance(
			`
      export function View(props: { record: { first: string; nested: { second: string } } }) {
        const { first, nested: { second } } = props.record;
        return <p>{first}{second}</p>;
      }
    `,
			{ filename: 'destructured-provenance.tsx' }
		);
		expect(graph.entries.find((entry) => entry.variable.name === 'first')?.provenance).toBe(
			'derived'
		);
		expect(graph.entries.find((entry) => entry.variable.name === 'second')?.provenance).toBe(
			'derived'
		);
		expect(graph.cells).toHaveLength(2);
	});
});
