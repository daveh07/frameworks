use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = "toggleAddNodeMode")]
    pub fn toggle_add_node_mode() -> bool;
    
    #[wasm_bindgen(js_name = "toggleSelectNodeMode")]
    pub fn toggle_select_node_mode() -> bool;
    
    #[wasm_bindgen(js_name = "toggleDrawBeamMode")]
    pub fn toggle_draw_beam_mode() -> bool;
    
    #[wasm_bindgen(js_name = "toggleDrawPlateMode")]
    pub fn toggle_draw_plate_mode() -> bool;
    
    #[wasm_bindgen(js_name = "selectAllNodes")]
    pub fn select_all_nodes();
    
    #[wasm_bindgen(js_name = "clearNodeSelection")]
    pub fn clear_node_selection();
    
    #[wasm_bindgen(js_name = "deleteSelected")]
    pub fn delete_selected();
    
    #[wasm_bindgen(js_name = "extrudeBeams")]
    pub fn extrude_beams(direction: &str, length: f64);
    
    #[wasm_bindgen(js_name = "setPlanView")]
    pub fn set_plan_view(elevation: f64);
    
    #[wasm_bindgen(js_name = "resetView")]
    pub fn reset_view();
    
    #[wasm_bindgen(js_name = "cleanupCanvas")]
    pub fn cleanup_canvas();
}
