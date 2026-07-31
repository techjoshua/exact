# Agent guidance for `@exactjs/react-compat`

Read this package's `README.md` and preserve the explicit ownership boundary. A non-empty string
at `Symbol.for('@exactjs/component')` identifies a native eXact component; unbranded functions
belong to the configured React compatibility layer. Do not infer ownership from function shape,
package name, or optional component-contract metadata.

Brand only the internal native adapter created after React ownership has been established. Keep
the original React function unbranded, and use a distinct adapter identity per cached React type.
