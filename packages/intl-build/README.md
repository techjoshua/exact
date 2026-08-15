# @exactjs/intl-build

Shared build-time coordination for eXact internationalization. It owns native-analysis sessions,
catalog-file and published-dependency loading, descriptor companion construction, catalog
projection, XLIFF 2.1 synchronization/import, protocol-JSON interchange, validation, and generation fencing so Vite, Webpack, and Bun
use one implementation. It also maps finite client requirements to native support, bundled
side-effect modules, or pinned HTTPS CDN providers without putting provider policy in source
analysis.

Use `exportXliff21SourceCatalog()` to create a targetless translation request from analyzed source
messages. Pure formatter/value descriptors are omitted, while placeholders embedded in linguistic
messages remain available for reordering. Nested selector and formatter contributions remain
inside their enclosing message's single XLIFF unit. Send that XLIFF to a translation workflow,
then persist each returned bilingual locale
catalog as XLIFF. The coordinator lowers those catalogs to the shared bounded runtime protocol after
source descriptors are known; JSON remains useful for generated adapters but is not the translation
source of truth. `synchronizeXliff21Catalog()` refreshes source units while preserving compatible
target inline codes, notes, and review state, and removes units no longer in generated source.

The interchange is schema-valid XLIFF 2.1. Translator-facing files contain ordinary text and
generic `<ph>`, `<pc>`, and `<mrk>` codes with standard `equiv`, `canCopy`, and `canDelete`
information. They contain no eXact namespace or runtime binding/formatter payload. The separately
hashed execution contract stays in generated descriptor data and is reattached only after a target
has passed structural validation.

## Usage

Application code does not import this package. Bundler adapters create an `IntlBuildCoordinator`
and translate their host lifecycle hooks into its host-neutral operations. Source analysis remains
in `@exactjs/intl-analyzer`, while browser-safe runtime contracts remain in `@exactjs/intl`.

See the [internationalization reference](../../docs/internationalization.md) for the supported
authoring and build behavior.
