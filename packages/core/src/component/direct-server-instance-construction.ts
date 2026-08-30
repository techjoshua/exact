import type { CompiledComponentInstanceConstructor } from './instance-construction.js';

/** Rejects attempts to construct a durable instance from a compiler-closed direct SSR artifact. */
export const rejectDirectServerComponentConstruction: CompiledComponentInstanceConstructor =
	function () {
		throw new TypeError(
			`Direct server component ${this.instantiate.name || '<anonymous>'} must execute through its compiled request-local frame`
		);
	};
