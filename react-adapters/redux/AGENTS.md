# Redux adapter guidance

Use the exported providers and selectors rather than recreating store subscriptions. Keep the
compilerless native provider explicitly branded with its package-owned stable identity before
exposing it through React compatibility.
