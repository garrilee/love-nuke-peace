# GPU-first runtime optimization

## Authority and scope

This design supersedes the 2026-11-09 technical-refactor design. The functional baseline is main `37da47b639c56d87b14590eeb30c050f7ab1326c`. The previous dev is retained at `archive/dev-before-main-gpu-20261115`; its Canvas-returning GPU adapter and old gameplay are not the migration source. User direction on 2026-11-15 permits reasonable presentation frame-rate/effect-density reductions while retaining all effect categories and broadly equivalent appearance. Full TypeScript migration is explicitly deferred. No Vue is introduced.

## Functional parity

Copy the current main runtime intact before optimization. Preserve configuration, map generation, RNG, all races and AI levels, production/research choices, rockets/aircraft/drones/guards/motorcycles, air combat and interception, crates, boss/dimensional attacks, endings, input, audio, settings, developer panel and multiplayer protocol/background hosting. Gameplay timers and authoritative simulation must not change with render quality. Simulation, AI, networking and game configuration remain unchanged unless a measured presentation issue requires a narrowly scoped integration change.

## Rendering and lifecycle

Keep main's PixiJS 7.4.2 GPU compositor. Canvas remains a procedural asset rasterizer and the existing compatibility renderer, not a per-frame destination for WebGL output. Reuse textures, sprite pools, geometry and render targets; only upload used or changed data. Preserve layer order, blend modes, fireballs, bloom, shockwave distortion, damage numbers, trails and screen effects.

Prioritize measured avoidable work before reducing fidelity. Bound postprocessing pixel work and update frequency separately from sharp text/UI and simulation. Do not infer GPU cost from synchronous JavaScript render duration. If hardware timer queries are supported, collect asynchronous valid samples without blocking; fallback devices must remain functional without relying on that extension. Do not force high-performance hardware policy as a substitute for reducing work.

One game frame scheduler owns updates. Pixi must not create a second persistent animation loop. Menus, hidden tabs and finished games must avoid unnecessary presentation work while multiplayer host simulation continues through its existing background mechanism. Context loss/recovery and repeated new games must release/reuse resources safely; preserve the Canvas fallback and report genuine renderer failures.

## DOM

Native HTML remains in separate HTML/template files. Static controls retain nodes and listeners. High-frequency counters use whole-value text/style updates only when changed; dynamic combat lists retain keyed rows. Hidden panels synchronize when reopened without rebuilding their content continuously. Moving world objects remain GPU-rendered. Avoid generic DOM diffing and character-level innerHTML edits.

## Verification

Verify hardware WebGL, CPU and GPU frame costs, draw submissions, upload bytes, live particles/projectiles, displayed resolution and quality. Use the same Chrome, seed, difficulty, viewport/DPR and real 120-second AI-combat window on baseline and candidate. Add a controlled heavy-explosion probe and repeat lifecycle checks where a fix changes ownership. Check all gameplay source mappings and deterministic simulation snapshots, then inspect rendered screenshots and representative keyboard/pointer, research, combat, settings, boss and multiplayer flows. Report measured gains and remaining limitations separately; no FPS or energy claims from CPU-only data.
