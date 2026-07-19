import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createExpressionProject } from './test-support/project.js';

const root = path.resolve(import.meta.dirname, '../../..');
const kanbanConfig = path.join(root, 'apps/kanban/tsconfig.json');

describe('@exact/expressions: control flow', () => {
	it('builds immutable control-flow graphs with branch and terminal edges', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__control_flow.ts');
		const module = project.updateModule(
			filename,
			`function choose(value: number) {
      if (value > 0) return 1;
      value++;
      return value;
    }`
		);
		const fn = module.walk().functions().single();
		const graph = module.controlFlowOf(fn);
		const branch = graph.nodes.find((node) => node.expression.kind === 'IfStatement')!;
		const firstReturn = graph.nodes.find((node) => node.expression.kind === 'ReturnStatement')!;
		const update = graph.nodes.find((node) => node.expression.kind === 'ExpressionStatement')!;
		expect(branch.successors).toEqual(expect.arrayContaining([firstReturn.id, update.id]));
		expect(firstReturn.successors).toEqual([]);
		expect(graph.exits.filter((id) => graph.byId.get(id)?.terminal)).toHaveLength(2);
		expect(module.controlFlowOf(fn)).toBe(graph);
	});

	it('models switch fallthrough, loop control, and finally execution', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__expressions_control_edges.ts');
		const module = project.updateModule(
			filename,
			`function run(value: number) {
      while (value--) { if (value === 2) continue; if (value === 1) break; }
      switch (value) { case 0: value++; case 1: value++; break; default: return value; }
      try { return value; } finally { value++; }
    }`
		);
		const graph = module.controlFlowOf(module.walk().functions().single());
		const flow = (kind: string) => graph.nodes.filter((node) => node.expression.kind === kind);
		expect(flow('ContinueStatement')[0]?.successors.length).toBe(1);
		expect(flow('BreakStatement').some((node) => node.successors.length === 1)).toBe(true);
		expect(
			flow('ReturnStatement').some((node) =>
				node.successors.some((id) => graph.byId.get(id)?.expression.kind === 'ExpressionStatement')
			)
		).toBe(true);
	});

	it('models catch paths as exceptions rather than normal branches', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__expressions_exception_edges.ts');
		const module = project.updateModule(
			filename,
			`function run() { try { work(); } catch { recover(); } finally { cleanup(); } }`
		);
		const graph = module.controlFlowOf(module.walk().functions().single());
		const work = graph.nodes.find(
			(node) =>
				node.expression.kind === 'ExpressionStatement' && node.expression.text?.includes('work()')
		)!;
		const catchEdge = work.successorEdges.find((edge) => edge.kind === 'exception');
		expect(catchEdge).toBeDefined();
		expect(graph.byId.get(catchEdge!.target)?.expression.text).toContain('recover()');
		expect(
			graph.nodes.some((node) => node.successorEdges.some((edge) => edge.kind === 'finally'))
		).toBe(true);
	});

	it('does not route guaranteed non-throwing abrupt completion into catch', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__expressions_precise_exception_edges.ts');
		const module = project.updateModule(
			filename,
			`function bare() { try { return; } catch { recover(); } }
      function evaluated() { try { return work(); } catch { recover(); } }
      function temporalDeadZone() { try { return value; let value = 1; } catch { recover(); } }
      function thrown() { try { throw new Error(); } catch { recover(); } }`
		);
		const graphs = module
			.walk()
			.functions()
			.toArray()
			.map((fn) => module.controlFlowOf(fn));
		const bareReturn = graphs[0]!.nodes.find((node) => node.expression.kind === 'ReturnStatement')!;
		const evaluatedReturn = graphs[1]!.nodes.find(
			(node) => node.expression.kind === 'ReturnStatement'
		)!;
		const temporalDeadZone = graphs[2]!.nodes.find(
			(node) => node.expression.kind === 'ReturnStatement'
		)!;
		const thrown = graphs[3]!.nodes.find((node) => node.expression.kind === 'ThrowStatement')!;
		expect(bareReturn.successorEdges.some((edge) => edge.kind === 'exception')).toBe(false);
		expect(evaluatedReturn.successorEdges.some((edge) => edge.kind === 'exception')).toBe(true);
		expect(temporalDeadZone.successorEdges.some((edge) => edge.kind === 'exception')).toBe(true);
		expect(thrown.successorEdges.some((edge) => edge.kind === 'exception')).toBe(true);
		expect(graphs[3]!.exits).not.toContain(thrown.id);
	});

	it('routes labeled loop jumps through finally and excludes unreachable exits', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__expressions_labeled_finally.ts');
		const module = project.updateModule(
			filename,
			`function run(values: number[]) {
      outer: for (const value of values) {
        try {
          if (value < 0) continue outer;
          if (value === 0) break outer;
        } finally { cleanup(value); }
      }
      return 1;
      cleanup(never);
    }`
		);
		const graph = module.controlFlowOf(module.walk().functions().single());
		const jumps = graph.nodes.filter(
			(node) =>
				node.expression.kind === 'BreakStatement' || node.expression.kind === 'ContinueStatement'
		);
		expect(jumps).toHaveLength(2);
		expect(jumps.every((node) => node.successorEdges.some((edge) => edge.kind === 'finally'))).toBe(
			true
		);
		const unreachable = graph.nodes.find((node) =>
			node.expression.text?.includes('cleanup(never)')
		)!;
		expect(unreachable.predecessors).toEqual([]);
		expect(graph.exits).not.toContain(unreachable.id);
	});

	it('preserves pending completion through normally completing finalizer branches', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__expressions_conditional_finally.ts');
		const module = project.updateModule(
			filename,
			`function run(override: boolean) {
      try { return 1; }
      finally { if (override) return 2; cleanup(); }
    }`
		);
		const graph = module.controlFlowOf(module.walk().functions().single());
		const returns = graph.nodes.filter((node) => node.expression.kind === 'ReturnStatement');
		const cleanup = graph.nodes.find(
			(node) =>
				node.expression.kind === 'ExpressionStatement' &&
				node.expression.text?.includes('cleanup()')
		)!;
		expect(returns).toHaveLength(2);
		expect(graph.exits).toEqual(expect.arrayContaining(returns.map((node) => node.id)));
		expect(cleanup.predecessors.length).toBeGreaterThan(0);
	});
});
