use dioxus::prelude::*;
use dioxus::document::eval;

#[component]
pub fn SplitBeamPanel(show_panel: Signal<bool>) -> Element {
    // Split options
    let mut split_count = use_signal(|| "2".to_string());
    let mut split_mode = use_signal(|| "equal".to_string()); // "equal" or "custom"
    let mut custom_position = use_signal(|| "0.5".to_string()); // Position along beam (0-1)
    
    // Selected beam info from JavaScript
    let mut selected_beam_info = use_signal(|| None::<String>);
    let mut beam_length = use_signal(|| 0.0_f64);
    
    // Listen for beam selection events
    use_effect(move || {
        let mut eval_listener = eval(r#"
            window.addEventListener('beam-selected-for-split', (e) => {
                dioxus.send({ 
                    type: 'beam-selected', 
                    name: e.detail.name,
                    length: e.detail.length 
                });
            });
            window.addEventListener('beam-deselected', (e) => {
                dioxus.send({ type: 'beam-deselected' });
            });
        "#);

        spawn(async move {
            while let Ok(msg) = eval_listener.recv().await {
                if let Ok(val) = serde_json::from_value::<serde_json::Value>(msg) {
                    if let Some(msg_type) = val.get("type").and_then(|t| t.as_str()) {
                        match msg_type {
                            "beam-selected" => {
                                let name = val.get("name").and_then(|n| n.as_str()).unwrap_or("Unknown");
                                let len = val.get("length").and_then(|l| l.as_f64()).unwrap_or(0.0);
                                selected_beam_info.set(Some(name.to_string()));
                                beam_length.set(len);
                            }
                            "beam-deselected" => {
                                selected_beam_info.set(None);
                                beam_length.set(0.0);
                            }
                            _ => {}
                        }
                    }
                }
            }
        });
    });

    // Handle split action
    let do_split = move |_| {
        let count: u32 = split_count().parse().unwrap_or(2);
        let mode = split_mode();
        let position: f64 = custom_position().parse().unwrap_or(0.5);
        
        if mode == "equal" {
            // Split into equal segments
            eval(&format!(
                "if (window.splitSelectedBeam) {{ window.splitSelectedBeam({{ mode: 'equal', count: {} }}); }}",
                count
            ));
        } else {
            // Split at custom position
            eval(&format!(
                "if (window.splitSelectedBeam) {{ window.splitSelectedBeam({{ mode: 'position', position: {} }}); }}",
                position
            ));
        }
    };

    rsx! {
        div {
            class: "split-beam-panel floating-panel",
            style: if show_panel() {
                "display: flex; flex-direction: column;"
            } else {
                "display: none;"
            },
            
            // Header
            div {
                class: "panel-header",
                h3 { "Split Beam" }
                button {
                    class: "close-btn",
                    onclick: move |_| show_panel.set(false),
                    "×"
                }
            }
            
            // Content
            div {
                class: "panel-content",
                
                // Instructions
                div {
                    class: "panel-info",
                    style: "margin-bottom: 12px; padding: 8px; background: #f0f4f8; border-radius: 4px; font-size: 12px; color: #666;",
                    "Select a beam in the viewport to split it into multiple segments."
                }
                
                // Selected beam info
                if let Some(beam_name) = selected_beam_info() {
                    div {
                        class: "form-group",
                        label { class: "form-label", "Selected Beam" }
                        div { 
                            class: "form-value",
                            style: "padding: 8px; background: #e8f4e8; border-radius: 4px; font-weight: 500;",
                            "{beam_name}"
                        }
                    }
                    div {
                        class: "form-group",
                        label { class: "form-label", "Beam Length" }
                        div { 
                            class: "form-value",
                            style: "padding: 8px; background: #f8f8f8; border-radius: 4px;",
                            "{beam_length():.3} m"
                        }
                    }
                } else {
                    div {
                        class: "form-group",
                        style: "padding: 12px; background: #fff3cd; border-radius: 4px; text-align: center;",
                        "No beam selected"
                    }
                }
                
                // Split mode selector
                div {
                    class: "form-group",
                    style: "margin-top: 16px;",
                    label { class: "form-label", "Split Mode" }
                    div {
                        class: "radio-group",
                        style: "display: flex; gap: 16px;",
                        label {
                            style: "display: flex; align-items: center; gap: 6px; cursor: pointer;",
                            input {
                                r#type: "radio",
                                name: "split-mode",
                                value: "equal",
                                checked: split_mode() == "equal",
                                onchange: move |_| split_mode.set("equal".to_string())
                            }
                            "Equal segments"
                        }
                        label {
                            style: "display: flex; align-items: center; gap: 6px; cursor: pointer;",
                            input {
                                r#type: "radio",
                                name: "split-mode",
                                value: "custom",
                                checked: split_mode() == "custom",
                                onchange: move |_| split_mode.set("custom".to_string())
                            }
                            "At position"
                        }
                    }
                }
                
                // Options based on mode
                if split_mode() == "equal" {
                    div {
                        class: "form-group",
                        label { class: "form-label", "Number of Segments" }
                        input {
                            r#type: "number",
                            class: "form-input",
                            min: "2",
                            max: "20",
                            step: "1",
                            value: "{split_count}",
                            oninput: move |evt| split_count.set(evt.value())
                        }
                        div {
                            class: "form-hint",
                            style: "font-size: 11px; color: #888; margin-top: 4px;",
                            {
                                if let Ok(count) = split_count().parse::<u32>() {
                                    if count >= 2 && beam_length() > 0.0 {
                                        format!("Each segment: {:.3} m", beam_length() / count as f64)
                                    } else {
                                        "Enter 2 or more segments".to_string()
                                    }
                                } else {
                                    "Invalid number".to_string()
                                }
                            }
                        }
                    }
                } else {
                    div {
                        class: "form-group",
                        label { class: "form-label", "Split Position (0-1)" }
                        input {
                            r#type: "number",
                            class: "form-input",
                            min: "0.01",
                            max: "0.99",
                            step: "0.01",
                            value: "{custom_position}",
                            oninput: move |evt| custom_position.set(evt.value())
                        }
                        div {
                            class: "form-hint",
                            style: "font-size: 11px; color: #888; margin-top: 4px;",
                            {
                                if let Ok(pos) = custom_position().parse::<f64>() {
                                    if pos > 0.0 && pos < 1.0 && beam_length() > 0.0 {
                                        format!("Split at {:.3} m from start", beam_length() * pos)
                                    } else {
                                        "Position must be between 0 and 1".to_string()
                                    }
                                } else {
                                    "Invalid position".to_string()
                                }
                            }
                        }
                    }
                }
                
                // Split button
                div {
                    class: "form-group",
                    style: "margin-top: 20px;",
                    button {
                        class: "btn-primary",
                        style: "width: 100%;",
                        disabled: selected_beam_info().is_none(),
                        onclick: do_split,
                        "Split Beam"
                    }
                }
            }
        }
    }
}
