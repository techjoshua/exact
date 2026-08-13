# @exactjs/package-provenance

`@exactjs/package-provenance` is shared development-time infrastructure for resolving public package
exports without losing the physical package identity selected by Node. eXact tooling hosts use it to
avoid maintaining independent public-export, real-path, and containment logic.

## Usage

Tooling hosts call `resolveExactNodePackage()` to preserve real-path, version, manifest, and lockfile
integrity identity, then `resolveExactPublicPackageEntry()` to enforce an exported in-package
subpath.

## Runtime boundary

The package is not an application runtime dependency and is excluded from eXact browser graphs by
the platform-boundary acceptance check.
