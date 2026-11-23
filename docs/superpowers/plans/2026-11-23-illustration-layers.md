# Supplied illustration implementation plan

Execute inline in one ready-for-review PR. The user clarified that artwork belongs
to the overall Enhance with AI flow, with no automatic separation.

- [x] Add original illustration and optional aligned prepared-layer inputs to the
      existing brief. Keep ordinary style references distinct and preserve retry inputs.
- [x] Stage bounded, normalized raster assets and send thumbnails with stable source
      IDs to the existing ChatGPT composition request. Validate all returned image IDs.
- [x] Support mixed image/vector scenes in continuous sequences, transitions and
      companion artwork. Keep project source IDs separate from publication asset IDs.
- [x] Preserve the existing whole-story coverage and content-editing constraints.
      Apply approved assets under the project lock and retain them after job deletion.
- [x] Reuse layer editing controls for all scene inspectors and preserve existing
      text labels, custom keyframes and source identities.
- [x] Update shared reader, compiler and archival embedding together. Retain old
      vector schema compatibility and reject inline URLs or unbound image references.
- [x] Verify full flow with disposable projects: upload, generate, preview, approve,
      reopen, export, mobile, reduced motion and archival stills.
- [x] Run baseline checks plus publishing and offline runtime verification; document
      existing formatting issues and the absence of live ChatGPT artistic evaluation.
- [x] Complete independent review and prepare one ready-for-review PR.

Validation: 1,543 tests passed; typecheck, UI/independence checks, editor/viewer,
publication and Storybook builds passed. Publishing without Git and offline runtime
browser proof passed. All changed files pass formatting; the repository-wide check
reports four unchanged baseline files. Browser checks used synthetic artwork and a
deterministic provider; live ChatGPT artistic quality remains a manual evaluation.
