package exactcompiler

import "testing"

func TestArtifactStructureCountsGenericExecutionInFinalTargetOutput(t *testing.T) {
	structure := ArtifactStructure{}
	structure.RecordEmittedGenericNativeExecution(`
		const first = createVNode("main", null);
		const second = createCellVNode(createVNode(Component, null));
		if (isVNode(second)) consume(second);
	`)

	if structure.GenericNativeRendererImports != 4 {
		t.Fatalf("generic native renderer count = %d, want 4", structure.GenericNativeRendererImports)
	}
	for operation, expected := range map[string]int{
		"createVNode":     2,
		"createCellVNode": 1,
		"isVNode":         1,
	} {
		if actual := structure.GenericNativeRendererReasons[operation]; actual != expected {
			t.Fatalf("%s count = %d, want %d", operation, actual, expected)
		}
	}
}

func TestArtifactStructureDoesNotMistakeFocusedComponentOperationsForVNodes(t *testing.T) {
	structure := ArtifactStructure{}
	structure.RecordEmittedGenericNativeExecution(`
		const child = createCompiledComponentReceipt(artifact, props);
		applyCompiledComponentReceipt(owner, slot, child);
	`)

	if structure.GenericNativeRendererImports != 0 {
		t.Fatalf("focused component operations reported as generic execution: %#v", structure)
	}
}
