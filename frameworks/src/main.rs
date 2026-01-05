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
    #[route("/dashboard")]
    Dashboard {},
}

const MAIN_CSS: Asset = asset!("/assets/main.css");
const THREE_JS: Asset = asset!("/assets/three.min.js");

// Small, early-loaded JS hub so analysis results can be published even if
// the Three canvas hasn't initialized yet.
static ANALYSIS_RESULTS_HUB: &str = r#"(function initAnalysisResultsHub(){
    if (window.__analysisResultsHubInitialized) {
        return;
    }

    const handlerList = [];

    function registerHandler(handler) {
        if (typeof handler !== 'function') {
            return;
        }
        if (!handlerList.includes(handler)) {
            handlerList.push(handler);
        }
    }

    window.analysisResults = window.analysisResults || null;
    window.registerAnalysisResultsHandler = registerHandler;

    const hub = function(results) {
        window.analysisResults = results || null;
        handlerList.forEach(handler => {
            try {
                handler(results);
            } catch (error) {
                console.error('Analysis handler failed:', error);
            }
        });
    };

    const previous = typeof window.updateAnalysisResults === 'function'
        ? window.updateAnalysisResults
        : null;

    if (previous && previous !== hub) {
        registerHandler(previous);
    }

    window.updateAnalysisResults = hub;
    window.__analysisResultsHubInitialized = true;
})();"#;

fn main() {
    dioxus::launch(App);
}

#[component]
fn App() -> Element {
    rsx! {
        document::Link { rel: "stylesheet", href: MAIN_CSS }
        document::Script { src: THREE_JS }
        script { {ANALYSIS_RESULTS_HUB} }

        Router::<Route> {}
    }
}

