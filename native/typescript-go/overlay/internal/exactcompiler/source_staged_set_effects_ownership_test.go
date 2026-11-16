package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"testing"
)

// Retained recipes do not lend a graph observation; expired Programs and copied
// source issuers cannot turn SOURCE accounting into current execution authority.
func TestOriginalSetEffectsSourceOwnership(t *testing.T) {
	var expired func() bool
	withOriginalSetEffectsCollector(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		root := originalSetEffectsRoot(t, file, work)
		original := work.operationRecipes[root.producer]
		if !work.passiveAssignmentSourceReady(original) {
			t.Fatal("original Set source owner did not issue its local receipt")
		}
		query := newSourceDependencyQuery(root.use, owner.checker, owner, root.consumer)
		if query.projectAssignmentSourceReceiver(root.use.AsBinaryExpression().Left.Expression(), accessorSet|accessorNoGet, &accessorCandidates{}, func(*ast.Node, []string, bool) { t.Fatal("missing issuer projected receiver") }) {
			t.Fatal("query without original Set issuer accepted SOURCE projection")
		}
		clones := make([]callableFacts, len(facts))
		for i := range facts {
			clones[i] = cloneProjectCallableFact(facts[i])
		}
		fresh := registerCallableEffectWork(clones)
		if fresh.passiveAssignmentSourceReady(original) || len(fresh.operationIDs) != 0 {
			t.Fatal("fresh graph inherited source receipt/current/APPLIED")
		}
		observation := work.assignmentObserved[root.producer]
		if observation == nil {
			t.Fatal("original source observation absent")
		}
		copied := *observation
		work.assignmentObserved[root.producer] = &copied
		if work.passiveAssignmentSourceReady(original) {
			t.Fatal("copied source issuer inherited local accounting")
		}
		work.assignmentObserved[root.producer] = observation
		if observation.effects == nil || !work.assignmentSourceEffectsCurrent(observation.effects) {
			t.Fatal("original SOURCE Effects dependency revisions were not consumed")
		}
		if fresh.assignmentSourceEffectsCurrent(observation.effects) {
			t.Fatal("fresh graph borrowed old source effects receipt")
		}
		copyReceipt := *observation.effects
		if work.assignmentSourceEffectsCurrent(&copyReceipt) {
			t.Fatal("copied SOURCE Effects receipt accepted")
		}
		expired = func() bool { return work.assignmentSourceEffectsCurrent(observation.effects) }
	})
	// The original issuer's generation is no longer active after this owner exits.
	if expired == nil || expired() {
		t.Fatal("expired original issuer retained SOURCE Effects currentness")
	}
}

// These are negative boundaries, not substitutes for the unchanged original
// positive fixture. Actual source publishers must keep an unpaid sibling beside
// known candidates and may not manufacture a current captured binding.
func TestSetEffectsSourceAlternativeRefusers(t *testing.T) {
	rows := []struct {
		name, source string
		known        bool
	}{
		{"knownBesideUnknown", `export function invoke(flag:boolean,other:{slot:number}){const sink={count:0};const box={set slot(_next:number){sink.count++}};function receiver(){if(flag)return box;return other}receiver().slot=1}`, true},
		{"writtenReceiverBinding", `export function invoke(){let box={slot:0};function receiver(){return box}box={slot:2};receiver().slot=1}`, false},
		{"savedCrossActivation", `function make(){const box={slot:0};return function receiver(){return box}}export function invoke(){const receiver=make();receiver().slot=1}`, false},
	}
	for _, row := range rows {
		t.Run(row.name, func(t *testing.T) {
			withOriginalSetEffectsCollector(t, row.source, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
				found, prefix := false, false
				for _, recipe := range work.operationRecipes {
					if recipe.assignment == nil || recipe.assignment.phase != "set" || sourceText(file, recipe.assignment.root.use) != "receiver().slot=1" {
						continue
					}
					found = true
					if recipe.delta.extracted || work.passiveAssignmentSourceReady(recipe) {
						t.Fatal("unpaid source alternative completed Set", row.name)
					}
					caller := work.memberNodes[recipe.assignment.root.consumer]
					for _, edge := range facts[caller].summary.Calls {
						prefix = prefix || strings.HasSuffix(edge.ID, ":source-effects")
					}
				}
				if !found {
					t.Fatal("original negative Set entry absent", row.name)
				}
				if row.known && !prefix {
					t.Fatal("unknown sibling discarded genuine known source supplier")
				}
			})
		})
	}
}
