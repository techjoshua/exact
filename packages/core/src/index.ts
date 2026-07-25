export {
	batch,
	computed,
	decodeReactiveProtocolValue,
	deleteReactiveValue,
	encodeReactiveProtocolValue,
	mutateReactiveArray,
	peek,
	unwrap,
	updateReactiveValue,
	updateReactiveValueWithResult,
	watch,
	writeReactive,
	writeReactiveLazy
} from '@exactjs/reactive';
export type { Reactive, ReactiveValue, StopHandle } from '@exactjs/reactive';
export {
	attachSuppressedCleanupFailure,
	attemptCleanup,
	createCleanupFailure,
	recordCleanupFailure,
	throwCleanupFailure,
	type CleanupFailure
} from './cleanup.js';
export { observeComponentAsync, trackComponentAsync } from './component/async.js';
export {
	createComponentDomain,
	currentComponentDomain,
	pageComponentDomain,
	withComponentDomain
} from './component/domain.js';
export { ErrorContext, LoggerContext, SuspensionContext } from './component/contexts.js';
export type {
	Child,
	Cleanup,
	Component,
	ComponentContextValues,
	ComponentDomain,
	ComponentFunction,
	ComponentInstance,
	ComponentReactiveValue,
	ComponentTask,
	ComponentTaskRegistration,
	ContextToken,
	ErrorContextValue,
	ErrorReport,
	ErrorReportOptions,
	ErrorSource,
	IterableItem,
	LifecycleHandler,
	ListBinding,
	RefBinding,
	RefKey,
	RefRegistry,
	RenderEventHandler,
	RenderFunction,
	RenderResult,
	SuspensionContextValue,
	TaskCleanup,
	TaskContext,
	TaskIdleDeadline,
	TaskIdleOptions,
	TaskObserver,
	TaskResourceDisposal,
	TaskResult,
	UnsafeHtmlAuditEvent,
	Unwrapped,
	VNode,
	VNodeCell,
	VNodeType
} from './component/contracts.js';
export {
	createErrorContext,
	createErrorReport,
	handleComponentError,
	handleComponentSuspension,
	normalizeRenderResult
} from './component/errors.js';
export { logFrameworkEvent } from './component/log.js';
export { renderInstance } from './component/render.js';
export { createComponentInstance, reparentComponentInstance } from './component/runtime.js';
export {
	composeExactComponentContracts,
	exactComponentContract,
	readExactComponentContract,
	type ExactComponentBoundaryContract,
	type ExactComponentContinuationContract,
	type ExactComponentContract,
	type ExactComponentImplementationContract,
	type ExactComponentResumptionContract,
	type ExactComposedComponentContracts,
	type ExactContinuationStatePathContract
} from './component-contracts.js';
export { sameJsonData, type JsonComparisonOptions } from './json.js';
export { createContext, createRef, type ContextOptions } from './keys.js';
export {
	createConsoleLogger,
	type ComponentLog,
	type ConsoleLoggerOptions,
	type LogEvent,
	type LogLevel,
	type LogScope,
	type Logger
} from './logging.js';
export {
	decodeExactMarkerPart,
	encodeExactMarkerPart,
	exactMarkerEnd,
	exactMarkerStart
} from './protocol.js';
export {
	Cell,
	Dynamic,
	Fragment,
	Portal,
	ServerBoundary,
	ServerSlot,
	Text,
	UnsafeHtml
} from './symbols.js';
export { withTaskObserver } from './task/observers.js';
export {
	createDerived,
	ownTaskResource,
	registerTaskCleanup,
	taskAnimationFrame,
	taskAwait,
	taskFetch,
	taskIdleCallback,
	taskInterval,
	taskObserver,
	taskTimeout
} from './task/resources.js';
export {
	combineTaskSignal,
	withAbortSignal,
	withTaskSignal,
	type ManagedEventListenerOptions
} from './task/signals.js';
export { BLOCKED_JAVASCRIPT_URL, isUrlAttribute, sanitizeUrlAttribute } from './url.js';
export {
	createCellVNode,
	createCompiledFragment,
	createCompiledVNode,
	createDynamicChild,
	createExpression,
	createPortal,
	createServerBoundary,
	createServerSlot,
	createTextVNode,
	createVNode,
	getCellVNode,
	isCellVNode,
	isVNode,
	normalizeChildren,
	normalizeDocumentVNode,
	unsafeHtml
} from './vnode.js';
