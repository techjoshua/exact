export { cldr, currency, message, plural, select, unit } from './dist/enhancements.js';
export {
	IntlAttributes as alt,
	IntlAttributes as ariaDescription,
	IntlAttributes as ariaLabel,
	IntlAttributes as ariaRoledescription,
	IntlAttributes as ariaValuetext,
	IntlAttributes as placeholder,
	IntlAttributes as title
} from './dist/components.js' with { type: 'exact-enhancement' };
export { IntlLocale as locale } from './dist/components.js' with { type: 'exact-enhancement' };
export { IntlMessage as default } from './dist/components.js' with { type: 'exact-enhancement' };
