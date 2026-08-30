package exactcompiler

import "strings"

// ArtifactStructure reports target-local native execution coverage independently from timings.
// Explicit foreign and test boundary classification remains a build-harness responsibility because
// the compiler sees only the target artifact it is asked to emit.
type ArtifactStructure struct {
	NativeComponents              int            `json:"nativeComponents"`
	TargetArtifacts               int            `json:"targetArtifacts"`
	DeclinedNativeJSXRegions      int            `json:"declinedNativeJsxRegions"`
	FallbackBearingArtifacts      int            `json:"fallbackBearingArtifacts"`
	GenericNativeBindingGroups    int            `json:"genericNativeBindingGroups"`
	GenericNativeRendererImports  int            `json:"genericNativeRendererImports"`
	GenericNativeSSRImports       int            `json:"genericNativeSsrImports"`
	RuntimeCreatedNativeArtifacts int            `json:"runtimeCreatedNativeArtifacts"`
	ParentOwnedChildDirtyRouting  int            `json:"parentOwnedChildDirtyRouting"`
	DeclinedNativeJSXReasons      map[string]int `json:"declinedNativeJsxReasons,omitempty"`
	GenericNativeBindingReasons   map[string]int `json:"genericNativeBindingReasons,omitempty"`
	GenericNativeRendererReasons  map[string]int `json:"genericNativeRendererReasons,omitempty"`
}

// RecordEmittedGenericNativeExecution derives structural evidence from the final target output.
// Lowering-owned counters alone are insufficient because authored helper calls and package source
// can survive target projection without passing through a compiler helper selector.
func (structure *ArtifactStructure) RecordEmittedGenericNativeExecution(code string) {
	for _, operation := range []string{
		"createVNode(",
		"createCellVNode(",
		"isVNode(",
	} {
		count := strings.Count(code, operation)
		if count == 0 {
			continue
		}
		structure.GenericNativeRendererImports += count
		if structure.GenericNativeRendererReasons == nil {
			structure.GenericNativeRendererReasons = make(map[string]int)
		}
		structure.GenericNativeRendererReasons[strings.TrimSuffix(operation, "(")] += count
	}
}
