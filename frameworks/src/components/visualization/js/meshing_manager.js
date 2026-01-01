import { selectedPlates, createNode, selectedNodes, createBeam } from './geometry_manager.js';
import { updateNodeLabels, updateBeamLabels } from './labels_manager.js';

const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js');

/**
 * Find beams that lie along a line segment (plate edge)
 * @param {THREE.Group} beamsGroup - Group containing all beams
 * @param {THREE.Vector3} edgeStart - Start of plate edge
 * @param {THREE.Vector3} edgeEnd - End of plate edge
 * @param {number} tolerance - Distance tolerance for matching
 * @returns {Array} Array of beams on this edge with their parametric positions
 */
function findBeamsOnEdge(beamsGroup, edgeStart, edgeEnd, tolerance = 0.1) {
    const beamsOnEdge = [];
    const edgeDir = new THREE.Vector3().subVectors(edgeEnd, edgeStart);
    const edgeLength = edgeDir.length();
    edgeDir.normalize();
    
    beamsGroup.children.forEach(beam => {
        const beamStart = beam.userData.startNode?.position;
        const beamEnd = beam.userData.endNode?.position;
        
        if (!beamStart || !beamEnd) return;
        
        // Check if beam endpoints are on or near the edge
        const distStartToEdge = pointToLineDistance(beamStart, edgeStart, edgeEnd);
        const distEndToEdge = pointToLineDistance(beamEnd, edgeStart, edgeEnd);
        
        // Get parametric positions along the edge (0 to 1)
        const tStart = projectPointOntoLine(beamStart, edgeStart, edgeDir, edgeLength);
        const tEnd = projectPointOntoLine(beamEnd, edgeStart, edgeDir, edgeLength);
        
        // Beam is on edge if both endpoints are close to the edge line and within the edge segment
        if (distStartToEdge < tolerance && distEndToEdge < tolerance &&
            tStart >= -0.01 && tStart <= 1.01 && tEnd >= -0.01 && tEnd <= 1.01) {
            beamsOnEdge.push({
                beam: beam,
                tStart: Math.max(0, Math.min(1, Math.min(tStart, tEnd))),
                tEnd: Math.max(0, Math.min(1, Math.max(tStart, tEnd)))
            });
        }
    });
    
    return beamsOnEdge;
}

/**
 * Calculate distance from point to line segment
 */
function pointToLineDistance(point, lineStart, lineEnd) {
    const lineDir = new THREE.Vector3().subVectors(lineEnd, lineStart);
    const lineLength = lineDir.length();
    if (lineLength < 0.0001) return point.distanceTo(lineStart);
    
    lineDir.normalize();
    const toPoint = new THREE.Vector3().subVectors(point, lineStart);
    const t = toPoint.dot(lineDir) / lineLength;
    
    if (t < 0) return point.distanceTo(lineStart);
    if (t > 1) return point.distanceTo(lineEnd);
    
    const closestPoint = lineStart.clone().addScaledVector(lineDir, t * lineLength);
    return point.distanceTo(closestPoint);
}

/**
 * Project point onto line and return parametric position
 */
function projectPointOntoLine(point, lineStart, lineDir, lineLength) {
    const toPoint = new THREE.Vector3().subVectors(point, lineStart);
    return toPoint.dot(lineDir) / lineLength;
}

/**
 * Split a beam into multiple segments at given positions
 * @param {THREE.Mesh} beam - Original beam to split
 * @param {Array<THREE.Mesh>} intermediateNodes - Nodes to split at (in order)
 * @param {THREE.Group} beamsGroup - Group to add new beams to
 * @param {THREE.Group} nodesGroup - Group containing nodes
 * @returns {Array<THREE.Mesh>} New beam segments
 */
function splitBeamAtNodes(beam, intermediateNodes, beamsGroup, nodesGroup) {
    if (intermediateNodes.length === 0) return [beam];
    
    const startNode = beam.userData.startNode;
    const endNode = beam.userData.endNode;
    
    if (!startNode || !endNode) return [beam];
    
    // Sort intermediate nodes by distance from start
    const sortedNodes = [...intermediateNodes].sort((a, b) => {
        const distA = startNode.position.distanceTo(a.position);
        const distB = startNode.position.distanceTo(b.position);
        return distA - distB;
    });
    
    // Create all nodes in order: [startNode, ...sortedNodes, endNode]
    const allNodes = [startNode, ...sortedNodes, endNode];
    
    // Remove original beam
    beamsGroup.remove(beam);
    if (beam.geometry) beam.geometry.dispose();
    if (beam.material) beam.material.dispose();
    
    // Create new beam segments
    const newBeams = [];
    for (let i = 0; i < allNodes.length - 1; i++) {
        const segStart = allNodes[i];
        const segEnd = allNodes[i + 1];
        
        // Skip zero-length segments
        if (segStart.position.distanceTo(segEnd.position) < 0.01) continue;
        
        const newBeam = createBeam(beamsGroup, segStart.position, segEnd.position, segStart, segEnd, true);
        if (newBeam) {
            // Copy beam section properties
            newBeam.userData.section = beam.userData.section;
            newBeam.userData.originalBeamId = beam.userData.id;
            newBeam.userData.isSubBeam = true;
            newBeams.push(newBeam);
        }
    }
    
    console.log(`Split beam into ${newBeams.length} segments`);
    return newBeams;
}

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
    
    // Log to console panel
    if (window.addConsoleLine) {
        window.addConsoleLine('MESH', `Generating ${type} mesh (size=${size}m)...`, 'info');
    }
    
    if (selectedPlates.size === 0) {
        console.warn('No plates selected for meshing');
        if (window.logWarning) window.logWarning('No plates selected for meshing');
        alert('Please select at least one plate to mesh.');
        return;
    }

    const { nodesGroup, beamsGroup } = sceneData;
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
            const result = createMeshVisualization(plate, type, size, Delaunator, nodesGroup, beamsGroup);
            
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
        if (beamsGroup) updateBeamLabels(beamsGroup);
        
        // Log completion to console panel
        if (window.addConsoleLine) {
            const totalNodes = nodesGroup.children.length;
            const totalBeams = beamsGroup ? beamsGroup.children.length : 0;
            window.addConsoleLine('MESH', `Meshing complete: ${totalNodes} nodes, ${totalBeams} beams`, 'success');
        }
    }, 200);
}

/**
 * Create a visual representation of the mesh
 * @param {THREE.Mesh} plate 
 * @param {string} type 
 * @param {number} size 
 * @param {class} DelaunatorClass - The Delaunator class
 * @param {THREE.Group} nodesGroup
 * @param {THREE.Group} beamsGroup - Optional beams group for beam-plate connectivity
 * @returns {Object}
 */
function createMeshVisualization(plate, type, size, DelaunatorClass, nodesGroup, beamsGroup = null) {  
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

    // Track beams that need to be split and their intermediate nodes
    const beamsToSplit = new Map(); // beam -> [intermediateNodes]

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
    
    // Find beams along plate edges for beam-plate connectivity
    const edgeBeamsMap = new Map(); // edgeIndex -> [{beam, tStart, tEnd}]
    if (beamsGroup && vertices.length >= 3) {
        console.log('Checking for beams along plate edges...');
        for (let i = 0; i < vertices.length; i++) {
            const edgeStart = vertices[i];
            const edgeEnd = vertices[(i + 1) % vertices.length];
            const beamsOnEdge = findBeamsOnEdge(beamsGroup, edgeStart, edgeEnd, 0.1);
            if (beamsOnEdge.length > 0) {
                edgeBeamsMap.set(i, beamsOnEdge);
                console.log(`  Edge ${i}: Found ${beamsOnEdge.length} beam(s)`);
            }
        }
    }
    
    // Helper to check if a position lies on a beam and track it for splitting
    const checkAndTrackBeamNode = (pos, node) => {
        if (!beamsGroup) return;
        
        edgeBeamsMap.forEach((beamsOnEdge, edgeIdx) => {
            beamsOnEdge.forEach(({ beam }) => {
                const beamStart = beam.userData.startNode?.position;
                const beamEnd = beam.userData.endNode?.position;
                if (!beamStart || !beamEnd) return;
                
                // Check if node is on this beam (not at endpoints)
                const distToStart = pos.distanceTo(beamStart);
                const distToEnd = pos.distanceTo(beamEnd);
                const beamLength = beamStart.distanceTo(beamEnd);
                
                // Skip if at endpoints
                if (distToStart < 0.05 || distToEnd < 0.05) return;
                
                // Check if on the beam line
                const distToLine = pointToLineDistance(pos, beamStart, beamEnd);
                if (distToLine < 0.05 && distToStart < beamLength && distToEnd < beamLength) {
                    // Node is on this beam - track for splitting
                    if (!beamsToSplit.has(beam)) {
                        beamsToSplit.set(beam, []);
                    }
                    // Check we haven't already added this node
                    const existingNodes = beamsToSplit.get(beam);
                    const alreadyAdded = existingNodes.some(n => n.position.distanceTo(pos) < 0.05);
                    if (!alreadyAdded) {
                        beamsToSplit.get(beam).push(node);
                        console.log(`  Tracking node for beam split at (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`);
                    }
                }
            });
        });
    };
    
    // Helper to get or create node at position
    const getOrCreateNode = (pos, isOnEdge = false) => {
        // Check existing nodes on plate
        for (const en of existingNodesOnPlate) {
            if (en.node.position.distanceTo(pos) < 0.05) { // Increased tolerance to 5cm
                // Also check if this existing node should be tracked for beam splitting
                if (isOnEdge) checkAndTrackBeamNode(pos, en.node);
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
        
        // Add to existingNodesOnPlate for future lookups
        const diff = new THREE.Vector3().subVectors(pos, v0);
        existingNodesOnPlate.push({
            u: diff.dot(uAxis),
            v: diff.dot(vAxis),
            node: newNode
        });
        
        // Track for beam splitting if on edge
        if (isOnEdge) checkAndTrackBeamNode(pos, newNode);
        
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
                
                // Determine if this node is on the edge (for beam connectivity)
                const isOnEdge = (i === 0 || i === nU || j === 0 || j === nV);
                gridNodes[i][j] = getOrCreateNode(pos, isOnEdge);
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
        const boundaryCount = boundaryNodes.length;
        const pointNodes = allNodes.map((p, idx) => {
            if (p.existingNode) return p.existingNode;
            
            // Unproject
            const unproject = (u, v) => {
                return new THREE.Vector3()
                    .copy(v0)
                    .addScaledVector(uAxis, u)
                    .addScaledVector(vAxis, v);
            };
            const pos = unproject(p.u, p.v);
            
            // Nodes in boundaryNodes array are on the edge
            const isOnEdge = idx < boundaryCount;
            return getOrCreateNode(pos, isOnEdge);
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
    
    // Split beams that have intermediate mesh nodes along them
    if (beamsGroup && beamsToSplit.size > 0) {
        console.log(`Splitting ${beamsToSplit.size} beam(s) to connect with plate mesh...`);
        beamsToSplit.forEach((intermediateNodes, beam) => {
            if (intermediateNodes.length > 0) {
                splitBeamAtNodes(beam, intermediateNodes, beamsGroup, nodesGroup);
            }
        });
    }
    
    return { meshLines: meshElementsGroup, createdNodeIds };
}
