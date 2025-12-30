/**
 * Three.js Canvas Main Module
 * Orchestrates scene initialization, camera controls, and user interactions
 */

const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js');

// Import modules
import { initializeScene, initializeCameraControls, setViewportView } from './scene_setup.js';
import { 
    selectAll, 
    clearSelection, 
    deleteSelected as deleteSelectedGeometry, 
    extrudeBeams as extrudeBeamsGeometry,
    undoLastAction as undoLastActionGeometry,
    setSelectionHighlightsGroup,
    selectedBeams,
    selectedNodes,
    selectedPlates,
    selectedElements,
    createNode,
    createBeam,
    createPlateMesh
} from './geometry_manager.js';
import {
    modes,
    toggleAddNodeMode as _toggleAddNodeMode,
    toggleSelectNodeMode as _toggleSelectNodeMode,
    toggleDrawBeamMode as _toggleDrawBeamMode,
    toggleDrawPlateMode as _toggleDrawPlateMode,
    handleSelectModeMove,
    handleDrawBeamModeMove,
    handleDrawPlateModeMove,
    handleAddNodeModeMove,
    handleAddNodeClick,
    handleSelectClick,
    handleDrawBeamClick,
    handleDrawPlateClick,
    completePlate,
    cancelPlateDrawing,
    startBoxSelection,
    updateBoxSelection,
    endBoxSelection,
    updateCursor,
    setSelectionHighlightsGroup as setInteractionHighlightsGroup,
    handleCopyFromPointMove,
    handleCopyFromPointClick,
    cancelCopyFromPoint,
    showCopyContextMenu,
    selectionFilter,
    setSelectionFilter
} from './interaction_handlers.js';
import {
    applyNodeConstraints,
    clearNodeConstraints
} from './constraints_manager.js';
import {
    addPointLoad,
    addDistributedLoad,
    addPressureLoad,
    clearLoadsFromBeams,
    clearLoadsFromPlates
} from './loads_manager.js';
import {
    extractStructureData,
    getStructureJSON
} from './structure_exporter.js';
import {
    generateMesh
} from './meshing_manager.js';

// Global scene data
let sceneData = null;
let cameraControls = null;
let animationId = null;
let isFullyInitialized = false;

// Modal/UI state
let isModalOpen = false;

// Camera interaction state
let isDragging = false;
let isPanning = false;
let previousMousePosition = { x: 0, y: 0 };
let mouseDownPos = { x: 0, y: 0 };
let hasMoved = false;

/**
 * Initialize Three.js canvas
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<void>}
 */
export async function init_three_canvas(canvas) {
    if (!canvas) {
        throw new Error('Canvas element not provided');
    }

    // Initialize scene
    sceneData = initializeScene(canvas);
    cameraControls = initializeCameraControls(sceneData.camera);
    
    // Store controls in sceneData for easy access
    sceneData.controls = cameraControls;
    
    // Expose sceneData globally for analysis
    window.sceneData = sceneData;
    
    // Expose extractStructureData globally
    window.extractStructureData = extractStructureData;
    window.getStructureJSON = getStructureJSON;
    window.applyNodeConstraints = applyNodeConstraints;
    window.addPointLoad = addPointLoad;
    window.addDistributedLoad = addDistributedLoad;
    window.generateMesh = generateMesh;
    if (window.registerAnalysisResultsHandler) {
        window.registerAnalysisResultsHandler(updateAnalysisResults);
    } else {
        window.updateAnalysisResults = updateAnalysisResults;
    }

    // Set selection highlights group for geometry manager and interaction handlers
    setSelectionHighlightsGroup(sceneData.selectionHighlights);
    setInteractionHighlightsGroup(sceneData.selectionHighlights);

    // Setup event listeners
    setupEventListeners(canvas);

    // Setup resize observer
    setupResizeObserver(canvas);

    // Start animation loop
    animate();

    // Mark as fully initialized
    isFullyInitialized = true;
    console.log('Three.js canvas fully initialized');

    // Expose functions globally for toolbar access
    window.toggleAddNodeMode = toggleAddNodeMode;
    window.toggleSelectNodeMode = toggleSelectNodeMode;
    window.toggleDrawBeamMode = toggleDrawBeamMode;
    window.toggleDrawPlateMode = toggleDrawPlateMode;
    window.selectAllNodes = selectAllNodes;
    window.clearNodeSelection = clearNodeSelection;
    window.deleteSelected = deleteSelected;
    window.extrudeBeams = extrudeBeams;
    window.undoLastAction = undoLastAction;
    window.startCopyElements = startCopyElements;
    window.setSelectionFilter = setSelectionFilter;
    window.setViewportView = (view) => setViewportView(sceneData.camera, cameraControls, view);
    window.setModalOpen = (open) => { isModalOpen = open; };
    window.modes = modes;
    
    // Expose camera view functions
    window.setPlanView = setPlanView;
    window.resetView = resetView;
    window.getViewMode = getViewMode;
    window.get2DElevation = get2DElevation;
    window.generateMesh = (type, size) => generateMesh(type, size, sceneData);
    
    // Expose grid and axes toggle functions
    window.toggleViewportGrid = (visible) => {
        if (sceneData && sceneData.majorGrid && sceneData.minorGrid) {
            sceneData.majorGrid.visible = visible;
            sceneData.minorGrid.visible = visible;
        }
    };
    window.toggleViewportAxes = (visible) => {
        if (sceneData && sceneData.axesGroup) {
            sceneData.axesGroup.visible = visible;
        }
    };
    
    // Expose constraint functions
    window.applyNodeConstraints = (constraintData) => {
        console.log('window.applyNodeConstraints called with:', constraintData);
        console.log('sceneData:', sceneData);
        console.log('selectedNodes:', sceneData ? sceneData.selectedNodes : 'no sceneData');
        if (sceneData) {
            applyNodeConstraints(constraintData, sceneData);
        } else {
            console.error('sceneData not available');
        }
    };
    window.clearNodeConstraints = () => {
        console.log('window.clearNodeConstraints called');
        if (sceneData) {
            clearNodeConstraints(sceneData);
        }
    };
    
    // Expose load functions
    window.applyPointLoad = (loadData) => {
        console.log('window.applyPointLoad called with:', loadData);
        console.log('selectedBeams:', selectedBeams, 'size:', selectedBeams.size);
        if (sceneData && selectedBeams.size > 0) {
            loadData.beamIds = Array.from(selectedBeams).map(b => b.uuid);
            addPointLoad(loadData, sceneData);
        } else {
            console.warn('No beams selected for point load');
        }
    };
    
    window.applyDistributedLoad = (loadData) => {
        console.log('window.applyDistributedLoad called with:', loadData);
        console.log('selectedBeams:', selectedBeams, 'size:', selectedBeams.size);
        if (sceneData && selectedBeams.size > 0) {
            loadData.beamIds = Array.from(selectedBeams).map(b => b.uuid);
            addDistributedLoad(loadData, sceneData);
        } else {
            console.warn('No beams selected for distributed load');
        }
    };

    window.applyPressureLoad = (loadData) => {
        console.log('=== window.applyPressureLoad called ===');
        console.log('loadData:', loadData);
        console.log('selectedPlates size:', selectedPlates.size);
        console.log('selectedElements size:', selectedElements.size);
        
        if (selectedElements.size > 0) {
            // Element-level loading
            loadData.targetType = 'element';
            loadData.elementIds = Array.from(selectedElements).map(el => el.uuid);
            console.log('Targeting specific elements:', loadData.elementIds.length);
            
            if (sceneData) {
                addPressureLoad(loadData, sceneData);
            }
        } else if (selectedPlates.size > 0) {
            // Plate-level loading
            loadData.targetType = 'plate';
            loadData.plateIds = Array.from(selectedPlates).map(p => p.uuid);
            console.log('Targeting whole plates:', loadData.plateIds.length);
            
            if (sceneData) {
                addPressureLoad(loadData, sceneData);
            }
        } else {
            console.warn('No selection found for pressure load');
        }
    };
    
    window.clearLoadsFromSelectedBeams = () => {
        console.log('clearLoadsFromSelectedBeams called');
        console.log('selectedBeams:', selectedBeams, 'size:', selectedBeams.size);
        if (sceneData && selectedBeams.size > 0) {
            const beamIds = Array.from(selectedBeams).map(b => b.uuid);
            clearLoadsFromBeams(beamIds, sceneData);
        } else {
            console.warn('No beams selected to clear loads from');
        }
    };

    window.clearLoadsFromSelectedPlates = () => {
        console.log('clearLoadsFromSelectedPlates called');
        
        const platesToClear = new Set();
        
        // Add directly selected plates
        selectedPlates.forEach(p => platesToClear.add(p));
        
        // Add parent plates of selected mesh elements
        selectedElements.forEach(el => {
            if (el.parent && el.parent.parent) {
                platesToClear.add(el.parent.parent);
            }
        });
        
        if (sceneData && platesToClear.size > 0) {
            const plateIds = Array.from(platesToClear).map(p => p.uuid);
            clearLoadsFromPlates(plateIds, sceneData);
        } else {
            console.warn('No plates selected to clear loads from');
        }
    };
    
    window.showPointLoadPanel = () => {
        console.log('showPointLoadPanel called');
        // This will be triggered from Rust side
        const event = new CustomEvent('togglePointLoadPanel');
        window.dispatchEvent(event);
    };
    
    window.showDistributedLoadPanel = () => {
        console.log('showDistributedLoadPanel called');
        // This will be triggered from Rust side
        const event = new CustomEvent('toggleDistributedLoadPanel');
        window.dispatchEvent(event);
    };
    
    // Expose structure export functions
    window.getStructureData = () => {
        console.log('getStructureData called');
        return extractStructureData(sceneData);
    };
    
    window.getStructureJSON = () => {
        console.log('getStructureJSON called');
        return getStructureJSON(sceneData);
    };

    // === Programmatic geometry creation helpers ===
    // These use the same THREE.js instance as the scene, avoiding version conflicts
    
    window.createNodeAtPosition = (x, y, z) => {
        if (!sceneData || !sceneData.nodesGroup) {
            console.error('Scene not initialized');
            return null;
        }
        const position = new THREE.Vector3(x, y, z);
        const node = createNode(sceneData.nodesGroup, position);
        return node;
    };
    
    window.createBeamBetweenNodes = (startNode, endNode) => {
        if (!sceneData || !sceneData.beamsGroup) {
            console.error('Scene not initialized');
            return null;
        }
        const beam = createBeam(sceneData.beamsGroup, startNode.position, endNode.position, startNode, endNode);
        return beam;
    };
    
    window.createConstraintSymbol = (node, constraintType) => {
        if (!sceneData || !sceneData.scene) {
            console.error('Scene not initialized');
            return null;
        }
        
        // Create constraint symbol group
        const symbolGroup = new THREE.Group();
        symbolGroup.userData.isConstraintSymbol = true;
        symbolGroup.userData.supportType = constraintType;
        
        // Create pinned support symbol (pyramid with tip pointing down)
        if (constraintType === 'pinned') {
            const pyramidGeom = new THREE.ConeGeometry(0.3, 0.4, 4);
            const pyramidMat = new THREE.MeshBasicMaterial({
                color: 0x33ff77  // Light green
            });
            const pyramid = new THREE.Mesh(pyramidGeom, pyramidMat);
            pyramid.position.y = -0.2;
            pyramid.rotation.y = Math.PI / 4; // Rotate 45 degrees for square base
            symbolGroup.add(pyramid);
        } else if (constraintType === 'fixed') {
            // Create fixed support (box with hatching)
            const boxGeom = new THREE.BoxGeometry(0.5, 0.15, 0.5);
            const boxMat = new THREE.MeshBasicMaterial({
                color: 0xff3333  // Red
            });
            const box = new THREE.Mesh(boxGeom, boxMat);
            box.position.y = -0.075;
            symbolGroup.add(box);
        }
        
        symbolGroup.position.copy(node.position);
        sceneData.scene.add(symbolGroup);
        
        // Store constraint data on node
        node.userData.supportType = constraintType;
        node.userData.constraints = {
            dx: true, dy: true, dz: true,
            rx: constraintType === 'fixed', 
            ry: constraintType === 'fixed', 
            rz: constraintType === 'fixed',
            kx: 0, ky: 0, kz: 0
        };
        
        return symbolGroup;
    };
    
    window.clearAllGeometry = () => {
        if (!sceneData) {
            console.error('Scene not initialized');
            return;
        }
        
        // Clear nodes
        while (sceneData.nodesGroup.children.length > 0) {
            const node = sceneData.nodesGroup.children[0];
            sceneData.nodesGroup.remove(node);
            if (node.geometry) node.geometry.dispose();
            if (node.material) node.material.dispose();
        }
        
        // Clear beams
        while (sceneData.beamsGroup.children.length > 0) {
            const beam = sceneData.beamsGroup.children[0];
            sceneData.beamsGroup.remove(beam);
            if (beam.geometry) beam.geometry.dispose();
            if (beam.material) beam.material.dispose();
        }
        
        // Clear plates
        while (sceneData.platesGroup.children.length > 0) {
            const plate = sceneData.platesGroup.children[0];
            sceneData.platesGroup.remove(plate);
            plate.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }
        
        // Clear constraint symbols from scene
        const toRemove = [];
        sceneData.scene.children.forEach(child => {
            if (child.type === 'Group' && child.userData && (child.userData.isConstraintSymbol || child.userData.supportType)) {
                toRemove.push(child);
            }
        });
        toRemove.forEach(obj => {
            sceneData.scene.remove(obj);
            obj.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        });
        
        console.log('All geometry cleared');
    };
    
    window.createPlateFromNodes = (nodeArray) => {
        if (!sceneData || !sceneData.platesGroup) {
            console.error('Scene not initialized');
            return null;
        }
        if (nodeArray.length < 3) {
            console.error('Need at least 3 nodes to create a plate');
            return null;
        }
        const plate = createPlateMesh(nodeArray, sceneData.platesGroup);
        return plate;
    };

    // Set initial cursor state
    updateCursor();

    console.log('Three.js canvas initialized');
}

/**
 * Setup mouse and wheel event listeners
 * @param {HTMLCanvasElement} canvas
 */
function setupEventListeners(canvas) {
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKeyDown);
}

/**
 * Keyboard handler
 * @param {KeyboardEvent} e
 */
function onKeyDown(e) {
    // Undo: Ctrl+Z
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoLastAction();
        return;
    }

    // Delete: Delete or Backspace
    if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
        return;
    }

    if (modes.drawPlate) {
        if (e.key === 'Enter') {
            completePlate(sceneData);
        } else if (e.key === 'Escape') {
            cancelPlateDrawing(sceneData.scene);
        }
    }
}

/**
 * Setup resize observer for canvas
 * @param {HTMLCanvasElement} canvas
 */
function setupResizeObserver(canvas) {
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const width = entry.contentRect.width;
            const height = entry.contentRect.height;
            sceneData.camera.aspect = width / height;
            sceneData.camera.updateProjectionMatrix();
            sceneData.renderer.setSize(width, height);
            
            // Reset mouse tracking on resize
            isDragging = false;
            isPanning = false;
            if (sceneData.highlight) {
                sceneData.highlight.visible = false;
            }
        }
    });
    resizeObserver.observe(canvas);
}

/**
 * Mouse down handler
 * @param {MouseEvent} e
 */
function onMouseDown(e) {
    if (e.button === 0) {
        if (!modes.addNode && !modes.selectNode && !modes.drawBeam && !modes.drawPlate) {
            isDragging = true;
        } else if (modes.selectNode) {
            // Start box selection in select mode
            startBoxSelection(e, sceneData.renderer.domElement);
        }
    } else if (e.button === 1 || e.button === 2) {
        isPanning = true;
        e.preventDefault();
    }
    
    previousMousePosition = { x: e.clientX, y: e.clientY };
    
    if (modes.addNode || modes.selectNode || modes.drawBeam || modes.drawPlate) {
        mouseDownPos = { x: e.clientX, y: e.clientY };
        hasMoved = false;
    }
}

/**
 * Mouse move handler
 * @param {MouseEvent} e
 */
function onMouseMove(e) {
    const canvas = sceneData.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    sceneData.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    sceneData.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update box selection if active
    updateBoxSelection(e);
    
    // Handle mode-specific hover
    if (modes.copyFromPoint && !isDragging && !isPanning) {
        handleCopyFromPointMove(sceneData);
    } else if (modes.selectNode && !isDragging && !isPanning) {
        handleSelectModeMove({ ...sceneData, canvas });
    } else if (modes.drawBeam && !isDragging && !isPanning) {
        handleDrawBeamModeMove({ ...sceneData, canvas });
    } else if (modes.drawPlate && !isDragging && !isPanning) {
        handleDrawPlateModeMove({ ...sceneData, canvas });
    } else if (modes.addNode && !isDragging && !isPanning) {
        handleAddNodeModeMove(sceneData);
    } else {
        sceneData.hoverHighlight.visible = false;
        sceneData.beamHoverHighlight.visible = false;
    }
    
    // Handle camera controls
    if (isDragging || isPanning) {
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;

        if (isDragging) {
            const rotationSpeed = 0.005;
            cameraControls.spherical.theta -= deltaX * rotationSpeed;
            cameraControls.spherical.phi -= deltaY * rotationSpeed;
            cameraControls.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraControls.spherical.phi));
            cameraControls.offset.setFromSpherical(cameraControls.spherical);
            sceneData.camera.position.copy(cameraControls.target).add(cameraControls.offset);
            sceneData.camera.lookAt(cameraControls.target);
        } else if (isPanning) {
            const panSpeed = 0.002;
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(sceneData.camera.quaternion);
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(sceneData.camera.quaternion);
            const distance = sceneData.camera.position.distanceTo(cameraControls.target);
            const panOffset = new THREE.Vector3();
            panOffset.addScaledVector(right, -deltaX * panSpeed * distance);
            panOffset.addScaledVector(up, deltaY * panSpeed * distance);
            cameraControls.target.add(panOffset);
            sceneData.camera.position.add(panOffset);
            cameraControls.offset.copy(sceneData.camera.position).sub(cameraControls.target);
            cameraControls.spherical.setFromVector3(cameraControls.offset);
        }
        
        previousMousePosition = { x: e.clientX, y: e.clientY };
        
        if (modes.addNode || modes.selectNode || modes.drawBeam || modes.drawPlate) {
            hasMoved = true;
            sceneData.highlight.visible = false;
        }
    }
}

/**
 * Mouse up handler
 */
function onMouseUp() {
    isDragging = false;
    isPanning = false;
}

/**
 * Click handler
 * @param {MouseEvent} e
 */
function onClick(e) {
    // Handle box selection end first
    if (modes.selectNode) {
        endBoxSelection(e, sceneData);
    }
    
    const moved = Math.abs(e.clientX - mouseDownPos.x) > 5 || 
                 Math.abs(e.clientY - mouseDownPos.y) > 5;
    
    if (moved || hasMoved) {
        hasMoved = false;
        isDragging = false;
        isPanning = false;
        return;
    }
    
    const canvas = sceneData.renderer.domElement;
    
    console.log('Click event - modes:', {
        copyFromPoint: modes.copyFromPoint,
        addNode: modes.addNode,
        selectNode: modes.selectNode,
        drawBeam: modes.drawBeam,
        drawPlate: modes.drawPlate
    });
    
    if (modes.copyFromPoint) {
        console.log('Calling handleCopyFromPointClick');
        handleCopyFromPointClick(sceneData);
    } else if (modes.addNode) {
        handleAddNodeClick({ ...sceneData, canvas }, e);
    } else if (modes.selectNode) {
        handleSelectClick();
    } else if (modes.drawBeam) {
        handleDrawBeamClick(sceneData);
    } else if (modes.drawPlate) {
        handleDrawPlateClick(sceneData);
    }
    
    isDragging = false;
    isPanning = false;
}

/**
 * Context menu (right-click) handler
 * @param {MouseEvent} e
 */
function onContextMenu(e) {
    e.preventDefault();
    
    console.log('Context menu triggered:', {
        selectMode: modes.selectNode,
        copyMode: modes.copyFromPoint,
        hasSceneData: !!sceneData,
        selectedBeamsCount: selectedBeams.size,
        selectedNodesCount: selectedNodes.size
    });
    
    // Cancel copy mode on right-click
    if (modes.copyFromPoint) {
        console.log('Cancelling copy mode');
        cancelCopyFromPoint(sceneData);
        return;
    }
    
    // Show context menu if beams are selected (regardless of mode)
    if (sceneData && selectedBeams.size > 0) {
        console.log('Showing copy context menu for selected beams');
        showCopyContextMenu(e.clientX, e.clientY, sceneData);
    }
}

/**
 * Mouse wheel handler
 * @param {WheelEvent} e
 */
function onWheel(e) {
    e.preventDefault();
    const zoomSpeed = 0.02;
    const delta = e.deltaY * zoomSpeed;
    cameraControls.spherical.radius = Math.max(1, Math.min(200, cameraControls.spherical.radius + delta));
    cameraControls.offset.setFromSpherical(cameraControls.spherical);
    sceneData.camera.position.copy(cameraControls.target).add(cameraControls.offset);
}

/**
 * Animation loop
 */
function animate() {
    sceneData.renderer.render(sceneData.scene, sceneData.camera);
    animationId = requestAnimationFrame(animate);
}

/**
 * Exported mode toggle functions
 */
export function toggleAddNodeMode() {
    const result = _toggleAddNodeMode(sceneData.scene);
    // Hide all highlights when toggling off
    if (!result) {
        sceneData.highlight.visible = false;
        sceneData.hoverHighlight.visible = false;
        sceneData.beamHoverHighlight.visible = false;
    }
    return result;
}

export function toggleSelectNodeMode() {
    const result = _toggleSelectNodeMode(sceneData.scene);
    // Hide add node highlight when entering select mode
    if (result) {
        sceneData.highlight.visible = false;
    } else {
        sceneData.hoverHighlight.visible = false;
        sceneData.beamHoverHighlight.visible = false;
    }
    return result;
}

export function toggleDrawBeamMode() {
    const result = _toggleDrawBeamMode(sceneData.scene);
    // Hide highlights when toggling off
    if (!result) {
        sceneData.highlight.visible = false;
        sceneData.hoverHighlight.visible = false;
        sceneData.beamHoverHighlight.visible = false;
    }
    return result;
}

export function toggleDrawPlateMode() {
    const result = _toggleDrawPlateMode(sceneData.scene);
    // Hide highlights when toggling off
    if (!result) {
        sceneData.highlight.visible = false;
        sceneData.hoverHighlight.visible = false;
        sceneData.beamHoverHighlight.visible = false;
    }
    return result;
}

/**
 * Exported selection functions
 */
export function selectAllNodes() {
    selectAll(sceneData.nodesGroup, sceneData.beamsGroup, sceneData.platesGroup, selectionFilter);
}

export function clearNodeSelection() {
    clearSelection();
}

export function deleteSelected() {
    deleteSelectedGeometry(sceneData.nodesGroup, sceneData.beamsGroup, sceneData.platesGroup);
}

/**
 * Extrude selected nodes in specified direction
 * @param {string} direction
 * @param {number} length
 */
export function extrudeBeams(direction, length) {
    extrudeBeamsGeometry(sceneData.nodesGroup, sceneData.beamsGroup, direction, length);
}

/**
 * Undo the last action
 */
export function undoLastAction() {
    undoLastActionGeometry(sceneData.nodesGroup, sceneData.beamsGroup);
}

/**
 * Start copy elements mode - prompts user to select base node
 */
export function startCopyElements() {
    console.log('startCopyElements called', {
        selectedBeamsCount: selectedBeams.size,
        selectedNodesCount: selectedNodes.size,
        selectedPlatesCount: selectedPlates.size
    });
    
    if (selectedBeams.size === 0 && selectedNodes.size === 0 && selectedPlates.size === 0) {
        console.warn('No elements selected to copy');
        alert('Please select beams, plates, or nodes first before copying');
        return;
    }
    
    if (selectedBeams.size === 0 && selectedPlates.size === 0) {
        console.warn('Only nodes selected, but copying requires beams or plates');
        alert('Please select beams or plates to copy (nodes alone cannot be copied)');
        return;
    }
    
    console.log('Copy elements mode started - click a node to use as reference point');
    alert('Click a node to use as the reference point for copying');
    
    // Ensure we're in select mode to pick a node
    if (!modes.selectNode) {
        toggleSelectNodeMode();
    }
    
    // Wait for next node click
    const pickBaseNode = (e) => {
        if (e.button !== 0) return; // Only left click
        
        const canvas = sceneData.renderer.domElement;
        const rect = canvas.getBoundingClientRect();
        sceneData.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        sceneData.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        
        sceneData.raycaster.setFromCamera(sceneData.mouse, sceneData.camera);
        
        // Check for node intersection
        const intersects = sceneData.raycaster.intersectObjects(sceneData.nodesGroup.children);
        
        if (intersects.length > 0) {
            const baseNode = intersects[0].object;
            console.log('Base node selected:', baseNode);
            
            // Start copy from point mode
            import('./interaction_handlers.js').then(module => {
                module.startCopyFromPoint(baseNode, sceneData);
            });
            
            // Remove this listener
            canvas.removeEventListener('click', pickBaseNode);
        }
    };
    
    sceneData.renderer.domElement.addEventListener('click', pickBaseNode);
}

// Store original perspective camera and create orthographic camera for 2D mode
let perspectiveCamera = null;
let orthographicCamera = null;
let currentViewMode = '3D'; // '3D' or '2D'
let current2DElevation = 0;

/**
 * Initialize orthographic camera for 2D plan view
 */
function initOrthographicCamera() {
    if (!sceneData || !sceneData.camera) return null;
    
    const aspect = sceneData.camera.aspect;
    const frustumSize = 30; // Size of orthographic view
    
    const orthoCamera = new THREE.OrthographicCamera(
        frustumSize * aspect / -2,
        frustumSize * aspect / 2,
        frustumSize / 2,
        frustumSize / -2,
        0.1,
        1000
    );
    
    return orthoCamera;
}

/**
 * Switch to 2D plan view mode at specified elevation
 * @param {number} elevation - Y-coordinate elevation to focus on
 */
export function setPlanView(elevation) {
    if (!isFullyInitialized || !sceneData || !sceneData.camera) {
        console.warn('Scene not fully initialized yet, retrying in 200ms...');
        setTimeout(() => setPlanView(elevation), 200);
        return;
    }
    
    console.log(`Switching to 2D plan view at elevation ${elevation}m`);
    
    // Store perspective camera if not already stored
    if (!perspectiveCamera) {
        perspectiveCamera = sceneData.camera;
    }
    
    // Create orthographic camera if needed
    if (!orthographicCamera) {
        orthographicCamera = initOrthographicCamera();
    }
    
    // Update orthographic camera aspect ratio
    const aspect = perspectiveCamera.aspect;
    const frustumSize = 30;
    orthographicCamera.left = frustumSize * aspect / -2;
    orthographicCamera.right = frustumSize * aspect / 2;
    orthographicCamera.top = frustumSize / 2;
    orthographicCamera.bottom = frustumSize / -2;
    orthographicCamera.updateProjectionMatrix();
    
    // Position orthographic camera looking straight down at elevation
    orthographicCamera.position.set(0, elevation + 50, 0);
    orthographicCamera.lookAt(0, elevation, 0);
    orthographicCamera.up.set(0, 0, -1); // Make -Z point up in screen space
    
    // Switch to orthographic camera
    sceneData.camera = orthographicCamera;
    currentViewMode = '2D';
    current2DElevation = elevation;
    
    // Update grid plane to be at this elevation
    if (sceneData.gridPlane) {
        sceneData.gridPlane.constant = -elevation; // Plane equation: normal·point + constant = 0
    }
    
    // Update controls target
    if (sceneData.controls) {
        sceneData.controls.target.set(0, elevation, 0);
    }
    cameraControls.target.set(0, elevation, 0);
    
    // Show reference plane at this elevation
    if (sceneData.referencePlane) {
        sceneData.referencePlane.position.y = elevation;
        sceneData.referencePlane.visible = true;
    }
    
    console.log('Switched to 2D orthographic view');
}

/**
 * Switch back to 3D perspective view
 */
export function resetView() {
    if (!isFullyInitialized || !sceneData) {
        console.warn('Scene not fully initialized yet, retrying in 200ms...');
        setTimeout(() => resetView(), 200);
        return;
    }
    
    console.log('Switching back to 3D perspective view');
    
    // Restore perspective camera
    if (perspectiveCamera) {
        sceneData.camera = perspectiveCamera;
        
        // Reset to default perspective view
        sceneData.camera.position.set(15, 15, 15);
        sceneData.camera.lookAt(0, 0, 0);
        sceneData.camera.up.set(0, 1, 0);
    }
    
    currentViewMode = '3D';
    
    // Reset grid plane to Y=0
    if (sceneData.gridPlane) {
        sceneData.gridPlane.constant = 0;
    }

    // Hide reference plane
    if (sceneData.referencePlane) {
        sceneData.referencePlane.visible = false;
    }
    
    // Reset controls target
    if (sceneData.controls) {
        sceneData.controls.target.set(0, 0, 0);
    }
    cameraControls.target.set(0, 0, 0);
    
    // Hide reference plane
    if (sceneData.referencePlane) {
        sceneData.referencePlane.visible = false;
    }
    
    console.log('Switched back to 3D perspective view');
}

/**
 * Get current view mode
 * @returns {string} '3D' or '2D'
 */
export function getViewMode() {
    return currentViewMode;
}

/**
 * Get current 2D elevation
 * @returns {number} Current elevation if in 2D mode
 */
export function get2DElevation() {
    return current2DElevation;
}

/**
 * Update analysis results visualization
 * @param {object} results - Analysis results from backend
 */
export function updateAnalysisResults(results) {
    console.log("Storing analysis results:", results);

    if (sceneData.resultsGroup) {
        sceneData.scene.remove(sceneData.resultsGroup);
        sceneData.resultsGroup = null;
    }

    window.analysisResults = results;
    sceneData.latestResults = results;
}

function visualizeDeformation(displacements, group) {
    // Scale factor for deformation (can be adjustable)
    const scaleFactor = 100.0; 
    
    const material = new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 2 });
    
    // Map node displacements
    const dispMap = new Map();
    displacements.forEach(d => {
        dispMap.set(d.node_id, new THREE.Vector3(d.dx, d.dy, d.dz));
    });
    
    // Draw deformed beams
    sceneData.beamsGroup.children.forEach(beam => {
        if (beam.userData && beam.userData.startNode && beam.userData.endNode) {
            const startNode = beam.userData.startNode;
            const endNode = beam.userData.endNode;
            
            // Find node IDs
            let startId = -1;
            let endId = -1;
            
            // This is inefficient, better to have a map
            sceneData.nodesGroup.children.forEach((n, idx) => {
                if (n === startNode) startId = idx;
                if (n === endNode) endId = idx;
            });
            
            if (startId !== -1 && endId !== -1) {
                const d1 = dispMap.get(startId) || new THREE.Vector3();
                const d2 = dispMap.get(endId) || new THREE.Vector3();
                
                const p1 = startNode.position.clone().add(d1.multiplyScalar(scaleFactor));
                const p2 = endNode.position.clone().add(d2.multiplyScalar(scaleFactor));
                
                const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
                const line = new THREE.Line(geometry, material);
                group.add(line);
            }
        }
    });
}

function visualizeReactions(reactions, group) {
    // Visualize reaction forces as arrows
    reactions.forEach(r => {
        const force = new THREE.Vector3(r.fx, r.fy, r.fz);
        const magnitude = force.length();
        
        if (magnitude > 1e-6) {
            const node = sceneData.nodesGroup.children[r.node_id];
            if (node) {
                const dir = force.clone().normalize();
                // Arrow points opposite to reaction (showing action on support)
                // Or same direction? Usually reaction points up.
                
                const arrowHelper = new THREE.ArrowHelper(
                    dir, 
                    node.position, 
                    1.0 + magnitude * 0.1, // Length
                    0xffff00 // Yellow
                );
                group.add(arrowHelper);
            }
        }
    });
}

/**
 * Cleanup resources
 */
export function cleanupCanvas() {
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    if (sceneData && sceneData.renderer) {
        sceneData.renderer.dispose();
    }
}