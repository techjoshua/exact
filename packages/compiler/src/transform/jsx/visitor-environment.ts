import type ts from 'typescript';
import type { CallableEffectPlan } from '../../analysis/callable-effects.js';
import type { ExactModuleImportPlan } from '../../assets.js';
import type {
	ExpressionClientIslandSite,
	ExpressionComponentPlan
} from '../../expression/contracts.js';
import type { ExpressionJsxPlan } from '../../expression/jsx.js';
import type {
	ExpressionLifecycleListener,
	ExpressionSetupTask,
	ExpressionTaskPlan,
	ExpressionTaskResource,
	ExpressionTaskSite,
	ExpressionTaskSignalCall
} from '../../expression/task-contracts.js';
import type { ExpressionWritePlan } from '../../expression/writes.js';
import type {
	ClientIslandElementNode,
	ExactImportedComponentIR,
	ExactPlacement,
	HelperNames,
	TransformTarget
} from '../../types.js';
import type { DerivedReactiveIndex } from './contracts.js';
import type { JsxTransformState } from './transform-state.js';

/** Shared immutable services and per-file state used by JSX visitor phases. */
export type JsxVisitorEnvironment = {
	context: ts.TransformationContext;
	sourceFile: ts.SourceFile;
	factory: ts.NodeFactory;
	helpers: HelperNames;
	state: JsxTransformState;
	target: TransformTarget;
	serverComponents: boolean;
	preserveClientAssetImports: boolean;
	callableEffects: CallableEffectPlan;
	moduleImports: ExactModuleImportPlan;
	expressionComponents: ExpressionComponentPlan;
	expressionJsx: ExpressionJsxPlan;
	expressionWrites: ExpressionWritePlan;
	componentInfo: Map<string, ExactImportedComponentIR>;
	componentPlacements: Map<string, ExactPlacement>;
	continuationContextWrites: ReadonlyMap<string, ReadonlySet<string>>;
	derivedReactiveLocals: DerivedReactiveIndex;
	expressionTaskFor(node: ts.Node): ExpressionTaskSite | undefined;
	expressionResourceFor(node: ts.Node): ExpressionTaskResource | undefined;
	expressionListenerFor(node: ts.Node): ExpressionLifecycleListener | undefined;
	expressionSetupFor(node: ts.Node): ExpressionSetupTask | undefined;
	expressionSignalFor(node: ts.Node): ExpressionTaskSignalCall | undefined;
	taskPlacementFor(node: ts.Node): ExactPlacement;
	isClientComponentTag(tag: ts.JsxTagNameExpression): boolean;
	islandHasServerChildren(node: ts.JsxElement): boolean;
	clientIslandSiteFor(node: ClientIslandElementNode): ExpressionClientIslandSite | undefined;
};

/** Creates the closures that join expression-plan identities to TypeScript nodes. */
export function createJsxVisitorEnvironment(
	base: Omit<
		JsxVisitorEnvironment,
		| 'expressionTaskFor'
		| 'expressionResourceFor'
		| 'expressionListenerFor'
		| 'expressionSetupFor'
		| 'expressionSignalFor'
		| 'taskPlacementFor'
		| 'isClientComponentTag'
		| 'islandHasServerChildren'
		| 'clientIslandSiteFor'
	>,
	expressionTasks: ExpressionTaskPlan,
	expressionId: (node: ts.Node) => string | undefined
): JsxVisitorEnvironment {
	const expressionTaskFor = (node: ts.Node) => expressionTasks.sites.get(expressionId(node) ?? '');
	const expressionResourceFor = (node: ts.Node) =>
		node.pos < 0 || node.end < 0
			? undefined
			: expressionTasks.resources.get(expressionId(node) ?? '');
	const expressionListenerFor = (node: ts.Node) =>
		node.pos < 0 || node.end < 0
			? undefined
			: expressionTasks.lifecycleListeners.get(expressionId(node) ?? '');
	const expressionSetupFor = (node: ts.Node) =>
		node.pos < 0 || node.end < 0
			? undefined
			: expressionTasks.setupTasks.get(expressionId(node) ?? '');
	const expressionSignalFor = (node: ts.Node) =>
		node.pos < 0 || node.end < 0
			? undefined
			: expressionTasks.signalCalls.get(expressionId(node) ?? '');
	const taskPlacementFor = (node: ts.Node): ExactPlacement =>
		expressionTaskFor(node)?.placement ?? 'unknown';
	const isClientComponentTag = (tag: ts.JsxTagNameExpression): boolean =>
		base.componentPlacements.get(tag.getText(base.sourceFile)) === 'client';
	const islandHasServerChildren = (node: ts.JsxElement): boolean => {
		const owner = base.state.componentSiteStack.at(-1);
		const site = owner
			? base.expressionComponents.sites
					.get(owner)
					?.clientIslands.find((island) => island.nodeId === expressionId(node))
			: undefined;
		return (
			!!site &&
			(site.serverOnlyChildren ||
				site.childTags.some((tag) => base.componentPlacements.get(tag) === 'server'))
		);
	};
	const clientIslandSiteFor = (
		node: ClientIslandElementNode
	): ExpressionClientIslandSite | undefined => {
		const owner = base.state.componentSiteStack.at(-1);
		return owner
			? base.expressionComponents.sites
					.get(owner)
					?.clientIslands.find((island) => island.nodeId === expressionId(node))
			: undefined;
	};
	return {
		...base,
		expressionTaskFor,
		expressionResourceFor,
		expressionListenerFor,
		expressionSetupFor,
		expressionSignalFor,
		taskPlacementFor,
		isClientComponentTag,
		islandHasServerChildren,
		clientIslandSiteFor
	};
}
