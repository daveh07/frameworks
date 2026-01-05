use std::fs;
use std::path::{Path, PathBuf};

fn add_watch_path(path: &Path) {
    println!("cargo:rerun-if-changed={}", path.display());
}

fn walk_dir(dir: &Path, files: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return; };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_dir(&path, files);
        } else {
            files.push(path);
        }
    }
}

fn main() {
    // wasm-bindgen JS modules referenced via #[wasm_bindgen(module = "...")] are not
    // always picked up by Cargo's dependency tracking. Explicitly watch our JS sources.
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());

    let js_root = manifest_dir.join("src/components/visualization/js");
    let viewport_combined = manifest_dir.join("src/viewport_combined.js");
    let local_three = manifest_dir.join("assets/three.min.js");

    add_watch_path(&js_root);
    add_watch_path(&viewport_combined);
    add_watch_path(&local_three);

    // Also watch individual files to ensure nested changes are detected reliably.
    let mut files = Vec::new();
    walk_dir(&js_root, &mut files);
    for file in files {
        if file.extension().is_some_and(|ext| ext == "js") {
            add_watch_path(&file);
        }
    }
}
