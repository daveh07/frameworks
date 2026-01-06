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
import {
    initLabels,
    toggleNodeLabels,
    toggleBeamLabels,
    togglePlateLabels,
    toggleMeshElementLabels,
    updateNodeLabels,
    updateBeamLabels,
    updatePlateLabels,
    updateMeshElementLabels
} from './labels_manager.js';
import {
    showBendingMomentDiagram,
    showShearForceDiagram,
    showDeformedShape,
    clearDiagrams,
    colorBeamsByStress,
    resetBeamColors,
    showBeamForcesSummary
} from './analysis_diagrams.js';

// Import FEA solver integration (attaches functions to window)
import '/js/fea_integration.js';

// Expose init entrypoint globally so the Rust wasm can call it without relying on
// wasm-bindgen-generated snippet module imports.
if (typeof window !== 'undefined' && !window.init_three_canvas) {
    window.init_three_canvas = init_three_canvas;
}

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
    
    // Initialize labels
    initLabels(sceneData.scene);
    
    // Expose sceneData globally for analysis
    window.sceneData = sceneData;
    
    // Expose selection sets globally for cross-module access
    window.selectedNodes = selectedNodes;
    window.selectedBeams = selectedBeams;
    window.selectedPlates = selectedPlates;
    window.selectedElements = selectedElements;
    
    // Expose extractStructureData globally
    window.extractStructureData = extractStructureData;
    window.getStructureJSON = getStructureJSON;
    
    // Expose label toggles
    window.toggleNodeLabels = (visible) => toggleNodeLabels(visible, sceneData.nodesGroup);
    window.toggleBeamLabels = (visible) => toggleBeamLabels(visible, sceneData.beamsGroup);
    window.togglePlateLabels = (visible) => togglePlateLabels(visible, sceneData.platesGroup);
    window.toggleMeshElementLabels = (visible) => toggleMeshElementLabels(visible, sceneData.meshElementsGroup, sceneData.platesGroup);
    
    // Expose nodes visibility toggle
    window.toggleNodesVisibility = (visible) => {
        if (sceneData && sceneData.nodesGroup) {
            sceneData.nodesGroup.visible = visible;
        }
    };
    
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
    
    // Expose mesh solid/wireframe mode toggle
    window.setMeshSolidMode = (solidMode) => {
        if (!sceneData) return;
        
        // Store the mode globally
        window.currentRenderMode = solidMode ? 'solid' : 'wireframe';
        
        // Update node colors based on mode
        if (sceneData.nodesGroup) {
            sceneData.nodesGroup.children.forEach(node => {
                if (node.material) {
                    if (solidMode) {
                        // Bright highlight green in solid mode - flat like supports
                        node.material.color.setHex(0x33ff77);
                        node.material.emissive.setHex(0x33ff77); // Same as color for flat look
                        node.material.emissiveIntensity = 1.0;
                        node.material.metalness = 0;
                        node.material.roughness = 1;
                    } else {
                        // Grey in wireframe mode
                        node.material.color.setHex(0xcccccc);
                        node.material.emissive.setHex(0x333333);
                        node.material.emissiveIntensity = 0.35;
                        node.material.metalness = 0.3;
                        node.material.roughness = 0.35;
                    }
                }
            });
        }
        
        if (solidMode) {
            // SOLID/RENDERED MODE - Show physical geometry
            createPhysicalGeometry(sceneData);
        } else {
            // WIREFRAME MODE - Remove physical geometry, show original
            removePhysicalGeometry(sceneData);
        }
        
        // Update mesh elements appearance
        if (sceneData.platesGroup) {
            sceneData.platesGroup.traverse((obj) => {
                if (obj.userData && obj.userData.isMeshElement) {
                    if (obj.material) {
                        if (solidMode) {
                            obj.material.opacity = 0.85;
                            obj.material.transparent = true;
                            obj.material.depthWrite = true;
                            obj.material.flatShading = true;
                            const baseColor = obj.userData.originalColor || 0x90caf9;
                            obj.material.color.setHex(baseColor);
                        } else {
                            obj.material.opacity = 0.15;
                            obj.material.transparent = true;
                            obj.material.depthWrite = false;
                            obj.material.flatShading = false;
                        }
                    }
                    obj.children.forEach(child => {
                        if (child.isLineSegments) {
                            if (solidMode) {
                                child.material.opacity = 0.9;
                                child.material.color.setHex(0x1a237e);
                            } else {
                                child.material.opacity = 0.5;
                                child.material.color.setHex(0x000000);
                            }
                        }
                    });
                }
            });
        }
        
        if (sceneData.meshElementsGroup) {
            sceneData.meshElementsGroup.traverse((obj) => {
                if (obj.userData && obj.userData.isMeshElement) {
                    if (obj.material) {
                        if (solidMode) {
                            obj.material.opacity = 0.85;
                            obj.material.transparent = true;
                            obj.material.depthWrite = true;
                            obj.material.flatShading = true;
                            const baseColor = obj.userData.originalColor || 0x90caf9;
                            obj.material.color.setHex(baseColor);
                        } else {
                            obj.material.opacity = 0.15;
                            obj.material.transparent = true;
                            obj.material.depthWrite = false;
                            obj.material.flatShading = false;
                        }
                    }
                    obj.children.forEach(child => {
                        if (child.isLineSegments) {
                            if (solidMode) {
                                child.material.opacity = 0.9;
                                child.material.color.setHex(0x1a237e);
                            } else {
                                child.material.opacity = 0.5;
                                child.material.color.setHex(0x000000);
                            }
                        }
                    });
                }
            });
        }
        
        console.log(`Mesh view mode: ${solidMode ? 'solid' : 'wireframe'}`);
    };
    
    /**
     * Create physical 3D geometry for beams and plates
     */
    function createPhysicalGeometry(sceneData) {
        // Remove existing physical geometry first
        removePhysicalGeometry(sceneData);
        
        // Create group for physical geometry
        const physicalGroup = new THREE.Group();
        physicalGroup.name = 'physicalGeometry';
        
        // Get beam section properties
        const beamSection = window.currentBeamSection || {
            section_type: 'Rectangular',
            width: 0.3,
            height: 0.5,
            flange_thickness: 0.02,
            web_thickness: 0.015
        };
        
        // Get plate thickness
        const plateThickness = window.currentPlateThickness || 0.2;
        
        // Material for rendered beams
        const beamRenderMat = new THREE.MeshStandardMaterial({
            color: 0x607d8b, // Blue-grey steel color
            metalness: 0.6,
            roughness: 0.3,
            side: THREE.DoubleSide
        });
        
        // Material for rendered plates - concrete grey
        const plateRenderMat = new THREE.MeshStandardMaterial({
            color: 0xbdbdbd, // Light concrete grey
            metalness: 0.1,
            roughness: 0.8,
            side: THREE.DoubleSide
        });
        
        // Create physical beams
        sceneData.beamsGroup.children.forEach(beam => {
            if (!beam.userData.startNode || !beam.userData.endNode) return;
            
            const startPos = beam.userData.startNode.position;
            const endPos = beam.userData.endNode.position;
            const direction = new THREE.Vector3().subVectors(endPos, startPos);
            const beamLength = direction.length();
            
            let beamGeom;
            
            if (beamSection.section_type === 'I-Beam' || beamSection.section_type === 'IBeam') {
                // Create I-beam shape
                beamGeom = createIBeamGeometry(
                    beamLength,
                    beamSection.height,
                    beamSection.width,
                    beamSection.web_thickness,
                    beamSection.flange_thickness
                );
            } else if (beamSection.section_type === 'Circular') {
                // Circular section
                const radius = beamSection.width / 2;
                beamGeom = new THREE.CylinderGeometry(radius, radius, beamLength, 24);
            } else {
                // Rectangular section (default)
                beamGeom = createRectangularBeamGeometry(
                    beamLength,
                    beamSection.height,
                    beamSection.width
                );
            }
            
            const physicalBeam = new THREE.Mesh(beamGeom, beamRenderMat.clone());
            
            // Position at midpoint
            const midpoint = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
            physicalBeam.position.copy(midpoint);
            
            // Orient beam - need to keep section "upright" (depth vertical)
            const up = new THREE.Vector3(0, 1, 0);
            const dirNorm = direction.clone().normalize();
            
            // First, rotate from default Y-up to beam direction
            const quaternion = new THREE.Quaternion().setFromUnitVectors(up, dirNorm);
            physicalBeam.applyQuaternion(quaternion);
            
            // For non-vertical beams, we need to rotate about the beam axis to keep section upright
            // The section depth (height) should remain vertical after all rotations
            const isVertical = Math.abs(dirNorm.y) > 0.9;
            if (!isVertical) {
                // After the first rotation, the original X-axis (where section depth is) has moved
                // For X-spanning beams: original X → -Y (vertical) - OK
                // For Z-spanning beams: original X → X (horizontal) - WRONG, need correction
                // 
                // We want the section depth to always be in the global Y direction (vertical)
                // Calculate the rotation needed about the beam axis
                
                // The "up" direction after first quaternion rotation
                const currentUp = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
                
                // We want this to point as close to global Y as possible
                // Project global Y onto the plane perpendicular to beam direction
                const globalY = new THREE.Vector3(0, 1, 0);
                const projectedY = globalY.clone().sub(dirNorm.clone().multiplyScalar(globalY.dot(dirNorm))).normalize();
                
                // Calculate angle between currentUp and projectedY
                const angle = Math.acos(Math.max(-1, Math.min(1, currentUp.dot(projectedY))));
                
                // Determine sign of rotation using cross product
                const cross = new THREE.Vector3().crossVectors(currentUp, projectedY);
                const sign = cross.dot(dirNorm) > 0 ? 1 : -1;
                
                // Apply correction rotation about beam axis
                if (angle > 0.01) {  // Only if meaningful rotation needed
                    const correctionQuat = new THREE.Quaternion().setFromAxisAngle(dirNorm, sign * angle);
                    physicalBeam.applyQuaternion(correctionQuat);
                }
            }
            
            physicalBeam.userData.isPhysicalGeometry = true;
            physicalBeam.userData.sourceBeam = beam.uuid;
            
            // Add edges for visual definition
            const edges = new THREE.EdgesGeometry(beamGeom, 15);
            const edgeLines = new THREE.LineSegments(
                edges,
                new THREE.LineBasicMaterial({ color: 0x263238, opacity: 0.8, transparent: true })
            );
            physicalBeam.add(edgeLines);
            
            physicalGroup.add(physicalBeam);
            
            // Hide original beam
            beam.visible = false;
        });
        
        // Create physical plates with thickness
        sceneData.platesGroup.children.forEach(plate => {
            if (!plate.userData || plate.userData.isMeshElement) return;
            
            const thickness = plate.userData.thickness || plateThickness;
            const plateGeom = createThickPlateGeometry(plate, thickness);
            
            if (plateGeom) {
                const physicalPlate = new THREE.Mesh(plateGeom, plateRenderMat.clone());
                physicalPlate.userData.isPhysicalGeometry = true;
                physicalPlate.userData.sourcePlate = plate.uuid;
                
                // Add edges
                const edges = new THREE.EdgesGeometry(plateGeom, 15);
                const edgeLines = new THREE.LineSegments(
                    edges,
                    new THREE.LineBasicMaterial({ color: 0x263238, opacity: 0.8, transparent: true })
                );
                physicalPlate.add(edgeLines);
                
                physicalGroup.add(physicalPlate);
                
                // Hide original plate (but not mesh elements)
                plate.visible = false;
            }
        });
        
        sceneData.scene.add(physicalGroup);
        console.log('Physical geometry created');
    }
    
    /**
     * Remove physical geometry and restore original view
     */
    function removePhysicalGeometry(sceneData) {
        const existing = sceneData.scene.getObjectByName('physicalGeometry');
        if (existing) {
            existing.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(m => m.dispose());
                    } else {
                        obj.material.dispose();
                    }
                }
            });
            sceneData.scene.remove(existing);
        }
        
        // Restore original beam visibility
        sceneData.beamsGroup.children.forEach(beam => {
            beam.visible = true;
        });
        
        // Restore original plate visibility
        sceneData.platesGroup.children.forEach(plate => {
            if (!plate.userData || !plate.userData.isMeshElement) {
                plate.visible = true;
            }
        });
    }
    
    /**
     * Create rectangular beam geometry
     */
    function createRectangularBeamGeometry(length, height, width) {
        // Beam axis is local Y (aligned to the member direction).
        // For consistency with analysis conventions, treat `height` as section depth (vertical)
        // and `width` as the lateral breadth. In our rendering orientation, local X maps to
        // global vertical for common member directions, so put depth on X and breadth on Z.
        return new THREE.BoxGeometry(height, length, width);
    }
    
    /**
     * Create I-beam geometry using extrusion
     */
    function createIBeamGeometry(length, height, flangeWidth, webThickness, flangeThickness) {
        // Create I-beam cross-section shape
        const shape = new THREE.Shape();
        const hw = flangeWidth / 2;
        const hh = height / 2;
        const wt = webThickness / 2;
        const ft = flangeThickness;
        
        // Draw I-beam profile (centered at origin)
        // Top flange
        shape.moveTo(-hw, hh);
        shape.lineTo(hw, hh);
        shape.lineTo(hw, hh - ft);
        shape.lineTo(wt, hh - ft);
        // Web
        shape.lineTo(wt, -hh + ft);
        // Bottom flange
        shape.lineTo(hw, -hh + ft);
        shape.lineTo(hw, -hh);
        shape.lineTo(-hw, -hh);
        shape.lineTo(-hw, -hh + ft);
        shape.lineTo(-wt, -hh + ft);
        // Web other side
        shape.lineTo(-wt, hh - ft);
        shape.lineTo(-hw, hh - ft);
        shape.closePath();
        
        // Extrude settings
        const extrudeSettings = {
            steps: 1,
            depth: length,
            bevelEnabled: false
        };
        
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        // Center the geometry
        geometry.translate(0, -length / 2, 0);
        // Rotate so Y is along beam axis
        geometry.rotateX(Math.PI / 2);

        // Match the same convention as rectangular beams: section depth (height) should be
        // aligned with local X and flange width with local Z.
        geometry.rotateY(Math.PI / 2);
        
        return geometry;
    }
    
    /**
     * Create thick plate geometry from a flat plate
     * Uses separate vertices per face to avoid shading seams
     */
    function createThickPlateGeometry(plate, thickness) {
        if (!plate.geometry) return null;
        
        // Get the plate vertices
        const positions = plate.geometry.attributes.position;
        if (!positions) return null;
        
        // Get unique vertices (plates are usually quads or triangulated)
        const vertices = [];
        for (let i = 0; i < positions.count; i++) {
            const v = new THREE.Vector3(
                positions.getX(i),
                positions.getY(i),
                positions.getZ(i)
            );
            // Apply plate's world transform
            v.applyMatrix4(plate.matrixWorld);
            
            // Check if vertex already exists
            const exists = vertices.some(existing => existing.distanceTo(v) < 0.001);
            if (!exists) {
                vertices.push(v);
            }
        }
        
        if (vertices.length < 3) return null;
        
        // Calculate plate normal
        const v1 = new THREE.Vector3().subVectors(vertices[1], vertices[0]);
        const v2 = new THREE.Vector3().subVectors(vertices[2], vertices[0]);
        const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
        
        // Create offset for thickness
        const offset = normal.clone().multiplyScalar(thickness / 2);
        
        // Create top and bottom vertices
        const topVerts = vertices.map(v => v.clone().add(offset));
        const bottomVerts = vertices.map(v => v.clone().sub(offset));
        
        const n = vertices.length;
        
        // Use non-indexed geometry with separate vertices per face for flat shading
        const allPositions = [];
        const allNormals = [];
        
        // Top face - use fan triangulation with explicit normals
        const topNormal = normal.clone();
        for (let i = 1; i < n - 1; i++) {
            // Triangle: 0, i, i+1
            allPositions.push(topVerts[0].x, topVerts[0].y, topVerts[0].z);
            allPositions.push(topVerts[i].x, topVerts[i].y, topVerts[i].z);
            allPositions.push(topVerts[i+1].x, topVerts[i+1].y, topVerts[i+1].z);
            // Same normal for all vertices of this face
            allNormals.push(topNormal.x, topNormal.y, topNormal.z);
            allNormals.push(topNormal.x, topNormal.y, topNormal.z);
            allNormals.push(topNormal.x, topNormal.y, topNormal.z);
        }
        
        // Bottom face - reversed normal
        const bottomNormal = normal.clone().negate();
        for (let i = 1; i < n - 1; i++) {
            // Triangle: 0, i+1, i (reversed winding)
            allPositions.push(bottomVerts[0].x, bottomVerts[0].y, bottomVerts[0].z);
            allPositions.push(bottomVerts[i+1].x, bottomVerts[i+1].y, bottomVerts[i+1].z);
            allPositions.push(bottomVerts[i].x, bottomVerts[i].y, bottomVerts[i].z);
            allNormals.push(bottomNormal.x, bottomNormal.y, bottomNormal.z);
            allNormals.push(bottomNormal.x, bottomNormal.y, bottomNormal.z);
            allNormals.push(bottomNormal.x, bottomNormal.y, bottomNormal.z);
        }
        
        // Side faces - each side gets its own normal
        for (let i = 0; i < n; i++) {
            const next = (i + 1) % n;
            
            // Calculate side normal
            const edge = new THREE.Vector3().subVectors(vertices[next], vertices[i]);
            const sideNormal = new THREE.Vector3().crossVectors(edge, normal).normalize();
            
            // First triangle of quad
            allPositions.push(topVerts[i].x, topVerts[i].y, topVerts[i].z);
            allPositions.push(topVerts[next].x, topVerts[next].y, topVerts[next].z);
            allPositions.push(bottomVerts[next].x, bottomVerts[next].y, bottomVerts[next].z);
            allNormals.push(sideNormal.x, sideNormal.y, sideNormal.z);
            allNormals.push(sideNormal.x, sideNormal.y, sideNormal.z);
            allNormals.push(sideNormal.x, sideNormal.y, sideNormal.z);
            
            // Second triangle of quad
            allPositions.push(topVerts[i].x, topVerts[i].y, topVerts[i].z);
            allPositions.push(bottomVerts[next].x, bottomVerts[next].y, bottomVerts[next].z);
            allPositions.push(bottomVerts[i].x, bottomVerts[i].y, bottomVerts[i].z);
            allNormals.push(sideNormal.x, sideNormal.y, sideNormal.z);
            allNormals.push(sideNormal.x, sideNormal.y, sideNormal.z);
            allNormals.push(sideNormal.x, sideNormal.y, sideNormal.z);
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(allNormals, 3));
        
        return geometry;
    }
    
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
        const beams = window.selectedBeams || selectedBeams;
        console.log('selectedBeams:', beams, 'size:', beams.size);
        if (sceneData && beams.size > 0) {
            loadData.beamIds = Array.from(beams).map(b => b.uuid);
            addPointLoad(loadData, sceneData);
        } else {
            console.warn('No beams selected for point load');
        }
    };
    
    window.applyDistributedLoad = (loadData) => {
        console.log('window.applyDistributedLoad called with:', loadData);
        const beams = window.selectedBeams || selectedBeams;
        console.log('selectedBeams:', beams, 'size:', beams.size);
        if (sceneData && beams.size > 0) {
            loadData.beamIds = Array.from(beams).map(b => b.uuid);
            addDistributedLoad(loadData, sceneData);
        } else {
            console.warn('No beams selected for distributed load');
        }
    };

    window.applyPressureLoad = (loadData) => {
        console.log('=== window.applyPressureLoad called ===');
        console.log('loadData:', loadData);
        const plates = window.selectedPlates || selectedPlates;
        const elements = window.selectedElements || selectedElements;
        console.log('selectedPlates size:', plates.size);
        console.log('selectedElements size:', elements.size);
        
        if (elements.size > 0) {
            // Element-level loading
            loadData.targetType = 'element';
            loadData.elementIds = Array.from(elements).map(el => el.uuid);
            console.log('Targeting specific elements:', loadData.elementIds.length);
            
            if (sceneData) {
                addPressureLoad(loadData, sceneData);
            }
        } else if (plates.size > 0) {
            // Plate-level loading
            loadData.targetType = 'plate';
            loadData.plateIds = Array.from(plates).map(p => p.uuid);
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
        const beams = window.selectedBeams || selectedBeams;
        console.log('selectedBeams:', beams, 'size:', beams.size);
        if (sceneData && beams.size > 0) {
            const beamIds = Array.from(beams).map(b => b.uuid);
            clearLoadsFromBeams(beamIds, sceneData);
        } else {
            console.warn('No beams selected to clear loads from');
        }
    };

    window.clearLoadsFromSelectedPlates = () => {
        console.log('clearLoadsFromSelectedPlates called');
        const plates = window.selectedPlates || selectedPlates;
        const elements = window.selectedElements || selectedElements;
        
        const platesToClear = new Set();
        
        // Add directly selected plates
        plates.forEach(p => platesToClear.add(p));
        
        // Add parent plates of selected mesh elements
        elements.forEach(el => {
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
        if (!node) {
            console.log(`Cannot create node at (${x}, ${y}, ${z}): a node already exists at this location`);
        }
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
        
        // Create pinned support symbol (pyramid with tip pointing up)
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
            // Create fixed support (box with hatching) - 15% bigger
            const boxGeom = new THREE.BoxGeometry(0.575, 0.1725, 0.575);
            const boxMat = new THREE.MeshBasicMaterial({
                color: 0xff3333  // Red
            });
            const box = new THREE.Mesh(boxGeom, boxMat);
            box.position.y = -0.086;
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
    // Update billboard objects (pin supports) to face camera
    if (sceneData && sceneData.scene && sceneData.camera) {
        sceneData.scene.traverse((object) => {
            if (object.userData && object.userData.isBillboard) {
                // Make the object face the camera
                object.quaternion.copy(sceneData.camera.quaternion);
            }
        });
    }
    
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