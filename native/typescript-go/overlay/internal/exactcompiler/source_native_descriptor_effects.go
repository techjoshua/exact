package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

type sourceNativeDescriptorKind uint8

const (
	sourceStandardPromiseEntry sourceNativeDescriptorKind = iota + 1
	sourceStandardPromisePrototype
	sourceStandardObjectEntry
	sourceStandardObjectDefineProperty
	sourceStandardObjectFreeze
	sourceStandardLibraryMethodData
)

type sourceNativeDescriptorEffect struct {
	acquired *ast.Node
	kind     sourceNativeDescriptorKind
	verdict  sourceWriteVerdict
}

// standardNativeDataSlot is an explicit standard-entry descriptor premise. It
// applies to these own data slots only. Value identity never supplies this law.
// The member owner must still classify replacement and interference alternatives.
func standardNativeDataSlot(value sourceValue, key string) sourceNativeDescriptorKind {
	if value.native == nil {
		return 0
	}
	if value.native.kind == sourceNativeGlobalObject && key == "Promise" {
		return sourceStandardPromiseEntry
	}
	if value.native.kind == sourceNativeGlobalObject && key == "Object" {
		return sourceStandardObjectEntry
	}
	if value.native.kind == sourceNativeObjectConstructor && key == "freeze" {
		return sourceStandardObjectFreeze
	}
	if value.native.kind == sourceNativeObjectConstructor && key == "defineProperty" {
		return sourceStandardObjectDefineProperty
	}
	if value.native.kind == sourceNativeObjectConstructor && (key == "create" || key == "defineProperties" || key == "getOwnPropertyDescriptor") || value.native.kind == sourceNativeReflectObject && key == "defineProperty" || value.native.kind == sourceNativeSymbolConstructor && key == "for" {
		return sourceStandardLibraryMethodData
	}
	if value.native.kind == sourceNativePromiseConstructor && key == "prototype" {
		return sourceStandardPromisePrototype
	}
	return 0
}

// nativeGetWriteEffect consumes the standard entry and member descriptor
// components produced by the actual nested acquisition. The reflective callee
// Get is separate from its later mutation Call. No implicit read is repeated.
func (query *sourceValueQuery) nativeGetWriteEffect(node *ast.Node, result *accessorCandidates) sourceWriteVerdict {
	if result.opaque || result.receiverIncomplete || result.valueIncomplete || result.ownOperation || len(result.values) == 0 {
		return sourceWriteTop
	}
	var acquired *ast.Node
	entry, prototype, objectEntry, defineProperty, freeze := false, false, false, false, false
	for _, component := range result.nativeDescriptorEffects {
		if !query.charge(result, node) {
			return sourceWriteTop
		}
		if component.acquired == nil || component.verdict != sourceWriteNoWrites {
			return sourceWriteTop
		}
		if acquired == nil {
			acquired = component.acquired
		}
		if acquired != component.acquired {
			return sourceWriteTop
		}
		switch component.kind {
		case sourceStandardPromiseEntry:
			entry = true
		case sourceStandardPromisePrototype:
			prototype = true
		case sourceStandardObjectEntry:
			objectEntry = true
		case sourceStandardObjectDefineProperty:
			defineProperty = true
		case sourceStandardObjectFreeze:
			freeze = true
		default:
			return sourceWriteTop
		}
	}
	promise := entry && prototype && !objectEntry && !defineProperty && !freeze
	reflective := objectEntry && (defineProperty != freeze) && !entry && !prototype
	if !promise && !reflective {
		return sourceWriteTop
	}
	for _, value := range result.values {
		if !query.charge(result, node) {
			return sourceWriteTop
		}
		expected := sourceNativePromisePrototype
		if reflective {
			expected = sourceNativeObjectDefineProperty
			if freeze {
				expected = sourceNativeObjectFreeze
			}
		}
		if value.native == nil || value.native.kind != expected || value.native.acquired != acquired || value.native.referencesIncomplete {
			return sourceWriteTop
		}
	}
	var receiver *ast.Node
	var key sourceKeySelection
	if ast.IsPropertyAccessExpression(node) {
		receiver = node.AsPropertyAccessExpression().Expression
		key = sourceKeySelection{name: node.AsPropertyAccessExpression().Name().Text(), resolved: true}
	} else if ast.IsElementAccessExpression(node) {
		receiver = node.AsElementAccessExpression().Expression
		key = sourceMemberKey(node.AsElementAccessExpression().ArgumentExpression)
	}
	expectedKey := "prototype"
	if reflective {
		expectedKey = "defineProperty"
		if freeze {
			expectedKey = "freeze"
		}
	}
	if unwrapSourceCallableReference(receiver) != acquired || !key.resolved || key.name != expectedKey {
		return sourceWriteTop
	}
	return sourceWriteNoWrites
}

func (query *sourceValueQuery) normalDescriptorSources(sources []*ast.SourceFile, at *ast.Node, result *accessorCandidates) bool {
	view := query.propertyView()
	if view == nil || view.incomplete || !view.normalSelectionDone || view.normalIdentity == nil || len(sources) == 0 {
		return false
	}
	for _, source := range sources {
		if !query.charge(result, source.AsNode()) {
			return false
		}
		selected := view.normalSources[source]
		if selected == nil || selected.source != source || selected.cyclic || !query.normalDescriptorPrefix(selected, at, result) {
			return false
		}
	}
	for _, edge := range view.edges {
		if !query.charge(result, edge.edge) {
			return false
		}
		switch edge.state {
		case sourceDependencyErased:
			if edge.source != nil || edge.target != nil {
				return false
			}
		case sourceDependencyAvailable:
			if edge.source == nil || edge.target == nil || edge.target != view.normalSources[edge.source] || edge.target.source != edge.source || edge.target.cyclic {
				return false
			}
		default:
			return false
		}
	}
	return true
}
