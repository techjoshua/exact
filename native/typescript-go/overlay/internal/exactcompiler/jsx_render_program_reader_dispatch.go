package exactcompiler

import (
	"strconv"

	"github.com/microsoft/typescript-go/internal/ast"
)

// renderProgramReaderBlockDispatcher shares one closure when at least one planned reader needs a
// statement body. Each selected body keeps its original lexical scope and return behavior.
func (lowering *jsxLowering) renderProgramReaderBlockDispatcher(readers []*ast.Node) *ast.Node {
	index := lowering.factory.NewIdentifier("__exactSlot")
	statements := make([]*ast.Node, 0, len(readers))
	for readerIndex, reader := range readers {
		if reader == nil {
			continue
		}
		body := reader.AsArrowFunction().Body
		if !ast.IsBlock(body) {
			body = lowering.factory.NewBlock(
				lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewReturnStatement(body)}),
				true,
			)
		}
		condition := lowering.binary(
			index,
			ast.KindEqualsEqualsEqualsToken,
			lowering.factory.NewNumericLiteral(strconv.Itoa(readerIndex), ast.TokenFlagsNone),
		)
		statements = append(statements, lowering.factory.NewIfStatement(condition, body, nil))
	}
	parameter := lowering.factory.NewParameterDeclaration(nil, nil, index, nil, nil, nil)
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{parameter}),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true),
	)
}
