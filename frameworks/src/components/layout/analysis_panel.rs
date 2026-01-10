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
    let mut analysis_type = use_signal(|| "linear".to_string());
    
    // Results state
    let mut max_displacement = use_signal(|| 0.0_f64);
    let mut max_reaction = use_signal(|| 0.0_f64);
    
    // Deformation scale
    let mut deform_scale = use_signal(|| 0.0_f64);

    let run_fea_analysis = move |_| {
        spawn(async move {
            is_analyzing.set(true);
            analysis_error.set(None);
            
            let mat = material_props();
            let beam = beam_props();
            let analysis = analysis_type();
            
            // Build material config for JavaScript
            let material_js = format!(
                "{{ name: '{}', elastic_modulus: {}, poisson_ratio: {}, density: {} }}",
                mat.name, mat.elastic_modulus, mat.poisson_ratio, mat.density
            );
            
            // Build beam section config
            let beam_section_js = format!(
                "{{ section_type: '{}', width: {}, height: {}, flange_thickness: {}, web_thickness: {} }}",
                beam.section_type, beam.width, beam.height, beam.flange_thickness, beam.web_thickness
            );

            let result = eval(
                &format!(r#"
                const material = {material_js};
                const beamSection = {beam_section_js};
                const analysisType = '{analysis}';
                
                const result = await window.runFEAAnalysis(material, beamSection, analysisType);
                
                if (result.success && result.results) {{
                    return {{
                        success: true,
                        maxDisplacement: result.results.summary.max_displacement * 1000,
                        maxReaction: result.results.summary.max_reaction / 1000,
                        numNodes: result.results.summary.num_nodes,
                        numMembers: result.results.summary.num_members
                    }};
                }} else {{
                    return {{ error: result.error || 'Analysis failed' }};
                }}
                "#)
            ).await;
            
            match result {
                Ok(value) => {
                    if let Some(obj) = value.as_object() {
                        if let Some(err) = obj.get("error").and_then(|v| v.as_str()) {
                            analysis_error.set(Some(err.to_string()));
                        } else if obj.contains_key("success") {
                            show_results.set(true);
                            if let Some(disp) = obj.get("maxDisplacement").and_then(|v| v.as_f64()) {
                                max_displacement.set(disp);
                            }
                            if let Some(react) = obj.get("maxReaction").and_then(|v| v.as_f64()) {
                                max_reaction.set(react);
                            }
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
                // Solver Settings
                div { class: "analysis-section",
                    div { class: "section-title", "Solver Settings" }
                    
                    div { class: "control-row",
                        label { "Analysis Type" }
                        select {
                            class: "analysis-type-select",
                            value: "{analysis_type}",
                            onchange: move |evt| analysis_type.set(evt.value()),
                            option { value: "linear", "Linear Static" }
                            option { value: "pdelta", "P-Delta (2nd Order)" }
                        }
                    }
                    
                    button {
                        class: "btn-analysis-run",
                        disabled: is_analyzing(),
                        onclick: run_fea_analysis,
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
                
                // Results Section
                if show_results() {
                    div { class: "results-section",
                        div { class: "results-header",
                            "Analysis Complete"
                        }
                        
                        // Results Summary
                        div { class: "results-summary",
                            div { class: "result-item",
                                span { class: "result-label", "Max Displacement" }
                                span { class: "result-value", "{max_displacement():.3} mm" }
                            }
                            div { class: "result-item",
                                span { class: "result-label", "Max Reaction" }
                                span { class: "result-value", "{max_reaction():.2} kN" }
                            }
                        }
                        
                        // Deformation Scale Slider
                        div { class: "control-row",
                            label { "Deform Scale: {deform_scale():.0}x" }
                            input {
                                r#type: "range",
                                class: "scale-slider",
                                min: "0",
                                max: "500",
                                step: "1",
                                value: "{deform_scale}",
                                oninput: move |evt| {
                                    if let Ok(v) = evt.value().parse::<f64>() {
                                        deform_scale.set(v);
                                        // If deformed shape is currently displayed, refresh it with new scale
                                        eval(&format!("if (window.currentDiagramType === 'deformed') {{ window.showFEADeformedShape({}); }}", v));
                                    }
                                }
                            }
                        }
                        
                        // Diagram buttons
                        div { class: "diagram-controls",
                            div { class: "control-group-label", "Force Diagrams" }
                            div { class: "button-row",
                                button {
                                    class: "diagram-btn",
                                    onclick: move |_| {
                                        let scale = deform_scale();
                                        eval(&format!("window.showFEADeformedShape({})", scale));
                                    },
                                    "Deformed Shape"
                                }
                                button {
                                    class: "diagram-btn",
                                    onclick: move |_| {
                                        eval("window.showFEAAxialForceDiagram()");
                                    },
                                    "Axial Force"
                                }
                            }
                            div { class: "control-group-label", "Bending Moments" }
                            div { class: "button-row",
                                button {
                                    class: "diagram-btn",
                                    title: "Show Mz bending moment diagram (XY plane - gravity bending)",
                                    onclick: move |_| {
                                        eval("window.showFEABendingMomentDiagram()");
                                    },
                                    "Mz (XY)"
                                }
                                button {
                                    class: "diagram-btn",
                                    title: "Show My bending moment diagram (XZ plane - out-of-plane bending)",
                                    onclick: move |_| {
                                        eval("window.showFEABendingMomentDiagramXZ()");
                                    },
                                    "My (XZ)"
                                }
                            }
                            div { class: "control-group-label", "Shear Forces" }
                            div { class: "button-row",
                                button {
                                    class: "diagram-btn",
                                    onclick: move |_| {
                                        eval("window.showFEAShearForceDiagram()");
                                    },
                                    "Shear Force"
                                }
                            }
                            div { class: "button-row",
                                button {
                                    class: "diagram-btn",
                                    onclick: move |_| {
                                        eval("window.showFEAReactions()");
                                    },
                                    "Reactions"
                                }
                                button {
                                    class: "diagram-btn danger",
                                    onclick: move |_| {
                                        eval("window.clearFEADiagrams()");
                                    },
                                    "Clear"
                                }
                            }
                        }
                        
                        // Debug Button
                        div { class: "action-controls",
                            button {
                                class: "debug-btn",
                                onclick: move |_| {
                                    eval("console.log(window.getFEAResultsSummary())");
                                },
                                "Log Results"
                            }
                        }
                    }
                }
            }
        }
    }
}
