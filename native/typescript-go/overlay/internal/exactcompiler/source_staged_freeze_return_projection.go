package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// projectFreezeLexicalReturn is the sole consumer of the SOURCE ownership tag.
// It preserves same-declaration formal roles; neither the literal nor a formal
// becomes an acquired object, invoked value, or normal input association.
func (q *sourceValueQuery) projectFreezeLexicalReturn(value sourceValue, projection []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, visitNode func(*ast.Node, []string, bool)) bool {
	read := value.freezeLexical
	if read == nil {
		return false
	}
	b := q.stagedMember
	authentic := false
	if read.projection != nil {
		l := read.projection
		authentic = l.live(q) && l.work.freezeReturnReadMatches(read)
	} else {
		authentic = b != nil && b.getPreparation != nil && b.getPreparation.live(q) && q.getPreparationDataContextMatches(read.data) && b.getPreparation.work.freezeReturnReadMatches(read)
	}
	if !q.dependenciesOnly || q.normalBindingCall != nil || len(q.creators) != 0 || len(bindings) != 0 || b == nil || !authentic || q.effectOwner != read.source.declaration || b.request.consumer != read.source.declaration || value.node != read.source.endpoint.expression || value.capture != nil || value.native != nil || value.normal != nil {
		result.opaque, result.valueIncomplete = true, true
		return true
	}
	path := append(append([]string(nil), value.path...), projection...)
	if len(path) == 0 && name == "" && mode&accessorReachable == 0 && mode&accessorEnumerate == 0 {
		// No generic whole-value transport may erase this SOURCE ownership.
		// A consumer needing the whole returned object keeps its own pending
		// provenance obligation instead of decoding the literal as a value.
		result.valueIncomplete = true
		if b.getPreparation != nil {
			b.getPreparation.dataPending = true
		}
		return true
	}
	// The authenticated wrapper remains owned by this call. Reuse the original
	// literal/member visitor, including exact field reads, effects, reference
	// advancement, and symbolic formal lookup. No raw sourceValue is decoded
	// from the wrapper and no captured scope is silently removed.
	visitNode(read.source.endpoint.expression, path, false)
	return true
}
