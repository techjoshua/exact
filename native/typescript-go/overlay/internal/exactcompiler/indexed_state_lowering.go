package exactcompiler

import (
	"fmt"
	"strconv"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/nodebuilder"
)

type indexedStateRead struct {
	key  string
	slot int
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

// lowerIndexedStateRead emits the compiler-only numeric access lane while retaining enough
// semantic identity for the render-program planner to select its dirty-mask update path.
func (lowering *jsxLowering) lowerIndexedStateRead(node *ast.Node) *ast.Node {
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
	valueType := lowering.checker.GetTypeAtLocation(node)
	result := call
	if typeNode := lowering.checker.TypeToTypeNode(
		valueType,
		node,
		nodebuilder.FlagsNoTruncation,
		nil,
	); typeNode != nil {
		result = lowering.factory.NewAsExpression(call, typeNode)
	}
	if scalarDerivedType(valueType) {
		lowering.indexedStateReadKeys[result] = read.key
	}
	return result
}

// directStateReadReceiver accepts only the canonical this.state facade. Alias and dynamic reads
// retain normal property semantics until their storage identity is equally proven.
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
