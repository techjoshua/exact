import type { IntlFacade } from '../localization/contracts.js';
import { componentLocalizationCapability } from './localization-capability.js';
import type { AnyComponentInstance } from './contracts.js';
import { registerComponentRuntimeSurface } from './runtime-surface-registration.js';

const facades = new WeakMap<AnyComponentInstance, IntlFacade>();

function intl(this: AnyComponentInstance): IntlFacade {
	let facade = facades.get(this);
	if (facade) return facade;
	const capability = componentLocalizationCapability();
	if (!capability)
		throw new Error(
			'Component localization is unavailable because this artifact did not include the localization capability'
		);
	facade = capability.create(this);
	facades.set(this, facade);
	return facade;
}

registerComponentRuntimeSurface({
	intl: { configurable: true, get: intl }
});
