import type { AnyReactComponentType, ReactElement, ReactNode } from '@exactjs/react-compat';
import type {
	ReactRendererComponentInstance,
	ReactRootRuntime,
	ReactTransitionOwnership
} from '@exactjs/react-compat/exact';
import type { ComponentContextValues } from '@exactjs/core';
import type {
	ExactCompatibilityRange,
	ExactCompatibilityRangeHost
} from '@exactjs/dom/runtime/compatibility-ranges';
import type { RootOptions } from '../client.js';

/** One React-owned mounted range; no native eXact node representation is retained. */
export type ReactMounted = {
	kind: 'text' | 'host' | 'component' | 'fragment' | 'portal' | 'native';
	dom: Node;
	end?: Node;
	key?: string;
	type?: ReactElement['type'];
	props?: Record<string, unknown>;
	children: ReactMounted[];
	instance?: ReactRendererComponentInstance;
	portalTarget?: Node;
	refresh?: () => void;
	/** Completed renderer executions used to avoid duplicate explicit refresh after reactive receipt delivery. */
	renderRevision?: number;
	renderContext?: ReactRenderContext;
	disposed?: boolean;
	nativeRange?: ExactCompatibilityRange;
	suspenseTransition?: ReactTransitionOwnership;
	releaseSuspenseTransition?: () => void;
	/** Whether the committed Suspense range is the fallback rather than retained primary content. */
	suspenseFallback?: boolean;
	releaseComponentDomNode?: () => void;
	/** Stable blocker identity used when a React Activity hides this retained subtree. */
	activityToken?: symbol;
};

/** Mutable state owned by one ReactDOM compatibility root. */
export type ReactRendererRoot = {
	container: Node;
	before?: Node | null;
	hydrationStart?: Node | null;
	hydrationEnd?: Node | null;
	mounted: ReactMounted[];
	contexts: ComponentContextValues;
	runtime: ReactRootRuntime;
	options?: RootOptions;
	active: boolean;
	rendering: boolean;
	pending?: ReactNode;
	nativeHost: ExactCompatibilityRangeHost;
};

/** Physical and logical ownership supplied while mounting or patching descendants. */
export type ReactRenderContext = {
	root: ReactRendererRoot;
	parent: Node;
	owner?: ReactRendererComponentInstance;
	transition?: ReactTransitionOwnership;
};

/** Component element after special React wrappers have selected the island implementation. */
export type ReactComponentInput = {
	type: AnyReactComponentType;
	props: Record<string, unknown>;
	key?: string;
};
