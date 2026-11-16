package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The original enclosing assignment must consume the genuine unary operation,
// with separate Get/numeric/Set phases. A fabricated RHS assignment or a normal
// updated value would not satisfy these original identity/dependency assertions.
func TestOriginalSetterUpdateEffectsConsumer(t *testing.T) {
	withOriginalSetEffectsCollector(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		parent := originalSetEffectsRoot(t, file, work)
		var update, enclosing *sourceStagedAssignment
		for _, recipe := range work.operationRecipes {
			source := recipe.assignment
			if source == nil || source.phase != "" || source.sourceInput.parent.use != parent.use {
				continue
			}
			switch sourceText(file, source.root.use) {
			case "++captured.count":
				update = source
			case "this.field=++captured.count":
				enclosing = source
			}
		}
		if update == nil || enclosing == nil {
			t.Fatal("original SOURCE-purpose update/enclosing assignment not registered")
		}
		rhs := work.operationRecipes[stagedAssignmentRequest(enclosing.root, "rhs").producer]
		if !rhs.delta.extracted || len(rhs.delta.required) != 1 || !sameOperationRequest(rhs.delta.required[0], update.root) {
			t.Fatal("original enclosing unary RHS Effects not supplied by its genuine update owner")
		}
		id, adopted := work.operationIDs[update.root.producer]
		if !adopted {
			t.Fatal("original update Effects consumer not entered")
		}
		closed := work.closedOperationDependencies()
		if !closed[id.index] {
			t.Fatal("original update Get/numeric/conditional Set contribution remains unpaid")
		}
		for _, phase := range stagedUpdatePhases {
			request := stagedAssignmentRequest(update.root, phase)
			phaseID, issued := work.operationIDs[request.producer]
			if !issued {
				t.Fatal("original update phase unentered", phase)
			}
			state := &work.operations[phaseID.index]
			subscriber := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
			if !state.delta.extracted || subscriber == nil || subscriber.blocked || subscriber.applied != state.revision || !closed[phaseID.index] {
				t.Fatal("original update phase not consumed/closed", phase)
			}
			if len(state.delta.exposures) != 0 || len(state.delta.invoked) != 0 {
				t.Fatal("Effects-only update supplied a normal value or invocation", phase)
			}
		}
		for _, phase := range []string{"get", "numeric"} {
			recipe := work.operationRecipes[stagedAssignmentRequest(update.root, phase).producer]
			target := stagedAssignmentTarget(update.root.use)
			if len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], stagedGetResultRequest(target, update.root.consumer, "effects", nil)) {
				t.Fatal("update lost its original operand Get Effects", phase)
			}
		}
		// SOURCE-specific receiver knowledge must not close the generic BODY Set.
		generic := sourceStagedOperationKey{declaration: enclosing.root.consumer, operation: enclosing.root.use, kind: relativeDemandEffects}
		if work.operationRecipes[generic].assignment != nil && work.operationRecipes[generic].assignment.sourceInput.parent.use != nil {
			t.Fatal("per-use SOURCE input leaked into generic BODY assignment")
		}
		if data, known := work.stagedCallResultData(stagedGetResultRequest(stagedAssignmentTarget(update.root.use), update.root.consumer, "value", nil)); known && (data.delta.extracted || len(data.delta.exposures) != 0) {
			t.Fatal("numeric update loaned an unpaid normal operand value")
		}
	})
}

func TestNumericUpdateEffectsSiblings(t *testing.T) {
	for _, row := range []struct{ name, source, operation string }{
		{"prefixPlus", `export function invoke(){const box={count:0,field:0};box.field=++box.count;return box.field}`, "++box.count"},
		{"postfixPlus", `export function invoke(){const box={count:0,field:0};box.field=box.count++;return box.field}`, "box.count++"},
		{"prefixMinus", `export function invoke(){const box={count:0,field:0};box.field=--box["count"];return box.field}`, `--box["count"]`},
		{"postfixMinus", `export function invoke(){const box={count:0,field:0};box.field=box["count"]--;return box.field}`, `box["count"]--`},
	} {
		t.Run(row.name, func(t *testing.T) {
			withOriginalSetEffectsCollector(t, row.source, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
				found := false
				for key, recipe := range work.operationRecipes {
					source := recipe.assignment
					if source == nil || source.phase != "" || source.sourceInput.parent.use != nil || sourceText(file, source.root.use) != row.operation {
						continue
					}
					found = true
					id, adopted := work.operationIDs[key]
					if !adopted || !work.closedOperationDependencies()[id.index] {
						t.Fatal("authored numeric update Effects not consumed", row.name)
					}
					if len(recipe.delta.required) != len(stagedUpdatePhases) || len(recipe.delta.exposures) != 0 {
						t.Fatal("update phase/result contract changed")
					}
				}
				if !found {
					t.Fatal("original update operation absent")
				}
			})
		})
	}
}

func TestNumericUpdateEffectsRefusers(t *testing.T) {
	for _, row := range []struct{ name, source string }{
		{"unknownReceiver", `export function invoke(other:{count:number}){const box={field:0};box.field=++other.count}`},
		{"setterInput", `export function invoke(){const box={field:0,get count():number{throw 9},set count(next:number){window.alert(next)}};box.field=++box.count}`},
	} {
		t.Run(row.name, func(t *testing.T) {
			withOriginalSetEffectsCollector(t, row.source, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
				found := false
				for key, recipe := range work.operationRecipes {
					source := recipe.assignment
					if source == nil || source.phase != "" || !checkedNumericUpdate(source.root.use, owner) {
						continue
					}
					found = true
					if id, adopted := work.operationIDs[key]; adopted && work.closedOperationDependencies()[id.index] {
						t.Fatal("unpaid receiver or authored setter input completed update Effects")
					}
					for _, fact := range facts {
						for _, call := range fact.staged.calls {
							if call.invocation.operation == source.root.use && call.inputs != nil && call.inputs.delivered {
								t.Fatal("update fabricated delivered setter input B")
							}
						}
					}
				}
				if !found {
					t.Fatal("original negative update owner absent")
				}
			})
		})
	}
}
