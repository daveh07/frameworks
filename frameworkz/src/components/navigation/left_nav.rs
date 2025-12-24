use dioxus::prelude::*;

#[component]
pub fn LeftNav() -> Element {
    rsx! {
        div {
            class: "space-y-6",

            // // Geometry Section
            // crate::components::navigation::NavSection {
            //     title: "Geometry",
            //     crate::components::design::GeometryInputs {}
            // }

            // // Material Properties Section
            // crate::components::navigation::NavSection {
            //     title: "Material Properties",
            //     crate::components::design::MaterialInputs {}
            // }

            // // Loading Section
            // crate::components::navigation::NavSection {
            //     title: "Loading",
            //     crate::components::design::LoadingInputs {}
            // }

            // // Analysis Options Section
            // crate::components::navigation::NavSection {
            //     title: "Analysis Options",
            //     crate::components::design::AnalysisOptions {}
            // }

            // Action Buttons
            div {
                class: "space-y-3 rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm",
                p {
                    class: "text-xs font-medium uppercase tracking-widest text-slate-400",
                    "Analysis"
                }
                button {
                    class: "btn-primary w-full justify-center gap-2 text-sm",
                    "Run Analysis"
                }
                button {
                    class: "btn-secondary w-full justify-center gap-2 text-sm",
                    "Reset"
                }
            }
        }
    }
}
