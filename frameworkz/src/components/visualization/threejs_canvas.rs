use dioxus::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::HtmlCanvasElement;
use crate::components::visualization::three_bindings::{
    cleanup_canvas, init_three_canvas,
};

#[component]
pub fn ThreeJsCanvas() -> Element {
    let mut canvas_ref = use_signal(|| None::<HtmlCanvasElement>);

    // Initialize Three.js when canvas is mounted
    use_effect(move || {
        if let Some(canvas) = canvas_ref.read().as_ref() {
            let canvas_clone = canvas.clone();
            spawn(async move {
                match init_three_canvas(canvas_clone).await {
                    Ok(_) => println!("Three.js canvas initialized"),
                    Err(e) => println!("Failed to initialize Three.js: {:?}", e),
                }
            });
        }
    });

    // Cleanup on unmount
    use_drop(move || {
        cleanup_canvas();
    });

    rsx! {
        div {
            class: "drawing-canvas-container",
            style: "width: 100%; height: 100vh; display: flex; flex-direction: column; position: relative;",

            canvas {
                id: "drawing-canvas",
                style: "flex: 1; cursor: default; background: #212530; display: block; width: 100%; height: 100%;",
                onmounted: move |event| {
                    if let Some(element) = event.data().downcast::<web_sys::Element>() {
                        let element_copy = element.clone();
                        if let Ok(canvas) = element_copy.dyn_into::<HtmlCanvasElement>() {
                            canvas_ref.set(Some(canvas));
                        }
                    }
                }
            }
        }
    }
}