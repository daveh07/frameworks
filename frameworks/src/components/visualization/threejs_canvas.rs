use dioxus::prelude::*;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::HtmlCanvasElement;
use crate::components::visualization::three_bindings::cleanup_canvas;

/// Wait for window.init_three_canvas to be defined, then call it
async fn wait_and_init_canvas(canvas: HtmlCanvasElement) -> Result<(), String> {
    use wasm_bindgen_futures::JsFuture;
    use js_sys::{Function, Promise, Reflect};
    
    let window = web_sys::window().ok_or("No window")?;
    
    // Wait for init_three_canvas to be available (max 5 seconds)
    for _ in 0..50 {
        let func = Reflect::get(&window, &JsValue::from_str("init_three_canvas"))
            .map_err(|e| format!("Reflect error: {:?}", e))?;
        
        if !func.is_undefined() && !func.is_null() {
            // Function is available, call it
            let func: Function = func.dyn_into()
                .map_err(|_| "init_three_canvas is not a function")?;
            
            let result = func.call1(&JsValue::NULL, &canvas)
                .map_err(|e| format!("Call error: {:?}", e))?;
            
            // If result is a Promise, await it
            if result.has_type::<Promise>() {
                let promise: Promise = result.unchecked_into();
                JsFuture::from(promise).await
                    .map_err(|e| format!("Promise error: {:?}", e))?;
            }
            
            return Ok(());
        }
        
        // Wait 100ms before trying again
        let delay = Promise::new(&mut |resolve, _| {
            let window = web_sys::window().unwrap();
            window.set_timeout_with_callback_and_timeout_and_arguments_0(&resolve, 100).unwrap();
        });
        JsFuture::from(delay).await.ok();
    }
    
    Err("Timeout waiting for init_three_canvas".to_string())
}

#[component]
pub fn ThreeJsCanvas() -> Element {
    let mut canvas_ref = use_signal(|| None::<HtmlCanvasElement>);

    // Initialize Three.js when canvas is mounted
    use_effect(move || {
        if let Some(canvas) = canvas_ref.read().as_ref() {
            let canvas_clone = canvas.clone();
            spawn(async move {
                match wait_and_init_canvas(canvas_clone).await {
                    Ok(_) => web_sys::console::log_1(&"Three.js canvas initialized".into()),
                    Err(e) => web_sys::console::error_1(&format!("Failed to initialize Three.js: {}", e).into()),
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
            style: "width: 100%; height: 100%; min-height: 0; display: flex; flex-direction: column; position: relative;",

            canvas {
                id: "drawing-canvas",
                class: "threejs-canvas",
                style: "flex: 1; min-height: 0; cursor: default; background: #212530;",
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