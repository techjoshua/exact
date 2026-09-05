# Using `@exactjs/charts`

See the [README](./README.md) for API orientation.

- Give every series and datum a stable ID.
- Use standard `intl:*` enhancements inside chart label components for translated content.
- Declare the source unit of measured numeric values; locale never determines source meaning.
- Keep a structured data view available for charts whose visual geometry carries detailed meaning.
- Import only the focused chart surface needed by the application when bundle reachability matters.
