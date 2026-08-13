import { createContext } from '../keys.js';
import type { LocalizationContextValue } from './contracts.js';

/** Neutral localization policy consumed by the component-bound Intl facade. */
export const LocalizationContext = /* @__PURE__ */ createContext<LocalizationContextValue>(
	'exact.localization',
	{
		global: true,
		reactive: false,
		keep: 'shared'
	}
);
