// loads_manager.js - Manage structural loads on beams
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js';

// Get selectedBeams from global (set by three_canvas.js) to avoid module instance issues
function getSelectedBeams() {
    return window.selectedBeams || new Set();
}

// Store all loads on window to ensure single source of truth across module instances
// This fixes the issue where multiple ES module instances create separate Maps
if (!window.beamLoads) window.beamLoads = new Map();
if (!window.plateLoads) window.plateLoads = new Map();
if (!window.elementLoads) window.elementLoads = new Map();

// Use the global Maps
const beamLoads = window.beamLoads;
const plateLoads = window.plateLoads;
const elementLoads = window.elementLoads;

// Export for structure exporter
export { beamLoads, plateLoads, elementLoads };

// Store load visualizations: Map<loadId, THREE.Group>
const loadVisuals = new Map();

// Load counter for unique IDs
let loadIdCounter = 0;

/**
 * Add a point load to selected beams
 * @param {Object} loadData - { magnitude, direction: 'x'|'y'|'z', position: 0-1, beamIds: [] }
 * @param {Object} sceneData - Scene data
 */
export function addPointLoad(loadData, sceneData) {
    console.log('addPointLoad called with:', loadData);
    
    if (!loadData.beamIds || loadData.beamIds.length === 0) {
        console.warn('No beams specified for point load');
        return;
    }
    
    loadData.beamIds.forEach(beamId => {
        const load = {
            id: `PL_${loadIdCounter++}`,
            type: 'point',
            magnitude: parseFloat(loadData.magnitude) || 0,
            direction: loadData.direction || 'y',
            position: parseFloat(loadData.position) || 0.5, // Position along beam (0-1)
            beamId: beamId,
            color: loadData.color // Store user-selected color
        };
        
        // Store load data
        if (!beamLoads.has(beamId)) {
            beamLoads.set(beamId, []);
        }
        beamLoads.get(beamId).push(load);
        
        // Create visualization
        const beam = sceneData.beamsGroup.children.find(b => b.uuid === beamId);
        if (beam) {
            const visual = createPointLoadVisual(load, beam);
            loadVisuals.set(load.id, visual);
            sceneData.scene.add(visual);
        } else {
            console.warn('Beam not found for ID:', beamId);
        }
        
        console.log(`Added point load ${load.id} to beam ${beamId}`);
    });
    
    console.log('Total loads:', beamLoads.size, 'Total visuals:', loadVisuals.size);
}

/**
 * Add a pressure load to selected plates
 * @param {Object} loadData - { magnitude, beamIds: [] (actually plateIds) }
 * @param {Object} sceneData - Scene data
 */
export function addPressureLoad(loadData, sceneData) {
    console.log('addPressureLoad called with:', loadData);
    
    if (loadData.targetType === 'element' && loadData.elementIds) {
        console.log('Processing element loads...');
        loadData.elementIds.forEach(elId => {
            const load = {
                id: `PRL_EL_${loadIdCounter++}`,
                type: 'pressure_element',
                magnitude: parseFloat(loadData.magnitude) || 0,
                elementId: elId,
                color: loadData.color || 0xff0000
            };
            
            // Find the element mesh
            let foundElement = null;
            // Search in all plates -> meshElementsGroup -> elements
            for (const plate of sceneData.platesGroup.children) {
                const meshGroup = plate.children.find(c => c.userData.isMeshViz);
                if (meshGroup) {
                    const el = meshGroup.children.find(e => e.uuid === elId);
                    if (el) {
                        foundElement = el;
                        break;
                    }
                }
            }
            
            if (foundElement) {
                console.log('Found element mesh:', foundElement.uuid);
                
                // Store load data for element
                if (!elementLoads.has(elId)) {
                    elementLoads.set(elId, []);
                }
                elementLoads.get(elId).push(load);

                const visual = createPressureLoadVisual(load, foundElement);
                loadVisuals.set(load.id, visual);
                sceneData.scene.add(visual);
            } else {
                console.warn('Could not find element mesh for ID:', elId);
            }
        });
        return;
    }

    if (!loadData.plateIds || loadData.plateIds.length === 0) {
        console.warn('No plates specified for pressure load');
        return;
    }
    
    loadData.plateIds.forEach(plateId => {
        const load = {
            id: `PRL_${loadIdCounter++}`,
            type: 'pressure',
            magnitude: parseFloat(loadData.magnitude) || 0,
            plateId: plateId,
            color: loadData.color || 0xff0000 // Default red
        };
        
        // Store load data
        if (!plateLoads.has(plateId)) {
            plateLoads.set(plateId, []);
        }
        plateLoads.get(plateId).push(load);
        
        // Create visualization
        const plate = sceneData.platesGroup.children.find(p => p.uuid === plateId);
        console.log('Looking for plate:', plateId);
        console.log('Found plate:', plate);
        console.log('Available plates:', sceneData.platesGroup.children.map(p => ({uuid: p.uuid, type: p.type})));
        
        if (plate) {
            console.log('Creating visual for plate...');
            const visual = createPressureLoadVisual(load, plate);
            console.log('Visual created:', visual);
            console.log('Visual children count:', visual.children.length);
            loadVisuals.set(load.id, visual);
            sceneData.scene.add(visual);
            console.log('Visual added to scene');
        } else {
            console.warn('Plate not found for ID:', plateId);
        }
        
        console.log(`Added pressure load ${load.id} to plate ${plateId}`);
    });
}

/**
 * Add a distributed load (UDL) to selected beams
 * @param {Object} loadData - { magnitude, direction: 'x'|'y'|'z', startPos: 0-1, endPos: 0-1, beamIds: [] }
 * @param {Object} sceneData - Scene data
 */
export function addDistributedLoad(loadData, sceneData) {
    console.log('addDistributedLoad called with:', loadData);
    
    if (!loadData.beamIds || loadData.beamIds.length === 0) {
        console.warn('No beams specified for distributed load');
        return;
    }
    
    loadData.beamIds.forEach(beamId => {
        const load = {
            id: `UDL_${loadIdCounter++}`,
            type: 'distributed',
            magnitude: parseFloat(loadData.magnitude) || 0,
            direction: loadData.direction || 'y',
            startPos: parseFloat(loadData.startPos) || 0,
            endPos: parseFloat(loadData.endPos) || 1,
            beamId: beamId,
            color: loadData.color // Store user-selected color
        };
        
        // Store load data
        if (!beamLoads.has(beamId)) {
            beamLoads.set(beamId, []);
        }
        beamLoads.get(beamId).push(load);
        
        // Create visualization
        const beam = sceneData.beamsGroup.children.find(b => b.uuid === beamId);
        if (beam) {
            const visual = createDistributedLoadVisual(load, beam);
            loadVisuals.set(load.id, visual);
            sceneData.scene.add(visual);
        } else {
            console.warn('Beam not found for ID:', beamId);
        }
        
        console.log(`Added distributed load ${load.id} to beam ${beamId}`);
    });
    
    console.log('Total loads:', beamLoads.size, 'Total visuals:', loadVisuals.size);
}

/**
 * Clear all loads from selected beams
 * @param {Array<string>} beamIds - Array of beam UUIDs
 * @param {Object} sceneData - Scene data
 */
export function clearLoadsFromBeams(beamIds, sceneData) {
    beamIds.forEach(beamId => {
        const loads = beamLoads.get(beamId);
        if (loads) {
            // Remove visualizations
            loads.forEach(load => {
                const visual = loadVisuals.get(load.id);
                if (visual) {
                    sceneData.scene.remove(visual);
                    loadVisuals.delete(load.id);
                }
            });
            // Remove load data
            beamLoads.delete(beamId);
        }
    });
    
    console.log('Cleared loads from beams:', beamIds);
}

/**
 * Clear all loads from selected plates
 * @param {Array<string>} plateIds - Array of plate UUIDs
 * @param {Object} sceneData - Scene data
 */
export function clearLoadsFromPlates(plateIds, sceneData) {
    plateIds.forEach(plateId => {
        const loads = plateLoads.get(plateId);
        if (loads) {
            // Remove visualizations
            loads.forEach(load => {
                const visual = loadVisuals.get(load.id);
                if (visual) {
                    sceneData.scene.remove(visual);
                    loadVisuals.delete(load.id);
                }
            });
            // Remove load data
            plateLoads.delete(plateId);
        }
    });
    
    console.log('Cleared loads from plates:', plateIds);
}

/**
 * Create 3D arrow visualization for point load
 * @param {Object} load - Load data
 * @param {THREE.Mesh} beam - Beam mesh
 * @returns {THREE.Group}
 */
function createPointLoadVisual(load, beam) {
    const group = new THREE.Group();
    
    // Get beam start and end positions from its geometry
    // Beam is a cylinder positioned at midpoint, oriented along its axis
    const beamLength = beam.geometry.parameters.height;
    const beamMidpoint = beam.position.clone();
    
    // Get the beam's up direction (cylinder's Y axis after rotation)
    const beamDirection = new THREE.Vector3(0, 1, 0);
    beamDirection.applyQuaternion(beam.quaternion);
    
    // Calculate start and end positions
    const start = beamMidpoint.clone().sub(beamDirection.clone().multiplyScalar(beamLength / 2));
    const end = beamMidpoint.clone().add(beamDirection.clone().multiplyScalar(beamLength / 2));
    
    // Calculate position along beam
    const loadPosition = start.clone().lerp(end, load.position);
    
    // Determine arrow direction and color
    const direction = new THREE.Vector3();
    // Use custom color if provided, otherwise default based on magnitude sign
    const color = load.color ? parseInt(load.color.replace('#', '0x')) : 
                  (load.magnitude >= 0 ? 0xff0000 : 0x0000ff);
    
    switch(load.direction) {
        case 'x': direction.set(Math.sign(load.magnitude), 0, 0); break;
        case 'y': direction.set(0, Math.sign(load.magnitude), 0); break;
        case 'z': direction.set(0, 0, Math.sign(load.magnitude)); break;
    }
    
    // Create arrow - for negative loads, start from offset position to show arrow pointing down from above
    const arrowLength = Math.abs(load.magnitude) * 0.1; // Scale factor
    const arrowOrigin = loadPosition.clone();
    
    // For negative loads, offset the arrow start point in the opposite direction
    if (load.magnitude < 0) {
        arrowOrigin.add(direction.clone().negate().multiplyScalar(arrowLength));
    }
    
    const arrowHelper = new THREE.ArrowHelper(
        direction,
        arrowOrigin,
        arrowLength,
        color,
        arrowLength * 0.2, // Head length
        arrowLength * 0.15  // Head width
    );
    
    group.add(arrowHelper);
    group.position.set(0, 0, 0);
    
    // Add label with magnitude - solid dark text, offset from arrow
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 80;
    
    // Clear to fully transparent
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Solid dark text, bold weight
    context.fillStyle = '#1a1a1a';
    context.font = 'bold 42px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(`${load.magnitude.toFixed(1)} kN`, 128, 40);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true,
        depthTest: false 
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(0.6, 0.2, 1);
    // Offset label perpendicular to load direction to avoid arrow stem
    const labelOffset = new THREE.Vector3(0.4, 0, 0.3);
    if (load.direction === 'x') labelOffset.set(0, 0.4, 0.3);
    else if (load.direction === 'z') labelOffset.set(0.4, 0.3, 0);
    sprite.position.copy(loadPosition).add(labelOffset);
    sprite.renderOrder = 100;
    group.add(sprite);
    
    return group;
}

/**
 * Create distributed load visualization
 * @param {Object} load - Load data
 * @param {THREE.Mesh} beam - Beam mesh
 * @returns {THREE.Group}
 */
function createDistributedLoadVisual(load, beam) {
    const group = new THREE.Group();
    
    // Get beam start and end positions from its geometry
    const beamLength = beam.geometry.parameters.height;
    const beamMidpoint = beam.position.clone();
    
    // Get the beam's up direction (cylinder's Y axis after rotation)
    const beamDirection = new THREE.Vector3(0, 1, 0);
    beamDirection.applyQuaternion(beam.quaternion);
    
    // Calculate start and end positions
    const beamStart = beamMidpoint.clone().sub(beamDirection.clone().multiplyScalar(beamLength / 2));
    const beamEnd = beamMidpoint.clone().add(beamDirection.clone().multiplyScalar(beamLength / 2));
    
    // Calculate load start and end positions along beam
    const loadStart = beamStart.clone().lerp(beamEnd, load.startPos);
    const loadEnd = beamStart.clone().lerp(beamEnd, load.endPos);
    
    // Determine direction
    const direction = new THREE.Vector3();
    // Use custom color if provided, otherwise default based on magnitude sign
    const color = load.color ? parseInt(load.color.replace('#', '0x')) : 
                  (load.magnitude >= 0 ? 0xff6600 : 0x0066ff);
    
    switch(load.direction) {
        case 'x': direction.set(Math.sign(load.magnitude), 0, 0); break;
        case 'y': direction.set(0, Math.sign(load.magnitude), 0); break;
        case 'z': direction.set(0, 0, Math.sign(load.magnitude)); break;
    }
    
    // Create multiple arrows along the distributed load
    const numArrows = 5;
    const arrowLength = Math.abs(load.magnitude) * 0.08;
    
    for (let i = 0; i <= numArrows; i++) {
        const t = i / numArrows;
        const arrowPos = loadStart.clone().lerp(loadEnd, t);
        
        // For negative loads, offset the arrow start point
        const arrowOrigin = arrowPos.clone();
        if (load.magnitude < 0) {
            arrowOrigin.add(direction.clone().negate().multiplyScalar(arrowLength));
        }
        
        const arrowHelper = new THREE.ArrowHelper(
            direction,
            arrowOrigin,
            arrowLength,
            color,
            arrowLength * 0.2,
            arrowLength * 0.15
        );
        
        group.add(arrowHelper);
    }
    
    // Draw line connecting arrow origins (for negative) or tips (for positive)
    const linePoints = [];
    for (let i = 0; i <= numArrows; i++) {
        const t = i / numArrows;
        const arrowPos = loadStart.clone().lerp(loadEnd, t);
        
        // For negative loads, line connects the starting points (above beam)
        // For positive loads, line connects the tips (above beam)
        let linePoint;
        if (load.magnitude < 0) {
            // Starting point of arrow (above beam)
            linePoint = arrowPos.clone().add(direction.clone().negate().multiplyScalar(arrowLength));
        } else {
            // Tip of arrow (above beam)
            linePoint = arrowPos.clone().add(direction.clone().multiplyScalar(arrowLength));
        }
        linePoints.push(linePoint);
    }
    
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    const lineMaterial = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    group.add(line);
    
    // Add label - solid dark text, offset from arrows
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 280;
    canvas.height = 80;
    
    // Clear to fully transparent
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Solid dark text, bold weight
    context.fillStyle = '#1a1a1a';
    context.font = 'bold 38px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(`${load.magnitude.toFixed(1)} kN/m`, 140, 40);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true,
        depthTest: false 
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(0.7, 0.2, 1);
    const midPoint = loadStart.clone().lerp(loadEnd, 0.5);
    // Offset label perpendicular to load direction to avoid arrow stems
    const labelOffset = new THREE.Vector3(0.5, 0, 0.4);
    if (load.direction === 'x') labelOffset.set(0, 0.5, 0.4);
    else if (load.direction === 'z') labelOffset.set(0.5, 0.4, 0);
    sprite.position.copy(midPoint).add(labelOffset);
    sprite.renderOrder = 100;
    group.add(sprite);
    
    group.position.set(0, 0, 0);
    
    return group;
}

/**
 * Create visualization for a pressure load
 * @param {Object} load 
 * @param {THREE.Mesh} plate 
 * @returns {THREE.Group}
 */
function createPressureLoadVisual(load, plate) {
    console.log(`Creating pressure load visual for plate ${plate.uuid}`);
    
    const group = new THREE.Group();
    group.userData.isLoad = true;
    group.userData.loadId = load.id;
    
    // Parse color safely - handle string '#rrggbb', number 0xrrggbb, or use default red
    let color = 0xff0000;
    if (load.color) {
        if (typeof load.color === 'string') {
            color = parseInt(load.color.replace('#', ''), 16);
        } else if (typeof load.color === 'number') {
            color = load.color;
        }
    }
    console.log(`Pressure load color: ${color.toString(16)}`);
    
    // Ensure plate matrix world is updated
    plate.updateMatrixWorld(true);
    
    // 1. Create Shaded Rectangle (Overlay)
    // We clone the geometry and apply the plate's world matrix to it.
    // This transforms the vertices into World Space.
    // Handle case where plate might be a Group with child meshes
    let geometry = null;
    if (plate.geometry) {
        geometry = plate.geometry.clone();
        geometry.applyMatrix4(plate.matrixWorld);
    } else if (plate.children) {
        // Find first child mesh with geometry
        const childMesh = plate.children.find(c => c.isMesh && c.geometry);
        if (childMesh) {
            childMesh.updateMatrixWorld(true);
            geometry = childMesh.geometry.clone();
            geometry.applyMatrix4(childMesh.matrixWorld);
            console.log('Using geometry from child mesh');
        }
    }
    
    if (!geometry || !geometry.attributes || !geometry.attributes.position) {
        console.error('Plate has no geometry or no position attribute - cannot create pressure visual');
        return group; // Return empty group
    }
    
    // Calculate normal in world space using the transformed geometry
    geometry.computeVertexNormals();
    const positions = geometry.attributes.position.array;
    
    // Calculate normal from first triangle (assuming planar)
    const p0 = new THREE.Vector3(positions[0], positions[1], positions[2]);
    const p1 = new THREE.Vector3(positions[3], positions[4], positions[5]);
    const p2 = new THREE.Vector3(positions[6], positions[7], positions[8]);
    const v1 = new THREE.Vector3().subVectors(p1, p0);
    const v2 = new THREE.Vector3().subVectors(p2, p0);
    let normal = new THREE.Vector3().crossVectors(v1, v2).normalize();

    // FIX: Ensure normal points "up" for horizontal slabs
    // If the normal points significantly down, flip it.
    // This assumes the user wants the visualization on the "top" of the floor.
    if (normal.y < -0.1) {
        normal.negate();
    }
    
    // 1. Create Volume Visualization (Filled Cube Space)
    // We want to extrude the plate geometry along the normal to create a volume.
    // Height of extrusion corresponds to the visual length of the load.
    const height = 0.8;
    
    // Determine extrusion direction based on load sign
    // Push (Mag > 0): Force is INTO surface. Visual should be ABOVE surface (opposite to push).
    // Pull (Mag < 0): Force is OUT of surface. Visual should be ABOVE surface (same as pull).
    // So in both cases, we draw the volume "above" the surface (along the normal).
    const extrusionVec = normal.clone().multiplyScalar(height);
    
    // Create custom geometry for the volume
    const volumeGeometry = new THREE.BufferGeometry();
    const volVertices = [];
    const volIndices = [];
    
    // Get unique vertices in order (perimeter)
    // Since createPlateMesh uses ordered nodes, the positions array (or unique points) should be ordered.
    // However, positions array is triangles.
    // For a Quad (0,1,2, 0,2,3), the perimeter is 0-1-2-3.
    // Let's extract unique points and assume they form the perimeter in order.
    // This is true for the Quads generated by meshing_manager.
    
    const uniquePoints = [];
    for(let i=0; i<positions.length; i+=3) {
        const v = new THREE.Vector3(positions[i], positions[i+1], positions[i+2]);
        let found = false;
        for(const p of uniquePoints) {
            if(p.distanceTo(v) < 0.001) {
                found = true;
                break;
            }
        }
        if(!found) uniquePoints.push(v);
    }
    
    // Add vertices to volume geometry
    // First N vertices: Base (at surface + small offset)
    // Next N vertices: Top (at surface + height)
    const baseOffset = normal.clone().multiplyScalar(0.02); // Small offset to be "above" plate
    
    uniquePoints.forEach(p => {
        const base = p.clone().add(baseOffset);
        volVertices.push(base.x, base.y, base.z);
    });
    
    uniquePoints.forEach(p => {
        const top = p.clone().add(baseOffset).add(extrusionVec);
        volVertices.push(top.x, top.y, top.z);
    });
    
    const N = uniquePoints.length;
    
    // Create Faces
    // 1. Top Face (using fan triangulation like original)
    for (let i = 1; i < N - 1; i++) {
        // Vertices are at index + N
        volIndices.push(N, N + i, N + i + 1);
    }
    
    // 2. Bottom Face (reversed winding)
    for (let i = 1; i < N - 1; i++) {
        volIndices.push(0, i + 1, i);
    }
    
    // 3. Side Faces (Quads -> 2 Triangles)
    for (let i = 0; i < N; i++) {
        const next = (i + 1) % N;
        // Quad: Base[i], Base[next], Top[next], Top[i]
        // Tri 1: Base[i], Base[next], Top[next]
        volIndices.push(i, next, next + N);
        // Tri 2: Base[i], Top[next], Top[i]
        volIndices.push(i, next + N, i + N);
    }
    
    volumeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(volVertices, 3));
    volumeGeometry.setIndex(volIndices);
    volumeGeometry.computeVertexNormals();
    
    const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.2, // "transparent color"
        side: THREE.FrontSide, // Use FrontSide to avoid double-rendering internal faces
        depthWrite: false
    });
    
    const volumeMesh = new THREE.Mesh(volumeGeometry, material);
    group.add(volumeMesh);
    
    // 2. Arrow Distribution Across Plate Surface
    // Determine direction for arrows
    // Positive pressure = Push onto surface (opposite to normal)
    const direction = normal.clone();
    if (load.magnitude > 0) {
        direction.negate();
    }
    
    const lineLength = height; // Match volume height
    
    // Calculate bounding box to determine arrow distribution
    const bbox = new THREE.Box3().setFromPoints(uniquePoints);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    
    // Determine number of arrows based on plate size
    const maxDimension = Math.max(size.x, size.y, size.z);
    const arrowSpacing = 1.0; // Target spacing between arrows
    const numArrowsPerSide = Math.max(2, Math.ceil(maxDimension / arrowSpacing));
    
    // Create a grid of arrows across the plate surface
    // We'll use parametric coordinates (u,v) from 0 to 1
    for (let i = 0; i < numArrowsPerSide; i++) {
        for (let j = 0; j < numArrowsPerSide; j++) {
            const u = (i + 0.5) / numArrowsPerSide; // Center of each cell
            const v = (j + 0.5) / numArrowsPerSide;
            
            // Interpolate position on the plate surface
            // For a quad with 4 points [p0, p1, p2, p3]
            // Bilinear interpolation: p = (1-u)(1-v)p0 + u(1-v)p1 + uv*p2 + (1-u)v*p3
            if (uniquePoints.length >= 4) {
                const p0 = uniquePoints[0];
                const p1 = uniquePoints[1];
                const p2 = uniquePoints[2];
                const p3 = uniquePoints[3];
                
                const pt = new THREE.Vector3();
                pt.addScaledVector(p0, (1-u)*(1-v));
                pt.addScaledVector(p1, u*(1-v));
                pt.addScaledVector(p2, u*v);
                pt.addScaledVector(p3, (1-u)*v);
                
                const basePt = pt.clone().add(baseOffset);
                const topPt = basePt.clone().add(extrusionVec);
                
                let arrowOrigin;
                if (load.magnitude > 0) {
                    // Push: Arrow points DOWN (into surface). Origin at TOP.
                    arrowOrigin = topPt;
                } else {
                    // Pull: Arrow points UP (out of surface). Origin at BASE.
                    arrowOrigin = basePt;
                }
                
                const arrowDir = direction.clone().normalize();
                const arrow = new THREE.ArrowHelper(
                    arrowDir,
                    arrowOrigin,
                    lineLength,
                    color,
                    lineLength * 0.25,
                    lineLength * 0.2
                );
                group.add(arrow);
            } else if (uniquePoints.length === 3) {
                // For triangular elements, use barycentric coordinates
                // Map (u,v) to triangle if u+v <= 1
                if (u + v <= 1) {
                    const p0 = uniquePoints[0];
                    const p1 = uniquePoints[1];
                    const p2 = uniquePoints[2];
                    
                    const w = 1 - u - v;
                    const pt = new THREE.Vector3();
                    pt.addScaledVector(p0, w);
                    pt.addScaledVector(p1, u);
                    pt.addScaledVector(p2, v);
                    
                    const basePt = pt.clone().add(baseOffset);
                    const topPt = basePt.clone().add(extrusionVec);
                    
                    let arrowOrigin;
                    if (load.magnitude > 0) {
                        arrowOrigin = topPt;
                    } else {
                        arrowOrigin = basePt;
                    }
                    
                    const arrowDir = direction.clone().normalize();
                    const arrow = new THREE.ArrowHelper(
                        arrowDir,
                        arrowOrigin,
                        lineLength,
                        color,
                        lineLength * 0.25,
                        lineLength * 0.2
                    );
                    group.add(arrow);
                }
            }
        }
    }
    
    // Add label at centroid (on top face) - clean text only
    if (uniquePoints.length > 0) {
        const center = new THREE.Vector3();
        uniquePoints.forEach(p => center.add(p));
        center.divideScalar(uniquePoints.length);
        
        // Position on top of the volume
        const labelPos = center.clone().add(baseOffset).add(extrusionVec).add(normal.clone().multiplyScalar(0.1));
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        // Higher resolution for crisp text
        canvas.width = 320;
        canvas.height = 96;
        
        // Clear to fully transparent - no white background
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Solid dark text, bold weight - no shadow effects
        context.fillStyle = '#1a1a1a';
        context.font = 'bold 44px Arial, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(`${load.magnitude.toFixed(1)} kPa`, 160, 48);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        const spriteMaterial = new THREE.SpriteMaterial({ 
            map: texture, 
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(1.0, 0.3, 1); // Match canvas aspect ratio 320:96
        // Offset label slightly from arrows
        const labelPosOffset = labelPos.clone().add(new THREE.Vector3(0.3, 0.2, 0.3));
        sprite.position.copy(labelPosOffset);
        sprite.renderOrder = 100; // Render on top
        group.add(sprite);
    }
    
    return group;
}

/**
 * Get all loads for a beam
 * @param {string} beamId - Beam UUID
 * @returns {Array<Object>}
 */
export function getBeamLoads(beamId) {
    return beamLoads.get(beamId) || [];
}

/**
 * Get all loads in the model
 * @returns {Map<string, Array<Object>>}
 */
export function getAllLoads() {
    return beamLoads;
}

// Track visibility state
let loadsVisible = true;

/**
 * Toggle visibility of all load visuals (beam loads and node loads)
 */
export function toggleLoadsVisibility() {
    loadsVisible = !loadsVisible;
    
    // Toggle beam/plate load visuals
    loadVisuals.forEach((visual) => {
        visual.visible = loadsVisible;
    });
    
    // Toggle node load visuals (point loads on nodes/mesh elements)
    if (window.nodeLoadVisuals) {
        window.nodeLoadVisuals.forEach((visual) => {
            visual.visible = loadsVisible;
        });
    }
    
    console.log(`Loads visibility: ${loadsVisible ? 'shown' : 'hidden'}`);
    return loadsVisible;
}

/**
 * Get current loads visibility state
 * @returns {boolean}
 */
export function getLoadsVisibility() {
    return loadsVisible;
}

// Expose globally
window.toggleLoadsVisibility = toggleLoadsVisibility;
window.getLoadsVisibility = getLoadsVisibility;
