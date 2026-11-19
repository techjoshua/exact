package exactcompiler

import (
	"path"
	"slices"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// publicOpaqueOperation identifies the declaration exported by Core's runtime.
// A host-selected replacement owns execution separately.
func publicOpaqueOperation(expression *ast.Node, symbol *ast.Symbol, owner *executableBodyOwner, imports externalImportBindings) string {
	if owner == nil || owner.values == nil || owner.values.program == nil || expression == nil || !ast.IsIdentifier(expression) && !ast.IsPropertyAccessExpression(expression) {
		return ""
	}
	if symbol == nil || (symbol.Name != "createOpaqueOperation" && symbol.Name != "executeOpaqueOperation") || len(symbol.Declarations) != 1 {
		return ""
	}
	if ast.IsPropertyAccessExpression(expression) && expression.Name().Text() != symbol.Name {
		return ""
	}
	if _, imported := externalImportForExpression(expression, imports, owner.checker); !imported {
		return ""
	}
	decl := symbol.ValueDeclaration
	if decl == nil || !ast.IsFunctionDeclaration(decl) || decl.Body() != nil || decl != symbol.Declarations[0] || ast.GetCombinedModifierFlags(decl)&ast.ModifierFlagsExport == 0 {
		return ""
	}
	source := ast.GetSourceFileOfNode(decl)
	if source == nil || !source.IsDeclarationFile || decl.Parent != source.AsNode() {
		return ""
	}
	filename := strings.ReplaceAll(source.FileName(), "\\", "/")
	if !strings.HasSuffix(filename, "/dist/component-abi/opaque-operation.d.ts") {
		return ""
	}
	if _, selected := owner.body(expression); selected {
		return ""
	}
	program := owner.values.program
	root := program.GetNearestAncestorDirectoryWithPackageJson(path.Dir(filename))
	if root == "" || filename != path.Join(root, "dist/component-abi/opaque-operation.d.ts") || program.GetSourceFile(source.FileName()) != source {
		return ""
	}
	manifest := program.GetPackageJsonInfo(path.Join(root, "package.json")).GetContents()
	if manifest == nil || manifest.Name.Value != "@exactjs/core" {
		return ""
	}
	return symbol.Name
}

// A dynamic receipt retains execution uncertainty. Concrete callback edges are
// attached only for the actual direct issuer redeemed by this operation.
func appendPublicOperationEffects(fact *callableFacts, facts []callableFacts, node *ast.Node, symbol *ast.Symbol, source *ast.SourceFile, owner *executableBodyOwner, targets map[*ast.Node]int, symbols map[ast.SymbolId]int, imports externalImportBindings) {
	call := node.AsCallExpression()
	operation := publicOpaqueOperation(call.Expression, symbol, owner, imports)
	if operation == "" || call.Arguments == nil || len(call.Arguments.Nodes) == 0 {
		return
	}
	unknown := func() {
		e := environmentSource("unknown", "unresolved opaque operation input", fact.summary.Name)
		e.Opaque = true
		fact.summary.DirectEffectSources = append(fact.summary.DirectEffectSources, e)
	}
	if !directOpaqueOperationCall(node) {
		unknown()
		return
	}
	args := call.Arguments.Nodes
	if operation == "createOpaqueOperation" {
		if len(args) > 1 && !plainOperationMetadata(unwrapSourceCallableReference(args[1])) {
			metadata := args[1]
			q := newSourceDependencyQuery(node, owner.checker, owner, fact.node)
			defer q.publishDependencyStatistics()
			part := accessorCandidates{}
			// Both keys are read on a normally completing metadata lookup. Inherited
			// domain and other fields are conditional, including on a proxy.
			for _, key := range []string{"readKey", "key"} {
				mergeAccessorCandidates(&part, q.accessors(metadata, nil, key, accessorRead, nil, nil))
			}
			// Domain lookup and enumerable-property copying depend on runtime
			// values. The key reads above cannot establish those effects.
			unknown()
			appendOpaqueAccessorEffect(fact, part)
			appendSourceValueWrites(fact, part, owner.checker)
			appendAccessorTargets(fact, node, part, targets, source)
		}
		return
	}
	origin, fields := immutableEffectArgumentRoot(args[0], owner.checker, map[ast.SymbolId]bool{})
	if len(fields) != 0 || origin == nil || ast.GetSourceFileOfNode(origin) != source || !ast.IsCallExpression(origin) || !directOpaqueOperationCall(origin) {
		unknown()
		return
	}
	issuer := origin.Expression()
	if publicOpaqueOperation(issuer, resolvedCallableSymbol(callTargetSymbol(issuer, owner.checker), owner.checker), owner, imports) != "createOpaqueOperation" {
		unknown()
		return
	}
	issued := origin.AsCallExpression().Arguments
	if issued == nil || len(issued.Nodes) == 0 {
		return
	}
	// A conditional may expose one known executor alongside an unresolved one.
	// Keep each original arm independent, including a definite literal selection.
	var references []*ast.Node
	executor := func(arg *ast.Node) {
		value, path := immutableEffectArgumentRoot(arg, owner.checker, map[ast.SymbolId]bool{})
		if len(path) == 0 && value != nil && ast.GetSourceFileOfNode(value) == source {
			var decl *ast.Node
			if ast.IsIdentifier(value) {
				s := resolvedCallableSymbol(owner.checker.GetSymbolAtLocation(value), owner.checker)
				if s != nil {
					decl = s.ValueDeclaration
				}
			} else if ast.IsArrowFunction(value) || ast.IsFunctionExpression(value) {
				decl = value
			}
			if selected, owned := owner.body(value); owned && selected != decl {
				unknown()
				return
			}
			if decl != nil && ast.IsFunctionLike(decl) && decl.Body() != nil && owner.stableBody(decl) {
				references = append(references, value)
				return
			}
		}
		unknown()
	}
	arg, fields := immutableEffectArgumentRoot(issued.Nodes[0], owner.checker, map[ast.SymbolId]bool{})
	if len(fields) == 0 && arg != nil && ast.GetSourceFileOfNode(arg) == source && ast.IsConditionalExpression(arg) {
		c := arg.AsConditionalExpression()
		query := newSourceDependencyQuery(node, owner.checker, owner, fact.node)
		defer query.publishDependencyStatistics()
		known, truthy, _ := query.literalDecision(c.Condition, nil)
		if !known || truthy {
			executor(c.WhenTrue)
		}
		if !known || !truthy {
			executor(c.WhenFalse)
		}
	} else {
		executor(issued.Nodes[0])
	}
	appendInvokedCallbackReferences(fact, facts, node, references, 0, source, owner.checker, targets, symbols, imports)
}

func directOpaqueOperationCall(node *ast.Node) bool {
	return !ast.IsOptionalChain(node) && (node.AsCallExpression().Arguments == nil ||
		!slices.ContainsFunc(node.AsCallExpression().Arguments.Nodes, ast.IsSpreadElement))
}

// A fresh literal consisting of ordinary data properties and methods has no
// accessor or proxy hooks. Evaluating property initializers stays on the caller.
func plainOperationMetadata(metadata *ast.Node) bool {
	return ast.IsObjectLiteralExpression(metadata) && !slices.ContainsFunc(metadata.AsObjectLiteralExpression().Properties.Nodes, func(p *ast.Node) bool {
		return !(ast.IsPropertyAssignment(p) || ast.IsShorthandPropertyAssignment(p) || ast.IsMethodDeclaration(p)) ||
			p.Name() == nil || ast.IsComputedPropertyName(p.Name()) || p.Name().Text() == "__proto__"
	})
}
