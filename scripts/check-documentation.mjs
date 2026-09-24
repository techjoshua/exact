import { checkDocumentation } from './documentation-policy.mjs';
const base =
	process.argv
		.slice(2)
		.find((argument) => argument.startsWith('--base='))
		?.slice(7) ?? 'HEAD';
await checkDocumentation(process.cwd(), { base });
console.log('documentation policy ok');
await (await import('../apps/docs/scripts/check-navigation.mjs')).checkDocNavigation();
console.log('documentation navigation ok');
