import type { ReactComponentType } from '@exact/react-compat';
import { exposeExactComponent } from '@exact/react-compat/interop';
import { ExactQueryClientProvider, type ExactQueryClientProviderProps } from './index.js';

/** React-facing replacement that mounts the native provider boundary. */
export const QueryClientProvider: ReactComponentType<ExactQueryClientProviderProps> =
	exposeExactComponent(ExactQueryClientProvider, 'QueryClientProvider');
