/**
 * Beam Analysis Module
 * Calculates internal forces (moments, shears) using the direct stiffness method
 * from nodal displacements and applied loads
 */

const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js');

/**
 * Calculate beam internal forces using the stiffness method
 * 
 * For a 2D beam element with 3 DOF per node (u, v, θ):
 * - Axial: N = EA/L * (u2 - u1)
 * - Shear and Moment: Use beam element stiffness matrix
 * 
 * For a beam with UDL, we also add the fixed-end forces
 */

/**
 * Calculate the beam element stiffness matrix in local coordinates
 * For Euler-Bernoulli beam with 6 DOF (3 per node: u, v, θ)
 * @param {number} E - Elastic modulus (Pa)
 * @param {number} A - Cross-sectional area (m²)
 * @param {number} I - Moment of inertia (m⁴)
 * @param {number} L - Beam length (m)
 * @returns {number[][]} 6x6 stiffness matrix
 */
function beamStiffnessMatrix(E, A, I, L) {
    const L2 = L * L;
    const L3 = L * L * L;
    
    // Axial stiffness
    const ka = E * A / L;
    
    // Bending stiffness terms
    const k1 = 12 * E * I / L3;
    const k2 = 6 * E * I / L2;
    const k3 = 4 * E * I / L;
    const k4 = 2 * E * I / L;
    
    // Local stiffness matrix [u1, v1, θ1, u2, v2, θ2]
    return [
        [ ka,   0,    0,   -ka,   0,    0  ],
        [  0,  k1,   k2,     0, -k1,   k2  ],
        [  0,  k2,   k3,     0, -k2,   k4  ],
        [-ka,   0,    0,    ka,   0,    0  ],
        [  0, -k1,  -k2,     0,  k1,  -k2  ],
        [  0,  k2,   k4,     0, -k2,   k3  ]
    ];
}

/**
 * Calculate fixed-end forces for a beam with uniformly distributed load
 * @param {number} w - Load intensity (N/m, positive downward)
 * @param {number} L - Beam length (m)
 * @returns {number[]} Fixed-end forces [N1, V1, M1, N2, V2, M2]
 */
function fixedEndForcesUDL(w, L) {
    // For UDL on a fixed-fixed beam:
    // V1 = V2 = wL/2 (reactions)
    // M1 = -wL²/12 (negative = hogging at left support)
    // M2 = +wL²/12 (positive = hogging at right support)
    // The signs follow the convention: positive moment causes compression on top fiber
    const V = w * L / 2;
    const M = w * L * L / 12;
    
    return [0, V, -M, 0, V, M];
}

/**
 * Fixed-end forces for a point load at distance 'a' from node 1
 * @param {number} P - Point load (N, positive downward)
 * @param {number} a - Distance from node 1 (m)
 * @param {number} L - Beam length (m)
 * @returns {number[]} Fixed-end forces [N1, V1, M1, N2, V2, M2]
 */
function fixedEndForcesPointLoad(P, a, L) {
    const b = L - a;
    const L2 = L * L;
    const L3 = L * L * L;
    
    const V1 = P * b * b * (3 * a + b) / L3;
    const V2 = P * a * a * (a + 3 * b) / L3;
    const M1 = -P * a * b * b / L2;
    const M2 = P * a * a * b / L2;
    
    return [0, V1, M1, 0, V2, M2];
}

/**
 * Transform displacements from global to local coordinates
 * @param {number[]} globalDisp - [u1, v1, θ1, u2, v2, θ2] in global coords
 * @param {number} angle - Rotation angle from global to local (radians)
 * @returns {number[]} Local displacements
 */
function globalToLocal(globalDisp, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    
    return [
        globalDisp[0] * c + globalDisp[1] * s,   // u1_local
        -globalDisp[0] * s + globalDisp[1] * c,  // v1_local
        globalDisp[2],                            // θ1 (unchanged)
        globalDisp[3] * c + globalDisp[4] * s,   // u2_local
        -globalDisp[3] * s + globalDisp[4] * c,  // v2_local
        globalDisp[5]                             // θ2 (unchanged)
    ];
}

/**
 * Multiply matrix by vector
 */
function matVecMul(mat, vec) {
    const result = [];
    for (let i = 0; i < mat.length; i++) {
        let sum = 0;
        for (let j = 0; j < vec.length; j++) {
            sum += mat[i][j] * vec[j];
        }
        result.push(sum);
    }
    return result;
}

/**
 * Calculate internal forces for a beam element using the STIFFNESS METHOD
 * f = K · d (element forces = stiffness matrix × nodal displacements)
 * 
 * @param {Object} beam - Beam object with startNode and endNode
 * @param {Object} displacements - Map of nodeId to displacement {dx, dy, dz, rx, ry, rz}
 * @param {Object} material - {E: elastic modulus in Pa}
 * @param {Object} section - {A, I} or {width, height} in meters
 * @param {Array} loads - Array of loads on this beam [{type, magnitude, direction, position}]
 * @param {Map} nodeUuidToIndex - Map of node UUID to 0-based index (same indexing as sent to CalculiX)
 * @returns {Object} {axial, shear_start, shear_end, moment_start, moment_end}
 */
export function calculateBeamInternalForces(beam, displacements, material, section, loads = [], nodeUuidToIndex = null) {
    const startPos = beam.userData.startNode?.position || beam.userData.startPos;
    const endPos = beam.userData.endNode?.position || beam.userData.endPos;
    
    if (!startPos || !endPos) {
        console.warn('Beam missing position data');
        return null;
    }
    
    // Get beam properties
    const L = startPos.distanceTo(endPos);
    const E = material.E || 210e9; // Default steel
    const b = section.width || 0.2;
    const h = section.height || 0.3;
    const A = section.A || (b * h);
    const I = section.I || (b * h * h * h / 12);
    
    // Get beam direction vector
    const dx = endPos.x - startPos.x;
    const dy = endPos.y - startPos.y;
    const dz = endPos.z - startPos.z;
    
    // Determine if beam is vertical (column) or horizontal
    const horizontalLength = Math.sqrt(dx*dx + dz*dz);
    const isVertical = Math.abs(dy) > horizontalLength;
    
    // Get node indices for displacement lookup
    // Use UUID-based index if mapping provided (matches CalculiX node ordering),
    // otherwise fall back to userData.id (may be wrong if IDs don't match iteration order)
    let startNodeId, endNodeId;
    if (nodeUuidToIndex && beam.userData.startNode && beam.userData.endNode) {
        startNodeId = nodeUuidToIndex.get(beam.userData.startNode.uuid);
        endNodeId = nodeUuidToIndex.get(beam.userData.endNode.uuid);
        if (startNodeId === undefined) startNodeId = 0;
        if (endNodeId === undefined) endNodeId = 0;
    } else {
        // Fallback to old behavior
        startNodeId = beam.userData.startNode?.userData?.id ?? 0;
        endNodeId = beam.userData.endNode?.userData?.id ?? 0;
    }
    
    // Get displacements from CalculiX results
    const d1 = displacements[startNodeId] || {dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0};
    const d2 = displacements[endNodeId] || {dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0};
    
    console.log(`Beam node index ${startNodeId} -> ${endNodeId}: d1=(${d1.dx.toExponential(3)}, ${d1.dy.toExponential(3)}, ${d1.dz.toExponential(3)}, rz=${d1.rz.toExponential(3)}), d2=(${d2.dx.toExponential(3)}, ${d2.dy.toExponential(3)}, ${d2.dz.toExponential(3)}, rz=${d2.rz.toExponential(3)})`);
    
    // Build local displacement vector [u1, v1, θ1, u2, v2, θ2]
    // For 2D beam in XY plane: u=axial (along beam), v=transverse (perpendicular), θ=rotation
    let localDisp;
    let angle;
    
    if (isVertical) {
        // Vertical beam (column) - axial is Y direction, transverse is X
        angle = Math.atan2(dx, dy);
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        localDisp = [
            d1.dy * c + d1.dx * s,    // u1 (axial)
            -d1.dy * s + d1.dx * c,   // v1 (transverse)
            d1.rz,                     // θ1 (rotation about Z)
            d2.dy * c + d2.dx * s,    // u2
            -d2.dy * s + d2.dx * c,   // v2
            d2.rz                      // θ2
        ];
    } else {
        // Horizontal beam - could be along X or Z axis
        if (Math.abs(dz) > Math.abs(dx)) {
            // Beam along Z axis
            angle = Math.atan2(dz, dx);
            const c = Math.cos(angle);
            const s = Math.sin(angle);
            localDisp = [
                d1.dx * c + d1.dz * s,   // u1 (axial)
                d1.dy,                    // v1 (transverse = Y)
                d1.rx * c + d1.rz * s,   // θ1 (rotation)
                d2.dx * c + d2.dz * s,   // u2
                d2.dy,                    // v2
                d2.rx * c + d2.rz * s    // θ2
            ];
        } else {
            // Beam along X axis
            angle = Math.atan2(dy, dx);
            const c = Math.cos(angle);
            const s = Math.sin(angle);
            localDisp = [
                d1.dx * c + d1.dy * s,   // u1 (axial)
                -d1.dx * s + d1.dy * c,  // v1 (transverse)
                d1.rz,                    // θ1
                d2.dx * c + d2.dy * s,   // u2
                -d2.dx * s + d2.dy * c,  // v2
                d2.rz                     // θ2
            ];
        }
    }
    
    console.log(`Local displacements: [${localDisp.map(d => d.toExponential(3)).join(', ')}]`);
    
    // Get element stiffness matrix
    const K = beamStiffnessMatrix(E, A, I, L);
    
    // Calculate element forces from displacements: f = K · d
    const elemForces = matVecMul(K, localDisp);
    
    console.log(`Element forces (K·d): [${elemForces.map(f => f.toExponential(3)).join(', ')}]`);
    
    // Add fixed-end forces from applied loads
    // These are the forces that would exist if the beam ends were fully fixed
    let FEF = [0, 0, 0, 0, 0, 0];
    
    loads.forEach(load => {
        if (load.type === 'distributed') {
            // Convert load to N/m (input is kN/m)
            const w = Math.abs(load.magnitude) * 1000;
            const fef = fixedEndForcesUDL(w, L);
            for (let i = 0; i < 6; i++) FEF[i] += fef[i];
        } else if (load.type === 'point') {
            const P = Math.abs(load.magnitude) * 1000; // kN to N
            const a = (load.position || 0.5) * L;
            const fef = fixedEndForcesPointLoad(P, a, L);
            for (let i = 0; i < 6; i++) FEF[i] += fef[i];
        }
    });
    
    console.log(`Fixed-end forces: [${FEF.map(f => f.toExponential(3)).join(', ')}]`);
    
    // Internal forces = elastic forces + fixed-end forces
    // Sign convention: 
    // - Positive shear: causes clockwise rotation
    // - Positive moment: causes tension on bottom (sagging)
    
    const V1 = elemForces[1] + FEF[1];  // Shear at node 1
    const M1 = elemForces[2] + FEF[2];  // Moment at node 1
    const V2 = elemForces[4] + FEF[4];  // Shear at node 2
    const M2 = elemForces[5] + FEF[5];  // Moment at node 2
    
    console.log(`Internal forces: V1=${(V1/1000).toFixed(2)} kN, M1=${(M1/1000).toFixed(2)} kN·m, V2=${(V2/1000).toFixed(2)} kN, M2=${(M2/1000).toFixed(2)} kN·m`);
    
    return {
        axial: (elemForces[0] - elemForces[3]) / 2,
        shear_start: V1 / 1000,      // Convert N to kN
        shear_end: -V2 / 1000,       // Sign convention for diagrams
        moment_start: M1 / 1000,     // Convert N·m to kN·m
        moment_end: -M2 / 1000,      // Sign convention
        length: L
    };
}

/**
 * Calculate bending moment at any point along the beam
 * Using equilibrium: M(x) = M1 + V1*x - w*x²/2 (for UDL)
 * @param {number} x - Distance from start node (m)
 * @param {Object} forces - Result from calculateBeamInternalForces
 * @param {number} w - UDL intensity (kN/m, positive = downward)
 * @returns {number} Bending moment at x (kN·m)
 */
export function momentAtX(x, forces, w = 0) {
    // M(x) = M_start + V_start * x - w * x² / 2
    return forces.moment_start + forces.shear_start * x - (w * x * x) / 2;
}

/**
 * Calculate shear force at any point along the beam
 * V(x) = V1 - w*x (for UDL)
 * @param {number} x - Distance from start node (m)
 * @param {Object} forces - Result from calculateBeamInternalForces
 * @param {number} w - UDL intensity (kN/m, positive = downward)
 * @returns {number} Shear force at x (kN)
 */
export function shearAtX(x, forces, w = 0) {
    // V(x) = V_start - w * x
    return forces.shear_start - w * x;
}

/**
 * Calculate all beam internal forces from analysis results
 * @param {THREE.Group} beamsGroup - Group containing beam meshes
 * @param {Object} analysisResults - Results from CalculiX
 * @param {Object} material - Material properties {E, nu}
 * @param {Object} section - Section properties {width, height}
 * @param {Map} beamLoads - Map of beam UUID to loads
 * @returns {Array} Array of beam force objects with internal forces and helper functions
 */
export function calculateAllBeamForces(beamsGroup, analysisResults, material, section, beamLoads) {
    if (!analysisResults || !analysisResults.displacements) {
        console.warn('No displacement results available');
        return [];
    }
    
    // Build node UUID to index mapping (same as structure_exporter.js uses)
    // This ensures we use the same node indexing that was sent to CalculiX
    const nodeUuidToIndex = new Map();
    if (window.sceneData && window.sceneData.nodesGroup) {
        window.sceneData.nodesGroup.children.forEach((node, index) => {
            nodeUuidToIndex.set(node.uuid, index);
        });
    }
    console.log('Node UUID to index map built with', nodeUuidToIndex.size, 'entries');
    
    // Build displacement map from node index to displacement object
    const dispMap = {};
    analysisResults.displacements.forEach(d => {
        dispMap[d.node_id] = {
            dx: d.dx || 0,
            dy: d.dy || 0,
            dz: d.dz || 0,
            rx: d.rx || 0,
            ry: d.ry || 0,
            rz: d.rz || 0
        };
    });
    
    console.log('Displacement map:', dispMap);
    
    const results = [];
    
    beamsGroup.children.forEach((beam, idx) => {
        // Get loads for this beam
        const loads = beamLoads?.get(beam.uuid) || [];
        
        const forces = calculateBeamInternalForces(beam, dispMap, material, section, loads, nodeUuidToIndex);
        
        if (forces) {
            const startPos = beam.userData.startNode?.position || beam.userData.startPos;
            const endPos = beam.userData.endNode?.position || beam.userData.endPos;
            
            // Get UDL for moment/shear at point functions
            let udl = 0;
            loads.forEach(load => {
                if (load.type === 'distributed' && load.direction === 'y') {
                    udl += Math.abs(load.magnitude);
                }
            });
            
            // Create result object with all needed properties
            const result = {
                beamIndex: idx,
                beam: beam,
                startPos: startPos.clone(),
                endPos: endPos.clone(),
                length: forces.length,
                loads: loads,
                udl: udl,
                // Internal forces at ends (in N and N·m, will convert to kN in calling code)
                M_start: forces.moment_start * 1000,  // Convert kN·m to N·m for consistency
                M_end: forces.moment_end * 1000,
                V_start: forces.shear_start * 1000,   // Convert kN to N
                V_end: forces.shear_end * 1000,
                N: forces.axial,
                // Helper functions to get moment/shear at any point
                momentAtX: (x) => {
                    // M(x) = M_start + V_start * x - w * x² / 2
                    const w_N = udl * 1000; // kN/m to N/m
                    return forces.moment_start * 1000 + forces.shear_start * 1000 * x - (w_N * x * x) / 2;
                },
                shearAtX: (x) => {
                    // V(x) = V_start - w * x
                    const w_N = udl * 1000;
                    return forces.shear_start * 1000 - w_N * x;
                }
            };
            
            results.push(result);
            
            console.log(`Beam ${idx}: M_start=${(result.M_start/1000).toFixed(2)} kN·m, M_end=${(result.M_end/1000).toFixed(2)} kN·m, V_start=${(result.V_start/1000).toFixed(2)} kN, V_end=${(result.V_end/1000).toFixed(2)} kN`);
        }
    });
    
    return results;
}

/**
 * For simply supported beams with UDL, use closed-form solution
 * This is more accurate when we don't have rotational DOFs
 * @param {number} L - Span length (m)
 * @param {number} w - UDL (kN/m)
 * @returns {Object} {M_max, V_max, M_at_x(x), V_at_x(x)}
 */
export function simplySupportedUDL(L, w) {
    const M_max = w * L * L / 8;  // At midspan
    const V_max = w * L / 2;      // At supports
    
    return {
        M_max,
        V_max,
        // Moment at any point x from left support
        M_at_x: (x) => (w * L / 2) * x - (w * x * x) / 2,
        // Shear at any point x from left support  
        V_at_x: (x) => (w * L / 2) - w * x,
        // Position of max moment
        x_M_max: L / 2
    };
}

/**
 * For fixed-fixed beams with UDL
 */
export function fixedFixedUDL(L, w) {
    const M_support = w * L * L / 12;  // At supports (hogging)
    const M_midspan = w * L * L / 24;  // At midspan (sagging)
    const V_max = w * L / 2;
    
    return {
        M_support,
        M_midspan,
        V_max,
        M_at_x: (x) => -M_support + (w * L / 2) * x - (w * x * x) / 2,
        V_at_x: (x) => (w * L / 2) - w * x
    };
}

/**
 * For propped cantilever (fixed one end, pinned other) with UDL
 */
export function proppedCantileverUDL(L, w) {
    // Fixed at x=0, pinned at x=L
    const R_pinned = 3 * w * L / 8;
    const R_fixed = 5 * w * L / 8;
    const M_fixed = w * L * L / 8;
    
    return {
        M_fixed,
        R_pinned,
        R_fixed,
        M_at_x: (x) => -M_fixed + R_fixed * x - (w * x * x) / 2,
        V_at_x: (x) => R_fixed - w * x
    };
}

// Export for use in analysis_diagrams.js
window.beamAnalysis = {
    calculateBeamInternalForces,
    calculateAllBeamForces,
    momentAtX,
    shearAtX,
    simplySupportedUDL,
    fixedFixedUDL,
    proppedCantileverUDL
};

console.log('Beam analysis module loaded');
