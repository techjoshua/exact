package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/nodebuilder"
)

// mutationNodeFacts retains the distinct authored checking obligations for one source span.
// Returning this record by value prevents emitters from mutating the captured analysis.
type mutationNodeFacts struct {
	result, destination, argument, pending, boundCallable *ast.Node
}

type mutationTypeSlot uint8

const (
	mutationTypeResult mutationTypeSlot = iota
	mutationTypeDestination
	mutationTypeArgument
	mutationTypePending
	mutationTypeBoundCallable
)

// mutationSemanticFacts is built against authored parents and sealed before executable lowering.
// Its type cache is local to this source and checker, never shared across program generations.
type mutationSemanticFacts struct {
	records        map[SourceSpan]mutationNodeFacts
	types          map[*ast.Node]*ast.Node
	intrinsicTypes map[*checker.Type]*ast.Node
	sealed         bool
}

func (facts *mutationSemanticFacts) initialize() {
	facts.records = make(map[SourceSpan]mutationNodeFacts)
	facts.types = make(map[*ast.Node]*ast.Node)
	facts.intrinsicTypes = make(map[*checker.Type]*ast.Node)
}

func (facts *mutationSemanticFacts) at(span SourceSpan) mutationNodeFacts {
	return facts.records[span]
}

func (facts *mutationSemanticFacts) capture(span SourceSpan, slot mutationTypeSlot, value *ast.Node) {
	if facts.sealed {
		panic("mutation facts captured after executable lowering began")
	}
	record := facts.records[span]
	switch slot {
	case mutationTypeResult:
		record.result = value
	case mutationTypeDestination:
		record.destination = value
	case mutationTypeArgument:
		record.argument = value
	case mutationTypePending:
		record.pending = value
	case mutationTypeBoundCallable:
		record.boundCallable = value
	default:
		panic("unknown mutation type slot")
	}
	facts.records[span] = record
}

func (facts *mutationSemanticFacts) seal() {
	facts.sealed = true
	// Emission consumes captured records, not checker-query caches.
	facts.types = nil
	facts.intrinsicTypes = nil
}

// authoredMutationType avoids repeating expensive type construction for the same authored node.
func (lowering *jsxLowering) authoredMutationType(source *ast.Node) *ast.Node {
	if lowering.mutationFacts.sealed {
		panic("authored mutation type requested during executable lowering")
	}
	if value, found := lowering.mutationFacts.types[source]; found {
		return value
	}
	checked := lowering.checker.GetTypeAtLocation(source)
	if reusableMutationIntrinsic(checked) {
		if value, found := lowering.mutationFacts.intrinsicTypes[checked]; found {
			lowering.mutationFacts.types[source] = value
			return value
		}
	}
	var value *ast.Node
	if checked.Flags()&checker.TypeFlagsUniqueESSymbol != 0 {
		value = lowering.namedUniqueMutationType(source, checked)
	}
	if value == nil {
		value = lowering.checker.TypeToTypeNode(checked, source, nodebuilder.FlagsNoTruncation, nil)
	}
	lowering.mutationFacts.types[source] = value
	if reusableMutationIntrinsic(checked) {
		lowering.mutationFacts.intrinsicTypes[checked] = value
	}
	return value
}

// namedUniqueMutationType retains a visible value's exact symbol identity. The node builder
// can otherwise serialize a local symbol as an illegal inline unique-symbol assertion. Resolve
// the name at the capture site so a same-named inner binding cannot silently change the type.
func (lowering *jsxLowering) namedUniqueMutationType(source *ast.Node, value *checker.Type) *ast.Node {
	symbol := value.Symbol()
	if symbol == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) || !ast.IsIdentifier(symbol.ValueDeclaration.Name()) {
		return nil
	}
	name := symbol.ValueDeclaration.Name().Text()
	if lowering.checker.ResolveName(name, source, ast.SymbolFlagsValue, false) != symbol {
		return nil
	}
	return lowering.factory.NewTypeQueryNode(lowering.factory.NewIdentifier(name), nil)
}
