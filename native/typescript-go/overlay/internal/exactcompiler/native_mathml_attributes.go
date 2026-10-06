package exactcompiler

// appendMathMLAttributeNames completes the DOM-derived prop catalog with MathML Core attributes
// that have no reflected IDL property. Keep these names confined to their MathML element surface.
// The owning attribute definitions are https://www.w3.org/TR/mathml-core/#elements-and-attributes.
func appendMathMLAttributeNames(names map[string]string, tag string) {
	for _, name := range []string{"displaystyle", "scriptlevel", "mathbackground", "mathcolor", "mathsize", "intent", "arg"} {
		names[name] = name
	}
	var local []string
	switch tag {
	case "math":
		local = []string{"display", "alttext"}
	case "mi":
		local = []string{"mathvariant"}
	case "mo":
		local = []string{"form", "fence", "separator", "lspace", "rspace", "stretchy", "symmetric", "maxsize", "minsize", "largeop", "movablelimits"}
	case "mspace":
		local = []string{"width", "height", "depth"}
	case "ms":
		local = []string{"lquote", "rquote"}
	case "mfrac":
		local = []string{"linethickness"}
	case "mpadded":
		local = []string{"width", "height", "depth", "lspace", "voffset"}
	case "munder":
		local = []string{"accentunder"}
	case "mover":
		local = []string{"accent"}
	case "munderover":
		local = []string{"accent", "accentunder"}
	case "mtd":
		local = []string{"columnspan", "rowspan"}
	case "maction":
		local = []string{"actiontype", "selection"}
	case "annotation", "annotation-xml":
		local = []string{"encoding"}
	}
	for _, name := range local {
		names[name] = name
	}
}
