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

// Initialize label scale if not already set
if (typeof window.feaLabelScale === 'undefined') {
    window.feaLabelScale = 1.0;
}

// Track current diagram type for refresh on scale change
window.currentDiagramType = null;

// Function to refresh the current diagram with new scale
window.refreshCurrentDiagram = function() {
    if (!window.currentDiagramType) return;
    
    switch (window.currentDiagramType) {
        case 'moment_xy':
            window.clearFEADiagrams();
            window.currentDiagramType = 'moment_xy';
            window.showFEABendingMomentDiagramInternal('XY', false);
            break;
        case 'moment_xz':
            window.clearFEADiagrams();
            window.currentDiagramType = 'moment_xz';
            window.showFEABendingMomentDiagramInternal('XZ', false);
            break;
        case 'moment_both':
            window.clearFEADiagrams();
            window.currentDiagramType = 'moment_both';
            window.showFEABendingMomentDiagramInternal('XY', false);
            window.showFEABendingMomentDiagramInternal('XZ', false);
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

// Function to set diagram scale from UI slider (0-100 range)
window.setDiagramScale = function(scale) {
    window.diagramScale = Math.max(0, Math.min(100, scale));
    window.refreshCurrentDiagram();
};

// ========================
// FEA Server URL Configuration
// ========================

// Turn on for very verbose per-node/per-element logs.
// Keeping this off matters a lot for large plate meshes (console logging is slow).
if (typeof window.FEA_VERBOSE_LOGGING === 'undefined') {
    window.FEA_VERBOSE_LOGGING = false;
}

function feaDebugLog(...args) {
    if (window.FEA_VERBOSE_LOGGING) {
        console.log(...args);
    }
}

function feaDebugWarn(...args) {
    if (window.FEA_VERBOSE_LOGGING) {
        console.warn(...args);
    }
}

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
    
    // Default to local development.
    // Prefer matching the current host to avoid oddities (e.g. IPv6 localhost resolution).
    if (currentHost === '127.0.0.1') return 'http://127.0.0.1:8086';
    if (currentHost === 'localhost') return 'http://localhost:8086';
    return 'http://localhost:8086';
}

const FEA_SERVER_URL = getFEAServerUrl();
console.log('FEA Server URL:', FEA_SERVER_URL);
console.log('NOTE: If running in Codespaces, ensure port 8086 is set to PUBLIC visibility');

// ========================
// Console Progress Tracker
// ========================

class ConsoleProgressTracker {
    constructor(taskName) {
        this.taskName = taskName;
        this.startTime = performance.now();
        this.intervalId = null;
        this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        this.frameIndex = 0;
    }

    start() {
        this.startTime = performance.now();
        console.log(`%c🔄 ${this.taskName} started...`, 'color: #4CAF50; font-weight: bold');
    }

    update(message) {
        const elapsed = ((performance.now() - this.startTime) / 1000).toFixed(1);
        console.log(`%c  ├─ ${message} (${elapsed}s)`, 'color: #9E9E9E');
    }

    complete(resultMessage) {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        const totalTime = ((performance.now() - this.startTime) / 1000).toFixed(2);
        console.log(`%c✅ ${this.taskName} completed in ${totalTime}s`, 'color: #4CAF50; font-weight: bold');
        if (resultMessage) {
            console.log(`%c  └─ ${resultMessage}`, 'color: #8BC34A');
        }
    }

    error(errorMessage) {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        const totalTime = ((performance.now() - this.startTime) / 1000).toFixed(2);
        console.log(`%c❌ ${this.taskName} failed after ${totalTime}s`, 'color: #F44336; font-weight: bold');
        console.log(`%c  └─ ${errorMessage}`, 'color: #EF5350');
    }
}

// Global progress tracker instance
let feaProgressTracker = null;

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
        plates: [],
        plate_loads: [],
        supports: [],
        node_loads: [],
        distributed_loads: [],
        load_combos: []
    };

    // Node name mapping (index -> name)
    const nodeNameMap = new Map();
    const nodePositionMap = new Map(); // uuid -> node name
    const plateNameMap = new Map(); // uuid -> plate name

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
        feaDebugLog(`Node ${nodeName}:`, nodeMesh.position);
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
                
                // Get node positions to determine member orientation
                const iNode = model.nodes.find(n => n.name === startNodeName);
                const jNode = model.nodes.find(n => n.name === endNodeName);
                
                // Calculate member rotation angle
                // For horizontal beams: local y-axis should point up (global Y)
                // For vertical columns: need to rotate section to align strong axis with XY bending
                let rotation = 0;
                if (iNode && jNode) {
                    const dx = jNode.x - iNode.x;
                    const dy = jNode.y - iNode.y;
                    const dz = jNode.z - iNode.z;
                    const length = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    
                    // Check if member is vertical (dy is dominant)
                    const isVertical = Math.abs(dy) > 0.9 * length;
                    
                    if (isVertical) {
                        // Vertical column - rotate 90° to align strong axis (Iz) with XY plane bending
                        // Default local axes for vertical member: y=globalZ, z=globalX
                        // This means Iy resists XY bending (wrong for rectangular sections)
                        // Rotating 90° swaps the axes so Iz resists XY bending (correct)
                        rotation = Math.PI / 2;
                    } else {
                        // Horizontal beam - no rotation needed, default puts strong axis vertical
                        rotation = 0;
                    }
                }
                
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
                feaDebugLog(
                    `Member ${memberName}: ${startNodeName} -> ${endNodeName}, rotation=${rotation}°, releases:`,
                    releases
                );
                memberIdx++;
            }
        }
    });

    // Extract plates from platesGroup (mesh elements)
    console.log('=== Extracting Plates ===');
    let plateIdx = 0;
    if (sceneData.platesGroup) {
        console.log('Plate count:', sceneData.platesGroup.children.length);
        sceneData.platesGroup.children.forEach((plate) => {
            const plateThickness = plate.userData.thickness || 0.2;
            
            // Check if plate has a mesh (quad elements)
            if (plate.userData.mesh) {
                // Find the mesh visualization group
                const meshViz = plate.children.find(c => c.userData.isMeshViz);
                if (meshViz) {
                    feaDebugLog(`Plate mesh elements: ${meshViz.children.length}`);
                    meshViz.children.forEach((element) => {
                        if (element.userData.isMeshElement && element.userData.nodes && element.userData.nodes.length === 4) {
                            const nodes = element.userData.nodes;
                            
                            // Get node names for the 4 corners
                            // PyNite convention: i, j, m, n in counter-clockwise order
                            const iNodeName = nodePositionMap.get(nodes[0].uuid);
                            const jNodeName = nodePositionMap.get(nodes[1].uuid);
                            const mNodeName = nodePositionMap.get(nodes[2].uuid);
                            const nNodeName = nodePositionMap.get(nodes[3].uuid);
                            
                            if (iNodeName && jNodeName && mNodeName && nNodeName) {
                                const plateName = `P${plateIdx + 1}`;
                                plateNameMap.set(element.uuid, plateName);
                                
                                // Store node names in element userData for deformation visualization
                                element.userData.nodeNames = [iNodeName, jNodeName, mNodeName, nNodeName];
                                
                                // Get formulation from plate userData or global setting
                                // Options: "kirchhoff" (thin), "mindlin" (thick), "dkmq" (general)
                                const formulation = element.userData?.formulation || 
                                                   plate.userData?.formulation ||
                                                   window.plateFormulation || 
                                                   "kirchhoff";
                                
                                model.plates.push({
                                    name: plateName,
                                    i_node: iNodeName,
                                    j_node: jNodeName,
                                    m_node: mNodeName,
                                    n_node: nNodeName,
                                    thickness: plateThickness,
                                    material: model.materials[0].name,
                                    kx_mod: 1.0,
                                    ky_mod: 1.0,
                                    formulation: formulation
                                });
                                feaDebugLog(
                                    `Plate ${plateName}: ${iNodeName} -> ${jNodeName} -> ${mNodeName} -> ${nNodeName}, t=${plateThickness}, formulation=${formulation}`
                                );
                                plateIdx++;
                            } else {
                                feaDebugWarn('Plate element has nodes not in nodePositionMap');
                            }
                        }
                    });
                }
            } else {
                // Unmeshed plate - create single plate from corner nodes
                if (plate.userData.nodes && plate.userData.nodes.length === 4) {
                    const nodes = plate.userData.nodes;
                    const iNodeName = nodePositionMap.get(nodes[0].uuid);
                    const jNodeName = nodePositionMap.get(nodes[1].uuid);
                    const mNodeName = nodePositionMap.get(nodes[2].uuid);
                    const nNodeName = nodePositionMap.get(nodes[3].uuid);
                    
                    if (iNodeName && jNodeName && mNodeName && nNodeName) {
                        const plateName = `P${plateIdx + 1}`;
                        plateNameMap.set(plate.uuid, plateName);
                        
                        // Store node names in plate userData for deformation visualization
                        plate.userData.nodeNames = [iNodeName, jNodeName, mNodeName, nNodeName];
                        
                        // Get formulation from plate userData or global setting
                        const formulation = plate.userData?.formulation ||
                                           window.plateFormulation || 
                                           "kirchhoff";
                        
                        model.plates.push({
                            name: plateName,
                            i_node: iNodeName,
                            j_node: jNodeName,
                            m_node: mNodeName,
                            n_node: nNodeName,
                            thickness: plateThickness,
                            material: model.materials[0].name,
                            kx_mod: 1.0,
                            ky_mod: 1.0,
                            formulation: formulation
                        });
                        feaDebugLog(
                            `Plate ${plateName} (unmeshed): ${iNodeName} -> ${jNodeName} -> ${mNodeName} -> ${nNodeName}, t=${plateThickness}, formulation=${formulation}`
                        );
                        plateIdx++;
                    }
                }
            }
        });
    }
    console.log('Total plates extracted:', model.plates.length);

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

    // Extract point loads (from structural nodes and mesh nodes)
    if (window.pointLoads && window.pointLoads.length > 0) {
        window.pointLoads.forEach((load) => {
            // Handle structural node loads (nodeUuid)
            if (load.nodeUuid) {
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
                    console.log(`Point load at structural node ${nodeName}:`, load);
                }
            }
            // Handle mesh node loads (meshNodeName with position)
            else if (load.meshNodeName) {
                // Mesh node name is already the solver node name (from extraction)
                model.node_loads.push({
                    node: load.meshNodeName,
                    fx: load.fx || 0,
                    fy: load.fy || 0,
                    fz: load.fz || 0,
                    mx: 0,
                    my: 0,
                    mz: 0,
                    case: 'Case 1'
                });
                console.log(`Point load at mesh node ${load.meshNodeName}:`, load);
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

    // Extract plate loads from elementLoads Map (mesh element pressure loads)
    let elementLoadCount = 0;
    if (window.elementLoads && window.elementLoads.size > 0) {
        window.elementLoads.forEach((loads, elementUuid) => {
            const plateName = plateNameMap.get(elementUuid);
            if (!plateName) return;
            
            loads.forEach(load => {
                if (load.type === 'pressure_element') {
                    const pressure_Pa = load.magnitude * 1000;
                    model.plate_loads.push({
                        plate: plateName,
                        pressure: pressure_Pa,
                        case: 'Case 1'
                    });
                    elementLoadCount++;
                }
            });
        });
        if (elementLoadCount > 0) {
            console.log(`Extracted ${elementLoadCount} element pressure loads`);
        }
    }

    // Also check plateLoads (loads applied to entire plates or directly to mesh elements)
    let plateLoadCount = 0;
    if (window.plateLoads && window.plateLoads.size > 0) {
        window.plateLoads.forEach((loads, plateUuid) => {
            // First check if this UUID is a mesh element (directly in plateNameMap)
            const directPlateName = plateNameMap.get(plateUuid);
            if (directPlateName) {
                // This is a mesh element UUID - apply load directly
                loads.forEach(load => {
                    if (load.type === 'pressure') {
                        const pressure_Pa = load.magnitude * 1000;
                        model.plate_loads.push({
                            plate: directPlateName,
                            pressure: pressure_Pa,
                            case: 'Case 1'
                        });
                        plateLoadCount++;
                    }
                });
                return;
            }
            
            // Otherwise, check if it's a parent plate UUID
            if (!sceneData.platesGroup) return;
            const plate = sceneData.platesGroup.children.find(p => p.uuid === plateUuid);
            if (!plate) return;
            
            const meshViz = plate.children.find(c => c.userData.isMeshViz);
            if (meshViz) {
                // Apply to all mesh elements of this plate
                meshViz.children.forEach(element => {
                    const plateName = plateNameMap.get(element.uuid);
                    if (plateName) {
                        loads.forEach(load => {
                            if (load.type === 'pressure') {
                                const pressure_Pa = load.magnitude * 1000;
                                model.plate_loads.push({
                                    plate: plateName,
                                    pressure: pressure_Pa,
                                    case: 'Case 1'
                                });
                                plateLoadCount++;
                            }
                        });
                    }
                });
            } else {
                // Unmeshed plate - apply directly
                const plateName = plateNameMap.get(plateUuid);
                if (plateName) {
                    loads.forEach(load => {
                        if (load.type === 'pressure') {
                            const pressure_Pa = load.magnitude * 1000;
                            model.plate_loads.push({
                                plate: plateName,
                                pressure: pressure_Pa,
                                case: 'Case 1'
                            });
                            plateLoadCount++;
                        }
                    });
                }
            }
        });
        if (plateLoadCount > 0) {
            console.log(`Extracted ${plateLoadCount} plate-level pressure loads`);
        }
    }

    // Add default load combination if not specified
    if (model.load_combos.length === 0) {
        model.load_combos.push({
            name: '1.0 Case 1',
            factors: { 'Case 1': 1.0 }
        });
    }

    // Condensed model summary (single line)
    console.log(`%c📊 FEA Model: ${model.nodes.length} nodes, ${model.members.length} members, ${model.plates.length} plates, ${model.supports.length} supports, ${model.plate_loads.length} loads`, 
        'color: #2196F3; font-weight: bold');

    // Export plate name map for stress visualization
    window.feaPlateNameMap = plateNameMap;

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
    // Start progress tracking
    feaProgressTracker = new ConsoleProgressTracker('FEA Analysis');
    feaProgressTracker.start();
    
    if (window.addSolverLog) {
        window.addSolverLog('Starting FEA analysis...', 'info');
    }

    feaProgressTracker.update('Extracting structure data...');
    const model = window.extractFEAStructure(materialConfig, beamSectionConfig);
    
    if (!model) {
        const error = 'Failed to extract structure data from scene';
        if (window.addSolverLog) window.addSolverLog(error, 'error');
        feaProgressTracker.error(error);
        return { error };
    }

    if (model.nodes.length === 0) {
        const error = 'No nodes found in the model';
        if (window.addSolverLog) window.addSolverLog(error, 'error');
        feaProgressTracker.error(error);
        return { error };
    }

    // Allow analysis if we have either members or plates
    if (model.members.length === 0 && model.plates.length === 0) {
        const error = 'No members or plates found in the model';
        if (window.addSolverLog) window.addSolverLog(error, 'error');
        feaProgressTracker.error(error);
        return { error };
    }

    if (model.supports.length === 0) {
        const error = 'No supports found - model is unstable';
        if (window.addSolverLog) window.addSolverLog(error, 'error');
        feaProgressTracker.error(error);
        return { error };
    }

    const modelSummary = `${model.nodes.length} nodes, ${model.members.length} members, ${model.plates.length} plates`;
    feaProgressTracker.update(`Model: ${modelSummary}`);
    
    if (window.addSolverLog) {
        window.addSolverLog(`Model: ${modelSummary}, ${model.supports.length} supports`, 'info');
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

        feaProgressTracker.update('Sending request to solver backend (not WASM - server-side Rust)...');

        // If the backend isn't running (or an intermediate proxy is wedged), fetch can appear to
        // “hang forever”. Put a hard cap on wait time so UX recovers.
        const controller = new AbortController();
        const timeoutMs = 300000;  // 5 minutes for large plate models
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        let response;
        try {
            response = await fetch(`${FEA_SERVER_URL}/api/v1/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeoutId);
        }

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
            feaProgressTracker.error(errorMsg);
            return { error: errorMsg };
        }

        feaProgressTracker.update('Processing solver response...');
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
            
            // Complete progress tracking
            feaProgressTracker.complete(`Max displacement: ${(calculatedMaxDefl * 1000).toFixed(2)} mm`);
            
            // Store results globally
            window.feaResults = data.results;
            window.feaModel = model;
            
            // Update visualization
            window.updateFEAVisualization(data.results, model);
            
            // Update tabulated results panel
            if (window.updateTablesPanel) {
                window.updateTablesPanel(data.results);
            }
            
            return { success: true, results: data.results };
        } else {
            const error = data.error || 'Analysis failed';
            if (window.addSolverLog) window.addSolverLog(error, 'error');
            feaProgressTracker.error(error);
            return { error };
        }
    } catch (error) {
        let errorMsg = error?.toString ? error.toString() : String(error);
        if (error && error.name === 'AbortError') {
            errorMsg = `Timed out after 30s calling ${FEA_SERVER_URL}/api/v1/analyze. Is the Rust backend running (cargo run --bin fea-server)?`;
        } else if (typeof errorMsg === 'string' && errorMsg.toLowerCase().includes('failed to fetch')) {
            errorMsg = `Network error calling ${FEA_SERVER_URL}/api/v1/analyze. This usually means the backend isn't running, the port is blocked, or the browser couldn't complete CORS preflight.`;
        }

        if (window.addSolverLog) window.addSolverLog(`Error: ${errorMsg}`, 'error');
        feaProgressTracker.error(errorMsg);
        return { error: errorMsg };
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
        // Handle stress coloring - restore original material
        if (obj.type === 'stress_color' && obj.mesh) {
            const mesh = obj.mesh;
            if (mesh.userData && mesh.userData.originalMaterial) {
                // Restore from cloned original material
                const origMat = mesh.userData.originalMaterial;
                mesh.material.color.copy(origMat.color);
                mesh.material.transparent = origMat.transparent;
                mesh.material.opacity = origMat.opacity;
                mesh.material.depthWrite = origMat.depthWrite !== undefined ? origMat.depthWrite : true;
                mesh.material.depthTest = origMat.depthTest !== undefined ? origMat.depthTest : true;
                mesh.material.needsUpdate = true;
                
                // Clean up
                delete mesh.userData.originalMaterial;
                delete mesh.userData.hasStressOverlay;
            }
        } else {
            // Remove from scene (for drawn diagram objects)
            sceneData.scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        }
    });
    window.feaDiagramObjects = [];
    window.currentDiagramType = null;
    
    // Also remove any stress legend
    const existingLegend = document.getElementById('stress-legend');
    if (existingLegend) {
        existingLegend.remove();
    }
    
    console.log('FEA diagrams cleared');
};

// Show deformed shape
window.showFEADeformedShape = function(scale = 50) {
    window.clearFEADiagrams();
    window.currentDiagramType = 'deformed';
    window.lastDeformScale = scale;
    
    const results = window.feaResults;
    const model = window.feaModel;
    const sceneData = window.sceneData;
    
    if (!results || !model || !sceneData) {
        console.error('No FEA results available - results:', !!results, 'model:', !!model, 'sceneData:', !!sceneData);
        return;
    }

    console.log('Showing deformed shape with scale:', scale);
    console.log('Nodes:', model.nodes.length, 'Displacements:', results.node_displacements.length);

    // Build node displacement map with ALL 6 DOFs (translations AND rotations)
    const dispMap = new Map();
    let maxTransDisp = 0;
    results.node_displacements.forEach(d => {
        dispMap.set(d.node, { 
            dx: d.dx, dy: d.dy, dz: d.dz, 
            rx: d.rx || 0, ry: d.ry || 0, rz: d.rz || 0 
        });
        // Only consider translational displacements for scaling (not axial shortening which is tiny)
        const lateralDisp = Math.sqrt(d.dx*d.dx + d.dy*d.dy);
        maxTransDisp = Math.max(maxTransDisp, lateralDisp);
        console.log(`Node ${d.node}: dx=${(d.dx*1000).toFixed(3)}mm, dy=${(d.dy*1000).toFixed(3)}mm, rz=${(d.rz*1000).toFixed(3)}mrad`);
    });
    
    console.log('Max lateral displacement:', (maxTransDisp * 1000).toFixed(3), 'mm');

    // Build node position map from model
    const nodePos = new Map();
    let maxDim = 0;
    model.nodes.forEach(n => {
        nodePos.set(n.name, { x: n.x, y: n.y, z: n.z });
        maxDim = Math.max(maxDim, Math.abs(n.x), Math.abs(n.y), Math.abs(n.z));
    });

    // Auto-scale: make max displacement visible as fraction of structure size
    // Scale 0-100 maps linearly: scale 0 -> 0%, scale 50 -> 25%, scale 100 -> 50%
    const targetDeflectionRatio = (scale / 100) * 0.50; // 0% to 50% range
    const autoScale = maxTransDisp > 0 ? (maxDim * targetDeflectionRatio) / maxTransDisp : scale;
    console.log('Auto-scale factor:', autoScale.toFixed(1), 'target ratio:', (targetDeflectionRatio*100).toFixed(2), '%');

    let membersDrawn = 0;

    // Deformed shape color - Light Blue
    const deformedColor = 0x0097c4

    // Draw deformed members - ensure endpoints match exactly at displaced node positions
    model.members.forEach(member => {
        const iPos = nodePos.get(member.i_node);
        const jPos = nodePos.get(member.j_node);
        const iDisp = dispMap.get(member.i_node) || { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0 };
        const jDisp = dispMap.get(member.j_node) || { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0 };

        if (!iPos || !jPos) return;

        // Displaced node positions (these MUST be the endpoints for continuity)
        const iDeformed = new THREE.Vector3(
            iPos.x + iDisp.dx * autoScale,
            iPos.y + iDisp.dy * autoScale,
            iPos.z + iDisp.dz * autoScale
        );
        const jDeformed = new THREE.Vector3(
            jPos.x + jDisp.dx * autoScale,
            jPos.y + jDisp.dy * autoScale,
            jPos.z + jDisp.dz * autoScale
        );

        // Member direction vector (original)
        const memberDir = new THREE.Vector3(
            jPos.x - iPos.x,
            jPos.y - iPos.y,
            jPos.z - iPos.z
        );
        const memberLength = memberDir.length();
        memberDir.normalize();
        
        // Determine member orientation
        const isVertical = Math.abs(memberDir.y) > 0.7;
        
        // Get perpendicular direction for bending
        let perpDir;
        if (isVertical) {
            // Vertical member: bending perpendicular is in XZ plane
            perpDir = new THREE.Vector3(1, 0, 0);
        } else {
            // Horizontal member: bending perpendicular is Y (vertical)
            perpDir = new THREE.Vector3(0, 1, 0);
        }
        
        // Create deformed shape with cubic bending between the fixed endpoints
        // Use cubic Hermite interpolation for the TRANSVERSE bending only
        // Endpoints are FIXED to displaced node positions
        const segments = 20;
        const points = [];

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;  // 0 to 1 along member
            
            // Linear interpolation gives the straight line between displaced endpoints
            const linearPos = new THREE.Vector3().lerpVectors(iDeformed, jDeformed, t);
            
            // Add bending curvature based on end rotations
            // The cubic shape adds deflection perpendicular to the member
            // Shape function for internal bending: peaks at midspan, zero at ends
            
            // Hermite internal shape (zero at ends, influenced by rotations)
            // N2 at t: (t - 2t² + t³)  -> 0 at t=0, 0 at t=1, max at ~0.4
            // N4 at t: (-t² + t³)      -> 0 at t=0, 0 at t=1, min at ~0.6
            const N2 = (t - 2*t*t + t*t*t);
            const N4 = (-t*t + t*t*t);
            
            // Calculate bending offset based on rotations
            let bendingOffset = 0;
            
            // Determine beam orientation for correct rotation component
            const isAlongX = Math.abs(memberDir.x) > 0.7;
            const isAlongZ = Math.abs(memberDir.z) > 0.7;
            
            if (isVertical) {
                // Vertical column: rz rotation causes bending in X direction
                bendingOffset = (N2 * iDisp.rz + N4 * jDisp.rz) * memberLength * autoScale;
            } else if (isAlongX) {
                // Beam along X axis: rz rotation causes vertical bending
                const theta_i = iDisp.rz * Math.sign(memberDir.x);
                const theta_j = jDisp.rz * Math.sign(memberDir.x);
                bendingOffset = (N2 * theta_i + N4 * theta_j) * memberLength * autoScale;
            } else if (isAlongZ) {
                // Beam along Z axis: rx rotation causes vertical bending
                const theta_i = -iDisp.rx * Math.sign(memberDir.z);
                const theta_j = -jDisp.rx * Math.sign(memberDir.z);
                bendingOffset = (N2 * theta_i + N4 * theta_j) * memberLength * autoScale;
            } else {
                // General diagonal beam - use rz as approximation
                bendingOffset = (N2 * iDisp.rz + N4 * jDisp.rz) * memberLength * autoScale;
            }
            
            // Apply bending offset perpendicular to member
            const finalPos = linearPos.clone();
            if (isVertical) {
                // Bending in X direction for vertical members
                finalPos.x += bendingOffset;
            } else {
                // Bending in Y direction for horizontal members  
                finalPos.y += bendingOffset;
            }
            
            points.push(finalPos);
        }
        
        // Create a smooth curve through the points
        const curve = new THREE.CatmullRomCurve3(points);
        
        // Use thin line for deformed shape
        const tubeRadius = 0.008;
        const tubeGeometry = new THREE.TubeGeometry(curve, 40, tubeRadius, 4, false);
        const tubeMaterial = new THREE.MeshBasicMaterial({ 
            color: deformedColor,
            transparent: false
        });
        const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
        sceneData.scene.add(tube);
        window.feaDiagramObjects.push(tube);

        // Find max/min deflection point along the member for labeling
        // Check all points and find the one with maximum perpendicular offset from original
        let maxDeflection = 0;
        let maxDeflectionPoint = null;
        let maxDeflectionValue = { dx: 0, dy: 0, dz: 0 };
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const origPos = new THREE.Vector3().lerpVectors(iPos, jPos, t);
            const defPos = points[i];
            
            // Calculate deflection relative to original undeformed position
            const deflection = new THREE.Vector3().subVectors(defPos, origPos);
            const deflMag = deflection.length();
            
            if (deflMag > maxDeflection && t > 0.1 && t < 0.9) {
                // Only consider interior points (not near ends)
                maxDeflection = deflMag;
                maxDeflectionPoint = defPos.clone();
                // Calculate actual displacement at this point (interpolated)
                maxDeflectionValue = {
                    dx: (iDisp.dx * (1-t) + jDisp.dx * t) * autoScale + (defPos.x - origPos.x - (iDisp.dx * (1-t) + jDisp.dx * t) * autoScale),
                    dy: (iDisp.dy * (1-t) + jDisp.dy * t) * autoScale + (defPos.y - origPos.y - (iDisp.dy * (1-t) + jDisp.dy * t) * autoScale),
                    dz: (iDisp.dz * (1-t) + jDisp.dz * t) * autoScale + (defPos.z - origPos.z - (iDisp.dz * (1-t) + jDisp.dz * t) * autoScale)
                };
            }
        }
        
        // Add label at max deflection point if significant
        if (maxDeflectionPoint && maxDeflection > 0.01) {
            // Get midpoint interpolated displacement (unscaled, in original units)
            const midT = 0.5;
            const midOrigPos = new THREE.Vector3().lerpVectors(iPos, jPos, midT);
            const midDefPos = points[Math.floor(segments / 2)];
            
            // Calculate actual deflection at midpoint in mm
            const midDx = ((iDisp.dx + jDisp.dx) / 2) * 1000;
            const midDy = ((iDisp.dy + jDisp.dy) / 2) * 1000;
            const midDz = ((iDisp.dz + jDisp.dz) / 2) * 1000;
            
            // Position label offset from the max point
            const labelPos = maxDeflectionPoint.clone();
            labelPos.y += 0.15;
            labelPos.x += 0.1;
            
            // Format the deflection values at midspan
            const labelText = `δx=${midDx.toFixed(2)}mm\nδy=${midDy.toFixed(2)}mm\nδz=${midDz.toFixed(2)}mm`;
            addMultiLineLabelClean(labelPos, labelText, sceneData);
        }

        membersDrawn++;
    });

    console.log('Deformed members drawn:', membersDrawn);

    // Draw deformed node markers - black "+" crosses at displaced positions
    // Create a "+" cross shape using lines
    function createCrossMarker(position, size = 0.08) {
        const crossGroup = new THREE.Group();
        const material = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
        
        // Horizontal line
        const hGeom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-size, 0, 0),
            new THREE.Vector3(size, 0, 0)
        ]);
        const hLine = new THREE.Line(hGeom, material);
        crossGroup.add(hLine);
        
        // Vertical line (in Y for horizontal plates, adjust for vertical)
        const vGeom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, -size, 0),
            new THREE.Vector3(0, size, 0)
        ]);
        const vLine = new THREE.Line(vGeom, material);
        crossGroup.add(vLine);
        
        // Z-direction line for 3D visibility
        const zGeom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, -size),
            new THREE.Vector3(0, 0, size)
        ]);
        const zLine = new THREE.Line(zGeom, material);
        crossGroup.add(zLine);
        
        crossGroup.position.copy(position);
        return crossGroup;
    }
    
    model.nodes.forEach(node => {
        const pos = nodePos.get(node.name);
        const disp = dispMap.get(node.name) || { dx: 0, dy: 0, dz: 0 };
        
        if (pos) {
            // Skip nodes with negligible total displacement
            const totalDisp = Math.sqrt(disp.dx*disp.dx + disp.dy*disp.dy + disp.dz*disp.dz);
            if (totalDisp < 1e-10) return;
            
            // Show horizontal (sway) displacements at full scale
            // For vertical displacement, check if node is at base (fixed) - don't move it
            const isBaseNode = Math.abs(pos.y) < 0.01;  // At ground level
            
            const markerPos = new THREE.Vector3(
                pos.x + disp.dx * autoScale, 
                isBaseNode ? pos.y : pos.y + disp.dy * autoScale,
                pos.z + disp.dz * autoScale
            );
            
            const marker = createCrossMarker(markerPos);
            sceneData.scene.add(marker);
            window.feaDiagramObjects.push(marker);
        }
    });

    // Add deflection labels at displaced nodes showing x, y, z values
    model.nodes.forEach(node => {
        const pos = nodePos.get(node.name);
        const disp = dispMap.get(node.name);
        if (!pos || !disp) return;
        
        // Skip nodes with negligible displacement
        const totalDisp = Math.sqrt(disp.dx*disp.dx + disp.dy*disp.dy + disp.dz*disp.dz);
        if (totalDisp < 1e-8) return;
        
        // Position label near the displaced node
        const labelPos = new THREE.Vector3(
            pos.x + disp.dx * autoScale + 0.3,
            pos.y + disp.dy * autoScale + 0.2,
            pos.z + disp.dz * autoScale
        );
        
        // Format as x, y, z values in mm
        const labelText = `x=${(disp.dx*1000).toFixed(2)}mm\ny=${(disp.dy*1000).toFixed(2)}mm\nz=${(disp.dz*1000).toFixed(2)}mm`;
        addMultiLineLabelClean(labelPos, labelText, sceneData);
    });

    // ======== PLATE DEFORMATION ========
    // Draw deformed plate mesh using node displacements
    if (sceneData.platesGroup && sceneData.platesGroup.children.length > 0) {
        console.log('Drawing deformed plates:', sceneData.platesGroup.children.length);
        
        // Deformed mesh color - slightly lighter blue
        const deformedMeshColor = 0x40c8ff;
        
        sceneData.platesGroup.children.forEach((plateGroup, plateIdx) => {
            const meshViz = plateGroup.children.find(c => c.userData && c.userData.isMeshViz);
            
            if (meshViz && meshViz.children.length > 0) {
                // Process each mesh element
                meshViz.children.forEach((element, elemIdx) => {
                    if (!element.userData || !element.userData.isMeshElement) return;
                    
                    // Get the node names for this element from userData
                    const nodeNames = element.userData.nodeNames || [];
                    if (nodeNames.length !== 4) {
                        // Try to get from geometry positions if nodeNames not stored
                        return;
                    }
                    
                    // Get displaced positions for each corner
                    const deformedCorners = [];
                    let hasDisplacement = false;
                    
                    nodeNames.forEach(nodeName => {
                        const pos = nodePos.get(nodeName);
                        const disp = dispMap.get(nodeName) || { dx: 0, dy: 0, dz: 0 };
                        
                        if (pos) {
                            const defPos = new THREE.Vector3(
                                pos.x + disp.dx * autoScale,
                                pos.y + disp.dy * autoScale,
                                pos.z + disp.dz * autoScale
                            );
                            deformedCorners.push(defPos);
                            
                            if (Math.abs(disp.dx) > 1e-10 || Math.abs(disp.dy) > 1e-10 || Math.abs(disp.dz) > 1e-10) {
                                hasDisplacement = true;
                            }
                        }
                    });
                    
                    if (deformedCorners.length === 4 && hasDisplacement) {
                        // Create deformed quad mesh
                        const shape = new THREE.Shape();
                        
                        // Create BufferGeometry for the deformed quad
                        const geometry = new THREE.BufferGeometry();
                        const vertices = new Float32Array([
                            // First triangle
                            deformedCorners[0].x, deformedCorners[0].y, deformedCorners[0].z,
                            deformedCorners[1].x, deformedCorners[1].y, deformedCorners[1].z,
                            deformedCorners[2].x, deformedCorners[2].y, deformedCorners[2].z,
                            // Second triangle
                            deformedCorners[0].x, deformedCorners[0].y, deformedCorners[0].z,
                            deformedCorners[2].x, deformedCorners[2].y, deformedCorners[2].z,
                            deformedCorners[3].x, deformedCorners[3].y, deformedCorners[3].z,
                        ]);
                        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                        geometry.computeVertexNormals();
                        
                        // Deformed mesh material - semi-transparent cyan
                        const material = new THREE.MeshBasicMaterial({
                            color: deformedMeshColor,
                            transparent: true,
                            opacity: 0.4,
                            side: THREE.DoubleSide,
                            depthWrite: false
                        });
                        
                        const mesh = new THREE.Mesh(geometry, material);
                        sceneData.scene.add(mesh);
                        window.feaDiagramObjects.push(mesh);
                        
                        // Add wireframe outline for the deformed element
                        const edgeGeometry = new THREE.BufferGeometry().setFromPoints([
                            deformedCorners[0], deformedCorners[1],
                            deformedCorners[1], deformedCorners[2],
                            deformedCorners[2], deformedCorners[3],
                            deformedCorners[3], deformedCorners[0]
                        ]);
                        const edgeMaterial = new THREE.LineBasicMaterial({ 
                            color: deformedColor, 
                            linewidth: 2 
                        });
                        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
                        sceneData.scene.add(edges);
                        window.feaDiagramObjects.push(edges);
                    }
                });
            } else {
                // Unmeshed plate - handle as single element
                // Get plate node names from userData (set during extraction)
                const nodeNames = plateGroup.userData.nodeNames;
                if (nodeNames && nodeNames.length === 4) {
                    const deformedCorners = [];
                    let hasDisplacement = false;
                    
                    nodeNames.forEach(nodeName => {
                        const pos = nodePos.get(nodeName);
                        const disp = dispMap.get(nodeName) || { dx: 0, dy: 0, dz: 0 };
                        
                        if (pos) {
                            deformedCorners.push(new THREE.Vector3(
                                pos.x + disp.dx * autoScale,
                                pos.y + disp.dy * autoScale,
                                pos.z + disp.dz * autoScale
                            ));
                            if (Math.abs(disp.dx) > 1e-10 || Math.abs(disp.dy) > 1e-10 || Math.abs(disp.dz) > 1e-10) {
                                hasDisplacement = true;
                            }
                        }
                    });
                    
                    if (deformedCorners.length === 4 && hasDisplacement) {
                        // Create deformed quad
                        const geometry = new THREE.BufferGeometry();
                        const vertices = new Float32Array([
                            deformedCorners[0].x, deformedCorners[0].y, deformedCorners[0].z,
                            deformedCorners[1].x, deformedCorners[1].y, deformedCorners[1].z,
                            deformedCorners[2].x, deformedCorners[2].y, deformedCorners[2].z,
                            deformedCorners[0].x, deformedCorners[0].y, deformedCorners[0].z,
                            deformedCorners[2].x, deformedCorners[2].y, deformedCorners[2].z,
                            deformedCorners[3].x, deformedCorners[3].y, deformedCorners[3].z,
                        ]);
                        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                        geometry.computeVertexNormals();
                        
                        const material = new THREE.MeshBasicMaterial({
                            color: deformedMeshColor,
                            transparent: true,
                            opacity: 0.4,
                            side: THREE.DoubleSide,
                            depthWrite: false
                        });
                        
                        const mesh = new THREE.Mesh(geometry, material);
                        sceneData.scene.add(mesh);
                        window.feaDiagramObjects.push(mesh);
                        
                        // Wireframe
                        const edgeGeometry = new THREE.BufferGeometry().setFromPoints([
                            deformedCorners[0], deformedCorners[1],
                            deformedCorners[1], deformedCorners[2],
                            deformedCorners[2], deformedCorners[3],
                            deformedCorners[3], deformedCorners[0]
                        ]);
                        const edges = new THREE.LineSegments(edgeGeometry, 
                            new THREE.LineBasicMaterial({ color: deformedColor }));
                        sceneData.scene.add(edges);
                        window.feaDiagramObjects.push(edges);
                    }
                }
            }
        });
    }

    if (window.addSolverLog) {
        window.addSolverLog(`Deformed shape displayed (scale: ${scale}x, auto-factor: ${autoScale.toFixed(0)})`, 'info');
    }
};

// Show bending moment diagram - common implementation for both planes
window.showFEABendingMomentDiagramInternal = function(plane = 'XY', clearFirst = true) {
    if (clearFirst) {
        window.clearFEADiagrams();
    }
    
    const results = window.feaResults;
    const model = window.feaModel;
    const sceneData = window.sceneData;
    
    if (!results || !model || !sceneData) {
        console.error('No FEA results available');
        return;
    }

    const isXY = plane === 'XY';
    console.log(`Showing bending moment diagram (${plane} plane)`);
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

    // Pre-pass: Calculate global maximum moment across all members to determine
    // the zero-tolerance threshold. Values below 1% of max are treated as zero
    // to eliminate numerical precision artifacts in symmetrical structures.
    let globalMaxMoment = 0;
    results.member_forces.forEach(f => {
        globalMaxMoment = Math.max(globalMaxMoment, 
            Math.abs(f.moment_z_i), Math.abs(f.moment_z_j),
            Math.abs(f.moment_y_i), Math.abs(f.moment_y_j)
        );
    });
    // Tolerance: 1% of max moment (or 10 N·m minimum to avoid div by zero issues)
    // Tolerance is used only to suppress numerical noise.
    // IMPORTANT: Do not use a large absolute floor here, because solver units may be kN·m
    // (e.g. ~9.41) and a floor like 10 would hide real diagrams.
    const momentTolerance = Math.max(globalMaxMoment * 1e-4, 1e-6);
    console.log(`Global max moment: ${(globalMaxMoment/1000).toFixed(2)} kNm, tolerance: ${(momentTolerance/1000).toFixed(3)} kNm`);

    // Colors for moment diagram
    // Hogging = negative moment = tension at top fiber = green
    // Sagging = positive moment = tension at bottom fiber = blue
    const saggingColor = 0x0066ff;  // Blue for sagging moments (midspan of loaded beams)
    const hoggingColor = 0x00bd91;  // Green for hogging moments (at supports/columns)
    const columnColor = 0x0066cc;   // Blue for all column moments

    // Reconstruct the solver's local axes (same logic as fea-solver/src/math.rs::member_transformation_matrix)
    // and apply member rotation about local x.
    function computeMemberLocalAxes(iPos, jPos, rotationRad) {
        const dx = jPos.x - iPos.x;
        const dy = jPos.y - iPos.y;
        const dz = jPos.z - iPos.z;

        const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (L < 1e-10) {
            throw new Error('Member has zero length');
        }

        const xAxis = new THREE.Vector3(dx / L, dy / L, dz / L);
        const eps = 1e-10;

        let yAxis;
        let zAxis;

        // Vertical member: x approx parallel to global Y
        if (Math.abs(xAxis.x) < eps && Math.abs(xAxis.z) < eps) {
            // Match solver: y is +/- global Z depending on direction, z is global X
            yAxis = new THREE.Vector3(0, 0, xAxis.y > 0 ? 1 : -1);
            zAxis = new THREE.Vector3(1, 0, 0);
        } else {
            // Non-vertical member: z = x cross globalY (normalized), y = z cross x
            const globalY = new THREE.Vector3(0, 1, 0);
            zAxis = new THREE.Vector3().crossVectors(xAxis, globalY);
            const zLen = zAxis.length();
            if (zLen < eps) {
                throw new Error('Cannot construct member local axes');
            }
            zAxis.divideScalar(zLen);
            yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis);
        }

        // Apply member rotation about local x-axis
        if (Math.abs(rotationRad) > 1e-10) {
            const cosR = Math.cos(rotationRad);
            const sinR = Math.sin(rotationRad);
            const y0 = yAxis.clone();
            const z0 = zAxis.clone();
            yAxis = y0.multiplyScalar(cosR).add(z0.clone().multiplyScalar(sinR));
            zAxis = y0.multiplyScalar(-sinR).add(z0.multiplyScalar(cosR));
        }

        return { xAxis, yAxis, zAxis, length: L };
    }

    // Helper to get perpendicular direction for diagram offset based on plane
    // The perpendicular determines which direction the moment diagram "bulges"
    // For columns, we need to determine the "outward" direction based on frame geometry
    function getPerpendicular(memberDir, isXYPlane, memberMidpoint, frameCentroid, minX, maxX, minZ, maxZ) {
        const up = new THREE.Vector3(0, 1, 0);
        const xAxis = new THREE.Vector3(1, 0, 0);
        const zAxis = new THREE.Vector3(0, 0, 1);
        
        // Check if member is vertical (along Y axis)
        const isVertical = Math.abs(memberDir.dot(up)) > 0.9;
        
        if (isVertical) {
            // Vertical member (column)
            // Determine outward direction based on which edge the column is at
            const edgeTol = 0.1;
            if (isXYPlane) {
                // XY plane: diagram offset in X direction
                // Check if at min or max X edge
                if (Math.abs(memberMidpoint.x - minX) < edgeTol) {
                    // Column at left edge - outward is -X
                    return xAxis.clone().multiplyScalar(-1);
                } else if (Math.abs(memberMidpoint.x - maxX) < edgeTol) {
                    // Column at right edge - outward is +X
                    return xAxis.clone().multiplyScalar(1);
                } else {
                    // Middle column - use centroid comparison
                    const outwardX = memberMidpoint.x - frameCentroid.x;
                    return xAxis.clone().multiplyScalar(outwardX >= 0 ? 1 : -1);
                }
            } else {
                // XZ plane: diagram offset in Z direction
                // Check if at min or max Z edge
                if (Math.abs(memberMidpoint.z - minZ) < edgeTol) {
                    // Column at back edge - outward is -Z (more negative)
                    return zAxis.clone().multiplyScalar(-1);
                } else if (Math.abs(memberMidpoint.z - maxZ) < edgeTol) {
                    // Column at front edge - outward is +Z (more positive)
                    return zAxis.clone().multiplyScalar(1);
                } else {
                    // Middle column - use centroid comparison
                    const outwardZ = memberMidpoint.z - frameCentroid.z;
                    return zAxis.clone().multiplyScalar(outwardZ >= 0 ? 1 : -1);
                }
            }
        } else {
            // Horizontal beam - unchanged from before
            if (isXYPlane) {
                // XY plane (Mz bending): diagram should bulge in Y direction (vertical)
                return up.clone();
            } else {
                // XZ plane (My bending): diagram should bulge in Y direction too
                return up.clone();
            }
        }
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
            const isAlongX = !isVertical && Math.abs(memberDir.x) > 0.7;
            const isAlongZ = !isVertical && Math.abs(memberDir.z) > 0.7;
            
            // Calculate member midpoint
            const memberMidpoint = new THREE.Vector3().lerpVectors(iPos, jPos, 0.5);
            
            // Check if column is at edge of frame
            const isAtMinX = Math.abs(memberMidpoint.x - minX) < edgeTolerance;
            const isAtMaxX = Math.abs(memberMidpoint.x - maxX) < edgeTolerance;
            const isAtMinZ = Math.abs(memberMidpoint.z - minZ) < edgeTolerance;
            const isAtMaxZ = Math.abs(memberMidpoint.z - maxZ) < edgeTolerance;
            const isEdgeColumnX = isAtMinX || isAtMaxX;
            const isEdgeColumnZ = isAtMinZ || isAtMaxZ;
            
            // For 3D structures, show ALL columns in both views since they all have biaxial bending
            // Only filter beams: XY view shows all beams, XZ view shows no beams (only column out-of-plane moments)
            if (!isXY) {
                // My view (XZ plane): only show columns (vertical members), not beams
                if (!isVertical) {
                    console.log(`Member ${member.name}: skipping beam in My view`);
                    return;
                }
            }
            
            console.log(`Member ${member.name}: isVertical=${isVertical}, isAlongX=${isAlongX}, isAlongZ=${isAlongZ}, edgeX=${isEdgeColumnX}, edgeZ=${isEdgeColumnZ}, showing in ${plane} view`);

            // Get distributed load on this member
            const loads = distLoadsMap.get(member.name) || [];
        let w = 0;
        loads.forEach(load => {
            // For XY plane: use FY loads; for XZ plane: use FZ loads
            if ((isXY && load.direction === 'FY') || (!isXY && load.direction === 'FZ')) {
                w += load.w1; // N/m (assumes uniform w1 = w2)
            }
        });

        // End moments and shear from FEA
        // The moment/shear to display depends on member orientation AND view plane
        // 
        // LOCAL AXIS CONVENTIONS (PyNite):
        // 
        // For VERTICAL members (along Y):
        //   If pointing up: local y = [-1, 0, 0] (global -X), local z = [0, 0, 1] (global +Z)
        //   With 90° rotation: local y rotates, local z stays in XZ plane
        //
        // For HORIZONTAL members along X:
        //   local x = [1, 0, 0], local y = [0, 1, 0] (global Y), local z = [0, 0, -1] (global -Z)
        //   Mz = moment about local z = bending in XY plane (vertical bending from gravity)
        //
        // For HORIZONTAL members along Z:
        //   local x = [0, 0, 1], local y = [0, 1, 0] (global Y), local z = [-1, 0, 0] (global -X)  
        //   Mz = moment about local z = bending about -X = bending in YZ plane (vertical bending from gravity)
        //
        // So Mz is ALWAYS the gravity-induced vertical bending for horizontal beams!
        // My is the lateral/horizontal plane bending.
        // Moment component selection (matches PyNite local-axis rules + our 90° column rotation):
        // - We rotate VERTICAL columns 90° about their local x-axis (global Y) to align section strong axis.
        //   That rotation swaps the column local y/z directions:
        //     before rot:  local y = -X, local z = +Z
        //     after  rot:  local y = +Z, local z = +X
        //   So:
        //     - Bending about GLOBAL Z (XY-frame bending) => column moment_y
        //     - Bending about GLOBAL X (out-of-plane / long-direction) => column moment_z
        //
        // View mapping:
        // - Mz view (XY plane): show XY-frame bending
        //   - Columns: use moment_y / shear_z
        //   - Beams:   use moment_z / shear_y
        // - My view (XZ plane): show out-of-plane bending of columns
        //   - Columns: use moment_z / shear_y
        //   - Beams:   not shown (filtered above)
        let Mi, Vi, Mj;

        // Get perpendicular direction BEFORE moment calculation
        // This defines the positive direction for moment offset (tension side convention)
        const perpDir = getPerpendicular(memberDir, isXY, memberMidpoint, frameCentroid, minX, maxX, minZ, maxZ);

        if (isVertical) {
            if (isXY) {
                Mi = forces.moment_y_i;
                Mj = forces.moment_y_j;
            } else {
                Mi = forces.moment_z_i;
                Mj = forces.moment_z_j;
            }

            // For columns: Apply sign based on column position to ensure consistent
            // orientation across the frame. The perpDir points outward from frame center.
            //
            // Key insight for fixed bases: Mi and Mj may have OPPOSITE signs!
            // - Fixed base creates tension on inside at base (negative moment when viewing from outside)
            // - Joint moment creates tension on outside at top (positive moment)
            // - This creates a "crossover" in the diagram
            //
            // The columnSide factor ensures that:
            // - For left columns: positive values bulge left (outward)
            // - For right columns: positive values bulge right (outward)
            // If Mi and Mj have opposite signs, the diagram will naturally cross over.
            const columnSide = isXY ? Math.sign(perpDir.x) : -Math.sign(perpDir.z);
            
            // Debug: log the raw and adjusted moments
            console.log(`Column ${member.name}: raw Mi=${(forces.moment_y_i/1000).toFixed(2)}, Mj=${(forces.moment_y_j/1000).toFixed(2)}, columnSide=${columnSide}`);
            
            Mi = Mi * columnSide;
            Mj = Mj * columnSide;
            
            console.log(`Column ${member.name}: adjusted Mi=${(Mi/1000).toFixed(2)}, Mj=${(Mj/1000).toFixed(2)}`);
            console.log(`Column ${member.name}: Mi sign=${Mi >= 0 ? '+' : '-'}, Mj sign=${Mj >= 0 ? '+' : '-'}, will ${Math.sign(Mi) !== Math.sign(Mj) ? 'CROSS OVER' : 'NOT cross'}`);


            Vi = (Mi - Mj) / length;
        } else {
            // Horizontal beams (Mz view): keep using local Mz for vertical bending
            Mi = forces.moment_z_i;
            Vi = forces.shear_y_i;
            Mj = forces.moment_z_j;
        }

        // Apply tolerance: treat near-zero moments as exactly zero
        // This eliminates numerical precision artifacts in symmetrical structures
        if (Math.abs(Mi) < momentTolerance) Mi = 0;
        if (Math.abs(Mj) < momentTolerance) Mj = 0;
        if (Math.abs(Vi) < momentTolerance) Vi = 0;

        // For member with shear, end moments and UDL:
        // M(x) = Mi - Vi*x - w*x²/2  (following Pynite convention)
        // This correctly handles the moment diagram for frames
        
        // Calculate moment at multiple points along the member
        const segments = 40;
        const moments = [];
        let maxAbsMoment = 0;
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const x = t * length;
            // Using proper beam mechanics: M(x) = Mi - Vi*x - w*x²/2
            const M = Mi - Vi * x - w * x * x / 2;
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
            // Use signed moment so load reversal flips diagram side
            const offset = M * diagramScale;
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
                segColor = columnColor;  // Blue for columns
            } else {
                segColor = M_avg >= 0 ? saggingColor : hoggingColor;
            }
            const segMaterial = new THREE.LineBasicMaterial({ color: segColor, linewidth: 1 });
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
        window.addSolverLog(`Bending moment diagram (${plane} plane) displayed`, 'info');
    }
};

// Wrapper function for XY plane (about Z-axis) - default behavior
window.showFEABendingMomentDiagram = function() {
    // Check if we should add to existing moment diagrams or clear first
    const isMomentDiagram = window.currentDiagramType === 'moment_xy' || 
                            window.currentDiagramType === 'moment_xz' || 
                            window.currentDiagramType === 'moment_both';
    
    if (!isMomentDiagram) {
        // Clear non-moment diagrams first
        window.clearFEADiagrams();
    }
    
    // Update diagram type
    if (window.currentDiagramType === 'moment_xz') {
        window.currentDiagramType = 'moment_both';
    } else {
        window.currentDiagramType = 'moment_xy';
    }
    
    window.showFEABendingMomentDiagramInternal('XY', false);
};

// Wrapper function for XZ plane (about Y-axis)
window.showFEABendingMomentDiagramXZ = function() {
    // Check if we should add to existing moment diagrams or clear first
    const isMomentDiagram = window.currentDiagramType === 'moment_xy' || 
                            window.currentDiagramType === 'moment_xz' || 
                            window.currentDiagramType === 'moment_both';
    
    if (!isMomentDiagram) {
        // Clear non-moment diagrams first
        window.clearFEADiagrams();
    }
    
    // Update diagram type
    if (window.currentDiagramType === 'moment_xy') {
        window.currentDiagramType = 'moment_both';
    } else {
        window.currentDiagramType = 'moment_xz';
    }
    
    window.showFEABendingMomentDiagramInternal('XZ', false);
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

    // Colors for shear diagram
    const positiveColor = 0x00ff66;  // Green for positive shear
    const negativeColor = 0xff6600;  // Orange for negative shear

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
            opacity: 0.4,
            depthWrite: false
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        sceneData.scene.add(mesh);
        window.feaDiagramObjects.push(mesh);

        // Draw colored outline segments
        for (let i = 0; i < segments; i++) {
            const segPoints = [curvePoints[i], curvePoints[i + 1]];
            const segGeometry = new THREE.BufferGeometry().setFromPoints(segPoints);
            const V_avg = (shears[i] + shears[i + 1]) / 2;
            const segColor = V_avg > 0 ? positiveColor : negativeColor;
            const segMaterial = new THREE.LineBasicMaterial({ color: segColor, linewidth: 1 });
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

// Show axial force diagram - similar style to shear force diagram
window.showFEAAxialForceDiagram = function() {
    window.currentDiagramType = 'axial';
    window.clearFEADiagrams();
    
    const results = window.feaResults;
    const model = window.feaModel;
    const sceneData = window.sceneData;
    
    if (!results || !model || !sceneData) {
        console.error('No FEA results available - results:', !!results, 'model:', !!model, 'sceneData:', !!sceneData);
        return;
    }

    console.log('Showing axial force diagram');
    console.log('Members:', model.members.length, 'Forces:', results.member_forces.length);

    const forcesMap = new Map();
    results.member_forces.forEach(f => {
        forcesMap.set(f.member, f);
    });

    const nodePos = new Map();
    model.nodes.forEach(n => {
        nodePos.set(n.name, new THREE.Vector3(n.x, n.y, n.z));
    });

    // Find max axial force for scaling
    let maxAxial = 0.1;
    results.member_forces.forEach(f => {
        maxAxial = Math.max(maxAxial, Math.abs(f.axial_i));
    });
    console.log('Max axial force:', (maxAxial/1000).toFixed(2), 'kN');

    // Colors - dark red for compression, dark blue for tension
    const compressionColor = 0x990000;  // Dark red
    const tensionColor = 0x000099;      // Dark blue

    let diagramsCreated = 0;

    // Draw axial force diagram similar to shear force (filled shape offset from member)
    model.members.forEach(member => {
        const forces = forcesMap.get(member.name);
        if (!forces) return;

        const iPos = nodePos.get(member.i_node);
        const jPos = nodePos.get(member.j_node);
        if (!iPos || !jPos) return;

        const axial = forces.axial_i;  // Axial force is constant along member
        
        // Skip negligible forces
        if (Math.abs(axial) < maxAxial * 0.01) return;

        // Calculate member properties
        const direction = new THREE.Vector3().subVectors(jPos, iPos);
        const length = direction.length();
        direction.normalize();
        
        // Get perpendicular direction (for offset)
        const isVertical = Math.abs(direction.y) > 0.9;
        let perpDir;
        if (isVertical) {
            // For vertical members, offset in X direction
            perpDir = new THREE.Vector3(1, 0, 0);
        } else {
            // For horizontal members, offset upward (Y)
            perpDir = new THREE.Vector3(0, 1, 0);
        }
        
        // Scale the axial force for visualization
        // Use 15% of member length for max force
        const baseScale = (length * 0.15) / maxAxial;
        const userScale = window.diagramScale || 1.0;
        const diagramScale = baseScale * userScale;
        
        // Axial force is constant, so create a rectangle
        const offset = axial * diagramScale;
        const color = axial < 0 ? compressionColor : tensionColor;
        
        // Create filled rectangle shape
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const colorObj = new THREE.Color(color);
        
        // 4 corners of the rectangle
        const p1 = iPos.clone();  // base start
        const p2 = jPos.clone();  // base end
        const p3 = jPos.clone().add(perpDir.clone().multiplyScalar(offset));  // offset end
        const p4 = iPos.clone().add(perpDir.clone().multiplyScalar(offset));  // offset start
        
        // Two triangles to make the rectangle
        positions.push(
            p1.x, p1.y, p1.z,
            p4.x, p4.y, p4.z,
            p3.x, p3.y, p3.z
        );
        positions.push(
            p1.x, p1.y, p1.z,
            p3.x, p3.y, p3.z,
            p2.x, p2.y, p2.z
        );
        
        for (let j = 0; j < 6; j++) {
            colors.push(colorObj.r, colorObj.g, colorObj.b);
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        const material = new THREE.MeshBasicMaterial({ 
            vertexColors: true,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5,
            depthWrite: false
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        sceneData.scene.add(mesh);
        window.feaDiagramObjects.push(mesh);
        
        // Draw outline
        const outlineGeometry = new THREE.BufferGeometry().setFromPoints([p1, p4, p3, p2, p1]);
        const outlineMaterial = new THREE.LineBasicMaterial({ color: color, linewidth: 1 });
        const outline = new THREE.Line(outlineGeometry, outlineMaterial);
        sceneData.scene.add(outline);
        window.feaDiagramObjects.push(outline);
        
        diagramsCreated++;

        // Add label at midpoint
        const midPoint = new THREE.Vector3().addVectors(iPos, jPos).multiplyScalar(0.5);
        const labelPos = midPoint.clone().add(perpDir.clone().multiplyScalar(offset + 0.2));
        const label = axial < 0 ? `C=${(-axial/1000).toFixed(1)}` : `T=${(axial/1000).toFixed(1)}`;
        addDiagramLabelClean(labelPos, label, sceneData);
    });

    console.log('Axial diagrams created:', diagramsCreated);

    if (window.addSolverLog) {
        window.addSolverLog(`Axial force diagram displayed (${diagramsCreated} members)`, 'info');
    }
};

// Show reactions
window.showFEAReactions = function(scale = 0.001) {
    window.clearFEADiagrams();
    window.currentDiagramType = 'reactions';
    
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

    // Fixed arrow length for all reactions (uniform size, not scaled by magnitude)
    const arrowLength = 1.0;
    
    // Build reactions summary for console/log
    const reactionsSummary = [];

    results.reactions.forEach(reaction => {
        const pos = nodePos.get(reaction.node);
        if (!pos) return;

        // Reaction force components with distinct colors
        const forceReactions = [
            { dir: new THREE.Vector3(1, 0, 0), value: reaction.fx, label: 'Rx', color: 0xff0000 }, // Bright red (horizontal X)
            { dir: new THREE.Vector3(0, 1, 0), value: reaction.fy, label: 'Ry', color: 0x006400 }, // Dark green (vertical Y) - distinct from support
            { dir: new THREE.Vector3(0, 0, 1), value: reaction.fz, label: 'Rz', color: 0x0088ff }  // Bright blue (horizontal Z)
        ];

        // Reaction moment components
        const momentReactions = [
            { value: reaction.mx || 0, label: 'Mx' },
            { value: reaction.my || 0, label: 'My' },
            { value: reaction.mz || 0, label: 'Mz' }
        ];

        const labelLines = [];
        const summaryParts = [];

        forceReactions.forEach(r => {
            const absVal = Math.abs(r.value);
            if (absVal > 1) { // Only show significant reactions (> 1 N)
                const arrowDir = r.dir.clone().multiplyScalar(r.value > 0 ? 1 : -1);
                
                // Arrow starts from below the support and points toward the structure
                const arrowStart = pos.clone().sub(arrowDir.clone().multiplyScalar(arrowLength));
                
                // Create arrow with larger head for visibility
                const headLength = Math.max(0.15, arrowLength * 0.25);
                const headWidth = Math.max(0.1, arrowLength * 0.15);
                
                const arrow = new THREE.ArrowHelper(
                    arrowDir.clone().normalize(), 
                    arrowStart, 
                    arrowLength,
                    r.color,
                    headLength,
                    headWidth
                );
                
                // Make the arrow line thicker by replacing with cylinder
                arrow.line.material.linewidth = 3;
                
                sceneData.scene.add(arrow);
                window.feaDiagramObjects.push(arrow);
                
                // Collect label info - each on its own line
                const valueKn = r.value / 1000;
                labelLines.push(`${r.label}=${valueKn.toFixed(1)} kN`);
                summaryParts.push(`${r.label}=${valueKn.toFixed(2)} kN`);
            }
        });

        // Add moment reactions to labels (for fixed supports)
        momentReactions.forEach(m => {
            const absVal = Math.abs(m.value);
            if (absVal > 1) { // Only show significant moments (> 1 N·m)
                const valueKnm = m.value / 1000;
                labelLines.push(`${m.label}=${valueKnm.toFixed(1)} kN·m`);
                summaryParts.push(`${m.label}=${valueKnm.toFixed(2)} kN·m`);
            }
        });

        // Add multi-line label below the support
        if (labelLines.length > 0) {
            addMultiLineDiagramLabel(pos.clone().add(new THREE.Vector3(0, -0.8, 0)), labelLines, sceneData);
            
            // Add to summary
            reactionsSummary.push(`${reaction.node}: ${summaryParts.join(', ')}`);
        }
    });

    // Log reactions summary as a table
    console.log('=== REACTIONS SUMMARY ===');
    
    // Build table data for console.table
    const tableData = [];
    results.reactions.forEach(reaction => {
        const row = {
            'Node': reaction.node,
            'Rx (kN)': (reaction.fx / 1000).toFixed(2),
            'Ry (kN)': (reaction.fy / 1000).toFixed(2),
            'Rz (kN)': (reaction.fz / 1000).toFixed(2)
        };
        // Add moments if present
        if (reaction.mx !== undefined) row['Mx (kN·m)'] = (reaction.mx / 1000).toFixed(2);
        if (reaction.my !== undefined) row['My (kN·m)'] = (reaction.my / 1000).toFixed(2);
        if (reaction.mz !== undefined) row['Mz (kN·m)'] = (reaction.mz / 1000).toFixed(2);
        tableData.push(row);
    });
    
    console.table(tableData);
    console.log('========================');
    
    if (window.addSolverLog) {
        window.addSolverLog('Reactions displayed:', 'info');
        reactionsSummary.forEach(line => {
            window.addSolverLog(`  ${line}`, 'info');
        });
    }
};

// Helper function to add multi-line label for reactions
function addMultiLineDiagramLabel(position, lines, sceneData) {
    const labelScale = window.feaLabelScale || 1.0;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const dpr = 2; // Higher resolution
    const lineHeight = 22 * dpr;
    const padding = 8 * dpr;
    
    canvas.width = 180 * dpr;
    canvas.height = (lines.length * lineHeight + padding * 2);
    
    // Clear - transparent background
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw each line
    context.font = `${16 * dpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    context.fillStyle = '#000000';
    context.textAlign = 'left';
    context.textBaseline = 'top';
    
    lines.forEach((line, i) => {
        context.fillText(line, padding, padding + i * lineHeight);
    });
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true,
        depthTest: false
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    
    sprite.position.copy(position);
    // Adjust scale based on number of lines
    const heightScale = 0.25 * lines.length * labelScale;
    sprite.scale.set(1.4 * labelScale, heightScale, 1);
    
    sceneData.scene.add(sprite);
    window.feaDiagramObjects.push(sprite);
}

// Helper function to add clean text label (no background)
// Uses window.feaLabelScale for dynamic sizing
function addDiagramLabelClean(position, text, sceneData) {
    const labelScale = window.feaLabelScale || 1.0;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const dpr = 2; // Higher resolution
    canvas.width = 160 * dpr;
    canvas.height = 40 * dpr;
    
    // Clear - transparent background
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw text - clean, readable
    context.font = `${18 * dpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    context.fillStyle = '#000000';
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
    sprite.scale.set(1.2 * labelScale, 0.3 * labelScale, 1);  // Apply label scale
    
    sceneData.scene.add(sprite);
    window.feaDiagramObjects.push(sprite);
}

// Helper function to add multi-line label for deflections
// Uses window.feaLabelScale for dynamic sizing
function addMultiLineLabelClean(position, text, sceneData) {
    const labelScale = window.feaLabelScale || 1.0;
    const lines = text.split('\n');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const dpr = 2;
    canvas.width = 160 * dpr;
    canvas.height = (20 * lines.length + 5) * dpr;
    
    // Clear - transparent background (no box)
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw text lines - plain, no bold
    context.font = `${13 * dpr}px monospace`;
    context.fillStyle = '#1a1a1a';
    context.textAlign = 'left';
    context.textBaseline = 'top';
    
    lines.forEach((line, i) => {
        context.fillText(line, 5 * dpr, (3 + i * 18) * dpr);
    });
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true,
        depthTest: false
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    
    sprite.position.copy(position);
    const aspectRatio = canvas.width / canvas.height;
    sprite.scale.set(1.0 * aspectRatio * labelScale, 1.0 * labelScale, 1);  // Apply label scale
    
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
            fz: r.fz / 1000,
            mx: (r.mx || 0) / 1000,
            my: (r.my || 0) / 1000,
            mz: (r.mz || 0) / 1000
        })),
        memberForces: results.member_forces.map(f => ({
            member: f.member,
            axial: f.axial_i / 1000,
            shear: f.shear_y_i / 1000,
            moment: f.moment_z_i / 1000
        }))
    };
};

// ========================
// Plate Stress Visualization
// ========================

/**
 * Show von Mises stress contour on plate elements
 */
window.showPlateVonMisesStress = function() {
    window.showPlateStress('von_mises');
};

/**
 * Show specific stress component on plate elements with smooth interpolation
 * Uses node-averaged stresses and vertex colors for smooth contour (like CalculiX)
 * @param {string} stressType - 'von_mises', 'sx', 'sy', 'txy', 'mx', 'my', 'mxy'
 */
window.showPlateStress = function(stressType = 'von_mises') {
    const results = window.feaResults;
    if (!results) {
        console.warn('No FEA results available');
        return;
    }
    
    // Clear previous diagrams
    window.clearFEADiagrams();
    window.currentDiagramType = 'plate_stress_' + stressType;
    
    const sceneData = window.sceneData;
    if (!sceneData) {
        console.warn('No scene data available (window.sceneData is null)');
        return;
    }
    
    // Get plate stress results
    const plateStresses = results.plate_stresses || [];
    if (plateStresses.length === 0) {
        console.log('No plate stress results available');
        return;
    }
    
    // Build plate name to stress map
    const plateStressMap = new Map();
    plateStresses.forEach(ps => {
        plateStressMap.set(ps.plate, ps);
    });
    
    const plateNameMap = window.feaPlateNameMap || new Map();
    
    // Use platesGroup from sceneData
    if (!sceneData.platesGroup) {
        console.warn('No platesGroup found in sceneData');
        return;
    }
    
    // Step 1: Build node stress accumulator
    // For each node, collect all stress values from elements that share it
    const nodeStressAccum = new Map(); // nodeName -> {sum: number, count: number}
    
    let plateElementIndex = 0;
    sceneData.platesGroup.children.forEach((plate, plateIdx) => {
        const meshViz = plate.children.find(c => c.userData && c.userData.isMeshViz);
        
        if (meshViz) {
            meshViz.children.forEach((element) => {
                if (element.userData && element.userData.isMeshElement) {
                    let plateName = plateNameMap.get(element.uuid);
                    if (!plateName) {
                        plateElementIndex++;
                        plateName = `P${plateElementIndex}`;
                    }
                    
                    const stressData = plateStressMap.get(plateName);
                    if (stressData) {
                        const value = (stressData[stressType] ?? stressData.von_mises ?? 0);
                        const nodeNames = element.userData.nodeNames || [];
                        
                        // Add this element's stress to each of its nodes
                        nodeNames.forEach(nodeName => {
                            if (!nodeStressAccum.has(nodeName)) {
                                nodeStressAccum.set(nodeName, { sum: 0, count: 0 });
                            }
                            const accum = nodeStressAccum.get(nodeName);
                            accum.sum += value;
                            accum.count++;
                        });
                    }
                }
            });
        } else {
            // Unmeshed plate
            plateElementIndex++;
            let plateName = plateNameMap.get(plate.uuid) || `P${plateElementIndex}`;
            const stressData = plateStressMap.get(plateName);
            if (stressData) {
                const value = (stressData[stressType] ?? stressData.von_mises ?? 0);
                const nodeNames = plate.userData.nodeNames || [];
                nodeNames.forEach(nodeName => {
                    if (!nodeStressAccum.has(nodeName)) {
                        nodeStressAccum.set(nodeName, { sum: 0, count: 0 });
                    }
                    const accum = nodeStressAccum.get(nodeName);
                    accum.sum += value;
                    accum.count++;
                });
            }
        }
    });
    
    // Step 2: Calculate averaged node stresses
    const nodeStressMap = new Map(); // nodeName -> averaged stress value
    nodeStressAccum.forEach((accum, nodeName) => {
        nodeStressMap.set(nodeName, accum.count > 0 ? accum.sum / accum.count : 0);
    });
    
    console.log(`Built node stress map with ${nodeStressMap.size} nodes`);
    
    // Find min/max from node-averaged values for color scaling
    let minStress = Infinity;
    let maxStress = -Infinity;
    nodeStressMap.forEach(value => {
        if (value < minStress) minStress = value;
        if (value > maxStress) maxStress = value;
    });
    
    // Handle edge case where all stresses are equal
    if (minStress === maxStress) {
        minStress -= 0.5;
        maxStress += 0.5;
    }
    if (!isFinite(minStress)) minStress = 0;
    if (!isFinite(maxStress)) maxStress = 1;
    
    const stressRange = maxStress - minStress;
    
    console.log(`Plate ${stressType} stress range: ${minStress.toExponential(2)} to ${maxStress.toExponential(2)}`);
    
    // Color function using rainbow/jet colormap matching commercial FEA style
    // Blue -> Cyan -> Green -> Yellow -> Orange -> Red with darker, richer tones
    function getStressColor(value) {
        const t = Math.max(0, Math.min(1, (value - minStress) / stressRange));
        const color = new THREE.Color();

        // Darker, more saturated FEA-style colormap
        // Format: { t: position 0-1, r/g/b: 0-255 sRGB values }
        const colorStops = [
            { t: 0.00, r: 30,  g: 40,  b: 160 },  // Deep blue
            { t: 0.20, r: 30,  g: 120, b: 180 },  // Medium blue/cyan
            { t: 0.35, r: 30,  g: 160, b: 130 },  // Teal
            { t: 0.50, r: 60,  g: 160, b: 50  },  // Green
            { t: 0.65, r: 160, g: 170, b: 30  },  // Yellow-green
            { t: 0.80, r: 210, g: 120, b: 30  },  // Orange
            { t: 1.00, r: 180, g: 30,  b: 30  },  // Deep red
        ];
        
        // Find the two color stops to interpolate between
        let i = 0;
        while (i < colorStops.length - 1 && colorStops[i + 1].t < t) {
            i++;
        }
        
        let r, g, b;
        if (i >= colorStops.length - 1) {
            const last = colorStops[colorStops.length - 1];
            r = last.r; g = last.g; b = last.b;
        } else {
            const c0 = colorStops[i];
            const c1 = colorStops[i + 1];
            const s = (t - c0.t) / (c1.t - c0.t);
            
            r = c0.r + s * (c1.r - c0.r);
            g = c0.g + s * (c1.g - c0.g);
            b = c0.b + s * (c1.b - c0.b);
        }
        
        // Convert to 0-1 range and set directly
        color.setRGB(r / 255, g / 255, b / 255);
        return color;
    }
    
    // Helper to ensure a geometry has a color attribute
    function ensureColorAttribute(geometry) {
        if (!geometry.attributes.color) {
            const posAttr = geometry.attributes.position;
            const colors = new Float32Array(posAttr.count * 3);
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }
        return geometry.attributes.color;
    }
    
    // Create a subdivided quad geometry with bilinear color interpolation
    // This gives smooth CalculiX-style gradients within each element
    function createSubdividedColoredQuad(element, cornerStresses, subdivisions = 8) {
        const geometry = element.geometry;
        const posAttr = geometry.attributes.position;
        
        // Get the 4 corner positions from original geometry (element local space)
        const corners = [];
        const tempVec = new THREE.Vector3();
        for (let i = 0; i < Math.min(4, posAttr.count); i++) {
            tempVec.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
            corners.push(new THREE.Vector3(
                posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)
            ));
        }
        
        // Create subdivided geometry
        const n = subdivisions + 1; // number of vertices per edge
        const positions = [];
        const colors = [];
        const indices = [];
        
        // IMPORTANT: Map cornerStresses to actual geometry corners based on vertex positions
        // PlaneGeometry vertex order: 0, 1, 2, 3
        // We need to figure out which corner is which based on position
        // Find bounding box
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        corners.forEach(c => {
            // Use x and y for horizontal plates, or x and z for other orientations
            const px = c.x, py = c.y !== 0 ? c.y : c.z;
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
        });
        
        // Map each geometry corner to stress value
        // cornerStresses[0]=i, [1]=j, [2]=m, [3]=n in CCW order from creation
        // For a horizontal plate: i=corner0, j=corner1, m=corner2, n=corner3 geometrically
        // The stress values correspond to the nodeNames order, which matches element.userData.nodes order
        const s0 = cornerStresses[0]; // stress at geometry corner 0
        const s1 = cornerStresses[1]; // stress at geometry corner 1
        const s2 = cornerStresses[2]; // stress at geometry corner 2 (was swapped with s3)
        const s3 = cornerStresses[3]; // stress at geometry corner 3
        
        // Generate vertices with bilinear interpolation
        // IMPORTANT: our quad element vertex order is A=bl, B=br, C=tr, D=tl.
        // Bilinear mapping expects: c00=bl, c10=br, c01=tl, c11=tr.
        for (let j = 0; j <= subdivisions; j++) {
            const v = j / subdivisions; // 0 to 1
            for (let i = 0; i <= subdivisions; i++) {
                const u = i / subdivisions; // 0 to 1
                
                // Bilinear interpolation of position
                // corners[0]=bl, corners[1]=br, corners[2]=tr, corners[3]=tl
                const pos = new THREE.Vector3();
                pos.x = (1-u)*(1-v)*corners[0].x + u*(1-v)*corners[1].x + (1-u)*v*corners[3].x + u*v*corners[2].x;
                pos.y = (1-u)*(1-v)*corners[0].y + u*(1-v)*corners[1].y + (1-u)*v*corners[3].y + u*v*corners[2].y;
                pos.z = (1-u)*(1-v)*corners[0].z + u*(1-v)*corners[1].z + (1-u)*v*corners[3].z + u*v*corners[2].z;
                
                positions.push(pos.x, pos.y, pos.z);
                
                // Bilinear interpolation of stress value matching PlaneGeometry corner order
                // c00=s0 (bl), c10=s1 (br), c01=s3 (tl), c11=s2 (tr)
                const stress = (1-u)*(1-v)*s0 + u*(1-v)*s1 + (1-u)*v*s3 + u*v*s2;
                const color = getStressColor(stress);
                colors.push(color.r, color.g, color.b);
            }
        }
        
        // Generate triangle indices - consistent CCW winding for both triangles
        for (let j = 0; j < subdivisions; j++) {
            for (let i = 0; i < subdivisions; i++) {
                const a = j * n + i;           // bottom-left
                const b = j * n + i + 1;       // bottom-right
                const c = (j + 1) * n + i;     // top-left
                const d = (j + 1) * n + i + 1; // top-right
                
                // Two triangles per quad cell - CCW winding
                // Triangle 1: a -> b -> d (bottom-left, bottom-right, top-right)
                // Triangle 2: a -> d -> c (bottom-left, top-right, top-left)
                indices.push(a, b, d);
                indices.push(a, d, c);
            }
        }
        
        // Create new BufferGeometry
        const newGeometry = new THREE.BufferGeometry();
        newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        newGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        newGeometry.setIndex(indices);
        newGeometry.computeVertexNormals();
        
        // Important: mark as double-sided to avoid winding issues
        return newGeometry;
    }
    
    // Step 3: Apply vertex colors to mesh elements with smooth gradients
    let coloredElements = 0;
    plateElementIndex = 0;
    
    sceneData.platesGroup.children.forEach((plate, plateIdx) => {
        const meshViz = plate.children.find(c => c.userData && c.userData.isMeshViz);
        
        if (meshViz) {
            // Meshed plate - apply smooth gradient colors to each element
            meshViz.children.forEach((element) => {
                if (element.userData && element.userData.isMeshElement && element.isMesh) {
                    let plateName = plateNameMap.get(element.uuid);
                    if (!plateName) {
                        plateElementIndex++;
                        plateName = `P${plateElementIndex}`;
                    }
                    
                    const nodeNames = element.userData.nodeNames || [];
                    if (nodeNames.length !== 4) {
                        console.warn(`Element missing nodeNames, has ${nodeNames.length}`);
                        return;
                    }
                    
                    // Store original material and geometry for restoration
                    if (!element.userData.originalMaterial) {
                        element.userData.originalMaterial = element.material.clone();
                    }
                    if (!element.userData.originalGeometry) {
                        element.userData.originalGeometry = element.geometry;
                    }
                    
                    // Get stress values at each corner node
                    const cornerStresses = nodeNames.map(nodeName => {
                        return nodeStressMap.get(nodeName) || 0;
                    });
                    
                    // Create subdivided geometry with smooth color interpolation
                    const subdividedGeometry = createSubdividedColoredQuad(element, cornerStresses, 6);
                    element.geometry = subdividedGeometry;

                    // Show mesh outline during contour (subtle, on top)
                    element.children.forEach(child => {
                        if (child && child.isLineSegments) {
                            if (child.userData.prevVisible === undefined) {
                                child.userData.prevVisible = child.visible;
                            }
                            child.visible = true;
                            if (child.material) {
                                child.material.transparent = true;
                                child.material.opacity = 0.25;
                                child.material.depthTest = false;
                                child.material.needsUpdate = true;
                            }
                            child.renderOrder = 1000;
                        }
                    });
                    
                    // Enable vertex colors on material - DOUBLE SIDED to fix half-missing triangles
                    element.material = new THREE.MeshBasicMaterial({
                        vertexColors: true,
                        transparent: false,
                        opacity: 1.0,
                        side: THREE.DoubleSide,
                        depthWrite: true,
                        depthTest: true
                    });
                    
                    element.userData.hasStressOverlay = true;
                    
                    if (!window.feaDiagramObjects) window.feaDiagramObjects = [];
                    window.feaDiagramObjects.push({ mesh: element, type: 'stress_color' });
                    coloredElements++;
                }
            });
        } else {
            // Unmeshed plate - apply uniform color based on averaged corner stresses
            plateElementIndex++;
            let plateName = plateNameMap.get(plate.uuid) || `P${plateElementIndex}`;
            const stressData = plateStressMap.get(plateName);
            
            if (stressData) {
                const value = (stressData[stressType] ?? stressData.von_mises ?? 0);
                const color = getStressColor(value);
                
                plate.children.forEach(child => {
                    if (child.isMesh) {
                        if (!child.userData.originalMaterial) {
                            child.userData.originalMaterial = child.material.clone();
                        }
                        child.material.color.copy(color);
                        child.material.transparent = true;
                        child.material.opacity = 0.92;
                        child.material.side = THREE.DoubleSide;
                        child.material.needsUpdate = true;
                        child.userData.hasStressOverlay = true;
                        
                        if (!window.feaDiagramObjects) window.feaDiagramObjects = [];
                        window.feaDiagramObjects.push({ mesh: child, type: 'stress_color' });
                        coloredElements++;
                    }
                });
            }
        }
    });
    
    console.log(`Colored ${coloredElements} plate elements with smooth interpolation`);
    
    // Add color legend
    addStressLegend(stressType, minStress, maxStress);
    
    console.log(`Showing ${stressType} stress for ${plateStresses.length} plates`);
};

/**
 * Add a color legend for stress visualization
 */
function addStressLegend(stressType, minVal, maxVal) {
    // Remove existing legend
    const existingLegend = document.getElementById('stress-legend');
    if (existingLegend) {
        existingLegend.remove();
    }
    
    // Create HTML-based legend (more reliable than 3D sprite)
    const legendDiv = document.createElement('div');
    legendDiv.id = 'stress-legend';
    legendDiv.style.cssText = `
        position: absolute;
        left: 12px;
        bottom: 12px;
        background: rgba(255, 255, 255, 0.95);
        border: 2px solid #333;
        border-radius: 8px;
        padding: 10px 15px;
        z-index: 10;
        font-family: Arial, sans-serif;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        pointer-events: none;
    `;
    
    // Title
    const titleMap = {
        'von_mises': 'Von Mises Stress',
        'sx': 'Membrane Stress σx',
        'sy': 'Membrane Stress σy',
        'txy': 'Shear Stress τxy',
        'mx': 'Bending Moment Mx',
        'my': 'Bending Moment My',
        'mxy': 'Twisting Moment Mxy'
    };
    
    const title = document.createElement('div');
    title.style.cssText = 'font-weight: bold; font-size: 14px; margin-bottom: 8px; text-align: center; color: #333;';
    title.textContent = titleMap[stressType] || stressType;
    legendDiv.appendChild(title);
    
    // Color bar - darker FEA colormap matching the contour plot
    const colorBar = document.createElement('div');
    colorBar.style.cssText = `
        width: 150px;
        height: 20px;
        background: linear-gradient(to right, 
            rgb(30, 40, 160),
            rgb(30, 120, 180),
            rgb(30, 160, 130),
            rgb(60, 160, 50),
            rgb(160, 170, 30),
            rgb(210, 120, 30),
            rgb(180, 30, 30));
        border: 1px solid #999;
        border-radius: 2px;
    `;
    legendDiv.appendChild(colorBar);
    
    // Min/Max labels
    const labelsDiv = document.createElement('div');
    labelsDiv.style.cssText = 'display: flex; justify-content: space-between; margin-top: 5px; font-size: 11px; color: #333;';
    
    const minLabel = document.createElement('span');
    minLabel.textContent = formatStressValue(minVal);
    labelsDiv.appendChild(minLabel);
    
    const maxLabel = document.createElement('span');
    maxLabel.textContent = formatStressValue(maxVal);
    labelsDiv.appendChild(maxLabel);
    
    legendDiv.appendChild(labelsDiv);
    
    const canvasEl = window.sceneData?.renderer?.domElement;
    const container = canvasEl?.parentElement || document.body;
    if (container !== document.body) {
        const computed = window.getComputedStyle(container);
        if (computed.position === 'static') {
            container.style.position = 'relative';
        }
    }
    container.appendChild(legendDiv);
}

/**
 * Format stress value for display - always in MPa
 */
function formatStressValue(value) {
    // Always display in MPa (1 MPa = 1e6 Pa)
    return (value / 1e6).toFixed(3) + ' MPa';
}

/**
 * Clear plate stress colors and restore original materials
 */
window.clearPlateStressColors = function() {
    if (window.feaDiagramObjects) {
        window.feaDiagramObjects.forEach(item => {
            if (item.mesh && item.type === 'stress_color' && item.mesh.userData.originalMaterial) {
                item.mesh.material = item.mesh.userData.originalMaterial;
                delete item.mesh.userData.originalMaterial;
            }

            // Restore original (un-subdivided) geometry if we replaced it
            if (item.mesh && item.type === 'stress_color' && item.mesh.userData.originalGeometry) {
                item.mesh.geometry = item.mesh.userData.originalGeometry;
                delete item.mesh.userData.originalGeometry;
            }

            // Restore edge visibility
            if (item.mesh && item.type === 'stress_color' && item.mesh.children) {
                item.mesh.children.forEach(child => {
                    if (child && child.isLineSegments && child.userData && child.userData.prevVisible !== undefined) {
                        child.visible = child.userData.prevVisible;
                        delete child.userData.prevVisible;
                    }
                });
            }
        });
    }
};

console.log('FEA Solver integration loaded');
console.log('Plate stress visualization available: window.showPlateVonMisesStress(), window.showPlateStress(type)');
