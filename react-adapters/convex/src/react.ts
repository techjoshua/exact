import type { ReactComponentType } from '@exact/react-compat';
import { exposeExactComponent, useExactContext } from '@exact/react-compat/interop';
import {
	ConvexClientContext,
	ExactConvexProvider,
	type ConvexClient,
	type ExactConvexProviderProps
} from './adapter.js';

export const ConvexProvider: ReactComponentType<ExactConvexProviderProps> = exposeExactComponent(
	ExactConvexProvider,
	'ConvexProvider'
);
export function useConvex(): ConvexClient {
	return useExactContext(ConvexClientContext);
}
