package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"sort"
	"strings"
)

// ArrayRootProof retains a finite typed prefix without granting receiver-wide read or write authority.
type ArrayRootProof struct {
	Kind       string   `json:"kind"`
	Path       []string `json:"path"`
	Confidence string   `json:"confidence"`
}

// arrayRootProofs inspects only the selected authored receiver chain, never another source walk.
// A flow-narrowed prefix is conditional on its actual input being an Array at capture time.
func arrayRootProofs(node *ast.Node, path []string, c *checker.Checker) []ArrayRootProof {
	if node == nil || c == nil || containsString(path, "*") {
		return nil
	}
	result := []ArrayRootProof{}
	depth := 0
	for node != nil && depth <= len(path) {
		node = stateReferenceExpression(unwrapRenderExpression(node))
		value := c.GetTypeAtLocation(node)
		if isArrayRootType(value, c) {
			result = append(result, ArrayRootProof{Kind: "array", Path: append([]string{}, path[:len(path)-depth]...), Confidence: "exact"})
		}
		switch {
		case ast.IsPropertyAccessExpression(node):
			node = node.AsPropertyAccessExpression().Expression
		case ast.IsElementAccessExpression(node):
			node = node.AsElementAccessExpression().Expression
		default:
			return joinArrayRootProofs(nil, result)
		}
		depth++
	}
	return joinArrayRootProofs(nil, result)
}

// isArrayRootType proves every union constituent using checker identity, not display text.
// Mixed object/unknown unions cannot grant an unconditional Array root proof.
func isArrayRootType(value *checker.Type, c *checker.Checker) bool {
	if value == nil || value.Flags()&checker.TypeFlagsAnyOrUnknown != 0 {
		return false
	}
	if value.Flags()&checker.TypeFlagsUnion != 0 {
		members := value.Types()
		if len(members) == 0 {
			return false
		}
		for _, member := range members {
			if !isArrayRootType(member, c) {
				return false
			}
		}
		return true
	}
	return c.GetElementTypeOfArrayType(value) != nil || checker.IsTupleType(value)
}

// joinArrayRootProofs canonicalizes independently of effect ordering so fixed points converge.
func joinArrayRootProofs(left, right []ArrayRootProof) []ArrayRootProof {
	values := make(map[string]ArrayRootProof, len(left)+len(right))
	for _, set := range [][]ArrayRootProof{left, right} {
		for _, root := range set {
			values[strings.Join(root.Path, "\x00")] = root
		}
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var result []ArrayRootProof
	for _, key := range keys {
		result = append(result, values[key])
	}
	return result
}

func arrayRootProofSignature(roots []ArrayRootProof) string {
	var result strings.Builder
	for _, root := range roots {
		result.WriteString(strings.Join(root.Path, "\x00"))
		result.WriteByte('\n')
	}
	return result.String()
}

// componentArrayRootProofs consults the same owned function-task receiver used for native call admission.
func componentArrayRootProofs(node, target, component *ast.Node, source *ast.SourceFile, path []string, c *checker.Checker, bindings externalImportBindings) []ArrayRootProof {
	roots := arrayRootProofs(target, path, c)
	if containsString(path, "*") {
		return nil
	}
	for length := 1; length <= len(path); length++ {
		value := functionTaskStatePrefixType(node, component, source, c, bindings, path[:length])
		if isArrayRootType(value, c) {
			roots = joinArrayRootProofs(roots, []ArrayRootProof{{Kind: "array", Path: append([]string{}, path[:length]...), Confidence: "exact"}})
		}
	}
	return roots
}
