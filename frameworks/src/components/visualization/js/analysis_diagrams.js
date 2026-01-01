/**
 * Analysis Diagrams Module
 * Visualizes bending moment, shear force diagrams and deformed shapes
 */

const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js');

// Store analysis results globally
window.analysisResults = window.analysisResults || null;

// Store diagram data for hover calculations
window.diagramData = {
    momentSpans: [],  // { startPos, endPos, length, udl, M_left, M_right }
    shearSpans: [],   // { startPos, endPos, length, udl, V_left, V_right }
    activeTooltip: null
};

// Update analysis results handler
function handleDiagramAnalysisResults(results) {
    window.analysisResults = results;
    console.log('Analysis diagrams: storing results', results);
}

if (window.registerAnalysisResultsHandler) {
    window.registerAnalysisResultsHandler(handleDiagramAnalysisResults);
}

// Debug function to check support detection
window.debugSupports = function() {
    if (!window.sceneData) {
        console.log('No sceneData');
        return;
    }
    
    console.log('=== DEBUG SUPPORTS ===');
    
    if (window.sceneData.nodesGroup) {
        console.log('Nodes:');
        window.sceneData.nodesGroup.children.forEach((node, i) => {
            console.log(`  Node ${i}: pos=(${node.position.x.toFixed(2)}, ${node.position.y.toFixed(2)}, ${node.position.z.toFixed(2)}), supportType=${node.userData?.supportType}`);
        });
    }
    
    console.log('Constraint symbols in scene:');
    window.sceneData.scene.children.forEach((child, i) => {
        if (child.userData?.isConstraintSymbol || child.userData?.supportType) {
            console.log(`  Symbol ${i}: pos=(${child.position.x.toFixed(2)}, ${child.position.y.toFixed(2)}, ${child.position.z.toFixed(2)}), type=${child.userData.supportType}`);
        }
    });
    
    if (window.sceneData.beamsGroup) {
        console.log('Beams:');
        window.sceneData.beamsGroup.children.forEach((beam, i) => {
            const sp = beam.userData.startNode?.position;
            const ep = beam.userData.endNode?.position;
            if (sp && ep) {
                console.log(`  Beam ${i}: start=(${sp.x.toFixed(2)}, ${sp.y.toFixed(2)}, ${sp.z.toFixed(2)}), end=(${ep.x.toFixed(2)}, ${ep.y.toFixed(2)}, ${ep.z.toFixed(2)})`);
            }
        });
    }
};

/**
 * Create high-resolution text label sprite
 * Uses high DPI canvas for crisp text rendering
 * No background, regular weight text
 */
function createHighResLabel(text, color) {
    const dpr = window.devicePixelRatio || 1;
    const fontSize = 42 * dpr;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Measure text first to size canvas appropriately
    ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width + 20 * dpr;
    const textHeight = fontSize + 20 * dpr;
    
    canvas.width = textWidth;
    canvas.height = textHeight;
    
    // Clear with full transparency - no background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw text (medium weight, not bold)
    ctx.fillStyle = color;
    ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true,
        depthTest: false,
        depthWrite: false
    }));
    
    // Scale sprite based on text length
    const aspect = canvas.width / canvas.height;
    const baseHeight = 0.41;
    sprite.scale.set(baseHeight * aspect, baseHeight, 1);
    
    return sprite;
}

/**
 * Find continuous beam chains (beams connected end-to-end)
 * Returns array of chains, each chain is array of beam indices in order
 * Also includes support types at chain endpoints
 * 
 * IMPORTANT: Only chains HORIZONTAL beams together. Vertical columns are treated
 * as separate elements to ensure symmetric frame analysis results.
 */
function findContinuousBeamChains(beamsGroup) {
    const beams = beamsGroup.children;
    const chains = [];
    const used = new Set();
    
    // Helper to check if two positions are the same (within tolerance)
    const posEqual = (p1, p2, tol = 0.01) => {
        return Math.abs(p1.x - p2.x) < tol && 
               Math.abs(p1.y - p2.y) < tol && 
               Math.abs(p1.z - p2.z) < tol;
    };
    
    // Get beam endpoints
    const getEndpoints = (beam) => {
        const start = beam.userData.startNode?.position || beam.userData.startPos;
        const end = beam.userData.endNode?.position || beam.userData.endPos;
        return { start, end };
    };
    
    // Check if a beam is primarily vertical (column) vs horizontal (beam)
    // A beam is vertical if the Y component of direction dominates
    const isVerticalBeam = (beam) => {
        const ep = getEndpoints(beam);
        if (!ep.start || !ep.end) return false;
        
        const dx = Math.abs(ep.end.x - ep.start.x);
        const dy = Math.abs(ep.end.y - ep.start.y);
        const dz = Math.abs(ep.end.z - ep.start.z);
        
        // Beam is vertical if Y component is dominant (> 70% of length)
        const length = Math.sqrt(dx*dx + dy*dy + dz*dz);
        return length > 0.01 && (dy / length) > 0.7;
    };
    
    // Check if two beams have the same orientation (both horizontal or both vertical)
    const sameOrientation = (beam1, beam2) => {
        return isVerticalBeam(beam1) === isVerticalBeam(beam2);
    };
    
    // Find beam that connects to given position (not the excluded beam)
    // Only connect beams of the same orientation (horizontal-to-horizontal)
    const findConnectedBeam = (pos, excludeIdx, mustBeHorizontal) => {
        for (let i = 0; i < beams.length; i++) {
            if (i === excludeIdx || used.has(i)) continue;
            
            // Only chain horizontal beams with horizontal beams
            const beamIsVertical = isVerticalBeam(beams[i]);
            if (mustBeHorizontal && beamIsVertical) continue;
            if (!mustBeHorizontal && !beamIsVertical) continue;
            
            const ep = getEndpoints(beams[i]);
            if (!ep.start || !ep.end) continue;
            if (posEqual(pos, ep.start)) return { idx: i, fromStart: true };
            if (posEqual(pos, ep.end)) return { idx: i, fromStart: false };
        }
        return null;
    };
    
    // Build chains - process horizontal beams first, then vertical columns
    for (let startIdx = 0; startIdx < beams.length; startIdx++) {
        if (used.has(startIdx)) continue;
        
        const startBeam = beams[startIdx];
        const startIsVertical = isVerticalBeam(startBeam);
        
        // For vertical columns, treat each as a single-span element (no chaining)
        if (startIsVertical) {
            used.add(startIdx);
            chains.push([{ idx: startIdx, reversed: false }]);
            continue;
        }
        
        // For horizontal beams, chain together
        const chain = [{ idx: startIdx, reversed: false }];
        used.add(startIdx);
        
        const ep = getEndpoints(startBeam);
        if (!ep.start || !ep.end) continue;
        
        // Extend chain forward (from end of first beam) - only horizontal beams
        let currentPos = ep.end;
        let lastIdx = startIdx;
        while (true) {
            const next = findConnectedBeam(currentPos, lastIdx, true); // mustBeHorizontal = true
            if (!next) break;
            
            used.add(next.idx);
            chain.push({ idx: next.idx, reversed: !next.fromStart });
            
            const nextEp = getEndpoints(beams[next.idx]);
            currentPos = next.fromStart ? nextEp.end : nextEp.start;
            lastIdx = next.idx;
        }
        
        // Extend chain backward (from start of first beam) - only horizontal beams
        currentPos = ep.start;
        lastIdx = startIdx;
        while (true) {
            const prev = findConnectedBeam(currentPos, lastIdx, true); // mustBeHorizontal = true
            if (!prev) break;
            
            used.add(prev.idx);
            chain.unshift({ idx: prev.idx, reversed: prev.fromStart });
            
            const prevEp = getEndpoints(beams[prev.idx]);
            currentPos = prev.fromStart ? prevEp.start : prevEp.end;
            lastIdx = prev.idx;
        }
        
        chains.push(chain);
    }
    
    return chains;
}

/**
 * Find support type at a given position by checking nodes
 * Returns 'fixed', 'pinned', or 'free'
 * 
 * For beam structures:
 * - Returns 'pinned' or 'fixed' based on constraint at node
 * - Returns 'free' if no constraint (internal continuous connection or cantilever tip)
 */
function getSupportTypeAtPosition(pos, tol = 0.15) {
    if (!window.sceneData) {
        console.log('⚠️ No sceneData found, defaulting to free');
        return 'free';
    }
    
    // Check nodes group first for explicit constraint assignments
    if (window.sceneData.nodesGroup) {
        const nodes = window.sceneData.nodesGroup.children;
        console.log(`🔍 Checking ${nodes.length} nodes for support at (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`);
        
        for (const node of nodes) {
            const nodePos = node.position;
            const dist = Math.sqrt(
                Math.pow(pos.x - nodePos.x, 2) + 
                Math.pow(pos.y - nodePos.y, 2) + 
                Math.pow(pos.z - nodePos.z, 2)
            );
            
            if (dist < tol) {
                // Check node.userData.constraint.type (where constraints are actually stored)
                const constraintType = node.userData?.constraint?.type?.toLowerCase();
                // Also check node.userData.supportType as fallback
                const supportType = node.userData?.supportType?.toLowerCase();
                const effectiveType = constraintType || supportType;
                
                console.log(`✅ Found node at distance ${dist.toFixed(3)}`);
                console.log(`   userData.constraint:`, node.userData?.constraint);
                console.log(`   constraintType: "${constraintType}", supportType: "${supportType}", effective: "${effectiveType}"`);
                
                if (effectiveType === 'pinned') {
                    console.log('📌 Returning: PINNED');
                    return 'pinned';
                }
                if (effectiveType === 'fixed') {
                    console.log('🔒 Returning: FIXED');
                    return 'fixed';
                }
                if (effectiveType === 'roller') {
                    console.log('🛞 Returning: PINNED (roller)');
                    return 'pinned';
                }
                if (effectiveType === 'free') {
                    console.log('🆓 Returning: FREE');
                    return 'free';
                }
                
                // If node has constraint but type not recognized, treat as pinned (supports exist)
                if (node.userData?.constraint) {
                    console.log('❓ Node has constraint but unrecognized type, returning PINNED');
                    return 'pinned';
                }
            }
        }
    }
    
    // Also check scene for constraint symbols directly (use for loop to allow early return)
    if (window.sceneData.scene) {
        const children = window.sceneData.scene.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child.userData?.isConstraintSymbol || child.userData?.supportType) {
                const dist = Math.sqrt(
                    Math.pow(pos.x - child.position.x, 2) + 
                    Math.pow(pos.y - child.position.y, 2) + 
                    Math.pow(pos.z - child.position.z, 2)
                );
                if (dist < tol) {
                    const st = (child.userData.supportType || '').toLowerCase();
                    console.log('Found constraint symbol at distance', dist.toFixed(3), 'type:', st);
                    if (st === 'pinned') return 'pinned';
                    if (st === 'fixed') return 'fixed';
                    if (st === 'roller') return 'pinned';
                    // If it's a constraint symbol, assume it's a support
                    if (child.userData.isConstraintSymbol) return 'pinned';
                }
            }
        }
    }
    
    // Default to 'free' - no explicit support means internal connection or cantilever tip
    console.log('No explicit support found at position, defaulting to free (internal connection)');
    return 'free';
}

/**
 * Show bending moment diagram
 * Handles continuous beams with actual support boundary conditions
 */
export function showBendingMomentDiagram() {
    console.log('=== showBendingMomentDiagram called ===');
    
    if (!window.sceneData || !window.sceneData.scene) {
        console.error('Scene data not available');
        return;
    }
    
    const beamsGroup = window.sceneData.beamsGroup;
    if (!beamsGroup || beamsGroup.children.length === 0) {
        console.error('No beams in scene');
        return;
    }
    
    // Clear existing diagrams
    clearDiagrams();
    
    // Clear stored span data for hover
    window.diagramData.momentSpans = [];
    
    const diagramGroup = new THREE.Group();
    diagramGroup.name = 'bendingMomentDiagram';
    
    // Check if we have analysis results with displacement data
    // The stiffness method uses displacements (including rotations) to calculate internal forces
    const hasDisplacements = window.analysisResults && 
                             window.analysisResults.displacements && 
                             window.analysisResults.displacements.length > 0;
    
    // Check if any rotations are non-zero - if not, stiffness method won't give correct results
    // for pinned supports (it will just return fixed-end forces)
    let hasUsefulRotations = false;
    if (hasDisplacements) {
        hasUsefulRotations = window.analysisResults.displacements.some(d => 
            Math.abs(d.rx || 0) > 1e-10 || Math.abs(d.ry || 0) > 1e-10 || Math.abs(d.rz || 0) > 1e-10
        );
    }
    
    console.log('🔄 showBendingMomentDiagram: hasDisplacements =', hasDisplacements, ', hasUsefulRotations =', hasUsefulRotations);
    
    // Only use stiffness method if we have actual rotation data from CalculiX
    // Without rotations, pinned supports would incorrectly show fixed-end moments
    if (hasDisplacements && hasUsefulRotations) {
        console.log('📈 Using STIFFNESS METHOD with displacement results (has rotations)');
        showBendingMomentFromResults(diagramGroup, beamsGroup);
    } else {
        if (hasDisplacements && !hasUsefulRotations) {
            console.log('⚠️ CalculiX returned zero rotations - falling back to analytical method');
        }
        console.log('📐 Using ANALYTICAL calculation with support conditions');
        // Use analytical formulas that correctly handle pinned vs fixed supports
        showBendingMomentFromLoads(diagramGroup, beamsGroup);
    }
    
    window.sceneData.scene.add(diagramGroup);
    console.log('Bending moment diagram added to scene');
    
    // Initialize hover events
    initDiagramHover();
}

/**
 * Show bending moment diagram using actual analysis results
 * Uses direct stiffness method: f = K·d + fixed-end forces
 * This calculates internal forces properly from nodal displacements
 */
function showBendingMomentFromResults(diagramGroup, beamsGroup) {
    console.log('=== Using stiffness method for moment calculation ===');
    
    // Check if beam analysis module is loaded
    if (!window.beamAnalysis) {
        console.error('Beam analysis module not loaded, falling back to loads-based calculation');
        showBendingMomentFromLoads(diagramGroup, beamsGroup);
        return;
    }
    
    // Get material properties (steel default)
    const material = window.currentMaterial || { E: 210e9 }; // Pa
    
    // Get beam section properties
    // Default to 250UB31 Steel I-Beam if not specified
    const defaultSection = { 
        width: 0.146, 
        height: 0.252, 
        flangeThickness: 0.0086, 
        webThickness: 0.0061,
        sectionType: 'IBeam',
        A: 0.004, // approx area for 250UB31
        I: 44.5e-6 // Ixx for 250UB31
    };
    
    const beamSection = window.currentBeamSection || defaultSection;
    const b = beamSection.width || defaultSection.width;
    const h = beamSection.height || defaultSection.height;
    
    // Calculate properties based on section type if not explicitly provided
    let A, I;
    
    if (beamSection.A && beamSection.I) {
        A = beamSection.A;
        I = beamSection.I;
    } else if (beamSection.sectionType === 'IBeam' || (!beamSection.sectionType && defaultSection.sectionType === 'IBeam')) {
        // I-Beam calculation
        const tf = beamSection.flangeThickness || defaultSection.flangeThickness;
        const tw = beamSection.webThickness || defaultSection.webThickness;
        // Area = 2*flanges + web
        A = 2 * b * tf + (h - 2 * tf) * tw;
        // Ixx = (b*h^3 - (b-tw)*(h-2tf)^3)/12
        I = (b * Math.pow(h, 3) - (b - tw) * Math.pow(h - 2 * tf, 3)) / 12;
    } else {
        // Rectangular default
        A = b * h;
        I = b * h * h * h / 12;
    }
    
    const section = { A, I, width: b, height: h };
    
    console.log(`Material: E = ${(material.E / 1e9).toFixed(0)} GPa`);
    console.log(`Section: ${b}m × ${h}m, A = ${section.A.toFixed(4)} m², I = ${section.I.toExponential(4)} m⁴`);
    
    // Calculate internal forces using stiffness method
    const beamForceResults = window.beamAnalysis.calculateAllBeamForces(
        beamsGroup,
        window.analysisResults,
        material,
        section,
        window.beamLoads
    );
    
    console.log(`Calculated forces for ${beamForceResults.length} beams`);
    
    // Find global max moment for diagram scaling
    let globalMaxMoment = 0.1;
    beamForceResults.forEach(bf => {
        // Check max moment along the beam (at 10 points)
        for (let i = 0; i <= 10; i++) {
            const t = i / 10;
            const x = t * bf.length;
            const M = bf.momentAtX(x);
            globalMaxMoment = Math.max(globalMaxMoment, Math.abs(M));
        }
    });
    
    // Convert to kN·m for display
    globalMaxMoment = globalMaxMoment / 1000;
    
    // Calculate average beam length for diagram scaling
    let totalLength = 0;
    let beamCount = 0;
    beamsGroup.children.forEach(beam => {
        const startPos = beam.userData.startNode?.position || beam.userData.startPos;
        const endPos = beam.userData.endNode?.position || beam.userData.endPos;
        if (startPos && endPos) {
            totalLength += startPos.distanceTo(endPos);
            beamCount++;
        }
    });
    const avgLength = beamCount > 0 ? totalLength / beamCount : 1;
    
    // Scale diagram to be clearly visible (target ~30% of beam length at max moment)
    const diagramScale = (avgLength * 0.3) / Math.max(globalMaxMoment, 0.1);
    
    console.log(`Max moment: ${globalMaxMoment.toFixed(2)} kN·m, Avg length: ${avgLength.toFixed(2)}m, Scale: ${diagramScale.toFixed(4)}`);
    
    // Draw moment diagram for each beam
    beamForceResults.forEach(bf => {
        const beam = bf.beam;
        const startPos = bf.startPos;
        const endPos = bf.endPos;
        const length = bf.length;
        
        // Get moments at ends (in kN·m)
        const M_left = bf.M_start / 1000;
        const M_right = bf.M_end / 1000;
        
        // Get UDL for diagram curve calculation
        let udl = 0;
        const loads = window.beamLoads?.get(beam.uuid) || [];
        loads.forEach(load => {
            if (load.type === 'distributed' && load.direction === 'y') {
                udl += Math.abs(load.magnitude);
            }
        });
        
        // Store span data for hover calculations
        window.diagramData.momentSpans.push({
            startPos: startPos.clone(),
            endPos: endPos.clone(),
            length: length,
            udl: udl,
            M_left: M_left,
            M_right: M_right
        });
        
        console.log(`Beam ${bf.beamIndex}: L=${length.toFixed(2)}m, M_left=${M_left.toFixed(2)} kN·m, M_right=${M_right.toFixed(2)} kN·m, w=${udl.toFixed(2)} kN/m`);
        
        // Create moment curve
        const diagram = createContinuousMomentCurve(
            startPos, endPos, length, udl, M_left, M_right,
            { showLeftLabel: true, showRightLabel: true, diagramScale }
        );
        
        if (diagram) {
            diagramGroup.add(diagram);
        }
    });
}

/**
 * Show bending moment diagram by calculating from applied loads (original method)
 */
function showBendingMomentFromLoads(diagramGroup, beamsGroup) {
    // Find continuous beam chains
    const chains = findContinuousBeamChains(beamsGroup);
    console.log('Found', chains.length, 'beam chain(s)');
    
    chains.forEach((chain, chainIdx) => {
        console.log('Chain', chainIdx, ':', chain.length, 'spans');
        
        // Gather span data for this chain
        const spans = [];
        chain.forEach(({ idx, reversed }) => {
            const beam = beamsGroup.children[idx];
            let startPos = beam.userData.startNode?.position || beam.userData.startPos;
            let endPos = beam.userData.endNode?.position || beam.userData.endPos;
            
            if (reversed) {
                [startPos, endPos] = [endPos, startPos];
            }
            
            const length = new THREE.Vector3().subVectors(endPos, startPos).length();
            
            // Get UDL on this span
            const loads = window.beamLoads?.get(beam.uuid) || [];
            let udl = 0;
            loads.forEach(load => {
                if (load.type === 'distributed' && load.direction === 'y') {
                    udl += Math.abs(load.magnitude);
                }
            });
            
            spans.push({ startPos, endPos, length, udl, beamIdx: idx });
        });
        
        if (spans.length === 0) return;
        
        // Check if any span has load
        const hasLoad = spans.some(s => s.udl > 0);
        if (!hasLoad) {
            console.log('Chain', chainIdx, 'has no loads');
            return;
        }
        
        // Get support types at chain endpoints
        const leftSupport = getSupportTypeAtPosition(spans[0].startPos);
        const rightSupport = getSupportTypeAtPosition(spans[spans.length - 1].endPos);
        
        console.log('Support types: left =', leftSupport, ', right =', rightSupport);
        
        // Calculate moments based on support conditions
        let supportMoments;
        supportMoments = calculateBeamMomentsWithSupports(spans, leftSupport, rightSupport);
        
        // Round very small moments to zero for display and numerical consistency
        supportMoments = supportMoments.map(m => Math.abs(m) < 1e-9 ? 0 : m);
        
        console.log('Support moments:', supportMoments.map(m => m.toFixed(4)));
        
        // Log spans for debugging symmetry issues
        console.log('Spans:', spans.map((s, i) => 
            `[${i}] L=${s.length.toFixed(3)}, w=${s.udl.toFixed(2)}`
        ).join(', '));
        
        // Calculate global max moment for consistent scaling across all spans in chain
        let globalMaxMoment = 0.1;
        spans.forEach((span, spanIdx) => {
            const M_left = supportMoments[spanIdx];
            const M_right = supportMoments[spanIdx + 1];
            const L = span.length;
            const w = span.udl;
            
            // Check moments at multiple points along span
            for (let i = 0; i <= 20; i++) {
                const t = i / 20;
                const x = t * L;
                const M = M_left * (1 - t) + M_right * t + w * x * (L - x) / 2;
                globalMaxMoment = Math.max(globalMaxMoment, Math.abs(M));
            }
        });
        
        // Use average span length for diagram scale
        const avgSpanLength = spans.reduce((sum, s) => sum + s.length, 0) / spans.length;
        const diagramScale = (avgSpanLength * 0.25) / globalMaxMoment;
        
        // Draw moment diagram for each span
        spans.forEach((span, spanIdx) => {
            const M_left = supportMoments[spanIdx];
            const M_right = supportMoments[spanIdx + 1];
            
            // Store span data for hover calculations
            window.diagramData.momentSpans.push({
                startPos: span.startPos.clone(),
                endPos: span.endPos.clone(),
                length: span.length,
                udl: span.udl,
                M_left,
                M_right
            });
            
            // Only show right label on the last span to avoid duplicates at continuous supports
            const isLastSpan = spanIdx === spans.length - 1;
            
            const diagram = createContinuousMomentCurve(
                span.startPos, span.endPos, span.length, span.udl, M_left, M_right,
                { showLeftLabel: true, showRightLabel: isLastSpan, diagramScale }
            );
            
            if (diagram) {
                diagramGroup.add(diagram);
            }
        });
    });
}

/**
 * Calculate support moments considering actual boundary conditions
 * Supports: 'fixed' (moment resistance), 'pinned' (no moment), 'free' (cantilever tip)
 */
function calculateBeamMomentsWithSupports(spans, leftSupport, rightSupport) {
    const n = spans.length;
    console.log(`📊 calculateBeamMomentsWithSupports: ${n} span(s), left=${leftSupport}, right=${rightSupport}`);
    
    // Special case: single span
    if (n === 1) {
        const L = spans[0].length;
        const w = spans[0].udl;
        console.log(`   Single span: L=${L.toFixed(2)}m, w=${w.toFixed(2)}kN/m`);
        
        // Cantilever: fixed-free
        if (leftSupport === 'fixed' && rightSupport === 'free') {
            const result = [-w * L * L / 2, 0];
            console.log(`   Fixed-Free cantilever: M=[${result.map(m=>m.toFixed(2)).join(', ')}]`);
            return result;
        }
        if (leftSupport === 'free' && rightSupport === 'fixed') {
            const result = [0, -w * L * L / 2];
            console.log(`   Free-Fixed cantilever: M=[${result.map(m=>m.toFixed(2)).join(', ')}]`);
            return result;
        }
        
        // Fixed-fixed (both ends fixed)
        if (leftSupport === 'fixed' && rightSupport === 'fixed') {
            const M_end = -w * L * L / 12;
            const result = [M_end, M_end];
            console.log(`   🔒🔒 Fixed-Fixed: M=[${result.map(m=>m.toFixed(2)).join(', ')}] (wL²/12 = ${(w*L*L/12).toFixed(2)})`);
            return result;
        }
        
        // Fixed-pinned (propped cantilever)
        if (leftSupport === 'fixed' && rightSupport === 'pinned') {
            const result = [-w * L * L / 8, 0];
            console.log(`   🔒📌 Fixed-Pinned: M=[${result.map(m=>m.toFixed(2)).join(', ')}]`);
            return result;
        }
        if (leftSupport === 'pinned' && rightSupport === 'fixed') {
            const result = [0, -w * L * L / 8];
            console.log(`   📌🔒 Pinned-Fixed: M=[${result.map(m=>m.toFixed(2)).join(', ')}]`);
            return result;
        }
        
        // Simply supported (pinned-pinned or any other combination)
        console.log(`   📌📌 Simply supported (pinned-pinned): M=[0, 0]`);
        return [0, 0];
    }
    
    // Multi-span continuous beam
    // Use three-moment equation, but handle end conditions
    return calculateContinuousBeamMomentsWithEnds(spans, leftSupport, rightSupport);
}

/**
 * Calculate continuous beam moments with proper end conditions
 */
function calculateContinuousBeamMomentsWithEnds(spans, leftSupport, rightSupport) {
    const n = spans.length;
    
    // For multi-span, we need to solve the three-moment equations
    // Interior supports are always fixed (continuous)
    // End supports depend on boundary conditions
    
    // Number of unknowns depends on end conditions
    // If end is fixed: moment is unknown (add equation for zero slope)
    // If end is pinned: moment is 0 (known)
    // If end is free: moment is 0, but also no support reaction
    
    const leftFixed = leftSupport === 'fixed';
    const rightFixed = rightSupport === 'fixed';
    
    // Build system of equations
    // For each interior support i (1 to n-1), we have three-moment equation
    // If left end is fixed, add equation for zero slope at left
    // If right end is fixed, add equation for zero slope at right
    
    const numInterior = n - 1;
    const numUnknowns = numInterior + (leftFixed ? 1 : 0) + (rightFixed ? 1 : 0);
    
    if (numUnknowns === 0) {
        // All pinned ends, no interior supports - just zeros
        return Array(n + 1).fill(0);
    }
    
    // Build matrix system
    // Unknowns: [M0 if leftFixed, M1, M2, ..., M_{n-1}, Mn if rightFixed]
    const A = [];
    const b = [];
    
    let unknownIdx = 0;
    const momentIdxMap = {}; // maps support index to unknown index
    
    if (leftFixed) {
        momentIdxMap[0] = unknownIdx++;
    }
    for (let i = 1; i < n; i++) {
        momentIdxMap[i] = unknownIdx++;
    }
    if (rightFixed) {
        momentIdxMap[n] = unknownIdx++;
    }
    
    // Three-moment equations for interior supports (1 to n-1)
    for (let i = 1; i < n; i++) {
        const row = new Array(numUnknowns).fill(0);
        const L_i = spans[i - 1].length;
        const L_i1 = spans[i].length;
        const w_i = spans[i - 1].udl;
        const w_i1 = spans[i].udl;
        
        // Coefficients for M_{i-1}, M_i, M_{i+1}
        if (momentIdxMap[i - 1] !== undefined) {
            row[momentIdxMap[i - 1]] = L_i;
        }
        row[momentIdxMap[i]] = 2 * (L_i + L_i1);
        if (momentIdxMap[i + 1] !== undefined) {
            row[momentIdxMap[i + 1]] = L_i1;
        }
        
        // If M_{i-1} or M_{i+1} is 0 (pinned end), don't add anything
        // RHS
        const rhs = -(w_i * Math.pow(L_i, 3) + w_i1 * Math.pow(L_i1, 3)) / 4;
        
        A.push(row);
        b.push(rhs);
    }
    
    // If left end is fixed, add zero-slope condition at left
    if (leftFixed) {
        const row = new Array(numUnknowns).fill(0);
        const L_0 = spans[0].length;
        const w_0 = spans[0].udl;
        
        // Zero slope at left: 2*M_0*L_0 + M_1*L_0 = -w_0*L_0³/4
        row[momentIdxMap[0]] = 2 * L_0;
        if (momentIdxMap[1] !== undefined) {
            row[momentIdxMap[1]] = L_0;
        }
        
        const rhs = -w_0 * Math.pow(L_0, 3) / 4;
        A.push(row);
        b.push(rhs);
    }
    
    // If right end is fixed, add zero-slope condition at right
    if (rightFixed) {
        const row = new Array(numUnknowns).fill(0);
        const L_n = spans[n - 1].length;
        const w_n = spans[n - 1].udl;
        
        // Zero slope at right: M_{n-1}*L_n + 2*M_n*L_n = -w_n*L_n³/4
        if (momentIdxMap[n - 1] !== undefined) {
            row[momentIdxMap[n - 1]] = L_n;
        }
        row[momentIdxMap[n]] = 2 * L_n;
        
        const rhs = -w_n * Math.pow(L_n, 3) / 4;
        A.push(row);
        b.push(rhs);
    }
    
    // Solve system using Gaussian elimination
    const solution = solveLinearSystem(A, b);
    
    // Build full moments array
    const moments = [];
    for (let i = 0; i <= n; i++) {
        if (momentIdxMap[i] !== undefined) {
            moments.push(solution[momentIdxMap[i]]);
        } else {
            moments.push(0); // pinned or free end
        }
    }
    
    return moments;
}

/**
 * Solve linear system Ax = b using Gaussian elimination with partial pivoting
 * Includes numerical cleanup to ensure symmetric structures produce symmetric results
 */
function solveLinearSystem(A, b) {
    const n = b.length;
    if (n === 0) return [];
    
    // Augmented matrix - use higher precision by avoiding unnecessary operations
    const aug = A.map((row, i) => [...row, b[i]]);
    
    // Forward elimination with partial pivoting
    for (let col = 0; col < n; col++) {
        // Find pivot
        let maxRow = col;
        for (let row = col + 1; row < n; row++) {
            if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
                maxRow = row;
            }
        }
        [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
        
        if (Math.abs(aug[col][col]) < 1e-12) continue; // Skip if pivot is ~0
        
        // Eliminate below
        for (let row = col + 1; row < n; row++) {
            const factor = aug[row][col] / aug[col][col];
            for (let j = col; j <= n; j++) {
                aug[row][j] -= factor * aug[col][j];
            }
        }
    }
    
    // Back substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        let sum = aug[i][n];
        for (let j = i + 1; j < n; j++) {
            sum -= aug[i][j] * x[j];
        }
        x[i] = Math.abs(aug[i][i]) > 1e-12 ? sum / aug[i][i] : 0;
    }
    
    // Clean up very small values that are essentially zero (numerical noise)
    // This ensures symmetric structures produce exactly symmetric results
    const tolerance = 1e-9;
    for (let i = 0; i < n; i++) {
        if (Math.abs(x[i]) < tolerance) {
            x[i] = 0;
        }
    }
    
    return x;
}

/**
 * Calculate support moments for continuous beam using three-moment equation
 * For UDL on all spans with pinned ends
 */
function calculateContinuousBeamMoments(spans) {
    const n = spans.length; // number of spans
    const numSupports = n + 1;
    
    // Support moments array (M0, M1, ..., Mn)
    // M0 = Mn = 0 (pinned ends)
    // Interior moments calculated using three-moment equation
    
    if (n === 1) {
        return [0, 0];
    }
    
    // For 2-span continuous beam with UDL, special case
    if (n === 2) {
        const L1 = spans[0].length;
        const L2 = spans[1].length;
        const w1 = spans[0].udl;
        const w2 = spans[1].udl;
        
        // Three-moment equation for middle support:
        // M1 * (L1 + L2) = -(w1*L1³ + w2*L2³) / 4
        // But with M0 = M2 = 0:
        // 2*M1*(L1 + L2) = -w1*L1³/4 - w2*L2³/4
        const M1 = -(w1 * Math.pow(L1, 3) + w2 * Math.pow(L2, 3)) / (4 * (L1 + L2));
        
        return [0, M1, 0];
    }
    
    // General case: solve system of equations using matrix method
    // Three-moment equation: M_{i-1}*L_i + 2*M_i*(L_i + L_{i+1}) + M_{i+1}*L_{i+1} = -w_i*L_i³/4 - w_{i+1}*L_{i+1}³/4
    
    // Build tridiagonal system for interior supports (1 to n-1)
    const numInterior = n - 1;
    if (numInterior === 0) {
        return [0, 0];
    }
    
    // Coefficient matrix (tridiagonal)
    const a = []; // sub-diagonal
    const b = []; // diagonal
    const c = []; // super-diagonal
    const d = []; // right-hand side
    
    for (let i = 0; i < numInterior; i++) {
        const spanLeft = spans[i];
        const spanRight = spans[i + 1];
        const L_i = spanLeft.length;
        const L_i1 = spanRight.length;
        const w_i = spanLeft.udl;
        const w_i1 = spanRight.udl;
        
        a.push(i > 0 ? L_i : 0);
        b.push(2 * (L_i + L_i1));
        c.push(i < numInterior - 1 ? L_i1 : 0);
        d.push(-(w_i * Math.pow(L_i, 3) + w_i1 * Math.pow(L_i1, 3)) / 4);
    }
    
    // Solve tridiagonal system using Thomas algorithm
    const interiorMoments = solveTridiagonal(a, b, c, d);
    
    // Build full moments array
    const moments = [0];
    interiorMoments.forEach(m => moments.push(m));
    moments.push(0);
    
    return moments;
}

/**
 * Thomas algorithm for tridiagonal system
 */
function solveTridiagonal(a, b, c, d) {
    const n = d.length;
    if (n === 0) return [];
    if (n === 1) return [d[0] / b[0]];
    
    // Forward elimination
    const c_prime = [c[0] / b[0]];
    const d_prime = [d[0] / b[0]];
    
    for (let i = 1; i < n; i++) {
        const denom = b[i] - a[i] * c_prime[i - 1];
        c_prime.push(i < n - 1 ? c[i] / denom : 0);
        d_prime.push((d[i] - a[i] * d_prime[i - 1]) / denom);
    }
    
    // Back substitution
    const x = new Array(n);
    x[n - 1] = d_prime[n - 1];
    for (let i = n - 2; i >= 0; i--) {
        x[i] = d_prime[i] - c_prime[i] * x[i + 1];
    }
    
    return x;
}

/**
 * Create moment curve for a span of continuous beam
 * With known end moments M_left and M_right
 * Colors: Teal for sagging (positive), blue for hogging (negative)
 * @param {Object} options - { showLeftLabel: bool, showRightLabel: bool, diagramScale: number }
 */
function createContinuousMomentCurve(startPos, endPos, L, w, M_left, M_right, options = {}) {
    const { showLeftLabel = true, showRightLabel = true, diagramScale: passedScale } = options;
    const group = new THREE.Group();
    
    // Determine up direction based on beam orientation
    const dir = new THREE.Vector3().subVectors(endPos, startPos).normalize();
    let upDir = new THREE.Vector3(0, 1, 0);
    
    // If beam is vertical (parallel to Y), use X axis for diagram
    if (Math.abs(dir.y) > 0.9) {
        upDir.set(1, 0, 0);
    }
    
    // Colors - teal for sagging, blue for hogging (diagram fill colors)
    const saggingColor = 0x42f5b9;  // Teal for positive/sagging moments
    const hoggingColor = 0x002fff;  // Blue for negative/hogging moments
    
    // For span with UDL w and end moments M_left, M_right:
    // M(x) = M_left + (M_right - M_left)*x/L + w*x*(L-x)/2
    
    const segments = 40;
    const moments = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = t * L;
        const M = M_left * (1 - t) + M_right * t + w * x * (L - x) / 2;
        moments.push(M);
    }
    
    // Use passed scale for consistency, or calculate locally if not provided
    let diagramScale = passedScale;
    if (!diagramScale) {
        const maxAbsMoment = Math.max(...moments.map(Math.abs), 0.1);
        diagramScale = (L * 0.25) / maxAbsMoment;
    }
    
    const curvePoints = [];
    const fillPoints = [];
    
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const pos = new THREE.Vector3().lerpVectors(startPos, endPos, t);
        const M = moments[i];
        
        // Positive moment (sagging) shown below, negative (hogging) shown above
        const offset = M * diagramScale;
        const offsetPos = pos.clone().add(upDir.clone().multiplyScalar(-offset));
        curvePoints.push(offsetPos);
        fillPoints.push(pos.clone());
    }
    
    // Create shaded fill using triangles
    // Split into positive and negative regions
    for (let i = 0; i < segments; i++) {
        const M_curr = moments[i];
        const M_next = moments[i + 1];
        
        // Determine color based on moment sign
        const avgMoment = (M_curr + M_next) / 2;
        const fillColor = avgMoment >= 0 ? saggingColor : hoggingColor;
        
        // Create triangle strip for this segment
        const vertices = new Float32Array([
            fillPoints[i].x, fillPoints[i].y, fillPoints[i].z,
            curvePoints[i].x, curvePoints[i].y, curvePoints[i].z,
            fillPoints[i + 1].x, fillPoints[i + 1].y, fillPoints[i + 1].z,
            
            fillPoints[i + 1].x, fillPoints[i + 1].y, fillPoints[i + 1].z,
            curvePoints[i].x, curvePoints[i].y, curvePoints[i].z,
            curvePoints[i + 1].x, curvePoints[i + 1].y, curvePoints[i + 1].z,
        ]);
        
        const fillGeom = new THREE.BufferGeometry();
        fillGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        const fillMat = new THREE.MeshBasicMaterial({ 
            color: fillColor, 
            transparent: true, 
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        group.add(new THREE.Mesh(fillGeom, fillMat));
        
        // Draw outline segment with matching color
        const segmentPoints = [curvePoints[i], curvePoints[i + 1]];
        const segmentGeometry = new THREE.BufferGeometry().setFromPoints(segmentPoints);
        const segmentMaterial = new THREE.LineBasicMaterial({ color: fillColor, linewidth: 2 });
        group.add(new THREE.Line(segmentGeometry, segmentMaterial));
    }
    
    // Find max positive moment (sagging) for label
    let maxPositiveMoment = 0;
    let maxPositiveIdx = segments / 2;
    for (let i = 0; i <= segments; i++) {
        if (moments[i] > maxPositiveMoment) {
            maxPositiveMoment = moments[i];
            maxPositiveIdx = i;
        }
    }
    
    // Label at max positive moment if significant
    if (maxPositiveMoment > 0.1) {
        const label = createHighResLabel(`${maxPositiveMoment.toFixed(1)} kNm`, '#002266');
        label.position.copy(curvePoints[maxPositiveIdx]);
        label.position.add(upDir.clone().multiplyScalar(-0.5));
        group.add(label);
    }
    
    // Labels at supports if there's significant negative moment
    // Only show if the option is enabled (to avoid duplicates at continuous supports)
    if (showLeftLabel && Math.abs(M_left) > 0.1) {
        const labelLeft = createHighResLabel(`${M_left.toFixed(1)} kNm`, '#002266');
        labelLeft.position.copy(curvePoints[0]);
        labelLeft.position.add(upDir.clone().multiplyScalar(0.4));
        group.add(labelLeft);
    }
    
    if (showRightLabel && Math.abs(M_right) > 0.1) {
        const labelRight = createHighResLabel(`${M_right.toFixed(1)} kNm`, '#002266');
        labelRight.position.copy(curvePoints[segments]);
        labelRight.position.add(upDir.clone().multiplyScalar(0.4));
        group.add(labelRight);
    }
    
    return group;
}

// Also expose on window for eval calls
window.showBendingMomentDiagram = showBendingMomentDiagram;

/**
 * Show shear force diagram
 * Handles continuous beams with fixed interior connections
 */
export function showShearForceDiagram() {
    console.log('=== showShearForceDiagram called ===');
    
    if (!window.sceneData || !window.sceneData.scene) {
        console.error('Scene data not available');
        return;
    }
    
    const beamsGroup = window.sceneData.beamsGroup;
    if (!beamsGroup || beamsGroup.children.length === 0) {
        console.error('No beams in scene');
        return;
    }
    
    clearDiagrams();
    
    // Clear stored span data for hover
    window.diagramData.shearSpans = [];
    
    const diagramGroup = new THREE.Group();
    diagramGroup.name = 'shearForceDiagram';
    
    // Check if we have analysis results with displacement data
    const hasDisplacements = window.analysisResults && 
                             window.analysisResults.displacements && 
                             window.analysisResults.displacements.length > 0;
    
    // Check if any rotations are non-zero - if not, stiffness method won't give correct results
    let hasUsefulRotations = false;
    if (hasDisplacements) {
        hasUsefulRotations = window.analysisResults.displacements.some(d => 
            Math.abs(d.rx || 0) > 1e-10 || Math.abs(d.ry || 0) > 1e-10 || Math.abs(d.rz || 0) > 1e-10
        );
    }
    
    // Only use stiffness method if we have actual rotation data from CalculiX
    if (hasDisplacements && hasUsefulRotations) {
        console.log('Using stiffness method with displacement results for shear diagram');
        showShearForceFromResults(diagramGroup, beamsGroup);
    } else {
        console.log('Using analytical calculation for shear (no rotations from CalculiX)');
        showShearForceFromLoads(diagramGroup, beamsGroup);
    }
    
    window.sceneData.scene.add(diagramGroup);
    console.log('Shear force diagram added to scene');
}

/**
 * Show shear force diagram using actual analysis results
 * Uses direct stiffness method: f = K·d + fixed-end forces
 */
function showShearForceFromResults(diagramGroup, beamsGroup) {
    console.log('=== Using stiffness method for shear calculation ===');
    
    // Check if beam analysis module is loaded
    if (!window.beamAnalysis) {
        console.error('Beam analysis module not loaded, falling back to loads-based calculation');
        showShearForceFromLoads(diagramGroup, beamsGroup);
        return;
    }
    
    // Get material properties (steel default)
    const material = window.currentMaterial || { E: 210e9 }; // Pa
    
    // Get beam section properties
    // Default to 250UB31 Steel I-Beam if not specified
    const defaultSection = { 
        width: 0.146, 
        height: 0.252, 
        flangeThickness: 0.0086, 
        webThickness: 0.0061,
        sectionType: 'IBeam',
        A: 0.004, // approx area for 250UB31
        I: 44.5e-6 // Ixx for 250UB31
    };
    
    const beamSection = window.currentBeamSection || defaultSection;
    const b = beamSection.width || defaultSection.width;
    const h = beamSection.height || defaultSection.height;
    
    // Calculate properties based on section type if not explicitly provided
    let A, I;
    
    if (beamSection.A && beamSection.I) {
        A = beamSection.A;
        I = beamSection.I;
    } else if (beamSection.sectionType === 'IBeam' || (!beamSection.sectionType && defaultSection.sectionType === 'IBeam')) {
        // I-Beam calculation
        const tf = beamSection.flangeThickness || defaultSection.flangeThickness;
        const tw = beamSection.webThickness || defaultSection.webThickness;
        // Area = 2*flanges + web
        A = 2 * b * tf + (h - 2 * tf) * tw;
        // Ixx = (b*h^3 - (b-tw)*(h-2tf)^3)/12
        I = (b * Math.pow(h, 3) - (b - tw) * Math.pow(h - 2 * tf, 3)) / 12;
    } else {
        // Rectangular default
        A = b * h;
        I = b * h * h * h / 12;
    }
    
    const section = { A, I, width: b, height: h };
    
    console.log(`Material: E = ${(material.E / 1e9).toFixed(0)} GPa`);
    console.log(`Section: ${b}m × ${h}m, A = ${section.A.toFixed(4)} m², I = ${section.I.toExponential(4)} m⁴`);
    
    // Calculate internal forces using stiffness method
    const beamForceResults = window.beamAnalysis.calculateAllBeamForces(
        beamsGroup,
        window.analysisResults,
        material,
        section,
        window.beamLoads
    );
    
    console.log(`Calculated forces for ${beamForceResults.length} beams`);
    
    // Find global max shear for diagram scaling
    let globalMaxShear = 0.1;
    beamForceResults.forEach(bf => {
        // Check max shear along the beam (at start and end, and middle for UDL)
        globalMaxShear = Math.max(globalMaxShear, Math.abs(bf.V_start), Math.abs(bf.V_end));
    });
    
    // Convert to kN for display
    globalMaxShear = globalMaxShear / 1000;
    
    // Calculate average beam length for diagram scaling
    let totalLength = 0;
    let beamCount = 0;
    beamsGroup.children.forEach(beam => {
        const startPos = beam.userData.startNode?.position || beam.userData.startPos;
        const endPos = beam.userData.endNode?.position || beam.userData.endPos;
        if (startPos && endPos) {
            totalLength += startPos.distanceTo(endPos);
            beamCount++;
        }
    });
    const avgLength = beamCount > 0 ? totalLength / beamCount : 1;
    
    // Scale diagram to be clearly visible (target ~30% of beam length at max shear)
    const diagramScale = (avgLength * 0.3) / Math.max(globalMaxShear, 0.1);
    
    console.log(`Max shear: ${globalMaxShear.toFixed(2)} kN, Avg length: ${avgLength.toFixed(2)}m, Scale: ${diagramScale.toFixed(4)}`);
    
    // Draw shear diagram for each beam
    beamForceResults.forEach(bf => {
        const beam = bf.beam;
        const startPos = bf.startPos;
        const endPos = bf.endPos;
        const length = bf.length;
        
        // Get shear forces at ends (in kN)
        const V_left = bf.V_start / 1000;
        const V_right = bf.V_end / 1000;
        
        // Get UDL for diagram slope calculation
        let udl = 0;
        const loads = window.beamLoads?.get(beam.uuid) || [];
        loads.forEach(load => {
            if (load.type === 'distributed' && load.direction === 'y') {
                udl += Math.abs(load.magnitude);
            }
        });
        
        // Store span data for hover calculations
        window.diagramData.shearSpans.push({
            startPos: startPos.clone(),
            endPos: endPos.clone(),
            length: length,
            udl: udl,
            V_left: V_left,
            V_right: V_right,
            M_left: bf.M_start / 1000,
            M_right: bf.M_end / 1000
        });
        
        console.log(`Beam ${bf.beamIndex}: L=${length.toFixed(2)}m, V_left=${V_left.toFixed(2)} kN, V_right=${V_right.toFixed(2)} kN, w=${udl.toFixed(2)} kN/m`);
        
        // Create shear curve with override values in kN
        const diagram = createContinuousShearCurve(
            startPos, endPos, length, udl, 0, 0,
            { diagramScale, overrideV_left: V_left, overrideV_right: V_right }
        );
        
        if (diagram) {
            diagramGroup.add(diagram);
        }
    });
}

/**
 * Show shear force diagram by calculating from applied loads (original method)
 */
function showShearForceFromLoads(diagramGroup, beamsGroup) {
    // Find continuous beam chains
    const chains = findContinuousBeamChains(beamsGroup);
    console.log('Drawing shear force diagram for', chains.length, 'chain(s)');
    
    chains.forEach((chain, chainIdx) => {
        // Gather span data for this chain
        const spans = [];
        chain.forEach(({ idx, reversed }) => {
            const beam = beamsGroup.children[idx];
            let startPos = beam.userData.startNode?.position || beam.userData.startPos;
            let endPos = beam.userData.endNode?.position || beam.userData.endPos;
            
            if (reversed) {
                [startPos, endPos] = [endPos, startPos];
            }
            
            const length = new THREE.Vector3().subVectors(endPos, startPos).length();
            
            // Get UDL on this span
            const loads = window.beamLoads?.get(beam.uuid) || [];
            let udl = 0;
            loads.forEach(load => {
                if (load.type === 'distributed' && load.direction === 'y') {
                    udl += Math.abs(load.magnitude);
                }
            });
            
            spans.push({ startPos, endPos, length, udl, beamIdx: idx });
        });
        
        if (spans.length === 0) return;
        
        const hasLoad = spans.some(s => s.udl > 0);
        if (!hasLoad) return;
        
        // Get support types at chain endpoints
        const leftSupport = getSupportTypeAtPosition(spans[0].startPos);
        const rightSupport = getSupportTypeAtPosition(spans[spans.length - 1].endPos);
        
        // Get support moments using actual boundary conditions
        let supportMoments = calculateBeamMomentsWithSupports(spans, leftSupport, rightSupport);
        
        // Round very small moments to zero for numerical consistency
        supportMoments = supportMoments.map(m => Math.abs(m) < 1e-9 ? 0 : m);
        
        // Calculate global max shear for consistent scaling across all spans in chain
        let globalMaxShear = 0.1;
        spans.forEach((span, spanIdx) => {
            const M_left = supportMoments[spanIdx];
            const M_right = supportMoments[spanIdx + 1];
            const L = span.length;
            const w = span.udl;
            const V_left = w * L / 2 + (M_right - M_left) / L;
            const V_right = -w * L / 2 + (M_right - M_left) / L;
            globalMaxShear = Math.max(globalMaxShear, Math.abs(V_left), Math.abs(V_right));
        });
        
        // Use average span length for diagram scale
        const avgSpanLength = spans.reduce((sum, s) => sum + s.length, 0) / spans.length;
        const diagramScale = (avgSpanLength * 0.25) / globalMaxShear;
        
        // Draw shear diagram for each span
        spans.forEach((span, spanIdx) => {
            const M_left = supportMoments[spanIdx];
            const M_right = supportMoments[spanIdx + 1];
            
            // Calculate shear forces at ends for storage
            const L = span.length;
            const w = span.udl;
            const V_left = w * L / 2 + (M_right - M_left) / L;
            const V_right = -w * L / 2 + (M_right - M_left) / L;
            
            // Store span data for hover calculations
            window.diagramData.shearSpans.push({
                startPos: span.startPos.clone(),
                endPos: span.endPos.clone(),
                length: L,
                udl: w,
                V_left,
                V_right,
                M_left,
                M_right
            });
            
            const diagram = createContinuousShearCurve(
                span.startPos, span.endPos, span.length, span.udl, M_left, M_right,
                { diagramScale }
            );
            
            if (diagram) {
                diagramGroup.add(diagram);
            }
        });
    });
}

window.showShearForceDiagram = showShearForceDiagram;

/**
 * Create shear force diagram for a span of continuous beam
 * Dark green color with transparent shading
 * @param {Object} options - { diagramScale: number, overrideV_left, overrideV_right }
 */
function createContinuousShearCurve(startPos, endPos, L, w, M_left, M_right, options = {}) {
    const { diagramScale: passedScale, overrideV_left, overrideV_right } = options;
    const group = new THREE.Group();
    
    // Determine up direction based on beam orientation
    const dir = new THREE.Vector3().subVectors(endPos, startPos).normalize();
    let upDir = new THREE.Vector3(0, 1, 0);
    
    // If beam is vertical (parallel to Y), use X axis for diagram
    if (Math.abs(dir.y) > 0.9) {
        upDir.set(1, 0, 0);
    }
    
    // Red color for shear force diagram
    const shearColor = 0xff002b;
    const shearColorHex = '#ff002b';
    
    // Shear at any point: V(x) = (M_right - M_left)/L + w*L/2 - w*x
    // Or use override values from analysis results if provided
    let V_left, V_right;
    if (overrideV_left !== undefined && overrideV_right !== undefined) {
        V_left = overrideV_left;
        V_right = overrideV_right;
    } else {
        const momentTerm = (M_right - M_left) / L;
        V_left = momentTerm + w * L / 2;
        V_right = momentTerm - w * L / 2;
    }
    
    console.log(`Span shear: V_left=${V_left.toFixed(2)}, V_right=${V_right.toFixed(2)}`);
    
    // Use passed scale for consistency, or calculate locally if not provided
    let diagramScale = passedScale;
    if (!diagramScale) {
        const maxAbsShear = Math.max(Math.abs(V_left), Math.abs(V_right), 0.1);
        diagramScale = (L * 0.2) / maxAbsShear;
    }
    
    const segments = 20;
    const curvePoints = [];
    const fillPoints = [];
    const shears = [];
    
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const pos = new THREE.Vector3().lerpVectors(startPos, endPos, t);
        
        // Linear shear: V(x) = V_left * (1 - t) + V_right * t
        const V = V_left * (1 - t) + V_right * t;
        shears.push(V);
        
        const offset = V * diagramScale;
        const offsetPos = pos.clone().add(upDir.clone().multiplyScalar(-offset));
        curvePoints.push(offsetPos);
        fillPoints.push(pos.clone());
    }
    
    // Create shaded fill using triangles
    for (let i = 0; i < segments; i++) {
        const vertices = new Float32Array([
            fillPoints[i].x, fillPoints[i].y, fillPoints[i].z,
            curvePoints[i].x, curvePoints[i].y, curvePoints[i].z,
            fillPoints[i + 1].x, fillPoints[i + 1].y, fillPoints[i + 1].z,
            
            fillPoints[i + 1].x, fillPoints[i + 1].y, fillPoints[i + 1].z,
            curvePoints[i].x, curvePoints[i].y, curvePoints[i].z,
            curvePoints[i + 1].x, curvePoints[i + 1].y, curvePoints[i + 1].z,
        ]);
        
        const fillGeom = new THREE.BufferGeometry();
        fillGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        const fillMat = new THREE.MeshBasicMaterial({ 
            color: shearColor, 
            transparent: true, 
            opacity: 0.25,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        group.add(new THREE.Mesh(fillGeom, fillMat));
    }
    
    // Main curve outline (dark green)
    const curveGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const curveMaterial = new THREE.LineBasicMaterial({ color: shearColor, linewidth: 2 });
    group.add(new THREE.Line(curveGeometry, curveMaterial));
    
    // Labels at both ends
    const labelLeft = createHighResLabel(`${V_left.toFixed(1)} kN`, shearColorHex);
    labelLeft.position.copy(curvePoints[0]);
    labelLeft.position.add(upDir.clone().multiplyScalar(V_left > 0 ? -0.5 : 0.5));
    group.add(labelLeft);
    
    const labelRight = createHighResLabel(`${V_right.toFixed(1)} kN`, shearColorHex);
    labelRight.position.copy(curvePoints[segments]);
    labelRight.position.add(upDir.clone().multiplyScalar(V_right > 0 ? -0.5 : 0.5));
    group.add(labelRight);
    
    return group;
}

/**
 * Show deformed shape
 * Calculates deflection from applied loads (UDL gives parabolic deflection)
 * For simply supported beam with UDL: δ_max = 5wL⁴/(384EI) at midspan
 */
export function showDeformedShape() {
    console.log('=== showDeformedShape called ===');
    
    if (!window.sceneData || !window.sceneData.scene) {
        console.error('Scene data not available');
        return;
    }
    
    const beamsGroup = window.sceneData.beamsGroup;
    if (!beamsGroup || beamsGroup.children.length === 0) {
        console.error('No beams in scene');
        return;
    }
    
    clearDiagrams();
    
    const diagramGroup = new THREE.Group();
    diagramGroup.name = 'deformedShape';
    
    console.log('Drawing deformed shape for', beamsGroup.children.length, 'beams');
    
    // Process each beam
    beamsGroup.children.forEach((beam, idx) => {
        const startPos = beam.userData.startNode?.position || beam.userData.startPos;
        const endPos = beam.userData.endNode?.position || beam.userData.endPos;
        
        if (!startPos || !endPos) {
            console.warn('Beam', idx, 'missing position data');
            return;
        }
        
        const beamLength = new THREE.Vector3().subVectors(endPos, startPos).length();
        
        // Get loads on this beam from window.beamLoads
        const beamUuid = beam.uuid;
        const loads = window.beamLoads?.get(beamUuid) || [];
        
        // Calculate total UDL on this beam
        let totalUDL = 0;
        loads.forEach(load => {
            if (load.type === 'distributed' && load.direction === 'y') {
                totalUDL += Math.abs(load.magnitude);
            }
        });
        
        // Get beam properties (E, I) from userData or use defaults
        // E = 210 GPa = 210e9 Pa for steel
        // I = bh³/12 - need cross section from beam properties
        const E = 210e9; // Pa (steel)
        const section = beam.userData.section || { width: 0.3, height: 0.5 };
        const b = section.width || 0.3;
        const h = section.height || 0.5;
        const I = (b * Math.pow(h, 3)) / 12; // m⁴
        
        console.log('Beam', idx, 'Length:', beamLength.toFixed(2), 'm, UDL:', totalUDL, 'kN/m, I:', I.toExponential(3));
        
        if (totalUDL === 0) {
            console.log('No UDL on beam', idx);
            return;
        }
        
        // For simply supported beam with UDL: δ_max = 5wL⁴/(384EI) at midspan
        // w in N/m, L in m, E in Pa, I in m⁴ -> δ in m
        const w = totalUDL * 1000; // kN/m to N/m
        const L = beamLength;
        const maxDeflection = (5 * w * Math.pow(L, 4)) / (384 * E * I); // meters
        const maxDeflectionMm = maxDeflection * 1000; // mm
        
        console.log('Max deflection:', maxDeflectionMm.toFixed(2), 'mm');
        
        // Create deflected shape curve
        const deflectedShape = createDeflectedCurve(startPos, endPos, maxDeflection, beamLength, maxDeflectionMm);
        
        if (deflectedShape) {
            diagramGroup.add(deflectedShape);
        }
    });
    
    window.sceneData.scene.add(diagramGroup);
    console.log('Deformed shape added to scene');
}

/**
 * Create parabolic deflected shape for simply supported beam with UDL
 * δ(x) = (w*x / 24EI) * (L³ - 2Lx² + x³)
 * Simplified: δ(x) = δ_max * 16 * t * (1-t) * (1 - t + t²) where t = x/L
 * Actually for simply supported: δ(x) ≈ δ_max * 16/5 * t * (1-t) * (1 - t*(1-t))
 */
function createDeflectedCurve(startPos, endPos, maxDeflection, beamLength, maxDeflectionMm) {
    const group = new THREE.Group();
    
    // Determine up direction based on beam orientation
    const dir = new THREE.Vector3().subVectors(endPos, startPos).normalize();
    let upDir = new THREE.Vector3(0, 1, 0);
    
    // If beam is vertical (parallel to Y), use X axis for diagram
    if (Math.abs(dir.y) > 0.9) {
        upDir.set(1, 0, 0);
    }
    
    // Scale deflection for visibility (show ~15% of beam length as max visual deflection)
    const visualScale = (beamLength * 0.15) / maxDeflection;
    
    const segments = 40;
    const curvePoints = [];
    
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const pos = new THREE.Vector3().lerpVectors(startPos, endPos, t);
        
        // Parabolic deflection shape: δ(t) = δ_max * 16 * t * (1-t) * (3/4 + t*(1-t)/4)
        // Simplified to good approximation: δ(t) ≈ δ_max * sin(π*t)^1.1 (close to exact)
        // Or use exact: δ(t) = δ_max * (16/5) * t * (1-t) * (1 + t - t²)
        // Actually simplest accurate: δ(t) = δ_max * Math.sin(Math.PI * t) is very close
        const deflectionValue = maxDeflection * Math.sin(Math.PI * t) * visualScale;
        
        // Offset downward (negative Y) for deflection
        const offsetPos = pos.clone().add(upDir.clone().multiplyScalar(-deflectionValue));
        curvePoints.push(offsetPos);
    }
    
    // Deflected shape curve (green dashed)
    const curveGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const curveMaterial = new THREE.LineDashedMaterial({ 
        color: 0x00aa44, 
        linewidth: 2,
        dashSize: 0.2,
        gapSize: 0.1
    });
    const line = new THREE.Line(curveGeometry, curveMaterial);
    line.computeLineDistances();
    group.add(line);
    
    // Draw original beam position as reference (thin gray)
    const origGeom = new THREE.BufferGeometry().setFromPoints([startPos.clone(), endPos.clone()]);
    const origMat = new THREE.LineBasicMaterial({ color: 0x999999, opacity: 0.5, transparent: true });
    group.add(new THREE.Line(origGeom, origMat));
    
    // Value label at midspan - high resolution
    const centerIdx = Math.floor(segments / 2);
    const label = createHighResLabel(`${maxDeflectionMm.toFixed(2)} mm`, '#00aa44');
    label.position.copy(curvePoints[centerIdx]);
    label.position.add(upDir.clone().multiplyScalar(-0.5));
    group.add(label);
    
    return group;
}

window.showDeformedShape = showDeformedShape;

/**
 * Clear all diagrams
 */
export function clearDiagrams() {
    if (!window.sceneData || !window.sceneData.scene) {
        console.warn('Scene not available for clearing diagrams');
        return;
    }
    
    // Clear stored span data for hover
    window.diagramData.momentSpans = [];
    window.diagramData.shearSpans = [];
    
    // Hide tooltip
    const tooltip = document.getElementById('diagram-tooltip');
    if (tooltip) tooltip.style.display = 'none';
    
    const toRemove = [];
    window.sceneData.scene.children.forEach(child => {
        if (child.name === 'bendingMomentDiagram' || 
            child.name === 'shearForceDiagram' ||
            child.name === 'deformedShape' ||
            child.name === 'beamStressDiagram' ||
            child.name === 'BendingMomentDiagram' ||
            child.name === 'ShearForceDiagram') {
            toRemove.push(child);
        }
    });
    
    toRemove.forEach(obj => {
        window.sceneData.scene.remove(obj);
        obj.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    });
    
    console.log('Cleared', toRemove.length, 'diagram(s)');
}

window.clearDiagrams = clearDiagrams;

/**
 * Color beams by stress
 */
export function colorBeamsByStress() {
    if (!window.analysisResults) {
        console.log('No analysis results available');
        return;
    }
    
    const beamForces = window.analysisResults.beam_forces;
    if (!beamForces || beamForces.length === 0) {
        console.log('No beam forces in results');
        return;
    }
    
    const maxStress = window.analysisResults.max_beam_stress || 
        Math.max(...beamForces.map(bf => bf.combined_stress || 0));
    
    if (maxStress <= 0) {
        console.log('No stress data available');
        return;
    }
    
    console.log(`Coloring beams by stress (max: ${(maxStress/1e6).toFixed(2)} MPa)`);
    
    if (window.sceneData && window.sceneData.beamsGroup) {
        beamForces.forEach(bf => {
            const beamMesh = window.sceneData.beamsGroup.children[bf.element_id];
            if (beamMesh) {
                const ratio = (bf.combined_stress || 0) / maxStress;
                const color = stressToColor(ratio);
                beamMesh.material.color.setHex(color);
                beamMesh.userData.stressRatio = ratio;
                beamMesh.userData.beamForces = bf;
            }
        });
    }
    
    console.log('Beams colored by stress');
}

window.colorBeamsByStress = colorBeamsByStress;

/**
 * Reset beam colors
 */
export function resetBeamColors() {
    if (window.sceneData && window.sceneData.beamsGroup) {
        window.sceneData.beamsGroup.children.forEach(beam => {
            beam.material.color.setHex(0x0077ff);
            delete beam.userData.stressRatio;
            delete beam.userData.beamForces;
        });
    }
    console.log('Beam colors reset');
}

window.resetBeamColors = resetBeamColors;

/**
 * Show beam forces summary
 */
export function showBeamForcesSummary() {
    if (!window.analysisResults || !window.analysisResults.beam_forces) {
        console.log('No beam forces available');
        return;
    }
    
    console.log('=== BEAM FORCES SUMMARY ===');
    window.analysisResults.beam_forces.forEach(bf => {
        console.log(`Beam ${bf.element_id}:`);
        console.log(`  Axial: ${bf.axial_force.toFixed(1)} N, Shear Y: ${bf.shear_y.toFixed(1)} N`);
        console.log(`  Moment Z: ${bf.moment_z.toFixed(1)} Nm, Stress: ${((bf.combined_stress || 0)/1e6).toFixed(2)} MPa`);
    });
}

window.showBeamForcesSummary = showBeamForcesSummary;

// Helper functions
function stressToColor(ratio) {
    const r = Math.max(0, Math.min(1, ratio));
    if (r < 0.25) return interpolateColor(0x0066cc, 0x00cccc, r / 0.25);
    if (r < 0.5) return interpolateColor(0x00cccc, 0x00cc00, (r - 0.25) / 0.25);
    if (r < 0.75) return interpolateColor(0x00cc00, 0xcccc00, (r - 0.5) / 0.25);
    return interpolateColor(0xcccc00, 0xcc0000, (r - 0.75) / 0.25);
}

function interpolateColor(c1, c2, t) {
    const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
    const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return (r << 16) | (g << 8) | b;
}

/**
 * Create tooltip element for diagram hover
 */
function createDiagramTooltip() {
    let tooltip = document.getElementById('diagram-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'diagram-tooltip';
        tooltip.style.cssText = `
            position: fixed;
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 13px;
            pointer-events: none;
            z-index: 10000;
            display: none;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            white-space: nowrap;
        `;
        document.body.appendChild(tooltip);
    }
    return tooltip;
}

/**
 * Calculate moment value at position along span
 */
function getMomentAtPosition(span, t) {
    const x = t * span.length;
    const L = span.length;
    const w = span.udl;
    const M = span.M_left * (1 - t) + span.M_right * t + w * x * (L - x) / 2;
    return M;
}

/**
 * Calculate shear value at position along span
 */
function getShearAtPosition(span, t) {
    const x = t * span.length;
    const V = span.V_left - span.udl * x;
    return V;
}

/**
 * Find which span a 3D point is closest to and return position along it
 */
function findSpanAtPosition(spans, worldPos) {
    let closestSpan = null;
    let closestT = 0;
    let minDist = Infinity;
    
    for (const span of spans) {
        // Project point onto line from startPos to endPos
        const lineDir = new THREE.Vector3().subVectors(span.endPos, span.startPos).normalize();
        const toPoint = new THREE.Vector3().subVectors(worldPos, span.startPos);
        
        // t = dot(toPoint, lineDir) / length
        const proj = toPoint.dot(lineDir);
        const t = proj / span.length;
        
        // Clamp t to [0, 1]
        const clampedT = Math.max(0, Math.min(1, t));
        
        // Find closest point on line segment
        const closestPoint = new THREE.Vector3()
            .copy(span.startPos)
            .add(lineDir.clone().multiplyScalar(clampedT * span.length));
        
        const dist = worldPos.distanceTo(closestPoint);
        
        // Only consider if within reasonable distance (diagram height + margin)
        if (dist < minDist && dist < 2.0) {
            minDist = dist;
            closestSpan = span;
            closestT = clampedT;
        }
    }
    
    return { span: closestSpan, t: closestT, distance: minDist };
}

/**
 * Handle mouse move for diagram hover
 */
// Store hover indicator line globally so we can update/remove it
let hoverIndicatorLine = null;

function handleDiagramHover(event) {
    if (!window.sceneData || !window.sceneData.scene) return;
    
    const tooltip = createDiagramTooltip();
    
    // Check if any diagram is visible
    const momentDiagram = window.sceneData.scene.getObjectByName('bendingMomentDiagram');
    const shearDiagram = window.sceneData.scene.getObjectByName('shearForceDiagram');
    
    if (!momentDiagram && !shearDiagram) {
        tooltip.style.display = 'none';
        removeHoverIndicator();
        return;
    }
    
    // Get canvas and calculate mouse position
    const canvas = window.sceneData.renderer?.domElement;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    
    // Raycast against diagram meshes directly
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, window.sceneData.camera);
    
    // Collect all meshes from diagrams
    const meshesToTest = [];
    if (momentDiagram) {
        momentDiagram.traverse(child => {
            if (child.isMesh) meshesToTest.push(child);
        });
    }
    if (shearDiagram) {
        shearDiagram.traverse(child => {
            if (child.isMesh) meshesToTest.push(child);
        });
    }
    
    const intersects = raycaster.intersectObjects(meshesToTest, false);
    
    if (intersects.length === 0) {
        tooltip.style.display = 'none';
        removeHoverIndicator();
        return;
    }
    
    const worldPos = intersects[0].point;
    
    // Check if we're over a moment diagram
    let tooltipText = '';
    let indicatorPos = null;
    let spanData = null;
    
    if (momentDiagram && window.diagramData.momentSpans.length > 0) {
        const { span, t, distance } = findSpanAtPosition(window.diagramData.momentSpans, worldPos);
        if (span && distance < 1.5) {
            const M = getMomentAtPosition(span, t);
            tooltipText = `${M.toFixed(2)}kNm`;
            spanData = span;
            indicatorPos = t;
        }
    }
    
    if (shearDiagram && window.diagramData.shearSpans.length > 0) {
        const { span, t, distance } = findSpanAtPosition(window.diagramData.shearSpans, worldPos);
        if (span && distance < 1.5) {
            const V = getShearAtPosition(span, t);
            tooltipText = `${V.toFixed(2)}kN`;
            spanData = span;
            indicatorPos = t;
        }
    }
    
    if (tooltipText && spanData && indicatorPos !== null) {
        tooltip.textContent = tooltipText;
        tooltip.style.display = 'block';
        tooltip.style.left = (event.clientX + 15) + 'px';
        tooltip.style.top = (event.clientY - 10) + 'px';
        
        // Show vertical indicator line
        showHoverIndicator(spanData, indicatorPos);
    } else {
        tooltip.style.display = 'none';
        removeHoverIndicator();
    }
}

/**
 * Show vertical indicator line at hover position
 */
function showHoverIndicator(span, t) {
    removeHoverIndicator();
    
    // Calculate position along the span
    const pos = new THREE.Vector3().lerpVectors(span.startPos, span.endPos, t);
    
    // Create a thin vertical plane (since THREE.Line linewidth doesn't work in WebGL)
    const lineHeight = span.L * 0.3; // 30% of span length
    const lineWidth = 0.02; // Thin but visible width
    
    // Create plane geometry for the line
    const geometry = new THREE.PlaneGeometry(lineWidth, lineHeight);
    const material = new THREE.MeshBasicMaterial({ 
        color: 0xff6600, // Orange color for visibility
        side: THREE.DoubleSide,
        depthTest: false,
        transparent: true,
        opacity: 0.9
    });
    
    hoverIndicatorLine = new THREE.Mesh(geometry, material);
    hoverIndicatorLine.position.set(pos.x, pos.y + lineHeight * 0.4, pos.z);
    hoverIndicatorLine.renderOrder = 999;
    hoverIndicatorLine.name = 'hoverIndicator';
    
    window.sceneData.scene.add(hoverIndicatorLine);
}

/**
 * Remove the hover indicator line
 */
function removeHoverIndicator() {
    if (hoverIndicatorLine) {
        window.sceneData?.scene?.remove(hoverIndicatorLine);
        hoverIndicatorLine.geometry?.dispose();
        hoverIndicatorLine.material?.dispose();
        hoverIndicatorLine = null;
    }
}

/**
 * Initialize diagram hover events
 */
function initDiagramHover() {
    const canvas = window.sceneData?.renderer?.domElement;
    if (!canvas) {
        // Retry after a short delay if canvas not ready
        setTimeout(initDiagramHover, 500);
        return;
    }
    
    // Remove existing listener if any
    canvas.removeEventListener('mousemove', handleDiagramHover);
    canvas.addEventListener('mousemove', handleDiagramHover);
    
    // Hide tooltip when mouse leaves canvas
    canvas.addEventListener('mouseleave', () => {
        const tooltip = document.getElementById('diagram-tooltip');
        if (tooltip) tooltip.style.display = 'none';
        removeHoverIndicator();
    });
    
    console.log('Diagram hover events initialized');
}

// Initialize hover when sceneData is available
if (window.sceneData?.renderer) {
    initDiagramHover();
} else {
    // Wait for scene to be ready
    const checkScene = setInterval(() => {
        if (window.sceneData?.renderer) {
            clearInterval(checkScene);
            initDiagramHover();
        }
    }, 500);
}

window.initDiagramHover = initDiagramHover;

console.log('Analysis diagrams module loaded');
