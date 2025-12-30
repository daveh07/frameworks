/**
 * Interaction Handlers Module
 * Manages mouse events, interaction modes, and user input
 */

const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js');
import { selectedNodes, selectedBeams, selectedPlates, selectedElements, createNode, createBeam, createPlateMesh, findBeamBetweenPositions } from './geometry_manager.js';
import { addNodeSelectionHighlight, removeNodeSelectionHighlight } from './scene_setup.js';

// Selection highlights group reference (set by three_canvas.js)
let selectionHighlightsGroup = null;

export function setSelectionHighlightsGroup(group) {
    selectionHighlightsGroup = group;
}

// Selection filter state
export let selectionFilter = 'all'; // 'all', 'nodes', 'beams', 'plates'

export function setSelectionFilter(filter) {
    selectionFilter = filter;
    console.log('Selection filter set to:', filter);
}

// Mode state
export const modes = {
    addNode: false,
    selectNode: false,
    drawBeam: false,
    drawPlate: false,
    copyFromPoint: false
};

// Drawing state
export let firstBeamNode = null;
export let tempBeamLine = null;
export let hoveredNode = null;
export let hoveredBeam = null;
export let hoveredPlate = null;
export let hoveredElement = null; // For mesh elements

// Plate drawing state
export let plateNodes = [];
export let tempPlatePreview = null;
// Keep last preview node ids to avoid recreating preview unnecessarily
export let lastPreviewNodeIds = [];

// Selection box state
let selectionBoxStart = null;
let selectionBoxDiv = null;
let isBoxSelecting = false;

// Copy from point state
let copyBaseNode = null;
let copiedBeamsData = null;
let copiedPlatesData = null;
let copyPreviewGroup = null;

/**
 * Update cursor based on current mode
 */
export function updateCursor() {
    const canvas = document.getElementById('drawing-canvas');
    if (!canvas) return;
    
    if (modes.selectNode) {
        canvas.style.cursor = 'crosshair';
    } else {
        canvas.style.cursor = 'default';
    }
}

/**
 * Toggle add node mode
 * @param {THREE.Scene} scene
 * @returns {boolean}
 */
export function toggleAddNodeMode(scene) {
    modes.addNode = !modes.addNode;
    modes.selectNode = false;
    modes.drawBeam = false;
    
    // Clear draw beam state
    if (firstBeamNode) {
        firstBeamNode.material.color.setHex(firstBeamNode.userData.originalColor);
        firstBeamNode = null;
    }
    if (tempBeamLine) {
        scene.remove(tempBeamLine);
        tempBeamLine = null;
    }
    
    updateCursor();
    return modes.addNode;
}

/**
 * Toggle select node mode
 * @param {THREE.Scene} scene
 * @returns {boolean}
 */
export function toggleSelectNodeMode(scene) {
    modes.selectNode = !modes.selectNode;
    modes.addNode = false;
    modes.drawBeam = false;
    
    // Clear draw beam state
    if (firstBeamNode) {
        firstBeamNode.material.color.setHex(firstBeamNode.userData.originalColor);
        firstBeamNode = null;
    }
    if (tempBeamLine) {
        scene.remove(tempBeamLine);
        tempBeamLine = null;
    }
    
    updateCursor();
    return modes.selectNode;
}

/**
 * Toggle draw beam mode
 * @param {THREE.Scene} scene
 * @returns {boolean}
 */
export function toggleDrawBeamMode(scene) {
    modes.drawBeam = !modes.drawBeam;
    modes.addNode = false;
    modes.selectNode = false;
    modes.drawPlate = false;
    
    // Clear draw beam state when toggling off
    if (!modes.drawBeam) {
        if (firstBeamNode) {
            firstBeamNode.material.color.setHex(firstBeamNode.userData.originalColor);
            firstBeamNode = null;
        }
        if (tempBeamLine) {
            scene.remove(tempBeamLine);
            tempBeamLine = null;
        }
    }
    
    // Clear plate state
    clearPlateDrawing(scene);
    
    updateCursor();
    return modes.drawBeam;
}

/**
 * Toggle draw plate mode
 * @param {THREE.Scene} scene
 * @returns {boolean}
 */
export function toggleDrawPlateMode(scene) {
    modes.drawPlate = !modes.drawPlate;
    modes.addNode = false;
    modes.selectNode = false;
    modes.drawBeam = false;
    
    // Clear beam state
    if (firstBeamNode) {
        firstBeamNode.material.color.setHex(firstBeamNode.userData.originalColor);
        firstBeamNode = null;
    }
    if (tempBeamLine) {
        scene.remove(tempBeamLine);
        tempBeamLine = null;
    }
    
    // Clear plate state when toggling off
    if (!modes.drawPlate) {
        clearPlateDrawing(scene);
    }
    
    updateCursor();
    return modes.drawPlate;
}

/**
 * Clear plate drawing state
 * @param {THREE.Scene} scene
 */
function clearPlateDrawing(scene) {
    // Reset node colors
    plateNodes.forEach(node => {
        node.material.color.setHex(node.userData.originalColor);
    });
    plateNodes = [];
    
    // Remove preview
    if (tempPlatePreview) {
        scene.remove(tempPlatePreview);
        tempPlatePreview.geometry.dispose();
        tempPlatePreview.material.dispose();
        tempPlatePreview = null;
    }
    lastPreviewNodeIds = [];
    // Make sure draw mode flag is off
    modes.drawPlate = false;
    updateCursor();
}

/**
 * Handle node hover detection
 * @param {THREE.Raycaster} raycaster
 * @param {THREE.Group} nodesGroup
 * @param {THREE.Mesh} hoverHighlight
 * @param {HTMLCanvasElement} canvas
 */
function handleNodeHover(raycaster, nodesGroup, hoverHighlight, canvas) {
    let closestNode = null;
    // Reduced threshold for more precise selection
    let minDistance = 0.1; // Reduced from 0.3
    
    const is2D = window.getViewMode && window.getViewMode() === '2D';
    const currentElevation = window.get2DElevation ? window.get2DElevation() : 0;

    nodesGroup.children.forEach(node => {
        // In 2D mode, skip nodes that are not on the current elevation
        if (is2D && Math.abs(node.position.y - currentElevation) > 0.1) {
            return;
        }

        const distance = raycaster.ray.distanceToPoint(node.position);
        if (distance < minDistance) {
            closestNode = node;
            minDistance = distance;
        }
    });
    
    if (closestNode) {
        if (hoveredNode !== closestNode) {
            // Restore previous mesh node color if needed
            if (hoveredNode && hoveredNode.userData.isMeshNode) {
                const plus = hoveredNode.children.find(c => c.isLineSegments);
                if (plus && !plus.userData.isHighlighted) { // Don't override selection
                    plus.material.color.setHex(plus.userData.originalColor || 0xff0000);
                }
            }

            hoveredNode = closestNode;
            
            // Adjust highlight size for mesh nodes vs regular nodes
            if (closestNode.userData.isMeshNode) {
                hoverHighlight.visible = false; // Hide sphere for mesh nodes
                
                // Highlight the + helper instead
                const plus = closestNode.children.find(c => c.isLineSegments);
                if (plus) {
                    if (!plus.userData.originalColor) {
                        plus.userData.originalColor = plus.material.color.getHex();
                    }
                    // Only change color if not selected
                    if (!plus.userData.isHighlighted) {
                        plus.material.color.setHex(0x00ffff); // Cyan hover
                    }
                }
            } else {
                hoverHighlight.position.copy(closestNode.position);
                hoverHighlight.scale.set(1, 1, 1); // Normal size for structural nodes
                hoverHighlight.visible = true;
            }
            
            canvas.style.cursor = 'pointer';
        }
    } else {
        // Restore previous mesh node color if needed
        if (hoveredNode && hoveredNode.userData.isMeshNode) {
            const plus = hoveredNode.children.find(c => c.isLineSegments);
            if (plus && !plus.userData.isHighlighted) { // Don't override selection
                plus.material.color.setHex(plus.userData.originalColor || 0xff0000);
            }
        }

        hoveredNode = null;
        hoverHighlight.visible = false;
        canvas.style.cursor = 'crosshair';
    }
    
    return closestNode;
}

/**
 * Handle beam hover detection
 * @param {THREE.Raycaster} raycaster
 * @param {THREE.Group} beamsGroup
 * @param {THREE.Mesh} beamHoverHighlight
 */
function handleBeamHover(raycaster, beamsGroup, beamHoverHighlight) {
    let closestBeam = null;
    let minDistance = 0.8; // Same threshold as nodes
    
    beamsGroup.children.forEach(beam => {
        // Get beam endpoints
        const beamPos = beam.position.clone();
        const beamLength = beam.geometry.parameters.height || 1;
        const direction = new THREE.Vector3(0, 1, 0);
        direction.applyQuaternion(beam.quaternion);
        
        const endpoint1 = beamPos.clone().addScaledVector(direction, beamLength / 2);
        const endpoint2 = beamPos.clone().addScaledVector(direction, -beamLength / 2);
        
        // Sample multiple points along the beam (more samples = better detection)
        const samples = 10;
        for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            const samplePoint = new THREE.Vector3().lerpVectors(endpoint1, endpoint2, t);
            const distance = raycaster.ray.distanceToPoint(samplePoint);
            
            if (distance < minDistance) {
                closestBeam = beam;
                minDistance = distance;
            }
        }
    });
    
    if (closestBeam) {
        if (hoveredBeam !== closestBeam) {
            hoveredBeam = closestBeam;
            
            // Position and orient beam highlight
            beamHoverHighlight.position.copy(closestBeam.position);
            beamHoverHighlight.rotation.copy(closestBeam.rotation);
            beamHoverHighlight.scale.copy(closestBeam.scale);
            
            const beamLength = closestBeam.geometry.parameters.height || 1;
            beamHoverHighlight.scale.y = beamLength;
            beamHoverHighlight.visible = true;
        }
        return closestBeam;
    }
    
    hoveredBeam = null;
    beamHoverHighlight.visible = false;
    return null;
}

/**
 * Handle plate hover detection
 * @param {THREE.Raycaster} raycaster
 * @param {THREE.Group} platesGroup
 */
function handlePlateHover(raycaster, platesGroup) {
    if (!platesGroup || platesGroup.children.length === 0) {
        hoveredPlate = null;
        return null;
    }
    
    // Raycast against plates
    const intersects = raycaster.intersectObjects(platesGroup.children, false);
    
    if (intersects.length > 0) {
        const closestPlate = intersects[0].object;
        if (hoveredPlate !== closestPlate) {
            // Reset previous hovered plate if different
            if (hoveredPlate && !selectedPlates.has(hoveredPlate)) {
                hoveredPlate.material.opacity = hoveredPlate.userData.originalOpacity || 0.5;
            }
            
            hoveredPlate = closestPlate;
            // Highlight hovered plate (make more opaque) if not selected
            if (!selectedPlates.has(hoveredPlate)) {
                hoveredPlate.material.opacity = 0.7;
            }
        }
        return closestPlate;
    }
    
    // No plate hovered - reset previous
    if (hoveredPlate && !selectedPlates.has(hoveredPlate)) {
        hoveredPlate.material.opacity = hoveredPlate.userData.originalOpacity || 0.5;
    }
    hoveredPlate = null;
    return null;
}

/**
 * Handle mesh element hover detection
 * @param {THREE.Raycaster} raycaster
 * @param {THREE.Group} platesGroup
 */
function handleElementHover(raycaster, platesGroup) {
    if (!platesGroup || platesGroup.children.length === 0) {
        hoveredElement = null;
        return null;
    }
    
    // Find all mesh elements (individual quads/tris)
    const meshElements = [];
    platesGroup.children.forEach(plate => {
        if (plate.children) {
            plate.children.forEach(child => {
                // Check if this is the mesh group
                if (child.userData.isMeshViz) {
                    child.children.forEach(element => {
                        if (element.userData.isMeshElement) {
                            meshElements.push(element);
                        }
                    });
                }
            });
        }
    });
    
    if (meshElements.length === 0) return null;
    
    const intersects = raycaster.intersectObjects(meshElements, false);
    
    if (intersects.length > 0) {
        const closestElement = intersects[0].object;
        
        if (hoveredElement !== closestElement) {
            // Reset previous hovered element
            if (hoveredElement && !selectedElements.has(hoveredElement)) {
                hoveredElement.material.opacity = 0.3; // Back to default visible
                hoveredElement.material.color.setHex(hoveredElement.userData.originalColor || 0x808080); // Back to original color
            }
            
            hoveredElement = closestElement;
            
            // Highlight hovered element
            if (!selectedElements.has(hoveredElement)) {
                hoveredElement.material.opacity = 0.5;
                hoveredElement.material.color.setHex(0x00aaff); // Darker Cyan highlight to avoid white look
            }
        }
        return closestElement;
    }
    
    // No element hovered - reset previous
    if (hoveredElement && !selectedElements.has(hoveredElement)) {
        hoveredElement.material.opacity = 0.3;
        hoveredElement.material.color.setHex(hoveredElement.userData.originalColor || 0x808080);
    }
    hoveredElement = null;
    return null;
}

/**
 * Handle mouse move in select mode
 * @param {Object} sceneData
 */
export function handleSelectModeMove(sceneData) {
    const { raycaster, mouse, camera, nodesGroup, beamsGroup, platesGroup, hoverHighlight, beamHoverHighlight, canvas } = sceneData;
    
    raycaster.setFromCamera(mouse, camera);
    
    // Check filter
    const checkNodes = selectionFilter === 'all' || selectionFilter === 'nodes';
    const checkBeams = selectionFilter === 'all' || selectionFilter === 'beams';
    const checkPlates = selectionFilter === 'all' || selectionFilter === 'plates';
    
    // 1. Check Nodes (Highest Priority)
    if (checkNodes) {
        const node = handleNodeHover(raycaster, nodesGroup, hoverHighlight, canvas);
        if (node) {
            // Clear other hovers
            if (hoveredBeam) {
                if (hoveredBeam.userData.originalColor) hoveredBeam.material.color.setHex(hoveredBeam.userData.originalColor);
                if (hoveredBeam.userData.originalEmissive) hoveredBeam.material.emissive.setHex(hoveredBeam.userData.originalEmissive);
                hoveredBeam = null;
                beamHoverHighlight.visible = false;
            }
            if (hoveredPlate && !selectedPlates.has(hoveredPlate)) {
                hoveredPlate.material.opacity = hoveredPlate.userData.originalOpacity || 0.5;
                hoveredPlate = null;
            }
            if (hoveredElement && !selectedElements.has(hoveredElement)) {
                hoveredElement.material.opacity = 0.3;
                hoveredElement.material.color.setHex(hoveredElement.userData.originalColor || 0x808080);
                hoveredElement = null;
            }
            return;
        }
    }
    
    // 2. Check Beams
    if (checkBeams) {
        const beam = handleBeamHover(raycaster, beamsGroup, beamHoverHighlight);
        if (beam) {
            if (hoveredPlate && !selectedPlates.has(hoveredPlate)) {
                hoveredPlate.material.opacity = hoveredPlate.userData.originalOpacity || 0.5;
                hoveredPlate = null;
            }
            if (hoveredElement && !selectedElements.has(hoveredElement)) {
                hoveredElement.material.opacity = 0.3;
                hoveredElement.material.color.setHex(hoveredElement.userData.originalColor || 0x808080);
                hoveredElement = null;
            }
            return;
        }
    }
    
    // 3. Check Plates / Elements
    if (checkPlates) {
        // Check for mesh elements first if they exist
        const element = handleElementHover(raycaster, platesGroup);
        if (element) {
            // If we are hovering an element, we clear plate hover
            if (hoveredPlate && !selectedPlates.has(hoveredPlate)) {
                hoveredPlate.material.opacity = hoveredPlate.userData.originalOpacity || 0.5;
                hoveredPlate = null;
            }
            return;
        }
        
        handlePlateHover(raycaster, platesGroup);
    }
}

/**
 * Handle mouse move in draw beam mode
 * @param {Object} sceneData
 */
export function handleDrawBeamModeMove(sceneData) {
    const { raycaster, mouse, camera, nodesGroup, hoverHighlight, scene, canvas } = sceneData;
    
    raycaster.setFromCamera(mouse, camera);
    
    const closestNode = handleNodeHover(raycaster, nodesGroup, hoverHighlight, canvas);
    
    // Show temporary line from first node to hovered node
    if (firstBeamNode && closestNode && closestNode !== firstBeamNode) {
        // Remove old temp line
        if (tempBeamLine) {
            scene.remove(tempBeamLine);
        }
        
        // Create new temp line
        const points = [firstBeamNode.position, closestNode.position];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ 
            color: 0x00FF00,
            linewidth: 10,
            transparent: false,
            opacity: 0.6
        });
        tempBeamLine = new THREE.Line(geometry, material);
        scene.add(tempBeamLine);
    } else if (!closestNode && tempBeamLine) {
        scene.remove(tempBeamLine);
        tempBeamLine = null;
    }
}

/**
 * Handle mouse move in draw plate mode
 * @param {Object} sceneData
 */
export function handleDrawPlateModeMove(sceneData) {
    const { raycaster, mouse, camera, nodesGroup, hoverHighlight, scene, canvas } = sceneData;
    
    raycaster.setFromCamera(mouse, camera);
    
    const closestNode = handleNodeHover(raycaster, nodesGroup, hoverHighlight, canvas);
    
    // Show temporary plate preview if we have at least 2 nodes + hovered node
    if (plateNodes.length >= 2 && closestNode && !plateNodes.includes(closestNode)) {
        // Build an id list for comparison to avoid flicker
        const previewNodeIds = [...plateNodes.map(n => n.id || n.uuid), closestNode.id || closestNode.uuid];
        const samePreview = (previewNodeIds.length === lastPreviewNodeIds.length) && previewNodeIds.every((v,i) => v === lastPreviewNodeIds[i]);
        if (samePreview && tempPlatePreview) {
            // nothing to do
            return;
        }

        // Remove old preview
        if (tempPlatePreview) {
            scene.remove(tempPlatePreview);
            tempPlatePreview.geometry.dispose();
            tempPlatePreview.material.dispose();
            tempPlatePreview = null;
        }

        // Create preview with current nodes + hovered node
        const previewNodes = [...plateNodes, closestNode];
        tempPlatePreview = createPlatePreview(previewNodes);
        if (tempPlatePreview) scene.add(tempPlatePreview);
        lastPreviewNodeIds = previewNodeIds;
    } else if (tempPlatePreview && (!closestNode || plateNodes.includes(closestNode))) {
        scene.remove(tempPlatePreview);
        tempPlatePreview.geometry.dispose();
        tempPlatePreview.material.dispose();
        tempPlatePreview = null;
        lastPreviewNodeIds = [];
    }
}

/**
 * Create a plate preview mesh from nodes
 * @param {Array<THREE.Mesh>} nodes
 * @returns {THREE.Mesh}
 */
function createPlatePreview(nodes) {
    if (nodes.length < 3) return null;
    
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
    
    // Determine if plate is vertical (same logic as createPlateMesh)
    const v0 = new THREE.Vector3(positions[0].x, positions[0].y, positions[0].z);
    const v1 = new THREE.Vector3(positions[1].x, positions[1].y, positions[1].z);
    const v2 = new THREE.Vector3(positions[2].x, positions[2].y, positions[2].z);
    
    const edge1 = new THREE.Vector3().subVectors(v1, v0);
    const edge2 = new THREE.Vector3().subVectors(v2, v0);
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
    
    // If normal is mostly vertical (Y component close to 1 or -1), it's horizontal
    const isVertical = Math.abs(normal.y) < 0.7;
    const previewColor = isVertical ? 0x00eeff : 0x808080; // Cyan for vertical, grey for horizontal
    
    const material = new THREE.MeshStandardMaterial({ 
        color: previewColor,
        transparent: true,
        // preview slightly less opaque than final plate
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const mesh = new THREE.Mesh(geometry, material);

    // add subtle edge lines to preview to help readability
    try {
        const edgeGeom = new THREE.EdgesGeometry(geometry);
        const edgeMat = new THREE.LineBasicMaterial({ color: isVertical ? 0x99cfff : 0xcccccc, linewidth: 1 });
        const outline = new THREE.LineSegments(edgeGeom, edgeMat);
        outline.renderOrder = 2;
        mesh.add(outline);
        mesh.userData.outline = outline;
    } catch (e) {
        // ignore
    }

    return mesh;
}

/**
 * Handle mouse move in add node mode
 * @param {Object} sceneData
 */
export function handleAddNodeModeMove(sceneData) {
    const { raycaster, mouse, camera, gridPlane, highlight } = sceneData;
    
    raycaster.setFromCamera(mouse, camera);
    const point = new THREE.Vector3();
    raycaster.ray.intersectPlane(gridPlane, point);

    const snapped = new THREE.Vector3(
        Math.round(point.x),
        0,
        Math.round(point.z)
    );
    
    highlight.position.copy(snapped);
    highlight.visible = true;
}

/**
 * Handle click in add node mode
 * @param {Object} sceneData
 * @param {MouseEvent} event
 */
export function handleAddNodeClick(sceneData, event) {
    const { raycaster, mouse, camera, gridPlane, nodesGroup, canvas } = sceneData;
    
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const point = new THREE.Vector3();
    raycaster.ray.intersectPlane(gridPlane, point);

    // Check if in 2D mode and use current elevation
    let yCoord = 0;
    if (window.getViewMode && window.getViewMode() === '2D' && window.get2DElevation) {
        yCoord = window.get2DElevation();
    }

    const snapped = new THREE.Vector3(
        Math.round(point.x),
        yCoord,
        Math.round(point.z)
    );

    createNode(nodesGroup, snapped);
}

/**
 * Handle click in select mode
 */
/**
 * Start box selection
 * @param {MouseEvent} event
 * @param {HTMLCanvasElement} canvas
 */
export function startBoxSelection(event, canvas) {
    if (!modes.selectNode) return;
    
    isBoxSelecting = true;
    selectionBoxStart = { x: event.clientX, y: event.clientY };
    
    // Create selection box div
    if (!selectionBoxDiv) {
        selectionBoxDiv = document.createElement('div');
        selectionBoxDiv.style.position = 'fixed';
        selectionBoxDiv.style.border = '2px solid #0066cc';
        selectionBoxDiv.style.backgroundColor = 'rgba(0, 102, 204, 0.1)';
        selectionBoxDiv.style.pointerEvents = 'none';
        selectionBoxDiv.style.zIndex = '999';
        document.body.appendChild(selectionBoxDiv);
    }
    
    selectionBoxDiv.style.left = selectionBoxStart.x + 'px';
    selectionBoxDiv.style.top = selectionBoxStart.y + 'px';
    selectionBoxDiv.style.width = '0px';
    selectionBoxDiv.style.height = '0px';
    selectionBoxDiv.style.display = 'block';
}

/**
 * Update box selection during drag
 * @param {MouseEvent} event
 */
export function updateBoxSelection(event) {
    if (!isBoxSelecting || !selectionBoxStart || !selectionBoxDiv) return;
    
    const currentX = event.clientX;
    const currentY = event.clientY;
    
    const left = Math.min(selectionBoxStart.x, currentX);
    const top = Math.min(selectionBoxStart.y, currentY);
    const width = Math.abs(currentX - selectionBoxStart.x);
    const height = Math.abs(currentY - selectionBoxStart.y);
    
    selectionBoxDiv.style.left = left + 'px';
    selectionBoxDiv.style.top = top + 'px';
    selectionBoxDiv.style.width = width + 'px';
    selectionBoxDiv.style.height = height + 'px';
}

/**
 * End box selection and show popup menu
 * @param {MouseEvent} event
 * @param {Object} sceneData
 */
export function endBoxSelection(event, sceneData) {
    if (!isBoxSelecting) return;
    
    isBoxSelecting = false;
    
    if (!selectionBoxDiv || !selectionBoxStart) return;
    
    // Get box bounds
    const currentX = event.clientX;
    const currentY = event.clientY;
    const boxLeft = Math.min(selectionBoxStart.x, currentX);
    const boxTop = Math.min(selectionBoxStart.y, currentY);
    const boxRight = Math.max(selectionBoxStart.x, currentX);
    const boxBottom = Math.max(selectionBoxStart.y, currentY);
    
    // Hide selection box
    selectionBoxDiv.style.display = 'none';
    
    // If box is too small, treat as click
    if (Math.abs(currentX - selectionBoxStart.x) < 5 && Math.abs(currentY - selectionBoxStart.y) < 5) {
        selectionBoxStart = null;
        return;
    }
    
    // Find objects within selection box
    const { nodesGroup, beamsGroup, platesGroup, camera, renderer } = sceneData;
    const canvas = renderer.domElement;
    const nodesInBox = [];
    const beamsInBox = [];
    const platesInBox = [];
    
    // Check nodes
    if (selectionFilter === 'all' || selectionFilter === 'nodes') {
        nodesGroup.children.forEach(node => {
            const screenPos = node.position.clone().project(camera);
            const rect = canvas.getBoundingClientRect();
            const x = (screenPos.x + 1) / 2 * rect.width + rect.left;
            const y = (-screenPos.y + 1) / 2 * rect.height + rect.top;
            
            if (x >= boxLeft && x <= boxRight && y >= boxTop && y <= boxBottom) {
                nodesInBox.push(node);
            }
        });
    }
    
    // Check beams (check if both endpoints are in box)
    if (selectionFilter === 'all' || selectionFilter === 'beams') {
        beamsGroup.children.forEach(beam => {
            const beamPos = beam.position.clone();
            const beamLength = beam.geometry.parameters.height || 1;
            const direction = new THREE.Vector3(0, 1, 0);
            direction.applyQuaternion(beam.quaternion);
            
            const endpoint1 = beamPos.clone().addScaledVector(direction, beamLength / 2);
            const endpoint2 = beamPos.clone().addScaledVector(direction, -beamLength / 2);
            
            const screenPos1 = endpoint1.project(camera);
            const screenPos2 = endpoint2.project(camera);
            
            const rect = canvas.getBoundingClientRect();
            
            const x1 = (screenPos1.x + 1) / 2 * rect.width + rect.left;
            const y1 = (-screenPos1.y + 1) / 2 * rect.height + rect.top;
            const x2 = (screenPos2.x + 1) / 2 * rect.width + rect.left;
            const y2 = (-screenPos2.y + 1) / 2 * rect.height + rect.top;
            
            if (x1 >= boxLeft && x1 <= boxRight && y1 >= boxTop && y1 <= boxBottom &&
                x2 >= boxLeft && x2 <= boxRight && y2 >= boxTop && y2 <= boxBottom) {
                beamsInBox.push(beam);
            }
        });
    }

    // Check plates (centroid in box)
    if (selectionFilter === 'all' || selectionFilter === 'plates') {
        platesGroup.children.forEach(plate => {
            // Check if plate has mesh elements
            if (plate.userData.mesh) {
                // Check mesh elements
                const meshViz = plate.children.find(c => c.userData.isMeshViz);
                if (meshViz) {
                    meshViz.children.forEach(element => {
                        if (element.userData.isMeshElement) {
                            // Calculate centroid of element
                            const positions = element.geometry.attributes.position.array;
                            let cx = 0, cy = 0, cz = 0;
                            const count = positions.length / 3;
                            for(let i=0; i<positions.length; i+=3) {
                                cx += positions[i];
                                cy += positions[i+1];
                                cz += positions[i+2];
                            }
                            const centroid = new THREE.Vector3(cx/count, cy/count, cz/count);
                            
                            const screenPos = centroid.project(camera);
                            const rect = canvas.getBoundingClientRect();
                            const x = (screenPos.x + 1) / 2 * rect.width + rect.left;
                            const y = (-screenPos.y + 1) / 2 * rect.height + rect.top;
                            
                            if (x >= boxLeft && x <= boxRight && y >= boxTop && y <= boxBottom) {
                                platesInBox.push(element); // Push element instead of plate
                            }
                        }
                    });
                }
            } else {
                // Original plate logic
                const positions = plate.geometry.attributes.position.array;
                let cx = 0, cy = 0, cz = 0;
                const count = positions.length / 3;
                for(let i=0; i<positions.length; i+=3) {
                    cx += positions[i];
                    cy += positions[i+1];
                    cz += positions[i+2];
                }
                const centroid = new THREE.Vector3(cx/count, cy/count, cz/count);
                
                const screenPos = centroid.project(camera);
                const rect = canvas.getBoundingClientRect();
                const x = (screenPos.x + 1) / 2 * rect.width + rect.left;
                const y = (-screenPos.y + 1) / 2 * rect.height + rect.top;
                
                if (x >= boxLeft && x <= boxRight && y >= boxTop && y <= boxBottom) {
                    platesInBox.push(plate);
                }
            }
        });
    }
    
    // If filter is active, select immediately
    if (selectionFilter !== 'all') {
        if (nodesInBox.length > 0) selectItems(nodesInBox, 'nodes');
        if (beamsInBox.length > 0) selectItems(beamsInBox, 'beams');
        if (platesInBox.length > 0) selectItems(platesInBox, 'plates');
    } else {
        // Show selection popup
        showSelectionPopup(event.clientX, event.clientY, nodesInBox, beamsInBox, platesInBox);
    }
    
    selectionBoxStart = null;
}

/**
 * Show selection popup menu
 * @param {number} x
 * @param {number} y
 * @param {Array} nodesInBox
 * @param {Array} beamsInBox
 * @param {Array} platesInBox
 */
function showSelectionPopup(x, y, nodesInBox, beamsInBox, platesInBox = []) {
    // Remove existing popup
    const existingPopup = document.getElementById('selection-popup');
    if (existingPopup) existingPopup.remove();
    
    // Create popup
    const popup = document.createElement('div');
    popup.id = 'selection-popup';
    popup.style.position = 'fixed';
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
    popup.style.background = '#ffffff';
    popup.style.border = '1px solid #dee2e6';
    popup.style.borderRadius = '4px';
    popup.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    popup.style.padding = '8px';
    popup.style.zIndex = '1000';
    popup.style.fontSize = '12px';
    popup.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    
    const options = [];
    
    if (nodesInBox.length > 0) {
        options.push({ label: `Select Nodes (${nodesInBox.length})`, action: () => selectItems(nodesInBox, 'nodes') });
    }
    if (beamsInBox.length > 0) {
        options.push({ label: `Select Beams (${beamsInBox.length})`, action: () => selectItems(beamsInBox, 'beams') });
    }
    if (platesInBox.length > 0) {
        options.push({ label: `Select Plates (${platesInBox.length})`, action: () => selectItems(platesInBox, 'plates') });
    }
    
    if (options.length > 1) {
        options.push({ label: 'Select All', action: () => { 
            selectItems(nodesInBox, 'nodes'); 
            selectItems(beamsInBox, 'beams'); 
            selectItems(platesInBox, 'plates');
        }});
    }
    
    if (options.length === 0) {
        popup.remove();
        return;
    }
    
    options.forEach(opt => {
        const btn = document.createElement('div');
        btn.textContent = opt.label;
        btn.style.padding = '6px 12px';
        btn.style.cursor = 'pointer';
        btn.style.borderRadius = '3px';
        btn.style.whiteSpace = 'nowrap';
        btn.onmouseenter = () => btn.style.background = '#f0f0f0';
        btn.onmouseleave = () => btn.style.background = 'transparent';
        btn.onclick = () => {
            opt.action();
            popup.remove();
        };
        popup.appendChild(btn);
    });
    
    document.body.appendChild(popup);
    
    // Close popup when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closePopup(e) {
            if (!popup.contains(e.target)) {
                popup.remove();
                document.removeEventListener('click', closePopup);
            }
        });
    }, 100);
}

/**
 * Select items from box selection
 * @param {Array} items
 * @param {string} type
 */
function selectItems(items, type) {
    if (type === 'nodes') {
        items.forEach(node => {
            selectedNodes.add(node);
            if (selectionHighlightsGroup) {
                addNodeSelectionHighlight(selectionHighlightsGroup, node);
            }
        });
        console.log(`Selected ${items.length} node(s)`);
    } else if (type === 'beams') {
        items.forEach(beam => {
            selectedBeams.add(beam);
            if (!beam.userData.originalColor) {
                beam.userData.originalColor = beam.material.color.getHex();
                beam.userData.originalEmissive = beam.material.emissive.getHex();
            }
            beam.material.color.setHex(0x00ff00);
            beam.material.emissive.setHex(0x00aa00);
        });
        console.log(`Selected ${items.length} beam(s)`);
    } else if (type === 'plates') {
        items.forEach(plate => {
            selectedPlates.add(plate);
            if (!plate.userData.originalColor) {
                plate.userData.originalColor = plate.material.color.getHex();
            }
            if (!plate.userData.originalOpacity) {
                plate.userData.originalOpacity = plate.material.opacity;
            }
            // Use orange highlight for selected plate
            plate.material.color.setHex(0xff8800);
            plate.material.opacity = 0.9;
        });
        console.log(`Selected ${items.length} plate(s)`);
    } else if (type === 'elements') {
        items.forEach(element => {
            selectedElements.add(element);
            element.material.opacity = 0.8;
            element.material.color.setHex(0xff0000); // Red for selected element
        });
        console.log(`Selected ${items.length} element(s)`);
    }
}

/**
 * Handle click in select mode
 */
export function handleSelectClick() {
    // Check nodes first (higher priority - smaller target)
    if (hoveredNode && (selectionFilter === 'all' || selectionFilter === 'nodes')) {
        const node = hoveredNode;
        if (selectedNodes.has(node)) {
            selectedNodes.delete(node);
            if (selectionHighlightsGroup) {
                removeNodeSelectionHighlight(selectionHighlightsGroup, node);
            }
            window.dispatchEvent(new CustomEvent('node-deselected', { detail: { id: node.uuid } }));
        } else {
            selectedNodes.add(node);
            if (selectionHighlightsGroup) {
                addNodeSelectionHighlight(selectionHighlightsGroup, node);
            }
            window.dispatchEvent(new CustomEvent('node-selected', { 
                detail: { 
                    id: node.uuid,
                    x: node.position.x,
                    y: node.position.y,
                    z: node.position.z
                } 
            }));
        }
        console.log(`${selectedNodes.size} node(s) selected`);
    }
    // Then check beams if no node was hovered
    else if (hoveredBeam && (selectionFilter === 'all' || selectionFilter === 'beams')) {
        const beam = hoveredBeam;
        if (selectedBeams.has(beam)) {
            selectedBeams.delete(beam);
            beam.material.color.setHex(beam.userData.originalColor || 0x0077ff);
            beam.material.emissive.setHex(beam.userData.originalEmissive || 0x0033ff);
        } else {
            selectedBeams.add(beam);
            if (!beam.userData.originalColor) {
                beam.userData.originalColor = beam.material.color.getHex();
                beam.userData.originalEmissive = beam.material.emissive.getHex();
            }
            beam.material.color.setHex(0x00ff00);
            beam.material.emissive.setHex(0x00aa00);
        }
        console.log(`${selectedBeams.size} beam(s) selected`);
    }
    // Then check elements (mesh faces)
    else if (hoveredElement && (selectionFilter === 'all' || selectionFilter === 'plates')) {
        const element = hoveredElement;
        if (selectedElements.has(element)) {
            selectedElements.delete(element);
            element.material.opacity = 0.3; // Back to default visible
            element.material.color.setHex(element.userData.originalColor || 0x808080); // Back to original color
        } else {
            selectedElements.add(element);
            element.material.opacity = 0.8;
            element.material.color.setHex(0xff0000); // Red for selected element
        }
        console.log(`${selectedElements.size} element(s) selected`);
    }
    // Then check plates if no node or beam or element was hovered
    else if (hoveredPlate && (selectionFilter === 'all' || selectionFilter === 'plates')) {
        const plate = hoveredPlate;
        if (selectedPlates.has(plate)) {
            selectedPlates.delete(plate);
            plate.material.color.setHex(plate.userData.originalColor || 0x808080);
            plate.material.opacity = plate.userData.originalOpacity || 0.5;
        } else {
            selectedPlates.add(plate);
            if (!plate.userData.originalColor) {
                plate.userData.originalColor = plate.material.color.getHex();
            }
            if (!plate.userData.originalOpacity) {
                plate.userData.originalOpacity = plate.material.opacity;
            }
            // Use orange highlight for selected plate
            plate.material.color.setHex(0xff8800);
            plate.material.opacity = 0.9;
        }
        console.log(`${selectedPlates.size} plate(s) selected`);
    }
}

/**
 * Handle click in draw beam mode
 * @param {Object} sceneData
 */
export function handleDrawBeamClick(sceneData) {
    const { scene, beamsGroup } = sceneData;
    
    if (hoveredNode) {
        if (!firstBeamNode) {
            // First click: select start node
            firstBeamNode = hoveredNode;
            firstBeamNode.material.color.setHex(0xff8800);
            console.log('First node selected for beam');
        } else if (hoveredNode !== firstBeamNode) {
            // Second click: create beam to end node
            const startPos = firstBeamNode.position.clone();
            const endPos = hoveredNode.position.clone();
            
            // Check if beam already exists
            const existingBeam = findBeamBetweenPositions(beamsGroup, startPos, endPos);
            if (existingBeam) {
                console.log('Beam already exists between these nodes');
            } else {
                createBeam(beamsGroup, startPos, endPos, firstBeamNode, hoveredNode);
            }
            
            // Reset state
            firstBeamNode.material.color.setHex(firstBeamNode.userData.originalColor);
            firstBeamNode = null;
            
            if (tempBeamLine) {
                scene.remove(tempBeamLine);
                tempBeamLine = null;
            }
        } else {
            console.log('Cannot create beam to same node');
        }
    }
}

/**
 * Handle click in draw plate mode
 * @param {Object} sceneData
 */
export function handleDrawPlateClick(sceneData) {
    const { scene, platesGroup } = sceneData;
    
    console.log('handleDrawPlateClick called, hoveredNode:', hoveredNode);
    
    if (hoveredNode) {
        // Check if this is the first node again (closing the loop)
        if (plateNodes.length >= 3 && hoveredNode === plateNodes[0]) {
            console.log('Closing plate loop - creating plate');
            completePlate(sceneData);
            return;
        }
        
        // Check if this node is already in the plate
        if (plateNodes.includes(hoveredNode)) {
            console.log('Node already added to plate');
            return;
        }
        
        // Add node to plate
        plateNodes.push(hoveredNode);
        hoveredNode.material.color.setHex(0xff8800);
        console.log(`Plate node ${plateNodes.length} selected at position:`, hoveredNode.position);
        
        // If we have 3+ nodes, show help message
        if (plateNodes.length >= 3) {
            console.log('Click the first node again to complete, press Enter to finish, or click more nodes to add');
        }
        // If we have 4 or more nodes, auto-complete the plate
        if (plateNodes.length >= 4) {
            console.log('Auto-completing plate after 4 nodes');
            completePlate(sceneData);
        }
    } else {
        console.log('No node hovered');
    }
}

/**
 * Complete the current plate (called when user presses Enter)
 * @param {Object} sceneData
 */
export function completePlate(sceneData) {
    const { scene, platesGroup } = sceneData;
    
    if (plateNodes.length < 3) {
        console.log('Need at least 3 nodes to create a plate');
        return;
    }
    
    // Create the final plate
    const plate = createPlateMesh(plateNodes, platesGroup);
    
    // Reset state
    plateNodes.forEach(node => {
        node.material.color.setHex(node.userData.originalColor);
    });
    plateNodes = [];
    
    if (tempPlatePreview) {
        scene.remove(tempPlatePreview);
        tempPlatePreview.geometry.dispose();
        tempPlatePreview.material.dispose();
        tempPlatePreview = null;
    }
    // Ensure draw plate mode is turned off and cursor updated
    modes.drawPlate = false;
    lastPreviewNodeIds = [];
    updateCursor();

    console.log('Plate created');
}

/**
 * Cancel plate drawing (called when user presses Escape)
 * @param {THREE.Scene} scene
 */
export function cancelPlateDrawing(scene) {
    clearPlateDrawing(scene);
    console.log('Plate drawing cancelled');
}

/**
 * Start copy from point mode
 * @param {THREE.Mesh} baseNode - The reference node to copy from
 * @param {Object} sceneData - Scene data containing groups
 */
export function startCopyFromPoint(baseNode, sceneData) {
    if (selectedBeams.size === 0 && selectedPlates.size === 0) {
        console.warn('No beams or plates selected to copy');
        return;
    }

    copyBaseNode = baseNode;
    modes.copyFromPoint = true;
    modes.selectNode = false;

    const basePos = baseNode.position.clone();

    // Store beam data relative to base node (if any)
    copiedBeamsData = [];
    selectedBeams.forEach(beam => {
        const beamPos = beam.position.clone();
        const beamLength = beam.geometry.parameters.height || 1;

        // Calculate beam endpoints
        const direction = new THREE.Vector3(0, 1, 0);
        direction.applyQuaternion(beam.quaternion);

        const endpoint1 = new THREE.Vector3().copy(beamPos).addScaledVector(direction, beamLength / 2);
        const endpoint2 = new THREE.Vector3().copy(beamPos).addScaledVector(direction, -beamLength / 2);

        // Store relative to base node
        copiedBeamsData.push({
            start: endpoint1.sub(basePos),
            end: endpoint2.sub(basePos)
        });
    });

    // Store plate node offsets relative to base node (if any)
    copiedPlatesData = [];
    selectedPlates.forEach(plate => {
        // plate.userData.nodes is array of node meshes used to create the plate
        if (plate.userData && plate.userData.nodes) {
            const offsets = plate.userData.nodes.map(n => n.position.clone().sub(basePos));
            copiedPlatesData.push(offsets);
        }
    });

    // Create preview group
    copyPreviewGroup = new THREE.Group();
    copyPreviewGroup.name = 'copyPreview';
    sceneData.scene.add(copyPreviewGroup);

    console.log(`Copy from point started: ${copiedBeamsData.length} beam(s), ${copiedPlatesData.length} plate(s) copied from base node`);
    updateCursor();
}

/**
 * Handle mouse move in copy from point mode
 * @param {Object} sceneData
 */
export function handleCopyFromPointMove(sceneData) {
    if (!modes.copyFromPoint || !copiedBeamsData || !copyPreviewGroup) return;
    
    const { raycaster, mouse, camera, nodesGroup } = sceneData;
    
    raycaster.setFromCamera(mouse, camera);
    
    // Check for hovered node
    handleNodeHover(raycaster, nodesGroup, sceneData.hoverHighlight, sceneData.canvas);
    
    if (hoveredNode) {
        // Clear previous preview
        while (copyPreviewGroup.children.length > 0) {
            const child = copyPreviewGroup.children[0];
            copyPreviewGroup.remove(child);
            child.geometry.dispose();
            child.material.dispose();
        }
        
        // Create preview beams at hovered node position
        const targetPos = hoveredNode.position.clone();
        
        copiedBeamsData.forEach(beamData => {
            const start = targetPos.clone().add(beamData.start);
            const end = targetPos.clone().add(beamData.end);
            
            const direction = new THREE.Vector3().subVectors(end, start);
            const length = direction.length();
            const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
            
            const previewGeom = new THREE.CylinderGeometry(0.03, 0.03, length, 8);
            const previewMat = new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                transparent: true,
                opacity: 0.5,
                wireframe: true
            });
            
            const previewBeam = new THREE.Mesh(previewGeom, previewMat);
            previewBeam.position.copy(midpoint);
            
            const up = new THREE.Vector3(0, 1, 0);
            const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction.normalize());
            previewBeam.applyQuaternion(quaternion);
            
            copyPreviewGroup.add(previewBeam);
        });

        // Create preview plates at hovered node position
        copiedPlatesData?.forEach(plateOffsets => {
            // Build positions for plate
            const positions = plateOffsets.map(off => targetPos.clone().add(off));

            // Create geometry similar to createPlateMesh
            if (positions.length >= 3) {
                const vertices = new Float32Array(positions.length * 3);
                for (let i = 0; i < positions.length; i++) {
                    vertices[i * 3] = positions[i].x;
                    vertices[i * 3 + 1] = positions[i].y;
                    vertices[i * 3 + 2] = positions[i].z;
                }
                const indices = [];
                for (let i = 1; i < positions.length - 1; i++) {
                    indices.push(0, i, i + 1);
                }
                const geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                geom.setIndex(indices);
                geom.computeVertexNormals();
                const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.35, wireframe: true });
                const previewPlate = new THREE.Mesh(geom, mat);
                copyPreviewGroup.add(previewPlate);
            }
        });
    } else {
        // Clear preview if no node hovered
        while (copyPreviewGroup.children.length > 0) {
            const child = copyPreviewGroup.children[0];
            copyPreviewGroup.remove(child);
            child.geometry.dispose();
            child.material.dispose();
        }
    }
}

/**
 * Handle click in copy from point mode
 * @param {Object} sceneData
 */
export function handleCopyFromPointClick(sceneData) {
    console.log('handleCopyFromPointClick called', {
        copyMode: modes.copyFromPoint,
        hasCopiedData: !!copiedBeamsData,
        copiedBeamsCount: copiedBeamsData?.length,
        hasHoveredNode: !!hoveredNode
    });
    
    if (!modes.copyFromPoint || !copiedBeamsData) {
        console.warn('Copy from point click cancelled - missing data');
        return;
    }
    
    // Detect node at click position if hoveredNode is not set
    let targetNode = hoveredNode;
    
    if (!targetNode) {
        console.log('No hovered node, detecting from click position');
        const { raycaster, mouse, camera, nodesGroup } = sceneData;
        raycaster.setFromCamera(mouse, camera);
        
        // Check for node intersection
        const intersects = raycaster.intersectObjects(nodesGroup.children);
        
        if (intersects.length > 0) {
            // Find closest node within threshold
            for (const intersect of intersects) {
                const distance = intersect.distance;
                if (distance < 0.8) {
                    targetNode = intersect.object;
                    console.log('Found node at click position:', targetNode);
                    break;
                }
            }
        }
    }
    
    if (!targetNode) {
        console.warn('No target node found at click position');
        return;
    }
    
    const { nodesGroup, beamsGroup, platesGroup } = sceneData;
    const targetPos = targetNode.position.clone();
    
    console.log('Target position:', targetPos);
    
    let createdBeamCount = 0;
    let createdPlateCount = 0;
    const createdBeams = [];
    
    copiedBeamsData.forEach((beamData, index) => {
        const start = targetPos.clone().add(beamData.start);
        const end = targetPos.clone().add(beamData.end);
        
        console.log(`Creating beam ${index + 1}:`, {
            start: start.toArray(),
            end: end.toArray()
        });
        
        // Check if beam already exists
        const existingBeam = findBeamBetweenPositions(beamsGroup, start, end);
        if (!existingBeam) {
            const beam = createBeam(beamsGroup, start, end);
            if (beam) {
                createdBeams.push(beam);
                createdBeamCount++;
                console.log(`Beam ${index + 1} created successfully`);
            } else {
                console.warn(`Failed to create beam ${index + 1}`);
            }
        } else {
            console.log(`Beam ${index + 1} already exists, skipping`);
        }
    });

    // Create plates from copied plate data
    copiedPlatesData?.forEach((plateOffsets, index) => {
        const positions = plateOffsets.map(off => targetPos.clone().add(off));

        // Find or create nodes at these positions
        const plateNodeMeshes = [];
        positions.forEach(pos => {
            let existingNode = nodesGroup.children.find(node => node.position.distanceTo(pos) < 0.01);
            if (!existingNode) {
                existingNode = createNode(nodesGroup, pos);
            }
            plateNodeMeshes.push(existingNode);
        });

        // Create plate
        if (plateNodeMeshes.length >= 3) {
            const plate = createPlateMesh(plateNodeMeshes, platesGroup);
            if (plate) {
                createdPlateCount++;
                console.log(`Plate ${index + 1} created successfully`);
            }
        }
    });
    
    console.log(`Pasted ${createdBeamCount} beam(s) and ${createdPlateCount} plate(s) at target node`);
    
    // Clean up and exit copy mode
    cancelCopyFromPoint(sceneData);
}

/**
 * Cancel copy from point mode
 * @param {Object} sceneData
 */
export function cancelCopyFromPoint(sceneData) {
    modes.copyFromPoint = false;
    copyBaseNode = null;
    copiedBeamsData = null;
    copiedPlatesData = null;
    
    if (copyPreviewGroup && sceneData.scene) {
        while (copyPreviewGroup.children.length > 0) {
            const child = copyPreviewGroup.children[0];
            copyPreviewGroup.remove(child);
            child.geometry.dispose();
            child.material.dispose();
        }
        sceneData.scene.remove(copyPreviewGroup);
        copyPreviewGroup = null;
    }
    
    console.log('Copy from point cancelled');
    updateCursor();
}

/**
 * Show context menu for selected beams
 * @param {number} x
 * @param {number} y
 * @param {Object} sceneData
 */
export function showCopyContextMenu(x, y, sceneData) {
    // Remove existing menu
    const existingMenu = document.getElementById('copy-context-menu');
    if (existingMenu) existingMenu.remove();
    
    // Create context menu
    const menu = document.createElement('div');
    menu.id = 'copy-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.style.background = '#ffffff';
    menu.style.border = '1px solid #dee2e6';
    menu.style.borderRadius = '4px';
    menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    menu.style.padding = '4px';
    menu.style.zIndex = '1000';
    menu.style.fontSize = '12px';
    menu.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    
    const copyOption = document.createElement('div');
    copyOption.textContent = 'Copy from Point...';
    copyOption.style.padding = '6px 12px';
    copyOption.style.cursor = 'pointer';
    copyOption.style.borderRadius = '3px';
    copyOption.style.whiteSpace = 'nowrap';
    copyOption.onmouseenter = () => copyOption.style.background = '#f0f0f0';
    copyOption.onmouseleave = () => copyOption.style.background = 'transparent';
    copyOption.onclick = () => {
        menu.remove();
        // Use the exposed startCopyElements function
        if (window.startCopyElements) {
            window.startCopyElements();
        }
    };
    menu.appendChild(copyOption);
    
    // Add Point Load option
    const pointLoadOption = document.createElement('div');
    pointLoadOption.textContent = 'Add Point Load...';
    pointLoadOption.style.padding = '6px 12px';
    pointLoadOption.style.cursor = 'pointer';
    pointLoadOption.style.borderRadius = '3px';
    pointLoadOption.style.whiteSpace = 'nowrap';
    pointLoadOption.onmouseenter = () => pointLoadOption.style.background = '#f0f0f0';
    pointLoadOption.onmouseleave = () => pointLoadOption.style.background = 'transparent';
    pointLoadOption.onclick = () => {
        menu.remove();
        if (window.showPointLoadPanel) {
            window.showPointLoadPanel();
        }
    };
    menu.appendChild(pointLoadOption);
    
    // Add Distributed Load option
    const udlOption = document.createElement('div');
    udlOption.textContent = 'Add Distributed Load...';
    udlOption.style.padding = '6px 12px';
    udlOption.style.cursor = 'pointer';
    udlOption.style.borderRadius = '3px';
    udlOption.style.whiteSpace = 'nowrap';
    udlOption.onmouseenter = () => udlOption.style.background = '#f0f0f0';
    udlOption.onmouseleave = () => udlOption.style.background = 'transparent';
    udlOption.onclick = () => {
        menu.remove();
        if (window.showDistributedLoadPanel) {
            window.showDistributedLoadPanel();
        }
    };
    menu.appendChild(udlOption);
    document.body.appendChild(menu);
    
    // Close menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 100);
}
