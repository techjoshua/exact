import {
	createContext,
	isTaskCancellation,
	type Child,
	type ComponentInstance
} from '@exactjs/core';
import type { LayoutGroupProps, MotionElementProps, MotionPlayback } from './contracts.js';
import { defaultMotionSettings, MotionContext } from './context.js';
import { animateInFrame, resolveMotionEffect } from './playback.js';

type LayoutMode = NonNullable<MotionElementProps['layout']>;
type LayoutIdentity = string | symbol;
type LayoutParticipant = {
	element: Element;
	mode: LayoutMode;
	playback?: MotionPlayback;
};

/** Internal scoped coordination contract consumed by motion participants and lists. */
export interface LayoutCoordinator {
	register(identity: LayoutIdentity, element: Element, mode: LayoutMode): () => void;
	snapshot(): void;
	animate(): void;
}

/** Nearest logical layout-measurement boundary. */
export const LayoutContext = createContext<LayoutCoordinator>('motion.layout');

/** Coordinates FLIP measurement and stable shared identity for one logical subtree. */
export function LayoutGroup(this: ComponentInstance<{}>, props: LayoutGroupProps) {
	const settings = this.hasContext(MotionContext)
		? this.getContext(MotionContext)
		: defaultMotionSettings;
	const participants = new Map<LayoutIdentity, Set<LayoutParticipant>>();
	const snapshots = new Map<Element, DOMRect>();
	const identitySnapshots = new Map<LayoutIdentity, DOMRect>();
	const owner = this;
	const coordinator: LayoutCoordinator = {
		register(identity, element, mode) {
			const participant: LayoutParticipant = { element, mode };
			let channel = participants.get(identity);
			if (!channel) participants.set(identity, (channel = new Set()));
			channel.add(participant);
			return () => {
				if (!channel.delete(participant)) return;
				participant.playback?.cancel('layout-participant-disposed');
				if (!channel.size) participants.delete(identity);
				snapshots.delete(element);
			};
		},
		snapshot() {
			for (const [identity, channel] of participants) {
				for (const participant of channel) {
					const bounds = participant.element.getBoundingClientRect();
					snapshots.set(participant.element, bounds);
					if (!identitySnapshots.has(identity)) identitySnapshots.set(identity, bounds);
				}
			}
		},
		animate() {
			for (const [identity, channel] of participants) {
				for (const participant of channel) {
					const before = snapshots.get(participant.element) ?? identitySnapshots.get(identity);
					if (!before || !participant.element.isConnected) continue;
					const effect = layoutEffect(
						before,
						participant.element.getBoundingClientRect(),
						participant.mode
					);
					if (!effect) continue;
					participant.playback?.cancel('layout-superseded');
					const resolved = resolveMotionEffect(effect, participant.element, 'change', settings);
					if (!resolved) continue;
					const playback = animateInFrame(participant.element, resolved, 'layout-transition');
					participant.playback = playback;
					void playback.then(undefined, (error) => {
						if (!playback.signal.aborted && !isTaskCancellation(error)) {
							owner.log.error('layout playback failed', error, { group: props.id });
						}
					});
				}
			}
			snapshots.clear();
			identitySnapshots.clear();
		}
	};
	this.setContext(LayoutContext, coordinator);
	this.onUnmount(() => {
		for (const channel of participants.values()) {
			for (const participant of channel) {
				participant.playback?.cancel('layout-group-disposed');
			}
		}
		participants.clear();
		snapshots.clear();
		identitySnapshots.clear();
	});
	return () => props.children as Child;
}

function layoutEffect(before: DOMRect, after: DOMRect, mode: LayoutMode) {
	const animatePosition = mode === true || mode === 'both' || mode === 'position';
	const animateSize = mode === true || mode === 'both' || mode === 'size';
	const x = animatePosition ? before.left - after.left : 0;
	const y = animatePosition ? before.top - after.top : 0;
	const scaleX = animateSize && after.width ? before.width / after.width : 1;
	const scaleY = animateSize && after.height ? before.height / after.height : 1;
	if (x === 0 && y === 0 && scaleX === 1 && scaleY === 1) return undefined;
	return {
		keyframes: [
			{
				transform: `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`,
				transformOrigin: 'top left',
				composite: 'add' as CompositeOperation
			},
			{
				transform: 'none',
				transformOrigin: 'top left',
				composite: 'add' as CompositeOperation
			}
		]
	};
}
