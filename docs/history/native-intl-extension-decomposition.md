# Native internationalization-extension decomposition

## Status

Completed. Every internationalization extension module is below the standard Go architecture
limit. Removing the former `intl_extension.go` exception also removes the final legacy Go ceiling.

## Ownership

`intl_extension.go` owns the native extension entry point, request validation, source traversal,
diagnostics, untranslated spans, locale activation, and client capability requirements.

`intl_unit_inference.go` owns currency and semantic-unit evidence, locale defaults, label matching,
and compatible unit profiles.

`intl_pattern_building.go` owns descriptor construction, JSX contribution/pattern formation,
bindings, authored inference evidence, and explicit activation handling.

`intl_expression_analysis.go` owns relative-duration, ordinal/plural, formatter, selection, scalar,
and Temporal expression analysis.

The split retains the single extension traversal and unchanged serialized analysis format. Native
Go tests and the semantic compiler corpus protect diagnostics, descriptors, inference, and runtime
requirements.
