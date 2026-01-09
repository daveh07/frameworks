use dioxus::prelude::*;
use dioxus::document::eval;

#[derive(Clone, PartialEq, Debug)]
pub struct LoadCase {
    pub id: usize,
    pub title: String,
    pub comment: String,
}

impl Default for LoadCase {
    fn default() -> Self {
        Self {
            id: 1,
            title: "Dead Load".to_string(),
            comment: "Self-weight and permanent loads".to_string(),
        }
    }
}

#[component]
pub fn LoadCasesModal(
    show: Signal<bool>,
    mut load_cases: Signal<Vec<LoadCase>>,
    mut active_case: Signal<usize>,
) -> Element {
    let mut new_title = use_signal(|| String::new());
    let mut new_comment = use_signal(|| String::new());
    let mut editing_id = use_signal(|| None::<usize>);
    let mut edit_title = use_signal(|| String::new());
    let mut edit_comment = use_signal(|| String::new());
    
    // Initialize with default load case if empty
    use_effect(move || {
        if load_cases.read().is_empty() {
            load_cases.set(vec![LoadCase::default()]);
        }
    });

    if !show() {
        return rsx! {};
    }

    // Clone data for rendering
    let cases_list = load_cases.read().clone();
    let current_editing = *editing_id.read();
    let current_active = *active_case.read();

    rsx! {
        div {
            class: "modal-overlay",
            onclick: move |_| show.set(false),
            
            div {
                class: "modal-content load-cases-modal",
                onclick: move |e| e.stop_propagation(),
                
                div { class: "modal-header",
                    h3 { "Load Cases" }
                    button {
                        class: "modal-close-btn",
                        onclick: move |_| show.set(false),
                        "×"
                    }
                }
                
                div { class: "modal-body",
                    // Table of existing load cases
                    div { class: "load-cases-table-container",
                        table { class: "load-cases-table",
                            thead {
                                tr {
                                    th { class: "col-case", "Case" }
                                    th { class: "col-title", "Title" }
                                    th { class: "col-comment", "Comment" }
                                    th { class: "col-actions", "Actions" }
                                }
                            }
                            tbody {
                                for case in cases_list.iter() {
                                    {render_case_row(
                                        case.clone(),
                                        current_editing,
                                        current_active,
                                        load_cases,
                                        active_case,
                                        editing_id,
                                        edit_title,
                                        edit_comment,
                                    )}
                                }
                            }
                        }
                    }
                    
                    // Add new case form
                    div { class: "add-case-form",
                        h4 { "Add New Load Case" }
                        div { class: "form-row",
                            div { class: "form-field",
                                label { "Title" }
                                input {
                                    r#type: "text",
                                    placeholder: "e.g., Live Load",
                                    value: "{new_title}",
                                    oninput: move |e| new_title.set(e.value().clone()),
                                }
                            }
                            div { class: "form-field flex-grow",
                                label { "Comment" }
                                input {
                                    r#type: "text",
                                    placeholder: "Description or notes",
                                    value: "{new_comment}",
                                    oninput: move |e| new_comment.set(e.value().clone()),
                                }
                            }
                            button {
                                class: "btn-add",
                                onclick: move |_| {
                                    let title = new_title.read().trim().to_string();
                                    if title.is_empty() {
                                        return;
                                    }
                                    
                                    let mut cases = load_cases.read().clone();
                                    let next_id = cases.iter().map(|c| c.id).max().unwrap_or(0) + 1;
                                    cases.push(LoadCase {
                                        id: next_id,
                                        title,
                                        comment: new_comment.read().trim().to_string(),
                                    });
                                    load_cases.set(cases.clone());
                                    new_title.set(String::new());
                                    new_comment.set(String::new());
                                    
                                    update_js_load_cases(&cases);
                                },
                                "Add Case"
                            }
                        }
                    }
                }
            }
        }
    }
}

fn render_case_row(
    case: LoadCase,
    editing_id_val: Option<usize>,
    active_case_val: usize,
    mut load_cases: Signal<Vec<LoadCase>>,
    mut active_case: Signal<usize>,
    mut editing_id: Signal<Option<usize>>,
    mut edit_title: Signal<String>,
    mut edit_comment: Signal<String>,
) -> Element {
    let case_id = case.id;
    let case_title = case.title.clone();
    let case_comment = case.comment.clone();
    let cases_len = load_cases.read().len();
    
    if editing_id_val == Some(case_id) {
        // Editing row
        rsx! {
            tr { class: "editing-row",
                td { class: "col-case", "{case_id}" }
                td { class: "col-title",
                    input {
                        r#type: "text",
                        class: "edit-input",
                        value: "{edit_title}",
                        oninput: move |e| edit_title.set(e.value().clone()),
                    }
                }
                td { class: "col-comment",
                    input {
                        r#type: "text",
                        class: "edit-input",
                        value: "{edit_comment}",
                        oninput: move |e| edit_comment.set(e.value().clone()),
                    }
                }
                td { class: "col-actions",
                    button {
                        class: "btn-save",
                        onclick: move |_| {
                            let mut cases = load_cases.read().clone();
                            if let Some(c) = cases.iter_mut().find(|c| c.id == case_id) {
                                c.title = edit_title.read().trim().to_string();
                                c.comment = edit_comment.read().trim().to_string();
                            }
                            load_cases.set(cases.clone());
                            editing_id.set(None);
                            update_js_load_cases(&cases);
                        },
                        "Save"
                    }
                    button {
                        class: "btn-cancel",
                        onclick: move |_| {
                            editing_id.set(None);
                        },
                        "Cancel"
                    }
                }
            }
        }
    } else {
        // Display row
        let row_class = if active_case_val == case_id { "active-case" } else { "" };
        let title_for_edit = case_title.clone();
        let comment_for_edit = case_comment.clone();
        
        rsx! {
            tr {
                class: "{row_class}",
                onclick: move |_| {
                    active_case.set(case_id);
                    update_active_case_js(case_id);
                },
                td { class: "col-case", "{case_id}" }
                td { class: "col-title", "{case_title}" }
                td { class: "col-comment", "{case_comment}" }
                td { class: "col-actions",
                    button {
                        class: "btn-edit",
                        onclick: move |e| {
                            e.stop_propagation();
                            editing_id.set(Some(case_id));
                            edit_title.set(title_for_edit.clone());
                            edit_comment.set(comment_for_edit.clone());
                        },
                        "Edit"
                    }
                    if cases_len > 1 {
                        button {
                            class: "btn-delete",
                            onclick: move |e| {
                                e.stop_propagation();
                                let cases: Vec<LoadCase> = load_cases.read().iter()
                                    .filter(|c| c.id != case_id)
                                    .cloned()
                                    .collect();
                                
                                if *active_case.read() == case_id {
                                    if let Some(first) = cases.first() {
                                        active_case.set(first.id);
                                    }
                                }
                                
                                load_cases.set(cases.clone());
                                update_js_load_cases(&cases);
                            },
                            "×"
                        }
                    }
                }
            }
        }
    }
}

fn update_js_load_cases(cases: &[LoadCase]) {
    let cases_json: Vec<serde_json::Value> = cases.iter().map(|c| {
        serde_json::json!({
            "id": c.id,
            "title": c.title,
            "comment": c.comment
        })
    }).collect();
    
    let json_str = serde_json::to_string(&cases_json).unwrap_or_else(|_| "[]".to_string());
    let js = format!("window.loadCases = {}; console.log('Load cases updated:', window.loadCases);", json_str);
    let _ = eval(&js);
}

fn update_active_case_js(id: usize) {
    let js = format!("window.activeLoadCase = {}; console.log('Active load case:', window.activeLoadCase);", id);
    let _ = eval(&js);
}
