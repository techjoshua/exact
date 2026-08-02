import {
	isTaskCancellation,
	markExactComponent,
	unwrap,
	watch,
	type Component,
	type RootRelease
} from '@exactjs/core';
import { defaultMotionSettings, MotionContext } from './context.js';
import { LayoutContext } from './layout.js';
import { ExitLayoutContext } from './presence.js';
import { acquireSemanticAbsence, releaseSemanticAbsence } from './semantics.js';
import type {
	MotionDefinition,
	MotionElementProps,
	MotionPhase,
	MotionPlayback,
	MotionSettings
} from './contracts.js';
import { animateInFrame, resolveMotionEffect } from './playback.js';

/** Transparent ordinary component activated for one resolved motion target. */
export const MotionElement = markExactComponent(function MotionElement(
	this: Component<{}>,
	props: MotionElementProps
) {
	const root = this.refs.root<Element>();
	const settings = this.hasContext(MotionContext)
		? this.getContext(MotionContext)
		: defaultMotionSettings;
	let changePlayback: MotionPlayback | undefined;
	let leavePlayback: MotionPlayback | undefined;
	let appeared = false;
	const semanticOwner = Symbol('motion.element-presence');
	let semanticTarget: Element | undefined;
	const layoutIdentity = Symbol('motion.layout-participant');
	let unregisterLayout: (() => void) | undefined;

	watch(() => {
		unregisterLayout?.();
		unregisterLayout = undefined;
		const element = root.current;
		if (!element || !props.layout || !this.hasContext(LayoutContext)) return;
		unregisterLayout = this.getContext(LayoutContext).register(
			props.layoutId ?? layoutIdentity,
			element,
			props.layout
		);
	});

	watch(() => {
		const element = root.current;
		if (!element || !root.presented) return;
		const entering = !appeared;
		const phase = entering ? resolvePhase(props, 'enter') : resolvePhase(props, 'change');
		const shouldAppear = props.appear ?? settings.appear;
		appeared = true;
		if (entering && !shouldAppear) return;
		changePlayback?.cancel('motion-superseded');
		changePlayback = play(element, phase, entering ? 'enter' : 'change', props.apply, settings);
		if (changePlayback) observePlayback(changePlayback, this.log.error);
	}, undefined);

	watch(() => {
		const release = root.release;
		if (!release) {
			if (semanticTarget) releaseSemanticAbsence(semanticTarget, semanticOwner);
			semanticTarget = undefined;
			return;
		}
		semanticTarget = release.target;
		const exitLayout = this.hasContext(ExitLayoutContext)
			? this.getContext(ExitLayoutContext).mode
			: undefined;
		acquireSemanticAbsence(release.target, semanticOwner, { exitLayout });
		leavePlayback?.cancel('motion-leave-superseded');
		leavePlayback = playRelease(release, resolvePhase(props, 'leave'), props.apply, settings);
		if (leavePlayback) observePlayback(leavePlayback, this.log.error);
	}, undefined);

	this.onUnmount(() => {
		releaseSemanticAbsence(semanticTarget, semanticOwner);
		unregisterLayout?.();
		changePlayback?.cancel('motion-owner-disposed');
		leavePlayback?.cancel('motion-owner-disposed');
	});
	return () => props.children;
}, '@exactjs/motion:MotionElement');

function resolvePhase(
	props: MotionElementProps,
	phase: 'enter' | 'change' | 'leave'
): MotionPhase | undefined {
	return unwrap(props[phase]) ?? unwrap(props.apply)?.[phase];
}

function play(
	element: Element,
	phase: MotionPhase | undefined,
	phaseName: 'enter' | 'change',
	definition: MotionDefinition | undefined,
	settings: MotionSettings
): MotionPlayback | undefined {
	const effect = resolveMotionEffect(
		unwrap(phase),
		element,
		phaseName,
		settings,
		unwrap(definition)?.reduced
	);
	if (!effect) return undefined;
	return animateInFrame(element, effect, phaseName === 'enter' ? 'motion-enter' : 'motion-change');
}

function playRelease(
	release: RootRelease<Element>,
	phase: MotionPhase | undefined,
	definition: MotionDefinition | undefined,
	settings: MotionSettings
): MotionPlayback | undefined {
	if (!release.presented) return undefined;
	const effect = resolveMotionEffect(
		unwrap(phase),
		release.target,
		'leave',
		settings,
		unwrap(definition)?.reduced
	);
	if (!effect) return undefined;
	return animateInFrame(release.target, effect, 'motion-leave');
}

function observePlayback(
	playback: MotionPlayback,
	report: (message: string, error?: unknown) => void
): void {
	void playback.then(undefined, (error) => {
		if (!playback.signal.aborted && !isTaskCancellation(error)) {
			report('motion playback failed', error);
		}
	});
}
