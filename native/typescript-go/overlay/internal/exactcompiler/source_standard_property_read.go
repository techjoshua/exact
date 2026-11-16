package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStandardPropertyReadKind names an explicitly modeled property-read
// algorithm. It is not inferred from a readonly or primitive result type. New
// contracts belong here only with their own standard semantics and real owner.
type sourceStandardPropertyReadKind uint8

const (
	standardPropertyReadUnmodeled sourceStandardPropertyReadKind = iota
	standardPropertyReadDocumentTitle
)

type sourceStandardPropertyReadMutationDisposition uint8

const (
	standardPropertyReadPending sourceStandardPropertyReadMutationDisposition = iota
	standardPropertyReadAuthoredOrUnmodeled
	standardPropertyReadEmpty
)

// standardPropertyReadContract recognizes the original direct global/library
// property origin. The selected Document title getter reads internal DOM text
// and normalizes whitespace. It neither invokes an authored getter nor writes
// JavaScript fields. Its result is still unknown and its browser dependency,
// abrupt alternatives and independently indexed authored replacements remain.
// See HTML's Document.title getter contract and the maintained built-in policy.
func (q *sourceValueQuery) standardPropertyReadContract(get, expression *ast.Node, root, member *ast.Symbol) sourceStandardPropertyReadKind {
	if q == nil || q.owner == nil || q.owner.checker == nil || get == nil || !ast.IsPropertyAccessExpression(get) || get.Expression() != expression || !ast.IsIdentifier(expression) || root == nil || member == nil {
		return standardPropertyReadUnmodeled
	}
	global := q.owner.checker.GetGlobalSymbol("document", ast.SymbolFlagsValue, nil)
	if global == nil || global.ValueDeclaration == nil || root.ValueDeclaration != global.ValueDeclaration || !standardLibrarySource(ast.GetSourceFileOfNode(global.ValueDeclaration)) {
		return standardPropertyReadUnmodeled
	}
	if get.Name().Text() != "title" || member.ValueDeclaration == nil {
		return standardPropertyReadUnmodeled
	}
	selected := q.owner.checker.GetPropertyOfType(q.owner.checker.GetTypeOfSymbol(global), "title")
	if selected == nil || selected.ValueDeclaration != member.ValueDeclaration {
		return standardPropertyReadUnmodeled
	}
	g := &sourceStagedMemberExternalGet{operation: get, expression: expression, declaration: global.ValueDeclaration, member: member.ValueDeclaration, standardRead: standardPropertyReadDocumentTitle}
	if !validStandardPropertyReadDescription(g) {
		return standardPropertyReadUnmodeled
	}
	return standardPropertyReadDocumentTitle
}

func validStandardPropertyReadDescription(g *sourceStagedMemberExternalGet) bool {
	if g == nil || g.standardRead != standardPropertyReadDocumentTitle || g.standardSymbolData || g.operation == nil || !ast.IsPropertyAccessExpression(g.operation) || g.operation.Expression() != g.expression || !ast.IsIdentifier(g.expression) || g.operation.Name().Text() != "title" || g.declaration == nil || !ast.IsVariableDeclaration(g.declaration) || g.declaration.Name() == nil || g.declaration.Name().Text() != "document" || !standardLibrarySource(ast.GetSourceFileOfNode(g.declaration)) || g.member == nil || !ast.IsPropertySignatureDeclaration(g.member) || g.member.Name() == nil || g.member.Name().Text() != "title" || !standardLibrarySource(ast.GetSourceFileOfNode(g.member)) {
		return false
	}
	parent := g.member.Parent
	return parent != nil && ast.IsInterfaceDeclaration(parent) && parent.Name() != nil && parent.Name().Text() == "Document"
}

// standardPropertyReadMutationDisposition consumes the already published source
// population, never a query or a platform integrity proof. Explicit possible
// own-property/prototype replacements retain the old unknown mutation arm. Other
// source children remain independently required, current and APPLIED at closure.
func (work *callableEffectWork) standardPropertyReadMutationDisposition(g *sourceStagedMemberExternalGet, source sourceStagedOperationRequest) sourceStandardPropertyReadMutationDisposition {
	if !validStandardPropertyReadDescription(g) {
		return standardPropertyReadAuthoredOrUnmodeled
	}
	r := work.operationRecipes[source.producer]
	if !validStagedMemberExternalGetRecipe(r) || r.memberSource.generation != work.operationGeneration || r.memberSource.protocolSource.get == nil || *r.memberSource.protocolSource.get != *g || work.memberCoverageObserved[r.key] != work.operationGeneration {
		return standardPropertyReadPending
	}
	coverageRequest := r.memberSource.protocolSource.required
	coverage := work.operationRecipes[coverageRequest.producer]
	if !validStagedMemberCoverageRecipe(coverage) || !coverage.delta.extracted || coverage.memberSource.generation != work.operationGeneration || work.memberCoverageObserved[coverage.key] != work.operationGeneration {
		return standardPropertyReadPending
	}
	for _, required := range coverage.delta.required {
		child := work.operationRecipes[required.producer].memberSource
		if child == nil {
			continue // Typed input/BODY children retain their own existing obligations.
		}
		candidate := child.candidate
		operation := candidate.operation
		if candidate.reflective {
			key := candidate.key.expression
			// No source alias evaluation is needed to reject a potentially relevant
			// authored descriptor replacement. Distinct literal keys cannot replace
			// this member, regardless of the writer's still-pending receiver.
			if key == nil || !ast.IsStringLiteralLike(key) || key.Text() == "title" || key.Text() == "__proto__" {
				return standardPropertyReadAuthoredOrUnmodeled
			}
		}
		if operation == nil {
			continue
		}
		if ast.IsBinaryExpression(operation) && operation.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
			left := operation.AsBinaryExpression().Left
			if ast.IsPropertyAccessExpression(left) && left.Name().Text() == "__proto__" || ast.IsElementAccessExpression(left) {
				return standardPropertyReadAuthoredOrUnmodeled
			}
		}
		if ast.IsCallExpression(operation) {
			expression := operation.Expression()
			if ast.IsPropertyAccessExpression(expression) && (expression.Name().Text() == "setPrototypeOf" || expression.Name().Text() == "defineProperties") {
				return standardPropertyReadAuthoredOrUnmodeled
			}
		}
	}
	return standardPropertyReadEmpty
}
