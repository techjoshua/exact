import { createContext, watch, type Child, type Component } from '@exactjs/core';
import {
	createCompiledComponentReceipt,
	createCompiledKeyedChildReceipt
} from '@exactjs/core/runtime/component-abi';
import { opaqueOperationKey } from '@exactjs/core/runtime/component-operations';
import type { PresenceProps } from './contracts.js';
import type { MotionPlayback } from './contracts.js';
import { acquireSemanticAbsence, releaseSemanticAbsence } from './semantics.js';

type PresenceRangeProps = Readonly<{
	children?: Child;
	returnFocus?: PresenceProps['returnFocus'];
	exitLayout?: 'retain' | 'pop';
	entering?: boolean;
	onEntered?: () => void;
	onExited?: () => void;
}>;

type PresenceItem = Readonly<{ key: string; child: Child }>;

/** Internal collection-exit policy inherited by a motion-decorated list root. */
export const ExitLayoutContext =
	createContext<Readonly<{ mode: 'retain' | 'pop' }>>('motion.exit-layout');

/** Internal enter-settlement collector inherited by motion descendants in one keyed range. */
export const PresenceEnterContext = createContext<{
	readonly entering: boolean;
	register(playback: MotionPlayback): void;
}>('motion.presence-enter');

/** Conditionally projects children through generation-fenced renderer release and reversal. */
export function Presence(this: Component<{ revision: number }>, props: PresenceProps) {
	this.state.revision = 0;
	let displayed: PresenceItem[] | undefined;
	let pending: PresenceItem[] = [];
	let exiting: PresenceItem[] = [];
	let phase: 'idle' | 'waiting-exit' | 'waiting-enter' = 'idle';
	let transition = 0;
	let awaiting = new Set<string>();
	let entering = new Set<string>();

	const invalidate = () => this.state.revision++;
	const entered = (key: string) => {
		if (phase !== 'waiting-enter' || !awaiting.delete(key) || awaiting.size) return;
		const generation = transition;
		queueMicrotask(() => {
			if (phase !== 'waiting-enter' || transition !== generation) return;
			displayed = pending;
			phase = 'idle';
			entering.clear();
			invalidate();
		});
	};
	const exited = (key: string) => {
		if (phase !== 'waiting-exit' || !awaiting.delete(key) || awaiting.size) return;
		displayed = pending;
		phase = 'idle';
		entering = new Set(pending.map((item) => item.key));
		invalidate();
	};

	const render = () => {
		void this.state.revision;
		const desired = props.when ? presenceItems(props.children) : [];
		const initial = displayed === undefined;
		displayed ??= desired;
		const mode = props.mode ?? 'sync';
		if (mode === 'sync') {
			transition++;
			phase = 'idle';
			entering = initial ? new Set() : addedIdentities(displayed, desired);
			displayed = desired;
			return projectPresence(displayed, props, entered, exited, entering);
		}

		if (phase === 'waiting-exit') {
			if (sameIdentities(desired, exiting)) {
				transition++;
				phase = 'idle';
				displayed = desired;
				entering.clear();
				return projectPresence(displayed, props, entered, exited, entering);
			}
			pending = desired;
			return [];
		}
		if (phase === 'waiting-enter') {
			if (!sameIdentities(desired, pending)) {
				transition++;
				phase = 'idle';
				entering = addedIdentities(exiting, desired);
				displayed = desired;
				return projectPresence(displayed, props, entered, exited, entering);
			}
			return projectPresence(mergePresence(exiting, pending), props, entered, exited, entering);
		}

		if (sameIdentities(displayed, desired) || !displayed.length || !desired.length) {
			if (!initial && !displayed.length) entering = new Set(desired.map((item) => item.key));
			else if (!entering.size) entering.clear();
			displayed = desired;
			const result = projectPresence(displayed, props, entered, exited, entering);
			if (phase === 'idle') entering = new Set();
			return result;
		}

		transition++;
		exiting = displayed;
		pending = desired;
		if (mode === 'out-in') {
			phase = 'waiting-exit';
			awaiting = new Set(exiting.map((item) => item.key));
			return [];
		}
		phase = 'waiting-enter';
		entering = addedIdentities(exiting, desired);
		awaiting = new Set(entering);
		if (!awaiting.size) {
			displayed = desired;
			phase = 'idle';
			return projectPresence(displayed, props, entered, exited, entering);
		}
		return projectPresence(mergePresence(exiting, desired), props, entered, exited, entering);
	};
	return () => render();
}

function presenceItems(children: PresenceProps['children']): PresenceItem[] {
	const values = Array.isArray(children) ? children : [children];
	const result: PresenceItem[] = [];
	for (let index = 0; index < values.length; index++) {
		const child = values[index];
		if (child === null || child === undefined || child === false || child === true) continue;
		result.push({
			key: opaqueOperationKey(child) ?? `presence:${index}`,
			child
		});
	}
	return result;
}

function sameIdentities(left: readonly PresenceItem[], right: readonly PresenceItem[]): boolean {
	if (left.length !== right.length) return false;
	const keys = new Set(left.map((item) => item.key));
	return right.every((item) => keys.has(item.key));
}

function addedIdentities(
	previous: readonly PresenceItem[],
	next: readonly PresenceItem[]
): Set<string> {
	const existing = new Set(previous.map((item) => item.key));
	return new Set(next.filter((item) => !existing.has(item.key)).map((item) => item.key));
}

function mergePresence(
	oldItems: readonly PresenceItem[],
	newItems: readonly PresenceItem[]
): PresenceItem[] {
	const desired = new Set(newItems.map((item) => item.key));
	return [...newItems, ...oldItems.filter((item) => !desired.has(item.key))];
}

function projectPresence(
	items: readonly PresenceItem[],
	props: PresenceProps,
	entered: (key: string) => void,
	exited: (key: string) => void,
	entering: ReadonlySet<string>
): Child[] {
	return items.map((item) =>
		createCompiledComponentReceipt(
			PresenceRange,
			{
				key: item.key,
				entering: entering.has(item.key),
				returnFocus: props.returnFocus,
				onEntered: () => entered(item.key),
				onExited: () => exited(item.key)
			},
			item.child
		)
	);
}

function PresenceRange(this: Component<{}>, props: PresenceRangeProps) {
	const root = this.refs.root<Element>();
	const parentEnter = this.hasContext(PresenceEnterContext)
		? this.getContext(PresenceEnterContext)
		: undefined;
	const semanticOwner = Symbol('motion.presence');
	let semanticTarget: Element | undefined;
	let mounted = false;
	let sealed = false;
	let pendingEntries = 0;
	let entered = false;
	const notifyEntered = () => {
		if (entered || !mounted || !sealed || pendingEntries) return;
		entered = true;
		props.onEntered?.();
	};
	this.setContext(PresenceEnterContext, {
		get entering() {
			return props.entering === true;
		},
		register(playback) {
			if (!props.entering || entered) return;
			pendingEntries++;
			parentEnter?.register(playback);
			void playback.then(
				() => {
					pendingEntries--;
					notifyEntered();
				},
				() => {
					pendingEntries--;
					notifyEntered();
				}
			);
		}
	});
	if (props.exitLayout) {
		this.setContext(ExitLayoutContext, {
			get mode() {
				return props.exitLayout ?? 'retain';
			}
		});
	}
	this.onMount(() => {
		mounted = true;
		queueMicrotask(() => {
			sealed = true;
			notifyEntered();
		});
	});

	watch(() => {
		const release = root.release;
		if (release) {
			semanticTarget = release.target;
			acquireSemanticAbsence(release.target, semanticOwner, props);
		} else if (semanticTarget) {
			releaseSemanticAbsence(semanticTarget, semanticOwner);
			semanticTarget = undefined;
		}
	});
	this.onUnmount(() => {
		releaseSemanticAbsence(semanticTarget, semanticOwner);
		props.onExited?.();
	});

	return () => props.children;
}

/** Applies a stable key and optional exit-layout owner to one projected list child. */
export function keyedPresenceChild(
	child: Child,
	key: string,
	exitLayout?: 'retain' | 'pop'
): Child {
	if (exitLayout === 'pop')
		return createCompiledKeyedChildReceipt(
			createCompiledComponentReceipt(PresenceRange, { exitLayout }, child),
			key
		);
	return createCompiledKeyedChildReceipt(child, key);
}
