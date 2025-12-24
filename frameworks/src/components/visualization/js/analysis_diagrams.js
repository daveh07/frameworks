// Analysis visualization functions

// Store analysis results globally
window.analysisResults = window.analysisResults || null;

// Update analysis results from Rust
function handleDiagramAnalysisResults(results) {
    window.analysisResults = results;
    console.log('Analysis results updated:', results);
}

if (window.registerAnalysisResultsHandler) {
    window.registerAnalysisResultsHandler(handleDiagramAnalysisResults);
} else {
    window.updateAnalysisResults = handleDiagramAnalysisResults;
}

// Calculate bending moment and shear force along beams
function calculateBeamForces(beam, results) {
    // Find beam nodes
    const node1 = window.nodes.find(n => n.id === beam.node_ids[0]);
    const node2 = window.nodes.find(n => n.id === beam.node_ids[1]);
    
    if (!node1 || !node2) return null;
    
    // Find reactions at nodes
    const reaction1 = results.reactions.find(r => r.node_id === node1.id);
    const reaction2 = results.reactions.find(r => r.node_id === node2.id);
    
    // Find point loads on nodes
    const load1 = window.point_loads.find(l => l.node_id === node1.id);
    const load2 = window.point_loads.find(l => l.node_id === node2.id);
    
    // Beam length and direction
    const dx = node2.x - node1.x;
    const dy = node2.y - node1.y;
    const dz = node2.z - node1.z;
    const length = Math.sqrt(dx*dx + dy*dy + dz*dz);
    
    // For 2D beam in XY plane, calculate moments and shear
    const numPoints = 20;
    const moments = [];
    const shears = [];
    
    for (let i = 0; i <= numPoints; i++) {
        const x = (i / numPoints) * length;
        
        // Simplified calculation - assumes vertical loads
        let moment = 0;
        let shear = 0;
        
        // Add reaction effects
        if (reaction1) {
            shear += reaction1.fy;
            moment += reaction1.fy * x;
        }
        
        // Add point load effects
        if (load2 && x >= length) {
            shear += load2.fy;
        }
        if (load2 && x > 0) {
            const loadPos = length;
            if (x >= loadPos) {
                moment += load2.fy * (x - loadPos);
            }
        }
        
        moments.push({ x, value: moment });
        shears.push({ x, value: shear });
    }
    
    return { moments, shears, node1, node2, length };
}

// Draw bending moment diagram
window.showBendingMomentDiagram = function() {
    if (!window.analysisResults) {
        console.log('No analysis results available');
        return;
    }
    
    // Clear existing diagrams
    window.clearDiagrams();
    
    console.log('Drawing bending moment diagram');
    
    // Create diagram group
    const diagramGroup = new THREE.Group();
    diagramGroup.name = 'bendingMomentDiagram';
    
    // Scale factor for visualization
    const scale = 0.0001; // Adjust based on max moment
    
    // Draw diagram for each beam
    window.beams.forEach(beam => {
        const forces = calculateBeamForces(beam, window.analysisResults);
        if (!forces) return;
        
        const { moments, node1, node2 } = forces;
        
        // Find max moment for scaling
        const maxMoment = Math.max(...moments.map(m => Math.abs(m.value)));
        
        if (maxMoment === 0) return;
        
        const localScale = scale * 10000 / maxMoment;
        
        // Create curve geometry for moment diagram
        const points = moments.map(m => {
            const t = m.x / forces.length;
            const x = node1.x + t * (node2.x - node1.x);
            const y = node1.y + t * (node2.y - node1.y);
            const z = node1.z + t * (node2.z - node1.z);
            
            // Offset perpendicular to beam (in XY plane)
            const offset = m.value * localScale;
            
            return new THREE.Vector3(x, y + offset, z);
        });
        
        // Draw the diagram curve
        const curveGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const curveMaterial = new THREE.LineBasicMaterial({ 
            color: 0x0000ff, 
            linewidth: 3 
        });
        const curve = new THREE.Line(curveGeometry, curveMaterial);
        diagramGroup.add(curve);
        
        // Draw connection lines
        moments.forEach((m, i) => {
            if (i % 5 === 0) { // Draw every 5th line
                const t = m.x / forces.length;
                const beamX = node1.x + t * (node2.x - node1.x);
                const beamY = node1.y + t * (node2.y - node1.y);
                const beamZ = node1.z + t * (node2.z - node1.z);
                
                const linePoints = [
                    new THREE.Vector3(beamX, beamY, beamZ),
                    points[i]
                ];
                
                const lineGeom = new THREE.BufferGeometry().setFromPoints(linePoints);
                const lineMat = new THREE.LineBasicMaterial({ 
                    color: 0x0000ff, 
                    opacity: 0.3,
                    transparent: true 
                });
                const line = new THREE.Line(lineGeom, lineMat);
                diagramGroup.add(line);
            }
        });
    });
    
    window.scene.add(diagramGroup);
    console.log('Bending moment diagram added');
};

// Draw shear force diagram
window.showShearForceDiagram = function() {
    if (!window.analysisResults) {
        console.log('No analysis results available');
        return;
    }
    
    window.clearDiagrams();
    
    console.log('Drawing shear force diagram');
    
    const diagramGroup = new THREE.Group();
    diagramGroup.name = 'shearForceDiagram';
    
    const scale = 0.00001;
    
    window.beams.forEach(beam => {
        const forces = calculateBeamForces(beam, window.analysisResults);
        if (!forces) return;
        
        const { shears, node1, node2 } = forces;
        
        const maxShear = Math.max(...shears.map(s => Math.abs(s.value)));
        if (maxShear === 0) return;
        
        const localScale = scale * 10000 / maxShear;
        
        const points = shears.map(s => {
            const t = s.x / forces.length;
            const x = node1.x + t * (node2.x - node1.x);
            const y = node1.y + t * (node2.y - node1.y);
            const z = node1.z + t * (node2.z - node1.z);
            
            const offset = s.value * localScale;
            
            return new THREE.Vector3(x, y + offset, z);
        });
        
        const curveGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const curveMaterial = new THREE.LineBasicMaterial({ 
            color: 0xff0000,
            linewidth: 3 
        });
        const curve = new THREE.Line(curveGeometry, curveMaterial);
        diagramGroup.add(curve);
        
        shears.forEach((s, i) => {
            if (i % 5 === 0) {
                const t = s.x / forces.length;
                const beamX = node1.x + t * (node2.x - node1.x);
                const beamY = node1.y + t * (node2.y - node1.y);
                const beamZ = node1.z + t * (node2.z - node1.z);
                
                const linePoints = [
                    new THREE.Vector3(beamX, beamY, beamZ),
                    points[i]
                ];
                
                const lineGeom = new THREE.BufferGeometry().setFromPoints(linePoints);
                const lineMat = new THREE.LineBasicMaterial({ 
                    color: 0xff0000,
                    opacity: 0.3,
                    transparent: true 
                });
                const line = new THREE.Line(lineGeom, lineMat);
                diagramGroup.add(line);
            }
        });
    });
    
    window.scene.add(diagramGroup);
    console.log('Shear force diagram added');
};

// Show deformed shape
window.showDeformedShape = function() {
    if (!window.analysisResults) {
        console.log('No analysis results available');
        return;
    }
    
    window.clearDiagrams();
    
    console.log('Drawing deformed shape');
    
    const scale = 100; // Exaggerate deformations
    const diagramGroup = new THREE.Group();
    diagramGroup.name = 'deformedShape';
    
    // Draw deformed beams
    window.beams.forEach(beam => {
        const node1 = window.nodes.find(n => n.id === beam.node_ids[0]);
        const node2 = window.nodes.find(n => n.id === beam.node_ids[1]);
        
        if (!node1 || !node2) return;
        
        const disp1 = window.analysisResults.displacements.find(d => d.node_id === node1.id);
        const disp2 = window.analysisResults.displacements.find(d => d.node_id === node2.id);
        
        if (!disp1 || !disp2) return;
        
        // Deformed positions
        const start = new THREE.Vector3(
            node1.x + disp1.dx * scale,
            node1.y + disp1.dy * scale,
            node1.z + disp1.dz * scale
        );
        
        const end = new THREE.Vector3(
            node2.x + disp2.dx * scale,
            node2.y + disp2.dy * scale,
            node2.z + disp2.dz * scale
        );
        
        const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
        const material = new THREE.LineBasicMaterial({ 
            color: 0x00ff00,
            linewidth: 3 
        });
        const line = new THREE.Line(geometry, material);
        diagramGroup.add(line);
    });
    
    window.scene.add(diagramGroup);
    console.log('Deformed shape added');
};

// Clear all diagrams
window.clearDiagrams = function() {
    const toRemove = [];
    window.scene.children.forEach(child => {
        if (child.name === 'bendingMomentDiagram' || 
            child.name === 'shearForceDiagram' ||
            child.name === 'deformedShape') {
            toRemove.push(child);
        }
    });
    
    toRemove.forEach(obj => {
        window.scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
    });
    
    console.log('Diagrams cleared');
};

console.log('Analysis visualization functions loaded');
