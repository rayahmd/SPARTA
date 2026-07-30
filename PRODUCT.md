# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Traffic control operators at the Surabaya Traffic Management Center (ATCS Surabaya). They monitor real-time traffic conditions across the city, review AI-generated predictions and recommendations, approve traffic signal timing adjustments, and coordinate emergency vehicle priority routing. Secondary users include traffic supervisors and city transportation officials reviewing analytics and system performance.

## Product Purpose

SPARTA (Smart Prediction and Analytics for Road Traffic Assistance) is a closed-loop predictive traffic management platform for Surabaya. It combines real-time traffic monitoring, AI-powered prediction models, digital twin simulation, and automated traffic signal control (ATCS integration) to reduce congestion and improve emergency response times. Success means operators can act on AI recommendations before congestion peaks, emergency vehicles reach incidents faster through automated green-wave routing, and the system accurately predicts traffic conditions 15-60 minutes ahead.

## Positioning

SPARTA is the only traffic management system in Indonesia that closes the prediction-to-action loop: AI predicts congestion, simulates interventions in a digital twin, recommends specific ATCS timing changes, and operators approve them directly from the dashboard. The prediction model (SPARTA-Athena) is trained on Surabaya's specific traffic patterns and validated against historical incident data.

## Operating Context

Operators work in a 24/7 traffic control room with multiple large displays showing the city map, CCTV feeds, and system status. The dashboard runs continuously on workstations, with operators switching between monitoring mode (scanning for predicted issues) and intervention mode (reviewing and approving AI recommendations). Critical workflows include: morning rush-hour monitoring, real-time incident response, AI recommendation review and approval, emergency vehicle coordination (SPARTA-Vanguard green-wave system), and end-of-shift handover reports.

## Capabilities and Constraints

**Confirmed capabilities:**
- Real-time traffic level monitoring at 200+ intersections (ATCS nodes)
- 15/30/60-minute traffic prediction with confidence scores
- Digital twin simulation of traffic signal timing changes
- AI recommendation engine (SPARTA-Athena v2.1, LSTM + Gaussian Process)
- Human-in-the-loop approval workflow for ATCS adjustments
- Emergency vehicle priority routing (SPARTA-Vanguard green-wave)
- CCTV integration for visual verification
- Live map with traffic heatmaps and incident markers
- Historical analytics and prediction accuracy tracking

**Constraints:**
- Requires ATCS system integration for signal control
- Human approval required for all traffic signal changes (safety-critical)
- Emergency vehicle location requires GPS integration
- CCTV access controlled by Dinas Perhubungan
- Must operate 24/7 with high reliability

**Terminology:**
- ATCS: Adaptive Traffic Control System (physical traffic signals)
- Node: Monitored intersection with traffic sensors
- Green Wave: Coordinated signal timing for emergency vehicle priority
- Digital Twin: Real-time simulation environment
- Confidence: AI prediction accuracy percentage
- Recommendation: AI-suggested ATCS timing adjustment

## Brand Commitments

**Name:** SPARTA (Smart Prediction and Analytics for Road Traffic Assistance)

**Sub-systems:**
- SPARTA-Athena: Prediction AI model
- SPARTA-Vanguard: Emergency vehicle priority system
- SPARTA Ephor: Operator dashboard (this interface)

**Colors:**
- Primary brand: Maroon #8F1610 (from SPARTA branding)
- Secondary: Gold #E48E07 (alert/recommendation accent)
- Must be recognizable as government/municipal software for Surabaya

**Identity:** Professional, authoritative government system. Not a consumer app or startup product. The interface represents the Surabaya Smart City Initiative and must convey trustworthiness, operational precision, and institutional seriousness.

## Evidence on Hand

Real system components deployed in Surabaya:
- 200+ ATCS-equipped intersections with live sensors
- Historical traffic data from 2024-2025
- CCTV network managed by Dinas Perhubungan
- GPS-tracked emergency vehicles from partner agencies
- Prediction model trained on Surabaya-specific patterns (RMSE 3.2%)

Demo data used for development and presentations.

## Product Principles

1. **Prediction must justify action.** Every AI recommendation shows the prediction, simulated outcome, and reasoning trace so operators understand why the system suggests intervention.

2. **Human authority over automation.** The system recommends; operators decide. All ATCS changes require explicit human approval. Emergency green-wave can be manually overridden.

3. **Clarity over cleverness.** Traffic operators work under time pressure during incidents. Information must be scannable, status immediately obvious, and critical alerts unmissable.

4. **Operate on truth, never fiction.** Demo mode and synthetic data must be clearly labeled. The system never invents traffic levels, incident reports, or prediction confidence.

5. **Built for 24/7 reliability.** The interface serves operators across day/night shifts in a control room environment. It must be readable under varied lighting, resilient to network issues, and maintain context across shift changes.

## Accessibility & Inclusion

Must meet WCAG 2.1 AA for government software. High contrast required for control room environment with varied ambient lighting. Keyboard navigation essential for operators managing multiple systems simultaneously. Text must remain legible on large displays viewed from 2-3 meters away during group coordination.
