package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Associations come from the original source selector or real binder. Neither
// the mapper nor the presence of a private direct Call activates the writer.
func TestStagedMemberActivationOriginalAssociations(t *testing.T) {
	const fixture = `const box={run:()=>1};function install(value:()=>number){box.run=value}export function invoke(value:()=>number){install(value);return box.run()}`
	for _, delivered := range []bool{false, true} {
		withSourceCalleeWriteQuery(t, fixture, func(query *sourceValueQuery, reader *ast.Node) {
			var write, creating *ast.Node
			walkNode(ast.GetSourceFileOfNode(reader).AsNode(), func(node *ast.Node) bool {
				if ast.IsBinaryExpression(node) && node.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
					write = node
				}
				if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "install" {
					creating = node
				}
				return true
			})
			if write == nil || creating == nil {
				t.Fatal("original writer/creating Call missing")
			}
			cut := query.relativeInputCut(reader)
			pending := describeStagedMemberActivation(write, cut, query.executable)
			if !pending.incomplete || !pending.priorInvocationState || len(pending.candidates) != 1 || !pending.candidates[0].incomplete || pending.candidates[0].delivered || pending.candidates[0].sourceDescribed {
				t.Fatal("syntax-only candidate manufactured activation")
			}
			facts := installationSourceFacts(query)
			fact := &facts[installationFactIndex(t, facts, enclosingCallableNode(creating))]
			var association sourceStagedDeclarationCall
			if delivered {
				invocation, gap := describeStagedDeclarationInvocation(fact, creating, query.owner.checker, query.executable)
				if gap != stagedCallSupported {
					t.Fatal("original declaration selection unavailable")
				}
				inputs, ok := bindStagedDeclarationInputs(fact, invocation, query.executable)
				if !ok {
					t.Fatal("original real B unavailable")
				}
				association = sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: invocation, inputs: inputs}
			} else {
				source, ok := describeStagedInputSubstitution(creating, fact.node, query.executable)
				if !ok {
					t.Fatal("original source association unavailable")
				}
				association = sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: source.invocation, sourceInputs: source}
			}
			result := describeStagedMemberActivation(write, cut, query.executable, association)
			if len(result.candidates) != 1 || result.observation != cut || !result.incomplete || !result.priorInvocationState {
				t.Fatal("candidate/read/prior-state relation lost")
			}
			candidate := result.candidates[0]
			if candidate.creating.expression != creating || candidate.creating.producer != creating || candidate.incomplete || candidate.delivered != delivered || candidate.sourceDescribed == delivered {
				t.Fatal("delivered and source-described associations conflated")
			}
			if len(candidate.bound.bindings) == 0 {
				t.Fatal("original input contributions lost")
			}
			if delivered && candidate.inputs == association.inputs {
				t.Fatal("detached edge retained current-work pointer authority")
			}
			candidate.bound.bindings[0].unknown = !candidate.bound.bindings[0].unknown
			again := describeStagedMemberActivation(write, cut, query.executable, association)
			if candidate.bound.bindings[0].unknown == again.candidates[0].bound.bindings[0].unknown {
				t.Fatal("returned bound slice aliases original association")
			}
			wrong := association
			wrong.invocation.actuals = append([]sourceRelativeActual(nil), association.invocation.actuals...)
			wrong.invocation.actuals[0].expression = reader
			invalid := describeStagedMemberActivation(write, cut, query.executable, wrong)
			if !invalid.candidates[0].incomplete || invalid.candidates[0].delivered || invalid.candidates[0].sourceDescribed {
				t.Fatal("wrong original vector admitted")
			}
			wrong = association
			wrong.invocation.cut.reading = nil
			invalid = describeStagedMemberActivation(write, cut, query.executable, wrong)
			if !invalid.candidates[0].incomplete {
				t.Fatal("wrong original cut admitted")
			}
		})
	}
}

func TestStagedMemberActivationModuleAndPriorState(t *testing.T) {
	const fixture = `const box={run:()=>1};function install(){box.run=()=>2}const before=box.run;install();const after=box.run;export function invoke(){return box.run()}`
	withSourceCalleeWriteQuery(t, fixture, func(query *sourceValueQuery, reader *ast.Node) {
		var write, before, after *ast.Node
		walkNode(ast.GetSourceFileOfNode(reader).AsNode(), func(node *ast.Node) bool {
			if ast.IsBinaryExpression(node) && node.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
				write = node
			}
			if ast.IsVariableDeclaration(node) && node.Name() != nil {
				switch node.Name().Text() {
				case "before":
					before = node.Initializer()
				case "after":
					after = node.Initializer()
				}
			}
			return true
		})
		for _, row := range []struct {
			read   *ast.Node
			before bool
		}{{before, false}, {after, true}, {reader, false}} {
			result := describeStagedMemberActivation(write, sourceRelativeCut{operation: row.read, reading: row.read}, query.executable)
			if len(result.candidates) != 1 || result.candidates[0].moduleBeforeRead != row.before || !result.incomplete || !result.candidates[0].incomplete {
				t.Fatal("module source order became activation or function prior state was pruned")
			}
		}
	})
}

func TestStagedMemberActivationEmptyDoesNotMeanInactive(t *testing.T) {
	const fixture = `const box={run:()=>1};function neverCalled(){box.run=()=>2}export function invoke(){return box.run()}`
	withSourceCalleeWriteQuery(t, fixture, func(query *sourceValueQuery, reader *ast.Node) {
		var write *ast.Node
		walkNode(ast.GetSourceFileOfNode(reader).AsNode(), func(node *ast.Node) bool {
			if ast.IsBinaryExpression(node) && node.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
				write = node
			}
			return true
		})
		result := describeStagedMemberActivation(write, query.relativeInputCut(reader), query.executable)
		if !result.incomplete || len(result.candidates) != 0 || !result.priorInvocationState {
			t.Fatal("empty/private source inventory inferred inactive writer")
		}
	})
}

// Computed names belong to their original evaluation region rather than the
// method body whose syntax contains them. The indexed owner is canonical.
func TestStagedMemberActivationCanonicalOccurrenceRegion(t *testing.T) {
	for _, fixture := range []string{
		`const box={run:()=>1};const object={[(box.run=()=>2,'method')](){}};export function invoke(){return box.run()}`,
		`const box={run:()=>1};export function invoke(){const object={[(box.run=()=>2,'method')](){}};return box.run()}`,
	} {
		withSourceCalleeWriteQuery(t, fixture, func(query *sourceValueQuery, reader *ast.Node) {
			var write *ast.Node
			file := ast.GetSourceFileOfNode(reader)
			walkNode(file.AsNode(), func(node *ast.Node) bool {
				if ast.IsBinaryExpression(node) && node.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
					write = node
				}
				return true
			})
			index := query.owner.index(file)
			occurrence := index.normalOccurrences[write]
			if occurrence == nil {
				t.Fatal("canonical original write occurrence missing")
			}
			result := describeStagedMemberActivation(write, query.relativeInputCut(reader), query.executable)
			if !result.incomplete || result.region != occurrence.region || result.moduleWriter != (occurrence.region == nil) {
				t.Fatal("computed name borrowed deferred method owner")
			}
			original := index.normalOccurrences[write]
			delete(index.normalOccurrences, write)
			defer func() { index.normalOccurrences[write] = original }()
			unsupported := describeStagedMemberActivation(write, query.relativeInputCut(reader), query.executable)
			if !unsupported.incomplete || unsupported.region != nil || unsupported.moduleWriter || len(unsupported.candidates) != 0 {
				t.Fatal("missing original occurrence fabricated ownership")
			}
			index.normalOccurrences[write] = original
		})
	}
}
