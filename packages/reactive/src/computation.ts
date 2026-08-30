import { hasChanged } from './change-detection.js';
import {
	cleanupReaction,
	hasActiveReactiveTransaction,
	linkReaction,
	reactionDependencies,
	readMutationVersion,
	readReactiveRestorationVersion,
	registerDependencyObservationHooks,
	runTracked,
	track,
	trigger,
	type ReactiveDependency
} from './internal/deps.js';
import {
	currentEffectScope,
	effectScopeWorkPriority,
	registerEffectScopeReaction,
	releaseEffectScopeReaction,
	withEffectScope
} from './internal/scopes.js';
import {
	currentWorkPriority,
	queueComputation,
	removeQueuedComputation
} from './internal/scheduler.js';
import { reactiveValueMarker, reactiveValueRef } from './internal/symbols.js';
import type {
	Dep,
	EffectScopeImpl,
	Reaction,
	ReactiveRef,
	ReactiveValue,
	WorkPriority
} from './internal/types.js';
import { isReactiveValue, rejectReadonlyReactiveValueWrite, unwrap } from './internal/values.js';
import { proxyRefs } from './proxy/state.js';

type ComputationState = 'clean' | 'checked' | 'dirty' | 'computing' | 'stopped';

type ComputedDependency = ReactiveDependency & {
	version: number;
	computed?: ComputedNode<unknown>;
};

/** Immutable, value-free diagnostic projection for one computed value. */
export type ComputedInspection = Readonly<{
	state: ComputationState | 'failed' | 'paused';
	priority: WorkPriority;
	observed: boolean;
	initialized: boolean;
	sources: number;
	sinks: number;
}>;

const computedTargets = new WeakMap<object, ComputedNode<unknown>>();
const computedValues = new WeakMap<object, ComputedNode<unknown>>();
const maximumSettlementSteps = 100_000;
const cycleMessage = 'eXact reactive computation cycle detected';
let nextSettlementGeneration = 0;
let activeSettlementGeneration = 0;

/** Creates a lazy, cached derived value with depth-independent synchronous freshness. */
export function computed<T>(compute: () => T): ReactiveValue<T> {
	const node = new ComputedNode(compute, currentEffectScope());
	const value = {
		[reactiveValueMarker]: true,
		[reactiveValueRef]: node.source,
		get: () => node.get(),
		toJSON: () => node.get(),
		toString: () => String(node.get()),
		valueOf: () => node.get(),
		[Symbol.toPrimitive]: () => node.get()
	} as ReactiveValue<T> & object;
	computedValues.set(value, node as ComputedNode<unknown>);
	return value;
}

/** Returns bounded graph state for tooling without exposing computed values or source text. */
export function inspectComputed(value: ReactiveValue): ComputedInspection | undefined {
	return computedValues.get(value as object)?.inspect();
}

class ComputedNode<T> implements Reaction {
	active = true;
	scheduled = false;
	pendingPriority: WorkPriority | undefined;
	deps = new Set<Dep>();
	readonly source: ReactiveRef<T>;

	private state: ComputationState = 'dirty';
	private initialized = false;
	private current!: T;
	private observed = false;
	private failed = false;
	private invalidatedWhileComputing = false;
	private validatedGeneration = 0;
	private restorationVersion = readReactiveRestorationVersion();
	private dependencies: ComputedDependency[] = [];
	private readonly computedSources = new Set<ComputedNode<unknown>>();
	private readonly computedSinks = new Set<ComputedNode<unknown>>();
	private readonly target = {};
	private readonly key = 'value';
	private readonly releaseObservationHooks: () => void;
	private readonly settleScheduled = (): void => this.settle();

	constructor(
		private readonly compute: () => T,
		readonly scope: EffectScopeImpl | undefined
	) {
		this.source = {
			target: this.target,
			key: this.key,
			get: () => this.get(),
			set: rejectReadonlyReactiveValueWrite
		};
		computedTargets.set(this.target, this as ComputedNode<unknown>);
		this.releaseObservationHooks = registerDependencyObservationHooks(this.target, this.key, {
			onObserved: () => this.becomeObserved(),
			onUnobserved: () => this.becomeUnobserved()
		});
		if (scope) registerEffectScopeReaction(scope, this);
	}

	get(): T {
		if (this.state === 'computing') throw new Error(cycleMessage);
		if (
			this.active &&
			!this.scope?.paused &&
			(activeSettlementGeneration === 0 || this.validatedGeneration !== activeSettlementGeneration)
		)
			this.settle();
		track(this.target, this.key);
		return this.current;
	}

	run(): void {
		this.scheduled = false;
		this.pendingPriority = undefined;
		if (!this.active || (this.scope && !this.scope.active)) {
			this.stop();
			return;
		}
		this.settle();
	}

	schedule(): void {
		if (!this.active || (this.scope && !this.scope.active)) {
			this.stop();
			return;
		}
		if (
			this.state !== 'computing' &&
			this.initialized &&
			this.dependencies.every(
				(dependency) =>
					readMutationVersion(dependency.target, dependency.key) === dependency.version
			)
		)
			return;
		if (this.state === 'computing') this.invalidatedWhileComputing = true;
		else this.state = 'dirty';
		this.markSinksChecked();
		if (this.isRetained()) this.queue();
	}

	stop(): void {
		if (!this.active) return;
		this.active = false;
		this.state = 'stopped';
		this.scheduled = false;
		this.pendingPriority = undefined;
		removeQueuedComputation(this.settleScheduled);
		cleanupReaction(this);
		this.detachComputedSources();
		this.releaseObservationHooks();
		if (this.scope) releaseEffectScopeReaction(this.scope, this);
	}

	inspect(): ComputedInspection {
		return Object.freeze({
			state: this.failed ? 'failed' : this.scope?.paused ? 'paused' : this.state,
			priority: this.pendingPriority ?? effectScopeWorkPriority(this.scope, currentWorkPriority()),
			observed: this.isRetained(),
			initialized: this.initialized,
			sources: this.dependencies.length,
			sinks: this.computedSinks.size
		});
	}

	private settle(): void {
		if (!this.active || this.scope?.paused) return;
		const ownsGeneration = activeSettlementGeneration === 0;
		if (ownsGeneration) activeSettlementGeneration = ++nextSettlementGeneration;
		try {
			settleGraph(this);
		} finally {
			if (ownsGeneration) activeSettlementGeneration = 0;
		}
	}

	needsValidation(): boolean {
		return (
			this.state !== 'clean' ||
			!this.isRetained() ||
			hasActiveReactiveTransaction() ||
			this.restorationVersion !== readReactiveRestorationVersion()
		);
	}

	validateAndEvaluate(): void {
		if (!this.active || this.scope?.paused) return;
		if (this.state === 'computing') throw new Error(cycleMessage);
		if (this.initialized && this.state !== 'dirty') {
			const changed = this.dependencies.some(
				(dependency) =>
					readMutationVersion(dependency.target, dependency.key) !== dependency.version
			);
			if (!changed) {
				this.state = 'clean';
				removeQueuedComputation(this.settleScheduled);
				this.scheduled = false;
				this.pendingPriority = undefined;
				this.validatedGeneration = activeSettlementGeneration;
				this.restorationVersion = readReactiveRestorationVersion();
				return;
			}
			this.state = 'dirty';
		}
		if (this.state === 'dirty' || !this.initialized) this.evaluate();
		this.validatedGeneration = activeSettlementGeneration;
		this.restorationVersion = readReactiveRestorationVersion();
	}

	private evaluate(): void {
		const previousDependencies = this.dependencies;
		const previousValue = this.current;
		const hadValue = this.initialized;
		this.state = 'computing';
		this.failed = false;
		this.invalidatedWhileComputing = false;
		removeQueuedComputation(this.settleScheduled);
		cleanupReaction(this);
		this.detachComputedSources();

		let next!: T;
		try {
			withEffectScope(this.scope, () =>
				runTracked(this, () => {
					const computedValue = this.compute();
					trackReturnedReference(computedValue);
					next = unwrap(computedValue) as T;
				})
			);
		} catch (error) {
			this.recoverFromFailure(previousDependencies, error);
			return;
		}

		this.dependencies = snapshotDependencies(this);
		this.refreshComputedSources();
		if (!this.isRetained()) {
			cleanupReaction(this);
			this.detachComputedSources();
		}
		const changed = !hadValue || hasChanged(previousValue, next);
		this.current = hadValue && !changed ? previousValue : next;
		this.initialized = true;
		this.state = this.invalidatedWhileComputing ? 'dirty' : 'clean';
		this.scheduled = false;
		this.pendingPriority = undefined;
		if (hadValue && changed) trigger(this.target, this.key);
		if (this.invalidatedWhileComputing) this.queue(true);
	}

	private recoverFromFailure(
		previousDependencies: readonly ComputedDependency[],
		error: unknown
	): void {
		const attemptedDependencies = snapshotDependencies(this);
		cleanupReaction(this);
		this.dependencies = mergeDependencies(previousDependencies, attemptedDependencies);
		if (this.isRetained()) this.attachDependencies();
		this.failed = true;
		this.state = 'clean';
		this.validatedGeneration = activeSettlementGeneration;
		this.restorationVersion = readReactiveRestorationVersion();
		removeQueuedComputation(this.settleScheduled);
		this.scheduled = false;
		this.pendingPriority = undefined;
		const onError = this.scope?.onError;
		if (!onError) throw error;
		onError(error);
	}

	private queue(force = false): void {
		if (!force && !this.isRetained()) return;
		const priority = effectScopeWorkPriority(this.scope, currentWorkPriority());
		if (
			this.pendingPriority === undefined ||
			priority === 'interactive' ||
			(this.pendingPriority === 'deferred' && priority === 'normal')
		)
			this.pendingPriority = priority;
		this.scheduled = true;
		queueComputation(this.settleScheduled, undefined, priority, this.scope);
	}

	private markSinksChecked(): void {
		const pending = [...this.computedSinks];
		const visited = new Set<ComputedNode<unknown>>();
		while (pending.length) {
			const sink = pending.pop()!;
			if (!visited.add(sink) || !sink.active) continue;
			if (sink.state === 'clean') sink.state = 'checked';
			if (sink.state === 'computing') sink.invalidatedWhileComputing = true;
			if (sink.isRetained()) sink.queue();
			for (const descendant of sink.computedSinks) pending.push(descendant);
		}
	}

	private becomeObserved(): void {
		if (this.observed || !this.active) return;
		this.observed = true;
		this.attachDependencies();
		if (this.state !== 'clean') this.queue();
	}

	private becomeUnobserved(): void {
		if (!this.observed) return;
		this.observed = false;
		if (this.scope) return;
		cleanupReaction(this);
		this.detachComputedSources();
		removeQueuedComputation(this.settleScheduled);
		this.scheduled = false;
		this.pendingPriority = undefined;
	}

	private attachDependencies(): void {
		for (const dependency of this.dependencies)
			linkReaction(this, dependency.target, dependency.key);
		this.refreshComputedSources();
	}

	private refreshComputedSources(): void {
		this.detachComputedSources();
		if (!this.isRetained()) return;
		for (const dependency of this.dependencies) {
			if (!dependency.computed) continue;
			this.computedSources.add(dependency.computed);
			dependency.computed.computedSinks.add(this as ComputedNode<unknown>);
		}
	}

	private detachComputedSources(): void {
		for (const source of this.computedSources)
			source.computedSinks.delete(this as ComputedNode<unknown>);
		this.computedSources.clear();
	}

	computedDependencies(): readonly ComputedDependency[] {
		return this.dependencies;
	}

	private isRetained(): boolean {
		return this.observed || Boolean(this.scope);
	}
}

function settleGraph(root: ComputedNode<unknown>): void {
	type Frame = { node: ComputedNode<unknown>; leave: boolean };
	const stack: Frame[] = [{ node: root, leave: false }];
	const visiting = new Set<ComputedNode<unknown>>();
	let steps = 0;
	while (stack.length) {
		if (++steps > maximumSettlementSteps)
			throw new Error('eXact reactive computation graph exceeded its settlement limit');
		const frame = stack.pop()!;
		const node = frame.node;
		if (frame.leave) {
			visiting.delete(node);
			node.validateAndEvaluate();
			continue;
		}
		if (!node.needsValidation()) continue;
		if (visiting.has(node)) throw new Error(cycleMessage);
		visiting.add(node);
		stack.push({ node, leave: true });
		const dependencies = node.computedDependencies();
		for (let index = dependencies.length - 1; index >= 0; index--) {
			const source = dependencies[index]!.computed;
			if (source) stack.push({ node: source, leave: false });
		}
	}
}

function snapshotDependencies(reaction: Reaction): ComputedDependency[] {
	return reactionDependencies(reaction).map(({ target, key }) => ({
		target,
		key,
		version: readMutationVersion(target, key),
		computed: computedTargets.get(target)
	}));
}

function mergeDependencies(
	previous: readonly ComputedDependency[],
	attempted: readonly ComputedDependency[]
): ComputedDependency[] {
	const merged = [...attempted];
	for (const dependency of previous) {
		if (
			merged.some(
				(candidate) => candidate.target === dependency.target && candidate.key === dependency.key
			)
		)
			continue;
		merged.push({
			...dependency,
			version: readMutationVersion(dependency.target, dependency.key)
		});
	}
	return merged;
}

function trackReturnedReference(value: unknown): void {
	if (isReactiveValue(value)) {
		value.get();
		return;
	}
	if (value && typeof value === 'object') proxyRefs.get(value)?.get();
}
