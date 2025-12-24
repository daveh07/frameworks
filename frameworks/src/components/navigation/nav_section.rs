use dioxus::prelude::*;

#[component]
pub fn NavSection(title: String, children: Element) -> Element {
    let mut is_expanded = use_signal(|| true);

    rsx! {
        div {
            class: if is_expanded() { "nav-section" } else { "nav-section collapsed" },

            div {
                class: "nav-section-header",
                onclick: move |_| is_expanded.set(!is_expanded()),

                h4 { class: "nav-section-title", "{title}" }
                span { class: "nav-section-toggle", "▼" }
            }

            div { class: "nav-section-content",
                {children}
            }
        }
    }
}
