export default defineNuxtConfig({
	compatibilityDate: '2026-08-11',
	devtools: { enabled: false },
	ssr: true,
	css: ['~/styles.css'],
	app: { head: { title: 'Signal Desk · Nuxt', htmlAttrs: { lang: 'en' } } }
});
