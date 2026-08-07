# Design System: SPARTA Ephor Dashboard

<!-- impeccable:design-schema 1 -->

## World

Government traffic management control center. Operate mode: data-dense monitoring and control interface for traffic operators working 24/7 shifts. Inspired by modern ATCS control rooms, Palantir Foundry, Datadog, and ArcGIS Dashboard - professional enterprise software with high information density and operational precision.

## Visual Language

**Mode:** Operate (task-focused monitoring and control interface)

**Atmosphere:** Professional, authoritative, precise, trustworthy. Light mode only for control room readability under varied ambient lighting. No decorative elements, no concept art, no AI-generated design artifacts.

**Cultural anchors:** Airport control towers, military command centers, industrial SCADA systems, enterprise monitoring dashboards, municipal government interfaces.

## Palette

### Core Colors (SPARTA Branding)
- Primary: Maroon `#8F1610` (brand, critical alerts, primary actions)
- Secondary: Gold `#E48E07` (AI recommendations, high-priority signals, active interventions)
- White: `#FFFFFF` (background, cards)
- Near Black: `#111827` (primary text, headers)

### Traffic Status Colors
- Red: `#DC2626` (severe congestion ≥80%, critical incidents)
- Orange: `#F97316` (heavy congestion 60-79%, warning)
- Yellow: `#EAB308` (moderate congestion 40-59%, caution)
- Green: `#16A34A` (light congestion 0-39%, normal flow)
- Blue: `#2563EB` (info, CCTV markers, reference lines)

### Interface Grays
- Gray 900: `#111827` (headers, important labels)
- Gray 700: `#374151` (body text)
- Gray 500: `#6B7280` (secondary text, labels)
- Gray 300: `#D1D5DB` (borders, dividers, disabled states)
- Gray 100: `#F3F4F6` (subtle backgrounds, card hovers)
- Gray 50: `#F9FAFB` (alternating row backgrounds)

## Typography

**Family:** Plus Jakarta Sans (sans-serif, variable font, pre-loaded in Next.js)
- Geometric-but-humanist grotesque, excellent legibility at dense UI sizes
- Slightly taller x-height and wider aperture than Inter for control-room viewing distances
- Weights used sparingly: hierarchy via weight and size steps, never a blanket 900

**Scale (rem):**
- Display: `2.5rem` (40px) - dashboard title
- Title: `1.75rem` (28px) - section headers
- Heading: `1.25rem` (20px) - panel titles, important metrics
- Subheading: `1rem` (16px) - subsection headers
- Body: `0.875rem` (14px) - primary interface text
- Small: `0.75rem` (12px) - labels, captions, fine print
- Micro: `0.625rem` (10px) - status badges, timestamps

**Weights:**
- Regular: 400 (body text)
- Medium: 500 (labels, secondary emphasis)
- Semibold: 600 (subheadings, panel titles, active states)
- Bold: 700 (page titles, critical alerts)

**Tracking:** Normal for body, tighter for UI text (0 to -0.02em), normal for headings

## Spacing

**Base unit:** 8px (0.5rem) - all spacing multiples of 8

**Spacing scale:**
- xs: 4px (0.25rem) - tight intra-component spacing
- sm: 8px (0.5rem) - form padding, button padding
- md: 16px (1rem) - standard component spacing
- lg: 24px (1.5rem) - section spacing, card padding
- xl: 32px (2rem) - major section separation
- 2xl: 48px (3rem) - page-level spacing

**Grid:** 12-column responsive grid with 24px (1.5rem) gutters

## Layout

**Dashboard Structure:**
1. Top Status Bar: 64px height - time, system status, notifications, user menu
2. Left Navigation: 256px width - navigation rail (collapsible)
3. Main Content Area: Flexible - primary dashboard grid
4. Map Area: Dominant center (66-75% of width) - interactive city map
5. Right Panels: 320-400px width - AI recommendations, Vanguard status
6. Bottom Analytics: Fixed or flexible - KPI cards, quick stats

**Responsive Behavior:**
- Desktop (≥ 1440px): Full layout with all panels
- Large Tablet (1024px - 1439px): Map area remains dominant, side panels resize
- Small Tablet (768px - 1023px): Navigation collapses, right panels move below map
- Mobile (≤ 767px): Single column, stacked panels

## Components

### Cards
- Background: `#FFFFFF`
- Border: `1px solid #E5E7EB` (subtle, not distracting)
- Corner Radius: 12px (consistent throughout)
- Shadow: `0 1px 3px rgba(0, 0, 0, 0.1)` (soft elevation)
- Padding: 24px (1.5rem)
- No decorative borders, gradients, or images

### Buttons
- Primary: `#8F1610` background, white text, rounded corners, 8px padding
- Secondary: Transparent with `#8F1610` border, `#8F1610` text
- Danger: `#DC2626` background, white text (for manual override)
- Success: `#16A34A` background, white text (for approval actions)
- Size: 36px height standard, 32px compact, 40px prominent

### Tables
- Header: `#F9FAFB` background, `#374151` text, medium weight
- Row: `#FFFFFF` alternating with `#F9FAFB` for readability
- Border: `1px solid #E5E7EB` horizontal dividers only
- Cell Padding: 12px vertical, 16px horizontal
- Compact mode for dense data: 8px padding, 0.75rem font

### Form Controls
- Input Height: 40px
- Border: `1px solid #D1D5DB`, `#8F1610` on focus
- Background: `#FFFFFF`
- Focus Ring: `0 0 0 2px rgba(143, 22, 16, 0.1)` (subtle)
- Label: `#374151`, 0.75rem, semibold
- Helper text: `#6B7280`, 0.75rem, normal

### Badges & Status Indicators
- Traffic Level Badges: Color-coded circles with percentage
- Status Badges: Capsule shape, 20px height, uppercase text
- Urgency Levels: Kritis (red), Tinggi (orange), Sedang (yellow), Normal (green)
- Confidence Indicators: Percentage with color intensity (70-100%: green, 50-69%: yellow, <50%: gray)

### Map Markers
- Traffic Node: Circle with color-coded fill (traffic level), white outline
- CCTV: Blue square with camera icon
- Emergency Vehicle: Ambulance/Police icon with progress trail
- Incident: Red triangle with exclamation
- ATCS Intersection: Yellow traffic light icon

## Interaction Patterns

### Data Visualization
- Charts: Minimal gridlines, clear data labels, no decoration
- Map: Google Maps quality styling, traffic heatmap overlay
- Progress: Linear bars with clear percentage and status
- Confidence: Animated pulse for live data updates

### State Management
- Loading: Skeleton screens, not spinners for content areas
- Empty States: Clear instruction on next action
- Error States: Human-readable problem and recovery steps
- Success States: Brief confirmation with next step suggestion

### Navigation
- Left Rail: Active state indicator (subtle highlight), clear hierarchy
- Breadcrumbs: For deep navigation within sections
- Tabs: For mode switching (Live/Prediction/Simulation)
- Modal: Only for critical decisions requiring full attention

### Accessibility
- Contrast Ratio: Minimum 4.5:1 for normal text, 3:1 for large text
- Focus Indicators: Clear visible outline for keyboard navigation
- Screen Reader: Semantic HTML structure, proper ARIA labels
- Motion: Respect user preference for reduced motion

## Iconography

**Source:** Lucide React - consistent stroke width (2px), standardized sizing

**Sizes:**
- Navigation: 20px
- Button: 16px
- Status: 14px
- Inline: 12px

**Color usage:**
- Primary: `#111827` (neutral)
- Active: `#8F1610` (brand)
- Alert: `#DC2626` (danger) or `#E48E07` (warning)
- Info: `#2563EB` (info)
- Disabled: `#D1D5DB` (gray)

## Motion

**Principles:**
- Purposeful only, no decorative animation
- Smooth transitions between states
- Respect user's reduced motion preference

**Durations:**
- Quick: 150ms (interactive feedback)
- Standard: 250ms (state changes)
- Deliberate: 350ms (major transitions)

**Easing:**
- Ease-out for most transitions (`cubic-bezier(0, 0, 0.2, 1)`)
- Linear for progress indicators

**Key Animations:**
- Live data pulse: 1s infinite pulse for real-time updates
- Map marker updates: Smooth position transitions
- Panel resizing: Fluid height/width changes
- Modal appearance: Fade + slight scale

## Implementation Notes

### Tailwind CSS Configuration
Extend default config with SPARTA color palette and custom spacing scale.

### Component Architecture
Build reusable, composable components following the design system. Use TypeScript for type safety.

### Performance
- Lazy load map components (Leaflet/React Leaflet)
- Virtualize long lists (AI recommendations, incident logs)
- Optimize image assets for dashboard
- Implement proper loading states

### Dark Mode
Explicitly disabled per requirements - control room environment uses light mode only for optimal visibility.

## Quality Standards

### Visual Consistency
- Every component must follow the defined token system
- No one-off colors, spacing, or typography
- Consistent interaction patterns across the application

### Government Standards
- WCAG 2.1 AA compliance required
- 24/7 operational reliability
- Clear error handling and recovery
- Audit trail for all interventions

### Real-world Usage
- Designed for 12+ hour shifts without visual fatigue
- Clear status visibility from 2-3 meter viewing distance
- Keyboard navigation for power users
- Efficient workflows for common tasks

## Prohibited Patterns

### Visual Treatments
- Dark mode (specifically excluded)
- Glassmorphism
- Neumorphism
- Large gradients
- Decorative shapes
- Neon effects
- Futuristic HUD displays
- Oversized icons
- Floating widgets
- AI concept art

### Interaction Patterns
- Auto-playing animations
- Decorative transitions
- Confetti or celebratory effects
- Unnecessary modal interruptions
- Hidden functionality

### Content Patterns
- Marketing language
- Exaggerated claims
- Unsubstantiated statistics
- Placeholder lorem ipsum (use realistic demo data)

## Assets & Content

### Required Content
- Surabaya city map with accurate road network
- ATCS intersection locations and identifiers
- CCTV camera locations
- Emergency vehicle types and jurisdictions
- Traffic level color coding legend

### Demo Data Standards
- Clearly labeled as demonstration data
- Realistic but not real traffic patterns
- Representative of Surabaya's road network
- Consistent time periods and locations

### Production Data Integration
- Real-time ATCS sensor data
- Live CCTV feeds (thumbnail + full screen)
- GPS-tracked emergency vehicles
- Historical traffic patterns
- Weather integration for context

## System Evolution

### Versioning
- Design tokens versioned with application releases
- Breaking visual changes require major version updates
- Minor updates maintain backward compatibility

### Documentation
- Keep DESIGN.md updated with system changes
- Component documentation in Storybook or equivalent
- Usage guidelines for new team members

### Testing
- Visual regression testing for components
- Accessibility testing for all interfaces
- Cross-browser testing (Chrome, Firefox, Safari)
- Performance testing for real-time updates

---
*This design system represents the production-ready government traffic management dashboard for SPARTA Ephor, implemented in React + Tailwind CSS.*
