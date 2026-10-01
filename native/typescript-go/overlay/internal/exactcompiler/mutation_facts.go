package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/nodebuilder"
)

// mutationNodeFacts retains the distinct authored checking obligations for one source span.
// Returning this record by value prevents emitters from mutating the captured analysis.
type mutationNodeFacts struct {
	result, destination, argument, pending *ast.Node
}

type mutationTypeSlot uint8

const (
	mutationTypeResult mutationTypeSlot = iota
	mutationTypeDestination
	mutationTypeArgument
	mutationTypePending
)

// mutationSemanticFacts is built against authored parents and sealed before executable lowering.
// Its type cache is local to this source and checker, never shared across program generations.
type mutationSemanticFacts struct {
	records map[string]mutationNodeFacts
	types   map[*ast.Node]*ast.Node
	sealed  bool
}

func (facts *mutationSemanticFacts) initialize() {
	facts.records = make(map[string]mutationNodeFacts)
	facts.types = make(map[*ast.Node]*ast.Node)
}

func (facts *mutationSemanticFacts) at(span string) mutationNodeFacts {
	return facts.records[span]
}

func (facts *mutationSemanticFacts) capture(span string, slot mutationTypeSlot, value *ast.Node) {
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
	default:
		panic("unknown mutation type slot")
	}
	facts.records[span] = record
}

func (facts *mutationSemanticFacts) seal() {
	facts.sealed = true
	// Emission consumes captured records, not checker-query caches.
	facts.types = nil
}

// authoredMutationType avoids repeating expensive type construction for the same authored node.
func (lowering *jsxLowering) authoredMutationType(source *ast.Node) *ast.Node {
	if lowering.mutationFacts.sealed {
		panic("authored mutation type requested during executable lowering")
	}
	if value, found := lowering.mutationFacts.types[source]; found {
		return value
	}
	value := lowering.checker.TypeToTypeNode(lowering.checker.GetTypeAtLocation(source), source, nodebuilder.FlagsNoTruncation, nil)
	lowering.mutationFacts.types[source] = value
	return value
}
