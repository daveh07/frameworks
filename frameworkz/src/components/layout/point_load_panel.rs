use dioxus::prelude::*;
use dioxus::document::eval;

#[component]
pub fn PointLoadPanel(show_panel: Signal<bool>) -> Element {
    let mut magnitude = use_signal(|| String::from("10.0"));
    let mut direction = use_signal(|| String::from("y"));
    let mut position = use_signal(|| String::from("0.5"));
    let mut color = use_signal(|| String::from("#ff0000"));

    let apply_load = move |_| {
        let mag_value = magnitude.read().clone();
        let dir_value = direction.read().clone();
        let pos_value = position.read().clone();
        let color_value = color.read().clone();
        
        // Call JavaScript function to apply load
        let js_code = format!(
            r#"
            if (window.applyPointLoad) {{
                window.applyPointLoad({{
                    magnitude: {},
                    direction: '{}',
                    position: {},
                    color: '{}'
                }});
            }}
            "#,
            mag_value, dir_value, pos_value, color_value
        );
        
        eval(&js_code);
    };

    let close_panel = move |_| {
        show_panel.set(false);
    };

    rsx! {
        div {
            class: "right-panel point-load-panel",
            style: if *show_panel.read() {
                "transform: translateX(0); pointer-events: auto;"
            } else {
                "transform: translateX(100%); pointer-events: none;"
            },
            
            div { class: "panel-header",
                h3 { "Point Load" }
                button {
                    class: "close-btn",
                    onclick: close_panel,
                    "×"
                }
            }

            div { class: "panel-content",
                
                // Magnitude input
                div { class: "form-group",
                    label { r#for: "magnitude", "Magnitude (kN)" }
                    input {
                        r#type: "number",
                        id: "magnitude",
                        value: "{magnitude}",
                        step: "0.1",
                        oninput: move |evt| magnitude.set(evt.value().clone())
                    }
                    span { class: "help-text", "Force magnitude" }
                }

                // Direction dropdown
                div { class: "form-group",
                    label { r#for: "direction", "Direction" }
                    select {
                        id: "direction",
                        value: "{direction}",
                        onchange: move |evt| direction.set(evt.value().clone()),
                        option { value: "x", "X (Global)" }
                        option { value: "y", selected: true, "Y (Global)" }
                        option { value: "z", "Z (Global)" }
                    }
                    span { class: "help-text", "Load direction" }
                }

                // Position along beam
                div { class: "form-group",
                    label { r#for: "position", "Position" }
                    input {
                        r#type: "number",
                        id: "position",
                        value: "{position}",
                        min: "0",
                        max: "1",
                        step: "0.1",
                        oninput: move |evt| position.set(evt.value().clone())
                    }
                    span { class: "help-text", "0 = start, 1 = end" }
                }

                // Color picker
                div { class: "form-group",
                    label { r#for: "load-color", "Color" }
                    input {
                        r#type: "color",
                        id: "load-color",
                        value: "{color}",
                        oninput: move |evt| color.set(evt.value().clone())
                    }
                    span { class: "help-text", "Load arrow color" }
                }

                // Apply button
                div { class: "button-group",
                    button {
                        class: "apply-btn",
                        onclick: apply_load,
                        "Apply"
                    }
                    button {
                        class: "close-btn-secondary",
                        onclick: move |_| {
                            eval(r#"
                                if (window.clearLoadsFromSelectedBeams) {
                                    window.clearLoadsFromSelectedBeams();
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
            }
        }
    }
}
