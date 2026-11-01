import type { resolveTheme } from '../../theme/src/resolver.js';
import type {
	createThemeDeriver,
	deriveTheme,
	deriveDataColors
} from '../../theme/src/derivation.js';
/** Executes the public derivation ownership journey across source, native and browser hosts. */
export function verifyThemeDerivationValues(api: {
	resolveTheme: typeof resolveTheme;
	createThemeDeriver: typeof createThemeDeriver;
	deriveTheme: typeof deriveTheme;
	deriveDataColors: typeof deriveDataColors;
}): true;
import type {
	createThemeScopeDefinition,
	createThemeScopePresentation,
	resolveThemeScope
} from '../../theme/src/system-theme.js';
import type { builtInTemperaments } from '../../theme/src/source-resolution.js';
import type { exactThemeContract } from '../../theme/src/token-contract.js';
import type { serializeThemeOverrides } from '../../theme/src/overrides.js';
/** Executes private cache ownership and captured interval checks through public exports. */
export function verifyThemeCacheOwnership(api: {
	resolveTheme: typeof resolveTheme;
	createThemeScopeDefinition: typeof createThemeScopeDefinition;
	createThemeScopePresentation: typeof createThemeScopePresentation;
	resolveThemeScope: typeof resolveThemeScope;
	builtInTemperaments: typeof builtInTemperaments;
	exactThemeContract: typeof exactThemeContract;
	serializeThemeOverrides: typeof serializeThemeOverrides;
}): true;
/** Executes structured color, typography, inherited temperament, and opaque metadata controls. */
export function verifyThemeSourceCapture(api: {
	resolveTheme: typeof resolveTheme;
	builtInTemperaments: typeof builtInTemperaments;
}): true;
