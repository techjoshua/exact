import { exact } from '@exactjs/vite-plugin';
import { readFileSync } from 'node:fs';

const catalogs = JSON.parse(
	readFileSync(new URL('./.exact/intl-catalogs.json', import.meta.url), 'utf8')
) as unknown[];

export default {
	base: './',
	plugins: [
		exact({
			applicationRoot: import.meta.dirname,
			internationalization: {
				owner: '@exactjs/sample-intl-testbed',
				sourceLocale: 'en-US',
				locales: ['fr-FR', 'ja-JP', 'ar-EG'],
				catalogs,
				clientCapabilityProviders: {
					temporal: { kind: 'native' }
				}
			}
		})
	]
};
