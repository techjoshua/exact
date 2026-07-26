/** Shared eXact compiler options for development, client builds, and SSR builds. */
export const exactPluginOptions = Object.freeze({
	reactCompatibility: Object.freeze({
		target: 19,
		source: /src[\\/]demos[\\/]react[\\/]/
	})
});
