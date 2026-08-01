# @exactjs/microfrontends

Federated microfrontend support for eXact hosts and remotes.

## Overview

The package defines remote exposure and consumption configuration, shared-package policy,
development discovery, build artifacts, client loading, SSR coordination, and root lifecycle. It
integrates with the eXact build and server runtimes rather than replacing them.

## Usage model

Keep host names, remote exposures, shared versions, and server gateways explicit. Load remote
components from their compiler-produced artifacts, and keep page-authored child content owned by
the page root.

For architecture and deployment examples, see
[microfrontends](../../docs/microfrontends.md).
