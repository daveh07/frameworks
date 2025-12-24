/**
 * Scene Setup Module
 * Handles Three.js scene initialization, camera, renderer, lighting, and grids
 */

const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js');

/**
 * Create gradient background texture
 * @returns {THREE.CanvasTexture}
 */
function createGradientBackground() {
    const gradientCanvas = document.createElement('canvas');
    gradientCanvas.width = 2;
    gradientCanvas.height = 512;
    const ctx = gradientCanvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 3000);
    gradient.addColorStop(1, '#040b3dff');
    gradient.addColorStop(0, '#ffffff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 512);
    return new THREE.CanvasTexture(gradientCanvas);
}

/**
 * Create axis cylinder
 * @param {THREE.Vector3} start
 * @param {THREE.Vector3} end
 * @param {number} color
 * @param {number} radius
 * @returns {THREE.Mesh}
 */
function createAxis(start, end, color, radius = 0.05) {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

    const geom = new THREE.CylinderGeometry(radius, radius, length, 16);
    const mat = new THREE.MeshBasicMaterial({ color });
    const axis = new THREE.Mesh(geom, mat);

    // Orient cylinder to align with the direction vector
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize());
    axis.applyQuaternion(quat);
    axis.position.copy(midpoint);

    return axis;
}

/**
 * Setup scene with grids, axes, and lighting
 * @param {THREE.Scene} scene
 */
function setupSceneElements(scene) {
    // Gradient background
    scene.background = createGradientBackground();

    // Grids
    const majorGrid = new THREE.GridHelper(50, 10, 0x00d4ff, 0x00d4ff);
    majorGrid.material.opacity = 0.5;
    majorGrid.material.transparent = true;
    scene.add(majorGrid);

    const minorGrid = new THREE.GridHelper(50, 50, 0x0088aa, 0x0088aa);
    minorGrid.material.opacity = 0.15;
    minorGrid.material.transparent = true;
    scene.add(minorGrid);

    // Coordinate axes
    scene.add(createAxis(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(2, 0, 0),
        0xff0000,
        0.05
    ));

    scene.add(createAxis(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 2, 0),
        0x00ff00,
        0.05
    ));

    scene.add(createAxis(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 2),
        0x0000ff,
        0.05
    ));

    // Origin marker
    const origin = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );
    scene.add(origin);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.8)); // Increased ambient light
    
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(10, 20, 10);
    scene.add(mainLight);
    
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5); // Increased fill light
    fillLight.position.set(-10, 10, -10);
    scene.add(fillLight);
}

/**
 * Create hover highlight for nodes                                                                                                                                                                                                 
 * @param {THREE.Scene} scene
 * @returns {THREE.Mesh}
 */
export function createNodeHoverHighlight(scene) {
    const hoverHighlight = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 16, 16),
        new THREE.MeshBasicMaterial({ 
            color: 0xff0000, // Bright red
            transparent: true,
            opacity: 0.7,
            wireframe: false
        })
    );
    hoverHighlight.visible = false;
    scene.add(hoverHighlight);
    return hoverHighlight;
}

/**
 * Create hover highlight for beams
 * @param {THREE.Scene} scene
 * @returns {THREE.Mesh}
 */
export function createBeamHoverHighlight(scene) {
    const beamHoverHighlight = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 1, 16),
        new THREE.MeshBasicMaterial({ 
            color: 0xff8800,
            transparent: true,
            opacity: 0.7,
            wireframe: false
        })
    );
    beamHoverHighlight.visible = false;
    scene.add(beamHoverHighlight);
    return beamHoverHighlight;
}

/**
 * Create highlight for add node mode
 * @param {THREE.Scene} scene
 * @returns {THREE.Mesh}
 */
export function createAddNodeHighlight(scene) {
    const highlight = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 16),
        new THREE.MeshBasicMaterial({ 
            color: 0x0088ff, // Blue
            transparent: true,
            opacity: 0.5,
            wireframe: true
        })
    );
    highlight.visible = false;
    scene.add(highlight);
    return highlight;
}

/**
 * Create selection highlight for selected nodes
 * @param {THREE.Scene} scene
 * @returns {THREE.Group}
 */
export function createSelectionHighlights(scene) {
    const group = new THREE.Group();
    group.name = 'selectionHighlights';
    scene.add(group);
    return group;
}

/**
 * Add selection highlight to a node
 * @param {THREE.Group} highlightsGroup
 * @param {THREE.Mesh} node
 */
export function addNodeSelectionHighlight(highlightsGroup, node) {
    // If node is a mesh node (has + helper), highlight the helper instead of adding a box
    if (node.userData.isMeshNode) {
        // Find the + helper
        const plus = node.children.find(c => c.isLineSegments);
        if (plus) {
            if (!plus.userData.originalColor) {
                plus.userData.originalColor = plus.material.color.getHex();
            }
            plus.material.color.setHex(0xff0000); // Red highlight for selected mesh node
            plus.material.linewidth = 3; // Thicker line
            plus.userData.isHighlighted = true;
        }
        return;
    }

    const highlight = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 16, 16), // SphereGeometry to match hover
        new THREE.MeshBasicMaterial({
            color: 0xff0000, // Red highlight for standard nodes
            transparent: true,
            opacity: 0.5,
            depthTest: false
        })
    );
    highlight.position.copy(node.position);
    highlight.userData.nodeId = node.uuid;
    highlightsGroup.add(highlight);
}

/**
 * Remove selection highlight from a node
 * @param {THREE.Group} highlightsGroup
 * @param {THREE.Mesh} node
 */
export function removeNodeSelectionHighlight(highlightsGroup, node) {
    // If node is a mesh node, restore original color
    if (node.userData.isMeshNode) {
        const plus = node.children.find(c => c.isLineSegments);
        if (plus && plus.userData.isHighlighted) {
            plus.material.color.setHex(plus.userData.originalColor || 0xff0000);
            plus.material.linewidth = 1; // Restore linewidth
            plus.userData.isHighlighted = false;
        }
        return;
    }

    const highlight = highlightsGroup.children.find(h => h.userData.nodeId === node.uuid);
    if (highlight) {
        highlightsGroup.remove(highlight);
        highlight.geometry.dispose();
        highlight.material.dispose();
    }
}

/**
 * Clear all selection highlights
 * @param {THREE.Group} highlightsGroup
 */
export function clearSelectionHighlights(highlightsGroup) {
    while (highlightsGroup.children.length > 0) {
        const highlight = highlightsGroup.children[0];
        highlightsGroup.remove(highlight);
        highlight.geometry.dispose();
        highlight.material.dispose();
    }
}

/**
 * Initialize Three.js scene, camera, and renderer
 * @param {HTMLCanvasElement} canvas
 * @returns {Object} Scene components
 */
export function initializeScene(canvas) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    setupSceneElements(scene);

    // Camera - using narrower FOV (40°) for less distortion, better for CAD/engineering views
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(15, 15, 15);
    camera.lookAt(0, 0, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Groups for nodes and beams
    const nodesGroup = new THREE.Group();
    scene.add(nodesGroup);

    const beamsGroup = new THREE.Group();
    scene.add(beamsGroup);
    
    const platesGroup = new THREE.Group();
    scene.add(platesGroup);

    // Raycaster for picking
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.1; // Reduced from 0.5 for more precise node selection
    raycaster.params.Line.threshold = 0.2; // Reduced from 1.0
    raycaster.params.Mesh.threshold = 0;

    const mouse = new THREE.Vector2();
    const gridPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // Highlights
    const highlight = createAddNodeHighlight(scene);
    const hoverHighlight = createNodeHoverHighlight(scene);
    const beamHoverHighlight = createBeamHoverHighlight(scene);
    const selectionHighlights = createSelectionHighlights(scene);
    
    // Reference plane for storey elevation (initially hidden)
    const referencePlane = createReferencePlane();
    scene.add(referencePlane);
    referencePlane.visible = false;

    return {
        scene,
        camera,
        renderer,
        nodesGroup,
        beamsGroup,
        platesGroup,
        raycaster,
        mouse,
        gridPlane,
        highlight,
        hoverHighlight,
        beamHoverHighlight,
        selectionHighlights,
        referencePlane
    };
}

/**
 * Create reference plane for storey elevation (grid)
 * @returns {THREE.GridHelper}
 */
function createReferencePlane() {
    const size = 50;
    const divisions = 50;
    const grid = new THREE.GridHelper(size, divisions, 0x888888, 0x444444);
    grid.rotation.x = 0; // GridHelper is already horizontal
    grid.material.transparent = true;
    grid.material.opacity = 0.3;
    return grid;
}

/**
 * Setup camera controls (spherical coordinates)
 * @param {THREE.Camera} camera
 * @returns {Object} Camera control state
 */
export function initializeCameraControls(camera) {
    const spherical = new THREE.Spherical();
    const target = new THREE.Vector3(0, 0, 0);
    const offset = new THREE.Vector3();
    offset.copy(camera.position).sub(target);
    spherical.setFromVector3(offset);

    return { spherical, target, offset };
}

/**
 * Set camera to specific view
 * @param {THREE.Camera} camera
 * @param {Object} controls - Camera control state
 * @param {string} view - View type: 'plan' (XZ), 'xy', 'yz'
 */
export function setViewportView(camera, controls, view) {
    const distance = 15;
    const { target, spherical, offset } = controls;
    
    switch(view) {
        case 'plan': // Plan view - looking down at XZ plane
            camera.position.set(0, distance, 0);
            camera.lookAt(target);
            spherical.setFromVector3(offset.copy(camera.position).sub(target));
            break;
            
        case 'xy': // Elevation XY - looking from positive Z
            camera.position.set(0, 0, distance);
            camera.lookAt(target);
            spherical.setFromVector3(offset.copy(camera.position).sub(target));
            break;
            
        case 'yz': // Elevation YZ - looking from positive X
            camera.position.set(distance, 0, 0);
            camera.lookAt(target);
            spherical.setFromVector3(offset.copy(camera.position).sub(target));
            break;
            
        default:
            console.warn('Unknown view type:', view);
    }
}
