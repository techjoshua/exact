import {
	type AnyComponentInstance,
	ReadinessContext,
	componentReadinessContext,
	createReadinessCoordinator,
	normalizeActivityMode,
	unwrap,
	watch,
	type ActivityMode,
	type Component,
	type ReadinessContextValue
} from '@exactjs/core';
import { createComponentInstance } from '@exactjs/core/runtime/render';
import { createExactInternalOwnerArtifact } from '@exactjs/core/framework/component-contracts';
import { componentDomainInspection } from '@exactjs/core/framework/component-domains';
import {
	flushSync,
	setEffectScopeWorkPriority,
	withEffectScope,
	type EffectScope
} from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../types.js';
import { detachMountedRanges, restoreMountedRanges } from './retained-range.js';
import { ownMountedInstance } from './root-lifecycle.js';
import { setMountedRootPresentation } from './component-roots.js';

/** Installs the private readiness gate and logical owner inherited by Activity descendants. */
export function prepareActivity(
	root: Root,
	mounted: Mounted,
	parentInstance: AnyComponentInstance | undefined,
	contentScope: EffectScope,
	mode: ActivityMode
): AnyComponentInstance {
	let queuedGeneration: number | undefined;
	const readiness = createReadinessCoordinator(
		(pending, generation) => {
			if (pending || queuedGeneration === generation) return;
			queuedGeneration = generation;
			queueMicrotask(() => {
				if (queuedGeneration !== generation) return;
				queuedGeneration = undefined;
				const activity = mounted.activity;
				if (activity?.mode === 'active' && !activity.parentReadiness)
					finishActivityActivation(root, mounted, activity.activationGeneration);
			});
		},
		{ commitSettled: true }
	);
	readiness.beginGeneration();
	const parentReadiness = componentReadinessContext(parentInstance);
	const routedContext: ReadinessContextValue = {
		get generation() {
			const activity = mounted.activity;
			return activity?.mode === 'active' && readiness.pending === 0 && parentReadiness
				? parentReadiness.generation
				: readiness.generation;
		},
		register(work) {
			const activity = mounted.activity;
			return activity?.mode === 'active' && readiness.pending === 0 && parentReadiness
				? parentReadiness.register(work)
				: readiness.context.register(work);
		}
	};
	const owner = withEffectScope(contentScope, () =>
		createComponentInstance(
			ActivityReadinessOwner,
			{ context: routedContext },
			parentInstance,
			undefined,
			mounted.vnode.domain ?? parentInstance?.domain
		)
	);
	mounted.activity = {
		mode,
		token: Symbol('exact.activity'),
		contentScope,
		readiness,
		owner,
		parentReadiness,
		activationGeneration: 0
	};
	owner.onUnmount(() => {
		mounted.activity?.readinessRegistration?.cancel();
		readiness.dispose();
	});
	ownMountedInstance(mounted, owner);
	return owner;
}

/** Installs the mode controller for one native Activity boundary. */
export function installActivity(root: Root, mounted: Mounted): void {
	const activity = mounted.activity;
	if (!activity) throw new Error('Cannot install an Activity controller without Activity state');
	mounted.stop = watch(
		() => {
			applyActivityMode(root, mounted, normalizeActivityMode(unwrap(mounted.vnode.props.mode)));
		},
		undefined,
		{ scope: mounted.scope }
	);
}

/** Reconciles a native Activity boundary after its vnode or authored mode changes. */
export function applyActivityMode(root: Root, mounted: Mounted, mode: ActivityMode): void {
	const activity = mounted.activity;
	if (!activity) throw new Error('Cannot update an Activity boundary without Activity state');
	const activationGeneration = ++activity.activationGeneration;
	activity.readinessRegistration?.cancel();
	activity.readinessRegistration = undefined;
	activity.mode = mode;
	publishActivityChange(mounted);

	if (mode === 'parked') {
		setDescendantActivity(mounted, false);
		activity.contentScope.pause();
		retainWhenPlaced(mounted);
		return;
	}

	setEffectScopeWorkPriority(activity.contentScope, mode === 'background' ? 'deferred' : undefined);
	if (mode === 'background') setDescendantActivity(mounted, false);
	activity.contentScope.resume();

	if (mode === 'active' && activity.readiness.pending) {
		const settlement = activity.readiness.whenReady();
		if (activity.parentReadiness) {
			activity.readinessRegistration = activity.parentReadiness.register({
				owner: activity.owner,
				taskGeneration: activationGeneration,
				settlement,
				commit: () => finishActivityActivation(root, mounted, activationGeneration)
			});
		} else {
			void settlement.then(() => finishActivityActivation(root, mounted, activationGeneration));
		}
		return;
	}

	// Dirty work accumulated while parked settles against the disconnected
	// fragment. The boundary becomes visible only after that state is coherent.
	if (activity.retained?.detached) {
		flushSync();
		if (mode === 'active') {
			restoreMountedRanges(root, activity.retained);
			activity.retained = undefined;
		}
	}

	if (mode === 'background') retainWhenPlaced(mounted);
	else setDescendantActivity(mounted, true);
}

function finishActivityActivation(root: Root, mounted: Mounted, generation: number): void {
	const activity = mounted.activity;
	if (!activity || activity.mode !== 'active' || activity.activationGeneration !== generation)
		return;
	flushSync();
	if (activity.retained?.detached) {
		restoreMountedRanges(root, activity.retained);
		activity.retained = undefined;
	}
	setDescendantActivity(mounted, true);
	activity.readinessRegistration = undefined;
	publishActivityChange(mounted);
}

function publishActivityChange(mounted: Mounted): void {
	const activity = mounted.activity;
	if (!activity) return;
	componentDomainInspection(activity.owner.domain)?.publish({
		kind: 'activity.change',
		component: activity.owner,
		attributes: Object.freeze({
			mode: activity.mode,
			pending: activity.readiness.pending,
			generation: activity.activationGeneration,
			detached: !!activity.retained?.detached
		})
	});
}

function retainWhenPlaced(mounted: Mounted): void {
	const activity = mounted.activity!;
	if (activity.retained?.detached) return;
	if (!mounted.dom.parentNode || mounted.end?.parentNode !== mounted.dom.parentNode) {
		mounted.afterPlacement = () => retainWhenPlaced(mounted);
		return;
	}
	activity.retained = detachMountedRanges(mounted.children);
}

function setDescendantActivity(mounted: Mounted, active: boolean): void {
	const token = mounted.activity!.token;
	for (const child of mounted.children) setMountedRootPresentation(child, active);
	const pending = [...mounted.children];
	while (pending.length) {
		const child = pending.pop()!;
		child.instance?.setActivity(token, active);
		for (const descendant of child.children) pending.push(descendant);
		for (const candidate of child.suspense?.candidate?.children ?? []) pending.push(candidate);
	}
}

const ActivityReadinessOwner = createExactInternalOwnerArtifact(
	function ActivityReadinessOwner(
		this: Component<Record<string, never>>,
		props: { context: ReadinessContextValue }
	) {
		this.setContext(ReadinessContext, props.context);
		return () => null;
	},
	'@exactjs/dom:ActivityReadinessOwner',
	'client'
);
