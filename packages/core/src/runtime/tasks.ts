import './component-tasks.js';

export { registerComponentContinuationContexts } from '../component/context-resumption.js';
export { dispatchComponentContinuation } from '../component/domain.js';
export { activateTaskForHost } from '../tasks/activation.js';
export { activateComputationForHost } from '../tasks/computation-activation.js';
export {
	createIndexedContinuationDependency,
	createTrackedContinuationDependency
} from '../tasks/dependency-source.js';
export {
	activateCompiledClientLatestTaskForHost,
	bindCompiledClientLatestTaskForHost
} from '../tasks/compiled-latest.js';
export { markComponentContinuationTask } from '../tasks/component-continuation.js';
export { taskMutation } from '../tasks/frame-runtime.js';
export { createTaskState } from '../tasks/pending-state.js';
export {
	ownReleasableTaskResource,
	releaseTaskResource,
	taskResourceReleaseMethod
} from '../tasks/resource-release.js';
export { createTaskArgumentDependencies } from '../tasks/argument-dependencies.js';
export { taskNativeCleanupScope } from '../tasks/native-cleanup-scope.js';
export type { CompiledTaskState } from '../tasks/pending-state.js';
export { bindTaskForHost, defineTask, invokeTask } from '../tasks/runtime.js';
export { mutateTaskCollection, stageTaskMutation } from '../tasks/task-publication.js';
export {
	ownTaskResource,
	taskAnimationFrame,
	taskAwait,
	taskFetch,
	taskIdleCallback,
	taskInterval,
	taskObserver,
	taskTimeout
} from '../tasks/resources.js';
export { combineTaskSignal, withAbortSignal, withTaskSignal } from '../tasks/signals.js';

export {
	createTaskProgressReporter,
	registerTaskProgressReceiver
} from '../tasks/progress-bindings.js';

export {
	combineExistingTaskSignal,
	withExistingTaskSignal,
	withExistingAbortSignal
} from '../tasks/cleanup-signals.js';
