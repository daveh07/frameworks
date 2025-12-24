use dioxus::prelude::*;
use crate::hooks::use_design_state::{use_design_state, DesignState};

#[component]
pub fn DashboardLayout() -> Element {
    let design_state = use_design_state();
    use_context_provider(|| design_state.clone());
    
    rsx! {
        div {
            class: "dashboard-container",
            crate::components::layout::Sidebar {}
            crate::components::layout::ContentArea {}
        }
    }
}
