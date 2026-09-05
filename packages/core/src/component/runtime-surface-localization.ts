import type { IntlFacade } from '../localization/contracts.js';
import {
	componentLocalizationCapability,
	type ComponentLocalizationOwner
} from './localization-capability.js';
import type { AnyComponentInstance } from './contracts.js';
import { registerComponentRuntimeSurface } from './runtime-surface-registration.js';

const facades = new WeakMap<ComponentLocalizationOwner, IntlFacade>();

/** Returns the stable localized Intl facade owned by one compiled component frame. */
export function componentIntl(owner: ComponentLocalizationOwner): IntlFacade {
	let facade = facades.get(owner);
	if (facade) return facade;
	const capability = componentLocalizationCapability();
	if (!capability)
		throw new Error(
			'Component localization is unavailable because this artifact did not include the localization capability'
		);
	facade = capability.create(owner);
	facades.set(owner, facade);
	return facade;
}

function intl(this: AnyComponentInstance): IntlFacade {
	return componentIntl(this);
}

registerComponentRuntimeSurface({
	intl: { configurable: true, get: intl }
});
