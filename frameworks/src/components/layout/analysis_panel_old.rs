use dioxus::prelude::*;
use dioxus::document::eval;
use crate::components::layout::{BeamProperties, ShellProperties, MaterialProperties};

#[allow(unused_imports)]
use crate::types::*;

#[component]
pub fn AnalysisPanel(
    show: Signal<bool>,
    beam_props: Signal<BeamProperties>,
    shell_props: Signal<ShellProperties>,
    material_props: Signal<MaterialProperties>,
) -> Element {
    let mut is_analyzing = use_signal(|| false);
    let mut analysis_error = use_signal(|| None::<String>);
    let mut show_results = use_signal(|| false);
    
    // Contour selection state
    let mut selected_contour = use_signal(|| "von_mises".to_string());
    let mut selected_surface = use_signal(|| "middle".to_string());

    let run_analysis = move |_| {
        spawn(async move {
            is_analyzing.set(true);
            analysis_error.set(None);
            
            // Get properties from shared state
            let mat = material_props();
            let beam = beam_props();
            let shell = shell_props();
            
            // Build material properties object (Units: kN, m -> kPa for stress)
            // E is in GPa from UI, convert to kPa: GPa * 1e6 = kPa
            let elastic_modulus_kpa = mat.elastic_modulus * 1e6; // GPa to kPa
            // Density stays in kg/m³ (standard SI mass density)
            let material_props_js = format!(
                "{{ name: '{}', elastic_modulus: {}, poisson_ratio: {}, density: {} }}",
                mat.name, elastic_modulus_kpa, mat.poisson_ratio, mat.density // kg/m³ stays as-is
            );
            
            // Build beam section properties
            let beam_section_js = format!(
                "{{ section_type: '{}', width: {}, height: {}, flange_thickness: {}, web_thickness: {} }}",
                beam.section_type, beam.width, beam.height, beam.flange_thickness, beam.web_thickness
            );
            
            let thickness = shell.thickness;

            // Get structure data from JavaScript and call API using fetch
            let result = eval(
                &format!(r#"
                const material = {material_props_js};
                const beamSection = {beam_section_js};
                const defaultThickness = {thickness};
                
                // Pass beam section to extractor
                window.currentBeamSection = beamSection;
                
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
                "#)
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
                h3 { "Analysis" }
                button {
                    class: "close-button",
                    onclick: move |_| show.set(false),
                    "×"
                }
            }
            
            // Content
            div { class: "panel-content",
                // Model Properties
                div { class: "analysis-section",
                    div { class: "section-title", "Model Properties" }
                    div { class: "properties-grid",
                        div { class: "prop-item",
                            span { class: "prop-label", "Material" }
                            span { class: "prop-value", "{material_props().name}" }
                        }
                        div { class: "prop-item",
                            span { class: "prop-label", "Elastic Modulus" }
                            span { class: "prop-value", "{material_props().elastic_modulus} GPa" }
                        }
                        div { class: "prop-item",
                            span { class: "prop-label", "Poisson Ratio" }
                            span { class: "prop-value", "{material_props().poisson_ratio:.3}" }
                        }
                        div { class: "prop-item",
                            span { class: "prop-label", "Beam Section" }
                            span { class: "prop-value", "{beam_props().section_type}" }
                        }
                        div { class: "prop-item",
                            span { class: "prop-label", "Section Size" }
                            span { class: "prop-value", "{beam_props().width*1000.0:.0} × {beam_props().height*1000.0:.0} mm" }
                        }
                        div { class: "prop-item",
                            span { class: "prop-label", "Shell Thickness" }
                            span { class: "prop-value", "{shell_props().thickness*1000.0:.0} mm" }
                        }
                    }
                }

                // Solver Control
                div { class: "analysis-section",
                    div { class: "section-title", "Solver" }
                    
                    button {
                        class: "btn-analysis-run",
                        disabled: is_analyzing(),
                        onclick: run_analysis,
                        if is_analyzing() {
                            "Running Analysis..."
                        } else {
                            "Run Analysis"
                        }
                    }
                    
                    if let Some(error) = analysis_error() {
                        div { class: "analysis-error",
                            div { class: "error-label", "Error" }
                            div { class: "error-text", "{error}" }
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
