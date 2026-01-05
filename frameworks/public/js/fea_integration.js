// FEA Solver Integration - Extract structure data and visualize results

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
                
                model.members.push({
                    name: memberName,
                    i_node: startNodeName,
                    j_node: endNodeName,
                    material: model.materials[0].name,
                    section: sectionProps.name
                });
                console.log(`Member ${memberName}: ${startNodeName} -> ${endNodeName}`);
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
    const w = section.width || 0.3;
    const h = section.height || 0.5;
    const tf = section.flange_thickness || 0.02;
    const tw = section.web_thickness || 0.015;

    let a, iy, iz, j;

    if (type === 'rectangular') {
        a = w * h;
        iy = w * Math.pow(h, 3) / 12;
        iz = h * Math.pow(w, 3) / 12;
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
        a = 2 * w * tf + (h - 2 * tf) * tw;
        iz = (w * Math.pow(h, 3) - (w - tw) * Math.pow(h - 2 * tf, 3)) / 12;
        iy = (2 * tf * Math.pow(w, 3) + (h - 2 * tf) * Math.pow(tw, 3)) / 12;
        j = (2 * w * Math.pow(tf, 3) + (h - 2 * tf) * Math.pow(tw, 3)) / 3;
    } else {
        // Default to rectangular
        a = w * h;
        iy = w * Math.pow(h, 3) / 12;
        iz = h * Math.pow(w, 3) / 12;
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
            const error = `HTTP error: ${response.status}`;
            if (window.addSolverLog) window.addSolverLog(error, 'error');
            return { error };
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
    
    // Also clear old diagram objects
    if (window.clearDiagrams) {
        window.clearDiagrams();
    }
};

// Show deformed shape
window.showFEADeformedShape = function(scale = 50) {
    window.clearFEADiagrams();
    
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
    const deformedMaterial = new THREE.LineBasicMaterial({ 
        color: 0x00ff00, 
        linewidth: 3,
        transparent: true,
        opacity: 0.8
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

// Show bending moment diagram
window.showFEABendingMomentDiagram = function(scale = 0.0001) {
    window.clearFEADiagrams();
    
    const results = window.feaResults;
    const model = window.feaModel;
    const sceneData = window.sceneData;
    
    if (!results || !model || !sceneData) {
        console.error('No FEA results available');
        return;
    }

    console.log('Showing bending moment diagram');

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

    // Colors for moment diagram
    const saggingColor = 0x42f5b9;  // Teal for positive/sagging moments
    const hoggingColor = 0x002fff;  // Blue for negative/hogging moments

    model.members.forEach(member => {
        const forces = forcesMap.get(member.name);
        if (!forces) return;

        const iPos = nodePos.get(member.i_node);
        const jPos = nodePos.get(member.j_node);
        if (!iPos || !jPos) return;

        // Member direction
        const memberDir = new THREE.Vector3().subVectors(jPos, iPos);
        const length = memberDir.length();
        memberDir.normalize();

        // Get distributed load on this member (UDL in FY direction)
        const loads = distLoadsMap.get(member.name) || [];
        let w = 0;
        loads.forEach(load => {
            if (load.direction === 'FY') {
                w += load.w1; // N/m (assumes uniform w1 = w2)
            }
        });

        // End moments from FEA (already includes any fixed-end effects)
        const Mi = forces.moment_z_i; // N·m at i-node
        const Mj = forces.moment_z_j; // N·m at j-node

        // For member with UDL and end moments:
        // M(x) = Mi + (Mj - Mi)*x/L + w*x*(L-x)/2
        // where w is positive downward (negative in our case for gravity)
        
        // Calculate moment at multiple points along the member
        const segments = 40;
        const moments = [];
        let maxAbsMoment = 0.1;
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const x = t * length;
            // Linear interpolation of end moments + parabolic UDL contribution
            // Note: w is typically negative for downward loads
            const M = Mi * (1 - t) + Mj * t + w * x * (length - x) / 2;
            moments.push(M);
            maxAbsMoment = Math.max(maxAbsMoment, Math.abs(M));
        }

        // Auto-scale: use 25% of member length for max moment visualization
        const diagramScale = (length * 0.25) / maxAbsMoment;
        
        console.log(`Member ${member.name}: Mi=${(Mi/1000).toFixed(1)} kNm, Mj=${(Mj/1000).toFixed(1)} kNm, w=${w} N/m, Mmax=${(maxAbsMoment/1000).toFixed(1)} kNm`);

        // Create filled moment diagram curve
        const curvePoints = [];
        const basePoints = [];
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const pos = new THREE.Vector3().lerpVectors(iPos, jPos, t);
            const M = moments[i];
            
            // Positive moment (sagging) shown below beam, negative (hogging) above
            const offset = M * diagramScale;
            const offsetPos = pos.clone();
            offsetPos.y -= offset; // offset perpendicular to beam (assuming horizontal beam)
            
            curvePoints.push(offsetPos);
            basePoints.push(pos.clone());
        }

        // Create filled shape using triangles
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        
        for (let i = 0; i < segments; i++) {
            const M_avg = (moments[i] + moments[i + 1]) / 2;
            const color = M_avg > 0 ? new THREE.Color(saggingColor) : new THREE.Color(hoggingColor);
            
            // Two triangles per segment
            // Triangle 1: base[i], curve[i], curve[i+1]
            positions.push(
                basePoints[i].x, basePoints[i].y, basePoints[i].z,
                curvePoints[i].x, curvePoints[i].y, curvePoints[i].z,
                curvePoints[i + 1].x, curvePoints[i + 1].y, curvePoints[i + 1].z
            );
            // Triangle 2: base[i], curve[i+1], base[i+1]
            positions.push(
                basePoints[i].x, basePoints[i].y, basePoints[i].z,
                curvePoints[i + 1].x, curvePoints[i + 1].y, curvePoints[i + 1].z,
                basePoints[i + 1].x, basePoints[i + 1].y, basePoints[i + 1].z
            );
            
            // Set colors for both triangles (6 vertices)
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
            opacity: 0.7
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        sceneData.scene.add(mesh);
        window.feaDiagramObjects.push(mesh);

        // Draw outline curve
        const curveGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
        const curveMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
        const curveLine = new THREE.Line(curveGeometry, curveMaterial);
        sceneData.scene.add(curveLine);
        window.feaDiagramObjects.push(curveLine);

        // Add max moment label at midspan
        const midIdx = Math.floor(segments / 2);
        const maxM = Math.max(...moments.map(Math.abs));
        const midPos = curvePoints[midIdx].clone();
        midPos.y -= 0.3; // Offset label below
        addDiagramLabel(midPos, `Mmax=${(maxM/1000).toFixed(1)} kN·m`, sceneData);

        // Add end moment labels if non-zero
        if (Math.abs(Mi) > 100) {
            addDiagramLabel(iPos.clone().add(new THREE.Vector3(0, 0.3, 0)), 
                `M=${(Mi/1000).toFixed(1)} kN·m`, sceneData);
        }
        if (Math.abs(Mj) > 100) {
            addDiagramLabel(jPos.clone().add(new THREE.Vector3(0, 0.3, 0)), 
                `M=${(Mj/1000).toFixed(1)} kN·m`, sceneData);
        }
    });

    if (window.addSolverLog) {
        window.addSolverLog('Bending moment diagram displayed', 'info');
    }
};

// Show shear force diagram
window.showFEAShearForceDiagram = function(scale = 0.0005) {
    window.clearFEADiagrams();
    
    const results = window.feaResults;
    const model = window.feaModel;
    const sceneData = window.sceneData;
    
    if (!results || !model || !sceneData) {
        console.error('No FEA results available');
        return;
    }

    console.log('Showing shear force diagram');

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

    // Colors for shear diagram
    const positiveColor = 0x00ff66;  // Green for positive shear
    const negativeColor = 0xff6600;  // Orange for negative shear

    model.members.forEach(member => {
        const forces = forcesMap.get(member.name);
        if (!forces) return;

        const iPos = nodePos.get(member.i_node);
        const jPos = nodePos.get(member.j_node);
        if (!iPos || !jPos) return;

        const memberDir = new THREE.Vector3().subVectors(jPos, iPos);
        const length = memberDir.length();
        memberDir.normalize();

        // Get distributed load on this member
        const loads = distLoadsMap.get(member.name) || [];
        let w = 0;
        loads.forEach(load => {
            if (load.direction === 'FY') {
                w += load.w1;
            }
        });

        // End shear forces from FEA
        const Vi = forces.shear_y_i; // N at i-node
        const Vj = forces.shear_y_j; // N at j-node (should be -Vi for simply supported with UDL)

        // For member with UDL: V(x) = Vi - w*x
        // This gives a linear variation from Vi to Vj
        
        const segments = 40;
        const shears = [];
        let maxAbsShear = 0.1;
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const x = t * length;
            const V = Vi - w * x;
            shears.push(V);
            maxAbsShear = Math.max(maxAbsShear, Math.abs(V));
        }

        // Auto-scale: use 25% of member length for max shear visualization
        const diagramScale = (length * 0.25) / maxAbsShear;
        
        console.log(`Member ${member.name}: Vi=${(Vi/1000).toFixed(1)} kN, Vj=${(Vj/1000).toFixed(1)} kN, w=${w} N/m`);

        // Create filled shear diagram
        const curvePoints = [];
        const basePoints = [];
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const pos = new THREE.Vector3().lerpVectors(iPos, jPos, t);
            const V = shears[i];
            
            const offset = V * diagramScale;
            const offsetPos = pos.clone();
            offsetPos.y -= offset;
            
            curvePoints.push(offsetPos);
            basePoints.push(pos.clone());
        }

        // Create filled shape using triangles with vertex colors
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        
        for (let i = 0; i < segments; i++) {
            const V_avg = (shears[i] + shears[i + 1]) / 2;
            const color = V_avg > 0 ? new THREE.Color(positiveColor) : new THREE.Color(negativeColor);
            
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
            opacity: 0.7
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        sceneData.scene.add(mesh);
        window.feaDiagramObjects.push(mesh);

        // Draw outline
        const curveGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
        const curveMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
        const curveLine = new THREE.Line(curveGeometry, curveMaterial);
        sceneData.scene.add(curveLine);
        window.feaDiagramObjects.push(curveLine);

        // Add labels
        addDiagramLabel(curvePoints[0].clone().add(new THREE.Vector3(0, -0.3, 0)), 
            `V=${(Vi/1000).toFixed(1)} kN`, sceneData);
        addDiagramLabel(curvePoints[segments].clone().add(new THREE.Vector3(0, -0.3, 0)), 
            `V=${(Vj/1000).toFixed(1)} kN`, sceneData);
    });

    if (window.addSolverLog) {
        window.addSolverLog('Shear force diagram displayed', 'info');
    }
};

// Show axial force diagram
window.showFEAAxialForceDiagram = function(scale = 0.0005) {
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

    // Draw axial force as colored members
    model.members.forEach(member => {
        const forces = forcesMap.get(member.name);
        if (!forces) return;

        const iPos = nodePos.get(member.i_node);
        const jPos = nodePos.get(member.j_node);
        if (!iPos || !jPos) return;

        const axial = forces.axial_i;
        
        // Color: red for compression, blue for tension
        const color = axial < 0 ? 0xff0000 : 0x0000ff;
        
        const material = new THREE.LineBasicMaterial({ 
            color: color, 
            linewidth: 5 
        });

        const points = [iPos.clone(), jPos.clone()];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, material);
        sceneData.scene.add(line);
        window.feaDiagramObjects.push(line);

        // Add label at midpoint
        const midPoint = new THREE.Vector3().addVectors(iPos, jPos).multiplyScalar(0.5);
        const label = axial < 0 ? `C=${(-axial/1000).toFixed(1)} kN` : `T=${(axial/1000).toFixed(1)} kN`;
        addDiagramLabel(midPoint, label, sceneData);
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

    const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff });

    results.reactions.forEach(reaction => {
        const pos = nodePos.get(reaction.node);
        if (!pos) return;

        // Draw reaction arrows
        const reactions = [
            { dir: new THREE.Vector3(1, 0, 0), value: reaction.fx, label: 'Rx' },
            { dir: new THREE.Vector3(0, 1, 0), value: reaction.fy, label: 'Ry' },
            { dir: new THREE.Vector3(0, 0, 1), value: reaction.fz, label: 'Rz' }
        ];

        reactions.forEach(r => {
            if (Math.abs(r.value) > 1) { // Only show significant reactions
                const arrowLength = Math.abs(r.value) * scale;
                const arrowDir = r.dir.clone().multiplyScalar(r.value > 0 ? 1 : -1);
                
                const arrow = new THREE.ArrowHelper(
                    arrowDir, 
                    pos.clone(), 
                    arrowLength,
                    0xff00ff,
                    arrowLength * 0.2,
                    arrowLength * 0.1
                );
                sceneData.scene.add(arrow);
                window.feaDiagramObjects.push(arrow);
            }
        });

        // Add label
        const totalR = Math.sqrt(reaction.fx**2 + reaction.fy**2 + reaction.fz**2);
        addDiagramLabel(pos.clone().add(new THREE.Vector3(0, -0.5, 0)), 
            `R=${(totalR/1000).toFixed(1)} kN`, sceneData);
    });

    if (window.addSolverLog) {
        window.addSolverLog('Reactions displayed', 'info');
    }
};

// Helper function to add text label
function addDiagramLabel(position, text, sceneData) {
    // Create sprite with text
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    context.font = 'Bold 24px Arial';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.fillText(text, canvas.width / 2, canvas.height / 2 + 8);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    
    sprite.position.copy(position);
    sprite.position.y += 0.3;
    sprite.scale.set(2, 0.5, 1);
    
    sceneData.scene.add(sprite);
    window.feaDiagramObjects.push(sprite);
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
