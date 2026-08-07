import { batch } from '@exactjs/reactive';
import type {
	ForceContributor,
	PhysicsBody,
	PhysicsBodyDefinition,
	PhysicsCollisionEvent,
	PhysicsCollisionListener,
	PhysicsConstraint,
	PhysicsConstraintDefinition,
	PhysicsStepResult,
	PhysicsWorld,
	PhysicsWorldInspection,
	PhysicsWorldOptions,
	Vector2
} from './contracts.js';
import { add, finiteVector, length, scale, subtract } from './math.js';
import { BodyResource } from './body-resource.js';
import {
	collideBodies,
	inverseMass,
	moveBody,
	physicsContactEvent,
	physicsContactKey,
	resolveContactPosition,
	resolveContactVelocity,
	type PhysicsContact
} from './collision-solver.js';
import { nonnegative, positive, positiveInteger, unit } from './world-validation.js';

const DEFAULT_FIXED_STEP = 1 / 120;
const DEFAULT_MAX_CATCH_UP_STEPS = 8;
const SLEEP_LINEAR_THRESHOLD = 0.01;
const SLEEP_ANGULAR_THRESHOLD = 0.01;
const SLEEP_AFTER_SECONDS = 0.5;

interface DistanceConstraintResource extends PhysicsConstraint {
	readonly anchor?: Vector2;
	readonly stiffness: number;
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
	private activeContacts = new Map<string, PhysicsContact>();
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
			for (const contact of contacts) resolveContactVelocity(contact);
		}
		for (let index = 0; index < this.positionIterations; index++) {
			contacts = this.findContacts();
			for (const contact of contacts) resolveContactPosition(contact);
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
			if (inverseA) moveBody(a, scale(correction, inverseA));
			if (b && inverseB) moveBody(b, scale(correction, -inverseB));
		}
	}

	private findContacts(): PhysicsContact[] {
		const contacts: PhysicsContact[] = [];
		for (let left = 0; left < this.bodies.length; left++) {
			for (let right = left + 1; right < this.bodies.length; right++) {
				const bodyA = this.bodies[left]!;
				const bodyB = this.bodies[right]!;
				if (bodyA.type === 'static' && bodyB.type === 'static') continue;
				const contact = collideBodies(bodyA, bodyB);
				if (contact) contacts.push(contact);
			}
		}
		return contacts;
	}

	private publishContacts(contacts: PhysicsContact[], events: PhysicsCollisionEvent[]): void {
		const current = new Map<string, PhysicsContact>();
		for (const contact of contacts) {
			const key = physicsContactKey(contact.bodyA, contact.bodyB);
			current.set(key, contact);
			events.push(
				physicsContactEvent(
					this.activeContacts.has(key) ? 'persist' : 'begin',
					contact,
					this.stepIndex
				)
			);
		}
		for (const [key, contact] of this.activeContacts) {
			if (!current.has(key)) events.push(physicsContactEvent('end', contact, this.stepIndex));
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
