package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// observeRequestedNativeInputInvocation renews an existing source description
// only inside its adopted writer-source task. The selected algorithm event and
// complete original Get issue the law; its immutable blueprint cannot do so.
// No argument-order lease, descendant traversal or ordinary activation is used.
func (work *callableEffectWork) observeRequestedNativeInputInvocation(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	if !work.writerSourceTaskRunning(facts, id, owner) {
		return
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	if !validNativeInputInvocationRecipe(recipe) || work.nativeInputInvocationCurrent(recipe) {
		return
	}
	source := recipe.nativeGet
	caller, owned := work.memberNodes[source.request.consumer]
	call := source.request.producer.operation
	if !owned || caller < 0 || caller >= len(facts) || facts[caller].node != source.request.consumer || recipe.key.declaration != facts[caller].node || !stagedNativeInputSourceOwner(&facts[caller], call, owner) {
		return
	}
	file := ast.GetSourceFileOfNode(call)
	if file == nil || file != facts[caller].sourceFile || owner.values.program.GetSourceFile(file.FileName()) != file {
		return
	}
	request := sourceStagedNativeRequest{algorithmKind: source.kind, call: call, get: source.get, request: source.request}
	occurrence, visited := work.observeSelectedNativeGetSource(facts, caller, request, owner)
	if !visited || occurrence.source == nil || occurrence.callee == nil || !sameNativeGetSource(source, occurrence.source) || !validStagedNativeCalleeEffects(*occurrence.callee, occurrence.source) || occurrence.callee.generation != work.operationGeneration {
		return
	}
	// The shared Get owner pays its separately adopted ticket. This local law
	// still retains that Get and full Call without paying dependency closure.
	work.publishNativeInputInvocation(id)
}
