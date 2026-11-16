package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This is an enrollment boundary, not primitive/result DATA or descriptor
// closure. The unchanged original Symbol positive owns those later gates.
func TestDescriptorAlgorithmOriginalInputEnvelope(t *testing.T) {
	withSymbolPrimitiveCollection(t, symbolPrimitiveModuleInput, func(collection *projectCallableCollection, file *ast.SourceFile) {
		caller, call, binding := descriptorAlgorithmInputFixture(t, file)
		work := &collection.work
		var found *sourceStagedOperationRecipe
		for _, candidate := range work.operationRecipes {
			if candidate.key.declaration != caller || candidate.key.operation != call || candidate.key.selector.field != "algorithm" || candidate.nativeGet == nil || candidate.nativeGet.descriptorRead == nil {
				continue
			}
			if found != nil {
				t.Fatal("multiple actual original descriptor algorithm recipes")
			}
			copy := candidate
			found = &copy
		}
		if found == nil {
			t.Fatal("original selected descriptor algorithm UNREACHED")
		}
		recipe := *found
		source := recipe.nativeGet
		if work.operationGeneration == nil || source.descriptorRead.generation != work.operationGeneration || source.get != call.Expression() || source.request.producer.operation != call || source.request.producer.declaration != caller || recipe.key != nativeRootDebtRequest(source, "algorithm").producer || !validDescriptorEffectsPhase(recipe) {
			t.Fatal("actual original descriptor phase/source association UNREACHED")
		}
		inputs, supported := descriptorInputRequirements(source.descriptorRead)
		if !supported || len(inputs) != 2 || len(recipe.delta.required) < 3 || !sameOperationRequest(recipe.delta.required[0], nativeRootDebtRequest(source, "callee-get")) || !sameOperationRequest(recipe.delta.required[1], inputs[0]) || !sameOperationRequest(recipe.delta.required[2], inputs[1]) {
			t.Fatal("exact original callee/two-input prefix UNREACHED")
		}
		if !validOperationEnvelope(recipe) {
			t.Fatal("genuine descriptor algorithm input prefix refused by envelope")
		}
		for i, request := range inputs {
			child, registered := work.operationRecipes[request.producer]
			id, adopted := work.operationIDs[request.producer]
			if !registered || child.callResult == nil || !sameOperationRequest(child.callResult.request, request) || !validStagedCallResultRecipe(child) || !validDescriptorAlgorithmInputRequirement(recipe, request) || !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operations[id.index].invalid {
				t.Fatalf("actual original input %d DATA recipe/adoption UNREACHED", i)
			}
			if source.descriptorRead.actuals[i].expression != request.producer.operation {
				t.Fatalf("input %d lost original argument read", i)
			}
			expectedBinding := binding
			if i == 0 {
				expectedBinding = caller.Parameters()[0]
			}
			if child.callResult.binding != expectedBinding {
				t.Fatalf("input %d lost formal/module binding owner", i)
			}
		}
		// Negative descriptions are never installed, adopted or published. They must
		// not borrow this genuine source event's exact membership or ownership.
		for _, row := range []struct {
			name   string
			change func(*sourceStagedOperationRequest)
		}{
			{"wrong-full-cut", func(r *sourceStagedOperationRequest) { r.cut.use = call }},
			{"foreign-consumer", func(r *sourceStagedOperationRequest) { r.consumer = binding }},
			{"input-edge", func(r *sourceStagedOperationRequest) { r.inputs = &sourceRelativeInputEdge{} }},
		} {
			t.Run(row.name, func(t *testing.T) {
				altered := recipe
				altered.delta = cloneOperationDelta(recipe.delta)
				row.change(&altered.delta.required[1])
				if validDescriptorAlgorithmInputRequirement(altered, altered.delta.required[1]) || validOperationEnvelope(altered) {
					t.Fatal("foreign input description gained algorithm/envelope membership")
				}
			})
		}
	})
}

// The fixture stays identical to the original public source control. These AST
// pointers select its actual source operation; they issue no operation or proof.
func descriptorAlgorithmInputFixture(t *testing.T, file *ast.SourceFile) (caller, call, binding *ast.Node) {
	t.Helper()
	for _, statement := range file.Statements.Nodes {
		if ast.IsVariableStatement(statement) {
			for _, declaration := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
				if declaration.Name() != nil && ast.IsIdentifier(declaration.Name()) && declaration.Name().Text() == "incompatibleTag" {
					binding = declaration
				}
			}
		}
		if !ast.IsFunctionDeclaration(statement) || statement.Name() == nil || statement.Name().Text() != "probe" || statement.Body() == nil {
			continue
		}
		caller = statement
		for _, node := range statement.Body().AsBlock().Statements.Nodes {
			if !ast.IsReturnStatement(node) {
				continue
			}
			expression := node.AsReturnStatement().Expression
			if expression == nil || !ast.IsBinaryExpression(expression) {
				continue
			}
			expression = expression.AsBinaryExpression().Left
			if ast.IsPropertyAccessExpression(expression) && ast.IsCallExpression(expression.Expression()) {
				call = expression.Expression()
			}
		}
	}
	if caller == nil || call == nil || binding == nil || len(caller.Parameters()) != 1 || len(call.AsCallExpression().Arguments.Nodes) != 2 {
		t.Fatal("unchanged original module/formal fixture association UNREACHED")
	}
	return
}
