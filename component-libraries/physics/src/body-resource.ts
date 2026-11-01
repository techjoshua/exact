import { reactive } from '@exactjs/reactive';
import type {
	PhysicsBody,
	PhysicsBodyDefinition,
	PhysicsPose,
	PhysicsShape,
	SetPoseOptions,
	Vector2
} from './contracts.js';
import { cross, finiteVector, subtract, translateFiniteVector } from './math.js';
import {
	finite,
	nonnegative,
	positive,
	shapeInertia,
	unit,
	validateShape
} from './world-validation.js';

interface BodyState {
	type: 'dynamic' | 'static' | 'kinematic';
	forceX: number;
	forceY: number;
	torque: number;
	sleepTime: number;
	pose: { position: { x: number; y: number }; angle: number };
	velocity: { x: number; y: number };
	angularVelocity: number;
	sleeping: boolean;
}

/** Narrow world ownership seam used by an individual body resource. */
export interface PhysicsBodyHost {
	command(body: BodyResource, command: () => void): void;
	removeBody(body: BodyResource): void;
}

/** Mutable body resource owned by exactly one physics world. */
export class BodyResource implements PhysicsBody {
	readonly id: string;
	readonly shape: PhysicsShape;
	readonly mass: number;
	readonly restitution: number;
	readonly friction: number;
	readonly damping: number;
	readonly angularDamping: number;
	readonly inertia: number;
	readonly groups: readonly string[];
	readonly collisionLayer?: string;
	readonly state: BodyState;
	disposed = false;

	constructor(
		private readonly world: PhysicsBodyHost,
		definition: PhysicsBodyDefinition,
		id: string
	) {
		this.id = id;
		const type = definition.type ?? 'dynamic';
		this.shape = validateShape(definition.shape);
		this.mass = type === 'dynamic' ? positive(definition.mass ?? 1, 'mass') : Infinity;
		this.inertia =
			type === 'dynamic'
				? positive(definition.inertia ?? shapeInertia(this.shape, this.mass), 'inertia')
				: Infinity;
		this.restitution = unit(definition.restitution ?? 0, 'restitution');
		this.friction = unit(definition.friction ?? 0.2, 'friction');
		this.damping = nonnegative(definition.damping ?? 0, 'damping');
		this.angularDamping = nonnegative(definition.angularDamping ?? this.damping, 'angularDamping');
		this.groups = [...(definition.groups ?? [])];
		if (this.groups.some((group) => !group))
			throw new TypeError('Physics body groups must be non-empty');
		this.collisionLayer = definition.collisionLayer;
		if (this.collisionLayer !== undefined && !this.collisionLayer) {
			throw new TypeError('Physics body collisionLayer must be non-empty');
		}
		const position = finiteVector(definition.position ?? { x: 0, y: 0 }, 'position');
		const velocity = finiteVector(definition.velocity ?? { x: 0, y: 0 }, 'velocity');
		const angle = finite(definition.angle ?? 0, 'angle');
		const angularVelocity = finite(definition.angularVelocity ?? 0, 'angularVelocity');
		this.state = reactive({
			type,
			forceX: 0,
			forceY: 0,
			torque: 0,
			sleepTime: 0,
			pose: { position, angle },
			velocity,
			angularVelocity,
			sleeping: definition.sleeping ?? false
		});
	}

	/** Observes the mode changed by a queued kinematic command. */
	get type(): BodyState['type'] {
		return this.state.type;
	}
	set type(value: BodyState['type']) {
		this.state.type = value;
	}

	/** Reactive world-space position and angle owned by this body. */
	get pose(): PhysicsPose {
		return this.state.pose;
	}

	/** Reactive linear velocity in world units per second. */
	get velocity(): Vector2 {
		return this.state.velocity;
	}

	/** Reactive angular velocity in radians per second. */
	get angularVelocity(): number {
		return this.state.angularVelocity;
	}

	/** Reports whether integration currently skips this settled body. */
	get sleeping(): boolean {
		return this.state.sleeping;
	}

	/** Queues a force for the next simulation step, optionally at a world-space point. */
	applyForce(force: Vector2, point?: Vector2): void {
		const next = finiteVector(force, 'force');
		const applicationPoint = point ? finiteVector(point, 'force point') : undefined;
		this.world.command(this, () => {
			if (this.type !== 'dynamic') return;
			const forceX = finite(this.state.forceX + next.x, 'Accumulated force x');
			const forceY = finite(this.state.forceY + next.y, 'Accumulated force y');
			const torque = applicationPoint
				? finite(
						this.state.torque + cross(subtract(applicationPoint, this.pose.position), next),
						'Accumulated torque'
					)
				: this.state.torque;
			this.state.forceX = forceX;
			this.state.forceY = forceY;
			if (applicationPoint) this.state.torque = torque;
			this.wakeNow();
		});
	}

	/** Applies an instantaneous momentum change, optionally producing angular velocity. */
	applyImpulse(impulse: Vector2, point?: Vector2): void {
		const next = finiteVector(impulse, 'impulse');
		const applicationPoint = point ? finiteVector(point, 'impulse point') : undefined;
		this.world.command(this, () => {
			if (this.type !== 'dynamic') return;
			const angularVelocity = applicationPoint
				? finite(
						this.state.angularVelocity +
							cross(subtract(applicationPoint, this.pose.position), next) / this.inertia,
						'Impulse angular velocity'
					)
				: this.state.angularVelocity;
			translateFiniteVector(
				this.state.velocity,
				{ x: next.x / this.mass, y: next.y / this.mass },
				'Impulse velocity'
			);
			if (applicationPoint) this.state.angularVelocity = angularVelocity;
			this.wakeNow();
		});
	}

	/** Queues an authored pose change and clears velocity unless preservation is requested. */
	setPose(pose: Partial<PhysicsPose>, options: SetPoseOptions = {}): void {
		const position = pose.position ? finiteVector(pose.position, 'pose.position') : undefined;
		const angle = pose.angle === undefined ? undefined : finite(pose.angle, 'pose.angle');
		this.world.command(this, () => {
			if (position) {
				this.state.pose.position.x = position.x;
				this.state.pose.position.y = position.y;
			}
			if (angle !== undefined) this.state.pose.angle = angle;
			if (!options.preserveVelocity) {
				this.state.velocity.x = 0;
				this.state.velocity.y = 0;
				this.state.angularVelocity = 0;
			}
			if (options.wake ?? true) this.wakeNow();
		});
	}

	/** Switches a non-static body between authored kinematic and simulated dynamic motion. */
	setKinematic(active: boolean): void {
		this.world.command(this, () => {
			if (this.type === 'static') return;
			this.type = active ? 'kinematic' : 'dynamic';
			this.wakeNow();
		});
	}

	/** Queues this body to resume simulation through the owning world's command boundary. */
	wake(): void {
		this.world.command(this, () => this.wakeNow());
	}

	/** Immediately clears sleeping state for solver-internal use. */
	wakeNow(): void {
		this.state.sleepTime = 0;
		this.state.sleeping = false;
	}

	/** Idempotently removes this body from its owning world and rejects future participation. */
	[Symbol.dispose](): void {
		if (this.disposed) return;
		this.disposed = true;
		this.world.removeBody(this);
	}
}
