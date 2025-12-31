use dioxus::prelude::*;

#[derive(Clone, PartialEq)]
pub struct MaterialProperties {
    pub name: String,
    pub elastic_modulus: f64,  // GPa
    pub poisson_ratio: f64,
    pub density: f64,          // kg/m³
}

impl Default for MaterialProperties {
    fn default() -> Self {
        Self {
            name: "Structural Steel".to_string(),
            elastic_modulus: 210.0,  // GPa
            poisson_ratio: 0.3,
            density: 7850.0,  // kg/m³
        }
    }
}

impl MaterialProperties {
    pub fn steel() -> Self {
        Self {
            name: "Structural Steel".to_string(),
            elastic_modulus: 210.0,
            poisson_ratio: 0.3,
            density: 7850.0,
        }
    }
    
    pub fn concrete() -> Self {
        Self {
            name: "Concrete C30".to_string(),
            elastic_modulus: 30.0,
            poisson_ratio: 0.2,
            density: 2400.0,
        }
    }
    
    pub fn aluminum() -> Self {
        Self {
            name: "Aluminum".to_string(),
            elastic_modulus: 70.0,
            poisson_ratio: 0.33,
            density: 2700.0,
        }
    }
    
    pub fn timber() -> Self {
        Self {
            name: "Timber (Softwood)".to_string(),
            elastic_modulus: 12.0,
            poisson_ratio: 0.3,
            density: 500.0,
        }
    }
}

#[component]
pub fn MaterialPropertiesPanel(
    show: Signal<bool>,
    properties: Signal<MaterialProperties>,
) -> Element {
    let mut material_type = use_signal(|| "steel".to_string());
    let mut elastic_modulus = use_signal(|| properties().elastic_modulus);
    let mut poisson_ratio = use_signal(|| properties().poisson_ratio);
    let mut density = use_signal(|| properties().density);
    let mut custom_mode = use_signal(|| false);

    // Update parent properties when values change
    use_effect(move || {
        let name = match material_type().as_str() {
            "concrete" => "Concrete",
            "aluminum" => "Aluminum",
            "timber" => "Timber",
            "custom" => "Custom Material",
            _ => "Structural Steel",
        }.to_string();
        
        properties.set(MaterialProperties {
            name,
            elastic_modulus: elastic_modulus(),
            poisson_ratio: poisson_ratio(),
            density: density(),
        });
    });

    rsx! {
        div {
            class: "right-panel material-properties-panel",
            style: if show() {
                "transform: translateX(0); pointer-events: auto;"
            } else {
                "transform: translateX(100%); pointer-events: none;"
            },
            
            div { class: "panel-header",
                h3 { "🧱 Material Properties" }
                button {
                    class: "close-button",
                    onclick: move |_| show.set(false),
                    "×"
                }
            }
            
            div { class: "panel-content",
                // Material Presets
                div { class: "section",
                    h4 { "Material Type" }
                    div { class: "material-presets",
                        button {
                            class: if material_type() == "steel" && !custom_mode() { "material-btn active" } else { "material-btn" },
                            onclick: move |_| {
                                material_type.set("steel".to_string());
                                custom_mode.set(false);
                                let mat = MaterialProperties::steel();
                                elastic_modulus.set(mat.elastic_modulus);
                                poisson_ratio.set(mat.poisson_ratio);
                                density.set(mat.density);
                            },
                            div { class: "material-icon steel" }
                            span { "Steel" }
                        }
                        button {
                            class: if material_type() == "concrete" && !custom_mode() { "material-btn active" } else { "material-btn" },
                            onclick: move |_| {
                                material_type.set("concrete".to_string());
                                custom_mode.set(false);
                                let mat = MaterialProperties::concrete();
                                elastic_modulus.set(mat.elastic_modulus);
                                poisson_ratio.set(mat.poisson_ratio);
                                density.set(mat.density);
                            },
                            div { class: "material-icon concrete" }
                            span { "Concrete" }
                        }
                        button {
                            class: if material_type() == "aluminum" && !custom_mode() { "material-btn active" } else { "material-btn" },
                            onclick: move |_| {
                                material_type.set("aluminum".to_string());
                                custom_mode.set(false);
                                let mat = MaterialProperties::aluminum();
                                elastic_modulus.set(mat.elastic_modulus);
                                poisson_ratio.set(mat.poisson_ratio);
                                density.set(mat.density);
                            },
                            div { class: "material-icon aluminum" }
                            span { "Aluminum" }
                        }
                        button {
                            class: if material_type() == "timber" && !custom_mode() { "material-btn active" } else { "material-btn" },
                            onclick: move |_| {
                                material_type.set("timber".to_string());
                                custom_mode.set(false);
                                let mat = MaterialProperties::timber();
                                elastic_modulus.set(mat.elastic_modulus);
                                poisson_ratio.set(mat.poisson_ratio);
                                density.set(mat.density);
                            },
                            div { class: "material-icon timber" }
                            span { "Timber" }
                        }
                    }
                }
                
                // Material Properties
                div { class: "section",
                    h4 { "Properties" }
                    
                    div { class: "property-group",
                        label { "Elastic Modulus E (GPa)" }
                        input {
                            r#type: "number",
                            value: "{elastic_modulus}",
                            oninput: move |evt| {
                                if let Ok(val) = evt.value().parse::<f64>() {
                                    elastic_modulus.set(val);
                                    custom_mode.set(true);
                                    material_type.set("custom".to_string());
                                }
                            },
                            step: "1",
                            min: "0.1"
                        }
                    }
                    
                    div { class: "property-group",
                        label { "Poisson's Ratio ν" }
                        input {
                            r#type: "number",
                            value: "{poisson_ratio}",
                            oninput: move |evt| {
                                if let Ok(val) = evt.value().parse::<f64>() {
                                    poisson_ratio.set(val);
                                    custom_mode.set(true);
                                    material_type.set("custom".to_string());
                                }
                            },
                            step: "0.01",
                            min: "0",
                            max: "0.5"
                        }
                    }
                    
                    div { class: "property-group",
                        label { "Density ρ (kg/m³)" }
                        input {
                            r#type: "number",
                            value: "{density}",
                            oninput: move |evt| {
                                if let Ok(val) = evt.value().parse::<f64>() {
                                    density.set(val);
                                    custom_mode.set(true);
                                    material_type.set("custom".to_string());
                                }
                            },
                            step: "10",
                            min: "1"
                        }
                    }
                }
                
                // Derived Properties
                div { class: "section",
                    h4 { "Derived Properties" }
                    div { class: "calculated-props",
                        {
                            let e = elastic_modulus();
                            let nu = poisson_ratio();
                            // Shear modulus G = E / (2(1 + ν))
                            let g = e / (2.0 * (1.0 + nu));
                            // Bulk modulus K = E / (3(1 - 2ν))
                            let k = if nu < 0.5 { e / (3.0 * (1.0 - 2.0 * nu)) } else { f64::INFINITY };
                            let k_str = if k.is_infinite() { "Inf".to_string() } else { format!("{:.2} GPa", k) };
                            
                            rsx! {
                                div { class: "prop-row",
                                    span { class: "prop-label", "Shear Modulus G:" }
                                    span { class: "prop-value", "{g:.2} GPa" }
                                }
                                div { class: "prop-row",
                                    span { class: "prop-label", "Bulk Modulus K:" }
                                    span { class: "prop-value", "{k_str}" }
                                }
                            }
                        }
                    }
                }
                
                // Info section
                div { class: "section",
                    p { class: "help-text info-box",
                        "These properties will be applied to all elements in the analysis. "
                        "Units: Forces in kN, lengths in m, stresses in kPa."
                    }
                }
            }
        }
    }
}
