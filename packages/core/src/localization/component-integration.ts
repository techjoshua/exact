import {
	registerComponentLocalizationCapability,
	type ComponentLocalizationCapability
} from '../component/localization-capability.js';
import { createComponentIntlFacade } from './facade.js';

const componentLocalizationCapability: ComponentLocalizationCapability = Object.freeze({
	create: createComponentIntlFacade
});

registerComponentLocalizationCapability(componentLocalizationCapability);
