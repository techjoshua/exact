package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedMapEntryRead is one conditional entry Get contribution, not a
// normal descriptor or completed field conversion. Missing creating captures
// remain an explicit binder gap beside the known getter/receiver relationship.
type sourceStagedMapEntryRead struct {
	request    sourceStagedOperationRequest
	entry      sourceStagedMapEntry
	descriptor sourceRelativeEndpoint
	getter     *ast.Node
	bound      sourceRelativeBoundInputs
	accounting sourceEffectAccounting
}

// stagedMapEntryRequest reserves a finite original member occurrence. It checks
// transport correlation only. Actual accepted source membership is query-local.
func stagedMapEntryRequest(source *sourceStagedNativeGetSource, entry sourceStagedMapEntry) (sourceStagedOperationRequest, bool) {
	if source == nil || source.request.inputs != nil || source.descriptorMap == nil || !validNativeDescriptorMapRecipe(sourceStagedOperationRecipe{key: source.descriptorMap.protocol.producer, nativeGet: source}) || entry.member == nil || entry.group == nil || !ast.IsObjectLiteralExpression(entry.group) || entry.member.Parent != entry.group || entry.ordinal < 0 || entry.ordinal >= len(entry.group.AsObjectLiteralExpression().Properties.Nodes) || entry.group.AsObjectLiteralExpression().Properties.Nodes[entry.ordinal] != entry.member || !sameOperationRequest(entry.request, source.descriptorMap.protocol) || !sameOperationEndpoint(entry.receiver, source.descriptorMap.descriptors) {
		return sourceStagedOperationRequest{}, false
	}
	return stagedMapEntrySourceRequest(entry), true
}

// Source transport only. The selected owner validates membership before this
// shared factory is used by entry readers and their implicit protocol children.
func stagedMapEntrySourceRequest(entry sourceStagedMapEntry) sourceStagedOperationRequest {
	request := entry.request
	request.producer.selector = sourceStagedOperationSelector{occurrence: entry.member, field: "descriptor-entry-get"}
	request.edge = fmt.Sprintf("%s:entry:%d", entry.request.edge, entry.member.Pos())
	return request
}

func cloneStagedMapEntry(entry sourceStagedMapEntry) sourceStagedMapEntry {
	entry.receiver = cloneSourceRelativeEndpoint(entry.receiver)
	entry.key = cloneSourceRelativeEndpoint(entry.key)
	entry.descriptor = cloneSourceRelativeEndpoint(entry.descriptor)
	return entry
}

func sameStagedMapEntry(a, b sourceStagedMapEntry) bool {
	return sameOperationRequest(a.request, b.request) && sameOperationEndpoint(a.receiver, b.receiver) && sameOperationEndpoint(a.key, b.key) && sameOperationEndpoint(a.descriptor, b.descriptor) && a.cut == b.cut && a.member == b.member && a.getter == b.getter && a.group == b.group && a.name == b.name && a.ordinal == b.ordinal && a.unmapped == b.unmapped
}

// consumeStagedMapEntrySource reads only a successfully published original
// source branch, after enumeration. Data transfers its original source endpoint
// without reacquiring an initializer. Getter B is real and detached, but neither
// binding nor publication evaluates its body or settles required field work.
func consumeStagedMapEntrySource(query *sourceValueQuery, source *sourceStagedNativeGetSource, entry sourceStagedMapEntry, request sourceStagedOperationRequest, publish func(sourceStagedMapEntryRead) bool) bool {
	expected, valid := stagedMapEntryRequest(source, entry)
	if !valid || query == nil || query.stagedMap == nil || query.traceModeKnown || publish == nil || !sameOperationRequest(request, expected) || !query.liveStagedMapObservation(query.stagedMap.get, accessorEnumerate|accessorNoGet) {
		return false
	}
	borrow := query.stagedMap
	accepted, member := borrow.accepted[entry.member]
	if !member || borrow.reading || !sameStagedMapEntry(accepted, entry) || !sameOperationRequest(borrow.request, source.descriptorMap.protocol) || entry.cut != borrow.cut {
		return false
	}
	borrow.reading = true
	defer func() { borrow.reading = false }()
	receipt := sourceStagedMapEntryRead{request: request, entry: cloneStagedMapEntry(entry), accounting: sourceEffectsAccounted}
	if entry.getter == nil {
		if entry.descriptor.expression == nil || !ast.IsPropertyAssignment(entry.member) && !ast.IsShorthandPropertyAssignment(entry.member) && !ast.IsMethodDeclaration(entry.member) {
			return false
		}
		receipt.descriptor = cloneSourceRelativeEndpoint(entry.descriptor)
	} else {
		getter := entry.getter
		if getter != entry.member || !ast.IsGetAccessorDeclaration(getter) || len(getter.Parameters()) != 0 {
			return false
		}
		result := accessorCandidates{}
		inputs := query.bindGetInputs(getter, borrow.operation, sourceValue{node: entry.group}, nil, &result)
		bound := sourceRelativeBoundInputs{declaration: getter, operation: borrow.operation, use: query.effectUse(), cut: query.relativeInputCut(borrow.operation)}
		if values := inputs.bindings[0]; len(values) == 1 && values[0].node == entry.group && len(values[0].path) == 0 {
			bound.bindings = []sourceRelativeBinding{{target: sourceRelativeRole{kind: relativeRoleReceiver, declaration: getter}, sources: []sourceRelativeEndpoint{{kind: relativeEndpointExpression, expression: entry.group, producer: borrow.operation, get: entry.member, cut: bound.cut}}}}
		} else {
			bound.unsupported = relativeInputsUnsupportedReceiver
		}
		groupOwner := enclosingCallableNode(entry.group)
		if groupOwner != nil && groupOwner != source.request.producer.declaration || stagedMapGetterCaptureGap(getter, query.owner) {
			bound.unsupported = relativeInputsUnsupportedCapture
		}
		if bound.unsupported != relativeInputsSupported || result.opaque || result.valueIncomplete || result.receiverIncomplete {
			receipt.accounting = sourceEffectsUnaccounted
		}
		receipt.getter = getter
		receipt.bound = cloneSourceRelativeBoundInputs(bound)
	}
	if !query.liveStagedMapObservation(borrow.get, accessorEnumerate|accessorNoGet) || query.stagedMap != borrow || query.traceModeKnown {
		return false
	}
	borrow.currentRead = &receipt
	defer func() {
		if borrow.currentRead == &receipt {
			borrow.currentRead = nil
		}
	}()
	if entry.getter == nil {
		// Generic source transport needs no graph service. An installed graph
		// service must succeed before this owner can reach its graph publisher.
		if borrow.entryCoverage != nil && !query.acquireOriginalMapEntryCoverage(borrow, &receipt) {
			return false // The graph's real C acquisition remains pending/refused.
		}
		if !query.liveStagedMapObservation(borrow.get, accessorEnumerate|accessorNoGet) || query.stagedMap != borrow || query.traceModeKnown || borrow.currentRead != &receipt {
			return false
		}
		query.observeStagedMapEntryLaw(borrow.get, entry.group, stagedMapOwnDataGetNoUserEntry)
		if !query.liveStagedMapObservation(borrow.get, accessorEnumerate|accessorNoGet) || query.stagedMap != borrow || query.traceModeKnown || borrow.currentRead != &receipt {
			return false
		}
	}
	acceptedReceipt := publish(receipt)
	return acceptedReceipt && query.stagedMap == borrow && query.liveStagedMapObservation(borrow.get, accessorEnumerate|accessorNoGet) && !query.traceModeKnown
}

// Captures need their creating owner. Syntax cannot manufacture an acquired
// scope for an outer formal/local, including captures in returned callables.
func stagedMapGetterCaptureGap(getter *ast.Node, owner *sourceValueOwner) bool {
	gap := false
	walkNode(getter.Body(), func(node *ast.Node) bool {
		if ast.IsPartOfTypeNode(node) {
			return false
		}
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) || isStaticPropertyName(node) {
			return true
		}
		symbol := owner.checker.GetSymbolAtLocation(node)
		if symbol == nil || symbol.ValueDeclaration == nil {
			gap = true
			return false
		}
		declaration := symbol.ValueDeclaration
		file := ast.GetSourceFileOfNode(declaration)
		ambient := ast.IsFunctionDeclaration(declaration) && declaration.Body() == nil && declaration.Parent != nil && ast.IsSourceFile(declaration.Parent)
		if !getter.Contains(declaration) && file != nil && !file.IsDeclarationFile && !ambient {
			gap = true
		}
		return !gap
	})
	return gap
}
