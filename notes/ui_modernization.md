# UI Modernization - iOS/GitHub Style

## Overview
Comprehensive UI/UX overhaul to modern iOS/GitHub aesthetic with resizable panels.

## Changes Made

### 1. Button Styles
All buttons updated to transparent-by-default with hover-only states:

#### Primary Buttons (Apply, Run Analysis)
- **Default**: Solid blue (`rgb(0, 122, 255)`) or green (`rgb(52, 199, 89)`)
- **Hover**: Darker shade with subtle lift (`translateY(-1px)`)
- **Shadow**: Soft shadow with color tint
- **Border Radius**: 6-8px (more rounded)
- **Font**: 13-14px, weight 500, letter-spacing -0.01em

#### Secondary Buttons (Clear, Close, Cancel)
- **Default**: Transparent background, subtle text color
- **Hover**: Light background (`rgba(0, 0, 0, 0.05)`)
- **Active**: Pressed state with no lift
- **Destructive buttons**: Red tint with border

#### Icon/Tool Buttons
- **Default**: Transparent, icon-only
- **Hover**: Light background circle/rounded
- **Transform**: Scale effect (1.05 on hover, 0.95 on click)

### 2. Panel Styling

#### Right Panels
- **Width**: 260px (down from 280px - less massive)
- **Min/Max**: 220px - 480px (resizable)
- **Background**: `rgba(248, 249, 250, 0.98)` with backdrop blur
- **Border**: `rgba(0, 0, 0, 0.08)` - very subtle
- **Shadow**: Softer, more diffused

#### Panel Headers
- **Padding**: 14px 16px (min-height: 44px for touch targets)
- **Background**: Transparent
- **Border**: Subtle `rgba(0, 0, 0, 0.06)`
- **Title**: 15px, weight 600, no uppercase

#### Panel Content
- **Scrollbar**: Custom webkit scrollbar styling
- **Track**: Transparent
- **Thumb**: `rgba(0, 0, 0, 0.15)`, rounded
- **Hover**: `rgba(0, 0, 0, 0.25)`

### 3. Form Inputs
- **Background**: `rgba(255, 255, 255, 0.8)`
- **Border**: `rgba(0, 0, 0, 0.12)`
- **Border Radius**: 6px
- **Focus**: Blue border with 3px glow ring
- **Font Size**: 13px

### 4. Resizable Panels

#### New Feature: Drag-to-Resize
Created `/frameworks/assets/js/panel_resize.js`:
- **Drag Handle**: 8px wide, left edge of panel
- **Visual Feedback**: Blue highlight on hover/drag
- **Constraints**: Respects min/max width
- **Smooth**: No iframe interference during resize

#### Implementation
- JavaScript-based resize (not CSS `resize`)
- Mutation observer for dynamic panels
- Overlay prevents iframe/canvas issues
- Visual indicator: `rgba(0, 122, 255, 0.15)` on hover

### 5. Analysis Panel
- **Run Button**: Green iOS-style (`rgb(52, 199, 89)`)
- **Diagram Buttons**: Transparent with left-slide hover
- **Control Labels**: Smaller, uppercase, subtle
- **Results Section**: Light blue tint background
- **Clear/Debug**: Transparent with hover states

### 6. Load Panels (Point/Distributed/Pressure)
- Matching header styles (transparent, 44px height)
- Apply buttons: iOS blue
- Close buttons: Transparent secondary style
- Modern form inputs with focus states

### 7. Color Palette

#### Primary Actions
- Blue: `rgb(0, 122, 255)` / `#007aff`
- Green: `rgb(52, 199, 89)` / `#34c759`

#### Text Colors
- Primary: `rgba(0, 0, 0, 0.85)`
- Secondary: `rgba(0, 0, 0, 0.65)`
- Tertiary: `rgba(0, 0, 0, 0.45)`

#### Backgrounds
- Panel: `rgba(248, 249, 250, 0.98)`
- Hover: `rgba(0, 0, 0, 0.05)`
- Active: `rgba(0, 0, 0, 0.08)`

#### Destructive
- Red: `rgb(220, 38, 38)` / `#dc2626`

### 8. Transitions & Animations
- **Timing**: `cubic-bezier(0.4, 0, 0.2, 1)` (iOS-like)
- **Duration**: 0.2s for most interactions
- **Transforms**: `translateY(-1px)` for lift effect
- **Scale**: 1.05 hover, 0.95 active

### 9. Typography
- **Headings**: 15px, weight 600, letter-spacing -0.01em
- **Body**: 13px, weight 500
- **Labels**: 11-12px, weight 500
- **No More**: UPPERCASE everywhere (only subtle hints)

### 10. Shadows
- **Buttons**: `0 1px 3px rgba(color, 0.2)` default
- **Button Hover**: `0 4px 12px rgba(color, 0.3)`
- **Panels**: `0 0 12px rgba(0, 0, 0, 0.06)`

## Files Modified

### CSS
- `/frameworks/assets/main.css`
  - Button styles (all variants)
  - Panel layouts
  - Form inputs
  - Scrollbars
  - Headers/footers
  - Colors and transitions

### JavaScript
- `/frameworks/assets/js/panel_resize.js` (NEW)
  - Drag-to-resize functionality
  - Visual feedback
  - Constraint handling

### HTML
- `/frameworks/index.html`
  - Added panel_resize.js script

## Design Principles Applied

1. **Hover-Only Backgrounds**: Buttons transparent until interaction
2. **Subtle Shadows**: Depth without distraction
3. **Generous Touch Targets**: 44px minimum height
4. **Consistent Spacing**: 8px, 12px, 16px system
5. **Color Hierarchy**: Blue primary, green success, red destructive
6. **Modern Borders**: Thin, subtle, rgba-based
7. **Smooth Motion**: Ease curves, subtle transforms
8. **Visual Feedback**: Every interaction has response

## Testing Checklist

- [ ] All buttons show hover states correctly
- [ ] Panel resize works smoothly
- [ ] Scrollbars styled in panels
- [ ] Focus states visible on inputs
- [ ] No background colors visible by default
- [ ] Transform animations smooth (no jank)
- [ ] Touch targets adequate (44px+)
- [ ] Colors match iOS/GitHub aesthetic

## Browser Compatibility

- Modern browsers with webkit scrollbar support
- Backdrop filter for blur effects
- CSS custom properties (variables)
- Flexbox layouts

## Performance Notes

- Transitions use GPU-accelerated properties (transform, opacity)
- Backdrop blur may impact performance on lower-end devices
- Mutation observer throttled to detect new panels only

## Future Enhancements

1. Dark mode support with CSS variables
2. Persist panel widths to localStorage
3. Keyboard shortcuts for panel operations
4. Accessibility improvements (ARIA labels)
5. Animation preferences (prefers-reduced-motion)
