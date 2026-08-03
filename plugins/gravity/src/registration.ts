import type { PhysicsBody } from '@exactjs/physics';
import { applyGravity } from './application.js';
import type { BodyGravityConfiguration, GravityApplication } from './contracts.js';
import { defineGravityField, pointAcceleration } from './fields.js';

/** Component-owned atomic registration for a body's field and moving attractor. */
export class BodyGravityRegistration implements Disposable {
	private applications: GravityApplication[] = [];
	private disposed = false;

	/** Replaces all force contributions for one component activation generation. */
	configure(configuration: BodyGravityConfiguration): void {
		if (this.disposed) throw new Error('Body gravity registration has been disposed');
		this.clear();
		if (configuration.disabled) return;
		if (configuration.field) {
			this.applications.push(
				applyGravity(configuration.world, configuration.field, {
					name: `${configuration.field.name}:${configuration.body.id}`,
					bodies: [configuration.body],
					scale: configuration.scale
				})
			);
		}
		if (configuration.attractor) {
			const definition = configuration.attractor;
			const field = defineGravityField(
				definition.name ?? `attractor ${configuration.body.id}`,
				(point) =>
					pointAcceleration(
						configuration.body.pose.position,
						point.position,
						definition.strength,
						definition.softening,
						definition.maxAcceleration
					),
				{ kind: 'moving-point', parameters: { sourceBody: configuration.body.id } }
			);
			this.applications.push(
				applyGravity(configuration.world, field, {
					order: definition.order,
					predicate: (body: PhysicsBody) => body !== configuration.body,
					scale: configuration.scale
				})
			);
		}
	}

	/** Unregisters every contribution exactly once. */
	[Symbol.dispose](): void {
		if (this.disposed) return;
		this.disposed = true;
		this.clear();
	}

	private clear(): void {
		for (const application of this.applications.splice(0)) application[Symbol.dispose]();
	}
}
