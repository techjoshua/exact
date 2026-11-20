package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceValueIndex owns the generation's source assignments and call lookup. Literal origin
// buckets narrow candidate visits only. Dynamic roots stay in source order beside every bucket.
type sourceValueAssignment struct{ left, right *ast.Node }
type sourceValueIndex struct {
	normalOccurrences                       map[*ast.Node]*sourceNormalOccurrence
	normalOrdinal                           int
	normalExported                          map[ast.SymbolId]bool
	normalExportUnknown, normalDynamicScope bool
	privateUses                             *sourcePrivateUses
	// incomplete prevents a reentrant consumer from treating an unpublished index as empty.
	incomplete               bool
	importsPrepared          bool
	erasedImports            map[*ast.Node]bool
	operationRegions         map[*ast.Node]*sourceMemberOperationRegion
	runtimeImports           []*ast.Node
	bindings                 map[ast.SymbolId][]sourceValueAssignment
	memberOrigins            map[*ast.Node][]sourceValueAssignment
	dynamicMembers           []sourceValueAssignment
	numberReplaced           bool
	objectEntriesWritten     bool
	objectFromEntriesWritten bool
	numberOpenCalls          []*ast.Node
	calls                    []*ast.Node
	originCalls              map[*ast.Node][]*ast.Node
	dynamicCalls             []*ast.Node
}

// sourceMemberAssignments merges the original known/dynamic source buckets.
// Publication and recovery use this same ordering without retaining an index or
// copying its population. The cursor belongs only to the current source phase.
type sourceMemberAssignments struct {
	known, dynamic []sourceValueAssignment
	i, j           int
}

func (index sourceValueIndex) memberAssignments(origin *ast.Node) sourceMemberAssignments {
	return sourceMemberAssignments{known: index.memberOrigins[origin], dynamic: index.dynamicMembers}
}
func (cursor *sourceMemberAssignments) next() (sourceValueAssignment, bool) {
	if cursor.i == len(cursor.known) && cursor.j == len(cursor.dynamic) {
		return sourceValueAssignment{}, false
	}
	if cursor.j == len(cursor.dynamic) || cursor.i < len(cursor.known) && cursor.known[cursor.i].left.Pos() < cursor.dynamic[cursor.j].left.Pos() {
		assignment := cursor.known[cursor.i]
		cursor.i++
		return assignment, true
	}
	assignment := cursor.dynamic[cursor.j]
	cursor.j++
	return assignment, true
}

func (owner *sourceValueOwner) index(source *ast.SourceFile) sourceValueIndex {
	if owner.indexPreparing[source] {
		return sourceValueIndex{incomplete: true}
	}
	if index, ok := owner.indexes[source]; ok {
		if source != nil {
			progressCachedIndexHit(source.FileName())
		}
		if index.importsPrepared || !owner.generation.canPrepareImportElision(source) {
			return index
		}
		owner.indexPreparing[source] = true
		defer delete(owner.indexPreparing, source)
		index.erasedImports, index.importsPrepared = owner.prepareImportElision(source, index.runtimeImports)
		owner.indexes[source] = index
		return index
	}
	if owner.indexPreparing == nil {
		owner.indexPreparing = make(map[*ast.SourceFile]bool)
	}
	owner.indexPreparing[source] = true
	defer delete(owner.indexPreparing, source)
	index := sourceValueIndex{normalOccurrences: make(map[*ast.Node]*sourceNormalOccurrence), erasedImports: make(map[*ast.Node]bool), operationRegions: make(map[*ast.Node]*sourceMemberOperationRegion), bindings: make(map[ast.SymbolId][]sourceValueAssignment), memberOrigins: make(map[*ast.Node][]sourceValueAssignment), originCalls: make(map[*ast.Node][]*ast.Node)}
	index.normalExported = make(map[ast.SymbolId]bool)
	if source != nil {
		module := source.AsNode().Symbol()
		if module == nil {
			index.normalExportUnknown = true
		} else {
			for _, exported := range module.Exports {
				owner.indexWork++
				if exported.Flags&ast.SymbolFlagsAlias != 0 {
					owner.indexWork++
					exported = owner.checker.GetAliasedSymbol(exported)
				}
				if exported == nil {
					index.normalExportUnknown = true
					continue
				}
				if exported.Flags&ast.SymbolFlagsValue != 0 {
					index.normalExported[ast.GetSymbolId(exported)] = true
				}
			}
		}
	}
	index.privateUses = &sourcePrivateUses{uses: make(map[ast.SymbolId][]sourcePrivateUse), unresolved: make(map[string][]*ast.Node), proofs: make(map[*ast.Node]bool)}
	var members []sourceValueAssignment
	var writes []*ast.Node
	if source != nil && !source.IsDeclarationFile {
		traceSourceName := source.FileName() // existing index source metadata, no parent lookup
		walkNode(source.AsNode(), func(node *ast.Node) bool {
			progressIndexSpan(traceSourceName, progressPointer(node), node.Pos(), node.End(), int(node.Kind))
			owner.indexWork++
			privateErased := owner.indexPrivateUse(index.privateUses, node)
			owner.indexNormalOccurrence(&index, source, node, privateErased)
			if !ast.IsPartOfTypeNode(node) {
				if node.Kind == ast.KindThisKeyword {
					region := owner.memberOperationRegion(&index, node)
					region.receivers = append(region.receivers, node)
				}
				// Even an empty closure can retain this lexical environment through eval.
				// Inventory creation, not execution, in the existing containing region.
				if isCallableNode(node) || ast.IsClassDeclaration(node) || ast.IsClassExpression(node) {
					region := owner.memberOperationRegion(&index, node)
					region.lexicalChildren = append(region.lexicalChildren, node)
				}
				if sourceMemberOperationHazard(node) {
					region := owner.memberOperationRegion(&index, node)
					region.hazards = append(region.hazards, node)
				}
				if ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node) || ast.IsCallExpression(node) || ast.IsNewExpression(node) || ast.IsTaggedTemplateExpression(node) {
					region := owner.memberOperationRegion(&index, node)
					region.members = append(region.members, node)
				}
				if privateRuntimeReference(node, false) {
					region := owner.memberOperationRegion(&index, node)
					region.references = append(region.references, node)
					if !privateErased {
						owner.indexPrivateReference(index.privateUses, node, region)
					}
				}
			}
			if reference, _ := executableDeclarationReference(node); reference != nil && !node.IsTypeOnly() && !(ast.IsImportDeclaration(node) && node.AsImportDeclaration().ImportClause != nil && node.AsImportDeclaration().ImportClause.AsImportClause().IsTypeOnly()) {
				index.runtimeImports = append(index.runtimeImports, node)
			}
			if ast.IsPartOfTypeNode(node) {
				return false
			}
			if ast.IsNewExpression(node) || ast.IsTaggedTemplateExpression(node) {
				// These executable forms do not have call-index ownership proof.
				index.numberOpenCalls = append(index.numberOpenCalls, node)
				region := owner.memberOperationRegion(&index, node)
				region.openCalls = append(region.openCalls, node)
			}
			if ast.IsCallExpression(node) {
				index.calls = append(index.calls, node)
				region := owner.memberOperationRegion(&index, node)
				region.calls = append(region.calls, node)
				query := sourceValueQuery{owner: owner}
				if query.thenMutationSyntax(node) {
					region.thenOperations = append(region.thenOperations, node)
				}
			}
			// Numeric conversion can invoke authored valueOf/@@toPrimitive code.
			// A source-local function body alone cannot close this implicit work.
			if ast.IsPrefixUnaryExpression(node) && node.AsPrefixUnaryExpression().Operator == ast.KindPlusToken {
				operand := unwrapSourceCallableReference(node.AsPrefixUnaryExpression().Operand)
				if operand == nil || operand.Kind != ast.KindStringLiteral && operand.Kind != ast.KindNumericLiteral && operand.Kind != ast.KindTrueKeyword && operand.Kind != ast.KindFalseKeyword && operand.Kind != ast.KindNullKeyword {
					index.numberOpenCalls = append(index.numberOpenCalls, node)
				}
			}
			// Reuse native target ownership. Pattern receivers and computed keys are
			// reads, while nested/default/rest destinations are possible writes.
			if (ast.IsIdentifier(node) || ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node)) && nativeAssignmentPatternTarget(node) {
				writes = append(writes, node)
			}
			plan := planMutationOperation(node)
			if plan.kind == mutationAssign || plan.kind == mutationCompound || plan.kind == mutationPrefix || plan.kind == mutationPostfix || plan.kind == mutationDelete {
				writes = append(writes, plan.target)
			}
			if ast.IsAssignmentExpression(node, false) {
				assignment := node.AsBinaryExpression()
				left := unwrapSourceCallableReference(assignment.Left)
				entry := sourceValueAssignment{left: left, right: assignment.Right}
				if ast.IsIdentifier(left) {
					if symbol := owner.checker.GetSymbolAtLocation(left); symbol != nil {
						id := ast.GetSymbolId(symbol)
						index.bindings[id] = append(index.bindings[id], entry)
					}
				} else if ast.IsPropertyAccessExpression(left) || ast.IsElementAccessExpression(left) {
					// A namespace property can resolve to the same variable symbol as an
					// unqualified reference. Preserve that binder identity, not its name.
					if symbol := owner.checker.GetSymbolAtLocation(left); symbol != nil && symbol.ValueDeclaration != nil && ast.IsVariableDeclaration(symbol.ValueDeclaration) {
						receiver := unwrapSourceCallableReference(left.Expression())
						namespace := owner.checker.GetSymbolAtLocation(receiver)
						// Type-compatible objects do not acquire namespace identity.
						// The binder-owned declarationless namespace exports the actual
						// variable symbol. Aliases and unresolved receivers stay members.
						if namespace != nil && namespace.Flags&ast.SymbolFlagsModule != 0 && len(namespace.Declarations) == 0 && namespace.Exports != nil && namespace.Exports[ast.SymbolName(symbol)] == symbol {
							id := ast.GetSymbolId(symbol)
							index.bindings[id] = append(index.bindings[id], entry)
						}
					}
					members = append(members, entry)
				}
			}
			return true
		})
	}
	index.privateUses.complete = source != nil && !source.IsDeclarationFile
	for _, write := range writes {
		region := owner.memberOperationRegion(&index, write)
		region.writes = append(region.writes, write)
		if ast.IsPropertyAccessExpression(write) || ast.IsElementAccessExpression(write) {
			region.thenOperations = append(region.thenOperations, write)
			base, name := accessorReceiver(write)
			base = unwrapSourceCallableReference(base)
			if (name == "entries" || name == "fromEntries") && ast.IsIdentifier(base) &&
				base.Text() == "Object" && standardLibraryCallRoot(base, owner.checker) {
				if name == "entries" {
					index.objectEntriesWritten = true
				} else {
					index.objectFromEntriesWritten = true
				}
			}
		}
	}
	// Native mutation destinations establish instability without inventing a
	// projected RHS producer for a destructuring/default/rest operation.
	mutations := make(map[ast.SymbolId][]sourceValueAssignment)
	for _, target := range writes {
		target = unwrapSourceCallableReference(target)
		if ast.IsIdentifier(target) {
			symbol := owner.checker.GetSymbolAtLocation(target)
			if target.Parent != nil && ast.IsShorthandPropertyAssignment(target.Parent) {
				symbol = owner.checker.GetShorthandAssignmentValueSymbol(target.Parent)
			}
			if symbol != nil {
				mutations[ast.GetSymbolId(symbol)] = append(mutations[ast.GetSymbolId(symbol)], sourceValueAssignment{left: target})
			}
		}
	}
	// Bucket writes by a known allocation site. A computed key stays eligible
	// for every matching read of that allocation.
	for _, assignment := range members {
		root, _ := accessorReceiver(assignment.left)
		origin := owner.argumentOrigin(root, index.bindings, map[ast.SymbolId]bool{})
		if origin != nil && (ast.IsObjectLiteralExpression(origin) || ast.IsArrayLiteralExpression(origin) || owner.localNullRecordAllocation(root, origin)) {
			index.memberOrigins[origin] = append(index.memberOrigins[origin], assignment)
		} else {
			index.dynamicMembers = append(index.dynamicMembers, assignment)
		}
	}
	// This is an eligibility fence, not a reflective value interpreter. A write
	// outside a stable literal receiver can replace the global operation. Calls
	// must have source-owned bodies in this indexed file or be primitive Number
	// conversions. Foreign, reflective, indirect and coercive calls stay open.
	for _, target := range writes {
		if owner.numberWriteMayReplace(target, mutations) {
			index.numberReplaced = true
		}
	}
	query := sourceValueQuery{owner: owner}
	for _, node := range index.calls {
		if !query.numberCallClosed(node, source, mutations) {
			index.numberOpenCalls = append(index.numberOpenCalls, node)
		}
		call := node.AsCallExpression()
		seen := make(map[*ast.Node]bool)
		dynamic := false
		record := func(input *ast.Node) {
			origin := owner.argumentOrigin(input, index.bindings, map[ast.SymbolId]bool{})
			if origin == nil {
				dynamic = true
			} else if !seen[origin] {
				index.originCalls[origin] = append(index.originCalls[origin], node)
				seen[origin] = true
			}
		}
		if call.Arguments != nil {
			for _, argument := range call.Arguments.Nodes {
				record(argument)
			}
		}
		expression := unwrapSourceCallableReference(call.Expression)
		if ast.IsPropertyAccessExpression(expression) || ast.IsElementAccessExpression(expression) {
			receiver, _ := accessorReceiver(expression)
			record(receiver)
		}
		if dynamic {
			index.dynamicCalls = append(index.dynamicCalls, node)
		}
	}
	index.erasedImports, index.importsPrepared = owner.prepareImportElision(source, index.runtimeImports)
	owner.indexes[source] = index
	return index
}
func (owner *sourceValueOwner) bindingWritten(symbol *ast.Symbol) bool {
	if symbol == nil {
		return false
	}
	for _, declaration := range symbol.Declarations {
		if len(owner.index(ast.GetSourceFileOfNode(declaration)).bindings[ast.GetSymbolId(symbol)]) != 0 {
			return true
		}
	}
	return false
}

// argumentOrigin follows stable authored aliases per indexed argument. Mutable or symbolic roots remain
// dynamic demands resolved under the query's substitutions, never under a global binding map.
func (owner *sourceValueOwner) argumentOrigin(node *ast.Node, writes map[ast.SymbolId][]sourceValueAssignment, seen map[ast.SymbolId]bool) *ast.Node {
	owner.argumentOriginWork++
	c := owner.checker
	root, path := effectArgumentRoot(node)
	// A projected alias acquires a different value. Its receiver must be resolved
	// by the shared query, rather than indexed under the container's source node.
	if root == nil || len(path) != 0 {
		return nil
	}
	if !ast.IsIdentifier(root) {
		return root
	}
	symbol := sourceCallableReferenceSymbol(root, c)
	if symbol == nil {
		return nil
	}
	id := ast.GetSymbolId(symbol)
	if seen[id] || len(writes[id]) != 0 {
		return nil
	}
	seen[id] = true
	for _, declaration := range symbol.Declarations {
		if ast.IsVariableDeclaration(declaration) && declaration.Initializer() != nil {
			return owner.argumentOrigin(declaration.Initializer(), writes, seen)
		}
	}
	return nil
}

// numberWriteMayReplace uses the same native destinations and literal receiver
// identity as the assignment relation. Unresolved receivers cannot prove isolation.
func (owner *sourceValueOwner) numberWriteMayReplace(target *ast.Node, writes map[ast.SymbolId][]sourceValueAssignment) bool {
	target = unwrapSourceCallableReference(target)
	if target == nil {
		return false
	}
	if ast.IsIdentifier(target) {
		if target.Text() != "Number" {
			return false
		}
		if target.Parent != nil && ast.IsShorthandPropertyAssignment(target.Parent) {
			symbol := owner.checker.GetShorthandAssignmentValueSymbol(target.Parent)
			if symbol == nil {
				return true
			}
			for _, declaration := range symbol.Declarations {
				if ast.GetSourceFileOfNode(declaration).IsDeclarationFile {
					return true
				}
			}
			return false
		}
		return standardLibraryCallRoot(target, owner.checker)
	}
	if !ast.IsPropertyAccessExpression(target) && !ast.IsElementAccessExpression(target) {
		return false
	}
	root, key := accessorReceiver(target)
	if key != "Number" && key != "" && key != "*" {
		return false
	}
	origin := owner.argumentOrigin(root, writes, map[ast.SymbolId]bool{})
	return origin == nil || (!ast.IsObjectLiteralExpression(origin) && !ast.IsArrayLiteralExpression(origin))
}

// numberCallClosed excludes unowned executable effects from intrinsic certainty.
// All local bodies and their nested calls/writes already participate in this index.
// This proves neither execution nor purity, and never grants callee authority.
func (query *sourceValueQuery) numberCallClosed(node *ast.Node, source *ast.SourceFile, writes map[ast.SymbolId][]sourceValueAssignment) bool {
	call := node.AsCallExpression()
	target := unwrapSourceCallableReference(call.Expression)
	if target == nil {
		return false
	}
	if ast.IsIdentifier(target) {
		symbol := query.owner.checker.GetSymbolAtLocation(target)
		if symbol == nil || len(writes[ast.GetSymbolId(symbol)]) != 0 {
			return false
		}
		if target.Text() == "Number" && standardLibraryCallRoot(target, query.owner.checker) && call.Arguments != nil && len(call.Arguments.Nodes) == 1 {
			input := unwrapSourceCallableReference(call.Arguments.Nodes[0])
			if input != nil {
				switch input.Kind {
				case ast.KindStringLiteral, ast.KindNumericLiteral, ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword:
					return true
				}
			}
			return false
		}
	}
	if ast.IsFunctionExpression(target) || ast.IsArrowFunction(target) {
		return ast.GetSourceFileOfNode(target) == source
	}
	// Member selection may execute a getter or a replaced method. Retain uncertainty
	// rather than borrowing a declaration's signature as executable identity.
	if !ast.IsIdentifier(target) {
		return false
	}
	candidates := accessorCandidates{}
	body := false
	for _, declaration := range query.callDeclarations(target, &candidates) {
		if ast.IsVariableDeclaration(declaration) {
			declaration = unwrapSourceCallableReference(declaration.Initializer())
		}
		if declaration != nil && ast.IsFunctionLike(declaration) && declaration.Body() != nil {
			if ast.GetSourceFileOfNode(declaration) != source {
				return false
			}
			body = true
		}
	}
	return body && !candidates.opaque
}

// localNullRecordAllocation admits the direct const receiver of an ordinary
// null-prototype allocation to its own assignment bucket. Computed keys stay
// eligible there, including when the allocation is observed through an alias.
func (owner *sourceValueOwner) localNullRecordAllocation(root, origin *ast.Node) bool {
	if !ast.IsIdentifier(root) || !ast.IsCallExpression(origin) {
		return false
	}
	call := origin.AsCallExpression()
	if !ast.IsPropertyAccessExpression(call.Expression) || call.Expression.Name().Text() != "create" || call.Arguments == nil || len(call.Arguments.Nodes) != 1 || call.Arguments.Nodes[0].Kind != ast.KindNullKeyword {
		return false
	}
	receiver := call.Expression.Expression()
	if !ast.IsIdentifier(receiver) || receiver.Text() != "Object" || !standardLibraryCallRoot(call.Expression, owner.checker) {
		return false
	}
	symbol := owner.checker.GetSymbolAtLocation(root)
	if symbol == nil || symbol.ValueDeclaration == nil {
		return false
	}
	decl := symbol.ValueDeclaration
	return ast.IsVariableDeclaration(decl) && ast.IsIdentifier(decl.Name()) && decl.Parent.Flags&ast.NodeFlagsConst != 0 && decl.Initializer() != nil && unwrapSourceCallableReference(decl.Initializer()) == origin
}
