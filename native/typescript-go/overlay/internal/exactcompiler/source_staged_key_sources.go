package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedKeySource describes only a conditional primitive category at an
// original key expression. Its required producer retains callee/input Effects.
// It contains no symbol value, registry name, property identity or normal result.
// Graph consumers must register every required source before using the category.
type sourceStagedKeySource struct {
	expression *ast.Node
	binding    *ast.Node // Optional immutable module binding of an eager key; never a current category.
	producer   sourceStagedOperationRequest
	symbol     bool
}

// stagedPrimitiveKeySource follows original immutable lexical source relations,
// not acquired values or types. Module Call producers retain their own owner and
// cut. Formal coercions and written/captured alternatives need explicit source
// transport and are refused here instead of becoming runtime-unknown completion.
func (work *callableEffectWork) stagedPrimitiveKeySource(facts []callableFacts, expression, consumer *ast.Node, owner *executableBodyOwner) (sourceStagedKeySource, bool) {
	original := expression
	seen := make(map[*ast.Node]bool)
	for expression != nil && !seen[expression] {
		seen[expression] = true
		expression = unwrapSourceCallableReference(expression)
		if expression == nil || owner == nil || owner.values == nil || ast.GetSourceFileOfNode(expression) == nil {
			break
		}
		if sourcePrimitiveValue(expression) {
			return sourceStagedKeySource{expression: original}, true
		}
		if ast.IsIdentifier(expression) {
			symbol := owner.checker.GetSymbolAtLocation(expression)
			if symbol == nil || symbol.ValueDeclaration == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || owner.values.bindingWritten(symbol) {
				break
			}
			declaration := symbol.ValueDeclaration
			index := owner.values.index(ast.GetSourceFileOfNode(declaration))
			if index.incomplete || index.normalDynamicScope || !ast.IsVariableDeclaration(declaration) || declaration.Initializer() == nil {
				break
			}
			// Source relations cannot substitute another callable's local lifetime.
			if enclosingCallableNode(declaration) != nil && enclosingCallableNode(declaration) != consumer {
				break
			}
			expression = declaration.Initializer()
			continue
		}

		if ast.IsPropertyAccessExpression(expression) {
			declaration := sourceStagedEvaluationOwner(expression)
			if declaration == nil {
				declaration = sourceStagedModuleOwner(expression)
			}
			if index, known := work.memberNodes[declaration]; known && (declaration == consumer || runtimeModuleEvaluation(declaration)) && work.stageStandardDataGet(facts, index, expression, owner) {
				request := work.memberProtocolSources[expression]
				source := work.operationRecipes[request.producer].memberSource
				if source != nil && source.protocolSource != nil && source.protocolSource.get != nil && source.protocolSource.get.standardSymbolData {
					return sourceStagedKeySource{expression: original, producer: request, symbol: true}, true
				}
			}
			break
		}
		if ast.IsCallExpression(expression) {
			declaration := sourceStagedEvaluationOwner(expression)
			if declaration == nil {
				declaration = sourceStagedModuleOwner(expression)
			}
			index, known := work.memberNodes[declaration]
			if !known || declaration != consumer && !runtimeModuleEvaluation(declaration) {
				break
			}
			occurrence, described := work.describeNativeInputOccurrence(facts, index, expression, owner)
			if !described || occurrence.source == nil || occurrence.source.kind != sourceNativeSymbolFor {
				break
			}
			algorithm := work.operationRecipes[nativeRootDebtRequest(occurrence.source, "algorithm").producer]
			if algorithm.nativeGet == nil || algorithm.nativeGet.input == nil || !validStagedNativeInputPlan(*algorithm.nativeGet.input, algorithm.nativeGet) || !algorithm.nativeGet.inputEffects || !work.adoptNativeInputOccurrence(facts, occurrence) {
				break
			}
			return sourceStagedKeySource{expression: original, producer: occurrence.source.request, symbol: true}, true
		}
		break
	}
	return sourceStagedKeySource{}, false
}

// admitNativeSymbolInput runs solely in the live selected algorithm handoff.
// Symbol.for returns a symbol if this alternative returns. ToString and argument
// evaluation are independent obligations and cannot be paid by that category.
func (work *callableEffectWork) admitNativeSymbolInput(facts []callableFacts, source *sourceStagedNativeGetSource, selection sourceStagedNativeSelection, owner *executableBodyOwner) bool {
	plan, described := describeSelectedNativeSymbolInput(selection)
	if !described || !validStagedNativeInputPlan(plan, source) {
		return false
	}
	attached := *source
	attached.input = &plan
	// Literal conversion cannot call user hooks. Other original input protocols
	// remain pending until their separate coercion/Effects producer is attached.
	attached.coercions, attached.inputEffects = stagedStringInput(plan.input.expression, source, owner)
	for _, role := range []string{"algorithm", "eager-inputs"} {
		request := nativeRootDebtRequest(source, role)
		recipe, registered := work.operationRecipes[request.producer]
		if !registered || !sameNativeGetSource(recipe.nativeGet, source) {
			return false
		}
		recipe.nativeGet = &attached
		recipe.delta.extracted = role == "algorithm" || attached.inputEffects
		if role == "eager-inputs" && attached.inputEffects {
			for _, demand := range attached.coercions {
				recipe.delta.effects = append(recipe.delta.effects, relativeCoercionEffect(demand, facts[work.memberNodes[source.request.consumer]].summary.Name))
			}
		}
		if !work.admitNativeRootEffects(facts, recipe) {
			return false
		}
	}
	work.indexStagedNativeArgumentProtocol(work.operationRecipes[nativeRootDebtRequest(&attached, "eager-inputs").producer])
	return true
}

// stagedKeySourceRequest retains the producer's original module/function cut.
// Reading names the independently issued use. Its source association is sealed
// on that reader's recipe and checked by the shared required-delivery owner.
func stagedKeySourceRequest(reader *sourceStagedNativeGetSource, key sourceStagedKeySource) sourceStagedOperationRequest {
	request := key.producer
	request.consumer = reader.request.consumer
	request.reading = reader.request.producer
	request.reading.selector = sourceStagedOperationSelector{occurrence: key.expression, field: "key-source"}
	request.edge = fmt.Sprintf("%s:key-source:%d", reader.request.edge, key.expression.Pos())
	return request
}

func (work *callableEffectWork) validStagedKeySourceReading(producer sourceStagedOperationRecipe, request sourceStagedOperationRequest) bool {
	if work.validReflectiveKeyReading(producer, request) {
		return true
	}
	reading := request.reading
	if reading.kind != relativeDemandEffects || reading.selector.field != "key-source" || reading.selector.occurrence == nil || reading.declaration != request.consumer || producer.nativeGet == nil || producer.nativeGet.kind != sourceNativeSymbolFor {
		return false
	}
	reading.selector = sourceStagedOperationSelector{}
	reader, issued := work.operationRecipes[reading]
	if issued && reader.nativeGet != nil {
		base := reader.nativeGet
		reader = work.operationRecipes[nativeRootDebtRequest(base, "algorithm").producer]
		eager := work.operationRecipes[nativeRootDebtRequest(base, "eager-inputs").producer]
		if eager.nativeGet != nil && nativeEagerKeyDescription(eager.nativeGet, request.reading.selector.occurrence) != nil {
			reader = eager
		}
	}
	if !issued || reader.nativeGet == nil || !validNativeGetRecipe(reader) {
		return false
	}
	for _, key := range reader.nativeGet.keySources {
		if key.symbol && key.producer.producer == producer.key && sameOperationRequest(key.producer, producer.nativeGet.request) && sameOperationRequest(request, stagedKeySourceRequest(reader.nativeGet, key)) {
			return true
		}
	}
	return false
}

func stagedKeyRequirements(source *sourceStagedNativeGetSource) []sourceStagedOperationRequest {
	var required []sourceStagedOperationRequest
	for _, key := range source.keySources {
		if key.producer.producer.operation != nil {
			required = append(required, stagedKeySourceRequest(source, key))
		}
	}
	return required
}

// stagedSymbolKeyAt recognizes only a source relation already issued by the
// original selected producer. It never recovers a key value or compares keys.
func stagedSymbolKeyAt(source *sourceStagedNativeGetSource, expression *ast.Node) bool {
	if source == nil {
		return false
	}
	for _, key := range source.keySources {
		if key.expression == expression && key.symbol && key.producer.producer.operation != nil {
			return true
		}
	}
	return false
}

// stagedMapKeyInputs connects original computed-key sources to this map's eager
// input owner. It retains known key requirements when another creation operand
// is still unrepresented. No key names, equality or normal OwnKeys result follow.
func (work *callableEffectWork) stagedMapKeyInputs(facts []callableFacts, source *sourceStagedNativeGetSource, owner *executableBodyOwner) bool {
	if source == nil || source.descriptorMap == nil || owner == nil || !sourceInertValueCreation(source.descriptorMap.target.expression) {
		return false
	}
	group := source.descriptorMap.descriptors.expression
	if group == nil || !ast.IsObjectLiteralExpression(group) {
		return false
	}
	complete := true
	for _, member := range group.AsObjectLiteralExpression().Properties.Nodes {
		if member.Name() == nil || ast.IsSpreadAssignment(member) {
			complete = false
			continue
		}
		if ast.IsComputedPropertyName(member.Name()) {
			expression := member.Name().AsComputedPropertyName().Expression
			key, represented := work.stagedPrimitiveKeySource(facts, expression, source.request.consumer, owner)
			if !represented || !key.symbol {
				complete = false
			} else {
				source.keySources = append(source.keySources, key)
			}
		}
		switch {
		case ast.IsPropertyAssignment(member):
			complete = work.stagedCreationInputEffects(facts, source, member.AsPropertyAssignment().Initializer, owner) && complete
		case ast.IsMethodDeclaration(member), ast.IsGetAccessorDeclaration(member), ast.IsSetAccessorDeclaration(member):
		default:
			complete = false
		}
	}
	return complete
}
