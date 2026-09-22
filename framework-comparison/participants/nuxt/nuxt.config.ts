import { fileURLToPath } from 'node:url';

export default defineNuxtConfig({
	compatibilityDate: '2026-08-11',
	devtools: { enabled: false },
	ssr: true,
	...(process.env.COMPARISON_BUILD_RUNTIME === 'bun'
		? { nitro: { preset: 'bun', output: { dir: '.output-bun' } } }
		: { nitro: { preset: 'node-listener', serveStatic: true } }),
	css: [fileURLToPath(new URL('../../presentation/incident-workspace.css', import.meta.url))],
	app: { head: { title: 'Incident Operations', htmlAttrs: { lang: 'en' } } }
});
