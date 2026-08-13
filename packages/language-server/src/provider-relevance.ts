import type { ExactPackageEnhancementImport } from '@exactjs/config';
import type { ExactLanguageProjectionV1 } from '@exactjs/language-extension-api';

/** Selects providers opted into a document or its owning package enhancement scope. */
export function relevantLanguageProviderPackages(
	projection: ExactLanguageProjectionV1,
	packageEnhancements: readonly ExactPackageEnhancementImport[]
): string[] {
	return [
		...new Set([
			...projection.imports.flatMap((value) =>
				value.enhancement && value.package ? [value.package.name] : []
			),
			...packageEnhancements.flatMap((value) => {
				const name = packageName(value.moduleSpecifier);
				return name ? [name] : [];
			})
		])
	].sort();
}

/** Returns the installable package portion of one bare module specifier. */
function packageName(specifier: string): string | undefined {
	if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:'))
		return undefined;
	const parts = specifier.split('/');
	return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}
