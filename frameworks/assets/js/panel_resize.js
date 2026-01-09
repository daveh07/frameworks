/**
 * Panel Resize Functionality
 * iOS/GitHub style resizable panels with drag handles
 */

(function() {
    'use strict';
    
    let isResizing = false;
    let currentPanel = null;
    let startX = 0;
    let startWidth = 0;
    
    /**
     * Initialize resizable panels
     */
    function initResizablePanels() {
        // Find all right panels
        const panels = document.querySelectorAll('.right-panel, .analysis-panel');
        
        panels.forEach(panel => {
            // Create resize handle
            const handle = document.createElement('div');
            handle.className = 'panel-resize-handle';
            handle.style.cssText = `
                position: absolute;
                left: 0;
                top: 0;
                bottom: 0;
                width: 8px;
                cursor: col-resize;
                z-index: 102;
                background: transparent;
                transition: background 0.2s ease;
            `;
            
            // Add visual indicator on hover
            handle.addEventListener('mouseenter', () => {
                handle.style.background = 'rgba(0, 122, 255, 0.15)';
            });
            
            handle.addEventListener('mouseleave', () => {
                if (!isResizing) {
                    handle.style.background = 'transparent';
                }
            });
            
            // Mouse down - start resize
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isResizing = true;
                currentPanel = panel;
                startX = e.clientX;
                startWidth = panel.offsetWidth;
                
                // Add active state
                handle.style.background = 'rgba(0, 122, 255, 0.3)';
                panel.style.userSelect = 'none';
                panel.style.pointerEvents = 'none';
                document.body.style.cursor = 'col-resize';
                
                // Add overlay to prevent iframe interference
                const overlay = document.createElement('div');
                overlay.id = 'resize-overlay';
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 9999;
                    cursor: col-resize;
                `;
                document.body.appendChild(overlay);
            });
            
            // Prepend handle to panel
            panel.insertBefore(handle, panel.firstChild);
        });
        
        // Mouse move - resize panel
        document.addEventListener('mousemove', (e) => {
            if (!isResizing || !currentPanel) return;
            
            e.preventDefault();
            
            // Calculate new width (inverted because panel is on right)
            const deltaX = startX - e.clientX;
            let newWidth = startWidth + deltaX;
            
            // Apply constraints
            const minWidth = parseInt(getComputedStyle(currentPanel).minWidth) || 220;
            const maxWidth = parseInt(getComputedStyle(currentPanel).maxWidth) || 600;
            newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
            
            // Set new width
            currentPanel.style.width = `${newWidth}px`;
        });
        
        // Mouse up - end resize
        document.addEventListener('mouseup', () => {
            if (!isResizing) return;
            
            isResizing = false;
            document.body.style.cursor = '';
            
            if (currentPanel) {
                currentPanel.style.userSelect = '';
                currentPanel.style.pointerEvents = '';
                currentPanel = null;
            }
            
            // Remove overlay
            const overlay = document.getElementById('resize-overlay');
            if (overlay) {
                overlay.remove();
            }
            
            // Reset handle styles
            const handles = document.querySelectorAll('.panel-resize-handle');
            handles.forEach(h => {
                h.style.background = 'transparent';
            });
        });
    }
    
    /**
     * Initialize on DOM ready
     */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initResizablePanels);
    } else {
        initResizablePanels();
    }
    
    // Re-initialize when panels are dynamically added
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1 && 
                    (node.classList.contains('right-panel') || 
                     node.classList.contains('analysis-panel'))) {
                    initResizablePanels();
                }
            });
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
})();
