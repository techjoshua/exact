import { Activity, type Component } from '@exactjs/core';
import { PhysicsElement, PhysicsWorldComponent } from './components.js';
import { PhysicsBodyContext } from './context.js';
import type { PhysicsBody, PhysicsWorld } from './contracts.js';

let bodySwapScene: Component<{ body: PhysicsBody }> | undefined;
let contextualBody: PhysicsBody | undefined;
let activityScene: Component<{ mode: 'active' | 'parked' }> | undefined;

/** Compiler-backed fixture that forwards a replaceable body prop. */
export function PhysicsBodySwapScene(
	this: Component<{ body: PhysicsBody }>,
	props: { world: PhysicsWorld; first: PhysicsBody }
) {
	bodySwapScene = this;
	this.state.body = props.first;
	return () => (
		<PhysicsWorldComponent world={props.world} running={false}>
			<PhysicsElement body={this.state.body}>
				<div />
			</PhysicsElement>
		</PhysicsWorldComponent>
	);
}

/** Reads the durable body-swap fixture instance. */
export function physicsBodySwapSceneInstance() {
	if (!bodySwapScene) throw new Error('Physics body-swap fixture has not been mounted');
	return bodySwapScene;
}

function PhysicsBodyConsumer(this: Component<{}>) {
	contextualBody = this.getContext(PhysicsBodyContext).body;
	return () => <div />;
}

/** Compiler-backed fixture for reactive resource prop unwrapping. */
export function PhysicsContextScene(
	this: Component<{}>,
	props: { world: PhysicsWorld; body: PhysicsBody }
) {
	return () => (
		<PhysicsWorldComponent world={props.world}>
			<PhysicsElement body={props.body}>
				<PhysicsBodyConsumer />
			</PhysicsElement>
		</PhysicsWorldComponent>
	);
}

/** Reads the body observed by the current context consumer. */
export function observedPhysicsBody() {
	return contextualBody;
}

/** Compiler-backed fixture that changes Activity mode through durable component state. */
export function PhysicsActivityScene(
	this: Component<{ mode: 'active' | 'parked' }>,
	props: { world: PhysicsWorld }
) {
	activityScene = this;
	this.state.mode = 'active';
	return () => (
		<Activity mode={this.state.mode}>
			<PhysicsWorldComponent world={props.world}>
				<div />
			</PhysicsWorldComponent>
		</Activity>
	);
}

/** Reads the durable Activity fixture instance. */
export function physicsActivitySceneInstance() {
	if (!activityScene) throw new Error('Physics Activity fixture has not been mounted');
	return activityScene;
}
