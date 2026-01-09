# JavaScript Source Files

This directory contains the **source of truth** for all JavaScript files used in the frontend.

## How It Works

The `build.rs` script in the project root automatically syncs these files to `public/js/` whenever you build the project:

```bash
cargo build
# or
dx serve
```

## Important Rules

1. **Always edit files HERE** (`src/components/visualization/js/`), not in `public/js/`
2. Files in `public/js/` are **generated** - they get overwritten on build
3. The sync only happens when source files are newer than destination files

## File Structure

- `three_canvas.js` - Main Three.js canvas initialization and exports
- `fea_integration.js` - FEA solver integration and result visualization
- `geometry_manager.js` - Node, beam, and plate geometry creation
- `interaction_handlers.js` - Mouse/keyboard interaction handling
- `loads_manager.js` - Load visualization (distributed loads, point loads)
- `constraints_manager.js` - Support/constraint visualization
- `analysis_diagrams.js` - BMD, SFD, deformed shape diagrams
- `labels_manager.js` - Text labels and annotations
- `scene_setup.js` - Three.js scene, camera, lighting setup
- `meshing_manager.js` - Mesh generation for plates
- `structure_exporter.js` - Export structure data for analysis
- `extract_structure_data.js` - Extract geometry from Three.js scene
- `analysis_results.js` - Analysis results display utilities

## Troubleshooting

If changes don't appear:
1. Make sure you edited files in `src/components/visualization/js/` (not `public/js/`)
2. Run `cargo build` or `dx serve` to trigger sync
3. Hard refresh browser (Ctrl+Shift+R)
