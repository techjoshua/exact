import { batch, reactive } from '@exactjs/reactive';
import type {
	ForceContributor,
	PhysicsBody,
	PhysicsBodyDefinition,
	PhysicsCollisionEvent,
	PhysicsCollisionListener,
	PhysicsConstraint,
	PhysicsConstraintDefinition,
	PhysicsPose,
	PhysicsShape,
	PhysicsStepResult,
	PhysicsWorld,
	PhysicsWorldInspection,
	PhysicsWorldOptions,
	SetPoseOptions,
	Vector2
} from './contracts.js';
import { add, cross, dot, finiteVector, length, normalize, scale, subtract } from './math.js';

const DEFAULT_FIXED_STEP = 1 / 120;
const DEFAULT_MAX_CATCH_UP_STEPS = 8;
const SLEEP_LINEAR_THRESHOLD = 0.01;
const SLEEP_ANGULAR_THRESHOLD = 0.01;
const SLEEP_AFTER_SECONDS = 0.5;

interface BodyState {
	pose: { position: { x: number; y: number }; angle: number };
	velocity: { x: number; y: number };
	angularVelocity: number;
	sleeping: boolean;
}

interface Contact {
	bodyA: BodyResource;
	bodyB: BodyResource;
	normal: Vector2;
	penetration: number;
	point: Vector2;
}

interface DistanceConstraintResource extends PhysicsConstraint {
	readonly anchor?: Vector2;
	readonly stiffness: number;
}

class BodyResource implements PhysicsBody {
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
		private readonly world: WorldResource,
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

	get pose(): PhysicsPose {
		return this.state.pose;
	}

	get velocity(): Vector2 {
		return this.state.velocity;
	}

	get angularVelocity(): number {
		return this.state.angularVelocity;
	}

	get sleeping(): boolean {
		return this.state.sleeping;
	}

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

	setKinematic(active: boolean): void {
		this.world.command(this, () => {
			if (this.type === 'static') return;
			this.type = active ? 'kinematic' : 'dynamic';
			this.wakeNow();
		});
	}

	wake(): void {
		this.world.command(this, () => this.wakeNow());
	}

	wakeNow(): void {
		this.sleepTime = 0;
		this.state.sleeping = false;
	}

	[Symbol.dispose](): void {
		if (this.disposed) return;
		this.disposed = true;
		this.world.removeBody(this);
	}
}

class WorldResource implements PhysicsWorld {
	readonly fixedStep: number;
	readonly maxCatchUpSteps: number;
	readonly velocityIterations: number;
	readonly positionIterations: number;
	readonly sleepEnabled: boolean;
	private bodies: BodyResource[] = [];
	private constraints: DistanceConstraintResource[] = [];
	private forces: { contributor: ForceContributor; sequence: number }[] = [];
	private listeners = new Set<PhysicsCollisionListener>();
	private commands: { body: BodyResource; run: () => void }[] = [];
	private activeContacts = new Map<string, Contact>();
	private accumulator = 0;
	private dropped = 0;
	private stepIndex = 0;
	private bodySequence = 0;
	private constraintSequence = 0;
	private forceSequence = 0;
	private stepping = false;
	private disposed = false;
	private _time = 0;
	private _running = false;

	constructor(options: PhysicsWorldOptions) {
		this.fixedStep = positive(options.fixedStep ?? DEFAULT_FIXED_STEP, 'fixedStep');
		this.maxCatchUpSteps = positiveInteger(
			options.maxCatchUpSteps ?? DEFAULT_MAX_CATCH_UP_STEPS,
			'maxCatchUpSteps'
		);
		this.velocityIterations = positiveInteger(
			options.velocityIterations ?? 4,
			'velocityIterations'
		);
		this.positionIterations = positiveInteger(
			options.positionIterations ?? 3,
			'positionIterations'
		);
		this.sleepEnabled = options.sleep ?? true;
	}

	get time(): number {
		return this._time;
	}

	get running(): boolean {
		return this._running;
	}

	createBody(definition: PhysicsBodyDefinition): PhysicsBody {
		this.assertAvailable();
		const id = definition.id ?? `body-${++this.bodySequence}`;
		if (this.bodies.some((body) => body.id === id))
			throw new Error(`Duplicate physics body id "${id}"`);
		const body = new BodyResource(this, definition, id);
		this.bodies.push(body);
		return body;
	}

	createConstraint(definition: PhysicsConstraintDefinition): PhysicsConstraint {
		this.assertAvailable();
		const bodyA = this.requireBody(definition.bodyA);
		const bodyB = definition.bodyB ? this.requireBody(definition.bodyB) : undefined;
		if (!bodyB && !definition.anchor)
			throw new TypeError('A distance constraint needs bodyB or anchor');
		const anchor = definition.anchor
			? finiteVector(definition.anchor, 'constraint anchor')
			: undefined;
		const target = bodyB?.pose.position ?? anchor!;
		const lengthValue = nonnegative(
			definition.length ?? length(subtract(target, bodyA.pose.position)),
			'constraint length'
		);
		const constraint: DistanceConstraintResource = {
			id: definition.id ?? `constraint-${++this.constraintSequence}`,
			kind: 'distance',
			bodyA,
			bodyB,
			anchor,
			length: lengthValue,
			stiffness: unit(definition.stiffness ?? 1, 'constraint stiffness'),
			[Symbol.dispose]: () => {
				this.constraints = this.constraints.filter((candidate) => candidate !== constraint);
			}
		};
		if (this.constraints.some((candidate) => candidate.id === constraint.id)) {
			throw new Error(`Duplicate physics constraint id "${constraint.id}"`);
		}
		this.constraints.push(constraint);
		return constraint;
	}

	addForce(contributor: ForceContributor): Disposable {
		this.assertAvailable();
		if (!contributor.name) throw new TypeError('A force contributor needs a stable name');
		const entry = { contributor, sequence: ++this.forceSequence };
		this.forces.push(entry);
		this.forces.sort(
			(a, b) => (a.contributor.order ?? 0) - (b.contributor.order ?? 0) || a.sequence - b.sequence
		);
		return disposable(() => {
			this.forces = this.forces.filter((candidate) => candidate !== entry);
		});
	}

	onCollision(listener: PhysicsCollisionListener): Disposable {
		this.assertAvailable();
		this.listeners.add(listener);
		return disposable(() => this.listeners.delete(listener));
	}

	step(elapsedSeconds: number): PhysicsStepResult {
		this.assertAvailable();
		const elapsed = nonnegative(elapsedSeconds, 'elapsedSeconds');
		if (this.stepping) throw new Error('A physics world cannot be stepped recursively');
		this.stepping = true;
		this.accumulator += elapsed;
		const events: PhysicsCollisionEvent[] = [];
		let steps = 0;
		try {
			batch(() => {
				while (
					this.accumulator + Number.EPSILON >= this.fixedStep &&
					steps < this.maxCatchUpSteps
				) {
					this.fixedStepOnce(events);
					this.accumulator -= this.fixedStep;
					steps++;
				}
				if (this.accumulator >= this.fixedStep) {
					const retained = this.accumulator % this.fixedStep;
					this.dropped += this.accumulator - retained;
					this.accumulator = retained;
				}
			});
		} finally {
			this.stepping = false;
		}
		const stableEvents = Object.freeze(events.slice());
		if (stableEvents.length) for (const listener of [...this.listeners]) listener(stableEvents);
		return Object.freeze({
			steps,
			simulatedSeconds: steps * this.fixedStep,
			accumulatedSeconds: this.accumulator,
			droppedSeconds: this.dropped,
			collisions: stableEvents
		});
	}

	start(): void {
		this.assertAvailable();
		this._running = true;
	}

	pause(): void {
		this._running = false;
	}

	inspect(): PhysicsWorldInspection {
		return Object.freeze({
			time: this.time,
			running: this.running,
			step: this.stepIndex,
			accumulatedSeconds: this.accumulator,
			droppedSeconds: this.dropped,
			bodyCount: this.bodies.length,
			awakeCount: this.bodies.filter((body) => !body.sleeping && body.type === 'dynamic').length,
			constraintCount: this.constraints.length,
			forceContributors: Object.freeze(this.forces.map(({ contributor }) => contributor.name)),
			bodies: Object.freeze(
				this.bodies.slice(0, 100).map((body) =>
					Object.freeze({
						id: body.id,
						position: Object.freeze({ ...body.pose.position }),
						angle: body.pose.angle,
						velocity: Object.freeze({ ...body.velocity }),
						angularVelocity: body.angularVelocity,
						sleeping: body.sleeping
					})
				)
			)
		});
	}

	command(body: BodyResource, command: () => void): void {
		this.requireBody(body);
		this.commands.push({ body, run: command });
	}

	removeBody(body: BodyResource): void {
		this.commands = this.commands.filter((command) => command.body !== body);
		this.bodies = this.bodies.filter((candidate) => candidate !== body);
		this.constraints = this.constraints.filter(
			(constraint) => constraint.bodyA !== body && constraint.bodyB !== body
		);
		for (const [key, contact] of this.activeContacts) {
			if (contact.bodyA === body || contact.bodyB === body) this.activeContacts.delete(key);
		}
	}

	[Symbol.dispose](): void {
		if (this.disposed) return;
		this.disposed = true;
		this._running = false;
		this.commands = [];
		this.listeners.clear();
		this.forces = [];
		this.constraints = [];
		for (const body of this.bodies) body.disposed = true;
		this.bodies = [];
		this.activeContacts.clear();
	}

	private fixedStepOnce(events: PhysicsCollisionEvent[]): void {
		const commands = this.commands;
		this.commands = [];
		for (const command of commands) {
			if (!command.body.disposed) command.run();
		}

		for (const body of this.bodies) {
			if (body.type !== 'dynamic' || body.sleeping) continue;
			for (const { contributor } of this.forces) {
				const force = contributor.apply(body, this.fixedStep);
				if (force) body.force = add(body.force, finiteVector(force, `force "${contributor.name}"`));
			}
			body.state.velocity.x += (body.force.x / body.mass) * this.fixedStep;
			body.state.velocity.y += (body.force.y / body.mass) * this.fixedStep;
			body.state.angularVelocity += (body.torque / body.inertia) * this.fixedStep;
			const linearDecay = Math.exp(-body.damping * this.fixedStep);
			const angularDecay = Math.exp(-body.angularDamping * this.fixedStep);
			body.state.velocity.x *= linearDecay;
			body.state.velocity.y *= linearDecay;
			body.state.angularVelocity *= angularDecay;
			body.state.pose.position.x += body.velocity.x * this.fixedStep;
			body.state.pose.position.y += body.velocity.y * this.fixedStep;
			body.state.pose.angle += body.angularVelocity * this.fixedStep;
			body.force = { x: 0, y: 0 };
			body.torque = 0;
		}

		for (let index = 0; index < this.positionIterations; index++) this.solveConstraints();
		let contacts = this.findContacts();
		for (let index = 0; index < this.velocityIterations; index++) {
			for (const contact of contacts) resolveVelocity(contact);
		}
		for (let index = 0; index < this.positionIterations; index++) {
			contacts = this.findContacts();
			for (const contact of contacts) resolvePosition(contact);
		}
		this.updateSleep();
		this.stepIndex++;
		this._time += this.fixedStep;
		this.publishContacts(contacts, events);
	}

	private solveConstraints(): void {
		for (const constraint of this.constraints) {
			const a = constraint.bodyA as BodyResource;
			const b = constraint.bodyB as BodyResource | undefined;
			const target = b?.pose.position ?? constraint.anchor!;
			const delta = subtract(target, a.pose.position);
			const distance = length(delta);
			if (distance < 1e-12) continue;
			const error = distance - constraint.length;
			const normal = scale(delta, 1 / distance);
			const inverseA = inverseMass(a);
			const inverseB = b ? inverseMass(b) : 0;
			const total = inverseA + inverseB;
			if (total === 0) continue;
			const correction = scale(normal, (error * constraint.stiffness) / total);
			if (inverseA) move(a, scale(correction, inverseA));
			if (b && inverseB) move(b, scale(correction, -inverseB));
		}
	}

	private findContacts(): Contact[] {
		const contacts: Contact[] = [];
		for (let left = 0; left < this.bodies.length; left++) {
			for (let right = left + 1; right < this.bodies.length; right++) {
				const bodyA = this.bodies[left]!;
				const bodyB = this.bodies[right]!;
				if (bodyA.type === 'static' && bodyB.type === 'static') continue;
				const contact = collide(bodyA, bodyB);
				if (contact) contacts.push(contact);
			}
		}
		return contacts;
	}

	private publishContacts(contacts: Contact[], events: PhysicsCollisionEvent[]): void {
		const current = new Map<string, Contact>();
		for (const contact of contacts) {
			const key = contactKey(contact.bodyA, contact.bodyB);
			current.set(key, contact);
			events.push(
				toEvent(this.activeContacts.has(key) ? 'persist' : 'begin', contact, this.stepIndex)
			);
		}
		for (const [key, contact] of this.activeContacts) {
			if (!current.has(key)) events.push(toEvent('end', contact, this.stepIndex));
		}
		this.activeContacts = current;
	}

	private updateSleep(): void {
		for (const body of this.bodies) {
			if (body.type !== 'dynamic' || !this.sleepEnabled) continue;
			if (
				length(body.velocity) <= SLEEP_LINEAR_THRESHOLD &&
				Math.abs(body.angularVelocity) <= SLEEP_ANGULAR_THRESHOLD
			) {
				body.sleepTime += this.fixedStep;
				if (body.sleepTime >= SLEEP_AFTER_SECONDS) {
					body.state.velocity.x = 0;
					body.state.velocity.y = 0;
					body.state.angularVelocity = 0;
					body.state.sleeping = true;
				}
			} else {
				body.sleepTime = 0;
				body.state.sleeping = false;
			}
		}
	}

	private requireBody(body: PhysicsBody): BodyResource {
		if (!(body instanceof BodyResource) || !this.bodies.includes(body) || body.disposed) {
			throw new Error('Physics body does not belong to this world');
		}
		return body;
	}

	private assertAvailable(): void {
		if (this.disposed) throw new Error('Physics world has been disposed');
	}
}

/** Creates a deterministic, DOM-independent 2D physics world. */
export function createPhysicsWorld(options: PhysicsWorldOptions = {}): PhysicsWorld {
	return new WorldResource(options);
}

function collide(bodyA: BodyResource, bodyB: BodyResource): Contact | undefined {
	if (bodyA.shape.kind === 'circle' && bodyB.shape.kind === 'circle') {
		return circleCircle(bodyA, bodyB);
	}
	if (bodyA.shape.kind === 'box' && bodyB.shape.kind === 'box') return boxBox(bodyA, bodyB);
	if (bodyA.shape.kind === 'circle') return circleBox(bodyA, bodyB);
	const reversed = circleBox(bodyB, bodyA);
	return reversed ? { ...reversed, bodyA, bodyB, normal: scale(reversed.normal, -1) } : undefined;
}

function circleCircle(bodyA: BodyResource, bodyB: BodyResource): Contact | undefined {
	if (bodyA.shape.kind !== 'circle' || bodyB.shape.kind !== 'circle') return undefined;
	const delta = subtract(bodyB.pose.position, bodyA.pose.position);
	const distance = length(delta);
	const radius = bodyA.shape.radius + bodyB.shape.radius;
	if (distance >= radius) return undefined;
	const normal = normalize(delta);
	return {
		bodyA,
		bodyB,
		normal,
		penetration: radius - distance,
		point: add(bodyA.pose.position, scale(normal, bodyA.shape.radius))
	};
}

function boxBox(bodyA: BodyResource, bodyB: BodyResource): Contact | undefined {
	if (bodyA.shape.kind !== 'box' || bodyB.shape.kind !== 'box') return undefined;
	const delta = subtract(bodyB.pose.position, bodyA.pose.position);
	const overlapX = (bodyA.shape.width + bodyB.shape.width) / 2 - Math.abs(delta.x);
	const overlapY = (bodyA.shape.height + bodyB.shape.height) / 2 - Math.abs(delta.y);
	if (overlapX <= 0 || overlapY <= 0) return undefined;
	const alongX = overlapX < overlapY;
	const normal = alongX ? { x: delta.x < 0 ? -1 : 1, y: 0 } : { x: 0, y: delta.y < 0 ? -1 : 1 };
	return {
		bodyA,
		bodyB,
		normal,
		penetration: alongX ? overlapX : overlapY,
		point: scale(add(bodyA.pose.position, bodyB.pose.position), 0.5)
	};
}

function circleBox(circle: BodyResource, box: BodyResource): Contact | undefined {
	if (circle.shape.kind !== 'circle' || box.shape.kind !== 'box') return undefined;
	const halfWidth = box.shape.width / 2;
	const halfHeight = box.shape.height / 2;
	const relative = subtract(circle.pose.position, box.pose.position);
	const closest = {
		x: Math.max(-halfWidth, Math.min(halfWidth, relative.x)),
		y: Math.max(-halfHeight, Math.min(halfHeight, relative.y))
	};
	const point = add(box.pose.position, closest);
	const fromCircle = subtract(point, circle.pose.position);
	const distance = length(fromCircle);
	if (distance >= circle.shape.radius) return undefined;
	let normal = normalize(fromCircle, { x: 1, y: 0 });
	let penetration = circle.shape.radius - distance;
	if (distance < 1e-12) {
		const gapX = halfWidth - Math.abs(relative.x);
		const gapY = halfHeight - Math.abs(relative.y);
		normal =
			gapX < gapY ? { x: relative.x < 0 ? 1 : -1, y: 0 } : { x: 0, y: relative.y < 0 ? 1 : -1 };
		penetration = circle.shape.radius + Math.min(gapX, gapY);
	}
	return { bodyA: circle, bodyB: box, normal, penetration, point };
}

function resolveVelocity(contact: Contact): void {
	const inverseA = inverseMass(contact.bodyA);
	const inverseB = inverseMass(contact.bodyB);
	const total = inverseA + inverseB;
	if (total === 0) return;
	const relative = subtract(contact.bodyB.velocity, contact.bodyA.velocity);
	const normalVelocity = dot(relative, contact.normal);
	if (normalVelocity >= 0) return;
	const restitution = Math.min(contact.bodyA.restitution, contact.bodyB.restitution);
	const impulseMagnitude = (-(1 + restitution) * normalVelocity) / total;
	const impulse = scale(contact.normal, impulseMagnitude);
	if (inverseA) velocity(contact.bodyA, scale(impulse, -inverseA));
	if (inverseB) velocity(contact.bodyB, scale(impulse, inverseB));
	contact.bodyA.wakeNow();
	contact.bodyB.wakeNow();
}

function resolvePosition(contact: Contact): void {
	const inverseA = inverseMass(contact.bodyA);
	const inverseB = inverseMass(contact.bodyB);
	const total = inverseA + inverseB;
	if (total === 0) return;
	const correction = scale(contact.normal, Math.max(contact.penetration - 1e-5, 0) / total);
	if (inverseA) move(contact.bodyA, scale(correction, -inverseA));
	if (inverseB) move(contact.bodyB, scale(correction, inverseB));
}

function inverseMass(body: BodyResource): number {
	return body.type === 'dynamic' ? 1 / body.mass : 0;
}

function move(body: BodyResource, delta: Vector2): void {
	body.state.pose.position.x += delta.x;
	body.state.pose.position.y += delta.y;
}

function velocity(body: BodyResource, delta: Vector2): void {
	body.state.velocity.x += delta.x;
	body.state.velocity.y += delta.y;
}

function toEvent(
	phase: 'begin' | 'persist' | 'end',
	contact: Contact,
	step: number
): PhysicsCollisionEvent {
	return Object.freeze({
		phase,
		bodyA: contact.bodyA,
		bodyB: contact.bodyB,
		normal: Object.freeze({ ...contact.normal }),
		penetration: contact.penetration,
		point: Object.freeze({ ...contact.point }),
		step
	});
}

function contactKey(a: BodyResource, b: BodyResource): string {
	return `${a.id}\u0000${b.id}`;
}

function validateShape(shape: PhysicsShape): PhysicsShape {
	if (shape.kind === 'circle')
		return Object.freeze({ kind: 'circle', radius: positive(shape.radius, 'radius') });
	return Object.freeze({
		kind: 'box',
		width: positive(shape.width, 'width'),
		height: positive(shape.height, 'height')
	});
}

function shapeInertia(shape: PhysicsShape, mass: number): number {
	return shape.kind === 'circle'
		? (mass * shape.radius * shape.radius) / 2
		: (mass * (shape.width * shape.width + shape.height * shape.height)) / 12;
}

function finite(value: number, name: string): number {
	if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
	return value;
}

function nonnegative(value: number, name: string): number {
	finite(value, name);
	if (value < 0) throw new RangeError(`${name} must be non-negative`);
	return value;
}

function positive(value: number, name: string): number {
	finite(value, name);
	if (value <= 0) throw new RangeError(`${name} must be positive`);
	return value;
}

function unit(value: number, name: string): number {
	finite(value, name);
	if (value < 0 || value > 1) throw new RangeError(`${name} must be between 0 and 1`);
	return value;
}

function positiveInteger(value: number, name: string): number {
	if (!Number.isInteger(value) || value <= 0)
		throw new RangeError(`${name} must be a positive integer`);
	return value;
}

function disposable(dispose: () => void): Disposable {
	let disposed = false;
	return {
		[Symbol.dispose]() {
			if (disposed) return;
			disposed = true;
			dispose();
		}
	};
}
