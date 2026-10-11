# @exactjs/component-library

This package is the inert participation marker for published eXact component libraries. It tells
eXact build adapters that a package intentionally follows component-library packaging and
provenance protocol 1.

## Usage

Component-library authors add `@exactjs/component-library` to production `dependencies` and
publish compiler-generated static build facts through `exactComponentLibrary.build` in their
package manifest. Those facts map each public package export to the target-specific compiled module
that owns the component. Applications do not import this package.

Declare shared framework runtimes as compatible `peerDependencies`, with development dependencies
for the library's own build and tests. Keep this participation marker in `dependencies`.
`exactc build-library` reports any undeclared runtime packages needed by its generated artifacts.
The Vite, Bun, and Webpack adapters share the application's installed framework instances with
linked libraries. Peer installation checks compatible ranges, and the consumer's server policy
still determines which component and enhancement providers may execute.

The marker contains no JavaScript entry point, lifecycle, registration, configuration, or trust
grant. Server execution remains subject to the consuming application's component-library policy.

[Documentation](https://techjoshua.github.io/exact/#/components/trust) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/component-library)
