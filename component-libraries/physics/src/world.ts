import { batch, reactive } from '@exactjs/reactive';
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
import { finiteVector, length, scale, subtract } from './math.js';
import { BodyResource } from './body-resource.js';
import { integrateBody, updateBodySleep } from './body-integration.js';
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
import { finite, nonnegative, positive, positiveInteger, unit } from './world-validation.js';

const DEFAULT_FIXED_STEP = 1 / 120;
const DEFAULT_MAX_CATCH_UP_STEPS = 8;

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
	private forces: { contributor: ForceContributor; sequence: number; active: boolean }[] = [];
	private listeners = new Set<{ callback: PhysicsCollisionListener }>();
	// Queue ownership, contacts, and time must roll back with reactive body integration.
	private readonly state = reactive(
		{
			commands: [] as { body: BodyResource; run: () => void }[],
			activeContacts: new Map<string, PhysicsContact>(),
			accumulator: 0,
			dropped: 0,
			stepIndex: 0,
			time: 0
		},
		{ passthroughKeys: ['activeContacts'] }
	);
	private bodySequence = 0;
	private constraintSequence = 0;
	private forceSequence = 0;
	private stepping = false;
	private disposed = false;
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
		return this.state.time;
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
		const entry = { contributor, sequence: ++this.forceSequence, active: true };
		this.forces = [...this.forces, entry].sort(
			(a, b) => (a.contributor.order ?? 0) - (b.contributor.order ?? 0) || a.sequence - b.sequence
		);
		return disposable(() => {
			entry.active = false;
			this.forces = this.forces.filter((candidate) => candidate !== entry);
		});
	}

	onCollision(listener: PhysicsCollisionListener): Disposable {
		this.assertAvailable();
		const entry = { callback: listener };
		this.listeners.add(entry);
		return disposable(() => this.listeners.delete(entry));
	}

	step(elapsedSeconds: number): PhysicsStepResult {
		this.assertAvailable();
		const elapsed = nonnegative(elapsedSeconds, 'elapsedSeconds');
		if (this.stepping) throw new Error('A physics world cannot be stepped recursively');
		const pending = finite(this.state.accumulator + elapsed, 'Accumulated elapsed time');
		this.stepping = true;
		this.state.accumulator = pending;
		const events: PhysicsCollisionEvent[] = [];
		let steps = 0;
		try {
			batch(() => {
				const available = pending / this.fixedStep;
				// Scale rounding tolerance in ticks. An absolute time epsilon invents small empty ticks.
				const selected = Math.min(
					this.maxCatchUpSteps,
					Math.floor(available + Number.EPSILON * Math.max(1, available))
				);
				while (steps < selected) {
					if (!this.fixedStepOnce(events)) break;
					steps++;
					this.state.accumulator = Math.max(0, pending - steps * this.fixedStep);
				}
				if (!this.disposed && this.state.accumulator >= this.fixedStep) {
					const retained = this.state.accumulator % this.fixedStep;
					this.state.dropped = finite(
						this.state.dropped + (this.state.accumulator - retained),
						'Dropped elapsed time'
					);
					this.state.accumulator = retained;
				}
			});
		} finally {
			this.stepping = false;
		}
		const stableEvents = events.slice();
		if (stableEvents.length)
			for (const entry of [...this.listeners]) {
				if (this.disposed) break;
				if (this.listeners.has(entry)) entry.callback(stableEvents);
			}
		return {
			steps,
			simulatedSeconds: steps * this.fixedStep,
			accumulatedSeconds: this.state.accumulator,
			droppedSeconds: this.state.dropped,
			collisions: stableEvents
		};
	}

	start(): void {
		this.assertAvailable();
		this._running = true;
	}

	pause(): void {
		this._running = false;
	}

	inspect(): PhysicsWorldInspection {
		return {
			time: this.time,
			running: this.running,
			step: this.state.stepIndex,
			accumulatedSeconds: this.state.accumulator,
			droppedSeconds: this.state.dropped,
			bodyCount: this.bodies.length,
			awakeCount: this.bodies.filter((body) => !body.sleeping && body.type === 'dynamic').length,
			constraintCount: this.constraints.length,
			forceContributors: this.forces.map(({ contributor }) => contributor.name),
			bodies: this.bodies.slice(0, 100).map((body) => ({
				id: body.id,
				position: { ...body.pose.position },
				angle: body.pose.angle,
				velocity: { ...body.velocity },
				angularVelocity: body.angularVelocity,
				sleeping: body.sleeping
			}))
		};
	}

	command(body: BodyResource, command: () => void): void {
		this.requireBody(body);
		this.state.commands.push({ body, run: command });
	}

	removeBody(body: BodyResource): void {
		for (let index = this.state.commands.length - 1; index >= 0; index--)
			if (this.state.commands[index]!.body === body) this.state.commands.splice(index, 1);
		this.bodies = this.bodies.filter((candidate) => candidate !== body);
		this.constraints = this.constraints.filter(
			(constraint) => constraint.bodyA !== body && constraint.bodyB !== body
		);
		for (const [key, contact] of this.state.activeContacts) {
			if (contact.bodyA === body || contact.bodyB === body) this.state.activeContacts.delete(key);
		}
	}

	[Symbol.dispose](): void {
		if (this.disposed) return;
		this.disposed = true;
		this._running = false;
		this.state.commands = [];
		this.listeners.clear();
		for (const entry of this.forces) entry.active = false;
		this.forces = [];
		this.constraints = [];
		for (const body of this.bodies) body.disposed = true;
		this.bodies = [];
		this.state.activeContacts.clear();
	}

	private fixedStepOnce(events: PhysicsCollisionEvent[]): boolean {
		const queue = this.state.commands;
		if (queue.length) {
			for (const command of queue.splice(0)) {
				if (!command.body.disposed) command.run();
			}
		}
		if (this.disposed) return false;
		const selectedForces = this.forces;

		for (const body of this.bodies) {
			if (body.disposed || body.type !== 'dynamic' || body.sleeping) continue;
			const queuedForceX = body.state.forceX;
			const queuedForceY = body.state.forceY;
			const queuedTorque = body.state.torque;
			let forceX = queuedForceX;
			let forceY = queuedForceY;
			for (const entry of selectedForces) {
				if (!entry.active) continue;
				const { contributor } = entry;
				const force = contributor.apply(body, this.fixedStep);
				if (this.disposed) return false;
				if (body.disposed) break;
				if (!entry.active) continue;
				if (force) {
					const x = force.x;
					if (this.disposed) return false;
					if (body.disposed) break;
					if (!entry.active) continue;
					if (!Number.isFinite(x))
						throw new TypeError(`force "${contributor.name}" must contain finite coordinates`);
					const y = force.y;
					if (this.disposed) return false;
					if (body.disposed) break;
					if (!entry.active) continue;
					if (!Number.isFinite(y))
						throw new TypeError(`force "${contributor.name}" must contain finite coordinates`);
					forceX += x;
					forceY += y;
				}
			}
			if (body.disposed) continue;
			integrateBody(body, this.fixedStep, forceX, forceY, queuedTorque);
			if (queuedForceX !== 0) body.state.forceX = 0;
			if (queuedForceY !== 0) body.state.forceY = 0;
			if (queuedTorque !== 0) body.state.torque = 0;
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
		this.state.stepIndex++;
		this.state.time = finite(this.state.time + this.fixedStep, 'Simulation time');
		this.publishContacts(contacts, events);
		return true;
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
			const bodyA = this.bodies[left]!;
			const staticA = bodyA.type === 'static';
			for (let right = left + 1; right < this.bodies.length; right++) {
				const bodyB = this.bodies[right]!;
				if (staticA && bodyB.type === 'static') continue;
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
					this.state.activeContacts.has(key) ? 'persist' : 'begin',
					contact,
					this.state.stepIndex
				)
			);
		}
		for (const [key, contact] of this.state.activeContacts) {
			if (!current.has(key)) events.push(physicsContactEvent('end', contact, this.state.stepIndex));
		}
		this.state.activeContacts = current;
	}

	private updateSleep(): void {
		if (!this.sleepEnabled) return;
		for (const body of this.bodies) updateBodySleep(body, this.fixedStep);
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
