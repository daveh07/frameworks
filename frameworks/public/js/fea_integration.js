// FEA Solver Integration - Extract structure data and visualize results

// Import THREE.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js';

// ========================
// Diagram Scale and State
// ========================

// Initialize diagram scale if not already set
if (typeof window.diagramScale === 'undefined') {
    window.diagramScale = 1.0;
}

// Track current diagram type for refresh on scale change
window.currentDiagramType = null;

// Function to refresh the current diagram with new scale
window.refreshCurrentDiagram = function() {
    if (!window.currentDiagramType) return;
    
    switch (window.currentDiagramType) {
        case 'moment':
        case 'moment_xy':
        case 'moment_xz':
            // Keep backward compatibility with older saved state values.
            // The moment diagram is now rendered in the model's 2D plane.
            window.showFEABendingMomentDiagram();
            break;
        case 'shear':
            window.showFEAShearForceDiagram();
            break;
        case 'axial':
            window.showFEAAxialForceDiagram();
            break;
        case 'deformed':
            if (window.lastDeformScale) {
                window.showFEADeformedShape(window.lastDeformScale);
            }
            break;
    }
};

// Function to set diagram scale from UI slider
window.setDiagramScale = function(scale) {
    window.diagramScale = Math.max(0.1, Math.min(10, scale));
    window.refreshCurrentDiagram();
};

// ========================
// FEA Server URL Configuration
// ========================

// Detect Codespaces and construct the correct URL
function getFEAServerUrl() {
    const currentHost = window.location.hostname;
    
    // Check if running in GitHub Codespaces
    if (currentHost.includes('.app.github.dev')) {
        // Extract the codespace name and construct the port 8086 URL
        // Format: {codespace-name}-{port}.app.github.dev
        const match = currentHost.match(/^(.+)-(\d+)\.app\.github\.dev$/);
        if (match) {
            const codespaceName = match[1];
            // Note: Port 8086 must be set to "Public" visibility in Codespaces
            return `https://${codespaceName}-8086.app.github.dev`;
        }
    }
    
    // Default to localhost for local development
    return 'http://localhost:8086';
}

const FEA_SERVER_URL = getFEAServerUrl();
console.log('FEA Server URL:', FEA_SERVER_URL);
console.log('NOTE: If running in Codespaces, ensure port 8086 is set to PUBLIC visibility');

// ========================
// Structure Data Extraction
// ========================

window.extractFEAStructure = function(materialConfig, beamSectionConfig) {
    const sceneData = window.sceneData;
    if (!sceneData) {
        console.error('Scene data not available');
        return null;
    }

    console.log('=== Extracting FEA Structure ===');

    const model = {
        nodes: [],
        materials: [],
        sections: [],
        members: [],
        supports: [],
        node_loads: [],
        distributed_loads: [],
        load_combos: []
    };

    // Node name mapping (index -> name)
    const nodeNameMap = new Map();
    const nodePositionMap = new Map(); // uuid -> node name

    // Extract nodes from nodesGroup
    console.log('Node count:', sceneData.nodesGroup.children.length);
    sceneData.nodesGroup.children.forEach((nodeMesh, idx) => {
        const nodeName = `N${idx + 1}`;
        nodeNameMap.set(idx, nodeName);
        nodePositionMap.set(nodeMesh.uuid, nodeName);
        
        model.nodes.push({
            name: nodeName,
            x: nodeMesh.position.x,
            y: nodeMesh.position.y,
            z: nodeMesh.position.z
        });
        console.log(`Node ${nodeName}:`, nodeMesh.position);
    });

    // Add material
    const material = materialConfig || {
        name: 'Steel',
        e: 200e9,       // 200 GPa
        g: 77e9,        // 77 GPa
        nu: 0.3,
        rho: 7850
    };
    
    // Convert from UI units if needed (E in GPa -> Pa)
    model.materials.push({
        name: material.name || 'Steel',
        e: material.elastic_modulus ? material.elastic_modulus * 1e9 : material.e,
        g: material.g || (material.elastic_modulus ? material.elastic_modulus * 1e9 / (2 * (1 + (material.poisson_ratio || 0.3))) : 77e9),
        nu: material.poisson_ratio || material.nu || 0.3,
        rho: material.density || material.rho || 7850
    });

    // Add section from beam section config
    const section = beamSectionConfig || {
        section_type: 'Rectangular',
        width: 0.3,
        height: 0.5,
        flange_thickness: 0.02,
        web_thickness: 0.015
    };

    // Calculate section properties based on type
    const sectionProps = calculateSectionProperties(section);
    model.sections.push(sectionProps);

    // Member name map
    const memberNameMap = new Map(); // uuid -> member name

    // Extract beams from beamsGroup  
    console.log('Beam count:', sceneData.beamsGroup.children.length);
    let memberIdx = 0;
    sceneData.beamsGroup.children.forEach((beamMesh) => {
        if ((beamMesh.isMesh || beamMesh.type === 'Mesh') && 
            beamMesh.userData && beamMesh.userData.startNode && beamMesh.userData.endNode) {
            
            const startNodeName = nodePositionMap.get(beamMesh.userData.startNode.uuid);
            const endNodeName = nodePositionMap.get(beamMesh.userData.endNode.uuid);
            
            if (startNodeName && endNodeName) {
                const memberName = `M${memberIdx + 1}`;
                memberNameMap.set(beamMesh.uuid, memberName);
                
                // Member rotation: default is 0 (no rotation)
                // The solver's local coordinate system now matches PyNite:
                // - For vertical columns: y = [-1,0,0] (negative global X), z = [0,0,1] (global Z)
                // - For horizontal beams: y = [0,1,0] (global Y up), z perpendicular
                // This means moment_z is always the in-plane bending moment for 2D XY frames.
                let rotation = 0;
                
                // Get member releases from userData (default: all fixed)
                // Handle empty objects {} by checking for actual properties
                const userReleases = beamMesh.userData.releases;
                const releases = (userReleases && typeof userReleases.i_node_ry === 'boolean') ? {
                    i_node_ry: !!userReleases.i_node_ry,
                    i_node_rz: !!userReleases.i_node_rz,
                    j_node_ry: !!userReleases.j_node_ry,
                    j_node_rz: !!userReleases.j_node_rz
                } : {
                    i_node_ry: false,
                    i_node_rz: false,
                    j_node_ry: false,
                    j_node_rz: false
                };
                
                model.members.push({
                    name: memberName,
                    i_node: startNodeName,
                    j_node: endNodeName,
                    material: model.materials[0].name,
                    section: sectionProps.name,
                    rotation: rotation,
                    releases: releases
                });
                console.log(`Member ${memberName}: ${startNodeName} -> ${endNodeName}, rotation=${rotation}°, releases:`, releases);
                memberIdx++;
            }
        }
    });

    // Extract supports from constraint symbols
    const constraintGroups = [];
    sceneData.scene.children.forEach(child => {
        if (child.type === 'Group' && child.userData && 
            (child.userData.isConstraintSymbol || child.userData.supportType)) {
            constraintGroups.push(child);
        }
    });
    
    console.log('Found constraint groups:', constraintGroups.length);
    
    constraintGroups.forEach((symbolGroup) => {
        const pos = symbolGroup.position;
        
        // Find matching node
        const node = model.nodes.find(n => 
            Math.abs(n.x - pos.x) < 0.1 && 
            Math.abs(n.y - pos.y) < 0.1 && 
            Math.abs(n.z - pos.z) < 0.1
        );
        
        if (node) {
            const supportType = (symbolGroup.userData?.supportType || 
                                 symbolGroup.userData?.constraintType || 'fixed').toLowerCase();
            
            // Check if we have explicit DOF data from the constraint manager
            const dofs = symbolGroup.userData?.constraintDOFs;
            
            let support;
            
            if (dofs) {
                // Use explicit DOF values from constraint panel
                support = {
                    node: node.name,
                    dx: dofs.dx,
                    dy: dofs.dy,
                    dz: dofs.dz,
                    rx: dofs.rx,
                    ry: dofs.ry,
                    rz: dofs.rz
                };
                console.log(`Support at ${node.name}: custom DOFs`, dofs);
            } else {
                // Fallback to inferring from support type name
                support = {
                    node: node.name,
                    dx: true,
                    dy: true,
                    dz: true,
                    rx: true,   // Restrain torsion by default for 3D stability
                    ry: false,
                    rz: false
                };
                
                if (supportType === 'fixed') {
                    // Fully fixed - all 6 DOFs restrained
                    support.rx = true;
                    support.ry = true;
                    support.rz = true;
                } else if (supportType === 'pinned' || supportType === 'pin') {
                    // Pinned - translations + torsion restrained, bending rotations free
                    support.rx = true;   // torsion restrained
                    support.ry = false;  // rotation about Y free
                    support.rz = false;  // rotation about Z free
                } else if (supportType === 'roller' || supportType === 'rollery') {
                    // Roller in Y direction - free to move in X
                    support.dx = false;
                    support.rx = true;   // torsion restrained for stability
                } else if (supportType === 'rollerx') {
                    // Roller in X direction - free to move in Y
                    support.dy = false;
                    support.rx = true;   // torsion restrained for stability
                }
                // For 'custom' or unrecognized types, defaults apply (translations + torsion restrained)
                console.log(`Support at ${node.name}: ${supportType} (inferred)`);
            }
            
            model.supports.push(support);
        }
    });

    // Extract point loads
    if (window.pointLoads && window.pointLoads.length > 0) {
        window.pointLoads.forEach((load) => {
            const nodeName = nodePositionMap.get(load.nodeUuid);
            if (nodeName) {
                model.node_loads.push({
                    node: nodeName,
                    fx: load.fx || 0,
                    fy: load.fy || 0,
                    fz: load.fz || 0,
                    mx: load.mx || 0,
                    my: load.my || 0,
                    mz: load.mz || 0,
                    case: 'Case 1'
                });
                console.log(`Point load at ${nodeName}:`, load);
            }
        });
    }

    // Extract distributed loads from beamLoads Map
    if (window.beamLoads && window.beamLoads.size > 0) {
        window.beamLoads.forEach((loads, beamUuid) => {
            const memberName = memberNameMap.get(beamUuid);
            if (!memberName) return;
            
            loads.forEach(load => {
                if (load.type === 'distributed') {
                    // Convert from kN/m (UI units) to N/m (solver units)
                    const magnitude_Nm = load.magnitude * 1000;
                    model.distributed_loads.push({
                        member: memberName,
                        w1: magnitude_Nm,
                        w2: magnitude_Nm,  // Uniform load
                        direction: `F${(load.direction || 'Y').toUpperCase()}`,
                        case: 'Case 1'
                    });
                    console.log(`Distributed load on ${memberName}: ${load.magnitude} kN/m = ${magnitude_Nm} N/m`);
                }
            });
        });
    }

    // Add default load combination if not specified
    if (model.load_combos.length === 0) {
        model.load_combos.push({
            name: '1.0 Case 1',
            factors: { 'Case 1': 1.0 }
        });
    }

    console.log('=== Final FEA Model ===');
    console.log('Nodes:', model.nodes.length);
    console.log('Members:', model.members.length);
    console.log('Supports:', model.supports.length);
    console.log('Point loads:', model.node_loads.length);
    console.log('Distributed loads:', model.distributed_loads.length);

    return model;
};

// Calculate section properties from section config
function calculateSectionProperties(section) {
    const type = (section.section_type || 'Rectangular').toLowerCase();
    const w = section.width || 0.3;   // Width (horizontal dimension, local z)
    const h = section.height || 0.5;  // Height (vertical dimension, local y)
    const tf = section.flange_thickness || 0.02;
    const tw = section.web_thickness || 0.015;

    let a, iy, iz, j;

    // Section orientation convention:
    // - Local y-axis points UP (vertical) for horizontal members
    // - Local z-axis points sideways (horizontal) for horizontal members
    // - Height (h) is in the local y direction
    // - Width (w) is in the local z direction
    // 
    // For bending:
    // - Iz = moment of inertia about local z-axis = resists bending in XY plane (vertical bending)
    // - Iy = moment of inertia about local y-axis = resists bending in XZ plane (horizontal bending)

    if (type === 'rectangular') {
        a = w * h;
        // Iz = b*h³/12 where h is the dimension perpendicular to the z-axis (vertical)
        // For vertical bending (moment about z), we need the height
        iz = w * Math.pow(h, 3) / 12;  // Strong axis for vertical bending
        // Iy = h*b³/12 where b is the dimension perpendicular to the y-axis (horizontal)
        iy = h * Math.pow(w, 3) / 12;  // Weak axis for horizontal bending
        // Approximate torsional constant
        const aMax = Math.max(w, h);
        const bMin = Math.min(w, h);
        j = aMax * Math.pow(bMin, 3) * (1/3 - 0.21 * (bMin/aMax) * (1 - Math.pow(bMin, 4) / (12 * Math.pow(aMax, 4))));
    } else if (type === 'circular') {
        const r = w / 2;  // Use width as diameter
        a = Math.PI * r * r;
        iy = Math.PI * Math.pow(r, 4) / 4;
        iz = iy;
        j = Math.PI * Math.pow(r, 4) / 2;
    } else if (type === 'ibeam' || type === 'i-beam' || type === 'wideflange') {
        // I-beam with flanges top/bottom, web vertical
        // Height h is total depth (vertical), width w is flange width (horizontal)
        a = 2 * w * tf + (h - 2 * tf) * tw;
        // Iz = strong axis about z (vertical bending) - uses h (depth)
        iz = (w * Math.pow(h, 3) - (w - tw) * Math.pow(h - 2 * tf, 3)) / 12;
        // Iy = weak axis about y (horizontal bending) - uses w (flange width)
        iy = (2 * tf * Math.pow(w, 3) + (h - 2 * tf) * Math.pow(tw, 3)) / 12;
        j = (2 * w * Math.pow(tf, 3) + (h - 2 * tf) * Math.pow(tw, 3)) / 3;
    } else {
        // Default to rectangular - same as above
        a = w * h;
        iz = w * Math.pow(h, 3) / 12;  // Strong axis for vertical bending
        iy = h * Math.pow(w, 3) / 12;  // Weak axis for horizontal bending
        j = Math.min(w, h) * Math.pow(Math.max(w, h), 3) / 3;
    }

    return {
        name: `Section_${type}_${Math.round(w*1000)}x${Math.round(h*1000)}`,
        a: a,
        iy: iy,
        iz: iz,
        j: j
    };
}

// ========================
// Analysis Execution
// ========================

window.runFEAAnalysis = async function(materialConfig, beamSectionConfig, analysisType = 'linear') {
    if (window.addSolverLog) {
        window.addSolverLog('Starting FEA analysis...', 'info');
    }

    const model = window.extractFEAStructure(materialConfig, beamSectionConfig);
    
    if (!model) {
        const error = 'Failed to extract structure data from scene';
        if (window.addSolverLog) window.addSolverLog(error, 'error');
        return { error };
    }

    if (model.nodes.length === 0) {
        const error = 'No nodes found in the model';
        if (window.addSolverLog) window.addSolverLog(error, 'error');
        return { error };
    }

    if (model.members.length === 0) {
        const error = 'No members found in the model';
        if (window.addSolverLog) window.addSolverLog(error, 'error');
        return { error };
    }

    if (model.supports.length === 0) {
        const error = 'No supports found - model is unstable';
        if (window.addSolverLog) window.addSolverLog(error, 'error');
        return { error };
    }

    if (window.addSolverLog) {
        window.addSolverLog(`Model: ${model.nodes.length} nodes, ${model.members.length} members, ${model.supports.length} supports`, 'info');
        window.addSolverLog('Sending to FEA solver...', 'info');
    }

    try {
        const request = {
            model: model,
            options: {
                analysis_type: analysisType,
                max_iterations: 30
            }
        };

        const response = await fetch(`${FEA_SERVER_URL}/api/v1/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            // Try to get error message from response body
            let errorMsg = `HTTP error: ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData.error) {
                    errorMsg = errorData.error;
                }
            } catch (e) {
                // Response body wasn't JSON
            }
            if (window.addSolverLog) window.addSolverLog(errorMsg, 'error');
            console.error('FEA Server Error:', errorMsg);
            return { error: errorMsg };
        }

        const data = await response.json();

        if (data.success && data.results) {
            // Calculate actual max deflection for simply-supported beams with UDL
            // (since node displacements are 0 at supports)
            let calculatedMaxDefl = data.results.summary.max_displacement;
            
            // Get material and section properties
            const mat = model.materials[0] || { e: 200e9 };
            const sec = model.sections[0] || { iy: 0.001 };
            const E = mat.e;
            const I = sec.iy;
            
            // Check each member for distributed loads
            model.members.forEach(member => {
                const iNode = model.nodes.find(n => n.name === member.i_node);
                const jNode = model.nodes.find(n => n.name === member.j_node);
                if (!iNode || !jNode) return;
                
                const L = Math.sqrt(
                    Math.pow(jNode.x - iNode.x, 2) +
                    Math.pow(jNode.y - iNode.y, 2) +
                    Math.pow(jNode.z - iNode.z, 2)
                );
                
                // Find distributed loads on this member
                let w = 0;
                model.distributed_loads.forEach(load => {
                    if (load.member === member.name && load.direction === 'FY') {
                        w += Math.abs(load.w1);
                    }
                });
                
                if (w > 0 && E > 0 && I > 0) {
                    // Simply supported: δmax = 5wL⁴/(384EI)
                    const maxDefl = 5 * w * Math.pow(L, 4) / (384 * E * I);
                    calculatedMaxDefl = Math.max(calculatedMaxDefl, maxDefl);
                }
            });
            
            // Update the summary with calculated deflection
            data.results.summary.max_displacement = calculatedMaxDefl;
            
            if (window.addSolverLog) {
                window.addSolverLog('Analysis completed successfully!', 'success');
                window.addSolverLog(`Max displacement: ${(calculatedMaxDefl * 1000).toFixed(2)} mm`, 'info');
            }
            
            // Store results globally
            window.feaResults = data.results;
            window.feaModel = model;
            
            // Update visualization
            window.updateFEAVisualization(data.results, model);
            
            return { success: true, results: data.results };
        } else {
            const error = data.error || 'Analysis failed';
            if (window.addSolverLog) window.addSolverLog(error, 'error');
            return { error };
        }
    } catch (error) {
        if (window.addSolverLog) window.addSolverLog(`Error: ${error.toString()}`, 'error');
        return { error: error.toString() };
    }
};

// ========================
// Results Visualization
// ========================

// Store visualization objects for cleanup
window.feaDiagramObjects = [];

window.updateFEAVisualization = function(results, model) {
    console.log('Updating FEA visualization:', results);
    
    // Store for diagram generation
    window.feaResults = results;
    window.feaModel = model;
};

// Clear all diagram objects
window.clearFEADiagrams = function() {
    const sceneData = window.sceneData;
    if (!sceneData) return;

    // Ensure feaDiagramObjects is initialized
    if (!window.feaDiagramObjects) {
        window.feaDiagramObjects = [];
    }

    window.feaDiagramObjects.forEach(obj => {
        sceneData.scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach(m => m.dispose());
            } else {
                obj.material.dispose();
            }
        }
    });
    window.feaDiagramObjects = [];
    // Don't clear currentDiagramType here - let the caller set it
    
    console.log('FEA diagrams cleared');
};

// Show deformed shape
window.showFEADeformedShape = function(scale = 50) {
    window.currentDiagramType = 'deformed';
    window.lastDeformScale = scale;
    window.clearFEADiagrams();
    window.currentDiagramType = 'deformed'; // Re-set after clear
    
    const results = window.feaResults;
    const model = window.feaModel;
    const sceneData = window.sceneData;
    
    if (!results || !model || !sceneData) {
        console.error('No FEA results available');
        return;
    }

    console.log('Showing deformed shape with scale:', scale);

    // Build node displacement map (raw, unscaled)
    const dispMap = new Map();
    results.node_displacements.forEach(d => {
        dispMap.set(d.node, { dx: d.dx, dy: d.dy, dz: d.dz, rz: d.rz });
    });

    // Build node position map from model
    const nodePos = new Map();
    model.nodes.forEach(n => {
        nodePos.set(n.name, { x: n.x, y: n.y, z: n.z });
    });

    // Build distributed loads map
    const distLoadsMap = new Map();
    model.distributed_loads.forEach(load => {
        if (!distLoadsMap.has(load.member)) {
            distLoadsMap.set(load.member, []);
        }
        distLoadsMap.get(load.member).push(load);
    });

    // Get material properties (use first material)
    const mat = model.materials[0] || { e: 200e9 };
    const E = mat.e;

    // Get section properties (use first section)
    const sec = model.sections[0] || { iy: 0.001 };
    const I = sec.iy;

    // Draw deformed members with interpolated deflection
    // Use a bright cyan color with thick lines for visibility
    const deformedMaterial = new THREE.LineBasicMaterial({ 
        color: 0x00ccff,  // Bright cyan
        linewidth: 3,
        transparent: false,
        depthTest: true
    });

    model.members.forEach(member => {
        const iPos = nodePos.get(member.i_node);
        const jPos = nodePos.get(member.j_node);
        const iDisp = dispMap.get(member.i_node) || { dx: 0, dy: 0, dz: 0, rz: 0 };
        const jDisp = dispMap.get(member.j_node) || { dx: 0, dy: 0, dz: 0, rz: 0 };

        if (!iPos || !jPos) return;

        const memberLength = Math.sqrt(
            Math.pow(jPos.x - iPos.x, 2) + 
            Math.pow(jPos.y - iPos.y, 2) + 
            Math.pow(jPos.z - iPos.z, 2)
        );

        // Get distributed load on this member
        const loads = distLoadsMap.get(member.name) || [];
        let w = 0;
        loads.forEach(load => {
            if (load.direction === 'FY') {
                w += load.w1;
            }
        });

        // Create deformed shape curve with interpolation
        const segments = 40;
        const points = [];

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const x = t * memberLength;
            
            // Linear interpolation of end displacements
            const dx_ends = iDisp.dx * (1 - t) + jDisp.dx * t;
            const dy_ends = iDisp.dy * (1 - t) + jDisp.dy * t;
            const dz_ends = iDisp.dz * (1 - t) + jDisp.dz * t;
            
            // For simply-supported beam with UDL, add parabolic deflection
            // δ(x) = (w*x / 24EI) * (L³ - 2Lx² + x³)
            // Simplified: δ_max at midspan = 5wL⁴/(384EI)
            let dy_udl = 0;
            if (Math.abs(w) > 0 && E > 0 && I > 0) {
                // Check if both ends are supported (near-zero vertical displacement)
                const bothEndsSupported = Math.abs(iDisp.dy) < 1e-10 && Math.abs(jDisp.dy) < 1e-10;
                
                if (bothEndsSupported) {
                    // Simply supported deflection shape
                    const L = memberLength;
                    dy_udl = (w * x / (24 * E * I)) * (Math.pow(L, 3) - 2 * L * x * x + Math.pow(x, 3));
                }
            }
            
            // Base position
            const baseX = iPos.x * (1 - t) + jPos.x * t;
            const baseY = iPos.y * (1 - t) + jPos.y * t;
            const baseZ = iPos.z * (1 - t) + jPos.z * t;
            
            // Total displacement (scaled)
            const dx_total = (dx_ends) * scale;
            const dy_total = (dy_ends + dy_udl) * scale;
            const dz_total = (dz_ends) * scale;
            
            points.push(new THREE.Vector3(
                baseX + dx_total, 
                baseY + dy_total, 
                baseZ + dz_total
            ));
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, deformedMaterial);
        sceneData.scene.add(line);
        window.feaDiagramObjects.push(line);

        // Calculate and log max deflection
        let maxDefl = 0;
        if (Math.abs(w) > 0 && E > 0 && I > 0) {
            maxDefl = 5 * Math.abs(w) * Math.pow(memberLength, 4) / (384 * E * I);
        }
        console.log(`Member ${member.name}: w=${w} N/m, L=${memberLength.toFixed(2)}m, E=${E.toExponential(2)}, I=${I.toExponential(4)}, maxDefl=${(maxDefl*1000).toFixed(2)} mm`);
    });

    // Draw deformed node markers
    const nodeGeometry = new THREE.SphereGeometry(0.1, 16, 16);
    const nodeMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    
    model.nodes.forEach(node => {
        const pos = nodePos.get(node.name);
        const disp = dispMap.get(node.name) || { dx: 0, dy: 0, dz: 0 };
        
        if (pos) {
            const marker = new THREE.Mesh(nodeGeometry, nodeMaterial);
            marker.position.set(
                pos.x + disp.dx * scale, 
                pos.y + disp.dy * scale, 
                pos.z + disp.dz * scale
            );
            sceneData.scene.add(marker);
            window.feaDiagramObjects.push(marker);
        }
    });

    // Add max deflection label
    model.members.forEach(member => {
        const iPos = nodePos.get(member.i_node);
        const jPos = nodePos.get(member.j_node);
        if (!iPos || !jPos) return;
        
        const midX = (iPos.x + jPos.x) / 2;
        const midY = (iPos.y + jPos.y) / 2;
        const midZ = (iPos.z + jPos.z) / 2;
        
        const loads = distLoadsMap.get(member.name) || [];
        let w = 0;
        loads.forEach(load => {
            if (load.direction === 'FY') w += load.w1;
        });
        
        if (Math.abs(w) > 0 && E > 0 && I > 0) {
            const L = Math.sqrt(
                Math.pow(jPos.x - iPos.x, 2) + 
                Math.pow(jPos.y - iPos.y, 2) + 
                Math.pow(jPos.z - iPos.z, 2)
            );
            const maxDefl = 5 * Math.abs(w) * Math.pow(L, 4) / (384 * E * I);
            addDiagramLabel(
                new THREE.Vector3(midX, midY - maxDefl * scale - 0.5, midZ),
                `δmax=${(maxDefl*1000).toFixed(2)} mm`,
                sceneData
            );
        }
    });

    if (window.addSolverLog) {
        window.addSolverLog(`Deformed shape displayed (scale: ${scale}x)`, 'info');
    }
};

// Show bending moment diagram (2D): render all member bending moments in the model plane.
// For typical 2D frames built in this app (Z ~= 0), that means drawing in the XY plane using moment_z.
window.showFEABendingMomentDiagramInternal = function() {
    window.clearFEADiagrams();
    
    const results = window.feaResults;
    const model = window.feaModel;
    const sceneData = window.sceneData;
    
    if (!results || !model || !sceneData) {
        console.error('No FEA results available');
        return;
    }

    // Detect the primary 2D plane from node coordinates.
    // We currently support 2D XY (Z nearly constant). If the model isn't 2D-XY,
    // we still draw in XY as a safe default.
    console.log('Showing bending moment diagram (2D plane)');
    console.log('Model has', model.members.length, 'members');
    console.log('Results have', results.member_forces.length, 'member forces');

    // Build member forces map
    const forcesMap = new Map();
    results.member_forces.forEach(f => {
        forcesMap.set(f.member, f);
    });
    console.log('Forces map size:', forcesMap.size);

    // Build node position map
    const nodePos = new Map();
    model.nodes.forEach(n => {
        nodePos.set(n.name, new THREE.Vector3(n.x, n.y, n.z));
    });
    console.log('Node positions map size:', nodePos.size);

    // Build distributed loads map
    const distLoadsMap = new Map();
    model.distributed_loads.forEach(load => {
        if (!distLoadsMap.has(load.member)) {
            distLoadsMap.set(load.member, []);
        }
        distLoadsMap.get(load.member).push(load);
    });

    // Pre-pass: Calculate global maximum moment (we use moment_z for 2D XY frames).
    let globalMaxMoment = 0;
    results.member_forces.forEach(f => {
        globalMaxMoment = Math.max(globalMaxMoment, Math.abs(f.moment_z_i), Math.abs(f.moment_z_j));
    });
    // Tolerance: 1% of max moment (or 10 N·m minimum to avoid div by zero issues)
    // Tolerance is used only to suppress numerical noise.
    // IMPORTANT: Do not use a large absolute floor here, because solver units may be kN·m
    // (e.g. ~9.41) and a floor like 10 would hide real diagrams.
    const momentTolerance = Math.max(globalMaxMoment * 1e-4, 1e-6);
    console.log(`Global max moment: ${(globalMaxMoment/1000).toFixed(2)} kNm, tolerance: ${(momentTolerance/1000).toFixed(3)} kNm`);

    // Colors for moment diagram
    // Engineering convention: sagging = positive moment = tension at bottom fiber = blue
    // Hogging = negative moment = tension at top fiber = red
    const saggingColor = 0x0066ff;  // Blue for sagging moments (midspan of loaded beams)
    const hoggingColor = 0xff0000;  // Red for hogging moments (at supports/columns)
    const columnColor = 0x0066ff;   // Blue for all column moments

    // Perpendicular direction for diagram offset (2D XY frames):
    // - Beams: bulge in -Y so sagging shows "down"
    // - Columns: bulge outward in +/-X based on frame centroid
    function getPerpendicular2DXY(memberDir, memberMidpoint, frameCentroid) {
        const isVertical = Math.abs(memberDir.y) > 0.9;
        if (isVertical) {
            const outwardSign = memberMidpoint.x >= frameCentroid.x ? 1 : -1;
            return new THREE.Vector3(outwardSign, 0, 0);
        }
        return new THREE.Vector3(0, -1, 0);
    }

    let diagramsCreated = 0;
    
    // Calculate frame centroid for determining outward direction of columns
    const frameCentroid = new THREE.Vector3(0, 0, 0);
    let nodeCount = 0;
    nodePos.forEach((pos) => {
        frameCentroid.add(pos);
        nodeCount++;
    });
    if (nodeCount > 0) {
        frameCentroid.divideScalar(nodeCount);
    }
    console.log(`Frame centroid: (${frameCentroid.x.toFixed(2)}, ${frameCentroid.y.toFixed(2)}, ${frameCentroid.z.toFixed(2)})`);
    
    // Find frame bounds to identify edge vs middle columns
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    nodePos.forEach((pos) => {
        minX = Math.min(minX, pos.x);
        maxX = Math.max(maxX, pos.x);
        minZ = Math.min(minZ, pos.z);
        maxZ = Math.max(maxZ, pos.z);
    });
    const edgeTolerance = 0.1; // Tolerance for determining if column is at edge
    console.log(`Frame bounds: X=[${minX}, ${maxX}], Z=[${minZ}, ${maxZ}]`);
    
    model.members.forEach((member, idx) => {
        console.log(`Processing member ${idx + 1}/${model.members.length}: ${member.name}`);
        try {
            const forces = forcesMap.get(member.name);
            if (!forces) {
                console.log(`Skipping ${member.name}: no forces`);
                return;
            }

            const iPos = nodePos.get(member.i_node);
            const jPos = nodePos.get(member.j_node);
            if (!iPos || !jPos) {
                console.log(`Skipping ${member.name}: missing node positions`);
                return;
            }

            // Member direction
            const memberDir = new THREE.Vector3().subVectors(jPos, iPos);
            const length = memberDir.length();
            memberDir.normalize();
            
            // Determine member orientation
            const isVertical = Math.abs(memberDir.y) > 0.9;
            
            // Calculate member midpoint
            const memberMidpoint = new THREE.Vector3().lerpVectors(iPos, jPos, 0.5);
            
            console.log(`Member ${member.name}: isVertical=${isVertical}, showing in 2D XY view`);

            // Get distributed load on this member
            const loads = distLoadsMap.get(member.name) || [];
            let w = 0;
            loads.forEach(load => {
                // 2D frame in XY: distributed loads are expected as FY
                if (load.direction === 'FY') {
                    w += load.w1; // N/m (assumes uniform w1 = w2)
                }
            });

            // 2D XY bending: use solver-reported moment_z for ALL members and draw in the XY plane.
            let Mi = forces.moment_z_i;
            let Mj = forces.moment_z_j;
            // Use solver-reported shear directly
            let Vi = forces.shear_y_i;
            
            console.log(`Member ${member.name}: Raw moments Mi=${Mi}, Mj=${Mj}, Vi=${Vi}`);

            // Perpendicular direction for diagram offset
            const perpDir = getPerpendicular2DXY(memberDir, memberMidpoint, frameCentroid);

            // Apply tolerance: treat near-zero moments as exactly zero
            if (Math.abs(Mi) < momentTolerance) Mi = 0;
            if (Math.abs(Mj) < momentTolerance) Mj = 0;
            if (Math.abs(Vi) < momentTolerance) Vi = 0;

            // Calculate moment at multiple points along the member
            const segments = 40;
            const moments = [];
            let maxAbsMoment = 0;
            
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const x = t * length;
                let M;
                if (isVertical) {
                    // For columns: linear interpolation from Mi to Mj (no distributed load typically)
                    // M(x) = Mi + (Mj - Mi) * (x/L)
                    M = Mi + (Mj - Mi) * t;
                } else {
                    // For beams with UDL: M(x) = Mi - Vi*x - w*x²/2
                    M = Mi - Vi * x - w * x * x / 2;
                }
                moments.push(M);
                maxAbsMoment = Math.max(maxAbsMoment, Math.abs(M));
            }

            // Skip members with negligible moments (below tolerance)
            if (maxAbsMoment < momentTolerance) {
                console.log(`Member ${member.name}: skipping - max moment ${(maxAbsMoment/1000).toFixed(3)} kNm below tolerance`);
                return;
            }

            // Auto-scale: use 20% of member length for max moment visualization
            // Then apply the user-adjustable global scale factor
            const baseScale = (length * 0.20) / maxAbsMoment;
            const userScale = window.diagramScale || 1.0;
            const diagramScale = baseScale * userScale;
            
            console.log(`Member ${member.name}: Mi=${(Mi/1000).toFixed(1)} kNm, Vi=${(Vi/1000).toFixed(1)} kN, Mj=${(Mj/1000).toFixed(1)} kNm, w=${w} N/m, Mmax=${(maxAbsMoment/1000).toFixed(1)} kNm`);

            // Create filled moment diagram curve
            const curvePoints = [];
            const basePoints = [];
            
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const pos = new THREE.Vector3().lerpVectors(iPos, jPos, t);
                const M = moments[i];
                
                // Offset perpendicular to member axis
                // Convention: positive moment (sagging/tension on bottom) shown BELOW beam
                // Negate to match structural engineering convention (positive moment = sagging = diagram below)
                const offset = -M * diagramScale;
                const offsetPos = pos.clone().add(perpDir.clone().multiplyScalar(offset));
                
                curvePoints.push(offsetPos);
                basePoints.push(pos.clone());
            }

            // Create filled shape using triangles
            const geometry = new THREE.BufferGeometry();
            const positions = [];
            const colors = [];
            
            for (let i = 0; i < segments; i++) {
                const M_avg = (moments[i] + moments[i + 1]) / 2;
                // FEA convention: positive moment at midspan (sagging), negative at supports (hogging)
                let color;
                if (isVertical) {
                    // Columns: all blue
                    color = new THREE.Color(columnColor);
                } else {
                    color = M_avg >= 0 ? new THREE.Color(saggingColor) : new THREE.Color(hoggingColor);
                }
                
                // Two triangles per segment
                positions.push(
                    basePoints[i].x, basePoints[i].y, basePoints[i].z,
                    curvePoints[i].x, curvePoints[i].y, curvePoints[i].z,
                    curvePoints[i + 1].x, curvePoints[i + 1].y, curvePoints[i + 1].z
                );
                positions.push(
                    basePoints[i].x, basePoints[i].y, basePoints[i].z,
                    curvePoints[i + 1].x, curvePoints[i + 1].y, curvePoints[i + 1].z,
                    basePoints[i + 1].x, basePoints[i + 1].y, basePoints[i + 1].z
                );
                
                for (let j = 0; j < 6; j++) {
                    colors.push(color.r, color.g, color.b);
                }
            }
            
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            
            const material = new THREE.MeshBasicMaterial({ 
                vertexColors: true,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.4,
                depthWrite: false
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            sceneData.scene.add(mesh);
            window.feaDiagramObjects.push(mesh);

            // Draw colored outline curve - build segments with different colors
            for (let i = 0; i < segments; i++) {
                const segPoints = [curvePoints[i], curvePoints[i + 1]];
                const segGeometry = new THREE.BufferGeometry().setFromPoints(segPoints);
                const M_avg = (moments[i] + moments[i + 1]) / 2;
                let segColor;
                if (isVertical) {
                    segColor = columnColor;  // All blue for columns
                } else {
                    segColor = M_avg >= 0 ? saggingColor : hoggingColor;
                }
                const segMaterial = new THREE.LineBasicMaterial({ color: segColor, linewidth: 2 });
                const segLine = new THREE.Line(segGeometry, segMaterial);
                sceneData.scene.add(segLine);
                window.feaDiagramObjects.push(segLine);
            }

            // Find max and min moments and their positions
            let maxMomentIdx = 0, minMomentIdx = 0;
            let maxM = moments[0], minM = moments[0];
            for (let i = 1; i < moments.length; i++) {
                if (moments[i] > maxM) { maxM = moments[i]; maxMomentIdx = i; }
                if (moments[i] < minM) { minM = moments[i]; minMomentIdx = i; }
            }

            // Add label at maximum positive moment (sagging) if significant
            if (Math.abs(maxM) > 0.1) {  // > 0.1 N·m threshold
                const maxLabelPos = curvePoints[maxMomentIdx].clone().add(perpDir.clone().multiplyScalar(0.3));
                addDiagramLabelClean(maxLabelPos, `${(maxM/1000).toFixed(2)}`, sceneData);
            }
            
            // Add label at minimum moment (most negative / hogging) if different position and significant
            if (Math.abs(minM) > 0.1 && Math.abs(minMomentIdx - maxMomentIdx) > 3) {
                const minLabelPos = curvePoints[minMomentIdx].clone().add(perpDir.clone().multiplyScalar(0.3));
                addDiagramLabelClean(minLabelPos, `${(minM/1000).toFixed(2)}`, sceneData);
            }
            
            // Add end moment labels (Mi and Mj) if not already labeled
            const startM = moments[0];
            const endM = moments[moments.length - 1];
            
            // Label at start if significant and not at max/min position
            if (Math.abs(startM) > 0.1 && maxMomentIdx > 2 && minMomentIdx > 2) {
                const startLabelPos = curvePoints[0].clone().add(perpDir.clone().multiplyScalar(0.3));
                addDiagramLabelClean(startLabelPos, `${(startM/1000).toFixed(2)}`, sceneData);
            }
            
            // Label at end if significant and not at max/min position  
            if (Math.abs(endM) > 0.1 && maxMomentIdx < moments.length - 3 && minMomentIdx < moments.length - 3) {
                const endLabelPos = curvePoints[curvePoints.length - 1].clone().add(perpDir.clone().multiplyScalar(0.3));
                addDiagramLabelClean(endLabelPos, `${(endM/1000).toFixed(2)}`, sceneData);
            }
            
            diagramsCreated++;
        } catch (err) {
            console.error(`Error creating diagram for ${member.name}:`, err);
        }
    });

    console.log('Total moment diagrams created:', diagramsCreated);
    
    if (window.addSolverLog) {
        window.addSolverLog('Bending moment diagram displayed', 'info');
    }
};

window.showFEABendingMomentDiagram = function() {
    window.currentDiagramType = 'moment';
    window.showFEABendingMomentDiagramInternal();
};

// Backwards-compatible alias (no longer used by the UI)
window.showFEABendingMomentDiagramXZ = function() {
    window.showFEABendingMomentDiagram();
};

// Show shear force diagram - internal function with plane parameter
window.showFEAShearForceDiagramInternal = function(plane = 'XY') {
    window.clearFEADiagrams();
    
    const results = window.feaResults;
    const model = window.feaModel;
    const sceneData = window.sceneData;
    
    if (!results || !model || !sceneData) {
        console.error('No FEA results available');
        return;
    }

    const isXY = plane === 'XY';
    console.log(`Showing shear force diagram (${plane} plane)`);

    // Build member forces map
    const forcesMap = new Map();
    results.member_forces.forEach(f => {
        forcesMap.set(f.member, f);
    });

    // Build node position map
    const nodePos = new Map();
    model.nodes.forEach(n => {
        nodePos.set(n.name, new THREE.Vector3(n.x, n.y, n.z));
    });

    // Build distributed loads map
    const distLoadsMap = new Map();
    model.distributed_loads.forEach(load => {
        if (!distLoadsMap.has(load.member)) {
            distLoadsMap.set(load.member, []);
        }
        distLoadsMap.get(load.member).push(load);
    });

    // Colors for shear diagram - all orange (darker shade)
    const shearColor = 0xcc5500;  // Darker orange for all shear forces

    // Helper to get perpendicular direction for diagram offset
    function getPerpendicular(memberDir, isXYPlane) {
        const up = new THREE.Vector3(0, 1, 0);
        const isVertical = Math.abs(memberDir.dot(up)) > 0.9;
        
        if (isVertical) {
            return isXYPlane ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
        } else {
            return up.clone();
        }
    }

    model.members.forEach(member => {
        const forces = forcesMap.get(member.name);
        if (!forces) return;

        const iPos = nodePos.get(member.i_node);
        const jPos = nodePos.get(member.j_node);
        if (!iPos || !jPos) return;

        const memberDir = new THREE.Vector3().subVectors(jPos, iPos);
        const length = memberDir.length();
        memberDir.normalize();
        
        // Filter members by direction for each plane view (same as moment diagram)
        const isVertical = Math.abs(memberDir.y) > 0.9;
        const isAlongX = !isVertical && Math.abs(memberDir.x) > 0.7;
        const isAlongZ = !isVertical && Math.abs(memberDir.z) > 0.7;
        
        if (isXY && !isVertical && !isAlongX) return;  // XY: columns + X beams
        if (!isXY && !isVertical && !isAlongZ) return; // XZ: columns + Z beams
        
        // Get perpendicular direction for diagram offset
        const perpDir = getPerpendicular(memberDir, isXY);

        // Get distributed load on this member
        const loads = distLoadsMap.get(member.name) || [];
        let w = 0;
        loads.forEach(load => {
            if ((isXY && load.direction === 'FY') || (!isXY && load.direction === 'FZ')) {
                w += load.w1;
            }
        });

        // End shear forces from FEA - must match moment axis selection
        let Vi, Vj;
        if (isVertical) {
            // Column
            if (isXY) {
                // XY plane: shear that corresponds to moment_y bending
                Vi = forces.shear_z_i;
                Vj = forces.shear_z_j;
            } else {
                // XZ plane: shear that corresponds to moment_z bending
                Vi = forces.shear_y_i;
                Vj = forces.shear_y_j;
            }
        } else {
            // Horizontal beam: shear_y always pairs with moment_z (vertical bending)
            Vi = forces.shear_y_i;
            Vj = forces.shear_y_j;
        }

        // For member with UDL: V(x) = Vi + w*x
        // (w is negative for downward loads, so shear decreases from Vi)
        const segments = 40;
        const shears = [];
        let maxAbsShear = 0.1;
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const x = t * length;
            const V = Vi + w * x;
            shears.push(V);
            maxAbsShear = Math.max(maxAbsShear, Math.abs(V));
        }

        // Auto-scale: use 20% of member length for max shear visualization
        // Then apply the user-adjustable global scale factor
        const baseScale = (length * 0.20) / maxAbsShear;
        const userScale = window.diagramScale || 1.0;
        const diagramScale = baseScale * userScale;
        
        console.log(`Member ${member.name}: Vi=${(Vi/1000).toFixed(1)} kN, Vj=${(Vj/1000).toFixed(1)} kN, w=${w} N/m`);

        // Create filled shear diagram
        const curvePoints = [];
        const basePoints = [];
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const pos = new THREE.Vector3().lerpVectors(iPos, jPos, t);
            const V = shears[i];
            
            // Offset perpendicular to member axis
            // Positive shear shown on one side, negative on the other
            const offset = V * diagramScale;
            const offsetPos = pos.clone().add(perpDir.clone().multiplyScalar(offset));
            
            curvePoints.push(offsetPos);
            basePoints.push(pos.clone());
        }

        // Create filled shape using triangles with vertex colors
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        
        for (let i = 0; i < segments; i++) {
            const color = new THREE.Color(shearColor);  // All orange
            
            positions.push(
                basePoints[i].x, basePoints[i].y, basePoints[i].z,
                curvePoints[i].x, curvePoints[i].y, curvePoints[i].z,
                curvePoints[i + 1].x, curvePoints[i + 1].y, curvePoints[i + 1].z
            );
            positions.push(
                basePoints[i].x, basePoints[i].y, basePoints[i].z,
                curvePoints[i + 1].x, curvePoints[i + 1].y, curvePoints[i + 1].z,
                basePoints[i + 1].x, basePoints[i + 1].y, basePoints[i + 1].z
            );
            
            for (let j = 0; j < 6; j++) {
                colors.push(color.r, color.g, color.b);
            }
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        const material = new THREE.MeshBasicMaterial({ 
            vertexColors: true,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.4,
            depthWrite: false
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        sceneData.scene.add(mesh);
        window.feaDiagramObjects.push(mesh);

        // Draw outline segments - all orange
        for (let i = 0; i < segments; i++) {
            const segPoints = [curvePoints[i], curvePoints[i + 1]];
            const segGeometry = new THREE.BufferGeometry().setFromPoints(segPoints);
            const segMaterial = new THREE.LineBasicMaterial({ color: shearColor, linewidth: 2 });
            const segLine = new THREE.Line(segGeometry, segMaterial);
            sceneData.scene.add(segLine);
            window.feaDiagramObjects.push(segLine);
        }

        // Add labels at ends - only if shear is significant
        if (Math.abs(Vi) > 100) {
            const labelOffsetI = perpDir.clone().multiplyScalar(0.2);
            addDiagramLabelClean(curvePoints[0].clone().add(labelOffsetI), 
                `${(Vi/1000).toFixed(1)}`, sceneData);
        }
        if (Math.abs(Vj) > 100) {
            const labelOffsetJ = perpDir.clone().multiplyScalar(0.2);
            addDiagramLabelClean(curvePoints[segments].clone().add(labelOffsetJ), 
                `${(Vj/1000).toFixed(1)}`, sceneData);
        }
    });

    if (window.addSolverLog) {
        window.addSolverLog(`Shear force diagram (${plane} plane) displayed`, 'info');
    }
};

// Wrapper for XY plane shear
window.showFEAShearForceDiagram = function() {
    window.currentDiagramType = 'shear';
    window.showFEAShearForceDiagramInternal('XY');
};

// Wrapper for XZ plane shear
window.showFEAShearForceDiagramXZ = function() {
    window.currentDiagramType = 'shear';
    window.showFEAShearForceDiagramInternal('XZ');
};

// Show axial force diagram
window.showFEAAxialForceDiagram = function() {
    window.currentDiagramType = 'axial';
    window.clearFEADiagrams();
    
    const results = window.feaResults;
    const model = window.feaModel;
    const sceneData = window.sceneData;
    
    if (!results || !model || !sceneData) {
        console.error('No FEA results available');
        return;
    }

    console.log('Showing axial force diagram');

    const forcesMap = new Map();
    results.member_forces.forEach(f => {
        forcesMap.set(f.member, f);
    });

    const nodePos = new Map();
    model.nodes.forEach(n => {
        nodePos.set(n.name, new THREE.Vector3(n.x, n.y, n.z));
    });

    // Draw axial force as filled rectangles perpendicular to member - RED for all axial forces
    const axialColor = 0xff0000;  // Red color for axial force diagram
    
    // Find max axial for scaling
    let maxAxial = 0.1;
    model.members.forEach(member => {
        const forces = forcesMap.get(member.name);
        if (forces) {
            maxAxial = Math.max(maxAxial, Math.abs(forces.axial_i));
        }
    });
    
    model.members.forEach(member => {
        const forces = forcesMap.get(member.name);
        if (!forces) return;

        const iPos = nodePos.get(member.i_node);
        const jPos = nodePos.get(member.j_node);
        if (!iPos || !jPos) return;

        const axial = forces.axial_i;
        if (Math.abs(axial) < 1) return;  // Skip negligible axial
        
        const memberDir = new THREE.Vector3().subVectors(jPos, iPos);
        const length = memberDir.length();
        memberDir.normalize();
        
        // Perpendicular direction for diagram
        const isVertical = Math.abs(memberDir.y) > 0.9;
        const perpDir = isVertical 
            ? new THREE.Vector3(1, 0, 0) 
            : new THREE.Vector3(0, 1, 0);
        
        // Scale: 15% of member length for max axial
        const baseScale = (length * 0.15) / maxAxial;
        const userScale = window.diagramScale || 1.0;
        const diagramScale = baseScale * userScale;
        const offset = Math.abs(axial) * diagramScale;
        
        // Create filled rectangle along member
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        
        // Rectangle corners
        const p1 = iPos.clone();
        const p2 = iPos.clone().add(perpDir.clone().multiplyScalar(offset));
        const p3 = jPos.clone().add(perpDir.clone().multiplyScalar(offset));
        const p4 = jPos.clone();
        
        // Two triangles
        positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
        positions.push(p1.x, p1.y, p1.z, p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        
        const material = new THREE.MeshBasicMaterial({ 
            color: axialColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5,
            depthWrite: false
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        sceneData.scene.add(mesh);
        window.feaDiagramObjects.push(mesh);
        
        // Outline
        const outlineGeom = new THREE.BufferGeometry().setFromPoints([p1, p2, p3, p4, p1]);
        const outlineMat = new THREE.LineBasicMaterial({ color: axialColor, linewidth: 2 });
        const outline = new THREE.Line(outlineGeom, outlineMat);
        sceneData.scene.add(outline);
        window.feaDiagramObjects.push(outline);

        // Add label at midpoint
        const midPoint = new THREE.Vector3().addVectors(iPos, jPos).multiplyScalar(0.5);
        const labelOffset = isVertical ? new THREE.Vector3(0.5, 0, 0) : new THREE.Vector3(0, 0.5, 0);
        const labelPos = midPoint.clone().add(labelOffset);
        const label = axial < 0 ? `${(-axial/1000).toFixed(1)} kN (C)` : `${(axial/1000).toFixed(1)} kN (T)`;
        addDiagramLabel(labelPos, label, sceneData);
    });

    if (window.addSolverLog) {
        window.addSolverLog('Axial force diagram displayed', 'info');
    }
};

// Show reactions
window.showFEAReactions = function(scale = 0.001) {
    window.clearFEADiagrams();
    
    const results = window.feaResults;
    const model = window.feaModel;
    const sceneData = window.sceneData;
    
    if (!results || !model || !sceneData) {
        console.error('No FEA results available');
        return;
    }

    console.log('Showing reactions');

    const nodePos = new Map();
    model.nodes.forEach(n => {
        nodePos.set(n.name, new THREE.Vector3(n.x, n.y, n.z));
    });

    // Auto-scale based on max reaction value
    let maxReaction = 0;
    results.reactions.forEach(r => {
        maxReaction = Math.max(maxReaction, Math.abs(r.fx), Math.abs(r.fy), Math.abs(r.fz));
    });
    const autoScale = maxReaction > 0 ? 1.5 / maxReaction : 0.001;

    results.reactions.forEach(reaction => {
        const pos = nodePos.get(reaction.node);
        if (!pos) return;

        // Reaction component data with colors
        const reactions = [
            { dir: new THREE.Vector3(1, 0, 0), value: reaction.fx, label: 'Rx', color: 0xff4444 },
            { dir: new THREE.Vector3(0, 1, 0), value: reaction.fy, label: 'Ry', color: 0x44ff44 },
            { dir: new THREE.Vector3(0, 0, 1), value: reaction.fz, label: 'Rz', color: 0x4444ff }
        ];

        let labelOffset = 0;
        const labelParts = [];

        reactions.forEach(r => {
            const absVal = Math.abs(r.value);
            if (absVal > 1) { // Only show significant reactions
                const arrowLength = absVal * autoScale;
                const arrowDir = r.dir.clone().multiplyScalar(r.value > 0 ? 1 : -1);
                
                // Arrow starts from below the support and points toward the structure
                const arrowStart = pos.clone().sub(arrowDir.clone().multiplyScalar(arrowLength));
                
                const arrow = new THREE.ArrowHelper(
                    arrowDir.clone().normalize(), 
                    arrowStart, 
                    arrowLength,
                    r.color,
                    arrowLength * 0.15,
                    arrowLength * 0.08
                );
                sceneData.scene.add(arrow);
                window.feaDiagramObjects.push(arrow);
                
                // Collect label info
                const valueKn = r.value / 1000;
                labelParts.push(`${r.label}=${valueKn.toFixed(1)} kN`);
            }
        });

        // Add combined label below the support
        if (labelParts.length > 0) {
            const labelText = `${reaction.node}: ${labelParts.join(', ')}`;
            addDiagramLabel(pos.clone().add(new THREE.Vector3(0, -0.7, 0)), labelText, sceneData);
        }
    });

    if (window.addSolverLog) {
        window.addSolverLog('Reactions displayed with labels', 'info');
    }
};

// Helper function to add clean text label (no background)
function addDiagramLabelClean(position, text, sceneData) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const dpr = 2; // Higher resolution
    canvas.width = 128 * dpr;
    canvas.height = 32 * dpr;
    
    // Clear - transparent background
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw text - clean, readable
    context.font = `${16 * dpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    context.fillStyle = '#1a1a1a';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true,
        depthTest: false
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    
    sprite.position.copy(position);
    sprite.scale.set(0.8, 0.2, 1);
    
    sceneData.scene.add(sprite);
    window.feaDiagramObjects.push(sprite);
}

// Legacy label function (keeping for compatibility)
function addDiagramLabel(position, text, sceneData) {
    addDiagramLabelClean(position, text, sceneData);
}

// ========================
// Results Summary
// ========================

window.getFEAResultsSummary = function() {
    const results = window.feaResults;
    if (!results) return null;

    return {
        maxDisplacement: results.summary.max_displacement * 1000, // Convert to mm
        maxDispNode: results.summary.max_disp_node,
        maxReaction: results.summary.max_reaction / 1000, // Convert to kN
        maxReactionNode: results.summary.max_reaction_node,
        numNodes: results.summary.num_nodes,
        numMembers: results.summary.num_members,
        nodeDisplacements: results.node_displacements.map(d => ({
            node: d.node,
            dx: d.dx * 1000,
            dy: d.dy * 1000,
            dz: d.dz * 1000
        })),
        reactions: results.reactions.map(r => ({
            node: r.node,
            fx: r.fx / 1000,
            fy: r.fy / 1000,
            fz: r.fz / 1000
        })),
        memberForces: results.member_forces.map(f => ({
            member: f.member,
            axial: f.axial_i / 1000,
            shear: f.shear_y_i / 1000,
            moment: f.moment_z_i / 1000
        }))
    };
};

console.log('FEA Solver integration loaded');
