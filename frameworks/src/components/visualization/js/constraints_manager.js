/**
 * Constraints Manager
 * Handles visual representation of node constraints (supports, springs, etc.)
 */

// Import THREE
const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js');

// Import selectedNodes from geometry_manager
import { selectedNodes } from './geometry_manager.js';

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
    
    console.log('Group created at position:', group.position, 'with symbol:', symbol);
    
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
function removeConstraintSymbol(node, sceneData) {
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
 * Create fixed support symbol (linework only - box outline with cross hatching)
 * @returns {THREE.Group}
 */
function createFixedSymbol() {
    const group = new THREE.Group();
    const color = 0x000000; // Black
    
    // Draw box outline with lines (no solid polygon)
    const lineMaterial = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
    
    // Front face outline (rectangle)
    const frontOutline = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.2, 0, 0.15),
        new THREE.Vector3(0.2, 0, 0.15),
        new THREE.Vector3(0.2, -0.3, 0.15),
        new THREE.Vector3(-0.2, -0.3, 0.15),
        new THREE.Vector3(-0.2, 0, 0.15)
    ]);
    const frontLine = new THREE.Line(frontOutline, lineMaterial);
    group.add(frontLine);
    
    // Back face outline (rectangle)
    const backOutline = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.2, 0, -0.15),
        new THREE.Vector3(0.2, 0, -0.15),
        new THREE.Vector3(0.2, -0.3, -0.15),
        new THREE.Vector3(-0.2, -0.3, -0.15),
        new THREE.Vector3(-0.2, 0, -0.15)
    ]);
    const backLine = new THREE.Line(backOutline, lineMaterial);
    group.add(backLine);
    
    // Connect front and back (depth lines)
    const depthLines = [
        [new THREE.Vector3(-0.2, 0, 0.15), new THREE.Vector3(-0.2, 0, -0.15)],
        [new THREE.Vector3(0.2, 0, 0.15), new THREE.Vector3(0.2, 0, -0.15)],
        [new THREE.Vector3(0.2, -0.3, 0.15), new THREE.Vector3(0.2, -0.3, -0.15)],
        [new THREE.Vector3(-0.2, -0.3, 0.15), new THREE.Vector3(-0.2, -0.3, -0.15)]
    ];
    
    depthLines.forEach(points => {
        const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(lineGeom, lineMaterial);
        group.add(line);
    });
    
    // Diagonal cross hatching on front face
    const hatchMaterial = new THREE.LineBasicMaterial({ 
        color: 0x000000, 
        linewidth: 2
    });
    
    // Diagonal lines going one way
    for (let i = 0; i < 5; i++) {
        const hatchGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-0.2 + (i * 0.1), 0, 0.16),
            new THREE.Vector3(0.2 - (4 - i) * 0.1, -0.3, 0.16)
        ]);
        const hatch = new THREE.Line(hatchGeometry, hatchMaterial);
        group.add(hatch);
    }
    
    // Diagonal lines going the other way
    for (let i = 0; i < 5; i++) {
        const hatchGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-0.2 + (i * 0.1), -0.3, 0.16),
            new THREE.Vector3(0.2 - (4 - i) * 0.1, 0, 0.16)
        ]);
        const hatch = new THREE.Line(hatchGeometry, hatchMaterial);
        group.add(hatch);
    }
    
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
 * Create spring support symbol (coil shape with direction subscript)
 * @param {string} springDOF - Spring direction(s) (e.g., 'x', 'y', 'z', 'xy', etc.)
 * @returns {THREE.Group}
 */
function createSpringSymbol(springDOF) {
    const group = new THREE.Group();
    
    // Create spring coil using line segments
    const points = [];
    const coils = 5;
    const radius = 0.15;
    const height = 0.6;
    
    for (let i = 0; i <= coils * 20; i++) {
        const t = i / (coils * 20);
        const angle = t * coils * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = -t * height;
        const z = Math.sin(angle) * radius;
        points.push(new THREE.Vector3(x, y, z));
    }
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ 
        color: 0x000000,  // Black
        linewidth: 2
    });
    const spring = new THREE.Line(geometry, material);
    spring.position.y = 0;  // Top of spring starts at node
    
    group.add(spring);
    
    // Create text label for spring direction (subscript style)
    if (springDOF) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 64;
        
        context.fillStyle = '#000000';
        context.font = 'bold 48px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(springDOF, 64, 32);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(0.3, 0.15, 1);
        sprite.position.set(0.35, -0.3, 0);
        group.add(sprite);
    }
    
    return group;
}

/**
 * Create roller support symbol (3D pyramid with sphere on top and free DOF label)
 * @param {string} freeDOF - Free degree(s) of freedom (e.g., 'x', 'y', 'z', 'xy', etc.)
 * @returns {THREE.Group}
 */
function createRollerSymbol(freeDOF) {
    const group = new THREE.Group();
    const color = 0x0066cc; // Blue
    
    // Sphere (solid, smaller, positioned under node)
    const sphereGeometry = new THREE.SphereGeometry(0.08, 16, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({ 
        color: color,
        transparent: false
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.y = -0.15; // Under the node
    group.add(sphere);
    
    // 3D pyramid below sphere (cone with 4 sides)
    const pyramidGeometry = new THREE.ConeGeometry(0.2, 0.3, 4);
    const pyramidMaterial = new THREE.MeshBasicMaterial({ 
        color: color
    });
    const pyramid = new THREE.Mesh(pyramidGeometry, pyramidMaterial);
    pyramid.position.y = -0.28; // Adjusted to close gap with sphere
    pyramid.rotation.y = Math.PI / 4; // Rotate 45 degrees for square base
    group.add(pyramid);
    
    // Create text label for free DOF (subscript style)
    if (freeDOF) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 64;
        
        context.fillStyle = '#0066cc';
        context.font = 'bold 48px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(freeDOF, 64, 32);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(0.3, 0.15, 1);
        sprite.position.set(0.35, -0.2, 0);
        group.add(sprite);
    }
    
    return group;
}

/**
 * Create custom support symbol (cube with cross)
 * @returns {THREE.Group}
 */
function createCustomSymbol() {
    const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const material = new THREE.MeshBasicMaterial({ 
        color: 0xffaa33,
        transparent: true,
        opacity: 0.7,
        wireframe: true
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.y = -0.3;
    
    const group = new THREE.Group();
    group.add(cube);
    
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
