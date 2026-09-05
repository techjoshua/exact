package exactcompiler

import (
	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/printer"
)

// ComponentValueSchema is immutable compiler-owned positional serialization metadata. Kind 0 is
// an opaque leaf, kind 1 is a finite object with ordered fields, and kind 2 is an array.
type ComponentValueSchema struct {
	Kind    int
	Fields  []ComponentValueField
	Element *ComponentValueSchema
}

// ComponentValueField pairs one authored object key with its nested positional schema.
type ComponentValueField struct {
	Name   string
	Schema *ComponentValueSchema
}

// attachComponentPropsSerialization records only finite declared prop shapes. Runtime publication
// retains the named-object path whenever a value does not exactly match this immutable plan.
func attachComponentPropsSerialization(
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
		props := componentPropsParameterIdentifier(componentNode)
		if props == nil {
			continue
		}
		schema := componentValueSchema(typeChecker.GetTypeAtLocation(props), typeChecker, map[*checker.Type]bool{}, 0)
		if schema != nil && schema.Kind == 1 && len(schema.Fields) != 0 && schemaHasPositionalValue(schema) {
			components[index].PropsSerialization = schema
		}
	}
}

// componentValueSchemaMetadata emits the compact tuple consumed locally by root publication.
func componentValueSchemaMetadata(
	factory *printer.NodeFactory,
	schema *ComponentValueSchema,
) *ast.Node {
	if schema == nil || schema.Kind == 0 {
		return contractNumber(factory, 0)
	}
	if schema.Kind == 2 {
		return contractArray(
			factory,
			contractNumber(factory, 2),
			componentValueSchemaMetadata(factory, schema.Element),
		)
	}
	values := []*ast.Node{contractNumber(factory, 1)}
	for _, field := range schema.Fields {
		values = append(
			values,
			contractString(factory, field.Name),
			componentValueSchemaMetadata(factory, field.Schema),
		)
	}
	return contractArray(factory, values...)
}

func componentValueSchema(
	value *checker.Type,
	typeChecker *checker.Checker,
	path map[*checker.Type]bool,
	depth int,
) *ComponentValueSchema {
	leaf := &ComponentValueSchema{Kind: 0}
	if value == nil || depth > 32 || value.Flags()&checker.TypeFlagsAnyOrUnknown != 0 {
		return leaf
	}
	if value.Flags()&checker.TypeFlagsUnion != 0 {
		var memberType *checker.Type
		for _, member := range value.Distributed() {
			if member.Flags()&(checker.TypeFlagsNull|checker.TypeFlagsUndefined) != 0 {
				continue
			}
			// Multiple runtime alternatives are not an exact finite shape. Avoid expanding large
			// authored unions such as Child merely to discover that they require the leaf lane.
			if memberType != nil {
				return leaf
			}
			memberType = member
		}
		if memberType != nil {
			return componentValueSchema(memberType, typeChecker, path, depth+1)
		}
		return leaf
	}
	if value.Flags()&(checker.TypeFlagsStringLike|checker.TypeFlagsNumberLike|checker.TypeFlagsBooleanLike|
		checker.TypeFlagsBigIntLike|checker.TypeFlagsESSymbolLike|checker.TypeFlagsNull|
		checker.TypeFlagsUndefined) != 0 {
		return leaf
	}
	if path[value] {
		return leaf
	}
	path[value] = true
	defer delete(path, value)
	if element := typeChecker.GetElementTypeOfArrayType(value); element != nil {
		return &ComponentValueSchema{
			Kind:    2,
			Element: componentValueSchema(element, typeChecker, path, depth+1),
		}
	}
	if len(typeChecker.GetSignaturesOfType(value, checker.SignatureKindCall)) != 0 ||
		len(typeChecker.GetIndexInfosOfType(value)) != 0 {
		return leaf
	}
	properties := typeChecker.GetPropertiesOfType(value)
	if len(properties) == 0 || len(properties) > 32 {
		return leaf
	}
	fields := make([]ComponentValueField, 0, len(properties))
	for _, property := range properties {
		fields = append(fields, ComponentValueField{
			Name: ast.SymbolName(property),
			Schema: componentValueSchema(
				typeChecker.GetTypeOfSymbolAtLocation(property, propsDeclaration(property)),
				typeChecker,
				path,
				depth+1,
			),
		})
	}
	return &ComponentValueSchema{Kind: 1, Fields: fields}
}

func propsDeclaration(symbol *ast.Symbol) *ast.Node {
	if symbol == nil {
		return nil
	}
	return symbol.ValueDeclaration
}

func schemaHasPositionalValue(schema *ComponentValueSchema) bool {
	if schema == nil || schema.Kind == 0 {
		return false
	}
	if schema.Kind == 2 {
		return true
	}
	for _, field := range schema.Fields {
		if field.Schema != nil && field.Schema.Kind != 0 {
			return true
		}
	}
	return false
}
