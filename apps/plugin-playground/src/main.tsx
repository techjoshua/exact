import type { Component } from '@exactjs/core';
import { render } from '@exactjs/dom';
import gesture from '@exactjs/gestures' with { type: 'exact-plugin' };
import { defineGesture } from '@exactjs/gestures';
import gravity from '@exactjs/gravity' with { type: 'exact-plugin' };
import { uniformGravity } from '@exactjs/gravity';
import motion from '@exactjs/motion' with { type: 'exact-plugin' };
import { defineMotion } from '@exactjs/motion';
import physics from '@exactjs/physics' with { type: 'exact-plugin' };
import { PhysicsWorld, createPhysicsWorld } from '@exactjs/physics';
import './styles.css';

const orbMotion = defineMotion({
	enter: {
		keyframes: [{ opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1 }],
		options: { duration: 220, easing: 'ease-out' }
	},
	leave: {
		keyframes: [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.6 }],
		options: { duration: 180, easing: 'ease-in' }
	},
	reduced: 'skip'
});

function PluginPlayground(this: Component<{ shown: boolean }>) {
	this.state.shown = true;
	const world = createPhysicsWorld({ fixedStep: 1 / 120, maxCatchUpSteps: 8 });
	const orb = world.createBody({
		id: 'orb',
		shape: { kind: 'circle', radius: 32 },
		position: { x: 210, y: 36 },
		restitution: 0.72,
		damping: 0.03
	});
	world.createBody({
		id: 'floor',
		type: 'static',
		shape: { kind: 'box', width: 520, height: 24 },
		position: { x: 210, y: 286 }
	});
	const downward = uniformGravity({ x: 0, y: 360 });
	let dragOrigin = { x: 0, y: 0 };
	const directManipulation = defineGesture({
		name: 'orb-direct-manipulation',
		drag: {
			threshold: 2,
			onStart() {
				dragOrigin = { ...orb.pose.position };
				orb.setKinematic(true);
			},
			onMove(sample) {
				orb.setPose({
					position: {
						x: dragOrigin.x + sample.delta.x,
						y: dragOrigin.y + sample.delta.y
					}
				});
			},
			onEnd() {
				orb.setKinematic(false);
			},
			onCancel() {
				orb.setKinematic(false);
			}
		},
		keyboard: {
			step: 12,
			onMove(sample) {
				orb.setPose({
					position: {
						x: orb.pose.position.x + sample.delta.x,
						y: orb.pose.position.y + sample.delta.y
					}
				});
			}
		},
		touchAction: 'none'
	});

	this.onUnmount(() => world[Symbol.dispose]());
	return () => (
		<PhysicsWorld world={world}>
			<main>
				<header>
					<p className="eyebrow">Attributed renderer enhancements</p>
					<h1>One target, four optional plugins</h1>
					<p>
						Drag the orb, move it with the arrow keys, or give it another impulse. Motion owns
						presence, gestures own intent, physics owns simulation, and gravity contributes force.
					</p>
				</header>
				<div className="controls">
					<button onClick={() => (this.state.shown = !this.state.shown)}>
						{this.state.shown ? 'Remove orb' : 'Restore orb'}
					</button>
					<button onClick={() => orb.applyImpulse({ x: 80, y: -220 })}>Impulse</button>
				</div>
				<section className="stage" aria-label="Plugin simulation stage">
					{this.state.shown ? (
						<button
							key="orb"
							className="orb"
							aria-label="Movable physics orb"
							motion:apply={orbMotion}
							motion:appear
							gesture:apply={directManipulation}
							physics:body={orb}
							gravity:apply={downward}
						>
							eX
						</button>
					) : null}
					<div className="floor" />
				</section>
			</main>
		</PhysicsWorld>
	);
}

render(<PluginPlayground />, document.getElementById('app')!);
