"""
Test 3D frame in Pynite to understand moment conventions
Simple frame with beams in X and Z directions
"""
from Pynite import FEModel3D

# Create model
model = FEModel3D()

# Add material (steel-like properties)
E = 200e9  # Pa
G = 77e9   # Pa
nu = 0.3
rho = 7850  # kg/m³
model.add_material('Steel', E, G, nu, rho)

# Section properties for 300x500mm rectangular section
# Width = 0.3m (horizontal), Depth/Height = 0.5m (vertical)
b = 0.3  # width
h = 0.5  # height/depth
A = b * h
Iy = b * h**3 / 12  # Strong axis - bending in vertical plane
Iz = h * b**3 / 12  # Weak axis - bending in horizontal plane
J = 0.001  # Torsional constant (approximate)

print(f"Section: {b*1000}mm x {h*1000}mm")
print(f"A = {A:.6f} m²")
print(f"Iy = {Iy:.6f} m⁴ (strong axis, vertical bending)")
print(f"Iz = {Iz:.6f} m⁴ (weak axis, horizontal bending)")

# Add section using the new API
model.add_section('Rect300x500', A, Iy, Iz, J)

# Add nodes for a simple 3D frame
# Ground level nodes
model.add_node('N1', 0, 0, 0)      # Origin
model.add_node('N2', 8, 0, 0)      # Along X
model.add_node('N3', 0, 0, 7)      # Along Z
model.add_node('N4', 8, 0, 7)      # Corner XZ

# Top level nodes (3m height)
model.add_node('N5', 0, 3, 0)      # Above N1
model.add_node('N6', 8, 3, 0)      # Above N2
model.add_node('N7', 0, 3, 7)      # Above N3
model.add_node('N8', 8, 3, 7)      # Above N4

# Add columns (vertical members)
model.add_member('C1', 'N1', 'N5', 'Steel', 'Rect300x500')
model.add_member('C2', 'N2', 'N6', 'Steel', 'Rect300x500')
model.add_member('C3', 'N3', 'N7', 'Steel', 'Rect300x500')
model.add_member('C4', 'N4', 'N8', 'Steel', 'Rect300x500')

# Add beams along X direction (8m span)
model.add_member('BX1', 'N5', 'N6', 'Steel', 'Rect300x500')  # Front beam
model.add_member('BX2', 'N7', 'N8', 'Steel', 'Rect300x500')  # Back beam

# Add beams along Z direction (7m span)
model.add_member('BZ1', 'N5', 'N7', 'Steel', 'Rect300x500')  # Left beam
model.add_member('BZ2', 'N6', 'N8', 'Steel', 'Rect300x500')  # Right beam

# Add supports (fixed at base)
for node in ['N1', 'N2', 'N3', 'N4']:
    model.def_support(node, True, True, True, True, True, True)

# Add distributed load on beams (10 kN/m downward = -10000 N/m in Y)
model.add_member_dist_load('BX1', 'FY', -10000, -10000)
model.add_member_dist_load('BX2', 'FY', -10000, -10000)
model.add_member_dist_load('BZ1', 'FY', -10000, -10000)
model.add_member_dist_load('BZ2', 'FY', -10000, -10000)

# Analyze
model.analyze()

print("\n" + "="*80)
print("PYNITE RESULTS - 3D FRAME ANALYSIS")
print("="*80)

# Print member end forces
print("\n--- MEMBER END FORCES ---")
print("\nFormat: Member | Node | Axial | Shear_y | Shear_z | Torsion | Moment_y | Moment_z")
print("-" * 100)

members = ['C1', 'C2', 'C3', 'C4', 'BX1', 'BX2', 'BZ1', 'BZ2']

for member_name in members:
    member = model.members[member_name]
    
    # Get forces at i-node (start)
    axial_i = member.axial(0, 'Combo 1') / 1000  # kN
    shear_y_i = member.shear('Fy', 0, 'Combo 1') / 1000  # kN
    shear_z_i = member.shear('Fz', 0, 'Combo 1') / 1000  # kN
    torsion_i = member.torque(0, 'Combo 1') / 1000  # kN·m
    moment_y_i = member.moment('My', 0, 'Combo 1') / 1000  # kN·m
    moment_z_i = member.moment('Mz', 0, 'Combo 1') / 1000  # kN·m
    
    # Get forces at j-node (end)
    L = member.L()
    axial_j = member.axial(L, 'Combo 1') / 1000
    shear_y_j = member.shear('Fy', L, 'Combo 1') / 1000
    shear_z_j = member.shear('Fz', L, 'Combo 1') / 1000
    torsion_j = member.torque(L, 'Combo 1') / 1000
    moment_y_j = member.moment('My', L, 'Combo 1') / 1000
    moment_z_j = member.moment('Mz', L, 'Combo 1') / 1000
    
    print(f"\n{member_name} (i-node): Ax={axial_i:8.2f} Vy={shear_y_i:8.2f} Vz={shear_z_i:8.2f} T={torsion_i:8.2f} My={moment_y_i:8.2f} Mz={moment_z_i:8.2f}")
    print(f"{member_name} (j-node): Ax={axial_j:8.2f} Vy={shear_y_j:8.2f} Vz={shear_z_j:8.2f} T={torsion_j:8.2f} My={moment_y_j:8.2f} Mz={moment_z_j:8.2f}")

print("\n" + "="*80)
print("KEY OBSERVATIONS:")
print("="*80)
print("""
For horizontal beams with gravity load (FY = -10000 N/m):
- Bending occurs in the VERTICAL plane (XY plane for X-beams, YZ plane for Z-beams)
- This is bending about the LOCAL Z-axis (Mz) for the member
- Shear_y (Vy) is the associated shear force

Local axis convention in Pynite:
- Local x: along member axis (from i-node to j-node)
- Local y: perpendicular, typically in vertical plane with member
- Local z: perpendicular, horizontal for horizontal members

For VERTICAL columns:
- Local x: along member (upward typically)
- Local y: one horizontal direction  
- Local z: other horizontal direction

The key is understanding which moment component represents bending in which plane!
""")

# Print max moments for each beam
print("\n--- MAX MOMENTS IN BEAMS ---")
for member_name in ['BX1', 'BX2', 'BZ1', 'BZ2']:
    member = model.members[member_name]
    L = member.L()
    
    # Sample moments along length
    max_mz = 0
    max_my = 0
    for i in range(41):
        x = i * L / 40
        mz = member.moment('Mz', x, 'Combo 1') / 1000
        my = member.moment('My', x, 'Combo 1') / 1000
        if abs(mz) > abs(max_mz):
            max_mz = mz
        if abs(my) > abs(max_my):
            max_my = my
    
    print(f"{member_name}: Max Mz = {max_mz:8.2f} kNm, Max My = {max_my:8.2f} kNm, Length = {L:.1f}m")
