package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

func TestCompactAccessorCandidateCopy(t *testing.T) {
	var original accessorCandidates
	event := sourceInstalledMemberEvent{live: true}
	if !event.observeInstalledMemberResult(&original) {
		t.Fatal("original result refused")
	}
	before := original
	reader := &ast.Node{}
	handoffs := event.result.editMemberHandoffs()
	handoffs.installedMemberReadings = append(handoffs.installedMemberReadings, sourceInstalledMemberRequirement{demand: sourceFieldDemand{operation: reader}})
	if before.handoffs != nil || event.result != &original {
		t.Fatal("first late write changed the snapshot or lost the original result")
	}
	populated := original
	handoffs = event.result.editMemberHandoffs()
	handoffs.installedMemberPending = append(handoffs.installedMemberPending, sourceInstalledMemberPending{})
	handoffs.installedMemberReadings = append(handoffs.installedMemberReadings, sourceInstalledMemberRequirement{})
	if len(populated.memberHandoffs().installedMemberReadings) != 1 ||
		len(populated.memberHandoffs().installedMemberPending) != 0 ||
		len(original.memberHandoffs().installedMemberReadings) != 2 ||
		len(original.memberHandoffs().installedMemberPending) != 1 {
		t.Fatal("late writes changed the copied slice headers or were lost")
	}
	if populated.memberHandoffs().installedMemberReadings[0].demand.operation != reader {
		t.Fatal("copy lost original reading")
	}
}
