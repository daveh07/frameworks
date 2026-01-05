/**
 * Structure Exporter Module
 * Exports scene geometry (nodes and beams) to Rust-compatible format
 */

// Use Three.js from global (loaded via script tag).
// IMPORTANT: this module may be evaluated before the script finishes loading.
const THREE = new Proxy({}, {
    get(_target, prop) {
        const three = window.THREE;
        if (!three) {
            throw new Error('Three.js not loaded: window.THREE is undefined');
        }
        return three[prop];
    }
});
import { selectedNodes, selectedBeams } from './geometry_manager.js';
import { beamLoads, plateLoads } from './loads_manager.js';

/**
 * Extract structure data from the scene
 * @param {object} materialConfig - Material properties (name, E, nu, rho)
 * @param {number} defaultThickness - Default thickness for shells
 * @returns {object} Structure data in Code_Aster compatible format
 */
export function extractStructureData(materialConfig, defaultThickness) {
    // Get the global scene data
    const sceneData = window.sceneData;
    
    if (!sceneData || !sceneData.nodesGroup || !sceneData.beamsGroup) {
        console.error('Scene data not available');
        return null;
    }

    const nodes = [];
    const beams = [];
    const shells = [];
    const nodeMap = new Map(); // Map Three.js node objects to node IDs
    const plateIdToShellIds = new Map(); // Map plate UUIDs to shell element IDs
    const shellUuidToId = new Map(); // Map shell element UUIDs to shell IDs

    // Extract nodes
    sceneData.nodesGroup.children.forEach((node, index) => {
        nodeMap.set(node.uuid, index);
        nodes.push({
            id: index,
            x: node.position.x,
            y: node.position.y,
            z: node.position.z
        });
    });

    // Extract shells from plates
    if (sceneData.platesGroup) {
        console.log(`Processing ${sceneData.platesGroup.children.length} plates...`);
        sceneData.platesGroup.children.forEach((plate) => {
            const currentPlateShellIds = [];
            if (plate.userData.mesh) {
                // Find the mesh visualization group
                const meshViz = plate.children.find(c => c.userData.isMeshViz);
                if (meshViz) {
                    meshViz.children.forEach((element) => {
                        if (element.userData.isMeshElement && element.userData.nodes) {
                            const nodeIds = element.userData.nodes.map(n => nodeMap.get(n.uuid));
                            
                            // Check if all nodes were found
                            if (nodeIds.every(id => id !== undefined)) {
                                const shellId = shells.length;
                                shells.push({
                                    id: shellId, // Sequential ID
                                    node_ids: nodeIds,
                                    thickness: plate.userData.thickness || defaultThickness || 0.2
                                });
                                currentPlateShellIds.push(shellId);
                                shellUuidToId.set(element.uuid, shellId);
                            } else {
                                console.warn(`Shell element has unknown nodes`);
                            }
                        }
                    });
                }
            }
            plateIdToShellIds.set(plate.uuid, currentPlateShellIds);
        });
        console.log(`Extracted ${shells.length} shell elements`);
    }

    // Extract beams
    console.log(`Processing ${sceneData.beamsGroup.children.length} beams...`);
    sceneData.beamsGroup.children.forEach((beam, index) => {
        let startNode = null;
        let endNode = null;
        
        // Try to get nodes from userData first (new beams have this)
        if (beam.userData && beam.userData.startNode && beam.userData.endNode) {
            startNode = beam.userData.startNode;
            endNode = beam.userData.endNode;
            console.log(`Beam ${index}: Using userData nodes`);
        } else {
            // Fallback: calculate beam endpoints from geometry and find closest nodes
            const beamPos = beam.position.clone();
            const beamLength = beam.geometry.parameters.height || 1;
            const direction = new THREE.Vector3(0, 1, 0);
            direction.applyQuaternion(beam.quaternion);
            
            const endpoint1 = beamPos.clone().addScaledVector(direction, beamLength / 2);
            const endpoint2 = beamPos.clone().addScaledVector(direction, -beamLength / 2);
            
            console.log(`Beam ${index}: Calculated endpoints`, endpoint1, endpoint2);
            
            // Find nodes at or near these endpoints
            let minDist1 = Infinity;
            let minDist2 = Infinity;
            
            sceneData.nodesGroup.children.forEach(node => {
                const dist1 = node.position.distanceTo(endpoint1);
                const dist2 = node.position.distanceTo(endpoint2);
                
                if (dist1 < minDist1) {
                    startNode = node;
                    minDist1 = dist1;
                }
                if (dist2 < minDist2) {
                    endNode = node;
                    minDist2 = dist2;
                }
            });
            
            console.log(`Beam ${index}: Found nodes at distances ${minDist1.toFixed(3)}, ${minDist2.toFixed(3)}`);
        }
        
        if (startNode && endNode) {
            const startId = nodeMap.get(startNode.uuid);
            const endId = nodeMap.get(endNode.uuid);
            
            if (startId !== undefined && endId !== undefined) {
                beams.push({
                    id: index,
                    node_ids: [startId, endId],
                    section: {
                        width: 0.2,  // Default 200mm width
                        height: 0.3, // Default 300mm height
                        section_type: "Rectangular"
                    }
                });
                console.log(`Beam ${index}: Added with nodes ${startId} -> ${endId}`);
            } else {
                console.warn(`Beam ${index}: Node IDs not found in map`);
            }
        } else {
            console.warn(`Beam ${index}: Could not find start or end nodes`);
        }
    });

    // Extract supports (constraints)
    const supports = [];
    sceneData.nodesGroup.children.forEach((node, index) => {
        if (node.userData && node.userData.constraint) {
            const constraint = node.userData.constraint;
            let supportType = "Fixed"; // Default
            
            // Map constraint types to support types
            if (constraint.type === "fixed") {
                supportType = "Fixed";
            } else if (constraint.type === "pinned") {
                supportType = "Pinned";
            } else if (constraint.type === "roller") {
                // Determine roller direction based on constraint
                if (constraint.dof) {
                    if (constraint.dof.includes("x")) supportType = "RollerX";
                    else if (constraint.dof.includes("y")) supportType = "RollerY";
                    else if (constraint.dof.includes("z")) supportType = "RollerZ";
                } else {
                    supportType = "RollerY"; // Default roller in Y
                }
            }
            
            supports.push({
                node_id: index,
                constraint_type: supportType
            });
        }
    });

    // Extract point loads
    const pointLoads = [];
    sceneData.nodesGroup.children.forEach((node, index) => {
        if (node.userData && node.userData.loads) {
            node.userData.loads.forEach(load => {
                pointLoads.push({
                    node_id: index,
                    fx: load.fx || 0.0,
                    fy: load.fy || 0.0,
                    fz: load.fz || 0.0
                });
            });
        }
    });

    // Extract distributed loads
    const distributedLoads = [];
    const beamIdToIndex = new Map();
    
    // Create beam UUID to index mapping
    sceneData.beamsGroup.children.forEach((beam, index) => {
        beamIdToIndex.set(beam.uuid, index);
    });
    
    // Get loads from beamLoads Map
    beamLoads.forEach((loads, beamUuid) => {
        const beamIndex = beamIdToIndex.get(beamUuid);
        if (beamIndex !== undefined) {
            loads.forEach(load => {
                if (load.type === 'distributed') {
                    // Convert direction to uppercase for Rust enum
                    const dir = load.direction.toUpperCase();
                    const dirEnum = dir === 'X' ? 'X' : (dir === 'Y' ? 'Y' : 'Z');
                    
                    distributedLoads.push({
                        element_ids: [beamIndex],
                        load_type: {
                            Uniform: {
                                value: load.magnitude,
                                direction: dirEnum
                            }
                        }
                    });
                }
            });
        }
    });

    // Extract pressure loads
    const pressureLoads = [];
    plateLoads.forEach((loads, uuid) => {
        const shellIds = plateIdToShellIds.get(uuid);
        if (shellIds && shellIds.length > 0) {
            loads.forEach(load => {
                if (load.type === 'pressure') {
                    pressureLoads.push({
                        element_ids: shellIds,
                        magnitude: load.magnitude
                    });
                }
            });
        } else {
            // Check if it's a direct shell load
            const shellId = shellUuidToId.get(uuid);
            if (shellId !== undefined) {
                loads.forEach(load => {
                    if (load.type === 'pressure') {
                        pressureLoads.push({
                            element_ids: [shellId],
                            magnitude: load.magnitude
                        });
                    }
                });
            }
        }
    });

    // Default material (steel) - Units: metres and kilonewtons
    const material = materialConfig || {
        name: "Structural Steel",
        elastic_modulus: 200e6,  // 200 GPa = 200×10⁶ kN/m²
        poisson_ratio: 0.3,
        density: 77.04  // 7850 kg/m³ × 9.81 m/s² / 1000 = 77.04 kN/m³
    };

    const structure = {
        nodes,
        beams,
        shells,
        material,
        point_loads: pointLoads,
        distributed_loads: distributedLoads,
        pressure_loads: pressureLoads,
        supports
    };

    console.log('Extracted structure:', structure);
    console.log(`  - ${nodes.length} nodes`);
    console.log(`  - ${beams.length} beams`);
    console.log(`  - ${shells.length} shells`);
    console.log(`  - ${supports.length} supports`);
    console.log(`  - ${pointLoads.length} point loads`);
    console.log(`  - ${distributedLoads.length} distributed loads`);
    console.log(`  - ${pressureLoads.length} pressure loads`);

    return structure;
}

/**
 * Get structure data as JSON string for Rust
 */
export function getStructureJSON(sceneData) {
    // Pass default material and thickness if called via this legacy method
    const structure = extractStructureData(null, 0.2);
    if (!structure) {
        return null;
    }
    return JSON.stringify(structure);
}
