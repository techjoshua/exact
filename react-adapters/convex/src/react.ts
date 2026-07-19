import type { ReactComponentType } from '@exact/react-compat';
import { exposeExactComponent, useExactContext } from '@exact/react-compat/interop';
import {
	ConvexClientContext,
	ExactConvexProvider,
	type ConvexClient,
	type ExactConvexProviderProps
} from './adapter.js';

/** Provides the canonical convex provider value. */
export const ConvexProvider: ReactComponentType<ExactConvexProviderProps> = exposeExactComponent(
	ExactConvexProvider,
	'ConvexProvider'
);
/** Performs the use convex domain operation. */
export function useConvex(): ConvexClient {
	return useExactContext(ConvexClientContext);
}
