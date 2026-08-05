# @exactjs/typescript-plugin

TypeScript language-service compatibility for syntax owned by the eXact compiler.

## Purpose

The plugin accompanies the eXact VS Code extension. It prevents TypeScript from reporting an
implicit-`this` error for local functions owned by a component with an authored
`this: Component<...>` receiver, and treats an `exact-enhancement` import as used when its binding is
used as a JSX attribute namespace.

It also completes members from the enclosing component receiver after `this.` in a local function.
After an attributed JSX prefix such as `motion:`, it completes the imported component's finite
public props using their kebab-case JSX spelling and includes the reserved `root` target selector.

Application builds do not load this package. The eXact compiler remains responsible for validating
component and enhancement semantics; this plugin only removes TypeScript diagnostics whose model
conflicts with syntax the compiler has already defined.
