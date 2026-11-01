import type { ExactLanguageService } from '@exactjs/compiler';
import type { ExactPackageEnhancementImport } from '@exactjs/config';
import type { ExactLanguageExtensionHost } from '@exactjs/language-extension-host';

/** One admitted open lifetime/version, never reconstructed to keep old work current. */
export type DocumentState = Readonly<{ version: number }>;

/** A project owns its sessions and the finite core-input preparation tail during recreation. */
export type WorkspaceState = {
	root: string;
	workspaceRoot?: string;
	service: ExactLanguageService;
	documents: Map<string, DocumentState>;
	languageHost: Promise<ExactLanguageExtensionHost>;
	packageEnhancements: readonly ExactPackageEnhancementImport[];
	providerFailure?: string;
	preparation?: Promise<void>;
};

/** Borrowed current input for a folder event, not a publication authority or stored source cache. */
export type WorkspaceInput = Readonly<{ uri: string; version: number; source: string }>;

/**
 * A failed preparation has no execution authority. Its already-claimed cleanup is retained in the
 * existing project slot so queries cannot silently recreate disk input for known unsaved documents.
 * Only explicit input or folder reconciliation replaces this reservation, never cleanup settlement.
 */
export type UnavailableWorkspace = Readonly<{
	root: string;
	workspaceRoot?: string;
	cleanup: Promise<void>;
}>;

/** Project slot is either a resource-bearing record or a source-unavailable cleanup reservation. */
export type WorkspaceEntry = WorkspaceState | UnavailableWorkspace;
