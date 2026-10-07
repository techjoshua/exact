package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/parser"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
	"reflect"
	"testing"
)

// Discovery follows source identity even when successive source versions share a filename.
func TestProjectModuleImportDiscoveryTransitions(t *testing.T) {
	state := &projectState{}
	for _, example := range []struct {
		source  string
		imports []string
		open    bool
	}{
		{`import {value} from './first.js';const load=()=>import('./second.js');`, []string{"./first.js", "./second.js"}, false},
		{`const name='./first.js';const load=()=>import(name);`, []string{}, true},
		{`import {value} from './third.js';`, []string{"./third.js"}, false},
		{`export const values=[1,2,3];`, []string{}, false},
	} {
		source := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/module.ts", Path: tspath.Path("/module.ts")}, example.source, core.ScriptKindTS)
		for range 2 {
			imports, open := state.sourceModuleSpecifiers(source)
			if !reflect.DeepEqual(imports, example.imports) || open != example.open {
				t.Fatalf("wrong discovery for %s: %v %t", example.source, imports, open)
			}
		}
	}
	state.invalidateAnalysisCaches()
	if state.moduleImports != nil {
		t.Fatal("full invalidation retained source discovery")
	}
}

// Data strings resembling source code remain JSON values, with no executable dependency edges.
func TestJSONSourceDiscovery(t *testing.T) {
	source := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/data.json", Path: tspath.Path("/data.json")}, `{"import":"import(variable)","component":"return()=> <span/>","values":[["zip",1,2]]}`, core.ScriptKindJSON)
	imports, open := projectModuleSpecifiers(source)
	if len(imports) != 0 || open || len(componentCandidates(source)) != 0 || len(collectComponents(source)) != 0 {
		t.Fatal("JSON data acquired executable import or component identity")
	}
}
