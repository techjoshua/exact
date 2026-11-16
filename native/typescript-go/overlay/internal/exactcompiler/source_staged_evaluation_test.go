package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Source descriptions survive cloning, while event/Get publication belongs to
// the current graph. An unavailable original owner cannot authenticate a clone.
func TestStagedEvaluationGraphAndEnvelope(t *testing.T) {
	const source = `class Receiver{static [Symbol.hasInstance](_value:unknown){return true}}export function invoke(){return Object.freeze({})}`
	withStagedCreationProtocolMember(t, source, func(work *callableEffectWork, facts []callableFacts, parents []sourceStagedOperationRequest) {
		found := false
		for _, recipe := range work.operationRecipes {
			s := recipe.memberSource
			if s == nil || s.protocolSource == nil || s.protocolSource.evaluation == nil || s.protocolSource.evaluation.phase != "" {
				continue
			}
			found = true
			if !validStagedEvaluationRecipe(recipe) {
				t.Fatal("original evaluation envelope refused")
			}
			copy := recipe
			copy.memberSource = cloneStagedMemberSource(s)
			copy.memberSource.protocolSource.evaluation.phase = "invented"
			if validStagedEvaluationRecipe(copy) || s.protocolSource.evaluation.phase != "" {
				t.Fatal("phase retarget or clone mutation crossed source ownership")
			}
			copy.memberSource = cloneStagedMemberSource(s)
			copy.memberSource.protocolSource.evaluation.generation = nil
			if validStagedEvaluationRecipe(copy) {
				t.Fatal("missing event generation admitted")
			}
		}
		if !found {
			t.Fatal("actual original creation producer missing")
		}
		fresh := newCallableEffectWork(facts)
		fresh.operationGeneration = work.operationGeneration
		for _, parent := range parents {
			if !fresh.registerOperationUse(facts, sourceStagedOperationUse{request: parent}) {
				t.Fatal("source subscriber identity lost")
			}
		}
		fresh.prepareOperationUses(facts)
		closed := fresh.closedOperationDependencies()
		for _, parent := range parents {
			if closed[fresh.operationIDs[parent.producer].index] {
				t.Fatal("cached source description replaced current original event/Get owner")
			}
		}
	})
}

// Computed names share the source index's eager owner. The method body retains
// its own declaration and cannot be issued as part of the module creation.
func TestStagedOccurrenceComputedNameOwner(t *testing.T) {
	const source = `class Receiver{static [Symbol.hasInstance](_value:unknown){window.name;return true}}export function invoke(){return Object.freeze({})}`
	withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, _ *ast.Node) {
		file := ast.GetSourceFileOfNode(q.reading)
		index := q.owner.index(file)
		computed, body := false, false
		for node, occurrence := range index.normalOccurrences {
			if ast.IsComputedPropertyName(node) {
				module := sourceStagedModuleOwner(node)
				if occurrence.region != nil || module == nil || !sourceStagedOccurrenceOwned(node, module) || sourceStagedEvaluationOwner(node) != nil {
					t.Fatal("computed name borrowed its deferred method owner")
				}
				computed = true
			}
			if ast.IsPropertyAccessExpression(node) && node.Name().Text() == "name" {
				if occurrence.region == nil || sourceStagedEvaluationOwner(node) != occurrence.region || sourceStagedModuleOwner(node) != nil {
					t.Fatal("deferred body became module eager work")
				}
				body = true
			}
		}
		if !computed || !body {
			t.Fatal("original source boundary controls absent")
		}
	})
}

// Unmigrated source protocols do not turn registration into mandatory ordinary
// collector adoption. Their existing semantic owner remains available.
func TestStagedEvaluationPassiveUnsupportedCollection(t *testing.T) {
	const source = `class Base{}class Receiver extends Base{value(){return true}}export function invoke(){return true}`
	session := NewSession()
	response := session.Execute(Request{Kind: "compile", ID: "/virtual/passive-creation.ts", Source: source, Target: TargetServer, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
		t.Fatal(response.Error, response.Diagnostics)
	}
}
