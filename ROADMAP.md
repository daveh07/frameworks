# Frameworkz MVP Roadmap

> **Goal:** Transform Frameworkz into a usable, reliable MVP/Beta structural analysis platform  
> **Timeline:** 8 Weeks  
> **Status:** Foundation Complete (~80%), Polish & UX Needed (~20%)

---

## Current State Assessment

### Completed Features

| Category | Features |
|----------|----------|
| **3D Visualization** | Three.js viewport, orbit controls, 2D/3D toggle, node/beam/plate creation, selection tools, copy/extrude |
| **Analysis Backend** | CalculiX integration, REST API, INP generation, DAT/FRD parsing |
| **Loading & Constraints** | Point loads, distributed loads, pressure loads, constraint symbols (Fixed/Pinned/Roller) |
| **Meshing** | Quad mesh, triangular (Delaunay), element selection, performance optimizations |
| **UX** | Keyboard shortcuts, SVG toolbar icons, multi-storey support, grid/axes toggles, undo |

### Critical Gaps

| Gap | Impact | Priority |
|-----|--------|----------|
| Save/Load Projects | Users lose work | **Critical** |
| Results Display Panel | Analysis runs but no clear output | **Critical** |
| Deformed Shape Viz | Code exists, not integrated | High |
| Stress Visualization | Partially implemented | High |
| Error Handling | Poor user feedback | Medium |
| User Onboarding | No tutorial/help | Medium |
| Documentation | No user guide | Medium |

---

## 8-Week Development Plan

### Phase 1: Core Stability (Weeks 1-2)

> **Goal:** Make existing features reliable and production-ready

#### Week 1: Results & Feedback

| Day | Task | Deliverables |
|-----|------|--------------|
| 1-2 | **Results Panel UI** | Expandable sidebar, max displacement/stress/reactions, element table, CSV export |
| 3-4 | **Error Handling** | Toast notifications, API error handling, loading spinners, pre-submit validation |
| 5 | **Deformed Shape** | Integrate existing code, scale factor slider (1x/10x/100x), original/deformed toggle |

#### Week 2: Save/Load System

| Day | Task | Deliverables |
|-----|------|--------------|
| 1-3 | **Browser Storage** | localStorage implementation, full project serialization, auto-save (2 min), recent projects |
| 4-5 | **Project Management** | Project name/metadata, delete confirmation, JSON export/import |

**Milestone:** Users can save work, see analysis results, and handle errors gracefully

---

### Phase 2: Professional Polish (Weeks 3-4)

> **Goal:** Visual polish and investor-ready presentation

#### Week 3: Visualization Enhancements

| Day | Task | Deliverables |
|-----|------|--------------|
| 1-2 | **Stress Visualization** | Von Mises color coding, stress legend (green→yellow→red), smooth gradients |
| 3-4 | **Enhanced Results** | Interactive results table, reaction force arrows, Chart.js for max values |
| 5 | **Labels & Annotations** | Toggleable node/element IDs, load magnitude labels, dimension lines |

#### Week 4: User Experience

| Day | Task | Deliverables |
|-----|------|--------------|
| 1-2 | **Onboarding** | Welcome modal, 5-step tutorial, help overlay, example projects |
| 3 | **Performance Dashboard** | Stats overlay, 5000+ element warning, analysis time display |
| 4-5 | **UI Refinements** | Consistent styling, panel animations, tooltips, hover states |

**Milestone:** Professional appearance, new users can learn quickly, impressive demos

---

### Phase 3: Analysis Features (Weeks 5-6)

> **Goal:** Expand structural analysis capabilities

#### Week 5: Analysis Options

| Day | Task | Deliverables |
|-----|------|--------------|
| 1-2 | **Load Combinations** | Dead/Live load factors, multiple load cases, envelope results |
| 3-4 | **Section Properties** | Beam section library (I-beam, channel, tube), section calculator, visual preview |
| 5 | **Advanced Constraints** | Elastic supports, partial fixity, improved constraint visuals |

#### Week 6: Multi-Material & Shells

| Day | Task | Deliverables |
|-----|------|--------------|
| 1-2 | **Shell Improvements** | Plate thickness variation, shell properties panel |
| 3-4 | **Multi-Material** | Per-element material assignment, material color coding |
| 5 | **Validation & Checks** | Stability check, floating node warning, duplicate detection |

**Milestone:** Full structural analysis workflow with professional capabilities

---

### Phase 4: Production Ready (Weeks 7-8)

> **Goal:** Testing, optimization, and launch

#### Week 7: Testing & Optimization

| Day | Task | Deliverables |
|-----|------|--------------|
| 1-2 | **Testing** | 10+ test structures, load combination tests, 10k+ element tests, cross-browser |
| 3-4 | **Performance** | Lazy loading, worker threads for meshing, memory optimization |
| 5 | **Bug Fixes** | Critical bug fixes, edge case handling, error message polish |

#### Week 8: Launch Preparation

| Day | Task | Deliverables |
|-----|------|--------------|
| 1-2 | **Documentation** | User guide with screenshots, video tutorials (3-5 min each), FAQ |
| 3 | **Landing Page** | Feature showcase, demo video, CTA buttons, contact form |
| 4 | **Deployment** | Production server, CalculiX service config, error monitoring, analytics |
| 5 | **Soft Launch** | Beta testing (10-20 engineers), feedback collection, critical issue fixes |

**Milestone:** MVP launched, beta users providing feedback

---

## Success Metrics

### Technical Metrics

| Metric | Target |
|--------|--------|
| Analysis Speed | 1000-element structure in < 10 seconds |
| Render Performance | 5000 mesh elements at 60 FPS |
| Save/Load Speed | < 2 seconds |
| Stability | Zero crashes in 1-hour session |

### User Metrics

| Metric | Target |
|--------|--------|
| Tutorial Completion | < 5 minutes |
| Simple Beam Analysis | < 2 minutes |
| Results Comprehension | No external help needed |
| Beta Testers | 10+ with feedback |

### Business Metrics

| Metric | Target |
|--------|--------|
| Landing Page | Clear value proposition |
| Demo Videos | 3+ showing capabilities |
| Early Access | Email capture system |
| Pricing Model | Defined (freemium/subscription) |

---

## Quick Wins (Immediate Impact)

### Priority 1 — 2-3 Hours
- [ ] Fix console errors
- [ ] Add loading spinner during analysis
- [ ] Display results in modal (temporary)
- [ ] Add basic localStorage "Save Project"

### Priority 2 — 4-6 Hours
- [ ] Create 3 example projects
- [ ] Simple results panel (max values)
- [ ] Polish toolbar spacing
- [ ] Add project name input

### Priority 3 — 1 Day
- [ ] Stress color visualization
- [ ] Export results to JSON/CSV
- [ ] Better error messages
- [ ] Logo and branding

---

## Monetization Strategy

### Freemium Model (USD)

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | 100 nodes, 50 elements, basic analysis | (TO BE REVIEWED)
| **Pro** | $39/month | Unlimited, load combinations, export reports |
| **Team (5-10)** | $149/month | Collaboration, cloud save, priority support |
| **Team (11 - 20) ** | $299/month | Collaboration, cloud save, priority support |
| **Enterprise** | Custom | On-premise, custom solvers, API access |

---

## Investor Demo Checklist (If this is a goal?)

### Must-Have for Demo

- [ ] **Visual Appeal** — Modern UI with smooth animations
- [ ] **Real-Time 3D** — Impressive interactive viewport ✅
- [ ] **Results Visualization** — Stress colors, deformed shapes
- [ ] **Save/Load** — Demonstrate data persistence
- [ ] **Example Gallery** — Pre-loaded impressive structures
- [ ] **Performance Stats** — Show it scales

### Key Talking Points

1. **Market Gap:** "Structural analysis tools are either too expensive ($5k+/year) or too basic (excel, )"
2. **Technology:** "WebAssembly + Three.js + Industrial-grade FEA solvers (CalculiX). Faster performance"
3. **Accessibility:** "Runs entirely in browser, no installation required"
4. **Scalability:** "Handles 10,000+ element structures with optimized rendering"
5. **Extensibility:** "Multiple FEA backends possible, easy to expand"

---

## Recommended Focus

BUSINESS LOGIC
| Timeframe | Focus | Outcome |
|-----------|-------|---------|
| **Week 1-2** | Results + Save/Load + Examples | Core functionality works |
| **Week 3-4** | Stress visualization + Tutorial + Polish | Demo-ready |
| **Week 5-6** | Advanced features + Testing | Professional tool |
| **Week 7-8** | Documentation + Deployment | Beta launch |

SOFTWARE LOGIC
| Timeframe | Focus | Outcome |
|-----------|-------|---------|
| **Week 1-2** | Webserver and Database Set up |
| **Week 3-4** | User authentication and data persistance |
| **Week 5-6** | Testing and Clearing out Issues |
| **Week 7-8** | Documentation + Deployment | Beta launch |

---

