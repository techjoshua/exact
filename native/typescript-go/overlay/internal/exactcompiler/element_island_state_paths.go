package exactcompiler

import (
	"slices"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
)

// islandStatePaths computes the minimal stable state snapshot needed to reconstruct one generated
// client island. Reactive captures recursively contribute the state reads of their definitions,
// while a narrower descendant read suppresses serialization of its whole direct-alias object.
func islandStatePaths(
	sourceFile *ast.SourceFile,
	component string,
	node *ast.Node,
	stateAliases []StateAlias,
	stateReads []StateRead,
	stateWrites []StateWrite,
	captures []islandValueCapture,
	reactiveBindings []ReactiveBinding,
	additionalInputs []*ast.Node,
) [][]string {
	result := [][]string{}
	seen := make(map[string]struct{})
	add := func(path []string) {
		if len(path) == 0 {
			return
		}
		key := strings.Join(path, ".")
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		result = append(result, append([]string(nil), path...))
	}
	for _, read := range stateReads {
		if read.Component != component || len(read.Path) == 0 ||
			!positionInIslandInputs(read.Start, node, additionalInputs) {
			continue
		}
		add(read.Path)
	}
	for _, write := range stateWrites {
		if write.Component == component &&
			positionInIslandInputs(write.Start, node, additionalInputs) {
			add(write.Path)
		}
	}
	bindings := make(map[string]ReactiveBinding)
	bindingRanges := make(map[string][2]int)
	aliases := make(map[string]StateAlias)
	for _, alias := range stateAliases {
		if alias.Component == component {
			aliases[alias.Name] = alias
		}
	}
	for _, binding := range reactiveBindings {
		if binding.Component == component {
			bindings[binding.Name] = binding
		}
	}
	walkNode(sourceFile.AsNode(), func(candidate *ast.Node) bool {
		if !ast.IsVariableDeclaration(candidate) ||
			candidate.Name() == nil ||
			!ast.IsIdentifier(candidate.Name()) {
			return true
		}
		name := candidate.Name().Text()
		binding, exists := bindings[name]
		if exists && binding.Start == candidate.Name().Pos() {
			bindingRanges[name] = [2]int{candidate.Pos(), candidate.End()}
		}
		return true
	})
	visited := make(map[string]struct{})
	var addBindingReads func(string)
	addBindingReads = func(name string) {
		if _, duplicate := visited[name]; duplicate {
			return
		}
		visited[name] = struct{}{}
		binding, exists := bindings[name]
		if !exists {
			return
		}
		start := binding.Start
		end := binding.Start + binding.Length
		if value, exists := bindingRanges[name]; exists {
			start, end = value[0], value[1]
		}
		for _, read := range stateReads {
			if read.Component == component && read.Start >= start && read.Start < end {
				// A direct state alias is reconstructed from its snapshot. If island expressions
				// already identify narrower reads through that alias, retaining the declaration's
				// root read would unnecessarily serialize the entire object.
				if alias, isAlias := aliases[name]; isAlias &&
					slices.Equal(read.Path, alias.Path) &&
					hasDescendantStatePath(result, alias.Path) {
					continue
				}
				add(read.Path)
			}
		}
		for _, dependency := range binding.Dependencies {
			addBindingReads(dependency)
		}
	}
	for _, capture := range captures {
		addBindingReads(capture.name)
	}
	sort.Slice(result, func(left int, right int) bool {
		return strings.Join(result[left], ".") < strings.Join(result[right], ".")
	})
	return result
}

func hasDescendantStatePath(paths [][]string, prefix []string) bool {
	for _, path := range paths {
		if len(path) <= len(prefix) {
			continue
		}
		matches := true
		for index := range prefix {
			if path[index] != prefix[index] {
				matches = false
				break
			}
		}
		if matches {
			return true
		}
	}
	return false
}
