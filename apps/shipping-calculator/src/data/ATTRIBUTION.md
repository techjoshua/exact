# Geographic data

ZIP Code Tabulation Area representative coordinates are derived from the U.S. Census Bureau's 2025 Gazetteer Files:

https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2025.html

ZCTAs approximate USPS delivery areas and are used only for the decorative route visualization and straight-line distance estimate. They are not used to validate deliverability.

The state shapes in `us-state-paths.ts` are generated from the Census Bureau's 2025 1:20,000,000 state cartographic boundary file (`cb_2025_us_state_20m`). Alaska, Hawaii, and Puerto Rico are projected into display insets. Regenerate them with `node scripts/build-map.mjs <path-to-shapefile>`. They are intentionally not suitable for surveying, navigation, or jurisdictional decisions.
