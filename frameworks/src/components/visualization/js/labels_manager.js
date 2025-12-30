/**
 * Labels Manager Module
 * Handles creation and visibility of ID labels for nodes, beams, and plates
 */

const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js');

let labelsGroup = null;
let nodeLabelsGroup = null;
let beamLabelsGroup = null;
let plateLabelsGroup = null;
let meshElementLabelsGroup = null;

let showNodeLabels = false;
let showBeamLabels = false;
let showPlateLabels = false;
let showMeshElementLabels = false;

export function initLabels(scene) {
    labelsGroup = new THREE.Group();
    labelsGroup.name = 'labelsGroup';
    scene.add(labelsGroup);

    nodeLabelsGroup = new THREE.Group();
    nodeLabelsGroup.name = 'nodeLabelsGroup';
    nodeLabelsGroup.visible = false;
    labelsGroup.add(nodeLabelsGroup);

    beamLabelsGroup = new THREE.Group();
    beamLabelsGroup.name = 'beamLabelsGroup';
    beamLabelsGroup.visible = false;
    labelsGroup.add(beamLabelsGroup);

    plateLabelsGroup = new THREE.Group();
    plateLabelsGroup.name = 'plateLabelsGroup';
    plateLabelsGroup.visible = false;
    labelsGroup.add(plateLabelsGroup);

    meshElementLabelsGroup = new THREE.Group();
    meshElementLabelsGroup.name = 'meshElementLabelsGroup';
    meshElementLabelsGroup.visible = false;
    labelsGroup.add(meshElementLabelsGroup);
}

function createLabel(text, position, color = '#000000', bgColor = 'transparent', offsetX = 0, offsetY = 0, offsetZ = 0, isOval = false, fontWeight = '700') {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    // Use sans-serif font
    const fontSize = 42;
    context.font = `${fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;
    const textMetrics = context.measureText(text);
    const padding = bgColor === 'transparent' ? 6 : (isOval ? 24 : 16);
    const width = textMetrics.width + padding * 2;
    const height = fontSize + (isOval ? 20 : 14);
    
    canvas.width = width;
    canvas.height = height;
    
    // Re-set font after resize
    context.font = `${fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    // Background
    if (bgColor !== 'transparent') {
        context.fillStyle = bgColor;
        context.beginPath();
        if (isOval) {
            // Draw horizontal oval/ellipse
            const centerX = width / 2;
            const centerY = height / 2;
            const radiusX = width / 2 - 2;
            const radiusY = height / 2 - 2;
            context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        } else if (context.roundRect) {
            context.roundRect(0, 0, width, height, 8);
        } else {
            context.rect(0, 0, width, height);
        }
        context.fill();
    }
    
    // Draw text - bold and dark, no outline
    context.fillStyle = color;
    context.fillText(text, width / 2, height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture, 
        depthTest: false, 
        depthWrite: false,
        transparent: true
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    
    sprite.position.set(
        position.x + offsetX,
        position.y + offsetY,
        position.z + offsetZ
    );
    // Scale down
    const scale = 0.004 * height;
    sprite.scale.set(scale * (width/height), scale, 1);
    sprite.renderOrder = 999;
    
    return sprite;
}

export function toggleNodeLabels(visible, nodesGroup) {
    showNodeLabels = visible;
    if (nodeLabelsGroup) {
        nodeLabelsGroup.visible = visible;
        if (visible) updateNodeLabels(nodesGroup);
    }
}

export function updateNodeLabels(nodesGroup) {
    if (!nodeLabelsGroup || !nodesGroup) return;
    
    // Clear existing
    while(nodeLabelsGroup.children.length > 0){ 
        const child = nodeLabelsGroup.children[0];
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
        nodeLabelsGroup.remove(child); 
    }

    if (!showNodeLabels) return;

    nodesGroup.children.forEach(node => {
        if (node.userData.id) {
            // Pure black text, offset up and to the right
            const label = createLabel(
                node.userData.id.toString(), 
                node.position, 
                '#000000',  // Pure black
                'transparent',
                0.12,  // offset X
                0.12,  // offset Y
                0,     // offset Z
                false  // not oval
            );
            nodeLabelsGroup.add(label);
        }
    });
}

export function toggleBeamLabels(visible, beamsGroup) {
    showBeamLabels = visible;
    if (beamLabelsGroup) {
        beamLabelsGroup.visible = visible;
        if (visible) updateBeamLabels(beamsGroup);
    }
}

export function updateBeamLabels(beamsGroup) {
    if (!beamLabelsGroup || !beamsGroup) return;
    
    while(beamLabelsGroup.children.length > 0){ 
        const child = beamLabelsGroup.children[0];
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
        beamLabelsGroup.remove(child); 
    }

    if (!showBeamLabels) return;

    beamsGroup.children.forEach(beam => {
        if (beam.userData.id) {
            // Dark blue text at beam center
            const label = createLabel(
                beam.userData.id.toString(), 
                beam.position, 
                '#0044cc',  // Dark blue
                'transparent',
                0.08,
                0.08,
                0,
                false  // not oval
            );
            beamLabelsGroup.add(label);
        }
    });
}

export function togglePlateLabels(visible, platesGroup) {
    showPlateLabels = visible;
    if (plateLabelsGroup) {
        plateLabelsGroup.visible = visible;
        if (visible) updatePlateLabels(platesGroup);
    }
}

export function updatePlateLabels(platesGroup) {
    if (!plateLabelsGroup || !platesGroup) return;
    
    while(plateLabelsGroup.children.length > 0){ 
        const child = plateLabelsGroup.children[0];
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
        plateLabelsGroup.remove(child); 
    }

    if (!showPlateLabels) return;

    platesGroup.children.forEach(plate => {
        // Only show labels for main plates (not mesh elements)
        // Main plates have userData.id and are NOT mesh elements
        if (plate.userData.id && !plate.userData.isMeshElement) {
            // Calculate center of plate geometry
            const center = new THREE.Vector3();
            
            // Compute bounding box if needed
            if (!plate.geometry.boundingBox) {
                plate.geometry.computeBoundingBox();
            }
            
            if (plate.geometry.boundingBox) {
                plate.geometry.boundingBox.getCenter(center);
            }
            
            // White text in black horizontal oval
            const label = createLabel(
                'P' + plate.userData.id.toString(), 
                center, 
                '#ffffff',  // White text
                '#000000',  // Black background
                0,
                0.15,
                0,
                true  // isOval = true
            );
            plateLabelsGroup.add(label);
        }
    });
}

export function toggleMeshElementLabels(visible, meshElementsGroup, platesGroup) {
    showMeshElementLabels = visible;
    if (meshElementLabelsGroup) {
        meshElementLabelsGroup.visible = visible;
        if (visible) updateMeshElementLabels(meshElementsGroup, platesGroup);
    }
}

export function updateMeshElementLabels(meshElementsGroup, platesGroup) {
    if (!meshElementLabelsGroup) return;
    
    while(meshElementLabelsGroup.children.length > 0){ 
        const child = meshElementLabelsGroup.children[0];
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
        meshElementLabelsGroup.remove(child); 
    }

    if (!showMeshElementLabels) return;

    // Mesh elements are stored as children of plates (in meshLines group)
    // Find all mesh elements across all plates
    if (platesGroup) {
        platesGroup.children.forEach((plate, plateIndex) => {
            // Skip if plate has no ID (shouldn't happen but safety)
            const plateId = plate.userData.id || (plateIndex + 1);
            
            // Find mesh visualization child
            const meshViz = plate.children.find(c => c.userData.isMeshViz);
            if (!meshViz) return;
            
            // Track element count for this plate
            let elemNum = 0;
            
            meshViz.children.forEach(elem => {
                if (elem.userData.isMeshElement) {
                    elemNum++;
                    
                    // Calculate center of element
                    const center = new THREE.Vector3();
                    if (!elem.geometry.boundingBox) {
                        elem.geometry.computeBoundingBox();
                    }
                    if (elem.geometry.boundingBox) {
                        elem.geometry.boundingBox.getCenter(center);
                    }
                    
                    const labelText = `P${plateId}E${elemNum}`;
                    const label = createLabel(
                        labelText, 
                        center, 
                        '#000000',  // Black text
                        'transparent',
                        0,
                        0.05,
                        0,
                        false,
                        '400'  // Normal weight (not bold)
                    );
                    meshElementLabelsGroup.add(label);
                }
            });
        });
    }
}
