import { Activity, type Component } from '@exactjs/core';
import {
	PhysicsElement,
	PhysicsWorld,
	type PhysicsBody,
	type PhysicsWorld as PhysicsWorldResource
} from '@exactjs/physics';
import { GravityElement } from './components.js';
import type { GravityField } from './contracts.js';

let activityScene: Component<{ field: GravityField; mode: 'active' | 'parked' }> | undefined;

/** Compiler-backed activity fixture for gravity lifecycle tests. */
export function GravityActivityScene(
	this: Component<{ field: GravityField; mode: 'active' | 'parked' }>,
	props: { world: PhysicsWorldResource; body: PhysicsBody; field: GravityField }
) {
	activityScene = this;
	this.state.field = props.field;
	this.state.mode = 'active';
	return () => (
		<Activity mode={this.state.mode}>
			<PhysicsWorld world={props.world} running={false}>
				<PhysicsElement body={props.body}>
					<GravityElement apply={this.state.field}>
						<div />
					</GravityElement>
				</PhysicsElement>
			</PhysicsWorld>
		</Activity>
	);
}

/** Returns the durable instance created by the current activity fixture. */
export function gravityActivitySceneInstance() {
	if (!activityScene) throw new Error('Gravity activity fixture has not been mounted');
	return activityScene;
}
