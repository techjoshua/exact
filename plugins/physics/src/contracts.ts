/** A finite vector in world units. */
export interface Vector2 {
	readonly x: number;
	readonly y: number;
}

/** A body's position and clockwise angle in radians. */
export interface PhysicsPose {
	readonly position: Vector2;
	readonly angle: number;
}

/** Collision geometry owned by a physics body. */
export type PhysicsShape =
	| { readonly kind: 'circle'; readonly radius: number }
	| { readonly kind: 'box'; readonly width: number; readonly height: number };

/** Initial body configuration. Distances and velocities use application-defined world units. */
export interface PhysicsBodyDefinition {
	readonly id?: string;
	readonly type?: 'dynamic' | 'static' | 'kinematic';
	readonly position?: Vector2;
	readonly angle?: number;
	readonly velocity?: Vector2;
	readonly angularVelocity?: number;
	readonly shape: PhysicsShape;
	readonly mass?: number;
	readonly inertia?: number;
	readonly restitution?: number;
	readonly friction?: number;
	readonly damping?: number;
	readonly angularDamping?: number;
	readonly sleeping?: boolean;
	readonly groups?: readonly string[];
	readonly collisionLayer?: string;
}

/** Options controlling an explicit pose command. */
export interface SetPoseOptions {
	readonly wake?: boolean;
	readonly preserveVelocity?: boolean;
}

/** Mutable, inspectable state for one world-owned body. */
export interface PhysicsBody extends Disposable {
	readonly id: string;
	readonly type: 'dynamic' | 'static' | 'kinematic';
	readonly pose: PhysicsPose;
	readonly velocity: Vector2;
	readonly angularVelocity: number;
	readonly sleeping: boolean;
	readonly shape: PhysicsShape;
	readonly mass: number;
	readonly restitution: number;
	readonly groups: readonly string[];
	readonly collisionLayer?: string;
	applyForce(force: Vector2, point?: Vector2): void;
	applyImpulse(impulse: Vector2, point?: Vector2): void;
	setPose(pose: Partial<PhysicsPose>, options?: SetPoseOptions): void;
	setKinematic(active: boolean): void;
	wake(): void;
}

/** A deterministic force contribution evaluated once per fixed step. */
export interface ForceContributor {
	readonly name: string;
	readonly order?: number;
	apply(body: PhysicsBody, stepSeconds: number): Vector2 | undefined;
}

/** Supported constraint definitions. */
export interface PhysicsConstraintDefinition {
	readonly id?: string;
	readonly kind: 'distance';
	readonly bodyA: PhysicsBody;
	readonly bodyB?: PhysicsBody;
	readonly anchor?: Vector2;
	readonly length?: number;
	readonly stiffness?: number;
}

/** An owned world constraint. */
export interface PhysicsConstraint extends Disposable {
	readonly id: string;
	readonly kind: 'distance';
	readonly bodyA: PhysicsBody;
	readonly bodyB?: PhysicsBody;
	readonly length: number;
}

/** Stable collision phase. */
export type PhysicsCollisionPhase = 'begin' | 'persist' | 'end';

/** Collision data published after a complete outer step. */
export interface PhysicsCollisionEvent {
	readonly phase: PhysicsCollisionPhase;
	readonly bodyA: PhysicsBody;
	readonly bodyB: PhysicsBody;
	readonly normal: Vector2;
	readonly penetration: number;
	readonly point: Vector2;
	readonly step: number;
}

declare const preparedPhysicsCollisionListener: unique symbol;
declare const preparedPhysicsProjection: unique symbol;

/** Receives a coalesced, deterministically ordered collision batch. */
export type PhysicsCollisionListener = ((events: readonly PhysicsCollisionEvent[]) => void) &
	Readonly<{
		physicsName?: string;
		[preparedPhysicsCollisionListener]?: true;
	}>;

/** DOM channels a prepared body projection may claim. */
export type PhysicsProjectionChannel = 'translate' | 'rotate';

/** Inputs available to a custom body projection. */
export interface PhysicsProjectionContext {
	readonly body: PhysicsBody;
	readonly element: HTMLElement | SVGElement;
}

/** Author input accepted by {@link definePhysicsProjection}. */
export interface PhysicsProjectionInput {
	readonly name: string;
	readonly channels?: readonly PhysicsProjectionChannel[];
	apply(context: PhysicsProjectionContext): void;
}

/** Validated, immutable DOM projection policy. */
export type PhysicsProjection = Readonly<PhysicsProjectionInput> &
	Readonly<{ [preparedPhysicsProjection]: true }>;

/** Fixed-step world policy. */
export interface PhysicsWorldOptions {
	readonly fixedStep?: number;
	readonly maxCatchUpSteps?: number;
	readonly velocityIterations?: number;
	readonly positionIterations?: number;
	readonly sleep?: boolean;
}

/** Result and timing accounting for one explicit outer step. */
export interface PhysicsStepResult {
	readonly steps: number;
	readonly simulatedSeconds: number;
	readonly accumulatedSeconds: number;
	readonly droppedSeconds: number;
	readonly collisions: readonly PhysicsCollisionEvent[];
}

/** Bounded current-world inspection snapshot. */
export interface PhysicsWorldInspection {
	readonly time: number;
	readonly running: boolean;
	readonly step: number;
	readonly accumulatedSeconds: number;
	readonly droppedSeconds: number;
	readonly bodyCount: number;
	readonly awakeCount: number;
	readonly constraintCount: number;
	readonly forceContributors: readonly string[];
	readonly bodies: readonly {
		readonly id: string;
		readonly position: Vector2;
		readonly angle: number;
		readonly velocity: Vector2;
		readonly angularVelocity: number;
		readonly sleeping: boolean;
	}[];
}

/** A deterministic, DOM-independent 2D simulation world. */
export interface PhysicsWorld extends Disposable {
	readonly time: number;
	readonly running: boolean;
	createBody(definition: PhysicsBodyDefinition): PhysicsBody;
	createConstraint(definition: PhysicsConstraintDefinition): PhysicsConstraint;
	addForce(contributor: ForceContributor): Disposable;
	onCollision(listener: PhysicsCollisionListener): Disposable;
	step(elapsedSeconds: number): PhysicsStepResult;
	start(): void;
	pause(): void;
	inspect(): PhysicsWorldInspection;
}

/** Configuration supplied to the ordinary world-owning component. */
export interface PhysicsWorldProps {
	readonly world?: PhysicsWorld;
	readonly options?: PhysicsWorldOptions;
	readonly running?: boolean;
	readonly children?: import('@exactjs/core').Child;
}

/** Canonical props accepted by the enhancement JSX namespace. */
export interface PhysicsElementProps {
	readonly body: PhysicsBody;
	readonly project?: PhysicsProjection;
	readonly disabled?: boolean;
	readonly collisions?: PhysicsCollisionListener;
	readonly children?: import('@exactjs/core').Child;
}

/** Application configuration accepted by the physics plugin. */
export interface PhysicsPluginConfig {
	readonly enabled: boolean;
	readonly fixedStep: number;
	readonly maxCatchUpSteps: number;
}
