import {
	createStartHandler,
	defaultRenderHandler,
	defaultStreamHandler
} from '@tanstack/react-start/server';

const mode = process.env.COMPARISON_SSR_RENDER_MODE ?? 'string';
if (mode !== 'string' && mode !== 'stream') throw new Error(`Unknown SSR rendering mode ${mode}`);

/** Keeps Start's document, router, assets, and hydration while selecting its supported SSR handler. */
export default {
	fetch: createStartHandler(mode === 'stream' ? defaultStreamHandler : defaultRenderHandler)
};
