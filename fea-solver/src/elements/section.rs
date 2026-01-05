//! Section properties for frame elements

use serde::{Deserialize, Serialize};

/// Cross-section properties for frame elements
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Section {
    /// Cross-sectional area in m²
    pub a: f64,
    /// Moment of inertia about local y-axis in m⁴ (strong axis for wide flange)
    pub iy: f64,
    /// Moment of inertia about local z-axis in m⁴ (weak axis for wide flange)
    pub iz: f64,
    /// Torsional constant in m⁴
    pub j: f64,
    /// Plastic section modulus about y-axis (optional) in m³
    pub zy: Option<f64>,
    /// Plastic section modulus about z-axis (optional) in m³
    pub zz: Option<f64>,
    /// Depth of section (optional) in m
    pub depth: Option<f64>,
    /// Width of section (optional) in m
    pub width: Option<f64>,
}

impl Section {
    /// Create a new section with basic properties
    pub fn new(a: f64, iy: f64, iz: f64, j: f64) -> Self {
        Self {
            a,
            iy,
            iz,
            j,
            zy: None,
            zz: None,
            depth: None,
            width: None,
        }
    }

    /// Create a rectangular section
    pub fn rectangular(width: f64, depth: f64) -> Self {
        let a = width * depth;
        let iy = width * depth.powi(3) / 12.0;
        let iz = depth * width.powi(3) / 12.0;
        
        // Torsional constant for rectangle (approximate)
        let (a_dim, b_dim) = if width > depth { (width, depth) } else { (depth, width) };
        let j = a_dim * b_dim.powi(3) / 3.0 * (1.0 - 0.63 * b_dim / a_dim);
        
        Self {
            a,
            iy,
            iz,
            j,
            zy: Some(width * depth.powi(2) / 4.0),
            zz: Some(depth * width.powi(2) / 4.0),
            depth: Some(depth),
            width: Some(width),
        }
    }

    /// Create a circular section
    pub fn circular(diameter: f64) -> Self {
        let r = diameter / 2.0;
        let a = std::f64::consts::PI * r.powi(2);
        let i = std::f64::consts::PI * r.powi(4) / 4.0;
        let j = std::f64::consts::PI * r.powi(4) / 2.0;
        let z = std::f64::consts::PI * r.powi(3) / 4.0 * 4.0 / 3.0; // Plastic modulus
        
        Self {
            a,
            iy: i,
            iz: i,
            j,
            zy: Some(z),
            zz: Some(z),
            depth: Some(diameter),
            width: Some(diameter),
        }
    }

    /// Create a hollow circular (pipe) section
    pub fn pipe(outer_diameter: f64, wall_thickness: f64) -> Self {
        let r_o = outer_diameter / 2.0;
        let r_i = r_o - wall_thickness;
        
        let a = std::f64::consts::PI * (r_o.powi(2) - r_i.powi(2));
        let i = std::f64::consts::PI * (r_o.powi(4) - r_i.powi(4)) / 4.0;
        let j = std::f64::consts::PI * (r_o.powi(4) - r_i.powi(4)) / 2.0;
        
        Self {
            a,
            iy: i,
            iz: i,
            j,
            zy: None,
            zz: None,
            depth: Some(outer_diameter),
            width: Some(outer_diameter),
        }
    }

    /// Create a wide flange (I-beam) section
    /// 
    /// # Arguments
    /// * `depth` - Total depth of section
    /// * `flange_width` - Width of flange
    /// * `flange_thickness` - Thickness of flange
    /// * `web_thickness` - Thickness of web
    pub fn wide_flange(
        depth: f64,
        flange_width: f64,
        flange_thickness: f64,
        web_thickness: f64,
    ) -> Self {
        let bf = flange_width;
        let tf = flange_thickness;
        let tw = web_thickness;
        let d = depth;
        let hw = d - 2.0 * tf;
        
        // Area
        let a = 2.0 * bf * tf + hw * tw;
        
        // Moment of inertia about strong axis (y)
        let iy = (bf * d.powi(3) - (bf - tw) * hw.powi(3)) / 12.0;
        
        // Moment of inertia about weak axis (z)
        let iz = (2.0 * tf * bf.powi(3) + hw * tw.powi(3)) / 12.0;
        
        // Torsional constant (approximate)
        let j = (2.0 * bf * tf.powi(3) + hw * tw.powi(3)) / 3.0;
        
        // Plastic section modulus (approximate)
        let zy = bf * tf * (d - tf) + tw * hw.powi(2) / 4.0;
        let zz = tf * bf.powi(2) / 2.0 + hw * tw.powi(2) / 4.0;
        
        Self {
            a,
            iy,
            iz,
            j,
            zy: Some(zy),
            zz: Some(zz),
            depth: Some(d),
            width: Some(bf),
        }
    }

    /// Create a box/tube section
    pub fn box_section(width: f64, depth: f64, wall_thickness: f64) -> Self {
        let t = wall_thickness;
        let b = width;
        let d = depth;
        let bi = b - 2.0 * t;
        let di = d - 2.0 * t;
        
        let a = b * d - bi * di;
        let iy = (b * d.powi(3) - bi * di.powi(3)) / 12.0;
        let iz = (d * b.powi(3) - di * bi.powi(3)) / 12.0;
        
        // Torsional constant for closed thin-walled section
        let am = (b - t) * (d - t); // Mean enclosed area
        let s = 2.0 * (b + d) - 4.0 * t; // Mean perimeter
        let j = 4.0 * am.powi(2) * t / s;
        
        Self {
            a,
            iy,
            iz,
            j,
            zy: None,
            zz: None,
            depth: Some(d),
            width: Some(b),
        }
    }

    /// Get the radius of gyration about y-axis
    pub fn ry(&self) -> f64 {
        (self.iy / self.a).sqrt()
    }

    /// Get the radius of gyration about z-axis
    pub fn rz(&self) -> f64 {
        (self.iz / self.a).sqrt()
    }

    /// Get the polar moment of inertia
    pub fn ip(&self) -> f64 {
        self.iy + self.iz
    }
}

impl Default for Section {
    fn default() -> Self {
        // Default to a 200mm x 200mm rectangular section
        Self::rectangular(0.2, 0.2)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rectangular_section() {
        let section = Section::rectangular(0.3, 0.5);
        let expected_a = 0.3 * 0.5;
        let expected_iy = 0.3 * 0.5_f64.powi(3) / 12.0;
        
        assert!((section.a - expected_a).abs() < 1e-10);
        assert!((section.iy - expected_iy).abs() < 1e-10);
    }

    #[test]
    fn test_circular_section() {
        let section = Section::circular(0.5);
        let r = 0.25;
        let expected_a = std::f64::consts::PI * r.powi(2);
        
        assert!((section.a - expected_a).abs() < 1e-10);
        assert!((section.iy - section.iz).abs() < 1e-10); // Should be equal for circle
    }
}
