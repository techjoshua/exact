package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/nodebuilder"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
	"sort"
)

// islandCaptureValue projects owner props into serializable data. Rendered children retain
// their server owner and cross as a slot reference, never as serialized render operations.
func (lowering *jsxLowering) islandCaptureValue(capture islandValueCapture) *ast.Node {
	value := lowering.factory.NewIdentifier(capture.name)
	if capture.propsKeys == nil {
		return value
	}
	// A dynamic key or an opaque helper can observe keys outside the finite indexed layout.
	// Keep the general facade's data, but never serialize its server-owned children.
	if capture.propsEscape {
		spread := lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewSpreadAssignment(value)}), false)
		if capture.propsChildren == islandChildrenAbsent {
			return spread
		}
		return lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList([]*ast.Node{
			lowering.factory.NewSpreadAssignment(value),
			lowering.property(lowering.factory.NewIdentifier("children"), lowering.factory.NewIdentifier("undefined")),
		}), false)
	}
	properties := []*ast.Node{}
	for _, key := range capture.propsKeys {
		var member *ast.Node = lowering.factory.NewElementAccessExpression(value, nil,
			lowering.factory.NewStringLiteral(key, ast.TokenFlagsNone), ast.NodeFlagsNone)
		if key == "children" {
			continue
		}
		properties = append(properties, lowering.property(jsxPropertyName(lowering.factory, key), member))
	}
	return lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(properties), false)
}

func islandCaptureSlotID(island clientElementIsland, capture islandValueCapture) string {
	return island.id + ":capture:" + capture.name + ":children"
}

// lowerIslandCapturedChildren marks the actual position of forwarded server content inside
// the fallback. The hydrated wrapper adopts this range without constructing its children again.
func (lowering *jsxLowering) lowerIslandCapturedChildren(node *ast.Node) *ast.Node {
	island := lowering.serverCaptureIsland
	if island == nil || lowering.checker == nil || !island.renderedChildren[nodeSpanKey(node)] {
		return nil
	}
	read := islandSelectedChildRead(node)
	key, receiver, ok := directPropsRead(read)
	if !ok || key != "children" {
		return nil
	}
	symbol := lowering.checker.GetSymbolAtLocation(receiver)
	if symbol == nil {
		return nil
	}
	for _, capture := range island.valueCaptures {
		if capture.propsKeys != nil && capture.symbol == ast.GetSymbolId(symbol) {
			output := lowering.conditional(lowering.islandScalarChildren(read), read, lowering.call(lowering.names.serverSlot, []*ast.Node{
				lowering.factory.NewStringLiteral(islandCaptureSlotID(*island, capture), ast.TokenFlagsNone),
				lowering.islandCaptureSlotReference(*island, capture), read,
			}))
			return lowering.islandSelectedChildOutput(node, read, output)
		}
	}
	return nil
}

// islandDefinitionKey separates executable layouts while preserving the authored program ID.
func (lowering *jsxLowering) islandDefinitionKey(position int) int {
	if island := lowering.clientCaptureIsland; island != nil {
		return -1 - position - island.index*(len(lowering.sourceFile.Text())+1)
	}
	return position
}

func (lowering *jsxLowering) islandCaptureSlotReference(island clientElementIsland, capture islandValueCapture) *ast.Node {
	return lowering.serverSlotAuthority(islandCaptureSlotID(island, capture), island.component.ID,
		contractObject(lowering.factory, false, contractProperty(lowering.factory, "kind", contractString(lowering.factory, "single"))))
}

// islandChildrenCapture identifies the owner input transported through the existing boundary
// slot envelope, where SSR supplies request-specific execution authority.
func islandChildrenCapture(island clientElementIsland) (islandValueCapture, bool) {
	for _, capture := range island.valueCaptures {
		if capture.propsChildren != islandChildrenAbsent {
			return capture, true
		}
	}
	return islandValueCapture{}, false
}

func (lowering *jsxLowering) islandCapturedChildrenInput(island clientElementIsland) *ast.Node {
	capture, _ := islandChildrenCapture(island)
	value := lowering.factory.NewIdentifier(capture.name)
	read := lowering.factory.NewPropertyAccessExpression(value, nil, lowering.factory.NewIdentifier("children"), ast.NodeFlagsNone)
	if capture.propsChildren == islandChildrenGuarded {
		return lowering.conditional(lowering.binary(lowering.factory.NewStringLiteral("children", ast.TokenFlagsNone), ast.KindInKeyword, value), read, lowering.factory.NewIdentifier("undefined"))
	}
	return read
}

// islandChildrenAccess is authored input capability, independent of opaque observation.
// A union may contain children without granting an unconditional property read.
type islandChildrenAccess uint8

const (
	islandChildrenAbsent islandChildrenAccess = iota
	islandChildrenDirect
	islandChildrenGuarded
)

func islandPropsChildren(shape *checker.Type, typeChecker *checker.Checker) islandChildrenAccess {
	hasChildren := func(value *checker.Type) bool {
		return value.Flags()&checker.TypeFlagsAny != 0 || typeChecker.GetPropertyOfType(value, "children") != nil || typeChecker.GetIndexInfoOfType(value, typeChecker.GetStringType()) != nil
	}
	shape = typeChecker.GetApparentType(shape)
	if hasChildren(shape) {
		return islandChildrenDirect
	}
	if shape.IsUnion() {
		for _, member := range shape.Types() {
			if hasChildren(member) {
				return islandChildrenGuarded
			}
		}
	}
	return islandChildrenAbsent
}

// islandUsesAuthoredRootProps keeps enhancement definitions in executable code. Their imported
// functions and provider objects are not application data and must not enter the JSON envelope.
func (lowering *jsxLowering) islandUsesAuthoredRootProps(island clientElementIsland) bool {
	opening := island.node
	if ast.IsJsxFragment(opening) {
		return false
	}
	if ast.IsJsxElement(opening) {
		opening = opening.AsJsxElement().OpeningElement
	}
	tag := sourceText(lowering.sourceFile, openingTag(opening))
	return tag == "_" || (jsxIntrinsic(tag) && lowering.renderProgramIntrinsicHasEnhancements(opening.Attributes()))
}

// islandPropsEscape detects reads whose keys cannot be enumerated from direct member syntax.
func islandPropsEscape(component *ast.Node, props *ast.Symbol, typeChecker *checker.Checker) bool {
	name := componentPropsParameterIdentifier(component)
	escapes := false
	walkNode(component, func(node *ast.Node) bool {
		if node != name && ast.IsIdentifier(node) && typeChecker.GetSymbolAtLocation(node) == props && !directPropsReceiver(node) {
			escapes = true
		}
		return true
	})
	return escapes
}

// islandCaptureReferences records lexical ownership before generated render closures reparent nodes.
// Dynamic member access and opaque helpers need the same capture rebinding as indexed prop reads.
func islandCaptureReferences(component *ast.Node, captures []islandValueCapture, typeChecker *checker.Checker) map[string]string {
	result := make(map[string]string)
	bySymbol := make(map[ast.SymbolId]string)
	for _, capture := range captures {
		bySymbol[capture.symbol] = capture.name
	}
	walkNode(component, func(node *ast.Node) bool {
		if ast.IsIdentifier(node) {
			if symbol := typeChecker.GetSymbolAtLocation(node); symbol != nil {
				if name, ok := bySymbol[ast.GetSymbolId(symbol)]; ok {
					result[nodeSpanKey(node)] = name
				}
			}
		}
		return true
	})
	return result
}

// islandTypeEnvironment owns the finite destination type scope and every annotation emitted
// into it. Facts are collected from authored nodes before extraction changes their parents.
// Explicit syntax keeps its type arguments. Inference uses one checker builder and symbol map.
type islandTypeEnvironment struct {
	declarations []*ast.Node
	annotations  map[*ast.Node]*ast.Node
}

func planIslandTypes(component, island *ast.Node, values []islandValueCapture, functions []islandFunctionCapture, derived []islandDerivedCapture, typeChecker *checker.Checker) islandTypeEnvironment {
	emit := printer.NewEmitContext()
	declarations := make(map[*ast.Node]*ast.Node)
	annotations := make(map[*ast.Node]*ast.Node)
	flags := nodebuilder.FlagsNoTruncation | nodebuilder.FlagsUseStructuralFallback | nodebuilder.FlagsUseAliasDefinedOutsideCurrentScope
	symbols := make(map[*ast.IdentifierNode]*ast.Symbol)
	builder := checker.NewNodeBuilderEx(typeChecker, emit, symbols)
	var retain func(*ast.Symbol)
	var build func(*checker.Type, *ast.Node) *ast.Node
	var normalize *ast.NodeVisitor
	visitSymbols := func(root *ast.Node, symbols map[*ast.IdentifierNode]*ast.Symbol) {
		walkNode(root, func(node *ast.Node) bool {
			if ast.IsIdentifier(node) {
				if symbols == nil {
					retain(typeChecker.GetSymbolAtLocation(node))
				} else {
					retain(symbols[node])
				}
			}
			return true
		})
	}
	build = func(value *checker.Type, scope *ast.Node) *ast.Node {
		annotation := builder.TypeToTypeNode(value, scope, flags, nodebuilder.InternalFlagsNone, nil)
		if annotation != nil {
			visitSymbols(annotation, symbols)
		}
		return annotation
	}
	retain = func(symbol *ast.Symbol) {
		if symbol == nil {
			return
		}
		for _, declaration := range symbol.Declarations {
			if declaration.Parent != component.Body() || (!ast.IsTypeAliasDeclaration(declaration) && !ast.IsInterfaceDeclaration(declaration)) {
				continue
			}
			if _, exists := declarations[declaration]; exists {
				continue
			}
			declarations[declaration] = nil
			visitSymbols(declaration, nil)
			declarations[declaration] = emit.Factory.DeepCloneNode(normalize.Visit(declaration))
		}
	}
	normalize = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		if ast.IsTypeQueryNode(node) {
			root := node.AsTypeQueryNode().ExprName
			for ast.IsQualifiedName(root) {
				root = root.AsQualifiedName().Left
			}
			if symbol := typeChecker.GetSymbolAtLocation(root); symbol != nil {
				for owner := symbol.ValueDeclaration; owner != nil; owner = owner.Parent {
					if owner == component {
						// Resolve the complete authored query, including member selection. The generated
						// capture envelope is a different value and cannot stand in for authored props.
						return build(typeChecker.GetTypeFromTypeNode(node), ast.GetSourceFileOfNode(component).AsNode())
					}
				}
			}
		}
		return normalize.VisitEachChild(node)
	}, emit.Factory.AsNodeFactory(), ast.NodeVisitorHooks{})
	planAnnotation := func(node *ast.Node) {
		if node == nil {
			return
		}
		if _, exists := annotations[node]; exists {
			return
		}
		visitSymbols(node, nil)
		annotations[node] = emit.Factory.DeepCloneNode(normalize.Visit(node))
	}
	visit := func(root *ast.Node) {
		walkNode(root, func(node *ast.Node) bool {
			// Plan each annotation root once. Its normalizer owns all nested type nodes,
			// including constraints and return types, without repeatedly expanding prefixes.
			if ast.IsTypeNode(node) {
				planAnnotation(node)
				return false
			}
			if ast.IsIdentifier(node) {
				retain(typeChecker.GetSymbolAtLocation(node))
			}
			return true
		})
	}
	if parameters := component.FunctionLikeData().TypeParameters; parameters != nil {
		for _, parameter := range parameters.Nodes {
			visit(parameter)
		}
	}
	for _, parameter := range component.Parameters() {
		visit(parameter.Type())
	}
	visit(island)
	for _, capture := range values {
		if location := capture.typeLocation; location != nil {
			var annotation *ast.Node
			if symbol := typeChecker.GetSymbolAtLocation(location); symbol != nil && symbol.ValueDeclaration != nil {
				annotation = symbol.ValueDeclaration.Type()
			}
			if annotation != nil {
				planAnnotation(annotation)
				annotations[location] = annotations[annotation]
			} else {
				// Capture locations are original binding identifiers, not flow-narrowed uses.
				// Serialize the binding's inferred type once, retaining exact alias instantiation.
				annotations[location] = build(typeChecker.GetTypeOfSymbol(typeChecker.GetSymbolAtLocation(location)), location)
			}
		}
	}
	for _, capture := range functions {
		visit(capture.declaration)
	}
	for _, capture := range derived {
		visit(capture.declaration)
	}
	sources := make([]*ast.Node, 0, len(declarations))
	for declaration := range declarations {
		sources = append(sources, declaration)
	}
	sort.Slice(sources, func(left, right int) bool { return sources[left].Pos() < sources[right].Pos() })
	result := islandTypeEnvironment{annotations: annotations}
	for _, source := range sources {
		result.declarations = append(result.declarations, declarations[source])
	}
	return result
}

// apply replaces only annotations planned from original source facts. Generated nodes never
// become new checker inputs, and runtime initializers keep their original execution owner.
func (types islandTypeEnvironment) apply(node *ast.Node, factory *ast.NodeFactory) *ast.Node {
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		if annotation, exists := types.annotations[node]; ast.IsTypeNode(node) && exists {
			return annotation
		}
		return visitor.VisitEachChild(node)
	}, factory, ast.NodeVisitorHooks{})
	return visitor.VisitNode(node)
}
