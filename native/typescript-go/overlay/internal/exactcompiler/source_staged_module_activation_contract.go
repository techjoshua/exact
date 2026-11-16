package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedModuleActivationRequest describes an original module source goal.
// The graph request and physical Get cut are separate. A nil read requests the
// complete original module partition. Otherwise the original event stream stops
// immediately before that Get's own visit, after its receiver/key dependencies.
// Neither syntax membership nor constructing this record issues publication.
type sourceStagedModuleActivationRequest struct {
	request    sourceStagedOperationRequest
	root, read *ast.Node
	cut        sourceRelativeCut
	generation *projectGeneration
}

// sourceStagedModuleEntryContribution is supplied only by the semantic owner of
// this earlier event. Accounted means its local no-user-entry law is represented.
// Required children may still be pending. Effects emptiness, purity, an acquired
// value and NoWrites are not this capability. A mapper's false authorization
// discards its returned prefix and leaves the source goal unsupported.
type sourceStagedModuleEntryContribution struct {
	required  []sourceStagedOperationRequest
	accounted bool
}

// sourceStagedModuleActivation is detached source protocol data, not an executed
// module or a normal prefix receipt. The live original owner must authenticate
// its source/population/read/generation and every semantic contribution before
// publication. Function prior-invocation state never consumes this disposition.
type sourceStagedModuleActivation struct {
	source     sourceStagedModuleActivationRequest
	required   []sourceStagedOperationRequest
	supported  bool
	accounted  bool
	notEntered *ast.Node // Original once/module operation whose execution event follows this read.
}
