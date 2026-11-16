package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Classification supplies no DATA, selected initializer or graph observation.
// The same semantic binding owner bounds both module and local source admission.
func TestStagedNativeInputBindingLexicalSource(t *testing.T) {
	for _, row := range []struct {
		name, source string
		supported    bool
	}{
		{"module", `const value=Object.defineProperties({},{});export const frozen=Object.freeze(value);`, true},
		{"local", `export function invoke(){const value=Object.defineProperties({},{});return Object.freeze(value)}`, true},
		{"let", `let value=Object.defineProperties({},{});export const frozen=Object.freeze(value);`, false},
		{"written", `let value=Object.defineProperties({},{});value={};export const frozen=Object.freeze(value);`, false},
		{"formal", `export function invoke(value:object){return Object.freeze(value)}`, false},
		{"captured-module", `const value=Object.defineProperties({},{});export function invoke(){return Object.freeze(value)}`, false},
		{"captured-local", `export function factory(){const value=Object.defineProperties({},{});return()=>Object.freeze(value)}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withReflectiveRelevanceSource(t, row.source, func(owner *executableBodyOwner, file *ast.SourceFile) {
				var call *ast.Node
				walkNode(file.AsNode(), func(n *ast.Node) bool {
					if ast.IsCallExpression(n) && stagedNativeInputIntent(n.Expression()) == sourceNativeObjectFreeze {
						call = n
					}
					return true
				})
				if call == nil {
					t.Fatal("original Freeze missing")
				}
				read := restrictedInvocationArguments(call.AsCallExpression())[0]
				caller := enclosingCallableNode(read)
				if caller == nil {
					caller = sourceStagedModuleOwner(read)
				}
				binding := stagedNativeInputBindingDeclaration(read, caller, owner)
				if (binding != nil) != row.supported {
					t.Fatalf("lexical binding=%v supported=%v", binding != nil, row.supported)
				}
				if !row.supported {
					return
				}
				root, ok := sourceStagedOccurrenceRequest(&callableFacts{node: caller, sourceFile: file}, call, relativeDemandEffects, "native-input-binding-test")
				if !ok {
					t.Fatal("original request missing")
				}
				source := &sourceStagedNativeGetSource{request: root, get: call.Expression(), kind: sourceNativeObjectFreeze}
				parent := nativeRootDebtRequest(source, "algorithm")
				plan := sourceStagedNativeInputPlan{request: parent, kind: source.kind, input: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: read, producer: call, cut: root.cut}, bindingData: nativeInputBindingRequest(parent, read)}
				if !validNativeInputBindingPlan(plan, source) {
					t.Fatal("original Identifier factory refused")
				}
				for _, change := range []func(*sourceStagedNativeInputPlan){
					func(p *sourceStagedNativeInputPlan) { p.input.expression = binding.Initializer() },
					func(p *sourceStagedNativeInputPlan) { p.bindingData.reading.selector.field = "eager-inputs" },
					func(p *sourceStagedNativeInputPlan) { p.bindingData.cut.initializing = call },
					func(p *sourceStagedNativeInputPlan) { p.bindingData.consumer = binding },
				} {
					bad := plan
					change(&bad)
					if validNativeInputBindingPlan(bad, source) {
						t.Fatal("mismatched binding/reader/cut factory accepted")
					}
				}
			})
		})
	}
}
