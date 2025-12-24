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
            // Get constraint type and capitalize first letter to match Rust enum
            let constraintType = symbolGroup.userData?.supportType || symbolGroup.userData?.constraintType || 'pinned';
            
            // Map lowercase types to Rust enum variants: Fixed, Pinned, RollerX, RollerY, RollerZ
            const typeMap = {
                'fixed': 'Fixed',
                'pinned': 'Pinned',
                'roller': 'RollerY',  // Default roller to Y direction
                'rollerx': 'RollerX',
                'rollery': 'RollerY',
                'rollerz': 'RollerZ'
            };
            
            constraintType = typeMap[constraintType.toLowerCase()] || 'Pinned';
            
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
