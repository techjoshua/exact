import { reactive } from '@exactjs/reactive';
import type {
	PhysicsBody,
	PhysicsBodyDefinition,
	PhysicsPose,
	PhysicsShape,
	SetPoseOptions,
	Vector2
} from './contracts.js';
import { add, cross, finiteVector, subtract } from './math.js';
import {
	finite,
	nonnegative,
	positive,
	shapeInertia,
	unit,
	validateShape
} from './world-validation.js';

interface BodyState {
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
	type: 'dynamic' | 'static' | 'kinematic';
	force: Vector2 = { x: 0, y: 0 };
	torque = 0;
	sleepTime = 0;
	disposed = false;

	constructor(
		private readonly world: PhysicsBodyHost,
		definition: PhysicsBodyDefinition,
		id: string
	) {
		this.id = id;
		this.type = definition.type ?? 'dynamic';
		this.shape = validateShape(definition.shape);
		this.mass = this.type === 'dynamic' ? positive(definition.mass ?? 1, 'mass') : Infinity;
		this.inertia =
			this.type === 'dynamic'
				? positive(definition.inertia ?? shapeInertia(this.shape, this.mass), 'inertia')
				: Infinity;
		this.restitution = unit(definition.restitution ?? 0, 'restitution');
		this.friction = unit(definition.friction ?? 0.2, 'friction');
		this.damping = nonnegative(definition.damping ?? 0, 'damping');
		this.angularDamping = nonnegative(definition.angularDamping ?? this.damping, 'angularDamping');
		this.groups = Object.freeze([...(definition.groups ?? [])]);
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
			pose: { position: { ...position }, angle },
			velocity: { ...velocity },
			angularVelocity,
			sleeping: definition.sleeping ?? false
		});
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
			this.force = add(this.force, next);
			if (applicationPoint)
				this.torque += cross(subtract(applicationPoint, this.pose.position), next);
			this.wakeNow();
		});
	}

	/** Applies an instantaneous momentum change, optionally producing angular velocity. */
	applyImpulse(impulse: Vector2, point?: Vector2): void {
		const next = finiteVector(impulse, 'impulse');
		const applicationPoint = point ? finiteVector(point, 'impulse point') : undefined;
		this.world.command(this, () => {
			if (this.type !== 'dynamic') return;
			this.state.velocity.x += next.x / this.mass;
			this.state.velocity.y += next.y / this.mass;
			if (applicationPoint) {
				this.state.angularVelocity +=
					cross(subtract(applicationPoint, this.pose.position), next) / this.inertia;
			}
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
		this.sleepTime = 0;
		this.state.sleeping = false;
	}

	/** Idempotently removes this body from its owning world and rejects future participation. */
	[Symbol.dispose](): void {
		if (this.disposed) return;
		this.disposed = true;
		this.world.removeBody(this);
	}
}
