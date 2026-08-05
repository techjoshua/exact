import type {
	PhysicsProjection,
	PhysicsProjectionChannel,
	PhysicsProjectionInput
} from './contracts.js';

const prepared = Symbol('exact.physics.projection');

/** Validates and freezes a reusable DOM projection policy. */
export function definePhysicsProjection(input: PhysicsProjectionInput): PhysicsProjection {
	if (!input.name) throw new TypeError('A physics projection needs a stable name');
	if (typeof input.apply !== 'function') throw new TypeError('A physics projection needs apply()');
	const channels = Object.freeze([...(input.channels ?? [])]);
	for (const channel of channels) {
		if (channel !== 'translate' && channel !== 'rotate') {
			throw new TypeError(`Unsupported physics projection channel "${channel}"`);
		}
	}
	if (new Set<PhysicsProjectionChannel>(channels).size !== channels.length) {
		throw new TypeError('A physics projection cannot claim the same channel twice');
	}
	return Object.freeze({ ...input, channels, [prepared]: true }) as unknown as PhysicsProjection;
}

/** Projects position through the CSS individual `translate` property. */
export const positionOnly = definePhysicsProjection({
	name: 'positionOnly',
	channels: ['translate'],
	apply: ({ body, element }) => {
		styleOf(element).translate = `${body.pose.position.x}px ${body.pose.position.y}px`;
	}
});

/** Projects angle through the CSS individual `rotate` property. */
export const rotationOnly = definePhysicsProjection({
	name: 'rotationOnly',
	channels: ['rotate'],
	apply: ({ body, element }) => {
		styleOf(element).rotate = `${body.pose.angle}rad`;
	}
});

/** Projects position and angle through independent CSS transform channels. */
export const positionAndRotation = definePhysicsProjection({
	name: 'positionAndRotation',
	channels: ['translate', 'rotate'],
	apply: ({ body, element }) => {
		const style = styleOf(element);
		style.translate = `${body.pose.position.x}px ${body.pose.position.y}px`;
		style.rotate = `${body.pose.angle}rad`;
	}
});

/** Leaves the DOM unchanged while preserving reactive body state for other renderers. */
export const stateOnly = definePhysicsProjection({ name: 'stateOnly', apply() {} });

function styleOf(element: HTMLElement | SVGElement): CSSStyleDeclaration {
	return (element as HTMLElement).style;
}
