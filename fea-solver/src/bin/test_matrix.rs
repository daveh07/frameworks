use nalgebra::Matrix3;
use nalgebra::Vector3;

fn main() {
    // Test: Matrix3::new - is it row-major or column-major?
    let m = Matrix3::new(
        1.0, 2.0, 3.0,
        4.0, 5.0, 6.0,
        7.0, 8.0, 9.0,
    );
    println!("Matrix m created with Matrix3::new(1,2,3,4,5,6,7,8,9):");
    println!("{}", m);
    println!("m[(0,0)] = {} (expect 1)", m[(0,0)]);
    println!("m[(0,1)] = {} (expect 2 if row-major args)", m[(0,1)]);
    println!("m[(0,2)] = {} (expect 3 if row-major args)", m[(0,2)]);
    println!("m[(1,0)] = {} (expect 4 if row-major args)", m[(1,0)]);
    
    // Matrix * column vector test
    let v = Vector3::new(1.0, 0.0, 0.0);
    let result = m * v;
    println!("\nm * [1,0,0]^T = {:?}", result);
    println!("If row-major: first column [1,4,7]");
    println!("If treated as columns in constructor: first row [1,2,3]");
}
