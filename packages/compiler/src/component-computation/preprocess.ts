import ts from 'typescript';
import {
	collectDirectComponentAwaits,
	isAwaitedComponentTask,
	planAsyncComponentComputation
} from './async-component-preprocess.js';
import {
	analyzeComponentComputationLocals,
	componentEnvironmentBindings,
	inspectComponentStatement,
	type ComponentStatementEffects
} from './analysis.js';
import {
	applyComponentComputationEdits,
	componentComputationError,
	componentStateTargets,
	isComponentComputationFunction,
	isComponentTaskExpression,
	type ComponentComputationTextEdit
} from './syntax.js';
import { preprocessComponentStateDestructuring } from './state-destructuring-preprocess.js';

/**
 * Normalizes compiler-owned component computations into the existing task syntax.
 *
 * The pass deliberately preserves authored statement text and control-flow regions. This lets the
 * ordinary task analyzer remain the single owner of dependency capture, placement, cancellation,
 * resource lifetime, distributed continuation, and staged publication semantics.
 */
export function preprocessComponentComputations(source: string, filename = 'input.tsx'): string {
	const destructuringNormalized = preprocessComponentStateDestructuring(source, filename);
	const sourceFile = ts.createSourceFile(
		filename,
		destructuringNormalized,
		ts.ScriptTarget.ES2022,
		true,
		ts.ScriptKind.TSX
	);
	const edits: ComponentComputationTextEdit[] = [];
	const environmentBindings = componentEnvironmentBindings(sourceFile);

	const visit = (node: ts.Node): void => {
		if (isComponentComputationFunction(node) && node.body && ts.isBlock(node.body)) {
			planComponentEdits(sourceFile, node, environmentBindings, edits);
			return;
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);

	return applyComponentComputationEdits(destructuringNormalized, edits);
}

function planComponentEdits(
	sourceFile: ts.SourceFile,
	component: ts.FunctionLikeDeclaration,
	environmentBindings: ReadonlySet<string>,
	edits: ComponentComputationTextEdit[]
): void {
	const body = component.body;
	if (!body || !ts.isBlock(body)) return;
	const statements = [...body.statements];
	const renderReturn =
		statements.at(-1) && ts.isReturnStatement(statements.at(-1)!)
			? (statements.at(-1) as ts.ReturnStatement)
			: undefined;
	const setupStatements = renderReturn ? statements.slice(0, -1) : statements;
	if (!setupStatements.length) return;

	const asyncModifier = ts
		.getModifiers(component)
		?.find((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword);
	const rawAwaits = setupStatements.flatMap((statement) => collectDirectComponentAwaits(statement));
	if (
		asyncModifier &&
		rawAwaits.some((awaitExpression) => !isAwaitedComponentTask(awaitExpression))
	) {
		planAsyncComponentComputation(sourceFile, setupStatements, renderReturn, asyncModifier, edits);
		return;
	}

	const locals = analyzeComponentComputationLocals(component, setupStatements, environmentBindings);
	const computations: Array<
		Readonly<{ statement: ts.Statement; effects: ComponentStatementEffects }>
	> = [];
	for (const statement of setupStatements) {
		if (isAuthoredTaskStatement(statement) || isComponentStateInitialization(statement)) continue;
		const effects = inspectComponentStatement(statement, locals);
		if (effects.writes.length && effects.reactive) computations.push({ statement, effects });
	}
	validateSynchronousComputationCycles(sourceFile, computations);
	for (const { statement } of computations) {
		edits.push(
			{
				start: statement.getStart(sourceFile),
				end: statement.getStart(sourceFile),
				text: 'this.task(() => { ',
				order: 0
			},
			{
				start: statement.end,
				end: statement.end,
				text: ' });',
				order: 1
			}
		);
	}
}

/**
 * Recognizes the established nullish state-initialization spelling.
 *
 * A `??=` setup write deliberately keeps an existing state value and therefore cannot benefit
 * from replay when an input changes. Keeping it in setup also preserves client-island ownership.
 */
function isComponentStateInitialization(statement: ts.Statement): boolean {
	return (
		ts.isExpressionStatement(statement) &&
		ts.isBinaryExpression(statement.expression) &&
		statement.expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken &&
		componentStateTargets(statement.expression.left).length > 0
	);
}

function isAuthoredTaskStatement(statement: ts.Statement): boolean {
	return (
		ts.isExpressionStatement(statement) &&
		ts.isCallExpression(statement.expression) &&
		isComponentTaskExpression(statement.expression.expression)
	);
}

function validateSynchronousComputationCycles(
	sourceFile: ts.SourceFile,
	computations: readonly Readonly<{
		statement: ts.Statement;
		effects: ComponentStatementEffects;
	}>[]
): void {
	const writes = computations.flatMap(({ effects }) =>
		effects.writes.filter(
			(write): write is Readonly<{ node: ts.Node; path: string }> => !!write.path
		)
	);
	const nodes = [...new Set(writes.map((write) => write.path))];
	const edges = new Map<string, Set<string>>(nodes.map((path) => [path, new Set()]));
	for (const { effects } of computations) {
		for (const write of effects.writes) {
			if (!write.path) continue;
			for (const read of effects.readPaths)
				for (const target of nodes)
					if (pathsOverlap(read, target)) edges.get(write.path)?.add(target);
		}
	}
	const active = new Set<string>();
	const complete = new Set<string>();
	const visit = (path: string): boolean => {
		if (active.has(path)) return true;
		if (complete.has(path)) return false;
		active.add(path);
		for (const dependency of edges.get(path) ?? []) if (visit(dependency)) return true;
		active.delete(path);
		complete.add(path);
		return false;
	};
	for (const path of nodes) {
		if (!visit(path)) continue;
		const write = writes.find((candidate) => candidate.path === path)!;
		throw componentComputationError(
			sourceFile,
			write.node,
			`error: derived state assignment involving ${path} creates a reactive dependency cycle; wrap one read in peek(() => ...) for a snapshot or use this.task() for deliberate feedback`
		);
	}
}

function pathsOverlap(left: string, right: string): boolean {
	return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}
