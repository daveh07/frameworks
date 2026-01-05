//! Benchmarks for FEA solver

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use fea_solver::prelude::*;

fn create_cantilever_model() -> FEModel {
    let mut model = FEModel::new();
    
    model.add_material("Steel", Material::steel()).unwrap();
    model.add_section("Section", Section::rectangular(0.3, 0.5)).unwrap();
    
    model.add_node("N1", Node::new(0.0, 0.0, 0.0)).unwrap();
    model.add_node("N2", Node::new(10.0, 0.0, 0.0)).unwrap();
    
    model.add_member("M1", Member::new("N1", "N2", "Steel", "Section")).unwrap();
    model.add_support("N1", Support::fixed()).unwrap();
    model.add_node_load("N2", NodeLoad::fy(-10000.0, "Case 1")).unwrap();
    
    model
}

fn create_multi_story_frame(stories: usize, bays: usize) -> FEModel {
    let mut model = FEModel::new();
    
    model.add_material("Steel", Material::steel()).unwrap();
    model.add_section("Column", Section::rectangular(0.4, 0.4)).unwrap();
    model.add_section("Beam", Section::rectangular(0.3, 0.6)).unwrap();
    
    let story_height = 3.5;
    let bay_width = 6.0;
    
    // Create nodes
    for story in 0..=stories {
        for bay in 0..=bays {
            let name = format!("N{}_{}", story, bay);
            let x = bay as f64 * bay_width;
            let y = story as f64 * story_height;
            model.add_node(&name, Node::new(x, y, 0.0)).unwrap();
        }
    }
    
    // Create columns
    for story in 0..stories {
        for bay in 0..=bays {
            let name = format!("Col{}_{}", story, bay);
            let i_node = format!("N{}_{}", story, bay);
            let j_node = format!("N{}_{}", story + 1, bay);
            model.add_member(&name, Member::new(&i_node, &j_node, "Steel", "Column")).unwrap();
        }
    }
    
    // Create beams
    for story in 1..=stories {
        for bay in 0..bays {
            let name = format!("Beam{}_{}", story, bay);
            let i_node = format!("N{}_{}", story, bay);
            let j_node = format!("N{}_{}", story, bay + 1);
            model.add_member(&name, Member::new(&i_node, &j_node, "Steel", "Beam")).unwrap();
        }
    }
    
    // Add supports at base
    for bay in 0..=bays {
        let name = format!("N0_{}", bay);
        model.add_support(&name, Support::fixed()).unwrap();
    }
    
    // Add loads
    for story in 1..=stories {
        for bay in 0..=bays {
            let name = format!("N{}_{}", story, bay);
            model.add_node_load(&name, NodeLoad::fy(-50000.0, "Dead")).unwrap();
        }
    }
    
    model
}

fn benchmark_cantilever(c: &mut Criterion) {
    c.bench_function("cantilever_linear", |b| {
        b.iter(|| {
            let mut model = create_cantilever_model();
            model.analyze_linear().unwrap();
            black_box(&model);
        })
    });
}

fn benchmark_small_frame(c: &mut Criterion) {
    c.bench_function("frame_3story_2bay_linear", |b| {
        b.iter(|| {
            let mut model = create_multi_story_frame(3, 2);
            model.analyze_linear().unwrap();
            black_box(&model);
        })
    });
}

fn benchmark_medium_frame(c: &mut Criterion) {
    c.bench_function("frame_10story_5bay_linear", |b| {
        b.iter(|| {
            let mut model = create_multi_story_frame(10, 5);
            model.analyze_linear().unwrap();
            black_box(&model);
        })
    });
}

fn benchmark_pdelta(c: &mut Criterion) {
    c.bench_function("frame_5story_3bay_pdelta", |b| {
        b.iter(|| {
            let mut model = create_multi_story_frame(5, 3);
            model.analyze_p_delta().unwrap();
            black_box(&model);
        })
    });
}

criterion_group!(
    benches,
    benchmark_cantilever,
    benchmark_small_frame,
    benchmark_medium_frame,
    benchmark_pdelta,
);

criterion_main!(benches);
