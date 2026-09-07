export default defineNuxtConfig({
	compatibilityDate: '2026-08-11',
	devtools: { enabled: false },
	ssr: true,
	...(process.env.COMPARISON_BUILD_RUNTIME === 'bun'
		? { nitro: { preset: 'bun', output: { dir: '.output-bun' } } }
		: {}),
	css: ['~/styles.css'],
	app: { head: { title: 'Signal Desk · Nuxt', htmlAttrs: { lang: 'en' } } }
});
