import { selectedPlates, createNode, selectedNodes } from './geometry_manager.js';
import { updateNodeLabels } from './labels_manager.js';

const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js');

/**
 * Generate mesh for selected plates
 * @param {string} type - 'triangular' or 'quad'
 * @param {number} size - Element size
 * @param {Object} sceneData - Scene data containing nodesGroup etc.
 */
export async function generateMesh(type, size, sceneData) {
    // Load Delaunator dynamically when needed
    const { default: Delaunator } = await import('https://cdn.jsdelivr.net/npm/delaunator@5.0.0/+esm');

    console.log(`Generating ${type} mesh with element size ${size}...`);
    
    if (selectedPlates.size === 0) {
        console.warn('No plates selected for meshing');
        alert('Please select at least one plate to mesh.');
        return;
    }

    const { nodesGroup } = sceneData;
    const plateCount = selectedPlates.size;
    console.log(`Processing ${plateCount} plates...`);

    selectedPlates.forEach(plate => {
        // Visual feedback that plate is being meshed
        const originalColor = plate.material.color.getHex();
        
        // Flash the plate to indicate processing
        plate.material.visible = true;
        plate.material.color.setHex(0xffff00); // Yellow
        
        // Remove existing mesh visualization and nodes if any
        if (plate.userData.mesh && plate.userData.mesh.createdNodeIds) {
            // Remove previously created mesh nodes
            const nodesToRemove = [];
            nodesGroup.children.forEach(node => {
                if (plate.userData.mesh.createdNodeIds.includes(node.uuid)) {
                    nodesToRemove.push(node);
                }
            });
            
            nodesToRemove.forEach(node => {
                nodesGroup.remove(node);
                if (node.geometry) node.geometry.dispose();
                if (node.material) node.material.dispose();
                selectedNodes.delete(node);
            });
        }

        const existingMesh = plate.children.find(c => c.userData.isMeshViz);
        if (existingMesh) {
            plate.remove(existingMesh);
            existingMesh.geometry.dispose();
            existingMesh.material.dispose();
        }

        setTimeout(() => {
            plate.material.color.setHex(originalColor);
            
            // Generate and add mesh visualization
            const result = createMeshVisualization(plate, type, size, Delaunator, nodesGroup);
            
            if (result) {
                const { meshLines, createdNodeIds } = result;
                plate.add(meshLines);
                meshLines.userData.isMeshViz = true;

                // Add a property to the plate indicating it has a mesh
                plate.userData.mesh = {
                    type: type,
                    size: size,
                    generatedAt: new Date().toISOString(),
                    engine: 'internal-cdt',
                    createdNodeIds: createdNodeIds
                };

                // Hide the original plate surface to prevent double shading
                plate.material.visible = false;
            }
        }, 100);
    });

    setTimeout(() => {
        console.log('Meshing complete.');
        // Update labels once after all nodes are created (not per-node for performance)
        updateNodeLabels(nodesGroup);
    }, 200);
}

/**
 * Create a visual representation of the mesh
 * @param {THREE.Mesh} plate 
 * @param {string} type 
 * @param {number} size 
 * @param {class} DelaunatorClass - The Delaunator class
 * @param {THREE.Group} nodesGroup
 * @returns {Object}
 */
function createMeshVisualization(plate, type, size, DelaunatorClass, nodesGroup) {  
    // 1. Get unique boundary vertices
    const positions = plate.geometry.attributes.position.array;
    const vertices = [];
    
    for(let i=0; i<positions.length; i+=3) {
        const v = new THREE.Vector3(positions[i], positions[i+1], positions[i+2]);
        let unique = true;
        for(const existing of vertices) {
            if (existing.distanceTo(v) < 0.001) {
                unique = false;
                break;
            }
        }
        if (unique) vertices.push(v);
    }
    
    if (vertices.length < 3) return null;

    // 2. Determine projection plane and basis vectors
    const v0 = vertices[0];
    const v1 = vertices[1];
    const v2 = vertices[2];
    const normal = new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(v1, v0),
        new THREE.Vector3().subVectors(v2, v0)
    ).normalize();
    
    // Create local coordinate system (u, v, n)
    let uAxis = new THREE.Vector3();
    let vAxis = new THREE.Vector3();
    
    if (Math.abs(normal.y) > 0.9) {
        uAxis.set(1, 0, 0);
    } else {
        uAxis.set(0, 1, 0).cross(normal).normalize();
    }
    vAxis.crossVectors(normal, uAxis).normalize();
    
    // Project vertices to 2D (u, v)
    const polyPoints = vertices.map(v => {
        const diff = new THREE.Vector3().subVectors(v, v0);
        return {
            u: diff.dot(uAxis),
            v: diff.dot(vAxis),
            original: v
        };
    });

    // Find existing nodes on plate
    const existingNodesOnPlate = [];
    if (nodesGroup) {
        nodesGroup.children.forEach(node => {
            const diff = new THREE.Vector3().subVectors(node.position, v0);
            const distToPlane = Math.abs(diff.dot(normal));
            
            if (distToPlane < 0.01) {
                const u = diff.dot(uAxis);
                const v = diff.dot(vAxis);
                
                // Bounding box check
                const minU = Math.min(...polyPoints.map(p => p.u));
                const maxU = Math.max(...polyPoints.map(p => p.u));
                const minV = Math.min(...polyPoints.map(p => p.v));
                const maxV = Math.max(...polyPoints.map(p => p.v));
                
                if (u >= minU - 0.01 && u <= maxU + 0.01 && v >= minV - 0.01 && v <= maxV + 0.01) {
                    existingNodesOnPlate.push({ u, v, node });
                }
            }
        });
    }
    
    // 3. Generate Mesh
    const createdNodeIds = [];
    const step = parseFloat(size);
    // Use original color if available (to avoid using selection color), otherwise current color
    let plateColor = plate.userData.originalColor || plate.material.color.getHex();

    // If vertical wall (normal.y close to 0), use strong cyan/teal (same as plate creation)
    if (Math.abs(normal.y) < 0.1) {
        plateColor = 0x00eeff;
    }
    
    // Create a group for the individual mesh elements
    const meshElementsGroup = new THREE.Group();
    meshElementsGroup.userData.isMeshViz = true;
    
    // Helper to get or create node at position
    const getOrCreateNode = (pos) => {
        // Check existing nodes on plate
        for (const en of existingNodesOnPlate) {
            if (en.node.position.distanceTo(pos) < 0.05) { // Increased tolerance to 5cm
                return en.node;
            }
        }
        
        // Create new node - skip label update for performance (we update once at the end)
        const newNode = createNode(nodesGroup, pos, true);
        newNode.userData.isMeshNode = true;
        
        // Make the sphere invisible but raycastable
        newNode.material.visible = false;
        newNode.material.transparent = true;
        newNode.material.opacity = 0;
        
        // Add visual "+" helper
        const plusSize = 0.15;
        const plusGeom = new THREE.BufferGeometry();
        const plusVertices = [
            -plusSize, 0, 0, plusSize, 0, 0,
            0, -plusSize, 0, 0, plusSize, 0,
            0, 0, -plusSize, 0, 0, plusSize
        ];
        plusGeom.setAttribute('position', new THREE.Float32BufferAttribute(plusVertices, 3));
        // Default color Green (0x00ff00)
        const plusMat = new THREE.LineBasicMaterial({ color: 0x00ff00, depthTest: false, linewidth: 3 });
        const plus = new THREE.LineSegments(plusGeom, plusMat);
        plus.renderOrder = 999;
        newNode.add(plus);
        
        newNode.scale.set(0.5, 0.5, 0.5);
        
        createdNodeIds.push(newNode.uuid);
        return newNode;
    };

    if (type === 'quad' && vertices.length === 4) {
        // Structured Quad Mesh
        const p0 = polyPoints[0];
        const p1 = polyPoints[1];
        const p2 = polyPoints[2];
        const p3 = polyPoints[3];
        
        const d01 = Math.sqrt((p1.u-p0.u)**2 + (p1.v-p0.v)**2);
        const d12 = Math.sqrt((p2.u-p1.u)**2 + (p2.v-p1.v)**2);
        
        const nU = Math.max(1, Math.round(d01 / step));
        const nV = Math.max(1, Math.round(d12 / step));
        
        // Create grid of nodes
        const gridNodes = [];
        for (let i = 0; i <= nU; i++) {
            gridNodes[i] = [];
            for (let j = 0; j <= nV; j++) {
                const u = i / nU;
                const v = j / nV;
                
                // Bilinear interpolation
                const p01 = new THREE.Vector3().lerpVectors(vertices[0], vertices[1], u);
                const p32 = new THREE.Vector3().lerpVectors(vertices[3], vertices[2], u);
                const pos = new THREE.Vector3().lerpVectors(p01, p32, v);
                
                gridNodes[i][j] = getOrCreateNode(pos);
            }
        }
        
        // Create individual quad elements
        for (let i = 0; i < nU; i++) {
            for (let j = 0; j < nV; j++) {
                const nA = gridNodes[i][j];
                const nB = gridNodes[i+1][j];
                const nC = gridNodes[i+1][j+1];
                const nD = gridNodes[i][j+1];
                
                // Create quad geometry
                const quadGeom = new THREE.BufferGeometry();
                const quadVertices = [
                    nA.position.x, nA.position.y, nA.position.z,
                    nB.position.x, nB.position.y, nB.position.z,
                    nD.position.x, nD.position.y, nD.position.z,
                    
                    nB.position.x, nB.position.y, nB.position.z,
                    nC.position.x, nC.position.y, nC.position.z,
                    nD.position.x, nD.position.y, nD.position.z
                ];
                quadGeom.setAttribute('position', new THREE.Float32BufferAttribute(quadVertices, 3));
                quadGeom.computeVertexNormals();
                
                // Create quad mesh (element)
                const quadMesh = new THREE.Mesh(
                    quadGeom,
                    new THREE.MeshPhongMaterial({
                        color: plateColor, // Use plate color
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 0.3, // Visible but transparent
                        depthWrite: false, // Prevent z-fighting with other transparent objects
                        polygonOffset: true,
                        polygonOffsetFactor: 1,
                        polygonOffsetUnits: 1,
                        flatShading: false // Enable smooth vertex color interpolation
                    })
                );
                quadMesh.userData.isMeshElement = true;
                quadMesh.userData.elementType = 'quad';
                quadMesh.userData.nodes = [nA, nB, nC, nD];
                quadMesh.userData.originalColor = plateColor;
                
                // Create edges for the quad
                const edgesGeom = new THREE.EdgesGeometry(quadGeom);
                const edgesMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 });
                const edges = new THREE.LineSegments(edgesGeom, edgesMat);
                quadMesh.add(edges);
                
                meshElementsGroup.add(quadMesh);
            }
        }
    } else {
        // Triangular Mesh (Delaunay)
        const boundaryNodes = [];
        for (let i = 0; i < polyPoints.length; i++) {
            const pStart = polyPoints[i];
            const pEnd = polyPoints[(i + 1) % polyPoints.length];
            const dist = Math.sqrt((pEnd.u - pStart.u)**2 + (pEnd.v - pStart.v)**2);
            const segments = Math.max(1, Math.ceil(dist / step));
            
            for (let j = 0; j < segments; j++) {
                const t = j / segments;
                boundaryNodes.push({
                    u: pStart.u + (pEnd.u - pStart.u) * t,
                    v: pStart.v + (pEnd.v - pStart.v) * t
                });
            }
        }
        
        const minU = Math.min(...polyPoints.map(p => p.u));
        const maxU = Math.max(...polyPoints.map(p => p.u));
        const minV = Math.min(...polyPoints.map(p => p.v));
        const maxV = Math.max(...polyPoints.map(p => p.v));
        
        const interiorNodes = [];
        
        // Point in polygon test
        const isInside = (u, v) => {
            let inside = false;
            for (let i = 0, j = polyPoints.length - 1; i < polyPoints.length; j = i++) {
                const xi = polyPoints[i].u, yi = polyPoints[i].v;
                const xj = polyPoints[j].u, yj = polyPoints[j].v;
                const intersect = ((yi > v) !== (yj > v)) && (u < (xj - xi) * (v - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        };
        
        // Add existing nodes to interior/boundary
        existingNodesOnPlate.forEach(en => {
            // Check if close to boundary
            let isBoundary = false;
            for (const bp of boundaryNodes) {
                if ((bp.u - en.u)**2 + (bp.v - en.v)**2 < (step * 0.1)**2) {
                    isBoundary = true;
                    break;
                }
            }
            if (!isBoundary && isInside(en.u, en.v)) {
                interiorNodes.push({ u: en.u, v: en.v, existingNode: en.node });
            }
        });
        
        // Hexagonal packing
        const hStep = step;
        const vStep = step * Math.sqrt(3) / 2;
        
        for (let v = minV; v <= maxV; v += vStep) {
            const offset = (Math.round((v - minV) / vStep) % 2 === 0) ? 0 : hStep / 2;
            for (let u = minU - offset; u <= maxU; u += hStep) {
                if (isInside(u, v)) {
                    // Check distance to boundary and existing nodes
                    let tooClose = false;
                    for (const bp of boundaryNodes) {
                        if ((bp.u - u)**2 + (bp.v - v)**2 < (step * 0.4)**2) {
                            tooClose = true;
                            break;
                        }
                    }
                    if (!tooClose) {
                        for (const en of interiorNodes) {
                            if ((en.u - u)**2 + (en.v - v)**2 < (step * 0.4)**2) {
                                tooClose = true;
                                break;
                            }
                        }
                    }
                    
                    if (!tooClose) {
                        interiorNodes.push({u, v});
                    }
                }
            }
        }
        
        const allNodes = [...boundaryNodes, ...interiorNodes];
        const coords = new Float64Array(allNodes.length * 2);
        for (let i = 0; i < allNodes.length; i++) {
            coords[i * 2] = allNodes[i].u;
            coords[i * 2 + 1] = allNodes[i].v;
        }
        
        // Triangulate
        const delaunay = new DelaunatorClass(coords);
        const triangles = delaunay.triangles;
        
        // Create nodes for all points
        const pointNodes = allNodes.map(p => {
            if (p.existingNode) return p.existingNode;
            
            // Unproject
            const unproject = (u, v) => {
                return new THREE.Vector3()
                    .copy(v0)
                    .addScaledVector(uAxis, u)
                    .addScaledVector(vAxis, v);
            };
            const pos = unproject(p.u, p.v);
                
            return getOrCreateNode(pos);
        });
        
        // Create individual triangle elements
        for (let i = 0; i < triangles.length; i += 3) {
            const i0 = triangles[i];
            const i1 = triangles[i + 1];
            const i2 = triangles[i + 2];
            
            const n0 = pointNodes[i0];
            const n1 = pointNodes[i1];
            const n2 = pointNodes[i2];
            
            // Centroid check
            const cU = (allNodes[i0].u + allNodes[i1].u + allNodes[i2].u) / 3;
            const cV = (allNodes[i0].v + allNodes[i1].v + allNodes[i2].v) / 3;
            
            if (isInside(cU, cV)) {
                // Create triangle geometry
                const triGeom = new THREE.BufferGeometry();
                const triVertices = [
                    n0.position.x, n0.position.y, n0.position.z,
                    n1.position.x, n1.position.y, n1.position.z,
                    n2.position.x, n2.position.y, n2.position.z
                ];
                triGeom.setAttribute('position', new THREE.Float32BufferAttribute(triVertices, 3));
                triGeom.computeVertexNormals();
                
                // Create triangle mesh (element)
                const triMesh = new THREE.Mesh(
                    triGeom,
                    new THREE.MeshPhongMaterial({
                        color: plateColor, // Use plate color
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 0.3, // Visible but transparent
                        depthWrite: false, // Prevent z-fighting
                        polygonOffset: true,
                        polygonOffsetFactor: 1,
                        polygonOffsetUnits: 1,
                        flatShading: false // Enable smooth vertex color interpolation
                    })
                );
                triMesh.userData.isMeshElement = true;
                triMesh.userData.elementType = 'tri';
                triMesh.userData.nodes = [n0, n1, n2];
                triMesh.userData.originalColor = plateColor;
                
                // Create edges
                const edgesGeom = new THREE.EdgesGeometry(triGeom);
                const edgesMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 });
                const edges = new THREE.LineSegments(edgesGeom, edgesMat);
                triMesh.add(edges);
                
                meshElementsGroup.add(triMesh);
            }
        }
    }
    
    return { meshLines: meshElementsGroup, createdNodeIds };
}
