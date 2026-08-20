import type { RenderFunction, RenderResult } from '@exactjs/core';
import type { ExoticComponent, JSXElementConstructor, ReactNode } from 'react';

declare module 'react' {
	/**
	 * eXact compatibility owns this React renderer channel and recognizes these
	 * results only after checking the compiled component contract.
	 */
	interface DO_NOT_USE_OR_YOU_WILL_BE_FIRED_EXPERIMENTAL_REACT_NODES {
		readonly exactComponentResult: RenderFunction | RenderResult;
	}
}

declare global {
	/** Records the one React declaration target selected for native JSX interop. */
	interface ExactReactCompatibilityTypeTargetRegistry {
		react19: 19;
	}

	/** Enables compiler-owned React 19 component types in native eXact JSX. */
	interface ExactJsxInteropElementTypeRegistry {
		react19: keyof ExactReactCompatibilityTypeTargetRegistry extends 'react19'
			? bigint extends ReactNode
				? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- The probe mirrors the permissive generic defaults in @types/react 19.
					JSXElementConstructor<any> | ExoticComponent<any>
				: {
						readonly __exactReactCompatibilityError: 'The React 19 facade requires @types/react 19';
					}
			: {
					readonly __exactReactCompatibilityError: 'Load exactly one eXact React type facade';
				};
	}
}

export {};
