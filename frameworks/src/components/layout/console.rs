use dioxus::prelude::*;
use dioxus::document::eval;

#[derive(Clone, PartialEq)]
pub enum ConsoleTab {
    Messages,
    SolverLog,
    Results,
}

#[component]
pub fn Console() -> Element {
    let mut active_tab = use_signal(|| ConsoleTab::SolverLog);
    let mut show_table_panel = use_signal(|| false);
    
    // Initialize console output handler on mount
    use_effect(move || {
        spawn(async move {
            let _ = eval(r#"
                // Console output capture
                window.consoleMessages = window.consoleMessages || [];
                window.solverLogs = window.solverLogs || [];
                window.analysisResultsSummary = window.analysisResultsSummary || null;
                
                // Function to add message to console
                window.addConsoleMessage = function(tag, message, type = 'info') {
                    const msg = { tag, message, type, timestamp: new Date().toISOString() };
                    window.consoleMessages.push(msg);
                    
                    const container = document.querySelector('.console-messages-content');
                    if (container) {
                        const line = document.createElement('div');
                        line.className = 'console-line';
                        line.innerHTML = '<span class="console-tag console-tag-' + type + '">[' + tag + ']</span><span class="console-text">' + message + '</span>';
                        container.appendChild(line);
                        container.scrollTop = container.scrollHeight;
                    }
                };
                
                // Function to add solver log
                window.addSolverLog = function(message, type = 'info') {
                    const log = { message, type, timestamp: new Date().toISOString() };
                    window.solverLogs.push(log);
                    
                    const container = document.querySelector('.solver-log-content');
                    if (container) {
                        const line = document.createElement('div');
                        line.className = 'console-line';
                        const tagClass = type === 'error' ? 'console-tag-error' : 
                                        type === 'warning' ? 'console-tag-warning' : 
                                        type === 'success' ? 'console-tag-ready' : 'console-tag-info';
                        line.innerHTML = '<span class="console-tag ' + tagClass + '">[' + type.toUpperCase() + ']</span><span class="console-text">' + message + '</span>';
                        container.appendChild(line);
                        container.scrollTop = container.scrollHeight;
                    }
                };
                
                // Function to update results summary
                window.updateResultsSummary = function(results) {
                    window.analysisResultsSummary = results;
                    
                    const container = document.querySelector('.results-summary-content');
                    if (!container || !results) return;
                    
                    let html = '<div class="results-section">';
                    html += '<h4>Analysis Summary</h4>';
                    html += '<div class="result-item"><span class="result-label">Max Displacement:</span><span class="result-value">' + 
                            (results.max_displacement * 1000).toFixed(4) + ' mm</span></div>';
                    html += '<div class="result-item"><span class="result-label">Max Stress:</span><span class="result-value">' + 
                            (results.max_stress / 1e6).toFixed(2) + ' MPa</span></div>';
                    
                    if (results.displacements && results.displacements.length > 0) {
                        html += '<div class="result-item"><span class="result-label">Nodes Analyzed:</span><span class="result-value">' + 
                                results.displacements.length + '</span></div>';
                    }
                    
                    if (results.beam_forces && results.beam_forces.length > 0) {
                        html += '<div class="result-item"><span class="result-label">Beam Elements:</span><span class="result-value">' + 
                                results.beam_forces.length + '</span></div>';
                    }
                    
                    html += '</div>';
                    container.innerHTML = html;
                };
                
                // Update tables panel - supports both legacy format and FEA server format
                window.updateTablesPanel = function(results) {
                    if (!results) return;
                    
                    // Also check for FEA results in window.feaResults
                    const feaResults = window.feaResults;
                    
                    // Update displacements table
                    const dispTable = document.querySelector('.displacements-table tbody');
                    if (dispTable) {
                        let html = '';
                        // Try FEA format first (node_displacements), then legacy format (displacements)
                        const disps = feaResults?.node_displacements || results?.displacements || [];
                        disps.forEach(function(d) {
                            html += '<tr>';
                            // Handle both formats: node (string) or node_id (number)
                            const nodeName = d.node !== undefined ? d.node : (d.node_id !== undefined ? (d.node_id + 1) : '?');
                            html += '<td>' + nodeName + '</td>';
                            html += '<td>' + (d.dx * 1000).toFixed(4) + '</td>';
                            html += '<td>' + (d.dy * 1000).toFixed(4) + '</td>';
                            html += '<td>' + (d.dz * 1000).toFixed(4) + '</td>';
                            const mag = Math.sqrt(d.dx*d.dx + d.dy*d.dy + d.dz*d.dz) * 1000;
                            html += '<td>' + mag.toFixed(4) + '</td>';
                            html += '</tr>';
                        });
                        dispTable.innerHTML = html;
                    }
                    
                    // Update reactions table
                    const reactTable = document.querySelector('.reactions-table tbody');
                    if (reactTable) {
                        let html = '';
                        // Try FEA format first, then legacy format
                        const reactions = feaResults?.reactions || results?.reactions || [];
                        reactions.forEach(function(r) {
                            html += '<tr>';
                            // Handle both formats: node (string) or node_id (number)
                            const nodeName = r.node !== undefined ? r.node : (r.node_id !== undefined ? (r.node_id + 1) : '?');
                            html += '<td>' + nodeName + '</td>';
                            html += '<td>' + (r.fx/1000).toFixed(2) + '</td>';
                            html += '<td>' + (r.fy/1000).toFixed(2) + '</td>';
                            html += '<td>' + (r.fz/1000).toFixed(2) + '</td>';
                            html += '<td>' + ((r.mx || 0)/1000).toFixed(2) + '</td>';
                            html += '<td>' + ((r.my || 0)/1000).toFixed(2) + '</td>';
                            html += '<td>' + ((r.mz || 0)/1000).toFixed(2) + '</td>';
                            html += '</tr>';
                        });
                        reactTable.innerHTML = html;
                    }
                    
                    // Update beam forces table
                    const beamTable = document.querySelector('.beam-forces-table tbody');
                    if (beamTable) {
                        let html = '';
                        // Try FEA format first (member_forces), then legacy format (beam_forces)
                        const forces = feaResults?.member_forces || results?.beam_forces || [];
                        forces.forEach(function(bf) {
                            html += '<tr>';
                            // Handle both formats: member (string) or element_id (number)
                            const elemName = bf.member !== undefined ? bf.member : (bf.element_id !== undefined ? (bf.element_id + 1) : '?');
                            html += '<td>' + elemName + '</td>';
                            // Handle both formats for force data
                            const axial = bf.axial_i !== undefined ? bf.axial_i : (bf.axial_force || 0);
                            const vy = bf.shear_y_i !== undefined ? bf.shear_y_i : (bf.shear_y || 0);
                            const vz = bf.shear_z_i !== undefined ? bf.shear_z_i : (bf.shear_z || 0);
                            const my = bf.moment_y_i !== undefined ? bf.moment_y_i : (bf.moment_y || 0);
                            const mz = bf.moment_z_i !== undefined ? bf.moment_z_i : (bf.moment_z || 0);
                            html += '<td>' + (axial/1000).toFixed(2) + '</td>';
                            html += '<td>' + (vy/1000).toFixed(2) + '</td>';
                            html += '<td>' + (vz/1000).toFixed(2) + '</td>';
                            html += '<td>' + (my/1000).toFixed(2) + '</td>';
                            html += '<td>' + (mz/1000).toFixed(2) + '</td>';
                            html += '</tr>';
                        });
                        beamTable.innerHTML = html;
                    }
                    
                    // Update stresses table
                    const stressTable = document.querySelector('.stresses-table tbody');
                    if (stressTable && results.stresses) {
                        let html = '';
                        results.stresses.forEach(function(s) {
                            html += '<tr>';
                            html += '<td>' + (s.node_id + 1) + '</td>'; // Display 1-based
                            html += '<td>' + (s.von_mises/1e6).toFixed(2) + '</td>';
                            html += '<td>' + ((s.von_mises_top || s.von_mises)/1e6).toFixed(2) + '</td>';
                            html += '<td>' + ((s.von_mises_bottom || s.von_mises)/1e6).toFixed(2) + '</td>';
                            html += '</tr>';
                        });
                        stressTable.innerHTML = html;
                    }
                };
                
                // Hook into analysis results update
                const originalUpdateResults = window.updateAnalysisResults;
                window.updateAnalysisResults = function(results) {
                    if (originalUpdateResults) originalUpdateResults(results);
                    
                    window.addSolverLog('Analysis completed successfully', 'success');
                    window.addSolverLog('Max displacement: ' + (results.max_displacement * 1000).toFixed(4) + ' mm', 'info');
                    window.addSolverLog('Max stress: ' + (results.max_stress / 1e6).toFixed(2) + ' MPa', 'info');
                    
                    if (results.displacements) {
                        window.addSolverLog('Nodes with displacements: ' + results.displacements.length, 'info');
                        // Log actual displacement values for debugging
                        results.displacements.forEach(function(d, i) {
                            if (i < 3) {
                                const mag = Math.sqrt(d.dx*d.dx + d.dy*d.dy + d.dz*d.dz) * 1000;
                                console.log('Displacement node ' + d.node_id + ': dx=' + (d.dx*1000).toFixed(4) + 'mm, dy=' + (d.dy*1000).toFixed(4) + 'mm, dz=' + (d.dz*1000).toFixed(4) + 'mm, mag=' + mag.toFixed(4) + 'mm');
                            }
                        });
                    }
                    
                    if (results.reactions && results.reactions.length > 0) {
                        window.addSolverLog('Reaction nodes: ' + results.reactions.length, 'info');
                    } else {
                        window.addSolverLog('No reactions found', 'warning');
                    }
                    
                    window.updateResultsSummary(results);
                    window.updateTablesPanel(results);
                };
                
                // Console vertical resize functionality (height)
                window.initConsoleResize = function() {
                    const handle = document.querySelector('.console-resize-handle');
                    const container = document.querySelector('.console-container');
                    const viewportContainer = document.querySelector('.viewport-container');
                    
                    if (!handle || !container || !viewportContainer) return;
                    
                    let isDragging = false;
                    
                    handle.addEventListener('mousedown', function(e) {
                        isDragging = true;
                        document.body.style.cursor = 'ns-resize';
                        document.body.style.userSelect = 'none';
                        e.preventDefault();
                    });
                    
                    document.addEventListener('mousemove', function(e) {
                        if (!isDragging) return;
                        
                        const viewportRect = viewportContainer.getBoundingClientRect();
                        const newHeight = viewportRect.bottom - e.clientY;
                        const clampedHeight = Math.max(80, Math.min(newHeight, viewportRect.height - 100));
                        container.style.height = clampedHeight + 'px';
                    });
                    
                    document.addEventListener('mouseup', function() {
                        if (isDragging) {
                            isDragging = false;
                            document.body.style.cursor = '';
                            document.body.style.userSelect = '';
                        }
                    });
                };
                
                // Console horizontal split resize functionality (tables panel width)
                window.initConsoleSplitResize = function() {
                    const handle = document.querySelector('.console-vsplit-handle');
                    const tablesPanel = document.querySelector('.tables-panel');
                    const consoleBody = document.querySelector('.console-body');
                    
                    if (!handle || !tablesPanel || !consoleBody) return;
                    
                    let isDragging = false;
                    
                    handle.addEventListener('mousedown', function(e) {
                        isDragging = true;
                        document.body.style.cursor = 'ew-resize';
                        document.body.style.userSelect = 'none';
                        e.preventDefault();
                    });
                    
                    document.addEventListener('mousemove', function(e) {
                        if (!isDragging) return;
                        
                        const bodyRect = consoleBody.getBoundingClientRect();
                        const newWidth = bodyRect.right - e.clientX;
                        const clampedWidth = Math.max(200, Math.min(newWidth, bodyRect.width - 200));
                        tablesPanel.style.width = clampedWidth + 'px';
                    });
                    
                    document.addEventListener('mouseup', function() {
                        if (isDragging) {
                            isDragging = false;
                            document.body.style.cursor = '';
                            document.body.style.userSelect = '';
                        }
                    });
                };
                
                // Initialize resize after a short delay
                setTimeout(function() {
                    window.initConsoleResize();
                    window.initConsoleSplitResize();
                }, 100);
                
                // Re-init split resize when tables panel is toggled
                const observer = new MutationObserver(function() {
                    setTimeout(window.initConsoleSplitResize, 50);
                });
                const consoleBody = document.querySelector('.console-body');
                if (consoleBody) {
                    observer.observe(consoleBody, { childList: true });
                }
                
                // Initial ready message
                window.addSolverLog('Console initialized', 'info');
                window.addSolverLog('Ready for analysis', 'success');
            "#).await;
        });
    });

    rsx! {
        div {
            class: "console-container",
            
            // Resize handle
            div { class: "console-resize-handle" }
            
            div { class: "console-panel",
                div { class: "console-header",
                    span { class: "console-title", "Console" }
                    div { class: "console-tabs",
                        span {
                            class: if active_tab() == ConsoleTab::Messages { "console-tab console-tab-active" } else { "console-tab" },
                            onclick: move |_| active_tab.set(ConsoleTab::Messages),
                            "Messages"
                        }
                        span {
                            class: if active_tab() == ConsoleTab::SolverLog { "console-tab console-tab-active" } else { "console-tab" },
                            onclick: move |_| active_tab.set(ConsoleTab::SolverLog),
                            "Solver Log"
                        }
                        span {
                            class: if active_tab() == ConsoleTab::Results { "console-tab console-tab-active" } else { "console-tab" },
                            onclick: move |_| active_tab.set(ConsoleTab::Results),
                            "Results"
                        }
                    }
                    div { class: "console-actions",
                        button {
                            class: if show_table_panel() { "console-action-btn active" } else { "console-action-btn" },
                            title: "Toggle Tables Panel",
                            onclick: move |_| show_table_panel.set(!show_table_panel()),
                            "Tables"
                        }
                        button {
                            class: "console-action-btn danger",
                            title: "Clear Console",
                            onclick: move |_| {
                                spawn(async move {
                                    let _ = eval(r#"
                                        window.consoleMessages = [];
                                        window.solverLogs = [];
                                        document.querySelectorAll('.console-messages-content, .solver-log-content').forEach(function(el) { el.innerHTML = ''; });
                                        window.addSolverLog('Console cleared', 'info');
                                    "#).await;
                                });
                            },
                            "Clear"
                        }
                    }
                }
                
                div { class: "console-body",
                    // Main console area (left side)
                    div { class: "console-main",
                        // Messages tab content
                        div {
                            class: "console-content console-messages-content",
                            style: if active_tab() == ConsoleTab::Messages { "display: block;" } else { "display: none;" },
                            div { class: "console-line",
                                span { class: "console-tag console-tag-info", "[INFO]" }
                                span { class: "console-text", "Console ready" }
                            }
                        }
                        
                        // Solver Log tab content
                        div {
                            class: "console-content solver-log-content",
                            style: if active_tab() == ConsoleTab::SolverLog { "display: block;" } else { "display: none;" },
                        }
                        
                        // Results Summary tab content
                        div {
                            class: "console-content results-summary-content",
                            style: if active_tab() == ConsoleTab::Results { "display: block;" } else { "display: none;" },
                            div { class: "results-placeholder",
                                "Run an analysis to see results summary here."
                            }
                        }
                    }
                    
                    // Tables panel (right side - always inside console-body for split)
                    if show_table_panel() {
                        // Vertical splitter for horizontal resize
                        div { class: "console-vsplit-handle" }
                        
                        div { class: "tables-panel",
                            div { class: "tables-header",
                                span { "Tabulated Results" }
                                button {
                                    class: "tables-close-btn",
                                    onclick: move |_| show_table_panel.set(false),
                                    "×"
                                }
                            }
                            div { class: "tables-content",
                                // Displacements Table
                                div { class: "table-section",
                                    h4 { "Displacements (mm)" }
                                    table { class: "data-table displacements-table",
                                        thead {
                                            tr {
                                                th { "Node" }
                                                th { "DX" }
                                                th { "DY" }
                                                th { "DZ" }
                                                th { "Mag" }
                                            }
                                        }
                                        tbody {}
                                    }
                                }
                                
                                // Reactions Table
                                div { class: "table-section",
                                    h4 { "Reactions (kN, kN·m)" }
                                    table { class: "data-table reactions-table",
                                        thead {
                                            tr {
                                                th { "Node" }
                                                th { "Fx" }
                                                th { "Fy" }
                                                th { "Fz" }
                                                th { "Mx" }
                                                th { "My" }
                                                th { "Mz" }
                                            }
                                        }
                                        tbody {}
                                    }
                                }
                                
                                // Beam Forces Table
                                div { class: "table-section",
                                    h4 { "Beam Forces (kN, kN·m)" }
                                    table { class: "data-table beam-forces-table",
                                        thead {
                                            tr {
                                                th { "Elem" }
                                                th { "Axial" }
                                                th { "Vy" }
                                                th { "Vz" }
                                                th { "My" }
                                                th { "Mz" }
                                            }
                                        }
                                        tbody {}
                                    }
                                }
                                
                                // Stresses Table
                                div { class: "table-section",
                                    h4 { "Stresses (MPa)" }
                                    table { class: "data-table stresses-table",
                                        thead {
                                            tr {
                                                th { "Node" }
                                                th { "VM" }
                                                th { "Top" }
                                                th { "Bot" }
                                            }
                                        }
                                        tbody {}
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}