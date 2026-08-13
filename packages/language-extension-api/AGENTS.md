# eXact language-extension API

Use this package when authoring a trusted language analyzer or declarative language contribution for
an eXact enhancement library or framework plugin. Start with the package README and prefer finite
declarative metadata whenever it can represent the rule faithfully. Treat analyzer input as a stable
serialized projection; do not depend on compiler internals or assume access to an LSP connection.
This package is build-tool-only and must not be imported by browser application code.
