/**
 * Console Logger - Integrates with Dioxus Console component
 * Provides logging and data table functionality
 */

// Initialize console state
window.consoleState = {
    messages: [],
    nodeData: [],
    elementData: [],
    loadData: [],
    resultsData: null
};

/**
 * Log a message to the console panel
 * @param {string} message - The message to log
 * @param {string} type - Message type: 'info', 'ready', 'warning', 'error'
 */
export function logToConsole(message, type = 'info') {
    const tagMap = {
        'info': '[INFO]',
        'ready': '[READY]',
        'warning': '[WARN]',
        'error': '[ERROR]'
    };
    
    const consoleMessage = {
        tag: tagMap[type] || '[INFO]',
        text: message,
        tag_type: type
    };
    
    window.consoleState.messages.push(consoleMessage);
    
    // Dispatch event to trigger Dioxus update
    const event = new CustomEvent('console-log', {
        detail: consoleMessage
    });
    window.dispatchEvent(event);
    
    // Also log to browser console for debugging
    console.log(`${tagMap[type]} ${message}`);
}

/**
 * Clear all console messages
 */
export function clearConsole() {
    window.consoleState.messages = [];
    const event = new CustomEvent('console-clear');
    window.dispatchEvent(event);
}

/**
 * Update node data table
 * @param {Array} nodes - Array of node objects
 */
export function updateNodeData(nodes) {
    if (!nodes || !Array.isArray(nodes)) return;
    
    window.consoleState.nodeData = nodes.map((node, idx) => ({
        id: node.id || idx + 1,
        x: node.x?.toFixed(3) || '0.000',
        y: node.y?.toFixed(3) || '0.000',
        z: node.z?.toFixed(3) || '0.000',
        constraints: formatConstraints(node.constraints)
    }));
    
    updateDataTable('nodes');
}

/**
 * Update element data table
 * @param {Array} elements - Array of element objects
 */
export function updateElementData(elements) {
    if (!elements || !Array.isArray(elements)) return;
    
    window.consoleState.elementData = elements.map((elem, idx) => ({
        id: elem.id || idx + 1,
        type: elem.type || 'Unknown',
        nodes: elem.nodes ? elem.nodes.join(', ') : 'N/A',
        material: elem.material || 'Default'
    }));
    
    updateDataTable('elements');
}

/**
 * Update load data table
 * @param {Array} loads - Array of load objects
 */
export function updateLoadData(loads) {
    if (!loads || !Array.isArray(loads)) return;
    
    window.consoleState.loadData = loads.map((load, idx) => ({
        id: idx + 1,
        type: load.type || 'Unknown',
        magnitude: load.magnitude?.toFixed(2) || '0.00',
        direction: load.direction || 'N/A',
        element: load.element_id || 'N/A'
    }));
    
    updateDataTable('loads');
}

/**
 * Update analysis results data
 * @param {Object} results - Analysis results object
 */
export function updateResultsData(results) {
    if (!results) return;
    
    window.consoleState.resultsData = {
        totalNodes: results.total_nodes || 0,
        totalElements: results.total_elements || 0,
        maxDisplacement: results.max_displacement?.toFixed(6) || '0.000000',
        maxStress: results.max_stress?.toFixed(2) || '0.00',
        solveTime: results.solve_time?.toFixed(3) || '0.000',
        success: results.success || false
    };
    
    updateDataTable('results');
    
    // Log summary
    if (results.success) {
        logToConsole(`Analysis completed in ${window.consoleState.resultsData.solveTime}s`, 'ready');
        logToConsole(`Max displacement: ${window.consoleState.resultsData.maxDisplacement} m`, 'info');
        logToConsole(`Max stress: ${window.consoleState.resultsData.maxStress} kPa`, 'info');
    } else {
        logToConsole('Analysis failed', 'error');
    }
}

/**
 * Update data table in DOM
 * @param {string} tableType - 'nodes', 'elements', 'loads', or 'results'
 */
function updateDataTable(tableType) {
    const contentDiv = document.getElementById('console-data-content');
    if (!contentDiv) return;
    
    let html = '';
    
    switch (tableType) {
        case 'nodes':
            html = generateNodeTable(window.consoleState.nodeData);
            break;
        case 'elements':
            html = generateElementTable(window.consoleState.elementData);
            break;
        case 'loads':
            html = generateLoadTable(window.consoleState.loadData);
            break;
        case 'results':
            html = generateResultsTable(window.consoleState.resultsData);
            break;
    }
    
    // Only update if this tab is active
    const activeTab = document.querySelector('.data-panel-header .console-tab-active');
    if (activeTab && activeTab.textContent.toLowerCase() === tableType) {
        contentDiv.innerHTML = html;
    }
}

/**
 * Generate HTML for node data table
 */
function generateNodeTable(nodes) {
    if (!nodes || nodes.length === 0) {
        return '<div class="data-table-wrapper">No node data available</div>';
    }
    
    let html = '<table class="data-table"><thead><tr>';
    html += '<th>ID</th><th>X (m)</th><th>Y (m)</th><th>Z (m)</th><th>Constraints</th>';
    html += '</tr></thead><tbody>';
    
    nodes.forEach(node => {
        html += `<tr>
            <td>${node.id}</td>
            <td>${node.x}</td>
            <td>${node.y}</td>
            <td>${node.z}</td>
            <td>${node.constraints || 'Free'}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    return html;
}

/**
 * Generate HTML for element data table
 */
function generateElementTable(elements) {
    if (!elements || elements.length === 0) {
        return '<div class="data-table-wrapper">No element data available</div>';
    }
    
    let html = '<table class="data-table"><thead><tr>';
    html += '<th>ID</th><th>Type</th><th>Nodes</th><th>Material</th>';
    html += '</tr></thead><tbody>';
    
    elements.forEach(elem => {
        html += `<tr>
            <td>${elem.id}</td>
            <td>${elem.type}</td>
            <td>${elem.nodes}</td>
            <td>${elem.material}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    return html;
}

/**
 * Generate HTML for load data table
 */
function generateLoadTable(loads) {
    if (!loads || loads.length === 0) {
        return '<div class="data-table-wrapper">No load data available</div>';
    }
    
    let html = '<table class="data-table"><thead><tr>';
    html += '<th>ID</th><th>Type</th><th>Magnitude</th><th>Direction</th><th>Element</th>';
    html += '</tr></thead><tbody>';
    
    loads.forEach(load => {
        html += `<tr>
            <td>${load.id}</td>
            <td>${load.type}</td>
            <td>${load.magnitude}</td>
            <td>${load.direction}</td>
            <td>${load.element}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    return html;
}

/**
 * Generate HTML for results summary table
 */
function generateResultsTable(results) {
    if (!results) {
        return '<div class="data-table-wrapper">No analysis results available</div>';
    }
    
    let html = '<table class="data-table"><thead><tr>';
    html += '<th>Property</th><th>Value</th>';
    html += '</tr></thead><tbody>';
    
    html += `<tr><td>Total Nodes</td><td>${results.totalNodes}</td></tr>`;
    html += `<tr><td>Total Elements</td><td>${results.totalElements}</td></tr>`;
    html += `<tr><td>Max Displacement</td><td>${results.maxDisplacement} m</td></tr>`;
    html += `<tr><td>Max Stress</td><td>${results.maxStress} kPa</td></tr>`;
    html += `<tr><td>Solve Time</td><td>${results.solveTime} s</td></tr>`;
    html += `<tr><td>Status</td><td>${results.success ? '✓ Success' : '✗ Failed'}</td></tr>`;
    
    html += '</tbody></table>';
    return html;
}

/**
 * Format constraints string for display
 */
function formatConstraints(constraints) {
    if (!constraints) return 'Free';
    
    const parts = [];
    if (constraints.dx) parts.push('DX');
    if (constraints.dy) parts.push('DY');
    if (constraints.dz) parts.push('DZ');
    if (constraints.rx) parts.push('RX');
    if (constraints.ry) parts.push('RY');
    if (constraints.rz) parts.push('RZ');
    
    return parts.length > 0 ? parts.join(', ') : 'Free';
}

/**
 * Export structure data to console
 */
export function logStructureData() {
    if (!window.sceneData) {
        logToConsole('No scene data available', 'error');
        return;
    }
    
    const nodes = window.sceneData.nodes || [];
    const beams = window.sceneData.beamsGroup?.children || [];
    const plates = window.sceneData.platesGroup?.children || [];
    
    logToConsole(`Structure: ${nodes.length} nodes, ${beams.length} beams, ${plates.length} plates`, 'info');
    
    updateNodeData(nodes.map(n => ({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        z: n.position.z,
        constraints: n.userData?.constraints
    })));
}

// Make functions available globally
window.logToConsole = logToConsole;
window.clearConsole = clearConsole;
window.updateNodeData = updateNodeData;
window.updateElementData = updateElementData;
window.updateLoadData = updateLoadData;
window.updateResultsData = updateResultsData;
window.logStructureData = logStructureData;

console.log('Console Logger initialized');
