//! Node element - represents a point in 3D space

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A 3D node in the finite element model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    /// X coordinate
    pub x: f64,
    /// Y coordinate  
    pub y: f64,
    /// Z coordinate
    pub z: f64,
    
    /// Internal ID assigned during analysis
    #[serde(skip)]
    pub(crate) id: Option<usize>,
    
    /// Displacement results by load combination
    #[serde(skip)]
    pub(crate) displacements: HashMap<String, [f64; 6]>,
    
    /// Reaction forces by load combination
    #[serde(skip)]
    pub(crate) reactions: HashMap<String, [f64; 6]>,
}

impl Node {
    /// Create a new node at the given coordinates
    pub fn new(x: f64, y: f64, z: f64) -> Self {
        Self {
            x,
            y,
            z,
            id: None,
            displacements: HashMap::new(),
            reactions: HashMap::new(),
        }
    }

    /// Get the coordinates as an array
    pub fn coords(&self) -> [f64; 3] {
        [self.x, self.y, self.z]
    }

    /// Calculate distance to another node
    pub fn distance_to(&self, other: &Node) -> f64 {
        let dx = other.x - self.x;
        let dy = other.y - self.y;
        let dz = other.z - self.z;
        (dx * dx + dy * dy + dz * dz).sqrt()
    }

    /// Get displacement for a load combination
    /// Returns [DX, DY, DZ, RX, RY, RZ]
    pub fn displacement(&self, combo_name: &str) -> Option<[f64; 6]> {
        self.displacements.get(combo_name).copied()
    }

    /// Get reactions for a load combination
    /// Returns [FX, FY, FZ, MX, MY, MZ]
    pub fn reaction(&self, combo_name: &str) -> Option<[f64; 6]> {
        self.reactions.get(combo_name).copied()
    }
}

impl Default for Node {
    fn default() -> Self {
        Self::new(0.0, 0.0, 0.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_node_creation() {
        let node = Node::new(1.0, 2.0, 3.0);
        assert_eq!(node.x, 1.0);
        assert_eq!(node.y, 2.0);
        assert_eq!(node.z, 3.0);
    }

    #[test]
    fn test_node_distance() {
        let n1 = Node::new(0.0, 0.0, 0.0);
        let n2 = Node::new(3.0, 4.0, 0.0);
        assert!((n1.distance_to(&n2) - 5.0).abs() < 1e-10);
    }
}
