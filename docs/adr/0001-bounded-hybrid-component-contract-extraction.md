# Use bounded hybrid component-contract extraction

BYOL resolves component type semantics with its pinned TypeScript compiler and standard library, using only the approved repository commit and exact locked declaration closure. Framework adapters and syntax analysis add provenance, defaults, variants, tokens, fixtures, and state meaning; repository code, scripts, plugins, and compiler configuration never execute. This trades perfect reproduction of every repository compiler quirk for deterministic, sandboxed, auditable extraction, with version mismatches recorded as discrepancies.
