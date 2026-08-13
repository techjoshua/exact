import type { IntlBuildCoordinator } from '@exactjs/intl-build';
import webpack, { type Compiler as WebpackCompiler } from 'webpack';

/** Installs host-specific readers for shared generated intl companion modules. */
export function installWebpackIntlModules(
	compiler: WebpackCompiler,
	intl: IntlBuildCoordinator
): void {
	if (!compiler.hooks?.compilation?.tap) return;
	compiler.hooks.compilation.tap('ExactWebpackIntl', (compilation, { normalModuleFactory }) => {
		normalModuleFactory.hooks.resolveForScheme
			.for('virtual')
			.tap('ExactWebpackIntl', (resourceData) => {
				if (intl.loadRequest(resourceData.resource)) return true;
			});
		webpack.NormalModule.getCompilationHooks(compilation)
			.readResourceForScheme.for('virtual')
			.tap('ExactWebpackIntl', (resource) => intl.loadRequest(resource)?.code ?? null);
	});
}
