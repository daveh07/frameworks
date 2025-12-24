/**
 * Analysis Results Visualization
 * Handles display of FEA analysis results including diagrams
 */

// Use existing THREE from global scope (already loaded in viewport_combined.js)
// Store analysis results globally
let currentResults = null;

/**
 * Update and display analysis results
 * @param {Object} results - Analysis results from Code_Aster service
 */
function handleLegacySceneResults(results) {
    console.log('updateAnalysisResults called with:', results);
    currentResults = results;
    
    // Display results summary
    displayResultsSummary(results);
    
    // Create bending moment diagram
    if (results.stresses && results.stresses.length > 0) {
        createBendingMomentDiagram(results);
    }
    
    // Create shear force diagram
    if (results.reactions && results.reactions.length > 0) {
        createShearForceDiagram(results);
    }
    
    console.log('Analysis results updated successfully');
}

if (window.registerAnalysisResultsHandler) {
    window.registerAnalysisResultsHandler(handleLegacySceneResults);
} else {
    window.updateAnalysisResults = handleLegacySceneResults;
}

/**
 * Display summary of analysis results
 */
function displayResultsSummary(results) {
    console.log('=== ANALYSIS RESULTS SUMMARY ===');
    console.log('Max Displacement:', results.max_displacement, 'm');
    console.log('Max Stress:', results.max_stress, 'Pa');
    
    console.log('\nDisplacements:');
    results.displacements.forEach(d => {
        console.log(`  Node ${d.node_id}: dx=${d.dx.toFixed(6)}, dy=${d.dy.toFixed(6)}, dz=${d.dz.toFixed(6)}`);
    });
    
    console.log('\nReactions:');
    results.reactions.forEach(r => {
        console.log(`  Node ${r.node_id}: Fy=${r.fy.toFixed(2)} N, Mz=${r.mz.toFixed(2)} N⋅m`);
    });
    
    console.log('\nStresses:');
    results.stresses.forEach(s => {
        console.log(`  Element ${s.element_id}: Von Mises=${(s.von_mises/1e6).toFixed(2)} MPa`);
    });
}

/**
 * Create bending moment diagram
 */
function createBendingMomentDiagram(results) {
    console.log('Creating bending moment diagram...');
    
    if (!window.sceneData || !window.sceneData.scene) {
        console.error('Scene data not available');
        return;
    }
    
    // Remove existing diagrams
    removeDiagramsByName('BendingMomentDiagram');
    
    const beamsGroup = window.sceneData.beamsGroup;
    if (!beamsGroup || beamsGroup.children.length === 0) {
        console.error('No beams available for diagram');
        return;
    }
    
    // Create diagram for each beam
    results.stresses.forEach(stress => {
        const beamMesh = beamsGroup.children[stress.element_id];
        if (!beamMesh) return;
        
        const startNode = beamMesh.userData.startNode;
        const endNode = beamMesh.userData.endNode;
        
        if (!startNode || !endNode) return;
        
        // Create moment diagram curve
        const diagramGroup = createMomentDiagramCurve(
            startNode.position,
            endNode.position,
            stress.bending_stress_y
        );
        
        diagramGroup.name = 'BendingMomentDiagram';
        window.sceneData.scene.add(diagramGroup);
    });
    
    console.log('Bending moment diagram created');
}

/**
 * Create shear force diagram
 */
function createShearForceDiagram(results) {
    console.log('Creating shear force diagram...');
    
    if (!window.sceneData || !window.sceneData.scene) {
        console.error('Scene data not available');
        return;
    }
    
    // Remove existing diagrams
    removeDiagramsByName('ShearForceDiagram');
    
    const beamsGroup = window.sceneData.beamsGroup;
    if (!beamsGroup || beamsGroup.children.length === 0) {
        console.error('No beams available for diagram');
        return;
    }
    
    // Calculate shear forces from reactions
    const totalShear = results.reactions.reduce((sum, r) => sum + Math.abs(r.fy), 0) / 2;
    
    // Create diagram for each beam
    beamsGroup.children.forEach((beamMesh, idx) => {
        const startNode = beamMesh.userData.startNode;
        const endNode = beamMesh.userData.endNode;
        
        if (!startNode || !endNode) return;
        
        // Create shear diagram (rectangular for uniform load)
        const diagramGroup = createShearDiagramRect(
            startNode.position,
            endNode.position,
            totalShear
        );
        
        diagramGroup.name = 'ShearForceDiagram';
        window.sceneData.scene.add(diagramGroup);
    });
    
    console.log('Shear force diagram created');
}

/**
 * Create curved bending moment diagram
 */
function createMomentDiagramCurve(startPos, endPos, maxMoment) {
    // Get THREE from global scope
    const THREE = window.THREE;
    if (!THREE) {
        console.error('THREE not available');
        return new Object();  // Return empty object instead of Group
    }
    
    const group = new THREE.Group();
    
    // Beam length and direction
    const beamVector = new THREE.Vector3().subVectors(endPos, startPos);
    const beamLength = beamVector.length();
    const beamDir = beamVector.clone().normalize();
    
    // Perpendicular direction for diagram (upward)
    const upDir = new THREE.Vector3(0, 1, 0);
    
    // Scale factor for diagram height (based on stress magnitude)
    const scale = Math.abs(maxMoment) / 5e7; // Adjust scale as needed
    const maxHeight = Math.min(scale, beamLength * 0.5);
    
    // Create parabolic curve for moment diagram
    const points = [];
    const segments = 20;
    
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const pos = new THREE.Vector3().lerpVectors(startPos, endPos, t);
        
        // Parabolic shape: moment is max at center for uniform load
        const height = maxHeight * 4 * t * (1 - t);
        pos.add(upDir.clone().multiplyScalar(height));
        
        points.push(pos);
    }
    
    // Create line geometry
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ 
        color: 0xff0000, 
        linewidth: 2,
        transparent: true,
        opacity: 0.8
    });
    
    const curve = new THREE.Line(geometry, material);
    group.add(curve);
    
    // Add vertical lines from beam to diagram
    for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        const basePos = new THREE.Vector3().lerpVectors(startPos, endPos, t);
        const height = maxHeight * 4 * t * (1 - t);
        const topPos = basePos.clone().add(upDir.clone().multiplyScalar(height));
        
        const verticalGeometry = new THREE.BufferGeometry().setFromPoints([basePos, topPos]);
        const verticalLine = new THREE.Line(verticalGeometry, material);
        group.add(verticalLine);
    }
    
    // Add label
    const labelPos = new THREE.Vector3().lerpVectors(startPos, endPos, 0.5);
    labelPos.add(upDir.clone().multiplyScalar(maxHeight + 0.5));
    
    // Note: In a real implementation, you'd add a text sprite here
    // For now, we'll just log the value
    console.log(`Max Moment at center: ${(maxMoment/1e6).toFixed(2)} MPa`);
    
    return group;
}

/**
 * Create rectangular shear force diagram
 */
function createShearDiagramRect(startPos, endPos, shearForce) {
    // Get THREE from global scope
    const THREE = window.THREE;
    if (!THREE) {
        console.error('THREE not available');
        return new Object();  // Return empty object instead of Group
    }
    
    const group = new THREE.Group();
    
    // Beam direction
    const beamVector = new THREE.Vector3().subVectors(endPos, startPos);
    const beamLength = beamVector.length();
    const midPoint = new THREE.Vector3().lerpVectors(startPos, endPos, 0.5);
    
    // Perpendicular direction
    const upDir = new THREE.Vector3(0, 1, 0);
    
    // Scale factor for diagram height
    const scale = shearForce / 100000; // Adjust as needed
    const height = Math.min(scale, beamLength * 0.3);
    
    // Create rectangular outline for shear diagram
    const points = [
        startPos.clone(),
        startPos.clone().add(upDir.clone().multiplyScalar(height)),
        endPos.clone().add(upDir.clone().multiplyScalar(height)),
        endPos.clone(),
        startPos.clone()
    ];
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ 
        color: 0x0000ff, 
        linewidth: 2,
        transparent: true,
        opacity: 0.8
    });
    
    const outline = new THREE.Line(geometry, material);
    group.add(outline);
    
    console.log(`Shear Force: ${shearForce.toFixed(2)} N`);
    
    return group;
}

/**
 * Remove existing diagrams by name
 */
function removeDiagramsByName(name) {
    if (!window.sceneData || !window.sceneData.scene) return;
    
    const toRemove = [];
    window.sceneData.scene.children.forEach(child => {
        if (child.name === name) {
            toRemove.push(child);
        }
    });
    
    toRemove.forEach(obj => {
        window.sceneData.scene.remove(obj);
    });
}

/**
 * Clear all analysis visualizations
 */
window.clearAnalysisResults = function() {
    removeDiagramsByName('BendingMomentDiagram');
    removeDiagramsByName('ShearForceDiagram');
    currentResults = null;
    console.log('Analysis results cleared');
};

/**
 * Get current results
 */
window.getCurrentAnalysisResults = function() {
    return currentResults;
};
