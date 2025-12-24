use dioxus::prelude::*;
use dioxus::document::eval;

#[component]
pub fn PressureLoadPanel(show_panel: Signal<bool>) -> Element {
    let mut magnitude = use_signal(|| String::from("5.0"));
    let mut color = use_signal(|| String::from("#ff0000"));

    let apply_load = move |_| {
        let mag_value = magnitude.read().clone();
        let color_value = color.read().clone();
        
        // Call JavaScript function to apply load
        let js_code = format!(
            r#"
            if (window.applyPressureLoad) {{
                window.applyPressureLoad({{
                    magnitude: {},
                    color: '{}'
                }});
            }}
            "#,
            mag_value, color_value
        );
        
        eval(&js_code);
    };

    let close_panel = move |_| {
        show_panel.set(false);
    };

    rsx! {
        div {
            class: "right-panel pressure-load-panel",
            style: if *show_panel.read() {
                "transform: translateX(0); pointer-events: auto;"
            } else {
                "transform: translateX(100%); pointer-events: none;"
            },
            
            div { class: "panel-header",
                h3 { "Pressure Load" }
                button {
                    class: "close-btn",
                    onclick: close_panel,
                    "×"
                }
            }

            div { class: "panel-content",
                
                // Magnitude input
                div { class: "form-group",
                    label { r#for: "magnitude", "Magnitude (kPa)" }
                    input {
                        r#type: "number",
                        id: "magnitude",
                        value: "{magnitude}",
                        step: "0.1",
                        oninput: move |evt| magnitude.set(evt.value().clone())
                    }
                    span { class: "help-text", "Pressure magnitude (Positive = Push)" }
                }

                // Color picker
                div { class: "form-group",
                    label { r#for: "color", "Color" }
                    input {
                        r#type: "color",
                        id: "color",
                        value: "{color}",
                        oninput: move |evt| color.set(evt.value().clone())
                    }
                }

                div { class: "button-group",
                    button {
                        class: "apply-btn",
                        onclick: apply_load,
                        "Apply to Selected Plates"
                    }
                    button {
                        class: "close-btn-secondary",
                        onclick: move |_| {
                            eval(r#"
                                if (window.clearLoadsFromSelectedPlates) {
                                    window.clearLoadsFromSelectedPlates();
                                }
                            "#);
                        },
                        "Clear Loads"
                    }
                    button {
                        class: "close-btn-secondary",
                        onclick: close_panel,
                        "Close"
                    }
                }
                
                div { class: "info-box",
                    p { "Select one or more plates, then click Apply." }
                }
            }
        }
    }
}
