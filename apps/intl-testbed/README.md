# eXact internationalization test bed

This private sample renders the same reactive component content under English, French, Japanese,
and Arabic environments side by side. It exercises enhancement-authored messages, translator
reordering, branches, plural and ordinal projection, semantic units, native formatter inference,
intrinsic properties, ordinary content outside the translation workload, and lazy catalog
adoption.

The lazy-region idle, loading, and loaded states are all catalog-backed. The explicitly labeled
ordinary-content sentence is the sole untranslated control in each locale panel.

Its formatter grid exercises enhancement-first conversion and locale preference for road distance,
temperature, land area, personal mass, liquid volume, road speed, weather pressure, food and
electric energy, engine power, road fuel economy, and digital storage. The panels make metric,
US-customary, RTL, and untranslated source fallback behavior directly comparable. The locale policy
uses pinned CLDR 48 region, usage, and magnitude preferences; the metric and US controls demonstrate
that application policy still overrides those defaults.

The shared count control also drives a source-locale cardinal-rule comparison for Arabic, Polish,
French, and Hindi. It shows the native category and authored word form side by side, matching the
static `Intl.PluralRules` lookup shape accepted by the analyzer.

Run `npm run dev:intl` from the repository root. The generated, checked-in
`locales/en-US.xlf` is the targetless set of source-locale messages a developer sends for
translation. The
locale-named XLIFF files are the returned bilingual catalogs and the translation source of truth.
Before development and production builds, synchronization refreshes their analyzer-derived source
units while preserving translated targets and history;
`npm --workspace @exactjs/sample-intl-testbed test` checks that they are current.
The startup generator also lowers them to ignored `.exact/intl-catalogs.json` build data; that cache
is disposable and is never a translation-authoring source.
