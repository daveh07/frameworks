use dioxus::prelude::*;
use dioxus::document::eval;

const CONSOLE_SCRIPT: &str = r#"
(function() {
    // Console state
    window.consoleLines = [];
    window.consoleMinimized = false;
    
    // Add line to console
    window.addConsoleLine = function(tag, message, type) {
        type = type || 'info';
        const content = document.getElementById('console-content');
        if (!content) return;
        
        const now = new Date();
        const timestamp = now.toLocaleTimeString('en-US', { hour12: false });
        
        const line = document.createElement('div');
        line.className = 'console-line';
        line.innerHTML = `
            <span class="console-timestamp">${timestamp}</span>
            <span class="console-tag console-tag-${type}">[${tag}]</span>
            <span class="console-text">${message}</span>
        `;
        content.appendChild(line);
        content.scrollTop = content.scrollHeight;
        
        window.consoleLines.push({ timestamp, tag, message, type });
    };
    
    // Clear console
    window.clearConsole = function() {
        const content = document.getElementById('console-content');
        if (content) {
            content.innerHTML = '';
            window.consoleLines = [];
            window.addConsoleLine('INFO', 'Console cleared', 'info');
        }
    };
    
    // Toggle console minimize
    window.toggleConsole = function() {
        const panel = document.getElementById('console-panel');
        const splitter = document.getElementById('console-splitter');
        if (panel) {
            window.consoleMinimized = !window.consoleMinimized;
            if (window.consoleMinimized) {
                panel.style.height = '32px';
                if (splitter) splitter.style.display = 'none';
            } else {
                panel.style.height = window.lastConsoleHeight || '180px';
                if (splitter) splitter.style.display = 'block';
            }
        }
    };
    
    // Log model summary
    window.logModelSummary = function() {
        if (!window.sceneData) return;
        
        const nodes = window.sceneData.nodesGroup?.children?.length || 0;
        const beams = window.sceneData.beamsGroup?.children?.length || 0;
        const plates = window.sceneData.platesGroup?.children?.length || 0;
        
        window.addConsoleLine('MODEL', '─────────────────────────────────', 'info');
        window.addConsoleLine('MODEL', `Nodes: ${nodes}`, 'info');
        window.addConsoleLine('MODEL', `Beams: ${beams}`, 'info');
        window.addConsoleLine('MODEL', `Plates: ${plates}`, 'info');
        
        // Count constraints
        let fixedCount = 0, pinnedCount = 0, rollerCount = 0;
        if (window.sceneData.nodesGroup) {
            window.sceneData.nodesGroup.children.forEach(node => {
                if (node.userData?.constraint) {
                    const type = node.userData.constraint.type?.toLowerCase();
                    if (type === 'fixed') fixedCount++;
                    else if (type === 'pinned') pinnedCount++;
                    else if (type === 'roller') rollerCount++;
                }
            });
        }
        window.addConsoleLine('MODEL', `Supports: ${fixedCount} fixed, ${pinnedCount} pinned, ${rollerCount} roller`, 'info');
        window.addConsoleLine('MODEL', '─────────────────────────────────', 'info');
    };
    
    // Log analysis start
    window.logAnalysisStart = function(analysisType) {
        window.addConsoleLine('ANALYSIS', '═══════════════════════════════════', 'ready');
        window.addConsoleLine('ANALYSIS', `Starting ${analysisType || 'Static'} Analysis...`, 'ready');
        window.addConsoleLine('ANALYSIS', '═══════════════════════════════════', 'ready');
        window.logModelSummary();
    };
    
    // Log analysis progress
    window.logAnalysisProgress = function(step, message) {
        window.addConsoleLine('CALC', `[${step}] ${message}`, 'info');
    };
    
    // Log analysis results
    window.logAnalysisResults = function(results) {
        window.addConsoleLine('RESULTS', '═══════════════════════════════════', 'success');
        window.addConsoleLine('RESULTS', 'Analysis Complete!', 'success');
        window.addConsoleLine('RESULTS', '───────────────────────────────────', 'success');
        
        if (results) {
            if (results.max_displacement !== undefined) {
                window.addConsoleLine('RESULTS', `Max Displacement: ${(results.max_displacement * 1000).toFixed(3)} mm`, 'success');
            }
            if (results.max_stress !== undefined) {
                window.addConsoleLine('RESULTS', `Max Stress: ${(results.max_stress / 1e6).toFixed(2)} MPa`, 'success');
            }
            if (results.max_beam_stress !== undefined) {
                window.addConsoleLine('RESULTS', `Max Beam Stress: ${(results.max_beam_stress / 1e6).toFixed(2)} MPa`, 'success');
            }
            if (results.beam_forces?.length > 0) {
                window.addConsoleLine('RESULTS', `Beam Forces: ${results.beam_forces.length} elements processed`, 'success');
            }
            if (results.nodal_displacements?.length > 0) {
                window.addConsoleLine('RESULTS', `Nodal Results: ${results.nodal_displacements.length} nodes`, 'success');
            }
        }
        window.addConsoleLine('RESULTS', '═══════════════════════════════════', 'success');
    };
    
    // Log error
    window.logError = function(message) {
        window.addConsoleLine('ERROR', message, 'error');
    };
    
    // Log warning
    window.logWarning = function(message) {
        window.addConsoleLine('WARN', message, 'warning');
    };
    
    // Splitter drag functionality
    const splitter = document.getElementById('console-splitter');
    const panel = document.getElementById('console-panel');
    let isDragging = false;
    
    if (splitter && panel) {
        splitter.addEventListener('mousedown', function(e) {
            isDragging = true;
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            
            const container = panel.parentElement;
            if (!container) return;
            
            const containerRect = container.getBoundingClientRect();
            const newHeight = containerRect.bottom - e.clientY;
            
            // Clamp between 80px and 400px
            const clampedHeight = Math.max(80, Math.min(400, newHeight));
            panel.style.height = clampedHeight + 'px';
            window.lastConsoleHeight = clampedHeight + 'px';
            
            // Trigger resize event for Three.js canvas
            window.dispatchEvent(new Event('resize'));
        });
        
        document.addEventListener('mouseup', function() {
            if (isDragging) {
                isDragging = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    }
    
    // Initial log
    setTimeout(function() {
        window.addConsoleLine('INFO', 'Ready for modeling and analysis', 'ready');
    }, 100);
})();
"#;

#[component]
pub fn Console() -> Element {
    rsx! {
        // Splitter handle for resizing
        div { 
            class: "console-splitter",
            id: "console-splitter"
        }
        div { 
            class: "console-panel",
            id: "console-panel",
            div { class: "console-header",
                span { class: "console-title", "Console Output" }
                div { class: "console-controls",
                    button { 
                        class: "console-btn",
                        title: "Clear console",
                        onclick: move |_| {
                            let _ = eval(r#"
                                if (window.clearConsole) window.clearConsole();
                            "#);
                        },
                        "Clear"
                    }
                    button { 
                        class: "console-btn",
                        title: "Minimize",
                        onclick: move |_| {
                            let _ = eval(r#"
                                if (window.toggleConsole) window.toggleConsole();
                            "#);
                        },
                        "-"
                    }
                }
            }
            div { 
                class: "console-content",
                id: "console-content",
                // Initial welcome message
                div { class: "console-line",
                    span { class: "console-timestamp", "" }
                    span { class: "console-tag console-tag-info", "[INFO]" }
                    span { class: "console-text", "Frameworkz Console initialized" }
                }
            }
        }
        // JavaScript for console functionality
        script { {CONSOLE_SCRIPT} }
    }
}
