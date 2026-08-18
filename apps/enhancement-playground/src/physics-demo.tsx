import { createRef, type Component } from '@exactjs/core';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Consumed by gesture:* attributes.
import gesture from '@exactjs/gestures' with { type: 'exact-enhancement' };
import { defineGesture } from '@exactjs/gestures';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Consumed by gravity:* attributes.
import gravity from '@exactjs/gravity' with { type: 'exact-enhancement' };
import { uniformGravity } from '@exactjs/gravity';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Consumed by motion:* attributes.
import motion from '@exactjs/motion' with { type: 'exact-enhancement' };
import { defineMotion } from '@exactjs/motion';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Consumed by physics:* attributes.
import physics from '@exactjs/physics' with { type: 'exact-enhancement' };
import { PhysicsWorld, createPhysicsWorld } from '@exactjs/physics';

const orbMotion = defineMotion({
	enter: {
		keyframes: [
			{ opacity: 0, scale: 0.7 },
			{ opacity: 1, scale: 1 }
		],
		options: { duration: 220, easing: 'ease-out' }
	},
	leave: {
		keyframes: [
			{ opacity: 1, scale: 1 },
			{ opacity: 0, scale: 0.6 }
		],
		options: { duration: 180, easing: 'ease-in' }
	},
	reduced: 'skip'
});

const initialOrbPosition = { x: 260, y: 62 };
const stageSize = { width: 520, height: 330 };

type PhysicsDemoState = {
	shown: boolean;
	stageScale: number;
};

/** Aggregate demo where gesture intent drives a gravity-enabled projected physics body. */
export function PhysicsDemo(this: Component<PhysicsDemoState>) {
	this.state.shown = true;
	this.state.stageScale = 1;
	let stageScale = 1;
	const stageViewport = createRef<HTMLDivElement>('enhancement-playground-stage');
	const world = createPhysicsWorld({ fixedStep: 1 / 120, maxCatchUpSteps: 8 });
	const orb = world.createBody({
		id: 'orb',
		shape: { kind: 'circle', radius: 32 },
		position: initialOrbPosition,
		restitution: 0.96,
		damping: 0.006,
		angularDamping: 0.01
	});
	for (const boundary of [
		{ id: 'floor', shape: { kind: 'box' as const, width: 520, height: 24 }, x: 260, y: 298 },
		{ id: 'ceiling', shape: { kind: 'box' as const, width: 520, height: 24 }, x: 260, y: -12 },
		{ id: 'left-wall', shape: { kind: 'box' as const, width: 24, height: 310 }, x: -12, y: 143 },
		{ id: 'right-wall', shape: { kind: 'box' as const, width: 24, height: 310 }, x: 532, y: 143 }
	]) {
		world.createBody({
			id: boundary.id,
			type: 'static',
			shape: boundary.shape,
			position: { x: boundary.x, y: boundary.y },
			restitution: 0.92,
			friction: 0.08
		});
	}
	const downward = uniformGravity({ x: 0, y: 245 });
	let dragOrigin = { x: 0, y: 0 };
	let releaseVelocity = { x: 0, y: 0 };
	const directManipulation = defineGesture({
		name: 'orb-direct-manipulation',
		semantics: 'control',
		drag: {
			threshold: 2,
			onStart() {
				dragOrigin = { ...orb.pose.position };
				releaseVelocity = { x: 0, y: 0 };
				orb.setKinematic(true);
			},
			onMove(sample) {
				const scale = Math.max(0.01, stageScale);
				releaseVelocity = {
					x: sample.velocity.x / scale,
					y: sample.velocity.y / scale
				};
				orb.setPose({
					position: {
						x: dragOrigin.x + sample.delta.x / scale,
						y: dragOrigin.y + sample.delta.y / scale
					}
				});
			},
			onEnd() {
				orb.setKinematic(false);
				// Preserve the user's final sampled drag velocity when simulation resumes. Physics accepts
				// impulse (momentum), so scale the desired world velocity by the body's mass.
				orb.applyImpulse({
					x: releaseVelocity.x * orb.mass,
					y: releaseVelocity.y * orb.mass
				});
			},
			onCancel() {
				releaseVelocity = { x: 0, y: 0 };
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
	const resetOrb = () => orb.setPose({ position: initialOrbPosition, angle: 0 });
	this.onMount(({ signal }) => {
		const viewport = this.refs.get(stageViewport);
		if (!viewport || typeof ResizeObserver === 'undefined') return;
		const updateScale = () => {
			stageScale = Math.min(1, viewport.clientWidth / stageSize.width);
			this.state.stageScale = stageScale;
		};
		const observer = new ResizeObserver(updateScale);
		observer.observe(viewport);
		updateScale();
		signal.addEventListener('abort', () => observer.disconnect(), { once: true });
	});

	this.onUnmount(() => world[Symbol.dispose]());
	return () => (
		<section
			theme:surface="raised"
			className="demo-card physics-demo"
			aria-labelledby="physics-title"
		>
			<div className="demo-heading">
				<div>
					<p className="eyebrow">All four together</p>
					<h2 id="physics-title">Direct manipulation meets simulation</h2>
				</div>
				<span className="package-label">motion · gestures · physics · gravity</span>
			</div>
			<p className="demo-description">
				Drag and throw the orb, or move it by keyboard, then release it back to gravity. Motion
				owns presence, gestures own intent and release velocity, physics owns pose and collision,
				and gravity contributes force.
			</p>
			<div className="control-row">
				<button
					theme:action="primary"
					className="primary-button"
					onClick={() => (this.state.shown = !this.state.shown)}
				>
					{this.state.shown ? 'Remove orb' : 'Restore orb'}
				</button>
				<button
					theme:action="secondary"
					className="secondary-button"
					onClick={() => orb.applyImpulse({ x: 92, y: -255 })}
				>
					Launch orb
				</button>
				<button theme:action="secondary" className="secondary-button" onClick={resetOrb}>
					Reset position
				</button>
			</div>
			<div className="physics-layout">
				<div
					className="stage-viewport"
					ref={this.ref(stageViewport)}
					style={{ height: `${stageSize.height * this.state.stageScale}px` }}
				>
					<PhysicsWorld world={world}>
						<section
							className="stage"
							style={{ transform: `scale(${this.state.stageScale})` }}
							aria-label="Bounded plugin simulation stage"
						>
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
					</PhysicsWorld>
				</div>
				<aside className="ownership-list" aria-label="Plugin ownership">
					<div>
						<span>M</span>
						<p>
							<strong>Motion</strong> plays enter and retained leave.
						</p>
					</div>
					<div>
						<span>G</span>
						<p>
							<strong>Gestures</strong> normalize drag and keyboard intent.
						</p>
					</div>
					<div>
						<span>P</span>
						<p>
							<strong>Physics</strong> projects pose and owns bouncy walls.
						</p>
					</div>
					<div>
						<span>↓</span>
						<p>
							<strong>Gravity</strong> contributes a deliberately playful field.
						</p>
					</div>
				</aside>
			</div>
		</section>
	);
}
