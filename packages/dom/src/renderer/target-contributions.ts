import { Target, normalizeClassValue, unwrap, type ComponentInstance } from '@exactjs/core';
import { computed, scheduleWork } from '@exactjs/reactive';
import { updateProps } from '../props.js';
import type { Mounted, Root } from '../types.js';
import { resolveTargetBoundary } from './enhancement-targets.js';

const tokenListProps = new Set([
	'aria-describedby',
	'aria-labelledby',
	'aria-controls',
	'aria-owns',
	'rel'
]);

/** Installs the structural reconciliation hook shared by ordinary and enhanced components. */
export function installTargetContributionReconciliation(root: Root): void {
	root.reconcileTargets = () => {
		if (!root.mounted) return;
		scheduleWork(
			() => {
				if (root.mounted) refreshTargetSubtree(root, root.mounted, undefined);
			},
			'normal',
			undefined,
			root.mounted.scope
		);
	};
}

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

/** Attaches one boundary's owned layer to its current semantic intrinsic target. */
export function refreshTargetBoundary(
	root: Root,
	boundary: Mounted,
	parentInstance: ComponentInstance<any> | undefined
): void {
	const previousState = boundary.targetBoundary;
	const previous = previousState?.selected;
	const selected = resolveTargetBoundary(boundary, parentInstance)?.mounted;
	if (previous === selected) {
		if (selected) {
			selected.targetContributions ??= new Map();
			selected.targetContributions.set(boundary, boundary.vnode.props);
			applyTargetProps(root, selected);
		}
		return;
	}
	previousState?.release?.();
	boundary.targetBoundary = { selected };
	if (!selected || !(selected.dom instanceof Element)) return;
	selected.targetContributions ??= new Map();
	selected.targetContributions.set(boundary, boundary.vnode.props);
	applyTargetProps(root, selected);
	boundary.targetBoundary = {
		selected,
		release: () => {
			if (!selected.targetContributions?.delete(boundary)) return;
			applyTargetProps(root, selected);
		}
	};
}

/** Applies authored props and all live target layers without mutating the authored VNode. */
export function updateTargetedIntrinsicProps(
	root: Root,
	mounted: Mounted,
	previousAuthored: Record<string, unknown>,
	nextAuthored: Record<string, unknown>
): void {
	const previous = mounted.targetEffectiveProps ?? previousAuthored;
	const next = composeTargetProps(nextAuthored, mounted.targetContributions);
	updateProps(root, mounted.dom as Element, previous, next, mounted.scope);
	mounted.targetEffectiveProps = next;
}

function applyTargetProps(root: Root, mounted: Mounted): void {
	if (!(mounted.dom instanceof Element)) return;
	const previous = mounted.targetEffectiveProps ?? mounted.vnode.props;
	const next = composeTargetProps(mounted.vnode.props, mounted.targetContributions);
	updateProps(root, mounted.dom, previous, next, mounted.scope);
	mounted.targetEffectiveProps = next;
}

function composeTargetProps(
	authored: Readonly<Record<string, unknown>>,
	contributions: ReadonlyMap<Mounted, Readonly<Record<string, unknown>>> | undefined
): Record<string, unknown> {
	if (!contributions?.size) return { ...authored };
	const innerToOuter = [...contributions.values()];
	const keys = new Set(Object.keys(authored));
	for (const layer of innerToOuter) for (const key of Object.keys(layer)) keys.add(key);
	const result: Record<string, unknown> = {};
	for (const key of keys) {
		if (key === 'children' || key === 'key') continue;
		const values = [authored[key], ...innerToOuter.map((layer) => layer[key])];
		if (key === 'class' || key === 'className') result[key] = computed(() => mergeClasses(values));
		else if (key === 'style')
			result[key] = computed(() => mergeStyles(authored[key], innerToOuter));
		else if (tokenListProps.has(key)) result[key] = computed(() => mergeTokens(values));
		else if (key === 'ref') result[key] = fanoutRef(values);
		else if (/^on[A-Z]/.test(key)) result[key] = composeHandlers(values);
		else result[key] = computed(() => firstDefined(values));
	}
	return result;
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

function fanoutRef(values: readonly unknown[]): { fulfill(value: unknown): void } {
	return {
		fulfill(value) {
			for (const candidate of values) {
				const ref = unwrap(candidate) as { fulfill(value: unknown): void } | undefined | null;
				ref?.fulfill(value);
			}
		}
	};
}

function composeHandlers(values: readonly unknown[]): (event: Event) => void {
	return function composed(this: Element, event: Event): void {
		for (const candidate of values) {
			const handler = unwrap(candidate);
			if (typeof handler === 'function') handler.call(this, event);
		}
	};
}
