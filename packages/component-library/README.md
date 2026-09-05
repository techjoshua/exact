# @exactjs/component-library

This package is the inert participation marker for published eXact component libraries. It tells
eXact build adapters that a package intentionally follows component-library packaging and
provenance protocol 2.

## Usage

Component-library authors add `@exactjs/component-library` to production `dependencies` and
publish compiler-generated static build facts through `exactComponentLibrary.build` in their
package manifest. Those facts map each public package export to the target-specific compiled module
that owns the component. Applications do not import this package.

The marker contains no JavaScript entry point, lifecycle, registration, configuration, or trust
grant. Server execution remains subject to the consuming application's component-library policy.
