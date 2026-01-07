use dioxus::prelude::*;

// Module Declarations
mod components;
mod pages;
mod types;
mod viewport;
mod hooks;

use pages::{Dashboard};

#[derive(Debug, Clone, Routable, PartialEq)]
#[rustfmt::skip]
enum Route {
    #[route("/")]
    Home {},

    #[route("/dashboard")]
    Dashboard {},
}

const MAIN_CSS: &str = "/main.css";

// Inline JavaScript - combining scene and moment diagram scripts
static VIEWPORT_SCRIPTS: &str = include_str!("viewport_combined.js");

fn main() {
    dioxus::launch(App);
}

#[component]
fn App() -> Element {
    rsx! {
        document::Link { rel: "stylesheet", href: MAIN_CSS }
        document::Script { src: "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js" }
        script { {VIEWPORT_SCRIPTS} }

        Router::<Route> {}
    }
}

#[component]
fn Home() -> Element {
    let navigator = use_navigator();

    rsx! {
        div {
            class: "content-area",
            div {
                class: "content-header",
                h2 { "Home" }
            }
            div {
                class: "right-panel-content",
                button {
                    class: "btn-primary",
                    onclick: move |_| {
                        navigator.push(Route::Dashboard {});
                    },
                    "Go to Dashboard"
                }
            }
        }
    }
}

