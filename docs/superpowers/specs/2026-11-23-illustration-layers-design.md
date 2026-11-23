# Supplied illustration in story enhancement

The approved capability belongs to **Enhance with AI**. A supplied original image
and optional manually prepared layers anchor a cohesive illustrative experience
across the existing story. The agent receives the original content and its normal
map/data/image context, the author's direction and references, and bounded artwork
thumbnails with stable asset IDs. It composes those images with supporting vectors
in continuous scenes, inserted transitions and companion artwork. A single original
supports whole-image motion; independent objects require prepared layers.

No automatic separation, SVG conversion, image-to-video, image-generation provider
or API keys are introduced. Local image processing validates and normalizes raster
files; the existing subscription connection returns structured scenes with only
known supplied image IDs. Vector-only generation remains supported unchanged.

The existing preview, retry/edit-brief, cancellation and approval flow owns the
candidate lifecycle. Normalized full-resolution originals and layers remain in
staging until approval. Acceptance checks the original snapshot, validates artwork
digests, writes content-addressed files under the project lock and atomically saves
the story. Failures may leave unreferenced files but preserve authored content.
Discarding the generation after acceptance leaves durable story assets intact.

Story v3 scenes gain image layers in visual sequences and companion artwork using
the existing illustrated-chapter primitives. Publication v3 uses separate assetId
references, converted by the compiler; old vector scenes still parse without
migration. Compiler validation, interactive reader and archival figures resolve
these images together. Older readers do not gain this new capability automatically.
Map and chart controls remain in their existing reserved content areas. No new
publication or offline-delivery claim is implied by adding artwork.

Authors review the complete story, then apply with the existing content-preserving
rules. Named layer controls remain available in every scene inspector. Shared
fixtures and tests cover source identity, unsafe/unknown image references, recovery,
asset durability, old vector compatibility, mobile and reduced motion. Synthetic
fixtures verify behavior; the beauty of a real supplied illustration and live model
art direction remain manual evaluation tasks.
