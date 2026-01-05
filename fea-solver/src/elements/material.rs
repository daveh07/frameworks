//! Material properties

use serde::{Deserialize, Serialize};

/// Material properties for structural analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Material {
    /// Modulus of elasticity (Young's modulus) in Pa
    pub e: f64,
    /// Shear modulus in Pa
    pub g: f64,
    /// Poisson's ratio
    pub nu: f64,
    /// Density in kg/m³
    pub rho: f64,
    /// Yield strength (optional) in Pa
    pub fy: Option<f64>,
}

impl Material {
    /// Create a new material with given properties
    pub fn new(e: f64, g: f64, nu: f64, rho: f64) -> Self {
        Self {
            e,
            g,
            nu,
            rho,
            fy: None,
        }
    }

    /// Create a material with yield strength
    pub fn with_yield_strength(mut self, fy: f64) -> Self {
        self.fy = Some(fy);
        self
    }

    /// Create a new isotropic material from E and nu
    /// G is calculated as E / (2 * (1 + nu))
    pub fn isotropic(e: f64, nu: f64, rho: f64) -> Self {
        let g = e / (2.0 * (1.0 + nu));
        Self::new(e, g, nu, rho)
    }

    /// Create a standard steel material (A36)
    pub fn steel() -> Self {
        Self {
            e: 200e9,      // 200 GPa
            g: 77e9,       // 77 GPa
            nu: 0.3,
            rho: 7850.0,   // kg/m³
            fy: Some(250e6), // 250 MPa
        }
    }

    /// Create a standard concrete material
    pub fn concrete(fc: f64) -> Self {
        // fc is compressive strength in Pa
        // E estimated using ACI formula: E = 4700 * sqrt(f'c in MPa) GPa
        let fc_mpa = fc / 1e6;
        let e = 4700.0 * fc_mpa.sqrt() * 1e6;
        
        Self {
            e,
            g: e / (2.0 * (1.0 + 0.2)),
            nu: 0.2,
            rho: 2400.0,   // kg/m³
            fy: None,
        }
    }

    /// Create an aluminum material (6061-T6)
    pub fn aluminum() -> Self {
        Self {
            e: 68.9e9,     // 68.9 GPa
            g: 26e9,       // 26 GPa
            nu: 0.33,
            rho: 2700.0,   // kg/m³
            fy: Some(276e6), // 276 MPa
        }
    }
}

impl Default for Material {
    fn default() -> Self {
        Self::steel()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_isotropic_material() {
        let mat = Material::isotropic(200e9, 0.3, 7850.0);
        let expected_g = 200e9 / (2.0 * 1.3);
        assert!((mat.g - expected_g).abs() < 1.0);
    }

    #[test]
    fn test_steel_properties() {
        let steel = Material::steel();
        assert_eq!(steel.e, 200e9);
        assert!(steel.fy.is_some());
    }
}
