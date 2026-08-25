import type { CompiledComponentInstanceConstructor } from './instance-construction.js';

/** Rejects attempts to construct a durable instance from a compiler-closed direct SSR artifact. */
export const rejectDirectServerComponentConstruction: CompiledComponentInstanceConstructor = (
	type
) => {
	throw new TypeError(
		`Direct server component ${type.name || '<anonymous>'} must execute through its compiled request-local frame`
	);
};
