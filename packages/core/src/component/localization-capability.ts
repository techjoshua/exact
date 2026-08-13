import type { IntlFacade } from '../localization/contracts.js';
import type { ComponentInstance } from './contracts.js';

/** Capability-local bridge installed only when component localization is reachable. */
export type ComponentLocalizationCapability = Readonly<{
	create(instance: ComponentInstance<any>): IntlFacade;
}>;

let localizationCapability: ComponentLocalizationCapability | undefined;

/** Installs component-local Intl facade construction for the current core runtime instance. */
export function registerComponentLocalizationCapability(
	capability: ComponentLocalizationCapability
): void {
	if (localizationCapability && localizationCapability !== capability)
		throw new Error('Conflicting eXact component localization capability integration');
	localizationCapability = capability;
}

/** Returns the localization integration when this artifact includes component Intl support. */
export function componentLocalizationCapability(): ComponentLocalizationCapability | undefined {
	return localizationCapability;
}
