import { Activity, type Component } from '@exactjs/core';
import { MotionElement } from './motion-element.js';
import { Motion } from './motion.js';
import { fade } from './presets.js';

let dynamicReleaseScene: Component<{ shown: boolean }> | undefined;
let lateMotionScene: Component<{ shown: boolean }> | undefined;
let changeMotionScene: Component<{ offset: number }> | undefined;
let activityMotionScene: Component<{ mode: 'active' | 'parked' }> | undefined;

/** Compiler-backed dynamic enhancement range used by release tests. */
export function DynamicReleaseScene(this: Component<{ shown: boolean }>) {
	dynamicReleaseScene = this;
	this.state.shown = true;
	return () => (
		<section>
			{this.state.shown ? (
				<MotionElement apply={fade} appear={false}>
					<button>Save</button>
				</MotionElement>
			) : null}
		</section>
	);
}

/** Reads the dynamic release fixture instance. */
export function dynamicReleaseSceneInstance() {
	if (!dynamicReleaseScene) throw new Error('Dynamic release fixture has not been mounted');
	return dynamicReleaseScene;
}

/** Compiler-backed conditional motion root. */
export function LateMotionScene(this: Component<{ shown: boolean }>) {
	lateMotionScene = this;
	this.state.shown = false;
	return () =>
		this.state.shown ? (
			<Motion as="button" motion={fade}>
				Later
			</Motion>
		) : null;
}

/** Reads the conditional motion fixture instance. */
export function lateMotionSceneInstance() {
	if (!lateMotionScene) throw new Error('Late motion fixture has not been mounted');
	return lateMotionScene;
}

/** Compiler-backed reactive enhancement configuration. */
export function ChangeMotionScene(this: Component<{ offset: number }>) {
	changeMotionScene = this;
	this.state.offset = 0;
	return () => (
		<MotionElement
			change={{
				keyframes: [
					{ transform: 'translateX(0)' },
					{ transform: `translateX(${this.state.offset}px)` }
				]
			}}
		>
			<span>Indicator</span>
		</MotionElement>
	);
}

/** Reads the reactive enhancement fixture instance. */
export function changeMotionSceneInstance() {
	if (!changeMotionScene) throw new Error('Change motion fixture has not been mounted');
	return changeMotionScene;
}

/** Compiler-backed Activity lifecycle fixture. */
export function ActivityMotionScene(this: Component<{ mode: 'active' | 'parked' }>) {
	activityMotionScene = this;
	this.state.mode = 'active';
	return () => (
		<Activity mode={this.state.mode}>
			<Motion as="button" motion={fade} appear>
				Parked
			</Motion>
		</Activity>
	);
}

/** Reads the Activity motion fixture instance. */
export function activityMotionSceneInstance() {
	if (!activityMotionScene) throw new Error('Activity motion fixture has not been mounted');
	return activityMotionScene;
}
