use dioxus::prelude::*;
use dioxus::document::eval;

#[allow(unused_imports)]
use crate::types::*;

#[component]
pub fn AnalysisPanel(show: Signal<bool>) -> Element {
    let mut is_analyzing = use_signal(|| false);
    let mut analysis_error = use_signal(|| None::<String>);
    let mut show_results = use_signal(|| false);
    
    // Material selection state
    let mut selected_material = use_signal(|| "steel".to_string());
    let mut shell_thickness = use_signal(|| 0.2f64);
    
    // Contour selection state
    let mut selected_contour = use_signal(|| "von_mises".to_string());
    let mut selected_surface = use_signal(|| "middle".to_string());

    let run_analysis = move |_| {
        spawn(async move {
            is_analyzing.set(true);
            analysis_error.set(None);
            
            // Define material properties based on selection (Units: kN, m)
            let material_props = match selected_material().as_str() {
                "concrete" => "{ name: 'Concrete', elastic_modulus: 30e6, poisson_ratio: 0.2, density: 24.0 }", // 30 GPa, 24 kN/m³
                "aluminum" => "{ name: 'Aluminum', elastic_modulus: 70e6, poisson_ratio: 0.33, density: 27.0 }", // 70 GPa, 27 kN/m³
                _ => "{ name: 'Steel', elastic_modulus: 210e6, poisson_ratio: 0.3, density: 78.5 }", // 210 GPa, 78.5 kN/m³
            };
            
            let thickness = shell_thickness();

            // Get structure data from JavaScript and call API using fetch
            let result = eval(
                &format!(r#"
                const material = {};
                const defaultThickness = {};
                const structureData = window.extractStructureData(material, defaultThickness);
                
                if (!structureData) {{
                    return {{ error: 'Failed to extract structure data from scene' }};
                }}
                
                try {{
                    const response = await fetch('http://localhost:8084/api/v1/analyze', {{
                        method: 'POST',
                        headers: {{
                            'Content-Type': 'application/json',
                        }},
                        body: JSON.stringify({{ model: structureData }})
                    }});
                    
                    if (!response.ok) {{
                        return {{ error: `HTTP error! status: ${{response.status}}` }};
                    }}
                    
                    const data = await response.json();
                    
                    if (data.status === 'Success' && data.results) {{
                        window.updateAnalysisResults(data.results);
                        return {{ success: true, results: data.results }};
                    }} else {{
                        return {{ error: data.error_message || 'Analysis failed' }};
                    }}
                }} catch (error) {{
                    return {{ error: error.toString() }};
                }}
                "#, material_props, thickness)
            ).await;
            
            match result {
                Ok(value) => {
                    if let Some(obj) = value.as_object() {
                        if obj.contains_key("error") {
                            if let Some(err) = obj.get("error").and_then(|v| v.as_str()) {
                                analysis_error.set(Some(err.to_string()));
                            }
                        } else if obj.contains_key("success") {
                            show_results.set(true);
                        }
                    }
                }
                Err(e) => {
                    analysis_error.set(Some(format!("Failed to execute: {:?}", e)));
                }
            }
            
            is_analyzing.set(false);
        });
    };

    rsx! {
        div {
            class: "right-panel analysis-panel",
            style: if show() {
                "transform: translateX(0); pointer-events: auto;"
            } else {
                "transform: translateX(100%); pointer-events: none;"
            },
            
            div { class: "panel-header",
                h3 { "Structural Analysis" }
                button {
                    class: "close-button",
                    onclick: move |_| show.set(false),
                    "×"
                }
            }
            
            // Content
            div { class: "panel-content",
                        div { class: "section",
                            h4 { "Material Properties" }
                            div { class: "property-group",
                                label { "Material" }
                                select {
                                    value: "{selected_material}",
                                    onchange: move |evt| selected_material.set(evt.value()),
                                    option { value: "steel", "Structural Steel (E=210 GPa)" }
                                    option { value: "concrete", "Concrete (E=30 GPa)" }
                                    option { value: "aluminum", "Aluminum (E=70 GPa)" }
                                }
                            }
                            div { class: "property-group",
                                label { "Shell Thickness (m)" }
                                input { 
                                    r#type: "number", 
                                    value: "{shell_thickness}", 
                                    oninput: move |evt| {
                                        if let Ok(val) = evt.value().parse::<f64>() {
                                            shell_thickness.set(val);
                                        }
                                    },
                                    step: "0.01",
                                    min: "0.01"
                                }
                            }
                        }

                        div { class: "section",
                            h4 { "Run Analysis" }
                            p { class: "help-text",
                                "Analyze the structure using CalculiX FEA solver. "
                                "Ensure you have nodes, beams, plates, and supports defined."
                            }
                            
                            button {
                                class: "btn btn-primary",
                                disabled: is_analyzing(),
                                onclick: run_analysis,
                                if is_analyzing() {
                                    "Analyzing..."
                                } else {
                                    "Run Analysis"
                                }
                            }
                            
                            if let Some(error) = analysis_error() {
                                div { class: "error-message mt-3",
                                    "⚠️ {error}"
                                }
                            }
                        }
                        
                        if show_results() {
                            div { class: "section mt-4",
                                h4 { "Analysis Complete!" }
                                
                                p { class: "help-text",
                                    "Results have been calculated. Use the buttons below to visualize."
                                }
                                
                                // Visualization controls
                                div { class: "visualization-controls mt-3",
                                    h5 { "Diagrams" }
                                    button {
                                        class: "btn btn-secondary btn-sm",
                                        onclick: move |_| {
                                            eval("window.showBendingMomentDiagram()");
                                        },
                                        "📊 Bending Moment"
                                    }
                                    button {
                                        class: "btn btn-secondary btn-sm ml-2",
                                        onclick: move |_| {
                                            eval("window.showShearForceDiagram()");
                                        },
                                        "📈 Shear Force"
                                    }
                                    button {
                                        class: "btn btn-secondary btn-sm ml-2",
                                        onclick: move |_| {
                                            eval("window.showDeformedShape()");
                                        },
                                        "🔄 Deformed Shape"
                                    }
                                    
                                    // Contour Plot Section
                                    h5 { class: "mt-3", "Contour Plots" }
                                    
                                    // Contour type dropdown
                                    div { class: "property-group",
                                        label { "Result Type" }
                                        select {
                                            value: "{selected_contour}",
                                            onchange: move |evt| selected_contour.set(evt.value()),
                                            
                                            // Stress results
                                            optgroup { label: "Stress",
                                                option { value: "von_mises", "Von Mises Stress" }
                                                option { value: "sxx", "σxx (Normal X)" }
                                                option { value: "syy", "σyy (Normal Y)" }
                                                option { value: "szz", "σzz (Normal Z)" }
                                                option { value: "sxy", "σxy (Shear XY)" }
                                            }
                                            
                                            // Principal stresses
                                            optgroup { label: "Principal Stresses",
                                                option { value: "principal_1", "σ₁ (Maximum)" }
                                                option { value: "principal_2", "σ₂ (Minimum)" }
                                                option { value: "principal_3", "σ₃ (Out-of-plane)" }
                                            }
                                            
                                            // Displacement results
                                            optgroup { label: "Displacement",
                                                option { value: "displacement_magnitude", "Total Displacement" }
                                                option { value: "dx", "Displacement X" }
                                                option { value: "dy", "Displacement Y" }
                                                option { value: "dz", "Displacement Z" }
                                            }
                                        }
                                    }
                                    
                                    // Surface selection (for shell stresses)
                                    div { class: "property-group",
                                        label { "Surface" }
                                        select {
                                            value: "{selected_surface}",
                                            onchange: move |evt| selected_surface.set(evt.value()),
                                            option { value: "middle", "Mid-Plane" }
                                            option { value: "top", "Top Fibre" }
                                            option { value: "bottom", "Bottom Fibre" }
                                        }
                                    }
                                    
                                    // Show Contour button
                                    button {
                                        class: "btn btn-primary btn-sm mt-2",
                                        onclick: move |_| {
                                            let contour = selected_contour();
                                            let surface = selected_surface();
                                            eval(&format!("window.showContour('{}', '{}')", contour, surface));
                                        },
                                        "🎨 Show Contour"
                                    }
                                    
                                    button {
                                        class: "btn btn-secondary btn-sm mt-3",
                                        onclick: move |_| {
                                            eval("window.clearDiagrams()");
                                        },
                                        "❌ Clear All"
                                    }
                                }
                                
                                // Show results in console
                                div { class: "mt-3",
                                    button {
                                        class: "btn btn-sm",
                                        onclick: move |_| {
                                            eval("console.log('Analysis Results:', window.analysisResults)");
                                        },
                                        "View Results in Console"
                                    }
                                }
                            }
                        }
                    }
                }
    }
}
