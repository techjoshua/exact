# @exactjs/intl-analyzer

## Purpose

Build-only native TypeScript-Go source analysis for protocol-1 eXact internationalization. It recognizes lexical
`@exactjs/intl/enhancements` regions, emits validated descriptors and prepared-activation source
instrumentation, and reports source-local component ordinals for adapters to join to public compiler
facts. It leaves the standard eXact compiler unaware of message and locale semantics and never mints
compiler component IDs.

## Integration

The analyzer is intended for framework build adapters. Application code imports `@exactjs/intl`, not
this package. Vite, Bun, and Webpack applications enable it through the eXact adapter's
`internationalization` option. Build hosts reuse one persistent `NativeIntlAnalyzer`; the ordinary
compiler pass remains free of intl semantics.

## Supported analysis

The bounded implementation recognizes lexical messages and allowlisted intrinsic properties,
finite branches and direct intrinsic structure, ordinal and Temporal projections, standard finite
`Intl` calls, display-name property roles, explicit intl-role components, semantic unit/CLDR
selectors, road-distance value/range fallbacks, and temperature projections. It
uses the JavaScript host's native `Intl` locale vocabulary and Go's CLDR-backed locale/currency
facilities instead of maintaining language tables. Unit labels and currency name/symbol evidence
come from bounded native-`Intl` profiles with ambiguous labels removed. English fallback shorthand
remains supported through the language-profile registry also populated for German, French, Spanish,
Portuguese, Italian, Dutch, Polish, Ukrainian, Russian, Arabic, Hindi, Japanese, Chinese, Korean,
Turkish, and Indonesian. Profiles can prove finite ordinal markers and distinctive prefix/suffix
wrappers, while an explicit static `Intl.PluralRules` lookup provides
source-language-independent ordinal, cardinal, or two-binding plural-range intent. Static locales
on recognized native `Intl` projections are checked for compatibility with the configured source
locale. Focused plural systems and a 16-locale native-profile matrix protect representative script
and language families. It also reports finite client capability requirements for generator-owned
polyfill planning. See the
[internationalization reference](../../docs/internationalization.md) for exact limits. This remains
a build-adapter contract, not an application-facing API.
