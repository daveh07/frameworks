//! Support conditions

use serde::{Deserialize, Serialize};

/// Support conditions at a node
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Support {
    /// Restrained in X translation
    pub dx: bool,
    /// Restrained in Y translation
    pub dy: bool,
    /// Restrained in Z translation
    pub dz: bool,
    /// Restrained in X rotation
    pub rx: bool,
    /// Restrained in Y rotation
    pub ry: bool,
    /// Restrained in Z rotation
    pub rz: bool,
    
    /// Enforced displacement in X (if dx is true and this is Some)
    pub enforced_dx: Option<f64>,
    /// Enforced displacement in Y
    pub enforced_dy: Option<f64>,
    /// Enforced displacement in Z
    pub enforced_dz: Option<f64>,
    /// Enforced rotation about X
    pub enforced_rx: Option<f64>,
    /// Enforced rotation about Y
    pub enforced_ry: Option<f64>,
    /// Enforced rotation about Z
    pub enforced_rz: Option<f64>,
}

impl Support {
    /// Create a new support with no restraints
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a fully fixed support (all DOFs restrained)
    pub fn fixed() -> Self {
        Self {
            dx: true,
            dy: true,
            dz: true,
            rx: true,
            ry: true,
            rz: true,
            ..Default::default()
        }
    }

    /// Create a pinned support (translations restrained, rotations free)
    pub fn pinned() -> Self {
        Self {
            dx: true,
            dy: true,
            dz: true,
            rx: false,
            ry: false,
            rz: false,
            ..Default::default()
        }
    }

    /// Create a roller support (Y translation restrained only)
    pub fn roller_y() -> Self {
        Self {
            dx: false,
            dy: true,
            dz: false,
            rx: false,
            ry: false,
            rz: false,
            ..Default::default()
        }
    }

    /// Create a roller support (X translation restrained only)
    pub fn roller_x() -> Self {
        Self {
            dx: true,
            dy: false,
            dz: false,
            rx: false,
            ry: false,
            rz: false,
            ..Default::default()
        }
    }

    /// Create a support with specific restraints
    pub fn with_restraints(dx: bool, dy: bool, dz: bool, rx: bool, ry: bool, rz: bool) -> Self {
        Self {
            dx,
            dy,
            dz,
            rx,
            ry,
            rz,
            ..Default::default()
        }
    }

    /// Set an enforced displacement in X
    pub fn with_enforced_dx(mut self, value: f64) -> Self {
        self.enforced_dx = Some(value);
        self.dx = true;
        self
    }

    /// Set an enforced displacement in Y
    pub fn with_enforced_dy(mut self, value: f64) -> Self {
        self.enforced_dy = Some(value);
        self.dy = true;
        self
    }

    /// Set an enforced displacement in Z
    pub fn with_enforced_dz(mut self, value: f64) -> Self {
        self.enforced_dz = Some(value);
        self.dz = true;
        self
    }

    /// Get list of restrained DOF indices (0-5)
    pub fn restrained_dofs(&self) -> Vec<usize> {
        let mut dofs = Vec::new();
        if self.dx { dofs.push(0); }
        if self.dy { dofs.push(1); }
        if self.dz { dofs.push(2); }
        if self.rx { dofs.push(3); }
        if self.ry { dofs.push(4); }
        if self.rz { dofs.push(5); }
        dofs
    }

    /// Get list of free DOF indices (0-5)
    pub fn free_dofs(&self) -> Vec<usize> {
        let mut dofs = Vec::new();
        if !self.dx { dofs.push(0); }
        if !self.dy { dofs.push(1); }
        if !self.dz { dofs.push(2); }
        if !self.rx { dofs.push(3); }
        if !self.ry { dofs.push(4); }
        if !self.rz { dofs.push(5); }
        dofs
    }

    /// Get enforced displacement array [DX, DY, DZ, RX, RY, RZ]
    pub fn enforced_displacements(&self) -> [Option<f64>; 6] {
        [
            self.enforced_dx,
            self.enforced_dy,
            self.enforced_dz,
            self.enforced_rx,
            self.enforced_ry,
            self.enforced_rz,
        ]
    }

    /// Check if any DOF is restrained
    pub fn is_supported(&self) -> bool {
        self.dx || self.dy || self.dz || self.rx || self.ry || self.rz
    }

    /// Count number of restrained DOFs
    pub fn num_restrained(&self) -> usize {
        self.restrained_dofs().len()
    }
}

impl Default for Support {
    fn default() -> Self {
        Self {
            dx: false,
            dy: false,
            dz: false,
            rx: false,
            ry: false,
            rz: false,
            enforced_dx: None,
            enforced_dy: None,
            enforced_dz: None,
            enforced_rx: None,
            enforced_ry: None,
            enforced_rz: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fixed_support() {
        let support = Support::fixed();
        assert!(support.dx && support.dy && support.dz);
        assert!(support.rx && support.ry && support.rz);
        assert_eq!(support.num_restrained(), 6);
    }

    #[test]
    fn test_pinned_support() {
        let support = Support::pinned();
        assert!(support.dx && support.dy && support.dz);
        assert!(!support.rx && !support.ry && !support.rz);
        assert_eq!(support.num_restrained(), 3);
    }

    #[test]
    fn test_enforced_displacement() {
        let support = Support::pinned().with_enforced_dy(-0.01);
        assert!(support.dy);
        assert_eq!(support.enforced_dy, Some(-0.01));
    }
}
