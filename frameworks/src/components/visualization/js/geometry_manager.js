/**
 * Geometry Manager Module
 * Handles node and beam creation, selection, and deletion
 */

const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js');
import { addNodeSelectionHighlight, removeNodeSelectionHighlight, clearSelectionHighlights } from './scene_setup.js';
import { removeConstraintSymbol } from './constraints_manager.js';
import { updateNodeLabels, updateBeamLabels, updatePlateLabels } from './labels_manager.js';

// Selection state
export const selectedNodes = new Set();
export const selectedBeams = new Set();
export const selectedPlates = new Set();
export const selectedElements = new Set();

// Reference to selection highlights group (set by three_canvas.js)
let selectionHighlightsGroup = null;

export function setSelectionHighlightsGroup(group) {
    selectionHighlightsGroup = group;
}

/**
 * Get next available ID for a group
 * @param {THREE.Group} group
 * @returns {number}
 */
function getNextId(group) {
    let maxId = 0;
    if (group && group.children) {
        group.children.forEach(child => {
            if (child.userData && typeof child.userData.id === 'number') {
                maxId = Math.max(maxId, child.userData.id);
            }
        });
    }
    return maxId + 1;
}

// Undo history
const undoHistory = [];
const MAX_UNDO_STEPS = 20;

/**
 * Add action to undo history
 */
function addToUndoHistory(action) {
    undoHistory.push(action);
    if (undoHistory.length > MAX_UNDO_STEPS) {
        undoHistory.shift();
    }
    console.log(`Undo history: ${undoHistory.length} action(s)`);
}

/**
 * Undo the last action
 */
export function undoLastAction(nodesGroup, beamsGroup) {
    if (undoHistory.length === 0) {
        console.log('Nothing to undo');
        return;
    }
    
    const action = undoHistory.pop();
    console.log('Undoing action:', action.type);
    
    if (action.type === 'extrude') {
        // Clear current selection visuals before removing geometry
        clearSelection();

        // Remove created nodes and beams
        action.nodesCreated.forEach(node => {
            if (selectionHighlightsGroup) {
                removeNodeSelectionHighlight(selectionHighlightsGroup, node);
            }
            nodesGroup.remove(node);
            node.geometry.dispose();
            node.material.dispose();
            selectedNodes.delete(node);
        });
        action.beamsCreated.forEach(beam => {
            beamsGroup.remove(beam);
            beam.geometry.dispose();
            beam.material.dispose();
        });
        
        // Restore previous selection
        action.previousSelection.forEach(node => {
            if (nodesGroup.children.includes(node)) {
                selectedNodes.add(node);
                if (selectionHighlightsGroup) {
                    addNodeSelectionHighlight(selectionHighlightsGroup, node);
                }
            }
        });
        
        console.log(`Undid extrusion: removed ${action.nodesCreated.length} node(s) and ${action.beamsCreated.length} beam(s), restored ${selectedNodes.size} selected node(s)`);
        updateNodeLabels(nodesGroup);
        updateBeamLabels(beamsGroup);
    }
}

/**
 * Find existing node at position
 * @param {THREE.Group} nodesGroup
 * @param {THREE.Vector3} position
 * @returns {THREE.Mesh|null}
 */
export function findNodeAtPosition(nodesGroup, position) {
    if (!nodesGroup) return null;
    for (let node of nodesGroup.children) {
        const distance = node.position.distanceTo(position);
        if (distance < 0.1) {
            console.log(`Found existing node at position!`);
            return node;
        }
    }
    return null;
}

/**
 * Find existing beam between two positions (checks both directions)
 * @param {THREE.Group} beamsGroup
 * @param {THREE.Vector3} pos1
 * @param {THREE.Vector3} pos2
 * @returns {THREE.Mesh|null}
 */
export function findBeamBetweenPositions(beamsGroup, pos1, pos2) {
    if (!beamsGroup) return null;
    
    for (let beam of beamsGroup.children) {
        const beamPos = beam.position;
        const beamLength = beam.geometry.parameters.height || 1;
        
        // Calculate beam endpoints based on orientation
        const direction = new THREE.Vector3(0, 1, 0);
        direction.applyQuaternion(beam.quaternion);
        
        const endpoint1 = new THREE.Vector3().copy(beamPos).addScaledVector(direction, beamLength / 2);
        const endpoint2 = new THREE.Vector3().copy(beamPos).addScaledVector(direction, -beamLength / 2);
        
        // Check if beam connects the same two points (in either direction)
        const matches1 = (endpoint1.distanceTo(pos1) < 0.1 && endpoint2.distanceTo(pos2) < 0.1);
        const matches2 = (endpoint1.distanceTo(pos2) < 0.1 && endpoint2.distanceTo(pos1) < 0.1);
        
        if (matches1 || matches2) {
            console.log(`Found existing beam between positions`);
            return beam;
        }
    }
    
    return null;
}

/**
 * Create a new node at position
 * @param {THREE.Group} nodesGroup
 * @param {THREE.Vector3} position
 * @param {boolean} skipLabelUpdate - Skip label update (for bulk operations)
 * @returns {THREE.Mesh|null} - Returns null if node already exists at position
 */
export function createNode(nodesGroup, position, skipLabelUpdate = false) {
    // Check for duplicate node at this position
    const existingNode = findNodeAtPosition(nodesGroup, position);
    if (existingNode) {
        console.log(`Node already exists at (${position.x}, ${position.y}, ${position.z}) with ID ${existingNode.userData.id}`);
        return null;
    }

    const nodeGeom = new THREE.SphereGeometry(0.07, 12, 12);
    const nodeMat = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        emissive: 0x333333,
        emissiveIntensity: 0.35,
        metalness: 0.3,
        roughness: 0.35
    });
    const node = new THREE.Mesh(nodeGeom, nodeMat);
    node.position.copy(position);
    node.userData.originalColor = 0xcccccc;
    node.userData.id = getNextId(nodesGroup);
    nodesGroup.add(node);
    console.log(`Node created at (${position.x}, ${position.y}, ${position.z}) with ID ${node.userData.id}`);
    
    // Log to console panel
    if (!skipLabelUpdate && window.addConsoleLine) {
        window.addConsoleLine('MODEL', `Node ${node.userData.id} created at (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`, 'info');
    }
    
    if (!skipLabelUpdate) {
        updateNodeLabels(nodesGroup);
    }
    return node;
}

/**
 * Create a beam between two positions
 * @param {THREE.Group} beamsGroup
 * @param {THREE.Vector3} startPos
 * @param {THREE.Vector3} endPos
 * @param {THREE.Mesh} startNode - Optional reference to start node
 * @param {THREE.Mesh} endNode - Optional reference to end node
 * @param {boolean} skipLabelUpdate - Skip label update (for bulk operations)
 * @returns {THREE.Mesh|null}
 */
export function createBeam(beamsGroup, startPos, endPos, startNode = null, endNode = null, skipLabelUpdate = false) {
    // Check for duplicate
    if (findBeamBetweenPositions(beamsGroup, startPos, endPos)) {
        console.log('Beam already exists between these positions');
        return null;
    }

    const direction = new THREE.Vector3().subVectors(endPos, startPos);
    const beamLength = direction.length();
    const beamRadius = 0.02;  // Thinner beam
    const beamSegments = 16;
    
    const beamGeom = new THREE.CylinderGeometry(beamRadius, beamRadius, beamLength, beamSegments);
    const beamMat = new THREE.MeshStandardMaterial({
        color: 0x2255aa,       // Navy blue
        emissive: 0x1133aa,    // Navy blue emissive
        emissiveIntensity: 0.8,
        metalness: 0.3,
        roughness: 0.4
    });
    
    const beam = new THREE.Mesh(beamGeom, beamMat);
    
    // Position at midpoint
    const midpoint = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
    beam.position.copy(midpoint);
    
    // Orient beam to point from start to end
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction.normalize());
    beam.applyQuaternion(quaternion);
    
    // Store node references in userData for analysis export
    beam.userData.startNode = startNode;
    beam.userData.endNode = endNode;
    beam.userData.id = getNextId(beamsGroup);
    
    beamsGroup.add(beam);
    console.log(`Beam created between positions with ID ${beam.userData.id}`);
    
    // Log to console panel
    if (!skipLabelUpdate && window.addConsoleLine) {
        window.addConsoleLine('MODEL', `Beam ${beam.userData.id} created (L=${beamLength.toFixed(2)} m)`, 'info');
    }
    
    if (!skipLabelUpdate) {
        updateBeamLabels(beamsGroup);
    }
    return beam;
}

/**
 * Create a plate mesh from selected nodes
 * @param {Array<THREE.Mesh>} nodes - Array of node meshes forming the plate boundary
 * @param {THREE.Group} platesGroup - Group to add the plate to
 * @returns {THREE.Mesh}
 */
export function createPlateMesh(nodes, platesGroup) {
    if (nodes.length < 3) {
        console.error('Need at least 3 nodes to create a plate');
        return null;
    }
    
    // Get positions
    const positions = nodes.map(node => node.position.clone());
    
    // Create vertices for the plate
    const vertices = new Float32Array(positions.length * 3);
    for (let i = 0; i < positions.length; i++) {
        vertices[i * 3] = positions[i].x;
        vertices[i * 3 + 1] = positions[i].y;
        vertices[i * 3 + 2] = positions[i].z;
    }
    
    // Create triangles using fan triangulation (works for convex shapes)
    const indices = [];
    for (let i = 1; i < positions.length - 1; i++) {
        indices.push(0, i, i + 1);
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    
    // Determine if plate is vertical (check if normal is mostly horizontal)
    // Compute the normal from the first triangle
    const v0 = new THREE.Vector3(positions[0].x, positions[0].y, positions[0].z);
    const v1 = new THREE.Vector3(positions[1].x, positions[1].y, positions[1].z);
    const v2 = new THREE.Vector3(positions[2].x, positions[2].y, positions[2].z);
    
    const edge1 = new THREE.Vector3().subVectors(v1, v0);
    const edge2 = new THREE.Vector3().subVectors(v2, v0);
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
    
    // If normal is mostly vertical (Y component close to 1 or -1), it's horizontal
    // If normal has significant X or Z component, it's vertical
    // Use absolute value since normal direction can vary based on winding order
    const normalYabs = Math.abs(normal.y);
    const isVertical = normalYabs < 0.7; // Less than 45 degrees from vertical
    
    // Choose a strong light blue (cyan) for vertical walls and grey for horizontal plates
    // User requested "strong Light blue, almost cyan"
    const plateColor = isVertical ? 0x00eeff : 0x808080;

    console.log(`Plate orientation - Normal: (${normal.x.toFixed(2)}, ${normal.y.toFixed(2)}, ${normal.z.toFixed(2)}), |normal.y|: ${normalYabs.toFixed(2)}, isVertical: ${isVertical}, color: ${plateColor.toString(16)}`);

    // Final plates should write depth for correct occlusion; tune material for a subtle, professional look
    const material = new THREE.MeshStandardMaterial({
        color: plateColor,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        metalness: 0.06,
        roughness: 0.56,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    depthWrite: true
    });

    const plate = new THREE.Mesh(geometry, material);

    // Add a subtle outline to improve readability (edges)
    try {
        const edgeGeom = new THREE.EdgesGeometry(geometry);
    const edgeMat = new THREE.LineBasicMaterial({ color: isVertical ? 0x2b5ea8 : 0x999999, linewidth: 1 });
        const outline = new THREE.LineSegments(edgeGeom, edgeMat);
        outline.renderOrder = 2;
        plate.add(outline);
        plate.userData.outline = outline;
    } catch (e) {
        // Edges may fail on degenerate geometry; ignore gracefully
        console.warn('Failed to create plate outline', e);
    }

    // Store node references and visual metadata for later use
    plate.userData.nodes = nodes;
    plate.userData.originalColor = plateColor;
    plate.userData.originalOpacity = 0.65;
    plate.userData.isVertical = isVertical;
    plate.userData.id = getNextId(platesGroup);
    plate.renderOrder = 1;

    platesGroup.add(plate);
    console.log(`Plate created with ${nodes.length} nodes (vertical=${isVertical}) and ID ${plate.userData.id}`);
    
    // Log to console panel
    if (window.addConsoleLine) {
        const orientation = isVertical ? 'vertical' : 'horizontal';
        window.addConsoleLine('MODEL', `Plate ${plate.userData.id} created (${nodes.length} nodes, ${orientation})`, 'info');
    }
    
    updatePlateLabels(platesGroup);
    return plate;
}

/**
 * Select all nodes and beams
 * @param {THREE.Group} nodesGroup
 * @param {THREE.Group} beamsGroup
 * @param {THREE.Group} platesGroup
 * @param {string} filter
 */
export function selectAll(nodesGroup, beamsGroup, platesGroup, filter = 'all') {
    if (!nodesGroup || !beamsGroup) {
        console.warn('Scene not initialized');
        return;
    }
    
    selectedNodes.clear();
    selectedBeams.clear();
    selectedPlates.clear();
    
    // Clear existing selection highlights
    if (selectionHighlightsGroup) {
        clearSelectionHighlights(selectionHighlightsGroup);
    }
    
    if (filter === 'all' || filter === 'nodes') {
        nodesGroup.children.forEach(node => {
            selectedNodes.add(node);
            if (selectionHighlightsGroup) {
                addNodeSelectionHighlight(selectionHighlightsGroup, node);
            }
        });
    }
    
    if (filter === 'all' || filter === 'beams') {
        beamsGroup.children.forEach(beam => {
            selectedBeams.add(beam);
            if (!beam.userData.originalColor) {
                beam.userData.originalColor = beam.material.color.getHex();
                beam.userData.originalEmissive = beam.material.emissive.getHex();
            }
            beam.material.color.setHex(0x00ff00);
            beam.material.emissive.setHex(0x00aa00);
        });
    }
    
    if (platesGroup && (filter === 'all' || filter === 'plates')) {
        platesGroup.children.forEach(plate => {
            selectedPlates.add(plate);
            if (!plate.userData.originalColor) {
                plate.userData.originalColor = plate.material.color.getHex();
            }
            if (!plate.userData.originalOpacity) {
                plate.userData.originalOpacity = plate.material.opacity;
            }
            // Use orange highlight for selected plates
            plate.material.color.setHex(0xff8800);
            plate.material.opacity = 0.9;
        });
    }
    
    console.log(`Selected all: ${selectedNodes.size} nodes, ${selectedBeams.size} beams, ${selectedPlates.size} plates`);
}

/**
 * Clear all selections
 */
export function clearSelection() {
    // Clear selection highlights
    if (selectionHighlightsGroup) {
        clearSelectionHighlights(selectionHighlightsGroup);
    }
    
    selectedNodes.clear();
    
    selectedBeams.forEach(beam => {
        if (beam.material && beam.userData) {
            beam.material.color.setHex(beam.userData.originalColor || 0x0077ff);
            beam.material.emissive.setHex(beam.userData.originalEmissive || 0x0033ff);
        }
    });
    selectedBeams.clear();
    
    selectedPlates.forEach(plate => {
        if (plate.material && plate.userData) {
            plate.material.color.setHex(plate.userData.originalColor || 0x808080);
            plate.material.opacity = plate.userData.originalOpacity || 0.5;
        }
    });
    selectedPlates.clear();
    
    console.log('Selection cleared');
}

/**
 * Delete selected nodes and beams
 * @param {THREE.Group} nodesGroup
 * @param {THREE.Group} beamsGroup
 * @param {THREE.Group} platesGroup
 */
export function deleteSelected(nodesGroup, beamsGroup, platesGroup) {
    if (!nodesGroup || !beamsGroup) {
        console.warn('Scene not initialized');
        return;
    }

    let deletedNodes = 0;
    let deletedBeams = 0;
    let deletedPlates = 0;
    
    // Delete selected elements (mesh faces)
    if (selectedElements.size > 0) {
        selectedElements.forEach(element => {
            // Find parent group (meshElementsGroup)
            const parent = element.parent;
            if (parent) {
                parent.remove(element);
            }
            // Also remove edges if they exist
            if (element.children) {
                element.children.forEach(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
            }
            element.geometry.dispose();
            element.material.dispose();
            deletedPlates++; // Count as plates for now
        });
        selectedElements.clear();
    }
    
    // Delete selected plates
    if (platesGroup) {
        selectedPlates.forEach(plate => {
            platesGroup.remove(plate);
            plate.geometry.dispose();
            plate.material.dispose();
            deletedPlates++;
        });
        selectedPlates.clear();
    }
    
    // Delete selected beams
    selectedBeams.forEach(beam => {
        beamsGroup.remove(beam);
        beam.geometry.dispose();
        beam.material.dispose();
        deletedBeams++;
    });
    selectedBeams.clear();
    
    // Delete selected nodes and connected beams
    selectedNodes.forEach(node => {
        const nodePos = node.position;
        if (selectionHighlightsGroup) {
            removeNodeSelectionHighlight(selectionHighlightsGroup, node);
        }
        
        // Find and remove beams connected to this node
        const beamsToRemove = [];
        beamsGroup.children.forEach(beam => {
            const beamPos = beam.position;
            const beamLength = beam.geometry.parameters.height || 1;
            
            // Calculate beam endpoints
            const direction = new THREE.Vector3(0, 1, 0);
            direction.applyQuaternion(beam.quaternion);
            
            const endpoint1 = new THREE.Vector3().copy(beamPos).addScaledVector(direction, beamLength / 2);
            const endpoint2 = new THREE.Vector3().copy(beamPos).addScaledVector(direction, -beamLength / 2);
            
            // Check if node is at either endpoint
            if (endpoint1.distanceTo(nodePos) < 0.1 || endpoint2.distanceTo(nodePos) < 0.1) {
                beamsToRemove.push(beam);
            }
        });
        
        beamsToRemove.forEach(beam => {
            beamsGroup.remove(beam);
            beam.geometry.dispose();
            beam.material.dispose();
            selectedBeams.delete(beam);
            deletedBeams++;
        });
        
        // Remove the node
        nodesGroup.remove(node);
        
        // Remove associated constraint symbol if any
        // We need to pass a scene-like object that has the scene property or is the scene
        // Since nodesGroup is in the scene, nodesGroup.parent is the scene
        if (nodesGroup.parent) {
            removeConstraintSymbol(node, { scene: nodesGroup.parent });
        }
        
        node.geometry.dispose();
        node.material.dispose();
        deletedNodes++;
    });
    selectedNodes.clear();
    if (selectionHighlightsGroup) {
        clearSelectionHighlights(selectionHighlightsGroup);
    }
    
    // Cleanup orphaned nodes (nodes not connected to any beam or plate)
    cleanupOrphanedNodes(nodesGroup, beamsGroup, platesGroup);
    
    updateNodeLabels(nodesGroup);
    updateBeamLabels(beamsGroup);
    updatePlateLabels(platesGroup);
    
    console.log(`Deleted ${deletedNodes} node(s), ${deletedBeams} beam(s), and ${deletedPlates} plate(s)/element(s)`);
}

/**
 * Remove nodes that are not connected to any beam or plate
 */
function cleanupOrphanedNodes(nodesGroup, beamsGroup, platesGroup) {
    if (!nodesGroup) return;
    
    const usedNodeIds = new Set();
    
    // 1. Check beams
    if (beamsGroup) {
        beamsGroup.children.forEach(beam => {
            // We need to find which nodes this beam connects
            // This is tricky without explicit references, but we can check positions
            // Or better, if we stored node references in beam.userData
            // Assuming we don't have explicit refs, we check positions
            
            const beamPos = beam.position;
            const beamLength = beam.geometry.parameters.height || 1;
            const direction = new THREE.Vector3(0, 1, 0).applyQuaternion(beam.quaternion);
            
            const p1 = new THREE.Vector3().copy(beamPos).addScaledVector(direction, beamLength / 2);
            const p2 = new THREE.Vector3().copy(beamPos).addScaledVector(direction, -beamLength / 2);
            
            nodesGroup.children.forEach(node => {
                if (node.position.distanceTo(p1) < 0.01 || node.position.distanceTo(p2) < 0.01) {
                    usedNodeIds.add(node.uuid);
                }
            });
        });
    }
    
    // 2. Check plates
    if (platesGroup) {
        platesGroup.children.forEach(plate => {
            // Check plate vertices
            // If plate has userData.nodes, use that
            // Otherwise check geometry
            
            // Check if plate has mesh elements (children)
            // If so, the mesh nodes are used
            
            // Check original plate nodes
            // We can check if nodes are close to plate vertices
            const positions = plate.geometry.attributes.position.array;
            for (let i = 0; i < positions.length; i += 3) {
                const v = new THREE.Vector3(positions[i], positions[i+1], positions[i+2]);
                nodesGroup.children.forEach(node => {
                    if (node.position.distanceTo(v) < 0.01) {
                        usedNodeIds.add(node.uuid);
                    }
                });
            }
            
            // Also check mesh nodes if any
            if (plate.children) {
                plate.children.forEach(child => {
                    if (child.userData.isMeshViz) {
                        child.children.forEach(element => {
                            if (element.userData.nodes) {
                                element.userData.nodes.forEach(n => usedNodeIds.add(n.uuid));
                            }
                        });
                    }
                });
            }
        });
    }
    
    // 3. Remove unused nodes
    const nodesToRemove = [];
    nodesGroup.children.forEach(node => {
        if (!usedNodeIds.has(node.uuid)) {
            nodesToRemove.push(node);
        }
    });
    
    nodesToRemove.forEach(node => {
        nodesGroup.remove(node);
        if (node.geometry) node.geometry.dispose();
        if (node.material) node.material.dispose();
        // Also remove from selection if present
        selectedNodes.delete(node);
        if (selectionHighlightsGroup) {
            removeNodeSelectionHighlight(selectionHighlightsGroup, node);
        }
    });
    
    if (nodesToRemove.length > 0) {
        console.log(`Removed ${nodesToRemove.length} orphaned nodes`);
    }
}

/**
 * Extrude beams from selected nodes
 * @param {THREE.Group} nodesGroup
 * @param {THREE.Group} beamsGroup
 * @param {string} direction - 'x', 'y', or 'z'
 * @param {number} length - Length of extrusion
 */
export function extrudeBeams(nodesGroup, beamsGroup, direction, length) {
    if (!nodesGroup || !beamsGroup) {
        console.warn('Scene not initialized');
        return;
    }
    
    if (selectedNodes.size === 0) {
        console.warn('No nodes selected for extrusion');
        return;
    }

    console.log(`Starting extrusion: ${selectedNodes.size} nodes selected, direction: ${direction}, length: ${length}`);

    const directionVector = new THREE.Vector3();
    if (direction === 'x') directionVector.set(length, 0, 0);
    else if (direction === 'y') directionVector.set(0, length, 0);
    else if (direction === 'z') directionVector.set(0, 0, length);

    const newNodes = [];
    const newBeams = [];
    const previousSelection = Array.from(selectedNodes);
    
    selectedNodes.forEach(node => {
        const startPos = node.position.clone();
        const endPos = startPos.clone().add(directionVector);

        // Check if node already exists at end position
        let endNode = findNodeAtPosition(nodesGroup, endPos);
        
        // Create node if it doesn't exist
        if (!endNode) {
            endNode = createNode(nodesGroup, endPos);
            newNodes.push(endNode);
        } else {
            console.log(`Using existing node at (${endPos.x}, ${endPos.y}, ${endPos.z})`);
            newNodes.push(endNode);
        }

        // Create beam if it doesn't exist (pass node references)
        const beam = createBeam(beamsGroup, startPos, endPos, node, endNode);
        if (beam) {
            newBeams.push(beam);
        }
    });
    
    // Select new nodes
    clearSelection();
    newNodes.forEach(node => {
        selectedNodes.add(node);
        if (selectionHighlightsGroup) {
            addNodeSelectionHighlight(selectionHighlightsGroup, node);
        }
    });
    
    // Add to undo history
    addToUndoHistory({
        type: 'extrude',
        nodesCreated: newNodes,
        beamsCreated: newBeams,
        previousSelection: previousSelection
    });
}
