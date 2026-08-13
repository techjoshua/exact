/**
 * Opt-in component localization integration.
 *
 * Compiled components import the narrower runtime entry automatically when they use `this.intl`.
 * Compilerless component definitions can import this entry to install the same capability.
 */
import './localization/component-integration.js';

export { LocalizationContext } from './localization/context.js';
export { intl } from './localization/facade.js';
export type {
	IntlDurationFormatter,
	IntlFacade,
	LocalizationContextValue
} from './localization/contracts.js';
