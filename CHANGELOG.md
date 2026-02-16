# Changelog

All notable changes to the IT Management System will be documented in this file.

## [1.8.0] - 2026-02-16

### Added

#### New Reports & Analytics
- **Warranty Expiry Report** — Track assets with expiring or expired warranties
  - Summary cards showing warranty status breakdown (No Warranty, Expired, Expiring Soon, OK)
  - Timeline chart showing warranty expirations by month
  - Filterable by expiration threshold (30/60/90/180/365 days), category, and location
  - Detailed asset table with warranty expiration dates and days until expiry

- **Fleet Health Report (Condition)** — Analyze asset condition across the fleet
  - Condition breakdown cards (New, Excellent, Good, Fair, Poor, Non-Functional)
  - Bar chart visualization of fleet condition distribution
  - Filterable by category and location
  - Color-coded condition status badges

- **Asset Value Report (Financial)** — Monitor fleet financial value
  - Summary metrics: Total fleet value, average cost, assets tracked, assets without price
  - Horizontal bar chart showing fleet value by category
  - Side-by-side breakdown tables (by location and by manufacturer)
  - Filterable by category, location, and manufacturer
  - Full asset table with purchase prices and acquisition dates

- **Age & Lifecycle Report** — Track asset age and end-of-life dates
  - Summary cards: Total assets, average age, EOL passed count, EOL upcoming count
  - Asset age distribution chart with age group buckets
  - End-of-life status tracking with color-coded badges
  - Filterable by EOL threshold (90/180/365/730 days), category, and location
  - Asset table with acquired date, age in years, EOL date, and days until EOL

#### UI/UX Improvements
- **Tabbed Reports Interface** — Refactored Reports page to support multiple report tabs
  - Single-page access to all reports (Stocktake Review, Warranty, Condition, Value, Lifecycle)
  - Smooth tab switching without page reloads
  - Consistent tab navigation design

#### Backend Enhancements
- Added 4 new API endpoints for advanced reporting:
  - `GET /api/reports/warranty` — Warranty expiration analytics
  - `GET /api/reports/condition` — Asset condition analytics
  - `GET /api/reports/value` — Financial asset value analytics
  - `GET /api/reports/lifecycle` — Asset age and lifecycle analytics

- All endpoints support filtering by category, location, and report-specific parameters
- Comprehensive aggregation and summary statistics for each report type

#### Dependencies
- Added `recharts` for advanced chart visualizations (bar, line, horizontal bar charts)

### Fixed
- Fixed read-only array sorting error in Condition tab chart rendering

### Technical Details
- New utility export: `CONDITION_COLORS` in utils.ts for consistent condition status styling
- All reports use TanStack Query for efficient data fetching and caching
- Responsive chart layouts with ResponsiveContainer from recharts
- Type-safe API responses with TypeScript interfaces

## [1.7.1] - 2025-12-19

### Fixed
- Updated install.ps1 PowerShell script

## [1.7.0] - 2025-12-19

### Added
- Rebranding to IT Management System

## [1.6.0] - 2025-12-18

### Added
- Initial Reports page with Stocktake Review Report
  - Summary cards for total assets, reviewed this year, overdue reviews
  - Bar chart showing reviews by year
  - Filterable asset table with review status and last review dates

## [1.0.0] - 2025-01-01

### Added
- Initial release of IT Asset Management System
- Asset tracking and inventory management
- Label printing with QR codes for Brother QL printers
- Stocktake/inventory audit functionality
- Import/export capabilities
- User authentication and role-based access control
- Comprehensive asset search and filtering
