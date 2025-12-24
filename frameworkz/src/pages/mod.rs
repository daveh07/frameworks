use dioxus::prelude::*;
use crate::components::layout::DashboardLayout;

#[component]
pub fn Dashboard() -> Element {
    rsx! {
        DashboardLayout {}
    }
}
