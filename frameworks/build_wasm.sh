#!/bin/bash
# Build script for FEA Solver WASM module

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FEA_SOLVER_DIR="$SCRIPT_DIR/../fea-solver"
OUTPUT_DIR="$SCRIPT_DIR/assets/js"

echo "🔧 Building FEA Solver WASM module..."

# Check if wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo "Installing wasm-pack..."
    cargo install wasm-pack
fi

# Build the WASM module
cd "$FEA_SOLVER_DIR"
echo "📦 Compiling Rust to WebAssembly..."
wasm-pack build --target web --out-dir "$OUTPUT_DIR/wasm-pkg" --no-typescript -- --features wasm --no-default-features

# The output files will be:
# - fea_solver_wasm.js (JavaScript bindings)
# - fea_solver_wasm_bg.wasm (WebAssembly binary)

# Copy to the correct location expected by the worker
cp "$OUTPUT_DIR/wasm-pkg/fea_solver.js" "$OUTPUT_DIR/fea_solver_wasm.js" 2>/dev/null || true
cp "$OUTPUT_DIR/wasm-pkg/fea_solver_bg.wasm" "$OUTPUT_DIR/fea_solver_wasm_bg.wasm" 2>/dev/null || true

echo "✅ WASM build complete!"
echo ""
echo "Output files:"
ls -la "$OUTPUT_DIR"/fea_solver_wasm* 2>/dev/null || ls -la "$OUTPUT_DIR/wasm-pkg"
echo ""
echo "To use the WASM solver, make sure your web server serves .wasm files with:"
echo "  Content-Type: application/wasm"
