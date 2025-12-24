use dioxus::prelude::*;

#[component]
pub fn Sidebar() -> Element {
    let mut is_expanded = use_signal(|| true);

    rsx! {
        aside {
            class: if is_expanded() { "sidebar" } else { "sidebar sidebar-collapsed" },
            
            if is_expanded() {
                div { class: "sidebar-header",
                    div { class: "sidebar-brand",
                        span { "FW" }
                    }
                    button {
                        class: "btn-collapse",
                        onclick: move |_| is_expanded.set(false),
                        "‹"
                    }
                }

                // nav { class: "sidebar-content",
                //     crate::components::navigation::DesignNav {}
                // }
            } else {
                div { class: "sidebar-collapsed-content",
                    button {
                        class: "btn-expand",
                        onclick: move |_| is_expanded.set(true),
                        title: "Expand navigation",
                        "›"
                    }
                }
            }
                        crate::components::layout::LeftPanel {}

        }
    }
}
