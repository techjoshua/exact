import type * as ts from '../../native-typescript.js';
import type {
	ExpressionTaskResourceKind,
	ExpressionTaskSignalCall
} from '../../expression/task-contracts.js';
import type { ComponentLocalInfo } from './contracts.js';

/** Mutable observations and ownership stacks collected while lowering one source file. */
export type JsxTransformState = {
	sawJsx: boolean;
	sawBoundary: boolean;
	sawStateWrite: boolean;
	sawAbortOptions: boolean;
	sawDerived: boolean;
	taskResources: Set<ExpressionTaskResourceKind>;
	taskSignalModes: Set<ExpressionTaskSignalCall['mode']>;
	sawTaskAwait: boolean;
	sawContinuationTask: boolean;
	sawDistributedContinuation: boolean;
	sawContinuationContexts: boolean;
	sawInterop: boolean;
	setupTaskDepth: number;
	componentStack: string[];
	componentSiteStack: string[];
	componentLocalStack: ComponentLocalInfo[];
	islandCounts: Map<string, number>;
	clientIslandDefinitions: ts.FunctionDeclaration[];
	clientIslandDepth: number;
};

/** Creates isolated mutable state for a single transformer invocation. */
export function createJsxTransformState(): JsxTransformState {
	return {
		sawJsx: false,
		sawBoundary: false,
		sawStateWrite: false,
		sawAbortOptions: false,
		sawDerived: false,
		taskResources: new Set(),
		taskSignalModes: new Set(),
		sawTaskAwait: false,
		sawContinuationTask: false,
		sawDistributedContinuation: false,
		sawContinuationContexts: false,
		sawInterop: false,
		setupTaskDepth: 0,
		componentStack: [],
		componentSiteStack: [],
		componentLocalStack: [],
		islandCounts: new Map(),
		clientIslandDefinitions: [],
		clientIslandDepth: 0
	};
}
