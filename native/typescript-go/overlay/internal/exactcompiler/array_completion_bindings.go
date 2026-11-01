package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
	"sort"
	"strings"
)

func continuationsHaveArrayRoots(values []Continuation, rootOnly bool) bool {
	for _, continuation := range values {
		for _, effect := range continuation.Effects.StateWrites {
			for _, root := range effect.ArrayRoots {
				if effect.Confidence == "exact" && (!rootOnly || strings.Join(root.Path, ".") == effect.Path) {
					return true
				}
			}
		}
	}
	return false
}

// arrayBinding selects direct named imports, never an aggregate registry or a runtime type search.
func (imports *componentConstructorImports) arrayBinding(factory *printer.NodeFactory, client bool, used map[string]struct{}) *ast.Node {
	names := []string{"captureArrayBefore", "diffArrayCompletion", "parseArrayNetMutation"}
	fields := []string{"capture", "diff", "parse"}
	if client {
		names = []string{"captureArraySubmission", "parseArrayNetMutation", "prepareArrayNetMutation", "applyArrayNetPlan"}
		fields = []string{"capture", "parse", "plan", "apply"}
	}
	if imports.arrayImports == nil {
		imports.arrayImports = make(map[string]string)
	}
	properties := []*ast.Node{}
	for i, name := range names {
		module := "@exactjs/reactive/framework/array-patch"
		if name == "captureArrayBefore" || name == "diffArrayCompletion" {
			module = "@exactjs/reactive/framework/array-diff"
		}
		key := module + "\x00" + name
		local := imports.arrayImports[key]
		if local == "" {
			local = allocateGeneratedName(used, "__exact_"+name)
			imports.arrayImports[key] = local
		}
		properties = append(properties, contractProperty(factory, fields[i], factory.NewIdentifier(local)))
	}
	return contractObject(factory, true, properties...)
}

func (imports *componentConstructorImports) arrayDeclarations(factory *printer.NodeFactory) []*ast.Node {
	keys := make([]string, 0, len(imports.arrayImports))
	for key := range imports.arrayImports {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	result := []*ast.Node{}
	for _, key := range keys {
		parts := strings.Split(key, "\x00")
		result = append(result, componentConstructorImport(factory, parts[1], imports.arrayImports[key], parts[0]))
	}
	return result
}
