use dioxus::prelude::*;
use dioxus::document::eval;

#[component]
pub fn ConstraintsPanel(show_constraints: Signal<bool>) -> Element {
    let mut constraint_type = use_signal(|| "fixed".to_string());
    let mut dx_restrained = use_signal(|| true);
    let mut dy_restrained = use_signal(|| true);
    let mut dz_restrained = use_signal(|| true);
    let mut rx_restrained = use_signal(|| false);
    let mut ry_restrained = use_signal(|| false);
    let mut rz_restrained = use_signal(|| false);
    
    // Spring stiffnesses
    let mut spring_kx = use_signal(|| "0".to_string());
    let mut spring_ky = use_signal(|| "0".to_string());
    let mut spring_kz = use_signal(|| "0".to_string());

    rsx! {
        div {
            class: "right-panel constraints-panel",
            style: if show_constraints() {
                "transform: translateX(0); pointer-events: auto;"
            } else {
                "transform: translateX(100%); pointer-events: none;"
            },
            
            // Header
            div {
                class: "right-panel-header",
                h3 { "Node Constraints" }
                button {
                    class: "close-btn",
                    onclick: move |_| {
                        show_constraints.set(false);
                    },
                    "×"
                }
            }
            
            // Content
            div {
                class: "right-panel-content",
                
                // Constraint Type Preset
                div {
                    class: "form-group",
                    label {
                        class: "form-label",
                        "Support Type"
                    }
                    select {
                        class: "form-select",
                        value: "{constraint_type}",
                        onchange: move |e| {
                            let val = e.value();
                            constraint_type.set(val.clone());
                            
                            // Update checkboxes based on preset
                            match val.as_str() {
                                "fixed" => {
                                    dx_restrained.set(true);
                                    dy_restrained.set(true);
                                    dz_restrained.set(true);
                                    rx_restrained.set(true);
                                    ry_restrained.set(true);
                                    rz_restrained.set(true);
                                }
                                "pinned" => {
                                    dx_restrained.set(true);
                                    dy_restrained.set(true);
                                    dz_restrained.set(true);
                                    rx_restrained.set(false);
                                    ry_restrained.set(false);
                                    rz_restrained.set(false);
                                }
                                "roller_x" => {
                                    dx_restrained.set(false);
                                    dy_restrained.set(true);
                                    dz_restrained.set(true);
                                    rx_restrained.set(false);
                                    ry_restrained.set(false);
                                    rz_restrained.set(false);
                                }
                                "roller_y" => {
                                    dx_restrained.set(true);
                                    dy_restrained.set(false);
                                    dz_restrained.set(true);
                                    rx_restrained.set(false);
                                    ry_restrained.set(false);
                                    rz_restrained.set(false);
                                }
                                "roller_z" => {
                                    dx_restrained.set(true);
                                    dy_restrained.set(true);
                                    dz_restrained.set(false);
                                    rx_restrained.set(false);
                                    ry_restrained.set(false);
                                    rz_restrained.set(false);
                                }
                                _ => {}
                            }
                        },
                        option { value: "fixed", "Fixed (All DOF)" }
                        option { value: "pinned", "Pinned (Translations)" }
                        option { value: "roller_x", "Roller X (Free X)" }
                        option { value: "roller_y", "Roller Y (Free Y)" }
                        option { value: "roller_z", "Roller Z (Free Z)" }
                        option { value: "custom", "Custom" }
                    }
                }
                
                // Translation Restraints
                div {
                    class: "form-group",
                    label {
                        class: "form-label",
                        "Translation Restraints"
                    }
                    div {
                        class: "restraint-checkboxes",
                        label { 
                            class: "restraint-checkbox",
                            input { 
                                r#type: "checkbox",
                                checked: dx_restrained(),
                                onchange: move |e| {
                                    dx_restrained.set(e.checked());
                                    constraint_type.set("custom".to_string());
                                }
                            }
                            span { "DX (X-axis)" }
                        }
                        label { 
                            class: "restraint-checkbox",
                            input { 
                                r#type: "checkbox",
                                checked: dy_restrained(),
                                onchange: move |e| {
                                    dy_restrained.set(e.checked());
                                    constraint_type.set("custom".to_string());
                                }
                            }
                            span { "DY (Y-axis)" }
                        }
                        label { 
                            class: "restraint-checkbox",
                            input { 
                                r#type: "checkbox",
                                checked: dz_restrained(),
                                onchange: move |e| {
                                    dz_restrained.set(e.checked());
                                    constraint_type.set("custom".to_string());
                                }
                            }
                            span { "DZ (Z-axis)" }
                        }
                    }
                }
                
                // Rotation Restraints
                div {
                    class: "form-group",
                    label {
                        class: "form-label",
                        "Rotation Restraints"
                    }
                    div {
                        class: "restraint-checkboxes",
                        label { 
                            class: "restraint-checkbox",
                            input { 
                                r#type: "checkbox",
                                checked: rx_restrained(),
                                onchange: move |e| {
                                    rx_restrained.set(e.checked());
                                    constraint_type.set("custom".to_string());
                                }
                            }
                            span { "RX (Rotation X)" }
                        }
                        label { 
                            class: "restraint-checkbox",
                            input { 
                                r#type: "checkbox",
                                checked: ry_restrained(),
                                onchange: move |e| {
                                    ry_restrained.set(e.checked());
                                    constraint_type.set("custom".to_string());
                                }
                            }
                            span { "RY (Rotation Y)" }
                        }
                        label { 
                            class: "restraint-checkbox",
                            input { 
                                r#type: "checkbox",
                                checked: rz_restrained(),
                                onchange: move |e| {
                                    rz_restrained.set(e.checked());
                                    constraint_type.set("custom".to_string());
                                }
                            }
                            span { "RZ (Rotation Z)" }
                        }
                    }
                }
                
                // Spring Stiffnesses
                div {
                    class: "form-group",
                    label {
                        class: "form-label",
                        "Spring Stiffnesses (kN/m)"
                    }
                    div {
                        class: "spring-inputs",
                        div {
                            class: "spring-input-row",
                            label { "KX:" }
                            input {
                                class: "form-input spring-input",
                                r#type: "number",
                                value: "{spring_kx}",
                                oninput: move |e| spring_kx.set(e.value()),
                                step: "1",
                                min: "0",
                                placeholder: "0"
                            }
                        }
                        div {
                            class: "spring-input-row",
                            label { "KY:" }
                            input {
                                class: "form-input spring-input",
                                r#type: "number",
                                value: "{spring_ky}",
                                oninput: move |e| spring_ky.set(e.value()),
                                step: "1",
                                min: "0",
                                placeholder: "0"
                            }
                        }
                        div {
                            class: "spring-input-row",
                            label { "KZ:" }
                            input {
                                class: "form-input spring-input",
                                r#type: "number",
                                value: "{spring_kz}",
                                oninput: move |e| spring_kz.set(e.value()),
                                step: "1",
                                min: "0",
                                placeholder: "0"
                            }
                        }
                    }
                    p {
                        class: "help-text",
                        "Set to 0 for rigid restraint, or enter stiffness value for spring support"
                    }
                }
            }
            
            // Footer with buttons
            div {
                class: "right-panel-footer",
                button {
                    class: "btn-primary",
                    onclick: move |_| {
                        // Parse spring values, default to 0 if empty or invalid
                        let kx_val = spring_kx().parse::<f64>().unwrap_or(0.0);
                        let ky_val = spring_ky().parse::<f64>().unwrap_or(0.0);
                        let kz_val = spring_kz().parse::<f64>().unwrap_or(0.0);
                        
                        // Apply constraints to selected nodes
                        let constraint_data = format!(
                            r#"{{
                                dx: {}, dy: {}, dz: {},
                                rx: {}, ry: {}, rz: {},
                                kx: {}, ky: {}, kz: {}
                            }}"#,
                            dx_restrained(), dy_restrained(), dz_restrained(),
                            rx_restrained(), ry_restrained(), rz_restrained(),
                            kx_val, ky_val, kz_val
                        );
                        eval(&format!("if(window.applyNodeConstraints) {{ window.applyNodeConstraints({}); }}", constraint_data));
                    },
                    "Apply to Selected"
                }
                div {
                    class: "btn-group",
                    button {
                        class: "btn-secondary",
                        onclick: move |_| {
                            eval("if(window.clearNodeConstraints) { window.clearNodeConstraints(); }");
                        },
                        "Clear"
                    }
                    button {
                        class: "btn-secondary",
                        onclick: move |_| {
                            show_constraints.set(false);
                        },
                        "Close"
                    }
                }
            }
        }
    }
}
