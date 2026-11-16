package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// These are supplied-event reducer controls on real source nodes, not evidence
// of live source semantic admission, import execution or a no-user-entry law.
func withModuleActivationReducerSource(t *testing.T, check func(sourceStagedModuleActivationRequest, *ast.Node, *ast.Node)) {
	t.Helper()
	withSourceCalleeWriteQuery(t, `const before=1;const value=Symbol.for('key');export function invoke(){return Object.freeze({})}`, func(query *sourceValueQuery, functionCall *ast.Node) {
		file := ast.GetSourceFileOfNode(functionCall)
		var call, prior *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsVariableDeclaration(node) && node.Name() != nil && node.Name().Text() == "before" {
				prior = node.Initializer()
			}
			if ast.IsCallExpression(node) && node.Expression() != nil && ast.IsPropertyAccessExpression(node.Expression()) && node.Expression().Name().Text() == "for" {
				call = node
			}
			return true
		})
		if call == nil || prior == nil {
			t.Fatal("original module nodes missing")
		}
		declaration := sourceStagedModuleOwner(call)
		request := sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}, consumer: declaration, use: call, edge: "module-reducer-control", cut: sourceRelativeCut{operation: call, use: call, reading: call}}
		read := call.Expression()
		source := sourceStagedModuleActivationRequest{request: request, root: file.AsNode(), read: read, cut: sourceRelativeCut{operation: read, reading: read}, generation: query.owner.generation}
		check(source, prior, functionCall)
	})
}

func TestStagedModuleActivationReducerBoundaryAndRequirements(t *testing.T) {
	withModuleActivationReducerSource(t, func(source sourceStagedModuleActivationRequest, prior, functionCall *ast.Node) {
		imported := source.request
		imported.edge = "selected-import"
		child := source.request
		child.edge = "event-child"
		events := []sourceNormalDemand{{node: prior}, {node: source.read, fold: &sourceNormalFold{node: source.read}}, {node: source.read, phase: &sourceNormalPhase{node: source.read}}, {node: source.read, operand: &sourceNormalOperand{node: source.read}}, {node: source.read}, {node: functionCall}}
		visited := 0
		result, valid := reduceStagedModuleActivation(source, events, []sourceStagedModuleEntryContribution{{required: []sourceStagedOperationRequest{imported}, accounted: true}}, func(event sourceNormalDemand) (sourceStagedModuleEntryContribution, bool) {
			visited++
			return sourceStagedModuleEntryContribution{required: []sourceStagedOperationRequest{child}, accounted: true}, true
		})
		if !valid || !result.supported || !result.accounted || visited != 4 || len(result.required) != 5 || result.required[0].edge != "selected-import" {
			t.Fatal("module prefix boundary/import order/local accounting lost")
		}
		// A required child remains required even though this local law is accounted.
		child.edge = "mutated"
		if result.required[1].edge != "event-child" {
			t.Fatal("required source prefix aliased mapper storage")
		}
		if result.source.cut != source.cut || result.source.request.cut != source.request.cut {
			t.Fatal("graph and physical observation cuts conflated")
		}
		full := source
		full.root = source.request.producer.declaration
		full.read = nil
		fullEvents := []sourceNormalDemand{{node: full.root, visitOnly: true}}
		fullResult, valid := reduceStagedModuleActivation(full, fullEvents, nil, func(sourceNormalDemand) (sourceStagedModuleEntryContribution, bool) {
			return sourceStagedModuleEntryContribution{accounted: true}, true
		})
		if !valid || !fullResult.accounted {
			t.Fatal("exact original full partition refused")
		}
	})
}

func TestStagedModuleActivationReducerPreservesAuthorizedPrefixes(t *testing.T) {
	withModuleActivationReducerSource(t, func(source sourceStagedModuleActivationRequest, prior, _ *ast.Node) {
		events := []sourceNormalDemand{{node: prior}, {node: prior, phase: &sourceNormalPhase{node: prior}}, {node: prior, visitOnly: true}, {node: source.read}}
		for _, unauthorized := range []bool{false, true} {
			calls := 0
			result, valid := reduceStagedModuleActivation(source, events, nil, func(sourceNormalDemand) (sourceStagedModuleEntryContribution, bool) {
				calls++
				request := source.request
				request.edge = "accepted"
				if calls == 2 {
					request.edge = "refused"
				}
				return sourceStagedModuleEntryContribution{required: []sourceStagedOperationRequest{request}, accounted: calls != 2}, !(unauthorized && calls == 2)
			})
			want := 3
			if unauthorized {
				want = 2
			}
			if !valid || result.accounted || result.supported == unauthorized || calls != 3 || len(result.required) != want {
				t.Fatal("mapper authorization/local accounting conflated or known prefix lost")
			}
			for _, request := range result.required {
				if unauthorized && request.edge == "refused" {
					t.Fatal("unauthorized prefix retained")
				}
			}
		}
		result, valid := reduceStagedModuleActivation(source, events, []sourceStagedModuleEntryContribution{{accounted: false}}, func(sourceNormalDemand) (sourceStagedModuleEntryContribution, bool) {
			return sourceStagedModuleEntryContribution{accounted: true}, true
		})
		if !valid || !result.supported || result.accounted {
			t.Fatal("import availability or later event erased missing import law")
		}
		result, valid = reduceStagedModuleActivation(source, events, nil, nil)
		if !valid || result.supported || result.accounted {
			t.Fatal("event shape supplied semantic accounting")
		}
	})
}

func TestStagedModuleActivationReducerInvalidAssociations(t *testing.T) {
	withModuleActivationReducerSource(t, func(source sourceStagedModuleActivationRequest, prior, functionCall *ast.Node) {
		events := []sourceNormalDemand{{node: prior}, {node: source.read}}
		for _, change := range []func(*sourceStagedModuleActivationRequest){
			func(s *sourceStagedModuleActivationRequest) { s.generation = nil },
			func(s *sourceStagedModuleActivationRequest) { s.root = enclosingCallableNode(functionCall) },
			func(s *sourceStagedModuleActivationRequest) { s.read = functionCall },
			func(s *sourceStagedModuleActivationRequest) { s.cut.reading = nil },
			func(s *sourceStagedModuleActivationRequest) {
				s.cut.operation = functionCall
				s.cut.reading = functionCall
			},
			func(s *sourceStagedModuleActivationRequest) { s.read = nil },
		} {
			wrong := source
			change(&wrong)
			if _, valid := reduceStagedModuleActivation(wrong, events, nil, nil); valid {
				t.Fatal("function/missing module source association admitted")
			}
		}
		if _, valid := reduceStagedModuleActivation(source, events[:1], nil, nil); valid {
			t.Fatal("missing original read stop admitted")
		}
	})
}
