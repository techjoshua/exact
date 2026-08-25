package exactcompiler

import (
	"sort"
	"strconv"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/nodebuilder"
)

type indexedPropsRead struct {
	slot int
}

// attachComponentPropsSlots assigns deterministic storage indexes to statically named reads from
// each component's canonical props parameter. Dynamic access remains on the general facade.
func attachComponentPropsSlots(
	components []Component,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) {
	if sourceFile == nil || typeChecker == nil {
		return
	}
	nodes := componentNodesBySpan(components, sourceFile)
	for index := range components {
		componentNode := nodes[componentSpanKey(components[index])]
		if componentNode == nil {
			continue
		}
		propsSymbol := componentPropsSymbol(componentNode, typeChecker)
		if propsSymbol == nil {
			continue
		}
		keys := make(map[string]struct{})
		walkNode(componentNode, func(node *ast.Node) bool {
			key, receiver, ok := directPropsRead(node)
			if !ok || identifierIsWriteTarget(node) ||
				typeChecker.GetSymbolAtLocation(receiver) != propsSymbol {
				return true
			}
			keys[key] = struct{}{}
			return true
		})
		components[index].PropsSlots = make([]string, 0, len(keys))
		for key := range keys {
			components[index].PropsSlots = append(components[index].PropsSlots, key)
		}
		sort.Strings(components[index].PropsSlots)
	}
}

// indexPropsReadSlots joins each proven direct read to its component-local numeric layout.
func indexPropsReadSlots(
	components []Component,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) map[string]indexedPropsRead {
	result := make(map[string]indexedPropsRead)
	if sourceFile == nil || typeChecker == nil {
		return result
	}
	nodes := componentNodesBySpan(components, sourceFile)
	for _, component := range components {
		componentNode := nodes[componentSpanKey(component)]
		if componentNode == nil {
			continue
		}
		propsSymbol := componentPropsSymbol(componentNode, typeChecker)
		if propsSymbol == nil || len(component.PropsSlots) == 0 {
			continue
		}
		slots := make(map[string]int, len(component.PropsSlots))
		for slot, key := range component.PropsSlots {
			slots[key] = slot
		}
		walkNode(componentNode, func(node *ast.Node) bool {
			key, receiver, ok := directPropsRead(node)
			if !ok || identifierIsWriteTarget(node) ||
				typeChecker.GetSymbolAtLocation(receiver) != propsSymbol {
				return true
			}
			if slot, exists := slots[key]; exists {
				result[nodeSpanKey(node)] = indexedPropsRead{slot: slot}
			}
			return true
		})
	}
	return result
}

// lowerIndexedPropsRead bypasses property-key proxy lookup for one compiler-proven top-level prop.
func (lowering *jsxLowering) lowerIndexedPropsRead(node *ast.Node) *ast.Node {
	read, exists := lowering.propsReadSlots[nodeSpanKey(node)]
	if !exists {
		return nil
	}
	_, receiver, ok := directPropsRead(node)
	if !ok {
		return nil
	}
	call := lowering.call(lowering.names.readState, []*ast.Node{
		lowering.visitor.VisitNode(receiver),
		lowering.factory.NewNumericLiteral(strconv.Itoa(read.slot), ast.TokenFlagsNone),
	})
	valueType := lowering.checker.GetTypeAtLocation(node)
	if typeNode := lowering.checker.TypeToTypeNode(
		valueType,
		node,
		nodebuilder.FlagsNoTruncation,
		nil,
	); typeNode != nil {
		return lowering.factory.NewAsExpression(call, typeNode)
	}
	return call
}

func directPropsRead(node *ast.Node) (string, *ast.Node, bool) {
	switch {
	case ast.IsPropertyAccessExpression(node):
		member := node.AsPropertyAccessExpression()
		if ast.IsIdentifier(member.Expression) && member.Name() != nil {
			return member.Name().Text(), member.Expression, true
		}
	case ast.IsElementAccessExpression(node):
		member := node.AsElementAccessExpression()
		if ast.IsIdentifier(member.Expression) && member.ArgumentExpression != nil &&
			ast.IsStringLiteral(member.ArgumentExpression) {
			return member.ArgumentExpression.Text(), member.Expression, true
		}
	}
	return "", nil, false
}

func componentNodesBySpan(components []Component, sourceFile *ast.SourceFile) map[string]*ast.Node {
	wanted := make(map[string]struct{}, len(components))
	for _, component := range components {
		wanted[componentSpanKey(component)] = struct{}{}
	}
	result := make(map[string]*ast.Node, len(components))
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		key := strconv.Itoa(node.Pos()) + ":" + strconv.Itoa(node.End()-node.Pos())
		if _, exists := wanted[key]; exists {
			result[key] = node
		}
		return true
	})
	return result
}

func componentSpanKey(component Component) string {
	return strconv.Itoa(component.Start) + ":" + strconv.Itoa(component.Length)
}
