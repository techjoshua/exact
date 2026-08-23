/**
 * Opt-in component localization integration.
 *
 * Compiled components import the narrower runtime entry automatically when they use `this.intl`.
 * Importing the public localization helpers installs the same integration for compiled library
 * components that share the caller's runtime.
 */
import './localization/component-integration.js';

export { LocalizationContext } from './localization/context.js';
export { intl } from './localization/facade.js';
export type {
	IntlDurationFormatter,
	IntlFacade,
	LocalizationContextValue
} from './localization/contracts.js';
