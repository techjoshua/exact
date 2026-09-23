package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// reachableRenderProgramDefinitions retains explicit dependencies of used hoists. Definitions
// are registered dependency-first, preserving initialization order without retaining dead roots.
func reachableRenderProgramDefinitions(source *ast.Node, definitions []namedRenderProgramDefinition, generatedRoots ...*ast.Node) []*ast.Node {
	byName := make(map[string]namedRenderProgramDefinition, len(definitions))
	pending := []string{}
	for _, definition := range definitions {
		byName[definition.name] = definition
		reachable := containsIdentifier(source, definition.name)
		for _, root := range generatedRoots {
			reachable = reachable || containsIdentifier(root, definition.name)
		}
		if reachable {
			pending = append(pending, definition.name)
		}
	}
	required := make(map[string]bool, len(pending))
	for len(pending) != 0 {
		name := pending[len(pending)-1]
		pending = pending[:len(pending)-1]
		if required[name] {
			continue
		}
		required[name] = true
		pending = append(pending, byName[name].dependencies...)
	}
	result := []*ast.Node{}
	for _, definition := range definitions {
		if required[definition.name] {
			result = append(result, definition.node)
		}
	}
	return result
}
