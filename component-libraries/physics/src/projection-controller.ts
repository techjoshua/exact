import type {
	PhysicsBody,
	PhysicsCollisionListener,
	PhysicsProjection,
	PhysicsProjectionChannel,
	PhysicsWorld
} from './contracts.js';

/** Current projection attachment for one transparent physics component. */
export interface BodyProjectionConfiguration {
	readonly body: PhysicsBody;
	readonly element?: HTMLElement | SVGElement;
	readonly presented: boolean;
	readonly disabled: boolean;
	readonly projection: PhysicsProjection;
	readonly collisions?: PhysicsCollisionListener;
}

/** Component-owned controller that atomically rebinds body projection and collisions. */
export class BodyProjectionController implements Disposable {
	private configuration?: BodyProjectionConfiguration;
	private collisionSubscription?: Disposable;
	private owned = new Map<PhysicsProjectionChannel, { original: string; written: string }>();
	private disposed = false;

	constructor(
		private readonly world: PhysicsWorld,
		private readonly warn: (message: string, data?: unknown) => void = () => {}
	) {}

	/** Replaces the complete attachment generation and applies its current pose. */
	configure(configuration: BodyProjectionConfiguration): void {
		if (this.disposed) throw new Error('Body projection controller has been disposed');
		const previous = this.configuration;
		const collisionChanged =
			previous?.body !== configuration.body || previous?.collisions !== configuration.collisions;
		if (
			previous?.element !== configuration.element ||
			previous?.projection !== configuration.projection ||
			configuration.disabled ||
			!configuration.presented
		) {
			this.releaseChannels(previous?.element);
		}
		if (collisionChanged) {
			this.collisionSubscription?.[Symbol.dispose]();
			this.collisionSubscription = configuration.collisions
				? this.world.onCollision((events) => {
					const matching = events.filter(
						(event) => event.bodyA === configuration.body || event.bodyB === configuration.body
					);
					if (matching.length) configuration.collisions!(Object.freeze(matching));
				})
				: undefined;
		}
		this.configuration = configuration;
		this.project();
	}

	/** Applies the latest body pose through channels that remain safe to claim. */
	project(): void {
		const configuration = this.configuration;
		if (
			!configuration?.element ||
			!configuration.presented ||
			configuration.disabled
		) {
			return;
		}
		const style = (configuration.element as HTMLElement).style;
		for (const channel of configuration.projection.channels ?? []) {
			const current = style[channel];
			const ownership = this.owned.get(channel);
			if (!ownership) {
				if (current) {
					this.warn('Physics projection did not overwrite an authored style channel', {
						body: configuration.body.id,
						channel,
						projection: configuration.projection.name
					});
					continue;
				}
				this.owned.set(channel, { original: current, written: current });
			} else if (current !== ownership.written) {
				this.owned.delete(channel);
				this.warn('Physics projection released a style channel changed by its author', {
					body: configuration.body.id,
					channel,
					projection: configuration.projection.name
				});
			}
		}
		const activeChannels = new Set(this.owned.keys());
		if (
			(configuration.projection.channels ?? []).some((channel) => !activeChannels.has(channel))
		) {
			return;
		}
		configuration.projection.apply({ body: configuration.body, element: configuration.element });
		for (const channel of activeChannels) {
			const ownership = this.owned.get(channel);
			if (ownership) ownership.written = style[channel];
		}
	}

	/** Detaches collision observation and restores every still-owned visual channel. */
	[Symbol.dispose](): void {
		if (this.disposed) return;
		this.disposed = true;
		this.collisionSubscription?.[Symbol.dispose]();
		this.releaseChannels(this.configuration?.element);
		this.configuration = undefined;
	}

	private releaseChannels(element: HTMLElement | SVGElement | undefined): void {
		if (element) {
			const style = (element as HTMLElement).style;
			for (const [channel, ownership] of this.owned) {
				if (style[channel] === ownership.written) style[channel] = ownership.original;
			}
		}
		this.owned.clear();
	}
}
