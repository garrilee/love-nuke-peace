# GPU runtime implementation - 2026-11-15

## Baseline and environment

- Main baseline: 37da47b. Rebuilt dev starts from this exact tree; old dev is archived.
- Chrome 156.0.8078.74 launches independently through the existing Playwright test runner. Hardware WebGL2 reports AMD Radeon 780M / ANGLE D3D11, a rendered pixel reads correctly, and EXT_disjoint_timer_query_webgl2 is available. No browser extension is required. The interactive browser-control host is unavailable; tests use an isolated browser, not personal tabs.
- Retain main's classic JS source organization. Full TS migration is deferred by the user's explicit selection.

## Phases

1. Establish current-main baseline and feature map. Profile live combat, render passes, GPU timing, texture/geometry uploads, frame schedulers and DOM mutations. Commit the revised design and baseline alignment.
2. Optimize GPU work and resource ownership in js/render/gl.js, glscene.js and directly relevant asset code. Preserve the full effect inventory. Validate controlled visuals, hardware path, heavy effects and lifecycle recovery. Commit as one rendering change.
3. Optimize presentation scheduling and native DOM updates in js/main.js and js/ui as justified by measurements. Keep simulation/net timing intact. Validate input, hidden-panel/restart behavior and deterministic state. Commit separately.
4. Run main/candidate 120-second desktop combat comparison with CPU/GPU/call/upload curves, inspect full effect screenshots, exercise representative features and save a final report. Record shortcomings honestly; no push without user instruction.

## Source-to-target map

- js/config.js, util.js, icons.js, map.js: intact baseline constants, shared helpers and assets.
- js/sim/*, ai.js: intact authoritative gameplay, including new weapons, boss and crates.
- js/net.js: intact lobby, commands, events, snapshots, client interpolation and background host.
- js/audio.js: intact audio behavior.
- js/render/*, fx.js: same effect categories and ordering; optimize renderer ownership, batches/uploads/postprocessing and bounded presentation work.
- js/ui/*, index.html, style.css, tools/balance.html: latest controls, menus, HUD, developer panel and balance tool preserved; targeted retained-node/cadence improvements only.

## Status

- Environment verification complete. Baseline restored; old dev archived. Design revised before implementation.
- Current-main combat profiling identified per-particle Sprite transforms, full-capacity trail uploads, and frequent HUD subtree replacement.
- GPU implementation complete: instanced smoke/glow layers with a shared atlas, live trail uploads, empty-bloom suppression. All five nuclear effect levels and dynamic ultimate textures were compared against Sprite rendering. Context loss and automatic restoration passed with active particles; Canvas fallback remains functional.
- Native HUD retention and inactive-view draw suppression are complete. Ranking rows retain identity through value/sort changes; research and resource counters use retained HTML. Browser checks passed for target selection, firing all three ammo types, research choice, abilities, crates, allocation, pause, developer lights, portrait layout, survival/quick restart, GPU context recovery and Canvas fallback. The unchanged multiplayer worker still advances a host without RAF. No presentation work is submitted from inactive frame callbacks.
- Full 180-second simulation snapshots match main exactly. Three-AI 120-second live combat completed on both revisions with equivalent starting state, approximately 177 live particles and 11 projectiles on average, no early game end, no errors and quality 1. Final report and evidence packaging are in progress.
