/**
 * Constraints Manager
 * Handles visual representation of node constraints (supports, springs, etc.)
 */

// Import THREE
const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js');

// Import selectedNodes from geometry_manager
import { selectedNodes } from '/js/geometry_manager.js';

// Store constraint symbols for each node
const constraintSymbols = new Map(); // nodeId -> constraint mesh group

// Export for analysis
export { constraintSymbols };

/**
 * Apply constraints to selected nodes and create visual symbols
 * @param {Object} constraintData - Constraint configuration
 * @param {Object} sceneData - Scene data from scene_setup
 */
export function applyNodeConstraints(constraintData, sceneData) {
    console.log('applyNodeConstraints called with:', constraintData, sceneData);
    console.log('selectedNodes from import:', selectedNodes, 'size:', selectedNodes.size);
    
    if (!selectedNodes || selectedNodes.size === 0) {
        console.warn('No nodes selected for constraint application');
        return;
    }
    
    // Determine support type
    const supportType = determineSupportType(constraintData);
    
    console.log(`Applying ${supportType} constraint to ${selectedNodes.size} node(s)`, constraintData);
    
    selectedNodes.forEach(node => {
        console.log('Processing node:', node);
        // Remove existing constraint symbol if any
        removeConstraintSymbol(node, sceneData);
        
        // Create new constraint symbol
        createConstraintSymbol(node, supportType, constraintData, sceneData);
        
        // Store constraint data on the node
        node.userData.constraint = {
            ...constraintData,
            type: supportType
        };
    });
    
    console.log(`Constraints applied to ${selectedNodes.size} node(s)`);
}

/**
 * Clear constraints from selected nodes
 * @param {Object} sceneData - Scene data
 */
export function clearNodeConstraints(sceneData) {
    if (selectedNodes.size === 0) {
        console.warn('No nodes selected for constraint removal');
        return;
    }
    
    selectedNodes.forEach(node => {
        removeConstraintSymbol(node, sceneData);
        delete node.userData.constraint;
    });
    
    console.log(`Constraints cleared from ${selectedNodes.size} node(s)`);
}

/**
 * Determine support type from constraint data
 * @param {Object} constraintData
 * @returns {Object} Support type info: { type: string, freeDOF: string, springDOF: string }
 */
function determineSupportType(constraintData) {
    const { dx, dy, dz, rx, ry, rz, kx, ky, kz } = constraintData;
    
    // Check if any spring stiffness is non-zero and track which directions
    const springDirections = [];
    if (kx > 0) springDirections.push('x');
    if (ky > 0) springDirections.push('y');
    if (kz > 0) springDirections.push('z');
    
    const hasSpring = springDirections.length > 0;
    if (hasSpring) {
        return { type: 'spring', freeDOF: '', springDOF: springDirections.join('') };
    }
    
    // Check if all DOF are restrained
    if (dx && dy && dz && rx && ry && rz) {
        return { type: 'fixed', freeDOF: '', springDOF: '' };
    }
    
    // Check if only translations are restrained
    if (dx && dy && dz && !rx && !ry && !rz) {
        return { type: 'pinned', freeDOF: '', springDOF: '' };
    }
    
    // Check for roller supports (2 translations restrained, 1 free)
    const translations = [
        { restrained: dx, name: 'x' },
        { restrained: dy, name: 'y' },
        { restrained: dz, name: 'z' }
    ];
    const freeTranslations = translations.filter(t => !t.restrained);
    const restrainedTranslations = translations.filter(t => t.restrained);
    
    if (restrainedTranslations.length === 2 && freeTranslations.length === 1 && !rx && !ry && !rz) {
        return { 
            type: 'roller', 
            freeDOF: freeTranslations.map(t => t.name).join(''),
            springDOF: ''
        };
    }
    
    // Multiple free translations
    if (freeTranslations.length > 1 && !rx && !ry && !rz) {
        return { 
            type: 'roller', 
            freeDOF: freeTranslations.map(t => t.name).join(''),
            springDOF: ''
        };
    }
    
    return { type: 'custom', freeDOF: '', springDOF: '' };
}

/**
 * Create constraint symbol at node position
 * @param {THREE.Mesh} node - Node mesh
 * @param {Object} supportTypeInfo - Support type info with type and freeDOF
 * @param {Object} constraintData - Constraint configuration
 * @param {Object} sceneData - Scene data
 */
function createConstraintSymbol(node, supportTypeInfo, constraintData, sceneData) {
    console.log('createConstraintSymbol called for node:', node, 'supportTypeInfo:', supportTypeInfo);
    
    const group = new THREE.Group();
    group.position.copy(node.position);
    
    let symbol;
    
    switch (supportTypeInfo.type) {
        case 'fixed':
            symbol = createFixedSymbol();
            break;
        case 'pinned':
            symbol = createPinnedSymbol();
            break;
        case 'spring':
            symbol = createSpringSymbol(supportTypeInfo.springDOF);
            break;
        case 'roller':
            symbol = createRollerSymbol(supportTypeInfo.freeDOF);
            break;
        default:
            symbol = createCustomSymbol();
    }
    
    console.log('Created symbol:', symbol);
    
    group.add(symbol);
    
    // Mark this as a constraint symbol for analysis export
    group.userData.isConstraintSymbol = true;
    group.userData.supportType = supportTypeInfo.type;
    group.userData.nodeUuid = node.uuid;
    // Store actual DOF restraints for FEA extraction
    group.userData.constraintDOFs = {
        dx: constraintData.dx || false,
        dy: constraintData.dy || false,
        dz: constraintData.dz || false,
        rx: constraintData.rx || false,
        ry: constraintData.ry || false,
        rz: constraintData.rz || false
    };
    
    console.log('Group created at position:', group.position, 'with symbol:', symbol, 'DOFs:', group.userData.constraintDOFs);
    
    // Store reference
    constraintSymbols.set(node.uuid, group);
    sceneData.scene.add(group);
    
    console.log('Symbol added to scene. Total symbols:', constraintSymbols.size);
}

/**
 * Remove constraint symbol from a node
 * @param {THREE.Mesh} node - Node mesh
 * @param {Object} sceneData - Scene data
 */
export function removeConstraintSymbol(node, sceneData) {
    const existingSymbol = constraintSymbols.get(node.uuid);
    if (existingSymbol) {
        sceneData.scene.remove(existingSymbol);
        
        // Dispose of geometries and materials
        existingSymbol.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        
        constraintSymbols.delete(node.uuid);
    }
}

/**
 * Create fixed support symbol (2D line with hatching - billboard style)
 * @returns {THREE.Group}
 */
function createFixedSymbol() {
    const group = new THREE.Group();
    
    // Create canvas for 2D drawing
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, size, size);
    
    // Draw horizontal ground line
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 8; // Thicker line
    ctx.beginPath();
    ctx.moveTo(size * 0.2, size * 0.4);
    ctx.lineTo(size * 0.8, size * 0.4);
    ctx.stroke();
    
    // Draw diagonal hatching lines
    ctx.lineWidth = 4; // Thicker hatching
    const spacing = 20;
    const hatchHeight = 40;
    
    for (let i = size * 0.2; i <= size * 0.8; i += spacing) {
        ctx.beginPath();
        ctx.moveTo(i, size * 0.4);
        ctx.lineTo(i - 15, size * 0.4 + hatchHeight);
        ctx.stroke();
    }
    
    // Create sprite from canvas
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true,
        alphaTest: 0.5,
        depthTest: true
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(0.6, 0.6, 1);
    sprite.position.y = -0.25;
    
    group.add(sprite);
    
    return group;
}

/**
 * Create pinned support symbol (3D pyramid)
 * @returns {THREE.Group}
 */
function createPinnedSymbol() {
    const group = new THREE.Group();
    const color = 0x33ff77; // Light green
    
    // Create 3D pyramid (cone with 4 sides)
    const pyramidGeometry = new THREE.ConeGeometry(0.3, 0.4, 4);
    const pyramidMaterial = new THREE.MeshBasicMaterial({ 
        color: color
    });
    const pyramid = new THREE.Mesh(pyramidGeometry, pyramidMaterial);
    pyramid.position.y = -0.2;
    pyramid.rotation.y = Math.PI / 4; // Rotate 45 degrees for square base
    group.add(pyramid);
    
    return group;
}

/**
 * Create spring support symbol (2D zigzag spring with direction label - billboard style)
 * @param {string} springDOF - Spring direction(s) (e.g., 'x', 'y', 'z', 'xy', etc.)
 * @returns {THREE.Group}
 */
function createSpringSymbol(springDOF) {
    const group = new THREE.Group();
    
    // Create canvas for 2D spring drawing
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, size, size);
    
    // Draw zigzag spring (side view)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Spring zigzag pattern
    const startY = size * 0.2;
    const endY = size * 0.65;
    const centerX = size * 0.5;
    const zigWidth = 25;
    const segments = 6;
    const segmentHeight = (endY - startY) / segments;
    
    ctx.beginPath();
    ctx.moveTo(centerX, startY);
    
    for (let i = 0; i <= segments; i++) {
        const y = startY + i * segmentHeight;
        const x = centerX + (i % 2 === 0 ? -zigWidth : zigWidth);
        ctx.lineTo(x, y);
    }
    
    ctx.stroke();
    
    // Draw ground line at bottom
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(size * 0.25, endY + 10);
    ctx.lineTo(size * 0.75, endY + 10);
    ctx.stroke();
    
    // Draw diagonal hatching under ground line
    ctx.lineWidth = 2;
    const hatchSpacing = 12;
    for (let i = 0; i < 5; i++) {
        const x = size * 0.25 + i * hatchSpacing;
        ctx.beginPath();
        ctx.moveTo(x, endY + 10);
        ctx.lineTo(x - 10, endY + 22);
        ctx.stroke();
    }
    
    // Add subscript label if provided
    if (springDOF) {
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('k' + springDOF, centerX, size * 0.85);
    }
    
    // Create sprite from canvas
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true,
        alphaTest: 0.5,
        depthTest: true
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(0.7, 0.7, 1);
    sprite.position.y = -0.2;
    
    group.add(sprite);
    
    return group;
}

/**
 * Create roller support symbol (Blue cone)
 * @param {string} freeDOF - Free degree(s) of freedom (e.g., 'x', 'y', 'z', 'xy', etc.)
 * @returns {THREE.Group}
 */
function createRollerSymbol(freeDOF) {
    const group = new THREE.Group();
    const color = 0x3399ff; // Brighter Blue
    
    // Create 3D cone
    // ConeGeometry(radius, height, radialSegments)
    const coneGeometry = new THREE.ConeGeometry(0.15, 0.4, 16);
    const coneMaterial = new THREE.MeshBasicMaterial({ 
        color: color
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    // Cone points up (Y+) by default. Center is at (0,0,0).
    // We want tip at 0, so move down by half height.
    cone.position.y = -0.2; 
    group.add(cone);
    
    return group;
}

/**
 * Create custom support symbol (Black X)
 * @returns {THREE.Group}
 */
function createCustomSymbol() {
    const group = new THREE.Group();
    
    // Create canvas for 2D drawing
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, size, size);
    
    // Draw Black X
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 25;
    ctx.lineCap = 'round';
    
    const padding = size * 0.2;
    
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(size - padding, size - padding);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(size - padding, padding);
    ctx.lineTo(padding, size - padding);
    ctx.stroke();
    
    // Create sprite from canvas
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true,
        depthTest: false // Always visible on top
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(0.4, 0.4, 1);
    sprite.position.y = 0; // On the node
    
    group.add(sprite);
    
    return group;
}

/**
 * Get all constraint symbols
 * @returns {Map}
 */
export function getConstraintSymbols() {
    return constraintSymbols;
}

/**
 * Clear all constraint symbols from the scene
 * @param {Object} sceneData
 */
export function clearAllConstraintSymbols(sceneData) {
    constraintSymbols.forEach((symbol, nodeId) => {
        sceneData.scene.remove(symbol);
        symbol.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    });
    constraintSymbols.clear();
}
