# Agent guidance for `@exactjs/react-dom-compat`

Preserve React ownership until the explicit compatibility boundary. Keep React component functions
unbranded and let `@exactjs/react-compat` create its identified native adapters.

Keep the compilerless client and server root hosts branded with their stable package-qualified
identities. Do not infer native ownership from function shape or use a root-host brand to classify
the React functions it contains.
