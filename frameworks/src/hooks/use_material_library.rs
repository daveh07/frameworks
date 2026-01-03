use dioxus::prelude::*;

#[derive(Clone, PartialEq, Debug)]
pub struct Material {
    pub name: String,
    pub youngs_modulus: f64,
    pub poissons_ratio: f64,
    pub density: f64,
    pub thermal_expansion: f64,
    pub display_color: String,
}

#[derive(Clone)]
pub struct MaterialLibrary {
    pub materials: Signal<Vec<Material>>,
}

impl MaterialLibrary {
    pub fn new() -> Self {
        Self {
            materials: Signal::new(vec![
                Material {
                    name: "STEEL".to_string(),
                    youngs_modulus: 200e9,
                    poissons_ratio: 0.25,
                    density: 7850.0,
                    thermal_expansion: 1.17e-5,
                    display_color: "#808080".to_string(),
                },
                Material {
                    name: "CONCRETE".to_string(),
                    youngs_modulus: 30e9,
                    poissons_ratio: 0.2,
                    density: 2400.0,
                    thermal_expansion: 1.0e-5,
                    display_color: "#b0b0b0".to_string(),
                },
                Material {
                    name: "ALUMINUM".to_string(),
                    youngs_modulus: 69e9,
                    poissons_ratio: 0.33,
                    density: 2700.0,
                    thermal_expansion: 2.3e-5,
                    display_color: "#d0d0d0".to_string(),
                },
            ]),
        }
    }

    pub fn get_material(&self, name: &str) -> Option<Material> {
        self.materials.read().iter().find(|m| m.name == name).cloned()
    }

    pub fn add_material(&mut self, material: Material) {
        let mut mats = self.materials.write();
        if !mats.iter().any(|m| m.name == material.name) {
            mats.push(material);
        }
    }

    pub fn update_materials(&mut self, materials: Vec<Material>) {
        *self.materials.write() = materials;
    }
}
