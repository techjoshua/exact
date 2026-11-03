package exactcompiler

import (
	"fmt"
	"strconv"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/nodebuilder"
)

type indexedStateRead struct {
	key      string
	slot     int
	typeNode *ast.Node
	scalar   bool
}

// indexStateReadSlots joins semantic state reads to the component's deterministic top-level
// storage layout once. Lowering consumes this proof directly instead of resolving property names
// again while emitting each expression.
func indexStateReadSlots(components []Component, reads []StateRead) map[string]indexedStateRead {
	slotsByComponent := make(map[string]map[string]int, len(components))
	for _, component := range components {
		slots := make(map[string]int, len(component.StateSlots))
		for index, key := range component.StateSlots {
			slots[key] = index
		}
		slotsByComponent[component.Name] = slots
	}
	result := make(map[string]indexedStateRead, len(reads))
	for _, read := range reads {
		if read.Confidence != "exact" || len(read.Path) != 1 {
			continue
		}
		slot, exists := slotsByComponent[read.Component][read.Path[0]]
		if !exists {
			continue
		}
		result[fmt.Sprintf("%d:%d", read.Start, read.Length)] = indexedStateRead{
			key: read.Path[0], slot: slot,
		}
	}
	return result
}

// indexStateWriteSlots selects canonical top-level writes whose component layout owns a stable
// numeric slot. A checker-proven alias of the complete state facade has the same indexed identity;
// nested aliases and dynamic writes retain the general path runtime.
func indexStateWriteSlots(components []Component, writes []StateWrite) map[string]int {
	slotsByComponent := make(map[string]map[string]int, len(components))
	for _, component := range components {
		slots := make(map[string]int, len(component.StateSlots))
		for index, key := range component.StateSlots {
			slots[key] = index
		}
		slotsByComponent[component.Name] = slots
	}
	result := make(map[string]int, len(writes))
	for _, write := range writes {
		if write.RootDepth != 0 || len(write.Path) != 1 || write.DynamicSegments[0] != nil {
			continue
		}
		if slot, exists := slotsByComponent[write.Component][write.Path[0]]; exists {
			result[fmt.Sprintf("%d:%d", write.Start, write.Length)] = slot
		}
	}
	return result
}

// lowerIndexedStateRead emits the compiler-only numeric access lane while retaining enough
// semantic identity for the render-program planner to select its dirty-mask update path.
func (lowering *jsxLowering) lowerIndexedStateRead(node *ast.Node) *ast.Node {
	if indexedMemberNeedsReference(node) {
		return nil
	}
	read, exists := lowering.stateReadSlots[nodeSpanKey(node)]
	if !exists {
		return nil
	}
	receiver := directStateReadReceiver(node)
	if receiver == nil {
		return nil
	}
	call := lowering.call(lowering.names.readState, []*ast.Node{
		lowering.visitor.VisitNode(receiver),
		lowering.factory.NewNumericLiteral(strconv.Itoa(read.slot), ast.TokenFlagsNone),
	})
	result := call
	if read.typeNode != nil {
		result = lowering.factory.NewAsExpression(call, read.typeNode)
	}
	if read.scalar && lowering.clientIslandPropsSlots == nil {
		lowering.indexedStateReads[result] = read
	}
	return result
}

// captureIndexedStateReadType retains the authored slot type before island extraction
// reparents expressions beneath a synthesized receiver. Capture every exact indexed source
// read, including component aliases that keep their general receiver during emission. Emission
// never queries that receiver or a reconstructed callback scope.
func (lowering *jsxLowering) captureIndexedStateReadType(node *ast.Node) {
	key := nodeSpanKey(node)
	read, exists := lowering.stateReadSlots[key]
	if !exists || lowering.checker == nil {
		return
	}
	value := lowering.checker.GetTypeAtLocation(node)
	read.typeNode = lowering.checker.TypeToTypeNode(value, node, nodebuilder.FlagsNoTruncation, nil)
	read.scalar = scalarDerivedType(value)
	lowering.stateReadSlots[key] = read
}

// directStateReadReceiver accepts the canonical facade and a checker-proven whole-state alias.
// The indexed read table already excludes nested, dynamic, broad, and invalidated alias paths.
func directStateReadReceiver(node *ast.Node) *ast.Node {
	var receiver *ast.Node
	switch {
	case ast.IsPropertyAccessExpression(node):
		receiver = node.AsPropertyAccessExpression().Expression
	case ast.IsElementAccessExpression(node):
		receiver = node.AsElementAccessExpression().Expression
	default:
		return nil
	}
	if ast.IsIdentifier(receiver) {
		return receiver
	}
	if !ast.IsPropertyAccessExpression(receiver) {
		return nil
	}
	member := receiver.AsPropertyAccessExpression()
	if member.Expression.Kind != ast.KindThisKeyword || member.Name() == nil ||
		member.Name().Text() != "state" {
		return nil
	}
	return receiver
}
