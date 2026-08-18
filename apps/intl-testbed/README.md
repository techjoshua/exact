# eXact internationalization test bed

This private sample renders the same reactive component content under English, French, Japanese,
and Arabic environments side by side. It exercises enhancement-authored messages, translator
reordering, branches, plural and ordinal projection, semantic units, native formatter inference,
intrinsic properties, ordinary content outside the translation workload, and lazy catalog
adoption.

The lazy-region idle, loading, and loaded states are all catalog-backed. The explicitly labeled
ordinary-content sentence is the untranslated-content control in each locale panel. The opaque
recipient component also uses standard `translate="no"` for its authored proper name.

Its formatter grid exercises enhancement-first conversion and locale preference for road distance,
temperature, land area, personal mass, liquid volume, road speed, weather pressure, food and
electric energy, engine power, road fuel economy, and digital storage. The panels make metric,
US-customary, RTL, and untranslated source fallback behavior directly comparable. Pinned CLDR 48
region, usage, and magnitude preferences supply the defaults; the metric and US controls apply
standard Unicode `u-ms-metric` and `u-ms-ussystem` locale extensions without duplicating preference
tables. Each locale panel uses `intl:locale`, so its reactive `lang` and `dir` attributes are visible
in SSR and client output.

Run `npm run dev:intl` from the repository root. The generated, checked-in
`locales/en-US.xlf` is the targetless set of source-locale messages a developer sends for
translation. The
locale-named XLIFF files are the returned bilingual catalogs and the translation source of truth.
The GitHub Pages deployment also publishes the production build under `intl/`, linked from the
documentation application.
Before development and production builds, synchronization refreshes their analyzer-derived source
units while preserving translated targets and history;
`npm --workspace @exactjs/sample-intl-testbed test` checks that they are current.
The startup generator also lowers them to ignored `.exact/intl-catalogs.json` build data; that cache
is disposable and is never a translation-authoring source.
