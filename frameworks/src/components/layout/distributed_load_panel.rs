use dioxus::prelude::*;
use dioxus::document::eval;

#[component]
pub fn DistributedLoadPanel(show_panel: Signal<bool>) -> Element {
    let mut magnitude = use_signal(|| String::from("5.0"));
    let mut direction = use_signal(|| String::from("y"));
    let mut start_pos = use_signal(|| String::from("0.0"));
    let mut end_pos = use_signal(|| String::from("1.0"));
    let mut color = use_signal(|| String::from("#ff6600"));

    let apply_load = move |_| {
        let mag_value = magnitude.read().clone();
        let dir_value = direction.read().clone();
        let start_value = start_pos.read().clone();
        let end_value = end_pos.read().clone();
        let color_value = color.read().clone();
        
        // Call JavaScript function to apply load
        let js_code = format!(
            r#"
            if (window.applyDistributedLoad) {{
                window.applyDistributedLoad({{
                    magnitude: {},
                    direction: '{}',
                    startPos: {},
                    endPos: {},
                    color: '{}'
                }});
            }}
            "#,
            mag_value, dir_value, start_value, end_value, color_value
        );
        
        eval(&js_code);
    };

    let close_panel = move |_| {
        show_panel.set(false);
    };

    rsx! {
        div {
            class: "right-panel distributed-load-panel",
            style: if *show_panel.read() {
                "transform: translateX(0); pointer-events: auto;"
            } else {
                "transform: translateX(100%); pointer-events: none;"
            },
            
            div { class: "panel-header",
                h3 { "Distributed Load (UDL)" }
                button {
                    class: "close-btn",
                    onclick: close_panel,
                    "×"
                }
            }

            div { class: "panel-content",
                
                // Magnitude input
                div { class: "form-group",
                    label { r#for: "magnitude", "Magnitude (kN/m)" }
                    input {
                        r#type: "number",
                        id: "magnitude",
                        value: "{magnitude}",
                        step: "0.1",
                        oninput: move |evt| magnitude.set(evt.value().clone())
                    }
                    span { class: "help-text", "Force per unit length" }
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

                // Start position
                div { class: "form-group",
                    label { r#for: "start-pos", "Start Position" }
                    input {
                        r#type: "number",
                        id: "start-pos",
                        value: "{start_pos}",
                        min: "0",
                        max: "1",
                        step: "0.1",
                        oninput: move |evt| start_pos.set(evt.value().clone())
                    }
                    span { class: "help-text", "0 = beam start" }
                }

                // End position
                div { class: "form-group",
                    label { r#for: "end-pos", "End Position" }
                    input {
                        r#type: "number",
                        id: "end-pos",
                        value: "{end_pos}",
                        min: "0",
                        max: "1",
                        step: "0.1",
                        oninput: move |evt| end_pos.set(evt.value().clone())
                    }
                    span { class: "help-text", "1 = beam end" }
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
