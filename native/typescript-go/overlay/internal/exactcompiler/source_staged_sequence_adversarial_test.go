package exactcompiler

import (
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Eligibility is a bounded source relationship, not native authentication or
// execution. Unsupported source must keep its original collectors and donors.
func TestStagedNativeSequenceAdversarialSource(t *testing.T) {
	witness := stagedReturnedInstalledWitness
	for _, row := range []struct {
		name, source string
		eligible     bool
	}{
		{"original installed sequence", witness, true},
		{"script entry stays unmigrated", strings.Replace(witness, "export function invoke", "function invoke", 1), false},
		{"Proxy target", strings.Replace(witness, "Object.prototype", "new Proxy(Object.prototype,{})", 1), false},
		{"effectful target", "declare function target():object;" + strings.Replace(witness, "Object.prototype", "target()", 1), false},
		{"own authored slot", "const owner={defineProperty:Object.defineProperty};" + strings.ReplaceAll(witness, "Object.defineProperty", "owner.defineProperty"), false},
		{"custom method", "const owner={defineProperty(...args:unknown[]){window.name;return args}};" + strings.ReplaceAll(witness, "Object.defineProperty", "owner.defineProperty"), false},
		{"shadow Object", "const Object={prototype:{},defineProperty(...args:unknown[]){return args}};" + witness, false},
		{"data installation stays unmigrated", strings.Replace(witness, "get:makeGetter()", "value:makeGetter()", 1), false},
		{"returned invocation stays unmigrated", `declare function foreign():unknown;` + strings.Replace(witness, "()=>window.name", "()=>foreign()", 1), false},
		{"returned mutation stays unmigrated", strings.Replace(witness, "()=>window.name", "()=>{window.name='changed';return 'value'}", 1), false},
		{"optional native lookup stays unmigrated", strings.Replace(witness, "Object.defineProperty", "Object?.defineProperty", 1), false},
		{"computed descriptor", strings.Replace(witness, "get:makeGetter()", "['get']:makeGetter()", 1), false},
		{"spread descriptor", "declare const extras:PropertyDescriptor;" + strings.Replace(witness, "{configurable:true,", "{...extras,configurable:true,", 1), false},
		{"intervening side effect", strings.Replace(witness, ";return Object.defineProperty", ";window.name;return Object.defineProperty", 1), false},
		{"receiver callback", strings.Replace(witness, "()=>window.name", " function(this:{name:string}){return this.name}", 1), false},
		{"default callback", strings.Replace(witness, "()=>window.name", "(value=window.name)=>value", 1), false},
		{"captured callback", strings.Replace(witness, "function makeGetter(){return()=>window.name}", "function makeGetter(){const captured='name';return()=>captured}", 1), false},
		{"passive unrelated factory", witness + "function unrelated(){return()=>document.title}", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, operation *ast.Node) {
				facts := installationSourceFacts(query)
				declaration := enclosingCallableNode(operation)
				fact := &facts[installationFactIndex(t, facts, declaration)]
				before := callableAnalysisFingerprint(callableAnalysis{facts: facts})
				calls, eligible := stagedNativeSequence(fact, query.executable)
				if eligible != row.eligible {
					t.Fatalf("source sequence eligibility=%t want=%t", eligible, row.eligible)
				}
				if before != callableAnalysisFingerprint(callableAnalysis{facts: facts}) {
					t.Fatal("eligibility mutated source facts")
				}
				if !eligible {
					if len(calls) != 0 {
						t.Fatal("unsupported sequence exposed an authorized Call prefix")
					}
					return
				}
				statements := declaration.Body().AsBlock().Statements.Nodes
				if len(calls) != 2 || calls[0] != statements[0].Expression() || calls[1] != statements[1].Expression() || calls[0].Pos() >= calls[1].Pos() || enclosingCallableNode(calls[0]) != declaration || enclosingCallableNode(calls[1]) != declaration {
					t.Fatal("eligibility lost original ordered operations")
				}
				// The result slice is descriptive and detached, not stored source state.
				calls[0] = calls[1]
				again, accepted := stagedNativeSequence(fact, query.executable)
				if !accepted || len(again) != 2 || again[0] != statements[0].Expression() || before != callableAnalysisFingerprint(callableAnalysis{facts: facts}) {
					t.Fatal("caller mutation changed source eligibility")
				}
			})
		})
	}
}
