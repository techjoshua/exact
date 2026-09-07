import * as nodeModule from 'node:module';

// Install before application imports; retain the async hook fallback for older Node hosts.
if (typeof nodeModule.registerHooks === 'function') {
	const { createExactReactNodeLoader } = await import('./node-loader.js');
	const loader = createExactReactNodeLoader();
	nodeModule.registerHooks({
		load(url, context, nextLoad) {
			const loaded = nextLoad(url, context);
			if (loaded.source == null || (loaded.format !== 'module' && loaded.format !== 'commonjs'))
				return loaded;
			const source =
				typeof loaded.source === 'string' ? loaded.source : new TextDecoder().decode(loaded.source);
			const transformed = loader.transform(source, url);
			return transformed ? { ...loaded, source: transformed.code } : loaded;
		}
	});
} else nodeModule.register('./node-loader.js', import.meta.url);
