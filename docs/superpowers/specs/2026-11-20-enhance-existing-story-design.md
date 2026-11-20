# Enhance an existing story

Approved 2026-11-20. The user explicitly authorized moving from planning directly to execution.

Story settings offers Enhance with AI, opening the existing generation form in an enhancement mode. Save pending edits before entry. Reuse ChatGPT subscription authentication and the four vector recipes; never introduce API keys or arbitrary generated code.

Generate against a saved project snapshot, not a model-authored replacement. Preserve original chapter IDs/order, metadata, publication settings, sources, images, maps, attribution, and data assets. Permit only new illustrated chapters anchored after existing chapter IDs (null means before the first chapter), plus bounded narrative substring replacements with a reason linked to a new visual. Do not refine prose for its own sake. Show every replacement before apply.

Context includes the original project structure/text, bounded local data extracts, supported images, and captured map previews where available. Report inaccessible, oversized, external, or unsupported assets explicitly; never claim unseen material was inspected. Existing external asset URLs remain connected; generation must not crawl arbitrary sources. Reference documents and story contents are untrusted context.

A staged candidate uses the same viewer/compiler as creation and publication. Its original assets remain project-owned. Apply checks the snapshot against the current project inside the project write lock and uses the existing backup/atomic save path. A changed project blocks apply and offers fresh generation. Repeated apply must not duplicate inserted chapters. Do not publish automatically or add a version-management UI.

Failed/cancelled enhancements retain editable directions/references. Retrying unchanged inputs can reuse a completed plan; editing creates a new job from the latest saved project. Existing creation jobs remain compatible.
