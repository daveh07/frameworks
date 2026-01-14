//! Sparse matrix utilities for efficient FEA solves
//! 
//! FEA stiffness matrices are typically 95-99% sparse. Using sparse storage
//! and sparse solvers can provide 10-100x speedup over dense matrices.

use nalgebra::{DMatrix, DVector};
use nalgebra_sparse::{CooMatrix, CsrMatrix};

/// Sparse matrix builder using COO format
/// More efficient for incremental assembly
pub struct SparseMatrixBuilder {
    size: usize,
    entries: Vec<(usize, usize, f64)>,
}

impl SparseMatrixBuilder {
    /// Create a new sparse matrix builder
    pub fn new(size: usize) -> Self {
        // Pre-allocate for typical FEA connectivity
        // Estimate: 6 DOFs per node, ~10 connections per node = 360 entries per node
        let estimated_nnz = size * 60;
        Self {
            size,
            entries: Vec::with_capacity(estimated_nnz),
        }
    }

    /// Add a value to the matrix (accumulates if already exists)
    #[inline]
    pub fn add(&mut self, row: usize, col: usize, value: f64) {
        if value.abs() > 1e-15 {
            self.entries.push((row, col, value));
        }
    }

    /// Add a dense block to the sparse matrix
    #[inline]
    pub fn add_block(&mut self, row_start: usize, col_start: usize, block: &[[f64; 6]; 6]) {
        for i in 0..6 {
            for j in 0..6 {
                self.add(row_start + i, col_start + j, block[i][j]);
            }
        }
    }

    /// Add values from a small fixed-size matrix
    pub fn add_element_matrix<const N: usize>(
        &mut self,
        dofs: &[usize; N],
        k_elem: &[[f64; N]; N],
    ) {
        for (i, &di) in dofs.iter().enumerate() {
            for (j, &dj) in dofs.iter().enumerate() {
                self.add(di, dj, k_elem[i][j]);
            }
        }
    }

    /// Convert to CSR format for efficient solves
    pub fn to_csr(&self) -> CsrMatrix<f64> {
        let mut coo = CooMatrix::new(self.size, self.size);
        
        for &(row, col, val) in &self.entries {
            coo.push(row, col, val);
        }
        
        CsrMatrix::from(&coo)
    }

    /// Convert to dense matrix (for comparison/debugging)
    pub fn to_dense(&self) -> DMatrix<f64> {
        let mut mat = DMatrix::zeros(self.size, self.size);
        
        for &(row, col, val) in &self.entries {
            mat[(row, col)] += val;
        }
        
        mat
    }

    /// Get estimated non-zero count
    pub fn nnz(&self) -> usize {
        self.entries.len()
    }

    /// Get sparsity ratio
    pub fn sparsity(&self) -> f64 {
        let total = self.size * self.size;
        1.0 - (self.entries.len() as f64 / total as f64)
    }
}

/// Sparse Cholesky solver for symmetric positive definite matrices
/// 
/// Uses a custom implementation optimized for FEA problems where:
/// - Matrix is SPD (stiffness matrix)
/// - Matrix has banded structure
/// - We only need to solve once (no reuse of factorization)
pub struct SparseCholeskySolver {
    size: usize,
    // Skyline storage: for each column, store from diagonal to first non-zero
    skyline: Vec<Vec<f64>>,
    // Column heights (distance from diagonal to first non-zero above)
    heights: Vec<usize>,
}

impl SparseCholeskySolver {
    /// Create solver from CSR matrix
    pub fn new(csr: &CsrMatrix<f64>) -> Option<Self> {
        let size = csr.nrows();
        
        // Compute column heights (skyline profile)
        let mut heights = vec![0usize; size];
        for (row, col, _val) in csr.triplet_iter() {
            if col < row {
                let height = row - col;
                if height > heights[row] {
                    heights[row] = height;
                }
            }
        }
        
        // Allocate skyline storage
        let mut skyline: Vec<Vec<f64>> = Vec::with_capacity(size);
        for i in 0..size {
            skyline.push(vec![0.0; heights[i] + 1]);
        }
        
        // Copy values into skyline storage
        for (row, col, &val) in csr.triplet_iter() {
            if col >= row - heights[row] && col <= row {
                let idx = col - (row - heights[row]);
                skyline[row][idx] += val;
            }
        }
        
        // Perform Cholesky factorization in place
        Some(Self { size, skyline, heights })
    }

    /// Factorize the matrix (modified Cholesky for skyline storage)
    pub fn factorize(&mut self) -> Result<(), &'static str> {
        for i in 0..self.size {
            let hi = self.heights[i];
            let start_i = i - hi;
            
            // Compute L[i,j] for j < i
            for j in start_i..i {
                let hj = self.heights[j];
                let start_j = j - hj;
                
                // Compute dot product of partial rows
                let start = start_i.max(start_j);
                let mut sum = 0.0;
                
                for k in start..j {
                    let val_ik = self.get(i, k);
                    let val_jk = self.get(j, k);
                    sum += val_ik * val_jk;
                }
                
                let diag_j = self.skyline[j][hj];
                if diag_j.abs() < 1e-15 {
                    return Err("Zero pivot in Cholesky factorization");
                }
                
                let idx = j - start_i;
                self.skyline[i][idx] = (self.skyline[i][idx] - sum) / diag_j;
            }
            
            // Compute L[i,i] (diagonal)
            let mut sum = 0.0;
            for j in start_i..i {
                let val = self.get(i, j);
                sum += val * val;
            }
            
            let diag = self.skyline[i][hi] - sum;
            if diag <= 0.0 {
                return Err("Matrix not positive definite");
            }
            self.skyline[i][hi] = diag.sqrt();
        }
        
        Ok(())
    }

    #[inline]
    fn get(&self, row: usize, col: usize) -> f64 {
        if col > row {
            return self.get(col, row); // Symmetric
        }
        let h = self.heights[row];
        let start = row - h;
        if col < start {
            return 0.0;
        }
        self.skyline[row][col - start]
    }

    /// Solve L * L^T * x = b
    pub fn solve(&self, b: &DVector<f64>) -> DVector<f64> {
        let mut x = b.clone();
        
        // Forward substitution: L * y = b
        for i in 0..self.size {
            let hi = self.heights[i];
            let start = i - hi;
            
            let mut sum = 0.0;
            for j in start..i {
                sum += self.get(i, j) * x[j];
            }
            
            x[i] = (x[i] - sum) / self.get(i, i);
        }
        
        // Backward substitution: L^T * x = y
        for i in (0..self.size).rev() {
            x[i] /= self.get(i, i);
            
            let hi = self.heights[i];
            let start = i - hi;
            
            for j in start..i {
                x[j] -= self.get(i, j) * x[i];
            }
        }
        
        x
    }
}

/// Solve sparse linear system using Conjugate Gradient method
/// 
/// Best for large, well-conditioned systems. O(n * sqrt(κ) * nnz) complexity.
pub fn solve_cg(
    csr: &CsrMatrix<f64>,
    b: &DVector<f64>,
    tol: f64,
    max_iter: usize,
) -> Option<DVector<f64>> {
    let n = csr.nrows();
    let mut x = DVector::zeros(n);
    let mut r = b.clone();
    let mut p = r.clone();
    let mut r_dot_r = r.dot(&r);
    
    if r_dot_r.sqrt() < tol {
        return Some(x);
    }
    
    for _iter in 0..max_iter {
        // Ap = A * p (sparse matrix-vector multiply)
        let ap = sparse_matvec(csr, &p);
        
        let p_dot_ap = p.dot(&ap);
        if p_dot_ap.abs() < 1e-15 {
            return None; // Breakdown
        }
        
        let alpha = r_dot_r / p_dot_ap;
        
        // x = x + alpha * p
        x.axpy(alpha, &p, 1.0);
        
        // r = r - alpha * Ap
        r.axpy(-alpha, &ap, 1.0);
        
        let r_dot_r_new = r.dot(&r);
        
        if r_dot_r_new.sqrt() < tol {
            return Some(x);
        }
        
        let beta = r_dot_r_new / r_dot_r;
        r_dot_r = r_dot_r_new;
        
        // p = r + beta * p
        p = &r + beta * &p;
    }
    
    // Return best solution even if not converged
    Some(x)
}

/// Solve sparse linear system using Preconditioned Conjugate Gradient
/// 
/// Uses Jacobi (diagonal) preconditioner for simplicity
pub fn solve_pcg(
    csr: &CsrMatrix<f64>,
    b: &DVector<f64>,
    tol: f64,
    max_iter: usize,
) -> Option<DVector<f64>> {
    let n = csr.nrows();
    
    // Extract diagonal for Jacobi preconditioner
    let mut diag = DVector::zeros(n);
    for (row, col, &val) in csr.triplet_iter() {
        if row == col {
            diag[row] = val;
        }
    }
    
    // Check for zero diagonal
    for i in 0..n {
        if diag[i].abs() < 1e-15 {
            diag[i] = 1.0; // Fallback
        }
    }
    
    let mut x = DVector::zeros(n);
    let mut r = b.clone();
    
    // z = M^-1 * r (preconditioner application)
    let mut z = r.component_div(&diag);
    let mut p = z.clone();
    let mut r_dot_z = r.dot(&z);
    
    for _iter in 0..max_iter {
        let ap = sparse_matvec(csr, &p);
        let p_dot_ap = p.dot(&ap);
        
        if p_dot_ap.abs() < 1e-15 {
            return None;
        }
        
        let alpha = r_dot_z / p_dot_ap;
        
        x.axpy(alpha, &p, 1.0);
        r.axpy(-alpha, &ap, 1.0);
        
        let r_norm = r.norm();
        if r_norm < tol {
            return Some(x);
        }
        
        z = r.component_div(&diag);
        let r_dot_z_new = r.dot(&z);
        let beta = r_dot_z_new / r_dot_z;
        r_dot_z = r_dot_z_new;
        
        p = &z + beta * &p;
    }
    
    Some(x)
}

/// Sparse matrix-vector multiplication
#[inline]
fn sparse_matvec(csr: &CsrMatrix<f64>, x: &DVector<f64>) -> DVector<f64> {
    let n = csr.nrows();
    let mut y = DVector::zeros(n);
    
    let row_offsets = csr.row_offsets();
    let col_indices = csr.col_indices();
    let values = csr.values();
    
    for row in 0..n {
        let start = row_offsets[row];
        let end = row_offsets[row + 1];
        
        let mut sum = 0.0;
        for idx in start..end {
            sum += values[idx] * x[col_indices[idx]];
        }
        y[row] = sum;
    }
    
    y
}

/// Bandwidth reduction using Reverse Cuthill-McKee algorithm
/// 
/// Returns a permutation vector that reorders nodes to minimize bandwidth
pub fn reverse_cuthill_mckee(csr: &CsrMatrix<f64>) -> Vec<usize> {
    let n = csr.nrows();
    if n == 0 {
        return vec![];
    }
    
    // Build adjacency list
    let mut adj: Vec<Vec<usize>> = vec![Vec::new(); n];
    for (row, col, &val) in csr.triplet_iter() {
        if val.abs() > 1e-15 && row != col {
            adj[row].push(col);
        }
    }
    
    // Get degrees for sorting
    let degrees: Vec<usize> = adj.iter().map(|v| v.len()).collect();
    
    // Sort adjacencies by degree (for tie-breaking)
    for neighbors in &mut adj {
        neighbors.sort_by_key(|&i| degrees[i]);
    }
    
    // Find starting node (lowest degree peripheral node)
    let mut visited = vec![false; n];
    let mut result = Vec::with_capacity(n);
    let mut queue = std::collections::VecDeque::new();
    
    // Start from node with minimum degree
    let start = (0..n).min_by_key(|&i| degrees[i]).unwrap_or(0);
    
    queue.push_back(start);
    visited[start] = true;
    
    while let Some(node) = queue.pop_front() {
        result.push(node);
        
        for &neighbor in &adj[node] {
            if !visited[neighbor] {
                visited[neighbor] = true;
                queue.push_back(neighbor);
            }
        }
        
        // Handle disconnected components
        if queue.is_empty() && result.len() < n {
            for i in 0..n {
                if !visited[i] {
                    queue.push_back(i);
                    visited[i] = true;
                    break;
                }
            }
        }
    }
    
    // Reverse the ordering (Cuthill-McKee -> Reverse Cuthill-McKee)
    result.reverse();
    result
}

/// Apply permutation to reorder DOFs
pub fn apply_permutation<T: Clone>(vec: &[T], perm: &[usize]) -> Vec<T> {
    perm.iter().map(|&i| vec[i].clone()).collect()
}

/// Create inverse permutation
pub fn inverse_permutation(perm: &[usize]) -> Vec<usize> {
    let mut inv = vec![0; perm.len()];
    for (new_idx, &old_idx) in perm.iter().enumerate() {
        inv[old_idx] = new_idx;
    }
    inv
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sparse_builder() {
        let mut builder = SparseMatrixBuilder::new(4);
        builder.add(0, 0, 4.0);
        builder.add(0, 1, 1.0);
        builder.add(1, 0, 1.0);
        builder.add(1, 1, 3.0);
        builder.add(1, 2, 1.0);
        builder.add(2, 1, 1.0);
        builder.add(2, 2, 2.0);
        builder.add(3, 3, 1.0);
        
        let dense = builder.to_dense();
        assert!((dense[(0, 0)] - 4.0).abs() < 1e-10);
        assert!((dense[(1, 1)] - 3.0).abs() < 1e-10);
    }

    #[test]
    fn test_cg_solve() {
        // Simple 3x3 SPD system
        let mut builder = SparseMatrixBuilder::new(3);
        builder.add(0, 0, 4.0);
        builder.add(0, 1, -1.0);
        builder.add(1, 0, -1.0);
        builder.add(1, 1, 4.0);
        builder.add(1, 2, -1.0);
        builder.add(2, 1, -1.0);
        builder.add(2, 2, 4.0);
        
        let csr = builder.to_csr();
        let b = DVector::from_vec(vec![1.0, 2.0, 3.0]);
        
        let x = solve_pcg(&csr, &b, 1e-10, 100).unwrap();
        
        // Verify solution
        let ax = sparse_matvec(&csr, &x);
        let error = (&ax - &b).norm();
        assert!(error < 1e-8, "Error: {}", error);
    }
}
