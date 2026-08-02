import {
	isTaskCancellation,
	markExactComponent,
	unwrap,
	watch,
	type Component,
	type RootRelease
} from '@exactjs/core';
import { defaultMotionSettings, MotionContext } from './context.js';
import type {
	MotionDefinition,
	MotionElementProps,
	MotionPhase,
	MotionPlayback,
	MotionSettings
} from './contracts.js';
import { animate, resolveMotionEffect } from './playback.js';

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
		if (!release) return;
		leavePlayback?.cancel('motion-leave-superseded');
		leavePlayback = playRelease(release, resolvePhase(props, 'leave'), props.apply, settings);
		if (leavePlayback) observePlayback(leavePlayback, this.log.error);
	}, undefined);

	this.onUnmount(() => {
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
	return animate(element, effect);
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
	return animate(release.target, effect);
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
