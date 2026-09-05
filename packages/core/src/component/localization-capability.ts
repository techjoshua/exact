import type { IntlFacade } from '../localization/contracts.js';
import type { AnyComponentInstance } from './contracts.js';

/** Minimal component ownership needed to resolve an inherited localization policy. */
export type ComponentLocalizationOwner = Pick<AnyComponentInstance, 'hasContext' | 'getContext'>;

/** Capability-local bridge installed only when component localization is reachable. */
export type ComponentLocalizationCapability = Readonly<{
	create(owner: ComponentLocalizationOwner): IntlFacade;
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
