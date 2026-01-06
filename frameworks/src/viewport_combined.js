//SCENE.JS

// Dioxus web logging can forward console arguments to Rust using a strict
// string-only schema. Ensure console methods receive a single string.
(function sanitizeConsoleArgs() {
    if (typeof console === 'undefined') return;
    if (console.__frameworks_stringify_patched) return;

    function safeToString(value) {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';

        const t = typeof value;
        if (t === 'string') return value;
        if (t === 'number' || t === 'boolean' || t === 'bigint') return String(value);
        if (t === 'symbol') return value.toString();
        if (t === 'function') return `[Function${value.name ? `: ${value.name}` : ''}]`;

        // Errors: keep useful info.
        if (value instanceof Error) {
            return value.stack || `${value.name}: ${value.message}`;
        }

        // Objects: try JSON, fall back to default stringification.
        try {
            const seen = new WeakSet();
            return JSON.stringify(value, (key, val) => {
                if (typeof val === 'object' && val !== null) {
                    if (seen.has(val)) return '[Circular]';
                    seen.add(val);
                }
                if (typeof val === 'bigint') return val.toString();
                if (typeof val === 'function') return `[Function${val.name ? `: ${val.name}` : ''}]`;
                if (typeof val === 'symbol') return val.toString();
                return val;
            });
        } catch {
            try {
                return String(value);
            } catch {
                return '[Unstringifiable]';
            }
        }
    }

    function wrap(methodName) {
        const original = console[methodName];
        if (typeof original !== 'function') return;
        console[methodName] = function (...args) {
            // Keep semantics: one string argument.
            const msg = args.map(safeToString).join(' ');
            return original.call(console, msg);
        };
    }

    wrap('log');
    wrap('info');
    wrap('warn');
    wrap('error');

    // Re-apply once after current tick in case another layer wraps console.
    setTimeout(() => {
        wrap('log');
        wrap('info');
        wrap('warn');
        wrap('error');
    }, 0);

    console.__frameworks_stringify_patched = true;
})();

// Central analysis results hub to prevent competing global overrides
(function initAnalysisResultsHub() {
    if (window.__analysisResultsHubInitialized) {
        return;
    }

    const handlerList = [];

    function registerHandler(handler) {
        if (typeof handler !== 'function') {
            return;
        }
        if (!handlerList.includes(handler)) {
            handlerList.push(handler);
        }
    }

    window.analysisResults = window.analysisResults || null;
    window.registerAnalysisResultsHandler = registerHandler;

    const hub = function(results) {
        window.analysisResults = results || null;
        handlerList.forEach(handler => {
            try {
                handler(results);
            } catch (error) {
                console.error('Analysis handler failed:', error);
            }
        });
    };

    const previous = typeof window.updateAnalysisResults === 'function'
        ? window.updateAnalysisResults
        : null;

    if (previous && previous !== hub) {
        registerHandler(previous);
    }

    window.updateAnalysisResults = hub;
    window.__analysisResultsHubInitialized = true;
})();

window.initDrawingCanvas = function(canvasId) {
    const container = document.getElementById(canvasId);
    if (!container) {
        console.error(`Canvas element with id "${canvasId}" not found`);
        return;
    }

    // Get container dimensions
    const width = container.clientWidth;
    const height = container.clientHeight;

    // --- setup ---
    const scene = new THREE.Scene();

    // Create gradient background
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 2500);
    gradient.addColorStop(1, '#010312'); // Dark blue at top
    gradient.addColorStop(0, '#ffffff'); // White at btm
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 512);

    const gradientTexture = new THREE.CanvasTexture(canvas);
    scene.background = gradientTexture;

    const camera = new THREE.PerspectiveCamera(
        60,
        width / height,
        0.1,
        1000
    );
    camera.position.set(15, 15, 15);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: container });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);

    // --- Major grid (every 5 units) - brighter ---
    const majorGridSize = 50;
    const majorGridDivisions = 10;
    const majorGrid = new THREE.GridHelper(
        majorGridSize,
        majorGridDivisions,
        0x00d4ff,
        0x00d4ff
    );
    majorGrid.material.opacity = 0.9;
    majorGrid.material.transparent = true;
    scene.add(majorGrid);

    // --- Minor grid (every 1 unit) - subtle ---
    const minorGridSize = 50;
    const minorGridDivisions = 50;
    const minorGrid = new THREE.GridHelper(
        minorGridSize,
        minorGridDivisions,
        0x0088aa,
        0x0088aa
    );
    minorGrid.material.opacity = 0.5;
    minorGrid.material.transparent = true;
    scene.add(minorGrid);

    // --- Coordinate axes (prominent) ---
    const axisLength = 5;
    const axisWidth = 5;

    // X-axis (Red)
    const xAxisGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(axisLength, 0, 0),
    ]);
    const xAxisMat = new THREE.LineBasicMaterial({
        color: 0xff0000,
        linewidth: axisWidth,
    });
    const xAxis = new THREE.Line(xAxisGeom, xAxisMat);
    scene.add(xAxis);

    // Y-axis (Green)
    const yAxisGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, axisLength, 0),
    ]);
    const yAxisMat = new THREE.LineBasicMaterial({
        color: 0x00ff00,
        linewidth: axisWidth,
    });
    const yAxis = new THREE.Line(yAxisGeom, yAxisMat);
    scene.add(yAxis);

    // Z-axis (Blue)
    const zAxisGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, axisLength),
    ]);
    const zAxisMat = new THREE.LineBasicMaterial({
        color: 0x0000ff,
        linewidth: axisWidth,
    });
    const zAxis = new THREE.Line(zAxisGeom, zAxisMat);
    scene.add(zAxis);

    // --- Origin marker ---
    const originGeom = new THREE.SphereGeometry(0.2, 16, 16);
    const originMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const origin = new THREE.Mesh(originGeom, originMat);
    scene.add(origin);

    // --- Lighting for structural models ---
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(10, 20, 10);
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-10, 10, -10);
    scene.add(fillLight);

    // --- Custom Orbit & Pan Controls ---
    let isDragging = false;
    let isPanning = false;
    let previousMousePosition = { x: 0, y: 0 };

    const spherical = new THREE.Spherical();
    const target = new THREE.Vector3(0, 0, 0);
    const offset = new THREE.Vector3();

    offset.copy(camera.position).sub(target);
    spherical.setFromVector3(offset);

    const onMouseDown = e => {
        if (e.button === 0) {
            isDragging = true;
        } else if (e.button === 1 || e.button === 2) {
            isPanning = true;
            e.preventDefault();
        }
        previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = e => {
        if (!isDragging && !isPanning) return;

        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;

        if (isDragging) {
            const rotationSpeed = 0.005;
            spherical.theta -= deltaX * rotationSpeed;
            spherical.phi -= deltaY * rotationSpeed;
            spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

            offset.setFromSpherical(spherical);
            camera.position.copy(target).add(offset);
            camera.lookAt(target);
        } else if (isPanning) {
            const panSpeed = 0.002;
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
            const distance = camera.position.distanceTo(target);
            const panOffset = new THREE.Vector3();
            panOffset.addScaledVector(right, -deltaX * panSpeed * distance);
            panOffset.addScaledVector(up, deltaY * panSpeed * distance);

            target.add(panOffset);
            camera.position.add(panOffset);
            offset.copy(camera.position).sub(target);
            spherical.setFromVector3(offset);
        }

        previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
        isDragging = false;
        isPanning = false;
    };

    const onWheel = e => {
        e.preventDefault();
        const zoomSpeed = 0.02;
        const delta = e.deltaY * zoomSpeed;
        spherical.radius = Math.max(1, Math.min(200, spherical.radius + delta));
        offset.setFromSpherical(spherical);
        camera.position.copy(target).add(offset);
    };

    const onContextMenu = e => e.preventDefault();

    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('contextmenu', onContextMenu);

    // --- animation loop ---
    function animate() {
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
    }
    animate();

    // --- handle resize ---
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const width = entry.contentRect.width;
            const height = entry.contentRect.height;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        }
    });
    resizeObserver.observe(container);

    // Store cleanup function
    window.__cleanup_drawing_canvas = () => {
        resizeObserver.disconnect();
        container.removeEventListener('mousedown', onMouseDown);
        container.removeEventListener('mousemove', onMouseMove);
        container.removeEventListener('mouseup', onMouseUp);
        container.removeEventListener('wheel', onWheel);
        container.removeEventListener('contextmenu', onContextMenu);
        renderer.dispose();
    };
};// Bending moment diagram visualization

let momentDiagramGroup = null;

/**
 * Show bending moment diagram overlay on structure
 * @param {string} momentsJson - JSON array of ElementForces
 */
window.showMomentDiagram = function(momentsJson) {
    if (!window.scene) {
        console.error("Scene not initialized");
        return;
    }

    // Remove existing diagram
    if (momentDiagramGroup) {
        window.scene.remove(momentDiagramGroup);
        momentDiagramGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }

    const elementForces = JSON.parse(momentsJson);
    console.log("Drawing moment diagram for", elementForces.length, "elements");

    momentDiagramGroup = new THREE.Group();
    momentDiagramGroup.name = "MomentDiagram";

    // Find max moment for scaling
    let maxMoment = 0;
    elementForces.forEach(ef => {
        const totalMoment = Math.sqrt(
            ef.moment_x ** 2 + ef.moment_y ** 2 + ef.moment_z ** 2
        );
        maxMoment = Math.max(maxMoment, totalMoment);
    });

    if (maxMoment < 1e-6) {
        console.warn("No significant moments to display");
        return;
    }

    console.log("Max moment:", maxMoment, "N·m");

    // Scale factor: show moments as offset curves from beam centerline
    const scaleFactor = 2.0 / maxMoment; // Adjust for visual clarity

    // Get structure data to map element IDs to beam geometry
    const structureJson = window.getStructureJSON();
    if (!structureJson) {
        console.error("No structure data available");
        return;
    }

    const structure = JSON.parse(structureJson);
    const nodeMap = new Map();
    structure.nodes.forEach(node => {
        nodeMap.set(node.id, new THREE.Vector3(node.x, node.y, node.z));
    });

    // Draw moment diagram for each element
    elementForces.forEach(ef => {
        const elemId = ef.element_id - 1; // Convert from 1-based to 0-based
        const beam = structure.beams[elemId];
        
        if (!beam || beam.node_ids.length < 2) {
            console.warn("Beam not found for element", ef.element_id);
            return;
        }

        const startNode = nodeMap.get(beam.node_ids[0]);
        const endNode = nodeMap.get(beam.node_ids[1]);
        
        if (!startNode || !endNode) {
            console.warn("Nodes not found for beam", beam.id);
            return;
        }

        // Primary bending moment (usually moment_y or moment_z)
        const moment = Math.max(Math.abs(ef.moment_y), Math.abs(ef.moment_z));
        const momentSign = Math.abs(ef.moment_y) > Math.abs(ef.moment_z) 
            ? Math.sign(ef.moment_y) 
            : Math.sign(ef.moment_z);

        const offset = moment * scaleFactor * momentSign;

        // Beam direction and perpendicular
        const beamDir = new THREE.Vector3().subVectors(endNode, startNode);
        const beamLength = beamDir.length();
        beamDir.normalize();

        // Choose perpendicular direction (prefer vertical for horizontal beams)
        let perpDir;
        if (Math.abs(beamDir.z) < 0.9) {
            // Horizontal beam - offset vertically
            perpDir = new THREE.Vector3(0, 0, 1);
        } else {
            // Vertical beam - offset horizontally
            perpDir = new THREE.Vector3(1, 0, 0);
        }

        // Create parabolic moment curve (simplified as triangle)
        const midPoint = new THREE.Vector3().addVectors(startNode, endNode).multiplyScalar(0.5);
        const offsetPoint = midPoint.clone().add(perpDir.multiplyScalar(offset));

        // Draw moment diagram as lines
        const points = [
            startNode.clone(),
            offsetPoint.clone(),
            endNode.clone(),
            startNode.clone(), // Close the shape
        ];

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ 
            color: offset > 0 ? 0x00ff00 : 0xff0000,  // Green for positive, red for negative
            linewidth: 2,
        });
        const line = new THREE.Line(geometry, material);
        momentDiagramGroup.add(line);

        // Fill the moment area with semi-transparent mesh
        const shape = new THREE.Shape([
            new THREE.Vector2(0, 0),
            new THREE.Vector2(beamLength / 2, offset),
            new THREE.Vector2(beamLength, 0),
        ]);
        
        const fillGeometry = new THREE.ShapeGeometry(shape);
        const fillMaterial = new THREE.MeshBasicMaterial({
            color: offset > 0 ? 0x00ff00 : 0xff0000,
            opacity: 0.3,
            transparent: true,
            side: THREE.DoubleSide,
        });
        const fill = new THREE.Mesh(fillGeometry, fillMaterial);
        
        // Position and orient the fill mesh
        fill.position.copy(startNode);
        fill.quaternion.setFromUnitVectors(
            new THREE.Vector3(1, 0, 0),
            beamDir
        );
        
        momentDiagramGroup.add(fill);

        // Add text label at max moment point
        const labelText = `${(moment / 1000).toFixed(1)} kN·m`;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        context.fillStyle = '#ffffff';
        context.font = 'Bold 24px Arial';
        context.fillText(labelText, 10, 40);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.copy(offsetPoint);
        sprite.scale.set(1, 0.25, 1);
        momentDiagramGroup.add(sprite);
    });

    window.scene.add(momentDiagramGroup);
    console.log("Moment diagram added to scene");
};

/**
 * Hide and remove moment diagram
 */
window.hideMomentDiagram = function() {
    if (momentDiagramGroup) {
        window.scene.remove(momentDiagramGroup);
        momentDiagramGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
        });
        momentDiagramGroup = null;
        console.log("Moment diagram removed");
    }
};
// Extract structure data from Three.js scene for Code_Aster analysis

window.extractStructureData = function() {
    const sceneData = window.sceneData;
    if (!sceneData) {
        console.error('Scene data not available');
        return null;
    }

    console.log('=== Starting structure extraction ===');
    console.log('sceneData:', sceneData);
    console.log('nodesGroup:', sceneData.nodesGroup);
    console.log('beamsGroup:', sceneData.beamsGroup);
    console.log('scene.children:', sceneData.scene.children);

    const nodes = [];
    const beams = [];
    const supports = [];
    const point_loads = [];
    const distributed_loads = [];

    // Extract nodes from nodesGroup
    let nodeId = 0;
    console.log('Node count:', sceneData.nodesGroup.children.length);
    sceneData.nodesGroup.children.forEach((nodeMesh, idx) => {
        console.log(`Node ${idx}:`, nodeMesh.position);
        nodes.push({
            id: nodeId++,
            x: nodeMesh.position.x,
            y: nodeMesh.position.y,
            z: nodeMesh.position.z,
            uuid: nodeMesh.uuid
        });
    });

    // Extract beams from beamsGroup  
    let beamId = 0;
    console.log('Beam count:', sceneData.beamsGroup.children.length);
    sceneData.beamsGroup.children.forEach((beamMesh, idx) => {
        console.log(`\n=== Beam ${idx} ===`);
        console.log('beamMesh:', beamMesh);
        console.log('beamMesh.userData:', beamMesh.userData);
        
        // Beams are stored as Mesh objects (cylinders) with startNode/endNode in userData
        if (beamMesh.isMesh || beamMesh.type === 'Mesh') {
            console.log('Is a Mesh object');
            
            // Get beam endpoints from userData.startNode and userData.endNode
            if (beamMesh.userData && beamMesh.userData.startNode && beamMesh.userData.endNode) {
                const startNodeMesh = beamMesh.userData.startNode;
                const endNodeMesh = beamMesh.userData.endNode;
                console.log('Got node meshes from userData');
                console.log('startNodeMesh:', startNodeMesh.position);
                console.log('endNodeMesh:', endNodeMesh.position);
                
                // Find matching nodes by UUID
                const startNode = nodes.find(n => n.uuid === startNodeMesh.uuid);
                const endNode = nodes.find(n => n.uuid === endNodeMesh.uuid);
                
                console.log('Found startNode:', startNode, 'endNode:', endNode);
                
                if (startNode && endNode) {
                    const beam = {
                        id: beamId++,
                        node_ids: [startNode.id, endNode.id],
                        section: {
                            width: 0.3,
                            height: 0.5,
                            section_type: "Rectangular"
                        },
                        uuid: beamMesh.uuid
                    };
                    console.log('Created beam:', beam);
                    beams.push(beam);
                } else {
                    console.warn('Could not find matching nodes for beam');
                    console.warn('Available nodes:', nodes);
                }
            } else {
                console.warn('Beam missing userData with startNode/endNode');
                console.warn('userData:', beamMesh.userData);
            }
        }
    });

    // Extract supports from constraint symbols in the scene
    console.log('\n=== Extracting supports ===');
    console.log('Has constraintSymbols property:', !!sceneData.constraintSymbols);
    
    // Look for constraint symbols in the scene children
    const constraintGroups = [];
    sceneData.scene.children.forEach(child => {
        if (child.type === 'Group' && child.userData && (child.userData.isConstraintSymbol || child.userData.supportType)) {
            console.log('Found constraint symbol:', child);
            constraintGroups.push(child);
        }
    });
    
    console.log('Found constraint groups:', constraintGroups.length);
    
    constraintGroups.forEach((symbolGroup, idx) => {
        console.log(`Constraint ${idx}:`, symbolGroup);
        const pos = symbolGroup.position;
        console.log('Position:', pos);
        
        const node = nodes.find(n => 
            Math.abs(n.x - pos.x) < 0.1 && 
            Math.abs(n.y - pos.y) < 0.1 && 
            Math.abs(n.z - pos.z) < 0.1
        );
        
        console.log('Found node:', node);
        
        if (node) {
            const constraintType = symbolGroup.userData?.supportType || symbolGroup.userData?.constraintType || 'Pinned';
            const support = {
                node_id: node.id,
                constraint_type: constraintType
            };
            console.log('Created support:', support);
            supports.push(support);
        }
    });

    // Extract point loads (if stored)
    if (window.pointLoads) {
        window.pointLoads.forEach((load, idx) => {
            const node = nodes.find(n => n.uuid === load.nodeUuid);
            if (node) {
                point_loads.push({
                    node_id: node.id,
                    fx: load.fx || 0,
                    fy: load.fy || 0,
                    fz: load.fz || 0
                });
            }
        });
    }

    // Extract distributed loads from beamLoads Map
    if (window.beamLoads && window.beamLoads.size > 0) {
        console.log('Extracting distributed loads, beamLoads size:', window.beamLoads.size);
        
        window.beamLoads.forEach((loads, beamUuid) => {
            console.log('Beam UUID:', beamUuid, 'Loads:', loads);
            
            // Find beam by UUID
            const beam = beams.find(b => b.uuid === beamUuid);
            if (!beam) {
                console.warn('Beam not found for UUID:', beamUuid);
                return;
            }
            
            loads.forEach(load => {
                console.log('Processing load:', load);
                
                if (load.type === 'distributed') {
                    let loadValue = load.magnitude;
                    let direction = load.direction || 'Y';
                    
                    distributed_loads.push({
                        element_ids: [beam.id],
                        load_type: {
                            Uniform: {
                                value: loadValue,
                                direction: direction.toUpperCase()
                            }
                        }
                    });
                    console.log('Added distributed load to beam', beam.id);
                }
            });
        });
        
        console.log('Total distributed loads extracted:', distributed_loads.length);
    } else {
        console.log('No beamLoads available');
    }

    // Material properties (default structural steel)
    const material = {
        name: "Structural Steel",
        elastic_modulus: 200e9,  // Pa
        poisson_ratio: 0.3,
        density: 7850.0  // kg/m³
    };

    const structureData = {
        nodes,
        beams,
        supports,
        point_loads,
        distributed_loads,
        material
    };

    console.log('Extracted structure data:', structureData);
    return structureData;
};
// Extract structure data from Three.js scene for Code_Aster analysis

window.extractStructureData = function(materialConfig, defaultThickness) {
    const sceneData = window.sceneData;
    if (!sceneData) {
        console.error('Scene data not available');
        return null;
    }

    console.log('=== Starting structure extraction (CalculiX Compatible) ===');
    
    const nodes = [];
    const beams = [];
    const shells = [];
    const supports = [];
    const point_loads = [];
    const distributed_loads = [];
    const pressure_loads = [];
    
    const nodeMap = new Map(); // Map UUID to ID
    const plateIdToShellIds = new Map();
    const shellUuidToId = new Map();

    // Extract nodes from nodesGroup
    let nodeId = 0;
    if (sceneData.nodesGroup) {
        sceneData.nodesGroup.children.forEach((nodeMesh, idx) => {
            nodes.push({
                id: nodeId,
                x: nodeMesh.position.x,
                y: nodeMesh.position.y,
                z: nodeMesh.position.z,
                uuid: nodeMesh.uuid
            });
            nodeMap.set(nodeMesh.uuid, nodeId);
            nodeId++;
        });
    }

    // Extract beams from beamsGroup  
    let beamId = 0;
    if (sceneData.beamsGroup) {
        sceneData.beamsGroup.children.forEach((beamMesh, idx) => {
            if (beamMesh.isMesh || beamMesh.type === 'Mesh') {
                if (beamMesh.userData && beamMesh.userData.startNode && beamMesh.userData.endNode) {
                    const startNodeMesh = beamMesh.userData.startNode;
                    const endNodeMesh = beamMesh.userData.endNode;
                    
                    const startId = nodeMap.get(startNodeMesh.uuid);
                    const endId = nodeMap.get(endNodeMesh.uuid);
                    
                    if (startId !== undefined && endId !== undefined) {
                        beams.push({
                            id: beamId++,
                            node_ids: [startId, endId],
                            section: {
                                width: 0.3,
                                height: 0.5,
                                section_type: "Rectangular"
                            },
                            uuid: beamMesh.uuid
                        });
                    }
                }
            }
        });
    }

    // Extract shells from plates
    const processPlate = (plate) => {
        const currentPlateShellIds = [];
        // Check for mesh visualization group
        const meshViz = plate.children ? plate.children.find(c => c.userData && c.userData.isMeshViz) : null;
        
        if (meshViz) {
            meshViz.children.forEach((element) => {
                if (element.userData.isMeshElement && element.userData.nodes) {
                    const nodeIds = element.userData.nodes.map(n => nodeMap.get(n.uuid));
                    
                    if (nodeIds.every(id => id !== undefined)) {
                        const shellId = shells.length;
                        shells.push({
                            id: shellId,
                            node_ids: nodeIds,
                            thickness: plate.userData.thickness || defaultThickness || 0.2
                        });
                        currentPlateShellIds.push(shellId);
                        // CRITICAL: Map the visual element UUID to the shell ID for pressure load extraction
                        shellUuidToId.set(element.uuid, shellId);
                        console.log(`Mapped mesh element ${element.uuid} to shell ID ${shellId}`);
                    }
                }
            });
        }
        plateIdToShellIds.set(plate.uuid, currentPlateShellIds);
    };

    if (sceneData.platesGroup) {
        sceneData.platesGroup.children.forEach(processPlate);
    } else if (sceneData.scene) {
        // Fallback: search in scene children
        sceneData.scene.children.forEach(child => {
            if (child.userData && (child.userData.isPlate || child.userData.type === 'plate')) {
                processPlate(child);
            }
        });
    }

    // Extract supports
    const constraintGroups = [];
    if (sceneData.scene) {
        sceneData.scene.children.forEach(child => {
            if (child.type === 'Group' && child.userData && (child.userData.isConstraintSymbol || child.userData.supportType)) {
                constraintGroups.push(child);
            }
        });
    }
    
    constraintGroups.forEach((symbolGroup) => {
        const pos = symbolGroup.position;
        const node = nodes.find(n => 
            Math.abs(n.x - pos.x) < 0.1 && 
            Math.abs(n.y - pos.y) < 0.1 && 
            Math.abs(n.z - pos.z) < 0.1
        );
        
        if (node) {
            let constraintType = symbolGroup.userData?.supportType || symbolGroup.userData?.constraintType || 'pinned';
            const typeMap = {
                'fixed': 'Fixed',
                'pinned': 'Pinned',
                'roller': 'RollerY',
                'rollerx': 'RollerX',
                'rollery': 'RollerY',
                'rollerz': 'RollerZ'
            };
            constraintType = typeMap[constraintType.toLowerCase()] || 'Pinned';
            
            supports.push({
                node_id: node.id,
                constraint_type: constraintType
            });
        }
    });

    // Extract point loads
    if (window.pointLoads) {
        window.pointLoads.forEach((load) => {
            const node = nodes.find(n => n.uuid === load.nodeUuid);
            if (node) {
                point_loads.push({
                    node_id: node.id,
                    fx: load.fx || 0,
                    fy: load.fy || 0,
                    fz: load.fz || 0
                });
            }
        });
    }

    // Extract distributed loads
    if (window.beamLoads && window.beamLoads.size > 0) {
        window.beamLoads.forEach((loads, beamUuid) => {
            const beam = beams.find(b => b.uuid === beamUuid);
            if (beam) {
                loads.forEach(load => {
                    if (load.type === 'distributed') {
                        distributed_loads.push({
                            element_ids: [beam.id],
                            load_type: {
                                Uniform: {
                                    value: load.magnitude,
                                    direction: (load.direction || 'Y').toUpperCase()
                                }
                            }
                        });
                    }
                });
            }
        });
    }

    // Extract pressure loads
    if (window.plateLoads) {
        window.plateLoads.forEach((loads, uuid) => {
            const shellIds = plateIdToShellIds.get(uuid);
            if (shellIds && shellIds.length > 0) {
                loads.forEach(load => {
                    if (load.type === 'pressure') {
                        pressure_loads.push({
                            element_ids: shellIds,
                            magnitude: load.magnitude
                        });
                    }
                });
            } else {
                console.warn(`Plate ${uuid} has pressure loads but no generated shells (elements). Ensure the plate is meshed.`);
            }
        });
    }

    // Extract element-specific pressure loads
    if (window.elementLoads) {
        console.log(`🔍 Extracting element-specific pressure loads...`);
        console.log(`   elementLoads Map size: ${window.elementLoads.size}`);
        console.log(`   shellUuidToId Map size: ${shellUuidToId.size}`);
        
        let extractedCount = 0;
        window.elementLoads.forEach((loads, elementUuid) => {
            console.log(`   Checking element ${elementUuid}:`, loads);
            const shellId = shellUuidToId.get(elementUuid);
            if (shellId !== undefined) {
                console.log(`   ✅ Found shell ID ${shellId} for element ${elementUuid}`);
                loads.forEach(load => {
                    if (load.type === 'pressure_element') {
                        pressure_loads.push({
                            element_ids: [shellId],
                            magnitude: load.magnitude
                        });
                        extractedCount++;
                        console.log(`   ✅ Extracted pressure load: ${load.magnitude} Pa on shell ${shellId}`);
                    }
                });
            } else {
                console.warn(`   ❌ No shell ID found for element UUID: ${elementUuid}`);
            }
        });
        console.log(`🎉 Extracted ${extractedCount} element-specific pressure loads`);
    }

    const material = materialConfig || {
        name: "Structural Steel",
        elastic_modulus: 200e9,
        poisson_ratio: 0.3,
        density: 7850.0
    };

    const structureData = {
        nodes,
        beams,
        shells,
        material,
        point_loads,
        distributed_loads,
        pressure_loads,
        supports
    };

    console.log('Extracted structure data:', structureData);
    return structureData;
};
/**
 * Analysis Results Visualization
 * Handles display of FEA analysis results including diagrams
 */

// Use existing THREE from global scope (already loaded in viewport_combined.js)
// Store analysis results globally
let currentResults = null;

/**
 * Update and display analysis results
 * @param {Object} results - Analysis results from Code_Aster service
 */
function handleViewportAnalysisResults(results) {
    console.log('updateAnalysisResults called with:', results);
    currentResults = results;
    
    // Display results summary
    displayResultsSummary(results);
    
    // Create bending moment diagram
    if (results.stresses && results.stresses.length > 0) {
        createBendingMomentDiagram(results);
    }
    
    // Create shear force diagram
    if (results.reactions && results.reactions.length > 0) {
        createShearForceDiagram(results);
    }
    
    console.log('Analysis results updated successfully');
}

if (window.registerAnalysisResultsHandler) {
    window.registerAnalysisResultsHandler(handleViewportAnalysisResults);
} else {
    window.updateAnalysisResults = handleViewportAnalysisResults;
}

/**
 * Display summary of analysis results
 */
function displayResultsSummary(results) {
    console.log('=== ANALYSIS RESULTS SUMMARY ===');
    console.log('Max Displacement:', results.max_displacement, 'm');
    console.log('Max Stress:', results.max_stress, 'Pa');
    
    console.log('\nDisplacements:');
    results.displacements.forEach(d => {
        console.log(`  Node ${d.node_id}: dx=${d.dx.toFixed(6)}, dy=${d.dy.toFixed(6)}, dz=${d.dz.toFixed(6)}`);
    });
    
    console.log('\nReactions:');
    results.reactions.forEach(r => {
        console.log(`  Node ${r.node_id}: Fy=${r.fy.toFixed(2)} N, Mz=${r.mz.toFixed(2)} N⋅m`);
    });
    
    console.log('\nStresses:');
    results.stresses.forEach(s => {
        console.log(`  Node ${s.node_id}: Von Mises=${(s.von_mises/1e6).toFixed(2)} MPa`);
    });
}

/**
 * Create bending moment diagram
 */
function createBendingMomentDiagram(results) {
    console.log('Creating bending moment diagram...');
    
    if (!window.sceneData || !window.sceneData.scene) {
        console.error('Scene data not available');
        return;
    }
    
    // Remove existing diagrams
    removeDiagramsByName('BendingMomentDiagram');
    
    const beamsGroup = window.sceneData.beamsGroup;
    if (!beamsGroup || beamsGroup.children.length === 0) {
        console.error('No beams available for diagram');
        return;
    }
    
    // Create diagram for each beam
    results.stresses.forEach(stress => {
        const beamMesh = beamsGroup.children[stress.element_id];
        if (!beamMesh) return;
        
        const startNode = beamMesh.userData.startNode;
        const endNode = beamMesh.userData.endNode;
        
        if (!startNode || !endNode) return;
        
        // Create moment diagram curve
        const diagramGroup = createMomentDiagramCurve(
            startNode.position,
            endNode.position,
            stress.bending_stress_y
        );
        
        diagramGroup.name = 'BendingMomentDiagram';
        window.sceneData.scene.add(diagramGroup);
    });
    
    console.log('Bending moment diagram created');
}

/**
 * Create shear force diagram
 */
function createShearForceDiagram(results) {
    console.log('Creating shear force diagram...');
    
    if (!window.sceneData || !window.sceneData.scene) {
        console.error('Scene data not available');
        return;
    }
    
    // Remove existing diagrams
    removeDiagramsByName('ShearForceDiagram');
    
    const beamsGroup = window.sceneData.beamsGroup;
    if (!beamsGroup || beamsGroup.children.length === 0) {
        console.error('No beams available for diagram');
        return;
    }
    
    // Calculate shear forces from reactions
    const totalShear = results.reactions.reduce((sum, r) => sum + Math.abs(r.fy), 0) / 2;
    
    // Create diagram for each beam
    beamsGroup.children.forEach((beamMesh, idx) => {
        const startNode = beamMesh.userData.startNode;
        const endNode = beamMesh.userData.endNode;
        
        if (!startNode || !endNode) return;
        
        // Create shear diagram (rectangular for uniform load)
        const diagramGroup = createShearDiagramRect(
            startNode.position,
            endNode.position,
            totalShear
        );
        
        diagramGroup.name = 'ShearForceDiagram';
        window.sceneData.scene.add(diagramGroup);
    });
    
    console.log('Shear force diagram created');
}

/**
 * Create curved bending moment diagram
 */
function createMomentDiagramCurve(startPos, endPos, maxMoment) {
    // Get THREE from global scope
    const THREE = window.THREE;
    if (!THREE) {
        console.error('THREE not available');
        return new Object();  // Return empty object instead of Group
    }
    
    const group = new THREE.Group();
    
    // Beam length and direction
    const beamVector = new THREE.Vector3().subVectors(endPos, startPos);
    const beamLength = beamVector.length();
    const beamDir = beamVector.clone().normalize();
    
    // Perpendicular direction for diagram (upward)
    const upDir = new THREE.Vector3(0, 1, 0);
    
    // Scale factor for diagram height (based on stress magnitude)
    const scale = Math.abs(maxMoment) / 5e7; // Adjust scale as needed
    const maxHeight = Math.min(scale, beamLength * 0.5);
    
    // Create parabolic curve for moment diagram
    const points = [];
    const segments = 20;
    
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const pos = new THREE.Vector3().lerpVectors(startPos, endPos, t);
        
        // Parabolic shape: moment is max at center for uniform load
        const height = maxHeight * 4 * t * (1 - t);
        pos.add(upDir.clone().multiplyScalar(height));
        
        points.push(pos);
    }
    
    // Create line geometry
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ 
        color: 0xff0000, 
        linewidth: 2,
        transparent: true,
        opacity: 0.8
    });
    
    const curve = new THREE.Line(geometry, material);
    group.add(curve);
    
    // Add vertical lines from beam to diagram
    for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        const basePos = new THREE.Vector3().lerpVectors(startPos, endPos, t);
        const height = maxHeight * 4 * t * (1 - t);
        const topPos = basePos.clone().add(upDir.clone().multiplyScalar(height));
        
        const verticalGeometry = new THREE.BufferGeometry().setFromPoints([basePos, topPos]);
        const verticalLine = new THREE.Line(verticalGeometry, material);
        group.add(verticalLine);
    }
    
    // Add label
    const labelPos = new THREE.Vector3().lerpVectors(startPos, endPos, 0.5);
    labelPos.add(upDir.clone().multiplyScalar(maxHeight + 0.5));
    
    // Note: In a real implementation, you'd add a text sprite here
    // For now, we'll just log the value
    console.log(`Max Moment at center: ${(maxMoment/1e6).toFixed(2)} MPa`);
    
    return group;
}

/**
 * Create rectangular shear force diagram
 */
function createShearDiagramRect(startPos, endPos, shearForce) {
    // Get THREE from global scope
    const THREE = window.THREE;
    if (!THREE) {
        console.error('THREE not available');
        return new Object();  // Return empty object instead of Group
    }
    
    const group = new THREE.Group();
    
    // Beam direction
    const beamVector = new THREE.Vector3().subVectors(endPos, startPos);
    const beamLength = beamVector.length();
    const midPoint = new THREE.Vector3().lerpVectors(startPos, endPos, 0.5);
    
    // Perpendicular direction
    const upDir = new THREE.Vector3(0, 1, 0);
    
    // Scale factor for diagram height
    const scale = shearForce / 100000; // Adjust as needed
    const height = Math.min(scale, beamLength * 0.3);
    
    // Create rectangular outline for shear diagram
    const points = [
        startPos.clone(),
        startPos.clone().add(upDir.clone().multiplyScalar(height)),
        endPos.clone().add(upDir.clone().multiplyScalar(height)),
        endPos.clone(),
        startPos.clone()
    ];
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ 
        color: 0x0000ff, 
        linewidth: 2,
        transparent: true,
        opacity: 0.8
    });
    
    const outline = new THREE.Line(geometry, material);
    group.add(outline);
    
    console.log(`Shear Force: ${shearForce.toFixed(2)} N`);
    
    return group;
}

/**
 * Remove existing diagrams by name
 */
function removeDiagramsByName(name) {
    if (!window.sceneData || !window.sceneData.scene) return;
    
    const toRemove = [];
    window.sceneData.scene.children.forEach(child => {
        if (child.name === name) {
            toRemove.push(child);
        }
    });
    
    toRemove.forEach(obj => {
        window.sceneData.scene.remove(obj);
    });
}

/**
 * Clear all analysis visualizations
 */
window.clearAnalysisResults = function() {
    removeDiagramsByName('BendingMomentDiagram');
    removeDiagramsByName('ShearForceDiagram');
    removeDiagramsByName('VonMisesStress');
    removeDiagramsByName('ContourVisualization');
    currentResults = null;
    window.analysisResults = null;
    restoreMeshVisualizations();
    hideStressLegend();
    console.log('Analysis results cleared');
};

/**
 * Get current results
 */
window.getCurrentAnalysisResults = function() {
    return currentResults;
};

/**
 * Show Deformed Shape
 */
window.showDeformedShape = function() {
    const results = window.analysisResults;
    console.log("=== showDeformedShape called ===");
    console.log("window.analysisResults:", window.analysisResults);
    
    if (!results) {
        console.warn("No analysis results available (window.analysisResults is null/undefined)");
        return;
    }
    
    if (!results.displacements) {
        console.warn("No displacements array in results");
        return;
    }
    
    if (results.displacements.length === 0) {
        console.warn("Displacements array is empty");
        return;
    }
    
    console.log(`Found ${results.displacements.length} displacement results, max_displacement: ${results.max_displacement}`);
    
    const sceneData = window.sceneData;
    if (!sceneData) {
        console.error("sceneData not available");
        return;
    }

    // Remove existing deformed shape
    removeDiagramsByName('DeformedShape');

    const deformedGroup = new THREE.Group();
    deformedGroup.name = 'DeformedShape';

    // Scale factor for deformation (auto-scale)
    let maxDisp = 0;
    results.displacements.forEach(d => {
        const disp = Math.sqrt(d.dx*d.dx + d.dy*d.dy + d.dz*d.dz);
        if (disp > maxDisp) maxDisp = disp;
    });
    
    const scaleFactor = maxDisp > 0 ? 2.0 / maxDisp : 1.0; // Scale max displacement to 2 units
    console.log(`Deformation scale factor: ${scaleFactor.toFixed(2)} (max disp: ${maxDisp.toFixed(4)}m)`);

    // Create deformed nodes map
    const deformedNodes = new Map();
    results.displacements.forEach(d => {
        const nodeMesh = sceneData.nodesGroup.children[d.node_id];
        if (nodeMesh) {
            const originalPos = nodeMesh.position.clone();
            const deformedPos = originalPos.clone().add(
                new THREE.Vector3(d.dx, d.dy, d.dz).multiplyScalar(scaleFactor)
            );
            deformedNodes.set(d.node_id, deformedPos);
        }
    });
    console.log(`Created deformed position map for ${deformedNodes.size} nodes`);

    // Draw deformed beams
    let beamCount = 0;
    sceneData.beamsGroup.children.forEach((beam) => {
        if (beam.userData && beam.userData.startNode && beam.userData.endNode) {
            const startNodeIdx = sceneData.nodesGroup.children.indexOf(beam.userData.startNode);
            const endNodeIdx = sceneData.nodesGroup.children.indexOf(beam.userData.endNode);
            
            if (startNodeIdx !== -1 && endNodeIdx !== -1 && 
                deformedNodes.has(startNodeIdx) && deformedNodes.has(endNodeIdx)) {
                const p1 = deformedNodes.get(startNodeIdx);
                const p2 = deformedNodes.get(endNodeIdx);
                
                const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
                const material = new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 2 });
                const line = new THREE.Line(geometry, material);
                deformedGroup.add(line);
                beamCount++;
            }
        }
    });
    console.log(`Drew ${beamCount} deformed beams`);

    // Draw deformed mesh elements
    let elementCount = 0;
    if (sceneData.platesGroup) {
        sceneData.platesGroup.children.forEach((plate) => {
            const meshViz = plate.children.find(c => c.userData && c.userData.isMeshViz);
            if (meshViz) {
                meshViz.children.forEach((element) => {
                    if (element.isMesh && element.userData && element.userData.isMeshElement && element.userData.nodes) {
                        const nodeIds = element.userData.nodes.map(n => {
                            return sceneData.nodesGroup.children.indexOf(n);
                        });
                        
                        // Get deformed positions for all nodes
                        const deformedPositions = [];
                        let allNodesFound = true;
                        for (const id of nodeIds) {
                            if (id !== -1 && deformedNodes.has(id)) {
                                deformedPositions.push(deformedNodes.get(id));
                            } else {
                                allNodesFound = false;
                                break;
                            }
                        }
                        
                        if (allNodesFound && deformedPositions.length === 4) {
                            // Create deformed quad (two triangles)
                            const quadGeom = new THREE.BufferGeometry();
                            const quadVertices = [
                                deformedPositions[0].x, deformedPositions[0].y, deformedPositions[0].z,
                                deformedPositions[1].x, deformedPositions[1].y, deformedPositions[1].z,
                                deformedPositions[3].x, deformedPositions[3].y, deformedPositions[3].z,
                                
                                deformedPositions[1].x, deformedPositions[1].y, deformedPositions[1].z,
                                deformedPositions[2].x, deformedPositions[2].y, deformedPositions[2].z,
                                deformedPositions[3].x, deformedPositions[3].y, deformedPositions[3].z
                            ];
                            quadGeom.setAttribute('position', new THREE.Float32BufferAttribute(quadVertices, 3));
                            quadGeom.computeVertexNormals();
                            
                            const quadMesh = new THREE.Mesh(
                                quadGeom,
                                new THREE.MeshBasicMaterial({
                                    color: 0xff00ff,
                                    side: THREE.DoubleSide,
                                    transparent: true,
                                    opacity: 0.5,
                                    wireframe: false
                                })
                            );
                            
                            // Add wireframe edges
                            const edgesGeom = new THREE.EdgesGeometry(quadGeom);
                            const edgesMat = new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 2 });
                            const edges = new THREE.LineSegments(edgesGeom, edgesMat);
                            quadMesh.add(edges);
                            
                            deformedGroup.add(quadMesh);
                            elementCount++;
                        }
                    }
                });
            }
        });
    }
    console.log(`Drew ${elementCount} deformed mesh elements`);
    
    sceneData.scene.add(deformedGroup);
    console.log("Deformed shape visualization added to scene");
};

const STRESS_LEGEND_ID = 'von-mises-legend';

function formatMPa(value) {
    if (!isFinite(value)) {
        return '0.00 MPa';
    }
    const mpValue = value / 1e6;
    const abs = Math.abs(mpValue);
    let decimals = 2;
    if (abs >= 100) {
        decimals = 0;
    } else if (abs >= 10) {
        decimals = 1;
    }
    return `${mpValue.toFixed(decimals)} MPa`;
}

function ensureStressLegendElement() {
    if (typeof document === 'undefined') {
        return null;
    }
    let legend = document.getElementById(STRESS_LEGEND_ID);
    if (legend) {
        return legend;
    }
    legend = document.createElement('div');
    legend.id = STRESS_LEGEND_ID;
    legend.style.position = 'fixed';
    legend.style.right = '24px';
    legend.style.bottom = '24px';
    legend.style.padding = '12px 16px';
    legend.style.borderRadius = '10px';
    legend.style.background = 'rgba(7, 10, 24, 0.85)';
    legend.style.color = '#f5f5f5';
    legend.style.fontSize = '12px';
    legend.style.fontFamily = 'Space Grotesk, "Segoe UI", sans-serif';
    legend.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.35)';
    legend.style.display = 'none';
    legend.style.flexDirection = 'column';
    legend.style.gap = '8px';
    legend.style.pointerEvents = 'none';
    legend.style.zIndex = '999';

    const title = document.createElement('div');
    title.dataset.role = 'legend-title';
    title.textContent = 'Von Mises Stress';
    title.style.fontWeight = '600';
    title.style.letterSpacing = '0.04em';
    legend.appendChild(title);

    const gradient = document.createElement('div');
    gradient.style.height = '14px';
    gradient.style.borderRadius = '999px';
    gradient.style.background = 'linear-gradient(90deg,#1a4bff 0%,#1ac6ff 30%,#ffe066 65%,#ff4d4f 100%)';
    gradient.style.boxShadow = 'inset 0 0 6px rgba(0,0,0,0.35)';
    legend.appendChild(gradient);

    const labels = document.createElement('div');
    labels.style.display = 'flex';
    labels.style.justifyContent = 'space-between';
    labels.style.fontSize = '11px';
    labels.style.opacity = '0.9';

    const minLabel = document.createElement('span');
    minLabel.dataset.role = 'min-stress';
    minLabel.textContent = '0 MPa';

    const maxLabel = document.createElement('span');
    maxLabel.dataset.role = 'max-stress';
    maxLabel.textContent = '0 MPa';

    labels.appendChild(minLabel);
    labels.appendChild(maxLabel);
    legend.appendChild(labels);

    document.body.appendChild(legend);
    return legend;
}

function updateStressLegend(minStress, maxStress, surfaceLabel = 'Mid-Plane') {
    const legend = ensureStressLegendElement();
    if (!legend) {
        return;
    }
    const titleEl = legend.querySelector('[data-role="legend-title"]');
    const maxLabel = legend.querySelector('[data-role="max-stress"]');
    const minLabel = legend.querySelector('[data-role="min-stress"]');
    if (titleEl) {
        titleEl.textContent = `Von Mises Stress (${surfaceLabel})`;
    }
    if (minLabel) {
        minLabel.textContent = formatMPa(minStress);
    }
    if (maxLabel) {
        maxLabel.textContent = formatMPa(maxStress);
    }
    legend.style.display = 'flex';
}

function hideStressLegend() {
    const legend = typeof document !== 'undefined'
        ? document.getElementById(STRESS_LEGEND_ID)
        : null;
    if (legend) {
        legend.style.display = 'none';
    }
}

function restoreMeshVisualizations() {
    if (!window.sceneData || !window.sceneData.platesGroup) {
        return;
    }
    window.sceneData.platesGroup.children.forEach((plate) => {
        const meshViz = plate.children.find(c => c.userData && c.userData.isMeshViz);
        if (!meshViz) {
            return;
        }

        meshViz.visible = true;

        if (plate.userData && plate.userData.meshVizHiddenForStress) {
            delete plate.userData.meshVizHiddenForStress;
        }

        meshViz.children.forEach((element) => {
            if (!element.userData || !element.userData.hasStressOverlay) {
                return;
            }
            const state = element.userData.originalMaterialState;
            if (state && element.material) {
                element.material.color.setHex(state.color);
                element.material.opacity = state.opacity;
                element.material.transparent = state.transparent;
                element.material.depthWrite = state.depthWrite;
                element.material.depthTest = state.depthTest;
                element.material.vertexColors = state.vertexColors || false;
                element.material.needsUpdate = true;
            }
            delete element.userData.hasStressOverlay;
            delete element.userData.originalMaterialState;
        });
    });
}

function storeOriginalMaterialState(element) {
    if (!element || !element.material) {
        return;
    }
    if (!element.userData) {
        element.userData = {};
    }
    if (!element.userData.originalMaterialState) {
        element.userData.originalMaterialState = {
            color: element.material.color.getHex(),
            opacity: element.material.opacity,
            transparent: element.material.transparent,
            depthWrite: element.material.depthWrite,
            depthTest: element.material.depthTest,
            vertexColors: !!element.material.vertexColors
        };
    }
}

function applyStressMaterialOverrides(element) {
    if (!element || !element.material) {
        return;
    }
    element.material.opacity = 0.95;
    element.material.transparent = true;
    element.material.depthWrite = false;
    element.material.depthTest = false;
    // Ensure smooth vertex color interpolation (for MeshPhongMaterial/MeshStandardMaterial)
    if (element.material.flatShading !== undefined) {
        element.material.flatShading = false;
    }
    element.material.needsUpdate = true;
    if (!element.userData) {
        element.userData = {};
    }
    element.userData.hasStressOverlay = true;
}

function ensureColorAttribute(geometry, vertexCount) {
    if (!geometry) {
        return null;
    }
    // Always create a fresh color attribute to avoid GPU caching issues
    const colors = new Float32Array(vertexCount * 3);
    const newColorAttribute = new THREE.Float32BufferAttribute(colors, 3);
    geometry.setAttribute('color', newColorAttribute);
    return newColorAttribute;
}

function buildVertexNodeOrder(element) {
    if (!element || !element.geometry) {
        return null;
    }
    const nodes = element.userData?.nodes;
    const positionAttr = element.geometry.getAttribute('position');
    if (!Array.isArray(nodes) || !positionAttr) {
        return null;
    }

    if (element.userData.elementType === 'quad' && nodes.length === 4 && positionAttr.count === 6) {
        return [0, 1, 3, 1, 2, 3];
    }

    if (positionAttr.count === nodes.length) {
        return nodes.map((_, idx) => idx);
    }

    const vertex = new THREE.Vector3();
    const nodePositions = nodes.map((node) => (node ? node.position.clone() : null));
    const order = [];

    for (let i = 0; i < positionAttr.count; i++) {
        vertex.set(
            positionAttr.array[i * 3],
            positionAttr.array[i * 3 + 1],
            positionAttr.array[i * 3 + 2]
        );
        let bestIndex = -1;
        let bestDistance = Infinity;
        nodePositions.forEach((pos, idx) => {
            if (!pos) {
                return;
            }
            const dist = pos.distanceTo(vertex);
            if (dist < bestDistance) {
                bestDistance = dist;
                bestIndex = idx;
            }
        });
        order.push(bestIndex);
    }

    return order;
}

function normalizeScalarValue(value, minValue, maxValue) {
    if (!isFinite(value) || !isFinite(minValue) || !isFinite(maxValue)) {
        return 0;
    }
    if (Math.abs(maxValue - minValue) < 1e-9) {
        return 0.5;
    }
    return THREE.MathUtils.clamp((value - minValue) / (maxValue - minValue), 0, 1);
}

function applyInterpolatedScalarColors(element, vertexNodeOrder, nodeIds, nodeValueMap, minValue, maxValue) {
    if (!element || !element.geometry || !Array.isArray(vertexNodeOrder) || !Array.isArray(nodeIds)) {
        return false;
    }

    const positionAttr = element.geometry.getAttribute('position');
    if (!positionAttr || vertexNodeOrder.length !== positionAttr.count) {
        return false;
    }

    const colorAttr = ensureColorAttribute(element.geometry, positionAttr.count);
    if (!colorAttr) {
        return false;
    }

    const colors = colorAttr.array;
    const vertexStressValues = new Array(vertexNodeOrder.length).fill(null);
    let sampleCount = 0;
    let stressSum = 0;
    
    // Debug: track lookups for first few elements
    const lookupDebug = [];

    vertexNodeOrder.forEach((nodeIdx, vertexIdx) => {
        if (nodeIdx == null || nodeIdx < 0) {
            return;
        }
        const meshNodeId = nodeIds[nodeIdx];
        if (meshNodeId == null) {
            return;
        }
        const value = nodeValueMap.get(meshNodeId);
        if (window._colorDebugCount < 2) {
            lookupDebug.push({ vertexIdx, nodeIdx, meshNodeId, value: value ? (value/1e6).toFixed(2) : 'N/A' });
        }
        if (!isFinite(value)) {
            return;
        }
        vertexStressValues[vertexIdx] = value;
        stressSum += value;
        sampleCount++;
    });
    
    if (window._colorDebugCount < 2 && lookupDebug.length > 0) {
        console.log('Stress lookup debug:', lookupDebug);
    }

    if (sampleCount === 0) {
        return false;
    }

    const fallbackStress = stressSum / sampleCount;
    let debugSamples = [];
    vertexStressValues.forEach((stress, vertexIdx) => {
        const normalized = normalizeScalarValue(
            isFinite(stress) ? stress : fallbackStress,
            minValue,
            maxValue
        );
        const color = getScalarGradientColor(normalized);
        const offset = vertexIdx * 3;
        colors[offset] = color.r;
        colors[offset + 1] = color.g;
        colors[offset + 2] = color.b;
        if (vertexIdx < 4) {
            debugSamples.push({
                vertexIdx,
                stress: stress ? (stress/1e6).toFixed(2) : 'null',
                normalized: normalized.toFixed(3),
                color: `rgb(${(color.r*255).toFixed(0)},${(color.g*255).toFixed(0)},${(color.b*255).toFixed(0)})`
            });
        }
    });
    
    // Log first few elements' color data for debugging
    if (!window._colorDebugCount) {
        window._colorDebugCount = 0;
    }
    if (window._colorDebugCount < 5) {
        console.log('Color assignment samples:', debugSamples, 'min:', minValue, 'max:', maxValue);
        window._colorDebugCount++;
    }

    // Buffer was freshly created, just mark needsUpdate for safety
    colorAttr.needsUpdate = true;
    
    storeOriginalMaterialState(element);
    element.material.vertexColors = true;
    element.material.color.set(0xffffff);
    applyStressMaterialOverrides(element);
    element.material.needsUpdate = true;
    return true;
}

function getScalarGradientColor(normalizedValue) {
    const color = new THREE.Color();
    const t = THREE.MathUtils.clamp(normalizedValue, 0, 1);
    color.setHSL(0.666 * (1 - t), 1, 0.5);
    return color;
}

function applySolidScalarColor(element, color) {
    if (!element || !element.material || !color) {
        return;
    }

    storeOriginalMaterialState(element);
    element.material.vertexColors = false;
    element.material.color.copy(color);
    applyStressMaterialOverrides(element);
}

/**
 * Show Von Mises Stress (Node-based + Mesh Elements)
 * @param {string} surface - 'middle' (default), 'top', or 'bottom' for extreme fibres
 */
window.showVonMisesStress = function(surface = 'middle') {
    // Reset debug counter for color logging
    window._colorDebugCount = 0;
    
    const results = window.analysisResults;
    console.log(`=== showVonMisesStress called (surface: ${surface}) ===`);
    console.log("window.analysisResults:", window.analysisResults);
    
    if (!results) {
        console.warn("No analysis results available (window.analysisResults is null/undefined)");
        return;
    }
    
    if (!results.stresses) {
        console.warn("No stresses array in results");
        return;
    }
    
    if (results.stresses.length === 0) {
        console.warn("Stresses array is empty");
        return;
    }
    
    console.log(`Found ${results.stresses.length} stress results, max_stress: ${results.max_stress}`);
    
    const sceneData = window.sceneData;
    if (!sceneData) {
        console.error("sceneData not available");
        return;
    }

    restoreMeshVisualizations();
    removeDiagramsByName('VonMisesStress');
    hideStressLegend();
    
    const stressGroup = new THREE.Group();
    stressGroup.name = 'VonMisesStress';
    stressGroup.renderOrder = 10;
    
    // Get stress value based on selected surface
    const getStressValue = (s) => {
        switch(surface) {
            case 'top':
                return s.von_mises_top !== null && s.von_mises_top !== undefined ? s.von_mises_top : s.von_mises;
            case 'bottom':
                return s.von_mises_bottom !== null && s.von_mises_bottom !== undefined ? s.von_mises_bottom : s.von_mises;
            default:
                return s.von_mises;
        }
    };
    
    // Compute stress range for interpolation
    let maxStress = Number.NEGATIVE_INFINITY;
    let minStress = Number.POSITIVE_INFINITY;
    results.stresses.forEach(s => {
        const stressVal = getStressValue(s);
        if (!isFinite(stressVal)) {
            return;
        }
        if (stressVal > maxStress) {
            maxStress = stressVal;
        }
        if (stressVal < minStress) {
            minStress = stressVal;
        }
    });

    if (!isFinite(maxStress)) {
        console.warn('No finite Von Mises stress values found; aborting visualization.');
        return;
    }
    if (!isFinite(minStress)) {
        minStress = 0;
    }
    
    const surfaceLabel = surface === 'top' ? 'Top Fibre' : surface === 'bottom' ? 'Bottom Fibre' : 'Mid-Plane';
    console.log(
        `Von Mises Stress (${surfaceLabel}): min=${minStress.toFixed(2)} Pa (${(minStress/1e6).toFixed(2)} MPa), max=${maxStress.toFixed(2)} Pa (${(maxStress/1e6).toFixed(2)} MPa)`
    );

    // Map node ID to stress value
    const nodeStressMap = new Map();
    let mappedNodeCount = 0;
    results.stresses.forEach(s => {
        const stressVal = getStressValue(s);
        if (isFinite(stressVal)) {
            nodeStressMap.set(s.node_id, stressVal);
            mappedNodeCount++;
        }
    });
    console.log(`Created stress map with ${mappedNodeCount} entries`);
    
    // Debug: show sample stress values for verification
    if (mappedNodeCount > 0) {
        const sampleNodes = [0, 1, 2, 3]; // Corner nodes
        console.log(`Sample stress values for ${surface}:`);
        sampleNodes.forEach(nodeId => {
            const val = nodeStressMap.get(nodeId);
            const srcObj = results.stresses.find(s => s.node_id === nodeId);
            if (srcObj) {
                console.log(`  Node ${nodeId}: mapped=${val ? (val/1e6).toFixed(2) : 'N/A'} MPa, von_mises=${(srcObj.von_mises/1e6).toFixed(2)}, von_mises_top=${srcObj.von_mises_top ? (srcObj.von_mises_top/1e6).toFixed(2) : 'null'}, von_mises_bottom=${srcObj.von_mises_bottom ? (srcObj.von_mises_bottom/1e6).toFixed(2) : 'null'}`);
            }
        });
    }

    // Visualize stresses on existing mesh elements (recolor) and fall back to overlays for raw plates
    let coloredElementCount = 0;
    let overlayElementCount = 0;
    if (sceneData.platesGroup) {
        console.log(`Searching ${sceneData.platesGroup.children.length} top-level plates for mesh elements`);
        sceneData.platesGroup.children.forEach((plate, plateIdx) => {
            // Find mesh visualization in plate's children
            const meshViz = plate.children.find(c => c.userData && c.userData.isMeshViz);
            if (meshViz) {
                console.log(`Plate ${plateIdx} has mesh visualization with ${meshViz.children.length} elements`);
                meshViz.visible = true;

                // Process each mesh element in place
                meshViz.children.forEach((element) => {
                    if (element.isMesh && element.userData && element.userData.isMeshElement && element.userData.nodes) {
                        const nodeIds = element.userData.nodes.map((nodeRef) => {
                            if (!nodeRef) {
                                return null;
                            }
                            const idx = sceneData.nodesGroup.children.indexOf(nodeRef);
                            return idx >= 0 ? idx : null;
                        });
                        const vertexNodeOrder = buildVertexNodeOrder(element);
                        let applied = false;

                        if (vertexNodeOrder) {
                            applied = applyInterpolatedScalarColors(
                                element,
                                vertexNodeOrder,
                                nodeIds,
                                nodeStressMap,
                                minStress,
                                maxStress
                            );
                        }

                        if (!applied) {
                            const stresses = nodeIds
                                .map((id) => (id != null ? nodeStressMap.get(id) : undefined))
                                .filter((value) => isFinite(value));
                            if (stresses.length > 0) {
                                const avgStress = stresses.reduce((a, b) => a + b, 0) / stresses.length;
                                const color = getScalarGradientColor(normalizeScalarValue(avgStress, minStress, maxStress));
                                applySolidScalarColor(element, color);
                                applied = true;
                            }
                        }

                        if (applied) {
                            coloredElementCount++;
                        }
                    }
                });
            } else if (!plate.userData.mesh) {
                // Unmeshed plate - color entire plate by average node stress
                const plateVertices = [];
                const positions = plate.geometry.attributes.position.array;
                for(let i=0; i<positions.length; i+=3) {
                    plateVertices.push(new THREE.Vector3(positions[i], positions[i+1], positions[i+2]));
                }
                
                // Find nodes matching plate vertices
                const plateNodeIds = [];
                sceneData.nodesGroup.children.forEach((node, nodeId) => {
                    for (const v of plateVertices) {
                        if (node.position.distanceTo(v) < 0.1) {
                            plateNodeIds.push(nodeId);
                            break;
                        }
                    }
                });
                
                // Calculate average stress
                const stresses = [];
                plateNodeIds.forEach(id => {
                    if (nodeStressMap.has(id)) {
                        stresses.push(nodeStressMap.get(id));
                    }
                });
                
                if (stresses.length > 0) {
                    const avgStress = stresses.reduce((a, b) => a + b, 0) / stresses.length;
                    const color = getScalarGradientColor(normalizeScalarValue(avgStress, minStress, maxStress));
                    plate.updateWorldMatrix(true, false);
                    const worldMatrix = plate.matrixWorld.clone();
                    const coloredGeom = plate.geometry.clone();
                    coloredGeom.applyMatrix4(worldMatrix);
                    coloredGeom.computeVertexNormals();
                    const coloredMat = new THREE.MeshBasicMaterial({
                        color: color,
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 0.92,
                        depthWrite: false,
                        depthTest: false
                    });
                    const coloredMesh = new THREE.Mesh(coloredGeom, coloredMat);
                    coloredMesh.renderOrder = 11;
                    coloredMesh.frustumCulled = false;
                    coloredMesh.userData.isStressOverlay = true;
                    stressGroup.add(coloredMesh);
                    overlayElementCount++;
                }
            }
        });
    }
    
    if (stressGroup.children.length > 0) {
        sceneData.scene.add(stressGroup);
    }
    console.log(`Applied stress colors to ${coloredElementCount} mesh elements and created ${overlayElementCount} fallback overlays`);
    updateStressLegend(minStress, maxStress, surfaceLabel);
};

/**
 * Generic contour visualization for any scalar field
 * @param {string} contourType - Type of contour: 'von_mises', 'sxx', 'syy', 'szz', 'sxy', 
 *                               'principal_1', 'principal_2', 'principal_3',
 *                               'displacement_magnitude', 'dx', 'dy', 'dz'
 * @param {string} surface - 'middle', 'top', or 'bottom' (for shell stresses)
 */
window.showContour = function(contourType, surface = 'middle') {
    window._colorDebugCount = 0;
    
    const results = window.analysisResults;
    console.log(`=== showContour called (type: ${contourType}, surface: ${surface}) ===`);
    
    if (!results) {
        console.warn("No analysis results available");
        return;
    }
    
    const sceneData = window.sceneData;
    if (!sceneData) {
        console.error("sceneData not available");
        return;
    }
    
    restoreMeshVisualizations();
    removeDiagramsByName('VonMisesStress');
    removeDiagramsByName('ContourVisualization');
    hideStressLegend();
    
    // Determine data source and value extraction function
    let dataSource;
    let getValueFn;
    let legendLabel;
    let unit;
    
    // Stress-based contours
    if (['von_mises', 'sxx', 'syy', 'szz', 'sxy', 'principal_1', 'principal_2', 'principal_3'].includes(contourType)) {
        if (!results.stresses || results.stresses.length === 0) {
            console.warn("No stress data available");
            return;
        }
        dataSource = results.stresses;
        unit = 'MPa';
        
        switch(contourType) {
            case 'von_mises':
                legendLabel = surface === 'top' ? 'Von Mises (Top)' : 
                              surface === 'bottom' ? 'Von Mises (Bottom)' : 'Von Mises';
                getValueFn = (s) => {
                    if (surface === 'top' && s.von_mises_top != null) return s.von_mises_top;
                    if (surface === 'bottom' && s.von_mises_bottom != null) return s.von_mises_bottom;
                    return s.von_mises;
                };
                break;
            case 'sxx':
                legendLabel = 'σxx (Normal X)';
                getValueFn = (s) => s.sxx != null ? s.sxx : null;
                break;
            case 'syy':
                legendLabel = 'σyy (Normal Y)';
                getValueFn = (s) => s.syy != null ? s.syy : null;
                break;
            case 'szz':
                legendLabel = 'σzz (Normal Z)';
                getValueFn = (s) => s.szz != null ? s.szz : null;
                break;
            case 'sxy':
                legendLabel = 'σxy (Shear XY)';
                getValueFn = (s) => s.sxy != null ? s.sxy : null;
                break;
            case 'principal_1':
                legendLabel = 'Principal Stress σ₁ (Max)';
                getValueFn = (s) => {
                    // Calculate principal stresses from stress tensor
                    if (s.sxx == null || s.syy == null) return s.von_mises; // Fallback
                    const sxx = s.sxx || 0;
                    const syy = s.syy || 0;
                    const szz = s.szz || 0;
                    const sxy = s.sxy || 0;
                    // 2D principal stress (simplified)
                    const avg = (sxx + syy) / 2;
                    const diff = Math.sqrt(Math.pow((sxx - syy) / 2, 2) + Math.pow(sxy, 2));
                    return avg + diff; // σ1 (maximum)
                };
                break;
            case 'principal_2':
                legendLabel = 'Principal Stress σ₂ (Min)';
                getValueFn = (s) => {
                    if (s.sxx == null || s.syy == null) return s.von_mises;
                    const sxx = s.sxx || 0;
                    const syy = s.syy || 0;
                    const sxy = s.sxy || 0;
                    const avg = (sxx + syy) / 2;
                    const diff = Math.sqrt(Math.pow((sxx - syy) / 2, 2) + Math.pow(sxy, 2));
                    return avg - diff; // σ2 (minimum)
                };
                break;
            case 'principal_3':
                legendLabel = 'Principal Stress σ₃';
                getValueFn = (s) => s.szz != null ? s.szz : 0; // For shells, σ3 ≈ 0
                break;
        }
    }
    // Displacement-based contours
    else if (['displacement_magnitude', 'dx', 'dy', 'dz'].includes(contourType)) {
        if (!results.displacements || results.displacements.length === 0) {
            console.warn("No displacement data available");
            return;
        }
        dataSource = results.displacements;
        unit = 'mm';
        
        switch(contourType) {
            case 'displacement_magnitude':
                legendLabel = 'Total Displacement';
                getValueFn = (d) => Math.sqrt(d.dx*d.dx + d.dy*d.dy + d.dz*d.dz) * 1000; // Convert to mm
                break;
            case 'dx':
                legendLabel = 'Displacement X';
                getValueFn = (d) => d.dx * 1000;
                break;
            case 'dy':
                legendLabel = 'Displacement Y';
                getValueFn = (d) => d.dy * 1000;
                break;
            case 'dz':
                legendLabel = 'Displacement Z';
                getValueFn = (d) => d.dz * 1000;
                break;
        }
    }
    else {
        console.warn(`Unknown contour type: ${contourType}`);
        return;
    }
    
    // Compute value range
    let maxValue = Number.NEGATIVE_INFINITY;
    let minValue = Number.POSITIVE_INFINITY;
    let validCount = 0;
    
    dataSource.forEach(item => {
        const val = getValueFn(item);
        if (val != null && isFinite(val)) {
            if (val > maxValue) maxValue = val;
            if (val < minValue) minValue = val;
            validCount++;
        }
    });
    
    if (validCount === 0 || !isFinite(maxValue)) {
        console.warn(`No valid ${contourType} values found`);
        return;
    }
    
    // Convert stress values to MPa for display
    const displayMin = unit === 'MPa' ? minValue / 1e6 : minValue;
    const displayMax = unit === 'MPa' ? maxValue / 1e6 : maxValue;
    
    console.log(`${legendLabel}: min=${displayMin.toFixed(3)} ${unit}, max=${displayMax.toFixed(3)} ${unit}`);
    
    // Build node value map
    const nodeValueMap = new Map();
    dataSource.forEach(item => {
        const val = getValueFn(item);
        if (val != null && isFinite(val)) {
            nodeValueMap.set(item.node_id, val);
        }
    });
    
    const contourGroup = new THREE.Group();
    contourGroup.name = 'ContourVisualization';
    contourGroup.renderOrder = 10;
    
    // Apply colors to mesh elements
    let coloredElementCount = 0;
    let overlayElementCount = 0;
    
    if (sceneData.platesGroup) {
        sceneData.platesGroup.children.forEach((plate, plateIdx) => {
            const meshViz = plate.children.find(c => c.userData && c.userData.isMeshViz);
            if (meshViz) {
                meshViz.visible = true;
                meshViz.children.forEach((element) => {
                    if (element.isMesh && element.userData && element.userData.isMeshElement && element.userData.nodes) {
                        const nodeIds = element.userData.nodes.map((nodeRef) => {
                            if (!nodeRef) return null;
                            const idx = sceneData.nodesGroup.children.indexOf(nodeRef);
                            return idx >= 0 ? idx : null;
                        });
                        const vertexNodeOrder = buildVertexNodeOrder(element);
                        let applied = false;
                        
                        if (vertexNodeOrder) {
                            applied = applyInterpolatedScalarColors(
                                element, vertexNodeOrder, nodeIds,
                                nodeValueMap, minValue, maxValue
                            );
                        }
                        
                        if (!applied) {
                            const values = nodeIds
                                .map((id) => (id != null ? nodeValueMap.get(id) : undefined))
                                .filter((v) => isFinite(v));
                            if (values.length > 0) {
                                const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
                                const color = getScalarGradientColor(normalizeScalarValue(avgValue, minValue, maxValue));
                                applySolidScalarColor(element, color);
                                applied = true;
                            }
                        }
                        
                        if (applied) coloredElementCount++;
                    }
                });
            } else if (!plate.userData.mesh) {
                // Unmeshed plate fallback
                const plateVertices = [];
                const positions = plate.geometry.attributes.position.array;
                for(let i=0; i<positions.length; i+=3) {
                    plateVertices.push(new THREE.Vector3(positions[i], positions[i+1], positions[i+2]));
                }
                
                const plateNodeIds = [];
                sceneData.nodesGroup.children.forEach((node, nodeId) => {
                    for (const v of plateVertices) {
                        if (node.position.distanceTo(v) < 0.1) {
                            plateNodeIds.push(nodeId);
                            break;
                        }
                    }
                });
                
                const values = [];
                plateNodeIds.forEach(id => {
                    if (nodeValueMap.has(id)) {
                        values.push(nodeValueMap.get(id));
                    }
                });
                
                if (values.length > 0) {
                    const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
                    const color = getScalarGradientColor(normalizeScalarValue(avgValue, minValue, maxValue));
                    plate.updateWorldMatrix(true, false);
                    const worldMatrix = plate.matrixWorld.clone();
                    const coloredGeom = plate.geometry.clone();
                    coloredGeom.applyMatrix4(worldMatrix);
                    coloredGeom.computeVertexNormals();
                    const coloredMat = new THREE.MeshBasicMaterial({
                        color: color,
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 0.92,
                        depthWrite: false,
                        depthTest: false
                    });
                    const coloredMesh = new THREE.Mesh(coloredGeom, coloredMat);
                    coloredMesh.renderOrder = 11;
                    coloredMesh.frustumCulled = false;
                    coloredMesh.userData.isStressOverlay = true;
                    contourGroup.add(coloredMesh);
                    overlayElementCount++;
                }
            }
        });
    }
    
    if (contourGroup.children.length > 0) {
        sceneData.scene.add(contourGroup);
    }
    
    console.log(`Applied ${contourType} colors to ${coloredElementCount} mesh elements and ${overlayElementCount} overlays`);
    updateContourLegend(minValue, maxValue, legendLabel, unit);
};

/**
 * Update legend for general contour display
 */
function updateContourLegend(minValue, maxValue, label, unit) {
    const legendEl = ensureStressLegendElement();
    if (!legendEl) return;
    
    // Convert stress values from Pa to MPa if needed
    const displayMin = unit === 'MPa' ? minValue / 1e6 : minValue;
    const displayMax = unit === 'MPa' ? maxValue / 1e6 : maxValue;
    
    // Format values based on magnitude
    const formatValue = (val) => {
        const abs = Math.abs(val);
        if (abs >= 100) return val.toFixed(0);
        if (abs >= 10) return val.toFixed(1);
        if (abs >= 1) return val.toFixed(2);
        return val.toFixed(3);
    };
    
    legendEl.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 8px; font-size: 12px;">${label}</div>
        <div style="display: flex; align-items: stretch; height: 120px;">
            <div style="width: 20px; background: linear-gradient(to bottom, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff); border-radius: 3px;"></div>
            <div style="display: flex; flex-direction: column; justify-content: space-between; margin-left: 8px; font-size: 11px;">
                <span>${formatValue(displayMax)} ${unit}</span>
                <span>${formatValue((displayMax + displayMin) / 2)} ${unit}</span>
                <span>${formatValue(displayMin)} ${unit}</span>
            </div>
        </div>
    `;
    legendEl.style.display = 'block';
}

window.clearDiagrams = function() {
    window.clearAnalysisResults();
    removeDiagramsByName('DeformedShape');
    removeDiagramsByName('ContourVisualization');
};

/**
 * Load example 3-story building structure
 * This creates a 16m x 15m building footprint with 3 floors at 3m height each
 * Including floor slabs and wall panels
 */
window.loadExampleStructure = function() {
    console.log('=== loadExampleStructure called ===');
    
    try {
        // Check if helper functions are available
        if (!window.createNodeAtPosition || !window.createBeamBetweenNodes) {
            console.error('Geometry helper functions not available. Canvas may not be initialized.');
            return;
        }
        
        // Clear existing geometry
        if (window.clearAllGeometry) {
            window.clearAllGeometry();
        }

        console.log('Creating example 3-story building structure...');

        // Node positions for ground level (Y=0)
        // Building footprint: corners and key column locations
        const groundNodePositions = [
            // Left edge (X=5)
            [5, 0, 5],    // 0 - front left
            [5, 0, 0],    // 1
            [5, 0, -5],   // 2
            [5, 0, -10],  // 3 - back left
            // Middle bay (X=13)
            [13, 0, -10], // 4 - back middle
            [13, 0, 5],   // 5 - front middle
            // Right edge (X=21)
            [21, 0, 5],   // 6 - front right
            [21, 0, -10], // 7 - back right
            [21, 0, 0],   // 8
            [21, 0, -5],  // 9
            // Interior columns
            [13, 0, 0],   // 10
            [13, 0, -5],  // 11
            // Core opening nodes
            [13, 0, -2],  // 12
            [11, 0, -2],  // 13
            [11, 0, 0],   // 14
        ];

        // Store nodes by level for geometry creation
        const nodesByLevel = [];
        const storeyHeight = 3;
        const numStoreys = 4; // Ground + 3 floors

        // Create nodes for each level
        for (let level = 0; level < numStoreys; level++) {
            const levelNodes = [];
            const y = level * storeyHeight;
            
            groundNodePositions.forEach(([x, _, z]) => {
                const node = window.createNodeAtPosition(x, y, z);
                if (node) {
                    levelNodes.push(node);
                }
            });
            
            nodesByLevel.push(levelNodes);
        }

        console.log(`Created ${nodesByLevel.length * groundNodePositions.length} nodes`);

        // Create vertical columns (beams between levels)
        for (let level = 0; level < numStoreys - 1; level++) {
            const lowerNodes = nodesByLevel[level];
            const upperNodes = nodesByLevel[level + 1];
            
            for (let i = 0; i < lowerNodes.length; i++) {
                window.createBeamBetweenNodes(lowerNodes[i], upperNodes[i]);
            }
        }

        console.log('Created columns');

        // Apply pinned constraints to all ground level nodes
        const groundNodes = nodesByLevel[0];
        groundNodes.forEach(node => {
            if (window.createConstraintSymbol) {
                window.createConstraintSymbol(node, 'pinned');
            }
        });

        console.log('Created pinned supports');

        // Create floor slabs at each level above ground
        // Main floor slab corners: nodes 0 (front-left), 3 (back-left), 7 (back-right), 6 (front-right)
        if (window.createPlateFromNodes) {
            for (let level = 1; level < numStoreys; level++) {
                const levelNodes = nodesByLevel[level];
                // Main floor slab: front-left -> back-left -> back-right -> front-right
                // Indices: 0, 3, 7, 6
                const floorPlate = window.createPlateFromNodes([
                    levelNodes[0],  // front left (5, y, 5)
                    levelNodes[3],  // back left (5, y, -10)
                    levelNodes[7],  // back right (21, y, -10)
                    levelNodes[6]   // front right (21, y, 5)
                ]);
                if (floorPlate) {
                    console.log(`Floor slab created at level ${level} (y=${level * storeyHeight}m)`);
                }
            }

            // Create wall panels (vertical plates) - stair core walls
            // Wall on left side of core: between nodes 14 and 13 (X=11, Z=0 to Z=-2)
            for (let level = 0; level < numStoreys - 1; level++) {
                const lowerNodes = nodesByLevel[level];
                const upperNodes = nodesByLevel[level + 1];
                
                // Core wall 1: left side (X=11, Z from 0 to -2)
                // Nodes: 14 (11,y,0) -> 13 (11,y,-2) at both levels
                const wall1 = window.createPlateFromNodes([
                    lowerNodes[14], // 11, lower, 0
                    lowerNodes[13], // 11, lower, -2
                    upperNodes[13], // 11, upper, -2
                    upperNodes[14]  // 11, upper, 0
                ]);
                if (wall1) {
                    console.log(`Core wall 1 created at level ${level}`);
                }
                
                // Core wall 2: back side (Z=-2, X from 11 to 13)
                // Nodes: 13 (11,y,-2) -> 12 (13,y,-2) at both levels
                const wall2 = window.createPlateFromNodes([
                    lowerNodes[13], // 11, lower, -2
                    lowerNodes[12], // 13, lower, -2
                    upperNodes[12], // 13, upper, -2
                    upperNodes[13]  // 11, upper, -2
                ]);
                if (wall2) {
                    console.log(`Core wall 2 created at level ${level}`);
                }
                
                // Core wall 3: right side (X=13, Z from -2 to 0)
                // Nodes: 12 (13,y,-2) -> 10 (13,y,0) at both levels
                const wall3 = window.createPlateFromNodes([
                    lowerNodes[12], // 13, lower, -2
                    lowerNodes[10], // 13, lower, 0
                    upperNodes[10], // 13, upper, 0
                    upperNodes[12]  // 13, upper, -2
                ]);
                if (wall3) {
                    console.log(`Core wall 3 created at level ${level}`);
                }
            }
        }

        const sceneData = window.sceneData;
        const plateCount = sceneData.platesGroup ? sceneData.platesGroup.children.length : 0;
        
        console.log('Example structure loaded:');
        console.log(`  - ${sceneData.nodesGroup.children.length} nodes`);
        console.log(`  - ${sceneData.beamsGroup.children.length} beams (columns)`);
        console.log(`  - ${plateCount} plates (floor slabs + walls)`);
        console.log(`  - ${groundNodes.length} pinned supports`);
        
        // Reset camera to see the structure
        if (window.resetView) {
            window.resetView();
        }
        
        return {
            nodes: sceneData.nodesGroup.children.length,
            beams: sceneData.beamsGroup.children.length,
            plates: plateCount,
            supports: groundNodes.length
        };
    } catch (error) {
        console.error('Error loading example structure:', error);
        console.error('Stack trace:', error.stack);
    }
};
