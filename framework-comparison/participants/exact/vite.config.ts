import { exact } from '@exactjs/vite-plugin';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/** Builds and serves only the independently authored eXact participant. */
export default {
	root: fileURLToPath(new URL('.', import.meta.url)),
	plugins: [exact({ renderMode: 'hydrate' }), rejectUnusedReactCompatibility()],
	server: { host: '127.0.0.1' },
	preview: { host: '127.0.0.1' },
	build: { outDir: 'dist', emptyOutDir: true }
};

/** Fails the production fixture if native ownership accidentally retains React compatibility. */
function rejectUnusedReactCompatibility(): Plugin {
	return {
		name: 'exact-comparison-native-ownership',
		generateBundle(_options, bundle) {
			const modules = Object.values(bundle).flatMap((output) =>
				output.type === 'chunk' ? Object.keys(output.modules) : []
			);
			const retained = modules.find(
				(id) =>
					/[\\/]packages[\\/]react-(?:compat|dom-compat)[\\/]/.test(id) ||
					/[\\/]node_modules[\\/](?:react|react-dom)[\\/]/.test(id)
			);
			if (retained)
				throw new Error(`Native eXact bundle retained unused React compatibility: ${retained}`);
			const unusedHydrationCapability = modules.find((id) =>
				/[\\/]packages[\\/]hydrate[\\/](?:src|dist)[\\/](?:config\.(?:ts|js)|islands(?:[\\/]|\.(?:ts|js))|patch(?:es|ing)(?:[\\/]|\.(?:ts|js))|response[\\/]|runtime[\\/](?:client|operations)\.(?:ts|js))/.test(
					id
				)
			);
			if (unusedHydrationCapability)
				throw new Error(
					`Hydration-only eXact bundle retained an unused optional capability: ${unusedHydrationCapability}`
				);
			const unusedEnhancementHost = modules.find((id) =>
				/[\\/]packages[\\/]dom[\\/](?:src|dist)[\\/](?:framework[\\/]enhancements|renderer[\\/](?:enhancement-(?:chain|integration|targets)|enhancements))\.(?:ts|js)$/.test(
					id
				)
			);
			if (unusedEnhancementHost)
				throw new Error(
					`Enhancement-free eXact bundle retained the optional DOM enhancement host: ${unusedEnhancementHost}`
				);
			const unusedRefCapability = modules.find((id) =>
				/[\\/]packages[\\/]core[\\/](?:src|dist)[\\/]component[\\/]ref-(?:capability-integration|runtime)\.(?:ts|js)$/.test(
					id
				)
			);
			if (unusedRefCapability)
				throw new Error(
					`Ref-free eXact bundle retained the optional component ref capability: ${unusedRefCapability}`
				);
			const unusedContextCapability = modules.find((id) =>
				/[\\/]packages[\\/]core[\\/](?:src|dist)[\\/]component[\\/]context-(?:api|capability-integration|inspection|resumption)\.(?:ts|js)$/.test(
					id
				)
			);
			if (unusedContextCapability)
				throw new Error(
					`Context-free eXact bundle retained the optional component context capability: ${unusedContextCapability}`
				);
			const unusedTargetCapability = modules.find((id) =>
				/[\\/]packages[\\/]dom[\\/](?:src|dist)[\\/](?:target-integration|renderer[\\/](?:target-contributions|target-routing))\.(?:ts|js)$/.test(
					id
				)
			);
			if (unusedTargetCapability)
				throw new Error(
					`Target-free eXact bundle retained the optional DOM capability: ${unusedTargetCapability}`
				);
		}
	};
}
