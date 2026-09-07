package exactcompiler

import (
	"strconv"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/printer"
)

// componentPropsSerializationMetadata keeps client tuples inert and associates optional server
// projectors only with repeated finite records. Registration happens once at module evaluation.
func componentPropsSerializationMetadata(factory *printer.NodeFactory, schema *ComponentValueSchema, target Target, imports *componentConstructorImports) *ast.Node {
	if schema == nil {
		return nil
	}
	if target != TargetServer {
		return componentValueSchemaMetadata(factory, schema)
	}
	var emit func(*ComponentValueSchema, bool) *ast.Node
	emit = func(current *ComponentValueSchema, repeated bool) *ast.Node {
		if current == nil || current.Kind == 0 {
			return contractNumber(factory, 0)
		}
		if current.Kind == 2 {
			return contractArray(factory, contractNumber(factory, 2), emit(current.Element, true))
		}
		values := []*ast.Node{contractNumber(factory, 1)}
		for _, field := range current.Fields {
			values = append(values, contractString(factory, field.Name), emit(field.Schema, false))
		}
		metadata := contractArray(factory, values...)
		if !repeated || len(current.Fields) < 4 {
			return metadata
		}
		imports.projectorUsed = true
		return factory.NewCallExpression(factory.NewIdentifier(imports.projectorName), nil, nil, factory.NewNodeList([]*ast.Node{
			metadata, contractNumber(factory, 1), componentPositionalProjector(factory, current),
		}), ast.NodeFlagsNone)
	}
	return emit(schema, false)
}

// projectionEmitter constructs one isolated callback scope. Static field reads retain independent
// inline caches; all authored reads keep live ownership checks and the interpreter's visit order.
type projectionEmitter struct{ factory *printer.NodeFactory }

func (p projectionEmitter) id(name string) *ast.Node { return p.factory.NewIdentifier(name) }
func (p projectionEmitter) prop(value *ast.Node, name string) *ast.Node {
	return p.factory.NewPropertyAccessExpression(value, nil, p.id(name), ast.NodeFlagsNone)
}
func (p projectionEmitter) state(name string) *ast.Node { return p.prop(p.id("state"), name) }
func (p projectionEmitter) call(value *ast.Node, args ...*ast.Node) *ast.Node {
	return p.factory.NewCallExpression(value, nil, nil, p.factory.NewNodeList(args), ast.NodeFlagsNone)
}
func (p projectionEmitter) binary(left *ast.Node, op ast.Kind, right *ast.Node) *ast.Node {
	return p.factory.NewBinaryExpression(nil, left, nil, p.factory.NewToken(op), right)
}
func (p projectionEmitter) block(statements ...*ast.Node) *ast.Node {
	return p.factory.NewBlock(p.factory.NewNodeList(statements), true)
}
func (p projectionEmitter) reject(condition *ast.Node, result *ast.Node) *ast.Node {
	return p.factory.NewIfStatement(condition, p.factory.NewReturnStatement(result), nil)
}
func (p projectionEmitter) constant(name string, value *ast.Node) *ast.Node {
	return p.factory.NewVariableStatement(nil, p.factory.NewVariableDeclarationList(p.factory.NewNodeList([]*ast.Node{
		p.factory.NewVariableDeclaration(p.id(name), nil, nil, value),
	}), ast.NodeFlagsConst))
}
func (p projectionEmitter) index(value *ast.Node, index *ast.Node) *ast.Node {
	return p.factory.NewElementAccessExpression(value, nil, index, ast.NodeFlagsNone)
}

// componentPositionalProjector emits the version-one validation/conversion contract. A failure
// still returns the interpreter's sentinel, and active-path ownership is always released.
func componentPositionalProjector(factory *printer.NodeFactory, schema *ComponentValueSchema) *ast.Node {
	p := projectionEmitter{factory}
	number := func(value int) *ast.Node { return contractNumber(factory, value) }
	not := func(value *ast.Node) *ast.Node {
		return factory.NewPrefixUnaryExpression(ast.KindExclamationToken, value)
	}
	or := func(a, b *ast.Node) *ast.Node { return p.binary(a, ast.KindBarBarToken, b) }
	neq := func(a, b *ast.Node) *ast.Node { return p.binary(a, ast.KindExclamationEqualsEqualsToken, b) }
	eq := func(a, b *ast.Node) *ast.Node { return p.binary(a, ast.KindEqualsEqualsEqualsToken, b) }
	active := func(method string) *ast.Node { return p.call(p.prop(p.state("active"), method), p.id("value")) }
	depth := func() *ast.Node { return p.binary(p.id("depth"), ast.KindPlusToken, number(1)) }
	statements := []*ast.Node{
		p.reject(or(p.binary(factory.NewPrefixUnaryExpression(ast.KindPlusPlusToken, p.state("nodes")), ast.KindGreaterThanToken, p.state("maxNodes")), p.binary(p.id("depth"), ast.KindGreaterThanToken, p.state("maxDepth"))), p.state("unsafe")),
		p.reject(or(or(not(p.id("value")), neq(factory.NewTypeOfExpression(p.id("value")), contractString(factory, "object"))), active("has")), p.state("mismatch")),
		factory.NewExpressionStatement(active("add")),
	}
	body := []*ast.Node{
		p.reject(or(or(p.call(p.prop(p.id("Array"), "isArray"), p.id("value")), neq(p.call(p.prop(p.id("Object"), "getPrototypeOf"), p.id("value")), p.prop(p.id("Object"), "prototype"))), neq(p.prop(p.call(p.prop(p.id("Object"), "keys"), p.id("value")), "length"), number(len(schema.Fields)))), p.state("mismatch")),
		p.constant("output", factory.NewNewExpression(p.id("Array"), nil, factory.NewNodeList([]*ast.Node{number(len(schema.Fields))}))),
	}
	for index, field := range schema.Fields {
		key := contractString(factory, field.Name)
		cell := "cell" + strconv.Itoa(index)
		body = append(body, p.reject(not(p.call(p.prop(p.id("Object"), "hasOwn"), p.id("value"), key)), p.state("mismatch")))
		read := p.index(p.id("value"), contractString(factory, field.Name))
		if field.Schema == nil || field.Schema.Kind == 0 {
			body = append(body, p.constant(cell, read), p.reject(not(p.call(p.state("validate"), p.id(cell), depth(), p.id("state"))), p.state("unsafe")))
		} else {
			body = append(body, p.constant(cell, p.call(p.state("project"), read, p.id("schema"), number(index*2+2), depth(), p.id("state"))), p.reject(or(eq(p.id(cell), p.state("mismatch")), eq(p.id(cell), p.state("unsafe"))), p.id(cell)))
		}
		body = append(body, factory.NewExpressionStatement(p.binary(p.index(p.id("output"), number(index)), ast.KindEqualsToken, p.id(cell))))
	}
	body = append(body, factory.NewReturnStatement(p.id("output")))
	statements = append(statements, factory.NewTryStatement(p.block(body...), nil, p.block(factory.NewExpressionStatement(active("delete")))))
	parameters := []*ast.Node{}
	// Intrinsics are supplied by the runtime so authored Object/Array bindings cannot capture them.
	for _, name := range []string{"value", "depth", "state", "schema", "Object", "Array"} {
		parameters = append(parameters, factory.NewParameterDeclaration(nil, nil, p.id(name), nil, nil, nil))
	}
	return factory.NewArrowFunction(nil, nil, factory.NewNodeList(parameters), nil, nil, factory.NewToken(ast.KindEqualsGreaterThanToken), p.block(statements...))
}
