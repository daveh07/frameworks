//! Build script to sync JavaScript source files to the public directory.
//!
//! This ensures that JS files in `src/components/visualization/js/` are
//! automatically copied to `public/js/` whenever the project is built.
//! This maintains a single source of truth while serving files correctly.

use std::fs;
use std::path::Path;

fn main() {
    // Tell Cargo to re-run this script if any JS file changes
    println!("cargo:rerun-if-changed=src/components/visualization/js/");
    
    let src_dir = Path::new("src/components/visualization/js");
    let dest_dir = Path::new("public/js");
    
    // Create destination directory if it doesn't exist
    if !dest_dir.exists() {
        fs::create_dir_all(dest_dir).expect("Failed to create public/js directory");
    }
    
    // Copy all JS files from source to destination
    if src_dir.exists() {
        match fs::read_dir(src_dir) {
            Ok(entries) => {
                for entry in entries.filter_map(|e| e.ok()) {
                    let path = entry.path();
                    if path.extension().map_or(false, |ext| ext == "js") {
                        let file_name = path.file_name().unwrap();
                        let dest_path = dest_dir.join(file_name);
                        
                        // Only copy if source is newer or destination doesn't exist
                        let should_copy = if dest_path.exists() {
                            let src_modified = fs::metadata(&path)
                                .and_then(|m| m.modified())
                                .ok();
                            let dest_modified = fs::metadata(&dest_path)
                                .and_then(|m| m.modified())
                                .ok();
                            
                            match (src_modified, dest_modified) {
                                (Some(src), Some(dest)) => src > dest,
                                _ => true,
                            }
                        } else {
                            true
                        };
                        
                        if should_copy {
                            if let Err(e) = fs::copy(&path, &dest_path) {
                                eprintln!("Warning: Failed to copy {:?}: {}", path, e);
                            } else {
                                println!("cargo:warning=Synced: {} -> public/js/", file_name.to_string_lossy());
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Warning: Could not read src/components/visualization/js/: {}", e);
            }
        }
    }
}
