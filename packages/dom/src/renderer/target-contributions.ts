import {
	Target,
	TargetOverrides,
	attachElementIdentity,
	normalizeClassValue,
	unwrap,
	type ComponentInstance,
	type RefBinding
} from '@exactjs/core';
import { computed, scheduleWork, watch } from '@exactjs/reactive';
import { installOwnedEventSubscription } from '../events.js';
import { updateProps } from '../props.js';
import type { Mounted, Root } from '../types.js';
import { resolveTargetBoundary } from './enhancement-targets.js';

const tokenListProps = new Set([
	'aria-describedby',
	'aria-labelledby',
	'aria-controls',
	'aria-owns',
	'aria-flowto',
	'rel'
]);
const scheduledBoundaries = new WeakSet<Mounted>();

/** Resolves all target boundaries in post-order so nested exports attach before outer layers. */
export function refreshTargetSubtree(
	root: Root,
	mounted: Mounted,
	parentInstance: ComponentInstance<any> | undefined
): void {
	const instance = mounted.instance ?? parentInstance;
	for (const child of mounted.children) refreshTargetSubtree(root, child, instance);
	if (mounted.vnode.type === Target) refreshTargetBoundary(root, mounted, parentInstance);
}

/** Schedules only target boundaries whose selected route traversed the changed structural owner. */
export function refreshTargetDependents(root: Root, structuralOwner: Mounted): void {
	for (const boundary of [...(structuralOwner.targetDependents ?? [])]) {
		if (!boundary.scope.active || scheduledBoundaries.has(boundary)) continue;
		scheduledBoundaries.add(boundary);
		scheduleWork(
			() => {
				scheduledBoundaries.delete(boundary);
				if (boundary.scope.active)
					refreshTargetBoundary(root, boundary, boundary.targetBoundary?.owner);
			},
			'normal',
			undefined,
			boundary.scope
		);
	}
}

/** Attaches one boundary's owned layer to its current semantic intrinsic target. */
export function refreshTargetBoundary(
	root: Root,
	boundary: Mounted,
	parentInstance: ComponentInstance<any> | undefined
): void {
	boundary.targetBoundary?.release?.();
	const dependencies = new Set<Mounted>();
	const selected = resolveTargetBoundary(boundary, parentInstance, dependencies)?.mounted;
	for (const dependency of dependencies) {
		if (dependency === boundary) continue;
		dependency.targetDependents ??= new Set();
		dependency.targetDependents.add(boundary);
	}
	boundary.targetBoundary = { selected, owner: parentInstance, dependencies };
	if (!selected || !(selected.dom instanceof Element)) {
		boundary.targetBoundary.release = () => releaseDependencies(boundary, dependencies);
		refreshTargetDependents(root, boundary);
		return;
	}

	selected.targetContributions ??= new Map();
	selected.targetContributions.set(boundary, {
		props: boundary.vnode.props,
		owner: parentInstance
	});
	const releaseRef = installTargetRef(boundary, selected.dom, boundary.vnode.props.ref);
	applyTargetProps(root, selected);
	boundary.targetBoundary.release = () => {
		releaseDependencies(boundary, dependencies);
		releaseRef();
		if (!selected.targetContributions?.delete(boundary)) return;
		applyTargetProps(root, selected);
	};
	refreshTargetDependents(root, boundary);
}

/** Applies authored props and all live target layers without mutating the authored VNode. */
export function updateTargetedIntrinsicProps(
	root: Root,
	mounted: Mounted,
	previousAuthored: Record<string, unknown>,
	nextAuthored: Record<string, unknown>
): void {
	applyTargetProps(root, mounted, previousAuthored, nextAuthored);
}

/** Releases target-owned event subscriptions before ordinary element teardown. */
export function clearTargetedIntrinsicProps(mounted: Mounted): void {
	for (const release of mounted.targetEventReleases ?? []) release();
	mounted.targetEventReleases = undefined;
}

function releaseDependencies(boundary: Mounted, dependencies: ReadonlySet<Mounted>): void {
	for (const dependency of dependencies) {
		dependency.targetDependents?.delete(boundary);
		if (!dependency.targetDependents?.size) dependency.targetDependents = undefined;
	}
}

function installTargetRef(boundary: Mounted, element: Element, source: unknown): () => void {
	if (source === undefined) return () => undefined;
	let current: RefBinding<unknown> | undefined;
	const stop = watch(
		() => {
			const next = unwrap(source) as RefBinding<unknown> | undefined | null;
			if (next === current) return;
			current?.fulfill(undefined);
			current = next ?? undefined;
			if (current) attachElementIdentity(current, element);
			current?.fulfill(element);
		},
		undefined,
		{ scope: boundary.scope }
	);
	return () => {
		stop();
		current?.fulfill(undefined);
		current = undefined;
	};
}

function applyTargetProps(
	root: Root,
	mounted: Mounted,
	previousAuthored: Readonly<Record<string, unknown>> = mounted.vnode.props,
	nextAuthored: Readonly<Record<string, unknown>> = mounted.vnode.props
): void {
	if (!(mounted.dom instanceof Element)) return;
	for (const release of mounted.targetEventReleases ?? []) release();
	mounted.targetEventReleases = undefined;

	const previous = mounted.targetEffectiveProps ?? previousAuthored;
	const plan = composeTargetProps(nextAuthored, mounted.targetContributions);
	updateProps(root, mounted.dom, previous, plan.props, mounted.scope);
	mounted.targetEffectiveProps = plan.props;
	if (!plan.events.length) return;
	mounted.targetEventReleases = plan.events.map(({ key, source, owner }) =>
		installOwnedEventSubscription(root, mounted.dom as Element, key, source, owner)
	);
}

type TargetPropPlan = {
	readonly props: Record<string, unknown>;
	readonly events: ReadonlyArray<{
		key: string;
		source: unknown;
		owner?: ComponentInstance<any>;
	}>;
};

function composeTargetProps(
	authored: Readonly<Record<string, unknown>>,
	contributions:
		| ReadonlyMap<
				Mounted,
				Readonly<{
					props: Readonly<Record<string, unknown>>;
					owner?: ComponentInstance<any>;
				}>
		  >
		| undefined
): TargetPropPlan {
	if (!contributions?.size) return { props: { ...authored }, events: [] };
	const innerToOuter = [...contributions.values()];
	const keys = new Set(Object.keys(authored));
	for (const layer of innerToOuter) for (const key of Object.keys(layer.props)) keys.add(key);
	const result: Record<string, unknown> = {};
	const events: TargetPropPlan['events'][number][] = [];
	const overrides = new Set(
		innerToOuter.flatMap((layer) => {
			const value = unwrap(
				(layer.props as Readonly<Record<PropertyKey, unknown>>)[TargetOverrides]
			);
			return Array.isArray(value)
				? value.filter((key): key is string => typeof key === 'string')
				: [];
		})
	);
	for (const key of keys) {
		if (key === 'children' || key === 'key') continue;
		if (key === 'ref') {
			if (authored.ref !== undefined) result.ref = authored.ref;
			continue;
		}
		if (/^on[A-Z]/.test(key)) {
			const contributed = innerToOuter.filter((layer) => key in layer.props);
			if (!contributed.length) {
				if (key in authored) result[key] = authored[key];
				continue;
			}
			if (key in authored) events.push({ key, source: authored[key] });
			for (const layer of contributed)
				events.push({ key, source: layer.props[key], owner: layer.owner });
			continue;
		}
		const values = overrides.has(key)
			? [...innerToOuter.map((layer) => layer.props[key]), authored[key]]
			: [authored[key], ...innerToOuter.map((layer) => layer.props[key])];
		if (key === 'class' || key === 'className') result[key] = computed(() => mergeClasses(values));
		else if (key === 'style')
			result[key] = computed(() =>
				mergeStyles(
					authored[key],
					innerToOuter.map((layer) => layer.props)
				)
			);
		else if (tokenListProps.has(key)) result[key] = computed(() => mergeTokens(values));
		else result[key] = computed(() => firstDefined(values));
	}
	return { props: result, events };
}

function firstDefined(values: readonly unknown[]): unknown {
	for (const value of values) {
		const actual = unwrap(value);
		if (actual !== undefined) return actual;
	}
	return undefined;
}

function mergeClasses(values: readonly unknown[]): string | null | undefined {
	const tokens: string[] = [];
	let suppressed = false;
	for (const value of values) {
		const actual = unwrap(value);
		if (actual === undefined) continue;
		if (actual === null) {
			suppressed = true;
			continue;
		}
		for (const token of normalizeClassValue(actual).split(/\s+/))
			if (token && !tokens.includes(token)) tokens.push(token);
	}
	return tokens.length ? tokens.join(' ') : suppressed ? null : undefined;
}

function mergeTokens(values: readonly unknown[]): string | null | undefined {
	const tokens: string[] = [];
	let suppressed = false;
	for (const value of values) {
		const actual = unwrap(value);
		if (actual === undefined) continue;
		if (actual === null) {
			suppressed = true;
			continue;
		}
		for (const token of String(actual).split(/\s+/))
			if (token && !tokens.includes(token)) tokens.push(token);
	}
	return tokens.length ? tokens.join(' ') : suppressed ? null : undefined;
}

function mergeStyles(
	authored: unknown,
	innerToOuter: readonly Readonly<Record<string, unknown>>[]
): unknown {
	const values = [...innerToOuter].reverse().map((layer) => layer.style);
	values.push(authored);
	const result: Record<string, unknown> = {};
	let sawObject = false;
	for (const value of values) {
		const actual = unwrap(value);
		if (actual === undefined) continue;
		if (actual === null) {
			for (const key of Object.keys(result)) delete result[key];
			sawObject = true;
			continue;
		}
		if (!actual || typeof actual !== 'object') return actual;
		sawObject = true;
		for (const [key, property] of Object.entries(actual)) result[key] = property;
	}
	return sawObject ? result : undefined;
}
