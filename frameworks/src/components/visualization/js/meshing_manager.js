import { selectedPlates, createNode, selectedNodes } from './geometry_manager.js';
import { updateNodeLabels } from './labels_manager.js';

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

let meshWorker = null;
let nextWorkerRequestId = 1;
const pendingWorkerRequests = new Map();

function getMeshWorker() {
    if (meshWorker) return meshWorker;

    const workerSource = `
        import Delaunator from 'https://cdn.jsdelivr.net/npm/delaunator@5.0.0/+esm';

        function isInsidePolygon(u, v, poly) {
            let inside = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const xi = poly[i][0], yi = poly[i][1];
                const xj = poly[j][0], yj = poly[j][1];
                const intersect = ((yi > v) !== (yj > v)) && (u < (xj - xi) * (v - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        }

        self.onmessage = (event) => {
            const msg = event.data;
            if (!msg || msg.kind !== 'triangulate') return;

            const { requestId, polyPoints, step, existingPoints } = msg;

            try {
                // 1) Boundary samples
                const boundaryNodes = [];
                for (let i = 0; i < polyPoints.length; i++) {
                    const pStart = polyPoints[i];
                    const pEnd = polyPoints[(i + 1) % polyPoints.length];
                    const du = pEnd[0] - pStart[0];
                    const dv = pEnd[1] - pStart[1];
                    const dist = Math.sqrt(du * du + dv * dv);
                    const segments = Math.max(1, Math.ceil(dist / step));
                    for (let j = 0; j < segments; j++) {
                        const t = j / segments;
                        boundaryNodes.push([pStart[0] + du * t, pStart[1] + dv * t]);
                    }
                }

                // 2) Bounds
                let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
                for (const p of polyPoints) {
                    if (p[0] < minU) minU = p[0];
                    if (p[0] > maxU) maxU = p[0];
                    if (p[1] < minV) minV = p[1];
                    if (p[1] > maxV) maxV = p[1];
                }

                const inside = (u, v) => isInsidePolygon(u, v, polyPoints);

                // 3) Seed interior with existing points
                const interiorNodes = [];
                if (Array.isArray(existingPoints)) {
                    for (const ep of existingPoints) {
                        const u = ep.u;
                        const v = ep.v;
                        // boundary proximity check
                        let isBoundary = false;
                        for (const bp of boundaryNodes) {
                            const du = bp[0] - u;
                            const dv = bp[1] - v;
                            if (du * du + dv * dv < (step * 0.1) * (step * 0.1)) {
                                isBoundary = true;
                                break;
                            }
                        }
                        if (!isBoundary && inside(u, v)) {
                            interiorNodes.push({ u, v, existingIndex: ep.index });
                        }
                    }
                }

                // 4) Hex packing interior points
                const hStep = step;
                const vStep = step * Math.sqrt(3) / 2;
                for (let v = minV; v <= maxV; v += vStep) {
                    const row = Math.round((v - minV) / vStep);
                    const offset = (row % 2 === 0) ? 0 : hStep / 2;
                    for (let u = minU - offset; u <= maxU; u += hStep) {
                        if (!inside(u, v)) continue;

                        let tooClose = false;
                        for (const bp of boundaryNodes) {
                            const du = bp[0] - u;
                            const dv = bp[1] - v;
                            if (du * du + dv * dv < (step * 0.4) * (step * 0.4)) {
                                tooClose = true;
                                break;
                            }
                        }
                        if (!tooClose) {
                            for (const en of interiorNodes) {
                                const du = en.u - u;
                                const dv = en.v - v;
                                if (du * du + dv * dv < (step * 0.4) * (step * 0.4)) {
                                    tooClose = true;
                                    break;
                                }
                            }
                        }

                        if (!tooClose) {
                            interiorNodes.push({ u, v, existingIndex: -1 });
                        }
                    }
                }

                // 5) Build arrays for triangulation
                const nodeCount = boundaryNodes.length + interiorNodes.length;
                const nodesUv = new Float64Array(nodeCount * 2);
                const existingIndexByNode = new Int32Array(nodeCount);

                let k = 0;
                for (let i = 0; i < boundaryNodes.length; i++) {
                    nodesUv[k * 2] = boundaryNodes[i][0];
                    nodesUv[k * 2 + 1] = boundaryNodes[i][1];
                    existingIndexByNode[k] = -1;
                    k++;
                }
                for (let i = 0; i < interiorNodes.length; i++) {
                    nodesUv[k * 2] = interiorNodes[i].u;
                    nodesUv[k * 2 + 1] = interiorNodes[i].v;
                    existingIndexByNode[k] = interiorNodes[i].existingIndex;
                    k++;
                }

                const delaunay = new Delaunator(nodesUv);
                const tris = delaunay.triangles;

                // Filter triangles by centroid inside
                const out = [];
                for (let i = 0; i < tris.length; i += 3) {
                    const i0 = tris[i];
                    const i1 = tris[i + 1];
                    const i2 = tris[i + 2];
                    const cU = (nodesUv[i0 * 2] + nodesUv[i1 * 2] + nodesUv[i2 * 2]) / 3;
                    const cV = (nodesUv[i0 * 2 + 1] + nodesUv[i1 * 2 + 1] + nodesUv[i2 * 2 + 1]) / 3;
                    if (inside(cU, cV)) {
                        out.push(i0, i1, i2);
                    }
                }

                const triangles = new Uint32Array(out);

                self.postMessage(
                    { requestId, ok: true, nodesUv, existingIndexByNode, triangles },
                    [nodesUv.buffer, existingIndexByNode.buffer, triangles.buffer]
                );
            } catch (err) {
                self.postMessage({ requestId, ok: false, error: String(err) });
            }
        };
    `;

    const blob = new Blob([workerSource], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    meshWorker = new Worker(url, { type: 'module' });
    URL.revokeObjectURL(url);

    meshWorker.onmessage = (event) => {
        const msg = event.data;
        if (!msg || typeof msg.requestId !== 'number') return;
        const pending = pendingWorkerRequests.get(msg.requestId);
        if (!pending) return;
        pendingWorkerRequests.delete(msg.requestId);
        if (msg.ok) {
            pending.resolve(msg);
        } else {
            pending.reject(new Error(msg.error || 'Meshing worker failed'));
        }
    };

    meshWorker.onerror = (err) => {
        console.error('Meshing worker error:', err);
    };

    return meshWorker;
}

function triangulateInWorker({ polyPoints, step, existingPoints }) {
    const worker = getMeshWorker();
    const requestId = nextWorkerRequestId++;
    return new Promise((resolve, reject) => {
        pendingWorkerRequests.set(requestId, { resolve, reject });
        worker.postMessage({ kind: 'triangulate', requestId, polyPoints, step, existingPoints });
    });
}

function computePlateCacheKey(plate, type, size) {
    const positions = plate.geometry?.attributes?.position?.array;
    if (!positions) return `${type}:${size}:no-geom`;

    // Hash-ish string: rounded coords in draw order.
    // (Small + stable, good enough to avoid re-meshing unchanged plates.)
    const parts = [];
    for (let i = 0; i < positions.length; i += 3) {
        parts.push(
            Math.round(positions[i] * 10000),
            Math.round(positions[i + 1] * 10000),
            Math.round(positions[i + 2] * 10000)
        );
    }
    return `${type}:${size}:${parts.join(',')}`;
}

function disposeObject(obj) {
    if (!obj) return;
    obj.traverse?.((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else child.material.dispose();
        }
    });
}

export function clearMesh(sceneData, { onlySelected = true } = {}) {
    if (!sceneData?.nodesGroup || !sceneData?.platesGroup) return;

    const { nodesGroup, platesGroup } = sceneData;
    const plates = (onlySelected && selectedPlates.size > 0)
        ? Array.from(selectedPlates)
        : Array.from(platesGroup.children || []).filter((p) => p?.userData && !p.userData.isMeshElement);

    plates.forEach((plate) => {
        // Remove created mesh nodes
        if (plate.userData?.mesh?.createdNodeIds?.length) {
            const created = new Set(plate.userData.mesh.createdNodeIds);
            const toRemove = [];
            nodesGroup.children.forEach((node) => {
                if (created.has(node.uuid)) toRemove.push(node);
            });
            toRemove.forEach((node) => {
                nodesGroup.remove(node);
                disposeObject(node);
                selectedNodes.delete(node);
            });
        }

        // Remove mesh visualization group
        const existingMesh = plate.children?.find((c) => c?.userData?.isMeshViz);
        if (existingMesh) {
            plate.remove(existingMesh);
            disposeObject(existingMesh);
        }

        if (plate.material) plate.material.visible = true;
        if (plate.userData) delete plate.userData.mesh;
    });

    updateNodeLabels(nodesGroup);
}

/**
 * Generate mesh for selected plates
 * @param {string} type - 'triangular' or 'quad'
 * @param {number} size - Element size
 * @param {Object} sceneData - Scene data containing nodesGroup etc.
 */
export async function generateMesh(type, size, sceneData) {
    console.log(`Generating ${type} mesh with element size ${size}...`);
    
    if (selectedPlates.size === 0) {
        console.warn('No plates selected for meshing');
        alert('Please select at least one plate to mesh.');
        return;
    }

    const { nodesGroup } = sceneData;
    const plateCount = selectedPlates.size;
    console.log(`Processing ${plateCount} plates...`);

    // Process sequentially to keep memory stable and allow UI updates between plates.
    for (const plate of selectedPlates) {
        const cacheKey = computePlateCacheKey(plate, type, size);
        const hasExistingMeshViz = !!plate.children?.find((c) => c?.userData?.isMeshViz);
        if (plate.userData?.mesh?.cacheKey === cacheKey && hasExistingMeshViz) {
            // Cached: plate unchanged + same params.
            continue;
        }

        // Visual feedback that plate is being meshed
        const originalColor = plate.material.color.getHex();
        
        // Flash the plate to indicate processing
        plate.material.visible = true;
        plate.material.color.setHex(0xffff00); // Yellow
        

        // Remove existing mesh visualization and nodes if any
        if (plate.userData?.mesh?.createdNodeIds?.length) {
            const created = new Set(plate.userData.mesh.createdNodeIds);
            const nodesToRemove = [];
            nodesGroup.children.forEach((node) => {
                if (created.has(node.uuid)) nodesToRemove.push(node);
            });
            nodesToRemove.forEach((node) => {
                nodesGroup.remove(node);
                disposeObject(node);
                selectedNodes.delete(node);
            });
        }

        const existingMesh = plate.children?.find((c) => c?.userData?.isMeshViz);
        if (existingMesh) {
            plate.remove(existingMesh);
            disposeObject(existingMesh);
        }

        plate.material.color.setHex(originalColor);

        // Generate and add mesh visualization
        let result = null;
        if (type === 'quad') {
            result = createMeshVisualizationQuad(plate, size, nodesGroup);
        } else {
            result = await createMeshVisualizationTriWorker(plate, size, nodesGroup);
        }

        if (result) {
            const { meshLines, createdNodeIds } = result;
            plate.add(meshLines);
            meshLines.userData.isMeshViz = true;

            // Add a property to the plate indicating it has a mesh
            plate.userData.mesh = {
                type,
                size,
                cacheKey,
                generatedAt: new Date().toISOString(),
                engine: type === 'triangular' ? 'worker-delaunay' : 'structured-quad',
                createdNodeIds
            };

            // Hide the original plate surface to prevent double shading
            plate.material.visible = false;
        }

        // Let the browser breathe between plates
        await new Promise((r) => requestAnimationFrame(() => r()));
    }

    console.log('Meshing complete.');
    // Update labels once after all nodes are created (not per-node for performance)
    updateNodeLabels(nodesGroup);
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
function createMeshVisualizationQuad(plate, size, nodesGroup) {  
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
    if (vertices.length !== 4) return null;

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
        let newNode = createNode(nodesGroup, pos, true);
        if (!newNode) {
            // Fallback if a node already exists but wasn't captured in existingNodesOnPlate
            for (const node of nodesGroup.children) {
                if (node.position.distanceTo(pos) < 0.1) {
                    return node;
                }
            }
            return null;
        }
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

    if (vertices.length === 4) {
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
                
                const n = getOrCreateNode(pos);
                if (!n) continue;
                gridNodes[i][j] = n;
            }
        }
        
        // Create individual quad elements
        for (let i = 0; i < nU; i++) {
            for (let j = 0; j < nV; j++) {
                const nA = gridNodes[i][j];
                const nB = gridNodes[i+1][j];
                const nC = gridNodes[i+1][j+1];
                const nD = gridNodes[i][j+1];

                if (!nA || !nB || !nC || !nD) continue;
                
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
    }
    
    return { meshLines: meshElementsGroup, createdNodeIds };
}

async function createMeshVisualizationTriWorker(plate, size, nodesGroup) {
    // 1. Get unique boundary vertices
    const positions = plate.geometry.attributes.position.array;
    const vertices = [];

    for (let i = 0; i < positions.length; i += 3) {
        const v = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
        let unique = true;
        for (const existing of vertices) {
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

    let uAxis = new THREE.Vector3();
    let vAxis = new THREE.Vector3();
    if (Math.abs(normal.y) > 0.9) {
        uAxis.set(1, 0, 0);
    } else {
        uAxis.set(0, 1, 0).cross(normal).normalize();
    }
    vAxis.crossVectors(normal, uAxis).normalize();

    const polyPoints = vertices.map((v) => {
        const diff = new THREE.Vector3().subVectors(v, v0);
        return [diff.dot(uAxis), diff.dot(vAxis)];
    });

    // Find existing nodes on plate (for reuse)
    const existingNodesOnPlate = [];
    if (nodesGroup) {
        const minU = Math.min(...polyPoints.map((p) => p[0]));
        const maxU = Math.max(...polyPoints.map((p) => p[0]));
        const minV = Math.min(...polyPoints.map((p) => p[1]));
        const maxV = Math.max(...polyPoints.map((p) => p[1]));

        nodesGroup.children.forEach((node) => {
            const diff = new THREE.Vector3().subVectors(node.position, v0);
            const distToPlane = Math.abs(diff.dot(normal));
            if (distToPlane >= 0.01) return;
            const u = diff.dot(uAxis);
            const v = diff.dot(vAxis);
            if (u >= minU - 0.01 && u <= maxU + 0.01 && v >= minV - 0.01 && v <= maxV + 0.01) {
                existingNodesOnPlate.push({ u, v, node });
            }
        });
    }

    const step = parseFloat(size);

    // Choose plate color
    let plateColor = plate.userData.originalColor || plate.material.color.getHex();
    if (Math.abs(normal.y) < 0.1) {
        plateColor = 0x00eeff;
    }

    // Triangulate in worker
    const existingPoints = existingNodesOnPlate.map((en, index) => ({ u: en.u, v: en.v, index }));
    const { nodesUv, existingIndexByNode, triangles } = await triangulateInWorker({ polyPoints, step, existingPoints });

    const createdNodeIds = [];
    const meshElementsGroup = new THREE.Group();
    meshElementsGroup.userData.isMeshViz = true;

    const unproject = (u, v) => {
        return new THREE.Vector3().copy(v0).addScaledVector(uAxis, u).addScaledVector(vAxis, v);
    };

    const getOrCreateNode = (idx) => {
        const existingIndex = existingIndexByNode[idx];
        if (existingIndex >= 0) {
            return existingNodesOnPlate[existingIndex].node;
        }

        const u = nodesUv[idx * 2];
        const v = nodesUv[idx * 2 + 1];
        const pos = unproject(u, v);

        // Use same behavior as quad path
        for (const en of existingNodesOnPlate) {
            if (en.node.position.distanceTo(pos) < 0.05) return en.node;
        }

        let newNode = createNode(nodesGroup, pos, true);
        if (!newNode) {
            for (const node of nodesGroup.children) {
                if (node.position.distanceTo(pos) < 0.1) return node;
            }
            return null;
        }

        newNode.userData.isMeshNode = true;
        newNode.material.visible = false;
        newNode.material.transparent = true;
        newNode.material.opacity = 0;

        const plusSize = 0.15;
        const plusGeom = new THREE.BufferGeometry();
        const plusVertices = [
            -plusSize, 0, 0, plusSize, 0, 0,
            0, -plusSize, 0, 0, plusSize, 0,
            0, 0, -plusSize, 0, 0, plusSize
        ];
        plusGeom.setAttribute('position', new THREE.Float32BufferAttribute(plusVertices, 3));
        const plusMat = new THREE.LineBasicMaterial({ color: 0x00ff00, depthTest: false, linewidth: 3 });
        const plus = new THREE.LineSegments(plusGeom, plusMat);
        plus.renderOrder = 999;
        newNode.add(plus);
        newNode.scale.set(0.5, 0.5, 0.5);

        createdNodeIds.push(newNode.uuid);
        return newNode;
    };

    for (let i = 0; i < triangles.length; i += 3) {
        const i0 = triangles[i];
        const i1 = triangles[i + 1];
        const i2 = triangles[i + 2];

        const n0 = getOrCreateNode(i0);
        const n1 = getOrCreateNode(i1);
        const n2 = getOrCreateNode(i2);
        if (!n0 || !n1 || !n2) continue;

        const triGeom = new THREE.BufferGeometry();
        const triVertices = [
            n0.position.x, n0.position.y, n0.position.z,
            n1.position.x, n1.position.y, n1.position.z,
            n2.position.x, n2.position.y, n2.position.z
        ];
        triGeom.setAttribute('position', new THREE.Float32BufferAttribute(triVertices, 3));
        triGeom.computeVertexNormals();

        const triMesh = new THREE.Mesh(
            triGeom,
            new THREE.MeshPhongMaterial({
                color: plateColor,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.3,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: 1,
                polygonOffsetUnits: 1,
                flatShading: false
            })
        );
        triMesh.userData.isMeshElement = true;
        triMesh.userData.elementType = 'tri';
        triMesh.userData.nodes = [n0, n1, n2];
        triMesh.userData.originalColor = plateColor;

        const edgesGeom = new THREE.EdgesGeometry(triGeom);
        const edgesMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 });
        const edges = new THREE.LineSegments(edgesGeom, edgesMat);
        triMesh.add(edges);

        meshElementsGroup.add(triMesh);
    }

    return { meshLines: meshElementsGroup, createdNodeIds };
}
