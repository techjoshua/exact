import { scope as ThemeScope } from '@exactjs/theme/enhancements';
import { ThemeSpecimen } from './specimen.js';

/** Compiler-issued specimen root composed through the published theme enhancement artifact. */
export const themeSpecimenRoot = (
	<ThemeScope scope tonic="teal" appearance="light" depth="elevated">
		<ThemeSpecimen label="Fixture" />
	</ThemeScope>
);
