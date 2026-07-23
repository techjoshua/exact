import type { ReactComponentType } from '@exactjs/react-compat';
import { exposeExactComponent } from '@exactjs/react-compat/interop';
import { ExactQueryClientProvider, type ExactQueryClientProviderProps } from './adapter.js';

/** React-facing replacement that mounts the native provider boundary. */
export const QueryClientProvider: ReactComponentType<ExactQueryClientProviderProps> =
	exposeExactComponent(ExactQueryClientProvider, 'QueryClientProvider');
