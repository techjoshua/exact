# @exactjs/component-library

This package is the inert participation marker for published eXact component libraries. It tells
eXact build adapters that a package intentionally follows component-library packaging and
provenance protocol 1.

## Usage

Component-library authors add `@exactjs/component-library` to production `dependencies` and
publish compiler-generated static build facts through `exactComponentLibrary.build` in their
package manifest. Applications do not import this package.

The marker contains no JavaScript entry point, lifecycle, registration, configuration, or trust
grant. Server execution remains subject to the consuming application's component-library policy.
