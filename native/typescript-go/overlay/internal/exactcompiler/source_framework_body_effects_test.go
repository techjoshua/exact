package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// This is source-relationship accounting at the original three-appender owner,
// not a summary-delivery or current-operation claim. The full collector test
// remains the separate connection/closure gate.
func TestFrameworkSourceBodyEffectsAccounting(t *testing.T) {
	const source = `import {reactiveObjects} from '@exactjs/reactive/framework/objects';
function forwarded(errors:object[]){reactiveObjects(errors)}
export function invoke(){forwarded([])}`
	withFrameworkViewProgram(t, source, func(owner *executableBodyOwner, generation *projectGeneration) {
		var call, body *ast.Node
		walkNode(generation.sourceFile.AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "forwarded" {
				call = n
			}
			if ast.IsFunctionDeclaration(n) && n.Name() != nil && n.Name().Text() == "forwarded" {
				body = n
			}
			return true
		})
		if call == nil || body == nil {
			t.Fatal("original source body/Call missing")
		}
		facts := stagedReturnSourceFacts(generation.sourceFile)
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		work := newCallableEffectWork(facts)
		caller := work.memberNodes[enclosingCallableNode(call)]
		a := frameworkSourceBodyAccounting{consumer: facts[caller].node, operation: call, declaration: body, generation: generation}
		c := appendArgumentAccessorEffectsWithBodyEffects(&facts[caller], call, work.memberNodes, generation.sourceFile, generation.checker, owner, nil, a.observe)
		if len(a.observed) == 0 || len(c.inputs) == 0 || len(c.fieldCalls) == 0 || !a.represented(c, &facts[caller]) {
			t.Fatalf("genuine source producer/publication unrepresented: callbacks=%d inputs=%d fields=%d", len(a.observed), len(c.inputs), len(c.fieldCalls))
		}
		if !c.valueIncomplete || len(c.normalCalls)+len(c.nativeCalls) != 0 {
			t.Fatal("source accounting completed an unavailable normal output")
		}
		// The leaf declaration predicate remains strict. Only the bound owner
		// may account these exact source-only records, then require summaries.
		if !frameworkEffectsCompilerPending(c) {
			t.Fatal("generic packet predicate accepted source-body records")
		}
		if frameworkEffectsCompilerPendingWithoutSourceBodies(c) {
			t.Fatal("original source traversal has independent unrepresented debt")
		}
		for _, row := range []struct {
			name  string
			alter func(*frameworkSourceBodyAccounting)
		}{
			{"unobserved", func(v *frameworkSourceBodyAccounting) { v.observed = nil }},
			{"foreign-cut", func(v *frameworkSourceBodyAccounting) { v.observed[0].cut.reading = body }},
			{"foreign-generation", func(v *frameworkSourceBodyAccounting) { v.generation = nil }},
			{"unmapped-recipient", func(v *frameworkSourceBodyAccounting) { v.declaration = facts[caller].node }},
			{"unfinished-enumeration", func(v *frameworkSourceBodyAccounting) { v.observed[0].call.complete = false }},
		} {
			t.Run(row.name, func(t *testing.T) {
				bad := a
				bad.observed = append([]sourceBodyEffectsObservation(nil), a.observed...)
				row.alter(&bad)
				if bad.represented(c, &facts[caller]) {
					t.Fatal("unmapped or unfinished source relationship accepted")
				}
			})
		}
		missingInput := c
		missingInput.inputs = nil
		if a.represented(missingInput, &facts[caller]) {
			t.Fatal("missing installed input record accepted")
		}
		missingBody := c
		missingBody.effects = nil
		if a.represented(missingBody, &facts[caller]) {
			t.Fatal("source accounting lost canonical MAY subscriber recipient")
		}
		unpublished := facts[caller]
		unpublished.fieldCalls = nil
		if a.represented(c, &unpublished) {
			t.Fatal("unpublished source outcomes substituted for actual transfer")
		}
	})
}

// An actual unsupported body demand must retain its compiler-source debt; a
// source-only binder record cannot reclassify it as a framework runtime MAY.
func TestFrameworkSourceBodyUnmappedDemandPending(t *testing.T) {
	const source = `function forwarded(value:{read():void}){value.read()}
export function invoke(value:{read():void}){forwarded(value)}`
	withFrameworkViewProgram(t, source, func(owner *executableBodyOwner, generation *projectGeneration) {
		var call *ast.Node
		walkNode(generation.sourceFile.AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "forwarded" {
				call = n
			}
			return true
		})
		if call == nil {
			t.Fatal("original pending source Call missing")
		}
		c := sourceInvocationDependencies(call, generation.checker, owner, enclosingCallableNode(call))
		if !frameworkEffectsCompilerPendingWithoutSourceBodies(c) {
			t.Fatal("unresolved member/callee work became represented source Effects")
		}
	})
}
