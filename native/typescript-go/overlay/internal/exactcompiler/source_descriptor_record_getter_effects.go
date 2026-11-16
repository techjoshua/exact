package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// descriptorRecordGetterEffectsBody is an Effects-only admission for the actual
// installed getter selected by a returned-record Get. It neither exports that
// function as DATA nor interprets its return. Dormant nested functions need no
// closure/capture materialization until an independent source Call consumes them.
func (work *callableEffectWork) descriptorRecordGetterEffectsBody(demand sourceStagedFieldEffectsDemand, body *ast.Node, owner *executableBodyOwner) bool {
	reader := work.operationRecipes[demand.request.producer]
	if !validDescriptorRecordGetRecipe(reader) || reader.memberSource.generation != work.operationGeneration || !sameOperationRequest(reader.memberSource.request, demand.request) || body == nil || owner == nil || owner.values == nil || owner.values.program == nil || owner.checker == nil || work.operationGeneration == nil || owner.values.generation != work.operationGeneration || owner.values.program != work.operationGeneration.program || owner.checker != work.operationGeneration.checker || (!ast.IsArrowFunction(body) && !ast.IsFunctionExpression(body)) || len(body.Parameters()) != 0 || body.Body() == nil {
		return false
	}
	file := ast.GetSourceFileOfNode(body)
	if file == nil || owner.values.program.GetSourceFile(file.FileName()) != file {
		return false
	}
	if async, ordinary := ordinaryResultCategory(body); async || !ordinary {
		return false
	}
	if selected, known := owner.body(body); known && selected != body {
		return false
	}
	independent := true
	walkNode(body.Body(), func(reference *ast.Node) bool {
		if ast.IsArrowFunction(reference) || ast.IsFunctionExpression(reference) || ast.IsFunctionDeclaration(reference) {
			if ast.HasDecorators(reference) {
				independent = false
			}
			return false // Only these ordinary function creations have dormant children.
		}
		if ast.IsFunctionLike(reference) || ast.IsClassDeclaration(reference) || ast.IsClassExpression(reference) {
			// Methods/accessors/classes may evaluate computed names, decorators,
			// heritage or static work at creation. This bounded admission refuses
			// them rather than skipping those evaluated children as a body.
			independent = false
			return false
		}
		if reference.Kind == ast.KindThisKeyword || reference.Kind == ast.KindSuperKeyword || ast.IsMetaProperty(reference) {
			independent = false
			return false
		}
		if ast.IsIdentifier(reference) && !ast.IsDeclarationName(reference) && !isStaticPropertyName(reference) {
			symbol := owner.checker.GetSymbolAtLocation(reference)
			if symbol == nil || symbol.ValueDeclaration == nil || !ast.GetSourceFileOfNode(symbol.ValueDeclaration).IsDeclarationFile {
				independent = false
			}
		}
		return true
	})
	return independent
}
