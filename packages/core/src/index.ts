export {
	batch,
	computed,
	decodeReactiveProtocolValue,
	deleteReactiveValue,
	encodeReactiveProtocolValue,
	mutateReactiveArray,
	mutateReactiveCollection,
	peek,
	runWithPriority,
	unwrap,
	updateReactiveValue,
	updateReactiveValueWithResult,
	watch,
	writeReactive,
	writeReactiveLazy
} from '@exactjs/reactive';
export { normalizeClassValue } from './class-values.js';
export type { Reactive, ReactiveValue, StopHandle, WorkPriority } from '@exactjs/reactive';
export {
	attachSuppressedCleanupFailure,
	attemptCleanup,
	createCleanupFailure,
	recordCleanupFailure,
	throwCleanupFailure,
	type CleanupFailure
} from './cleanup.js';
export { normalizeActivityMode } from './activity.js';
export { observeComponentAsync, trackComponentAsync } from './component/async.js';
export {
	cancelComponentInteractions,
	currentInteraction,
	interactionAwait,
	interactionMutation,
	isInteractionCancellation,
	joinCurrentInteraction,
	runComponentInteraction,
	InteractionCancellation,
	type InteractionPriority,
	type InteractionScope,
	type InteractionSource
} from './interaction/execution.js';
export {
	createComponentDomain,
	currentComponentDomain,
	dispatchComponentContinuation,
	pageComponentDomain,
	withComponentDomain,
	withComponentResumption
} from './component/domain.js';
export {
	componentContinuationContextValues,
	registerComponentContinuationContexts
} from './component/context-resumption.js';
export {
	ErrorContext,
	LoggerContext,
	ReadinessContext,
	SuspensionContext
} from './component/contexts.js';
export {
	ErrorBoundary,
	type ErrorBoundaryFallbackProps,
	type ErrorBoundaryProps
} from './component/error-boundary.js';
export { interactionHandler, type InteractionHandler } from './component/interaction-contracts.js';
export {
	createExactRuntimeInspectionOwner,
	inspectExactRuntimeComponent,
	type ExactRuntimeInspectionEventInput,
	type ExactRuntimeInspectionOwner,
	type ExactRuntimeInspectionOwnerOptions
} from './component/inspection.js';
export { markExactInspectionSource } from './component/inspection-source.js';
export {
	createCompiledComponentRegistry,
	createComponentRegistry,
	hasComponent,
	inspectComponentRegistry,
	preloadComponent,
	renderComponent
} from './component-registry/creation.js';
export type {
	ComponentProps,
	ComponentRegistry,
	ComponentRegistryBuilder,
	ComponentRegistryDefinition,
	ComponentRegistryDefinitionEntry,
	ComponentRegistryInspection,
	ComponentSelection,
	KeyOf,
	LazyRegistryEntry,
	ResolveRegistryDefinition,
	ResolveRegistryEntry
} from './component-registry/contracts.js';
export {
	componentReadinessContext,
	createReadinessCoordinator,
	type ReadinessCoordinator,
	type ReadinessCoordinatorOptions
} from './component/readiness.js';
export type {
	ActivityMode,
	AsyncComponentFunction,
	AuthoredComponentFunction,
	Child,
	Component,
	ComponentContinuationContextBinding,
	ComponentContinuationDispatch,
	ComponentContinuationDispatcher,
	ComponentContextValues,
	ComponentDomain,
	DirectComponentFunction,
	ComponentFunction,
	ComponentInstance,
	BlockingWork,
	ComponentResumptionActivation,
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
	ReadinessContextValue,
	ReadinessRegistration,
	RenderEventHandler,
	RenderFunction,
	RenderResult,
	SuspensionContextValue,
	TaskCleanup,
	TaskIdleDeadline,
	TaskIdleOptions,
	TaskObserver,
	TaskResourceDisposal,
	UnsafeHtmlAuditEvent,
	VNode,
	VNodeCell,
	VNodeType
} from './component/contracts.js';
export { bindTask, bindTaskForHost, defineTask, invokeTask, taskStatus } from './tasks/runtime.js';
export { activateTask, activateTaskForHost } from './tasks/activation.js';
export { createTaskOwner } from './tasks/owners.js';
export {
	bindTaskCallback,
	reserveTaskCallback,
	runTaskContinuation,
	trackTaskReads
} from './tasks/continuations.js';
export { TaskContext } from './tasks/public.js';
export type {
	BoundTaskFunction,
	ReservedTaskCallback,
	RuntimeTaskOptions,
	TaskActivation,
	TaskContextPolicy,
	TaskFunction,
	TaskInvocation,
	TaskOwner,
	TaskStatus
} from './tasks/contracts.js';
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
	exactComponentIdentity,
	exactComponentContract,
	exactComponentType,
	isExactComponent,
	markExactComponent,
	readExactComponentContract,
	type ExactComponentBoundaryContract,
	type ExactCollectionMutation,
	type ExactComponentContinuationActivation,
	type ExactComponentContinuationContract,
	type ExactComponentContinuationExecution,
	type ExactComponentContinuationExecutionResult,
	type ExactComponentContinuationExecutorContract,
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
	Activity,
	Cell,
	Dynamic,
	Fragment,
	Portal,
	ServerBoundary,
	ServerSlot,
	Suspense,
	Text,
	UnsafeHtml
} from './symbols.js';
export { withTaskObserver } from './task/observers.js';
export {
	markComponentContinuationTask,
	settledComponentContinuationIds
} from './task/continuation.js';
export {
	createDerived,
	discardTaskMutations,
	mutateTaskCollection,
	ownTaskResource,
	publishTaskMutations,
	registerTaskCleanup,
	stageTaskMutation,
	takeTaskCollectionMutations,
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
