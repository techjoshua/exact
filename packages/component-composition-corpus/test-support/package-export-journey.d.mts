import type * as PackageProvenance from '../../package-provenance/src/index.js';
/** Checks public-export selection and physical containment using an owned installed package. */
export function verifyPackageExportContainment(
	api: Pick<
		typeof PackageProvenance,
		'resolveExactPublicPackageEntry' | 'importExactPublicPackageEntry'
	>,
	root: string
): Promise<void>;
