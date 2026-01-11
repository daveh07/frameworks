// FEA Solver Web Worker
// Runs the WASM-compiled FEA solver in a separate thread to keep UI responsive

let wasmModule = null;
let wasmReady = false;
let pendingRequests = [];

// Initialize WASM module
async function initWasm() {
    try {
        // Import the WASM module from wasm-pkg directory
        const wasm = await import('./wasm-pkg/fea_solver.js');
        await wasm.default();
        wasmModule = wasm;
        wasmReady = true;
        
        console.log(`[WASM Worker] FEA Solver v${wasm.version()} initialized`);
        
        // Process any pending requests
        pendingRequests.forEach(req => processRequest(req));
        pendingRequests = [];
        
        // Notify main thread
        self.postMessage({
            type: 'ready',
            version: wasm.version()
        });
    } catch (error) {
        console.error('[WASM Worker] Failed to initialize WASM:', error);
        self.postMessage({
            type: 'error',
            error: `WASM initialization failed: ${error.message}`
        });
    }
}

// Process analysis request
function processRequest(request) {
    const { id, model, options } = request;
    const startTime = performance.now();
    
    try {
        // Create the request JSON
        const requestJson = JSON.stringify({
            model: model,
            options: options
        });
        
        // Run analysis in WASM
        const resultJson = wasmModule.analyze(requestJson);
        const result = JSON.parse(resultJson);
        
        const elapsed = performance.now() - startTime;
        
        // Send results back to main thread
        self.postMessage({
            type: 'result',
            id: id,
            success: result.success,
            results: result.results,
            error: result.error,
            timing: {
                total_ms: elapsed,
                solver_ms: result.ms_elapsed || elapsed
            }
        });
    } catch (error) {
        self.postMessage({
            type: 'result',
            id: id,
            success: false,
            error: error.message || error.toString(),
            timing: {
                total_ms: performance.now() - startTime
            }
        });
    }
}

// Handle messages from main thread
self.onmessage = function(e) {
    const { type, id, model, options } = e.data;
    
    if (type === 'analyze') {
        if (wasmReady) {
            processRequest({ id, model, options });
        } else {
            // Queue request until WASM is ready
            pendingRequests.push({ id, model, options });
        }
    } else if (type === 'ping') {
        self.postMessage({
            type: 'pong',
            ready: wasmReady
        });
    }
};

// Start initialization
initWasm();
