package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// collectReferencedMemberPolicies indexes the declaration contracts of selected members,
// including imported and mapped properties. Public siblings do not inherit a field's policy.
func collectReferencedMemberPolicies(sourceFile *ast.SourceFile, typeChecker *checker.Checker, analysis *policyAnalysis, addSubject func(PolicySubject)) {
	seen := make(map[ast.SymbolId]bool)
	// Cache completed root queries only. A false result observed during recursive traversal
	// is not a complete fact. Share completed facts with source-result analysis only
	// within the acquired checker lifetime.
	if analysis.sourceTypes == nil {
		analysis.sourceTypes = make(map[checker.TypeId]bool)
	}
	policyFromType := func(value *checker.Type) (DataPolicy, bool) {
		return cachedPolicyFromCheckerType(value, typeChecker, analysis.sourceTypes)
	}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if node.Parent != nil && ast.IsPartOfTypeNode(node) {
			return false
		}
		shorthand := node.Parent != nil && ast.IsShorthandPropertyAssignment(node.Parent) && node.Parent.Name() == node
		identifierRead := ast.IsIdentifier(node) && (shorthand || (!ast.IsDeclarationName(node) && !isStaticPropertyName(node)))
		if !identifierRead && !ast.IsPropertyAccessExpression(node) && !ast.IsElementAccessExpression(node) && policyInvocationTarget(node) == nil {
			return true
		}
		symbols := policyMemberSymbols(node, typeChecker)
		if policyInvocationTarget(node) != nil {
			symbols = policyCallSymbols(node, typeChecker)
		}
		if identifierRead {
			// Local declarations already own annotation, inference and selector facts.
			// Reject them before materializing and qualifying their selected value types.
			foreignSymbols := symbols[:0]
			for _, symbol := range symbols {
				for _, declaration := range symbol.Declarations {
					if ast.GetSourceFileOfNode(declaration) != sourceFile {
						foreignSymbols = append(foreignSymbols, symbol)
						break
					}
				}
			}
			symbols = foreignSymbols
			if len(symbols) == 0 {
				return true
			}
		}
		// Instantiated results and member values can be qualified even when the generic
		// declaration contains only T. Inspect the selected type before symbol deduplication.
		var selectedType *checker.Type
		var selectedDeclaration *ast.Node
		if policyInvocationTarget(node) != nil {
			if signature := typeChecker.GetResolvedSignature(node); signature != nil {
				selectedType = typeChecker.GetReturnTypeOfSignature(signature)
				selectedDeclaration = signature.Declaration()
			}
		} else {
			selectedType = typeChecker.GetTypeAtLocation(node)
		}
		selectedPolicy, selectedQualified := policyFromType(selectedType)
		if selectedQualified && policyInvocationTarget(node) != nil {
			collectSelectedCallPolicy(node, selectedDeclaration, sourceFile, selectedPolicy, typeChecker, analysis, addSubject)
		}
		for _, symbol := range symbols {

			id := ast.GetSymbolId(symbol)
			if selectedQualified && policyInvocationTarget(node) == nil {
				collectSelectedMemberPolicy(node, selectedDeclaration, symbol, selectedPolicy, analysis, addSubject)
			}
			if seen[id] {
				continue
			}
			seen[id] = true
			if existing, exists := analysis.subjects.symbols[id]; exists && existing.Policy.Secret {
				continue
			}
			for _, declaration := range symbol.Declarations {
				kind := policyDeclarationKind(declaration)
				if kind != "field" && kind != "return" && kind != "declaration" {
					continue
				}
				owner := ast.GetSourceFileOfNode(declaration)
				if owner == nil {
					continue
				}
				annotations := policyNodeAnnotations(declaration, owner)
				var policy DataPolicy
				qualified := false
				if declaration.Type() != nil {
					value := typeChecker.GetTypeAtLocation(declaration.Type())
					policy, qualified = policyFromType(value)
					// Callable properties own a result contract, rather than qualifying their receiver.
					if !qualified && kind != "return" {
						for _, signature := range typeChecker.GetSignaturesOfType(value, checker.SignatureKindCall) {
							policy, qualified = policyFromType(typeChecker.GetReturnTypeOfSignature(signature))
							if qualified {
								kind = "return"
								break
							}
						}
					}
				} else if kind == "field" {
					// Selected accessors and inferred properties own the type of their value.
					policy, qualified = policyFromType(typeChecker.GetTypeOfSymbol(symbol))
				} else if policyInvocationTarget(node) != nil {
					// Callable aliases retain their inferred signature without changing
					// the ordinary function body or qualifying the function value itself.
					for _, signature := range typeChecker.GetSignaturesOfType(typeChecker.GetTypeOfSymbol(symbol), checker.SignatureKindCall) {
						policy, qualified = policyFromType(typeChecker.GetReturnTypeOfSignature(signature))
						if qualified {
							kind = "return"
							break
						}
					}
				}
				inferredResult := false
				sourceCallable := declaration
				if ast.IsVariableDeclaration(sourceCallable) {
					sourceCallable = unwrapSourceCallableReference(sourceCallable.Initializer())
				}
				if !qualified && owner != sourceFile && sourceCallable != nil && ast.IsFunctionLike(sourceCallable) {
					policy, qualified = sourceCallableResultPolicy(sourceCallable, typeChecker, analysis)
					if qualified && !ast.IsGetAccessorDeclaration(sourceCallable) {
						kind = "return"
					}
					inferredResult = qualified
				}
				if annotations.policy != nil {
					if qualified {
						policy = qualifiedDeclarationPolicy(declaration, owner, *annotations.policy, analysis)
					} else {
						policy = *annotations.policy
					}
					qualified = true
				}
				if !qualified {
					continue
				}
				source := "import"
				if inferredResult {
					source = "inference"
				}
				if annotations.policy != nil {
					source = "annotation"
				}
				subject := policySubject(declaration, kind, ast.SymbolName(symbol), policy, source)
				subject.ID = policyLocationID(owner, "policy:member", declaration.Pos(), subject.Name)
				addSubject(subject)
				analysis.subjects.symbols[id] = subject
				break
			}
		}
		return true
	})
}

// selectedCallPolicy preserves declaration annotations and narrows typed overload results.
// Signature selection uses the checker, never a method name shared by unrelated receivers.
func selectedCallPolicy(node *ast.Node, typeChecker *checker.Checker, subjects policySubjects) (PolicySubject, bool) {
	if subject, exists := subjects.calls[nodeSpanKey(node)]; exists {
		return subject, true
	}
	for _, symbol := range policyCallSymbols(node, typeChecker) {
		subject, exists := subjects.symbols[ast.GetSymbolId(symbol)]
		if !exists || subject.Kind != "return" {
			continue
		}
		signature := typeChecker.GetResolvedSignature(node)
		if signature != nil {
			policy, qualified := policyFromCheckerType(typeChecker.GetReturnTypeOfSignature(signature), typeChecker)
			if qualified {
				// A selected signature's qualification cannot be erased by another overload's annotation.
				subject.Policy = policy
			} else if subject.Source == "import" {
				continue
			}
		}
		return subject, true
	}
	return PolicySubject{}, false
}

// policyCallSymbols resolves the selected data-policy callable, including member calls.
// General effect inference has a different conservative boundary for opaque methods.
func policyCallSymbols(node *ast.Node, typeChecker *checker.Checker) []*ast.Symbol {
	expression := policyInvocationTarget(node)
	if ast.IsPropertyAccessExpression(expression) || ast.IsElementAccessExpression(expression) {
		result := []*ast.Symbol{}
		seen := make(map[ast.SymbolId]bool)
		for _, symbol := range policyMemberSymbols(expression, typeChecker) {
			result = append(result, policyCallableReturnSymbols(symbol, typeChecker, seen)...)
		}
		return result
	}
	symbol := resolvedCallableSymbol(sourceCallableSymbol(sourceCallableReferenceSymbol(expression, typeChecker), typeChecker), typeChecker)
	if symbol == nil {
		return nil
	}
	return policyCallableReturnSymbols(symbol, typeChecker, make(map[ast.SymbolId]bool))
}

// Keep the selected member's contract and the underlying helper's inferred return contract.
// Shorthand and reference-valued members do not introduce a public declassification boundary.
func policyCallableReturnSymbols(symbol *ast.Symbol, typeChecker *checker.Checker, seen map[ast.SymbolId]bool) []*ast.Symbol {
	symbol = sourceCallableSymbol(symbol, typeChecker)
	if symbol == nil || seen[ast.GetSymbolId(symbol)] {
		return nil
	}
	seen[ast.GetSymbolId(symbol)] = true
	result := []*ast.Symbol{typeChecker.GetTargetSymbol(symbol)}
	for _, declaration := range symbol.Declarations {
		var target *ast.Symbol
		if ast.IsShorthandPropertyAssignment(declaration) {
			target = typeChecker.GetShorthandAssignmentValueSymbol(declaration)
		} else if ast.IsPropertyAssignment(declaration) {
			target = sourceCallableReferenceSymbol(declaration.Initializer(), typeChecker)
		}
		result = append(result, policyCallableReturnSymbols(target, typeChecker, seen)...)
	}
	return result
}

// policyMemberSymbols resolves finite computed keys without parsing display text.
// Union keys retain the contracts of every member that can be selected.
func policyMemberSymbols(node *ast.Node, typeChecker *checker.Checker) []*ast.Symbol {
	symbols := []*ast.Symbol{}
	add := func(symbol *ast.Symbol) {
		symbol = resolvedCallableSymbol(symbol, typeChecker)
		if symbol != nil {
			symbols = append(symbols, typeChecker.GetTargetSymbol(symbol))
		}
	}
	if ast.IsIdentifier(node) && node.Parent != nil && ast.IsShorthandPropertyAssignment(node.Parent) {
		add(typeChecker.GetShorthandAssignmentValueSymbol(node.Parent))
	} else if ast.IsIdentifier(node) || ast.IsPropertyAccessExpression(node) {
		add(typeChecker.GetSymbolAtLocation(node))
	} else if ast.IsElementAccessExpression(node) {
		access := node.AsElementAccessExpression()
		if access.ArgumentExpression == nil {
			return symbols
		}
		key := typeChecker.GetTypeAtLocation(access.ArgumentExpression)
		receiver := typeChecker.GetTypeAtLocation(access.Expression)
		if key == nil || receiver == nil {
			return symbols
		}
		keys := []*checker.Type{key}
		if key.Flags()&checker.TypeFlagsUnion != 0 {
			keys = key.Types()
		}
		for _, member := range keys {
			if member.Flags()&checker.TypeFlagsStringLiteral != 0 {
				if name, valid := member.AsLiteralType().Value().(string); valid {
					add(typeChecker.GetPropertyOfType(receiver, name))
				}
			}
		}
	}
	return symbols
}

// collectSelectedMemberPolicy records instantiated qualification without changing generic bodies.
// Typed facts are refined at each use so another instantiation can retain a public result.
func collectSelectedMemberPolicy(node, selectedDeclaration *ast.Node, symbol *ast.Symbol, policy DataPolicy, analysis *policyAnalysis, addSubject func(PolicySubject)) {
	id := ast.GetSymbolId(symbol)
	if existing, exists := analysis.subjects.symbols[id]; exists && existing.Policy.Secret {
		return
	}
	declarations := symbol.Declarations
	if selectedDeclaration != nil && policyDeclarationKind(selectedDeclaration) == "return" {
		declarations = []*ast.Node{selectedDeclaration}
	}
	for _, declaration := range declarations {
		kind := policyDeclarationKind(declaration)
		if kind != "return" && kind != "field" && kind != "declaration" {
			continue
		}
		owner := ast.GetSourceFileOfNode(declaration)
		if owner == nil {
			continue
		}
		if policyInvocationTarget(node) != nil {
			kind = "return"
		}
		source := "import"
		if annotations := policyNodeAnnotations(declaration, owner); annotations.policy != nil {
			policy = qualifiedDeclarationPolicy(declaration, owner, *annotations.policy, analysis)
			source = "annotation"
		}
		subject := policySubject(declaration, kind, ast.SymbolName(symbol), policy, source)
		subject.ID = policyLocationID(owner, "policy:member", declaration.Pos(), subject.Name)
		addSubject(subject)
		analysis.subjects.symbols[id] = subject
		return
	}
}

// collectSelectedCallPolicy materializes the selected result once, including first-class callables.
// Generic declaration text and another overload's annotation cannot substitute for that result.
func collectSelectedCallPolicy(node, declaration *ast.Node, sourceFile *ast.SourceFile, policy DataPolicy, typeChecker *checker.Checker, analysis *policyAnalysis, addSubject func(PolicySubject)) {
	source := "import"
	if declaration != nil {
		owner := ast.GetSourceFileOfNode(declaration)
		if owner != nil {
			if annotations := policyNodeAnnotations(declaration, owner); annotations.policy != nil {
				policy = qualifiedDeclarationPolicy(declaration, owner, *annotations.policy, analysis)
				source = "annotation"
			}
		}
	}
	if declaration == nil || policyDeclarationKind(declaration) != "return" {
		for _, symbol := range policyCallSymbols(node, typeChecker) {
			if subject, exists := analysis.subjects.symbols[ast.GetSymbolId(symbol)]; exists && subject.Source == "annotation" {
				source = "annotation"
				break
			}
		}
	}
	name := policyInvocationName(policyInvocationTarget(node))
	subject := policySubject(node, "return", name, policy, source)
	subject.ID = policyLocationID(sourceFile, "policy:return", node.Pos(), name)
	addSubject(subject)
	analysis.subjects.calls[nodeSpanKey(node)] = subject
}
