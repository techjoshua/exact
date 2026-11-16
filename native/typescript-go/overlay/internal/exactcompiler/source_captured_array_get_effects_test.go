package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The unchanged original fixture must deliver an actual Get Effects contribution
// through its original consumer, including the captured read and member factory
// population. Normal Get output and invoking push are different owners.
func TestOriginalCapturedArrayMemberGetEffects(t *testing.T) {
	var expired func() bool
	withOriginalSetEffectsCollector(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		var request sourceStagedOperationRequest
		for _, recipe := range work.operationRecipes {
			s := recipe.callResult
			if s != nil && s.getResult != nil && s.getResult.role == "effects" && ast.IsSetAccessorDeclaration(s.declaration) && sourceText(file, s.request.use) == "events.push" {
				request = s.request
				break
			}
		}
		if request.use == nil {
			t.Fatal("ENTRY: original setter events.push Get Effects absent")
		}
		recipe := work.operationRecipes[request.producer]
		if !validStagedGetResultRecipe(recipe) || !recipe.delta.extracted || work.memberCoverageObserved[request.producer] != owner.values.generation {
			t.Fatal("original captured-array Get Effects contribution unpaid")
		}
		receiver := work.operationRecipes[stagedGetResultRequest(request.use, request.consumer, "receiver", nil).producer]
		captured := false
		for _, required := range receiver.delta.required {
			s := work.operationRecipes[required.producer].callResult
			if s != nil && s.capturedBinding != nil && s.capturedBinding.read == request.use.Expression() && s.capturedBinding.reader == request.consumer && s.capturedBinding.binding == s.binding && s.capturedBinding.lexical == enclosingCallableNode(request.consumer.Parent) && stagedEmptyArrayDataConstruction(s.binding.Initializer()) {
				captured = true
			}
		}
		coverage := false
		for _, required := range recipe.delta.required {
			s := work.operationRecipes[required.producer].memberSource
			if s != nil && s.coverage != nil && s.coverage.origin != nil && stagedEmptyArrayDataConstruction(s.coverage.origin) && s.parent.producer.operation == request.use && s.coverage.generation == owner.values.generation && s.coverage.cut == (sourceRelativeCut{operation: request.use, reading: request.use}) && work.memberCoverageObserved[required.producer] == owner.values.generation {
				coverage = true
			}
		}
		if !captured || !coverage {
			t.Fatalf("original captured-read/member-factory contribution missing: captured=%t coverage=%t", captured, coverage)
		}
		delivery, applied := work.stagedCallResultData(request)
		if !applied || !delivery.delta.extracted || delivery.revision == 0 {
			t.Fatal("original Get Effects consumer did not consume contribution")
		}
		value := work.operationRecipes[stagedGetResultRequest(request.use, request.consumer, "value", nil).producer]
		if value.delta.extracted || len(value.delta.exposures) != 0 {
			t.Fatal("Effects SOURCE granted normal array member value")
		}
		clones := make([]callableFacts, len(facts))
		for i := range facts {
			clones[i] = cloneProjectCallableFact(facts[i])
		}
		fresh := registerCallableEffectWork(clones)
		if _, accepted := fresh.stagedCallResultData(request); accepted || len(fresh.operationIDs) != 0 || fresh.memberCoverageObserved[request.producer] != nil {
			t.Fatal("fresh graph borrowed old Get delivery/coverage/current")
		}
		caller := work.memberNodes[request.consumer]
		expired = func() bool { return work.observeStagedLocalGetEffects(facts, caller, request.use, owner) }
	})
	if expired == nil || expired() {
		t.Fatal("expired generation renewed original array Get")
	}
}

// Refusal is about the actual receiver source, not an Array type assertion.
// The own-getter row has an eligible unwritten captured empty-array binding;
// descriptor work must remain beside the standard branch rather than disappear.
func TestCapturedArrayGetEffectsSourceRefusers(t *testing.T) {
	rows := []struct {
		name, source string
		eligible     bool
	}{
		{"written", `export function invoke(){let events:number[]=[];events=[];const box={set work(_next:number){events.push(1)}};function receiver(){return box}receiver().work=1}`, false},
		{"formal", `export function invoke(events:number[]){const box={set work(_next:number){events.push(1)}};function receiver(){return box}receiver().work=1}`, false},
		{"crossActivation", `function make(){const events:number[]=[];return function build(){return {set work(_next:number){events.push(1)}}}}export function invoke(){const build=make();const box=build();box.work=1}`, false},
		{"unpaidElements", `export function invoke(){function element(){return 1}const events=[element()];const box={set work(_next:number){events.push(1)}};function receiver(){return box}receiver().work=1}`, false},
		{"ownGetter", `export function invoke(){const events:number[]=[];Object.defineProperty(events,'push',{get(){throw 9}});const box={set work(_next:number){events.push(1)}};function receiver(){return box}receiver().work=1}`, true},
	}
	for _, row := range rows {
		t.Run(row.name, func(t *testing.T) {
			withOriginalSetEffectsCollector(t, row.source, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
				var get *ast.Node
				caller := -1
				for i := range facts {
					if !ast.IsSetAccessorDeclaration(facts[i].node) {
						continue
					}
					for _, node := range owner.values.summary(facts[i].node).nodes {
						if ast.IsPropertyAccessExpression(node) && sourceText(file, node) == "events.push" {
							get, caller = node, i
							break
						}
					}
				}
				if get == nil || caller < 0 {
					t.Fatal("ENTRY: real setter member read absent")
				}
				root, _ := work.capturedGetEffectsRoot(facts, caller, get, owner)
				if (root != nil) != row.eligible {
					t.Fatal("captured SOURCE eligibility differs from intended refusal boundary")
				}
				work.observeStagedLocalGetEffects(facts, caller, get, owner)
				request := stagedGetResultRequest(get, facts[caller].node, "effects", nil)
				if work.operationRecipes[request.producer].delta.extracted {
					t.Fatal("unsupported source/own getter lost mandatory work")
				}
			})
		})
	}
}
