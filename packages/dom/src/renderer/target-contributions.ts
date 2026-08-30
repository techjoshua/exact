import {
	type AnyComponentInstance,
	TargetOverrides,
	attachElementIdentity,
	unwrap,
	type RefBinding
} from '@exactjs/core';
import {
	mergeTargetClassContributions,
	mergeTargetTokenContributions
} from '@exactjs/core/framework/target-contributions';
import { computed, scheduleWork, watch } from '@exactjs/reactive/framework/runtime';
import { installOwnedEventSubscription } from '../events.js';
import { isCompilerFormBindingProp, isEventHandlerProp, updateProps } from '../props.js';
import type { Mounted, Root } from '../types.js';
import { resolveTargetBoundary } from './target-routing.js';

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
	parentInstance: AnyComponentInstance | undefined
): void {
	const instance = mounted.instance ?? parentInstance;
	for (const child of mounted.children) refreshTargetSubtree(root, child, instance);
	if (mounted.targetReceipt) refreshTargetBoundary(root, mounted, parentInstance);
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
	parentInstance: AnyComponentInstance | undefined
): void {
	boundary.targetBoundary?.release?.();
	const boundaryProps = boundary.targetReceipt?.props;
	if (!boundaryProps)
		throw new TypeError('A semantic target boundary must retain its compiler-issued props');
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
		props: boundaryProps,
		owner: parentInstance
	});
	const releaseRef = installTargetRef(boundary, selected.dom, boundaryProps.ref);
	applyTargetProps(root, selected);
	boundary.targetBoundary.release = () => {
		releaseDependencies(boundary, dependencies);
		releaseRef();
		if (!selected.targetContributions?.delete(boundary)) return;
		applyTargetProps(root, selected);
	};
	refreshTargetDependents(root, boundary);
}

/** Applies authored props and all live target layers without mutating the authored operation. */
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
	previousAuthored: Readonly<Record<string, unknown>> = authoredIntrinsicProps(mounted),
	nextAuthored: Readonly<Record<string, unknown>> = authoredIntrinsicProps(mounted)
): void {
	if (!(mounted.dom instanceof Element)) return;
	for (const release of mounted.targetEventReleases ?? []) release();
	mounted.targetEventReleases = undefined;

	const previous = mounted.targetEffectiveProps ?? previousAuthored;
	const plan = composeTargetProps(nextAuthored, mounted.targetContributions);
	updateProps(root, mounted.dom, previous, plan.props, mounted.scope);
	mounted.targetEffectiveProps = plan.props;
	if (!plan.events.length) return;
	mounted.targetEventReleases = plan.events.map(({ key, source, owner, directInteraction }) =>
		installOwnedEventSubscription(
			root,
			mounted.dom as Element,
			key,
			source,
			owner,
			directInteraction
		)
	);
}

function authoredIntrinsicProps(mounted: Mounted): Readonly<Record<string, unknown>> {
	const props = mounted.intrinsicReceipt?.props;
	if (props) return props;
	if (mounted.targetAuthoredProps) return mounted.targetAuthoredProps;
	const program = mounted.renderProgram;
	if (!program?.programRoot)
		throw new TypeError('A semantic intrinsic must retain its authored props');
	if (!(program.programRoot instanceof Element))
		throw new TypeError('A semantic intrinsic render-program root must be an element');
	const programRoot = program.programRoot;
	const rootProps: Record<string, unknown> = {};
	for (const attribute of programRoot.attributes) {
		const name =
			attribute.name === 'class'
				? 'className'
				: attribute.name === 'for'
					? 'htmlFor'
					: attribute.name;
		rootProps[name] = attribute.value;
	}
	Object.assign(rootProps, program.props?.get(programRoot));
	for (const group of program.compiledProps ?? []) {
		if (group?.element === programRoot) Object.assign(rootProps, group.values);
	}
	mounted.targetAuthoredProps = rootProps;
	return rootProps;
}

type TargetPropPlan = {
	readonly props: Record<string, unknown>;
	readonly events: ReadonlyArray<{
		key: string;
		source: unknown;
		owner?: AnyComponentInstance;
		directInteraction?: boolean;
	}>;
};

function composeTargetProps(
	authored: Readonly<Record<string, unknown>>,
	contributions:
		| ReadonlyMap<
				Mounted,
				Readonly<{
					props: Readonly<Record<string, unknown>>;
					owner?: AnyComponentInstance;
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
	const handledEvents = new Set<string>();
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
		if (isCompilerFormBindingProp(key)) {
			if (key in authored) result[key] = authored[key];
			continue;
		}
		if (isEventHandlerProp(key)) {
			const eventKey = authoredEventKey(key);
			if (handledEvents.has(eventKey)) continue;
			handledEvents.add(eventKey);
			const authoredKey = Object.keys(authored).find(
				(candidate) => isEventHandlerProp(candidate) && authoredEventKey(candidate) === eventKey
			);
			const contributed = innerToOuter.flatMap((layer) => {
				const contributedKey = Object.keys(layer.props).find(
					(candidate) => isEventHandlerProp(candidate) && authoredEventKey(candidate) === eventKey
				);
				return contributedKey
					? [{ key: contributedKey, source: layer.props[contributedKey], owner: layer.owner }]
					: [];
			});
			if (!contributed.length) {
				if (authoredKey) result[authoredKey] = authored[authoredKey];
				continue;
			}
			if (authoredKey)
				events.push({
					key: eventKey,
					source: authored[authoredKey],
					directInteraction: compilerDirectInteraction(authoredKey)
				});
			for (const contribution of contributed)
				events.push({
					key: eventKey,
					source: contribution.source,
					owner: contribution.owner,
					directInteraction: compilerDirectInteraction(contribution.key)
				});
			continue;
		}
		const values = overrides.has(key)
			? [...innerToOuter.map((layer) => layer.props[key]), authored[key]]
			: [authored[key], ...innerToOuter.map((layer) => layer.props[key])];
		if (key === 'class' || key === 'className')
			result[key] = computed(() => mergeTargetClassContributions(values));
		else if (key === 'style')
			result[key] = computed(() =>
				mergeStyles(
					authored[key],
					innerToOuter.map((layer) => layer.props)
				)
			);
		else if (tokenListProps.has(key))
			result[key] = computed(() => mergeTargetTokenContributions(values));
		else result[key] = computed(() => firstDefined(values));
	}
	return { props: result, events };
}

function authoredEventKey(key: string): string {
	if (key.startsWith('__exactClosedInteraction:'))
		return key.slice('__exactClosedInteraction:'.length);
	if (key.startsWith('__exactDirectInteraction:'))
		return key.slice('__exactDirectInteraction:'.length);
	return key;
}

function compilerDirectInteraction(key: string): boolean {
	return key.startsWith('__exactDirectInteraction:') || key.startsWith('__exactClosedInteraction:');
}

function firstDefined(values: readonly unknown[]): unknown {
	for (const value of values) {
		const actual = unwrap(value);
		if (actual !== undefined) return actual;
	}
	return undefined;
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
