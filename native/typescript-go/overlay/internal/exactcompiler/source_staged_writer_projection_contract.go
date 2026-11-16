package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedWriterInputProjection is a synchronous source-value projection
// interval at the creating Call. Raw Get/Call outputs are deferred to their
// original producers instead of being recovered recursively. Neither this
// interval nor its scopes can enter a callable fact or operation recipe.
type sourceStagedWriterInputProjection struct {
	issuer         *sourceValueQuery
	pending        []sourceRelativeEndpoint
	runtimeUnknown []sourceStagedWriterUnknownSource
}

type sourceStagedWriterCallableScope struct {
	alternative sourceStagedOperationAlternative
	scope       acquiredCallableScope
}

// sourceStagedWriterUnknownSource is a positively observed ambient entry under
// the original live source projection. It grants no invocation effects.
type sourceStagedWriterUnknownSource struct {
	expression, declaration *ast.Node
	cut                     sourceRelativeCut
}
