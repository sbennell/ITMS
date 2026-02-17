# Version History

All notable changes to the Asset Management System are documented in this file.

---

## [1.12.2] - 2026-02-18

### Fixed

- **Report Tables & IP Address Table Unresponsiveness**
  - Fixed critical performance issue where sorting and pagination caused UI freezing
  - **Root Cause**: Sorting was applied to paginated data (current page only) instead of the complete dataset
  - **Solution**: Pass all data to TanStack Table for sorting, then paginate the sorted results
  - **Impact**: All report tables and IP address browser now respond instantly to sort and pagination actions
  - **Affected Components**:
    - Stocktake Review Report
    - Warranty Expiry Report
    - Asset Value Report
    - Age & Lifecycle Report
    - Condition Report
    - IP Address Browser
  - **Bonus**: Sorting now automatically resets page to 1 for better UX

### Technical Details

- Modified sorting strategy to operate on complete dataset before pagination
- Added page reset (`setPage(1)`) in `onSortingChange` callback for all tables
- All tables now pass full data to TanStack `useReactTable()` instead of paginated slice
- Extracted sorted rows and then applied pagination for rendering

---

## [1.12.1] - 2026-02-18

### Fixed

- **TypeScript Build Errors in SubnetIPTable.tsx**
  - Removed unused `Link` import from react-router-dom (TS6133)
  - Fixed type errors by adding explicit type casts for `cell.getValue()` calls (TS2322)
  - Build now completes successfully with no TypeScript errors

---

## [1.12.0] - 2026-02-18

### Added

#### Interactive Table Features — Sorting & Pagination
- **Click-to-Sort Column Headers** — Make all report tables fully sortable
  - Click any column header to toggle ascending/descending sort
  - Visual indicators (chevron icons) show sort state for each column
  - Unsorted columns display dimmed chevron indicating they're clickable
  - Custom sorting logic for object-based columns (Category, Location, Manufacturer sort by name)

- **Client-Side Pagination** — Enhanced data table navigation
  - Configurable page sizes: 10, 25, 50, 100 items per page
  - Page navigation with Previous/Next buttons
  - Page indicator showing current position (e.g., "Page 1 of 17")
  - Automatic reset to page 1 when filters are applied
  - Applied to all 5 report tabs and IP address table

#### Reports Affected
- Stocktake Review Report — Click headers to sort, paginate through assets
- Warranty Expiry Report — Sort and navigate through warranty data
- Asset Value Report — Sort by price, category, location
- Age & Lifecycle Report — Sort by age, EOL status, acquisition date
- Condition Report — Sort by condition, status, category
- IP Address Table — Sort IPs, hostnames, status; paginate large subnets

### Changed

- **Table Interaction Model** — From static read-only to fully interactive
  - Headers are now clickable with visual feedback
  - Sorting state persists within page but resets with filter changes
  - Improved user experience for navigating large datasets

### Technical Details

- Uses TanStack Table v8 `getSortedRowModel` for efficient client-side sorting
- Implements React `useState` for sort state management (`SortingState`)
- Custom `sortingFn` added to object-based columns for proper alphabetical sorting
- All pagination logic client-side for immediate responsiveness

---

## [1.11.1] - 2026-02-17

### Fixed

- **TypeScript Build Error** — Removed unused `useMutation` import from DataTab.tsx
  - Fixed TS6133 error that prevented npm build from succeeding
  - Import was declared but never used in the component

- **Database Migration Timeout** — Fixed `prisma db push` hanging during installation
  - Added `--accept-data-loss` flag to enable non-interactive mode
  - Prevents timeout when migrating from single IP field to multi-IP AssetIP model
  - Updated both install.ps1 and update.ps1 scripts

---

## [1.11.0] - 2026-02-17

### Added

#### Settings Page Redesign with Tabbed Interface
- **Tabbed Settings Layout** — Reorganized settings into 6 focused tabs
  - **General Tab** — Organization name and label printing settings
  - **Users Tab** — User management (add, edit, delete, reset password)
  - **Networking Tab** — Network subnet management
  - **Lookups Tab** — Categories, Manufacturers, Suppliers, Locations
  - **Data Tab** — Data import/export functionality
  - **Account Tab** — Personal password change

- **Sidebar Navigation Improvements**
  - Settings link moved to top of user profile section (above username)
  - Navigation items reordered alphabetically (Assets, IP Addresses, Reports, Stocktake)
  - Cleaner, more organized user interface

### Changed

- **Settings Page Structure** — Refactored from single long page to tabbed interface
  - Easier navigation with clear section separation
  - Improved mobile responsiveness
  - Matches existing Reports page tab pattern
- **Sidebar Layout** — Settings link repositioned in user profile section for better discoverability

### Technical Details

- Settings components extracted into separate tab files (`settings/GeneralTab.tsx`, `settings/UsersTab.tsx`, etc.)
- Implemented tab state management using React hooks
- Tab styling matches existing design system (primary-50, primary-700 colors)
- Admin-only tabs (Users, Networking, Data) remain visible but content is protected

---

## [1.10.2] - 2026-02-17

### Added

#### Import/Export Date Fields
- **Last Review Date Support** — Import and export asset review dates
  - New column in Excel template: "Last Review Date"
  - Accepts standard date format (YYYY-MM-DD)
  - Automatically formatted in export files

- **Decommission Date Support** — Track asset decommissioning dates
  - New column in Excel template: "Decommission Date"
  - Accepts standard date format (YYYY-MM-DD)
  - Automatically formatted in export files

- **Enhanced Template Instructions**
  - Updated README tab with documentation for new date fields
  - Clear guidance on date format requirements
  - Expanded tips section for date field usage

### Changed

- **Import Template** — Two new date columns added to Excel template
- **Export Functionality** — All assets now export with Last Review Date and Decommission Date values
- **Column Mapping** — Enhanced import parser to recognize both new date fields

### Technical Details

- Date field handling uses existing `parseDate()` utility function
- Both new date columns formatted as yyyy-mm-dd in Excel
- Column mapping supports common header variations for flexibility
- Full backward compatibility with existing imports (new columns optional)
- Export includes all date fields from asset records

---

## [1.10.1] - 2026-02-17

### Added

#### Comprehensive Audit Logging for Asset Changes
- **IP Address Audit Logging** — All IP address changes now tracked in Recent Changes
  - Add IP address operations logged with before/after states
  - Update IP address operations logged with old/new values
  - Delete IP address operations logged showing removed IPs
  - IP labels included in audit log entries for clarity

- **Lookup Field Resolution** — Audit logs now show readable names for reference fields
  - Location IDs resolved to Location names
  - Category IDs resolved to Category names
  - Manufacturer IDs resolved to Manufacturer names
  - Supplier IDs resolved to Supplier names
  - Prevents confusing UUID display in Recent Changes

- **Password Audit Logging Improvements**
  - Password modifications now properly detected and logged
  - Masking strategy: Store actual passwords in audit log, mask on frontend display only
  - Fixes issue where password changes weren't appearing in Recent Changes
  - Frontend displays as `••••••••••` while maintaining backend integrity for change detection

#### Stocktake Enhancement
- **Extended Stocktake Eligibility** — Assets with awaiting statuses can now be included in stocktakes
  - Stocktake creation now includes assets with:
    - "Awaiting allocation" status
    - "Awaiting delivery" status
    - "Awaiting collection" status
  - In addition to regular "In Use" status assets
  - Allows inventory verification across all active asset statuses

### Fixed

- **Date Field False Positives in Audit Logs**
  - Fixed issue where date fields appeared as changed when they weren't
  - Root cause: Database returns Date objects, form sends date strings
  - Solution: Normalize all dates to YYYY-MM-DD format before comparison
  - Affected fields: Acquired Date, Warranty Expiration, Last Review Date

- **Password Modification Detection**
  - Fixed password modifications not appearing in Recent Changes
  - Previous issue: Both old and new passwords masked before storage (appeared identical)
  - Solution: Store actual passwords in audit log, mask only for display
  - Password changes now correctly detected by frontend

- **Empty Audit Log Entries**
  - Fixed duplicate empty UPDATE entries appearing in Recent Changes
  - Implementation: Smart comparison now only logs fields with actual changes

### Technical Details

- Audit logging enhanced with async lookup resolution for foreign keys
- Date normalization utility function handles both Date objects and ISO strings
- Password masking separated into display layer concern (frontend) vs data integrity concern (backend)
- Stocktake asset filter uses Prisma AND/OR logic for status combinations
- Build validates all type changes and dependencies

---

## [1.10.0] - 2026-02-17

### Added

#### Multi-IP Support Per Asset
- **Asset IP Management** — Each asset can now have multiple IP addresses across multiple subnets
  - Optional labels for each IP (e.g., "LAN", "WLAN", "Management")
  - Full CRUD operations for managing multiple IPs per asset
  - All IPs treated equally; first IP used for backward compatibility with labels and exports

- **Asset Edit Form IP Management**
  - **Add Additional IPs** — New form section to add IPs directly while editing an asset
  - IP Address input with optional Label field
  - Dynamic IP list showing all assigned IPs with their labels
  - Delete individual IPs with confirmation
  - Real-time query updates after IP changes

- **IP Address Display Improvements**
  - Clean display showing IP + label badge for each assigned IP
  - All IPs editable and manageable from the asset form
  - First IP in array used for backward compatibility (label generation, exports)

#### Import/Export Multi-IP Support
- **Enhanced Excel Template** — Support for importing/exporting up to 5 IPs per asset
  - `IP Address` + `IP Address Label` columns for primary IP
  - `IP Address 2-5` + corresponding Label columns for additional IPs
  - All IP labels preserved in round-trip import/export
  - Full backward compatibility with single-IP imports

- **Import Behavior**
  - All IPs created with their specified labels
  - First IP in list exported to "IP Address" column for consistency
  - Update mode: All IPs from import replace existing IPs

- **Export Behavior**
  - First IP exported to "IP Address" and "IP Address Label" columns
  - All additional IPs exported to "IP Address 2-5" columns with corresponding labels
  - Maintains consistent ordering for round-trip imports

#### Backend Enhancements
- New `AssetIP` Prisma model (join table) with fields:
  - `id` (UUID)
  - `assetId` (foreign key)
  - `ip` (string)
  - `label` (optional string)
  - `createdAt` / `updatedAt` timestamps

- New API endpoints in `/api/assets/:id/ips`:
  - `POST /assets/:id/ips` — Add IP to asset
  - `PUT /assets/:id/ips/:ipId` — Update IP entry (ip, label)
  - `DELETE /assets/:id/ips/:ipId` — Remove IP from asset

- Smart IP update logic:
  - Single IP field updates preserve other IPs (edit IP without losing others)
  - Multiple IP array updates trigger full replacement (import/form sync)
  - First IP in array used for label generation and backward compatibility

- Network IP Browser updated:
  - Queries `AssetIP` table instead of single IP field
  - Displays correct asset info for each IP in the range
  - Supports assets with IPs across multiple subnets

- Label Service updated:
  - Resolves primary IP from `ipAddresses` array
  - Maintains backward compatibility with label generation

#### Data Migration
- Automatic migration from single `ipAddress` field to `ipAddresses` array
- Existing single IPs converted to AssetIP entries (becomes first/primary IP in array)
- Zero data loss during migration

### Changed

- **AssetForm UI Refactor**
  - Removed single primary IP input field
  - All IPs now managed through unified "Add Additional IP Address" + "IP Addresses" list
  - Cleaner, more intuitive workflow
  - Labels displayed as badges for quick visual identification

- **API Response Format**
  - Assets now include `ipAddresses: AssetIPEntry[]` array
  - Single `ipAddress` field removed from Asset model
  - First IP in array (`ipAddresses[0]`) used for backward compatibility (labels, exports)

- **Import/Export Template**
  - New columns for IP labels (primary + additional)
  - Updated README with IP fields documentation
  - Enhanced tips section covering multi-IP scenarios

### Removed

- Single `ipAddress: String?` field from Asset model
- `isPrimary` field from AssetIP model — all IPs now treated equally
- "Primary" badge from AssetForm and AssetDetail IP displays
- Inline "Primary" indicator (replaced with label functionality)

### Technical Details

- Type-safe multi-IP handling with explicit label support
- Prisma relation queries optimized for asset IP lookups
- React hooks (useState) for form-based IP input management
- TanStack Query mutations for IP CRUD operations
- Full backward compatibility maintained where possible
- Column mapping enhanced for flexible Excel import headers

---

## [1.9.0] - 2026-02-16

### Added

#### IP Address Manager
- **Network Subnet Configuration** — New "Network Subnets" section in Settings (admin-only)
  - Add, edit, and delete network subnets with CIDR notation (e.g., `192.168.1.0/24`)
  - Subnet prefix validation: /20 to /32 (max 4094 host IPs per subnet to maintain performance)
  - Unique subnet names and CIDR addresses prevent duplicates
  - Clean, intuitive form-based management interface

- **IP Address Browser** — New "IP Addresses" sidebar navigation item
  - View all configured subnets as tabs
  - Interactive table showing every IP in a subnet with real-time status
  - Columns: IP Address, Hostname, Status, Asset, Actions
  - Status badges: "Linked" (green) for IPs with assigned assets, "Free" (gray) for unassigned IPs

- **Asset Linking & Discovery**
  - **Link to Asset**: Search modal with debounced input to find and link existing assets to free IPs
  - Shows matching asset details (Item Number, Model, Current IP if any) for quick identification
  - Warning if selected asset already has a different IP assigned
  - **Create Asset**: Direct link from free IPs to create new asset form with IP pre-filled
  - Real-time table updates after linking or unlinking assets

#### Hostname Display
- Dedicated **Hostname** column in IP table for easy network identification
- Shows linked asset's hostname if available, otherwise dash (—)
- Simplified Asset column now shows only item number (linked to asset detail)

#### Backend Enhancements
- New `Subnet` Prisma model with CIDR validation
- New `/api/network/subnets` endpoints:
  - `GET /subnets` — List all configured subnets
  - `POST /subnets` — Create subnet (admin-only)
  - `PUT /subnets/:id` — Update subnet (admin-only)
  - `DELETE /subnets/:id` — Delete subnet (admin-only)
  - `GET /subnets/:id/ips` — Get all IPs in subnet with asset associations

- **CIDR Processing**: Server-side IP range expansion with automatic host IP filtering
  - Excludes network and broadcast addresses automatically
  - Efficient SQLite `IN` queries for IP-asset correlation
  - Fast computation for even large subnets (tested up to /20 with 4094 IPs)

#### Asset Form Enhancement
- Asset creation form now accepts `?ip=<address>` query parameter
- IP field auto-populated when creating asset from IP manager "Create Asset" button
- Streamlines workflow for assigning IPs to new assets

### UI/UX Improvements
- Network icon added to sidebar navigation
- Clean tab interface for switching between subnets
- Consistent styling with rest of application (TailwindCSS, Lucide icons)
- Empty state messaging when no subnets configured

### Technical Details
- Type-safe CIDR validation using bitwise IP arithmetic (no external dependencies)
- TanStack Query for efficient data fetching and cache invalidation
- React Router integration for URL-driven state
- All components follow existing design patterns and conventions
- Database migration auto-applied on schema push

---

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

## [1.7.1] - 2026-02-15

### Bug Fixes

- **Label Printing in Service Mode**: Fixed "Failed to print label" error and printer margin issues
  - Replaced PowerShell-based printing (`Start-Process -Verb Print`) with native Windows printing API via `pdf-to-printer` library
  - Set explicit DK-22211 paper size (29x62mm) with "fit" scaling to use full label area
  - Removed SYSTEM user account option in installer; service now always runs as current logged-in user
  - SYSTEM user account lacks proper printer access and caused 16mm margins on printed labels
  - Service running as current user ensures consistent printer behavior between dev and production

### Installation Improvements

- **Service Account Configuration**: Updated `install.ps1` to configure service to run as current user
  - Prompts for user password during installation for secure service account setup
  - Ensures label printing works correctly with proper printer access
  - Eliminates printer margin issues that occurred with SYSTEM account

---

## [1.7.0] - 2026-02-15

### New Features

- **Bulk Edit Assets**: Select multiple assets from the list and edit shared fields at once
  - "Edit Selected (N)" button appears when assets are checked
  - Modal allows updating: Status, Condition, Category, Location, Decommission Date, and Comments
  - Only filled fields are applied (leave blank to skip)
  - Success/failure summary shows count of updated assets and any errors
  - Full audit logging with human-readable field names
- **Auto-Set Decommission Date**: When an asset status is changed to any "Decommissioned" variant, the Decommission Date is automatically set to today
  - Works in both individual asset editing and bulk edit modal
  - User can manually override the date if needed

### Improvements

- **Audit Log Display**: BULK_UPDATE actions now show detailed field changes
  - Lookup fields (Location, Category, Manufacturer, Supplier) display friendly names instead of raw IDs
  - Example: "Location: (empty) → Conference Room A" instead of UUID
  - Improved readability for tracking what actually changed

---

## [1.6.0] - 2026-02-15

### New Features

- **Bulk Add Assets**: New dedicated page for adding multiple assets at once
  - Enter serial numbers and assigned-to names as side-by-side lists (one per line)
  - Shared fields (manufacturer, model, category, purchase info, etc.) apply to all assets
  - Item numbers auto-generated sequentially
  - Results summary shows created count and any per-asset errors
  - Accessible via "Bulk Add" button on the asset list

### Bug Fixes

- **Update Status Detection**: Replaced `update.lock` file with Task Scheduler status check
  - Update status now determined by querying if `AssetSystemWebUpdate` task is running
  - Eliminates orphaned lock file issue where updates appeared stuck

---

## [1.5.0] - 2026-02-14

### New Features

- **Active Status Filter**: New default "Active" filter on the asset list excludes all Decommissioned assets
  - "All Statuses" option available to show everything including decommissioned
  - Individual status filters still available
- **Auto Item Number**: Item Number field is automatically prefilled with the next available number when creating a new asset
  - Scans all existing item numbers and suggests the next highest value
- **Adobe Reader Install**: Install script now installs Adobe Reader via Chocolatey
  - Required by `pdf-to-printer` for label printing on Windows

---

## [1.4.0] - 2026-02-14

### New Features

- **About Dialog**: Clicking version or update notification opens an About modal
  - Displays current version, changelog summary parsed from GitHub, and copyright info
  - Links to GitHub repository and full changelog
  - Admin users can trigger updates directly from the modal
  - Non-admin users see a link to GitHub releases

### Bug Fixes

- **Update Lock File**: Fixed `update.lock` not being deleted after web update completes
  - Lock file now removed before service restart to avoid script-on-disk changes from `git pull` corrupting the `finally` block
  - `finally` block retained as safety net for failure cases

### Changes

- Sidebar version text is replaced by "Update to vX.X.X" notification when an update is available
- Update confirmation moved from browser `confirm()` dialog to the About modal
- Removed hardcoded default credentials from install script; first login creates the admin account
- Updated README with one-line install command and link to manual install guide
- Updated MANUAL_INSTALL.md with Chocolatey NSSM install, web update instructions, and scheduled task setup

---

## [1.3.2] - 2026-02-14

### Bug Fixes

- **Web Update Process Fix**: Fixed update script being killed when NSSM stops the service
  - NSSM uses Windows Job Objects to kill the entire process tree when stopping the service
  - Update now runs via Windows Task Scheduler, fully independent of the NSSM service
  - Reuses existing `update.ps1` with new `-AutoUpdate` parameter (skips confirmation, logs to file)
  - Scheduled task created during installation via `install.ps1`
  - `update.ps1` try/finally block ensures service restart and lock file cleanup even on failure

---

## [1.3.1] - 2026-02-13

### Bug Fixes

- **Login Fix**: Fixed issue where users had to log in twice after application boot
  - Login now sets auth data directly in the query cache instead of relying on a background refetch
  - Eliminates race condition between navigation and auth status check
- **Web Update Fix**: Fixed 500 error when triggering update from web interface
  - Ensures logs directory is created automatically if it doesn't exist
  - Improved error messages for easier debugging

---

## [1.3.0] - 2026-02-13

### New Features

- **Web-Based Update**: Admins can trigger system updates directly from the web interface
  - "Update to v{x.y.z}" button appears in sidebar when a new version is detected
  - Shows full-page overlay with progress spinner during update
  - Automatically reloads the page when the update completes and service restarts
  - Backs up database, pulls code, rebuilds, and restarts service automatically
  - Update logs saved to server logs directory
  - Only available to admin users in production mode
- **Brother QL Printer Support**: Updated from QL-500 only to support all Brother QL printer models
  - Users select their specific printer model from the available printers list in Settings
  - Label format unchanged (DK-22211, 29mm continuous tape)
- **NSSM via Chocolatey**: Install script now uses `choco install nssm` instead of direct download from nssm.cc (more reliable)
- **dotenv Support**: Production server now loads `.env` file via dotenv as fallback for environment variables

### Changes

- Default printer name no longer hardcoded to "Brother QL-500" - users must select their printer
- Version bumped across all files (root package.json, README, useVersionCheck)

---

## [1.2.1] - 2025-02-11

### New Features

- **Version Update Check**: Automatically checks GitHub for newer versions
  - Compares current app version against latest in VERSION_HISTORY.md on GitHub
  - Shows animated notification badge in sidebar when an update is available
  - Links to GitHub releases page for easy download
  - Checks once per hour in the background
- **Version Link**: Version number in sidebar now links to VERSION_HISTORY.md on GitHub
- **Update Script**: Added `update.ps1` PowerShell script for one-command updates from GitHub
  - Checks for available updates before proceeding
  - Automatic database backup before updating
  - Pulls latest code, installs dependencies, rebuilds, and restarts service
  - Supports custom install path, branch selection, and skip options

---

## [1.2.0] - 2025-02-11

### Security Enhancement

- **Password Protection**: Device passwords on asset detail page now require account password verification before revealing
  - Click Eye icon next to masked password to trigger verification prompt
  - User must enter their own account password to confirm identity
  - Password is re-hidden when clicking the EyeOff icon
  - Added `/verify-password` API endpoint for secure password verification

---

## [1.1.1] - 2025-02-11

### Bug Fixes

- **Print Preview Modal**: Updated preview layout to match v1.1.0 label changes
  - Assigned To name now shown centered at top
  - QR code centered vertically in middle section
  - All text fields now display in bold
  - Layout accurately reflects printed label output

---

## [1.1.0] - 2025-02-11

### Label Printing Improvements

Enhanced label layout and text formatting for better readability.

#### Changes
- **Assigned To Name**: Now centered at top of label with auto-fit sizing (14pt max, 7pt min)
- **Item Number**: Bold text at 9pt
- **Model**: Auto-fit to available width (8pt max, 5pt min) - no truncation
- **All Label Text**: Now uses bold font throughout
- **Organization Name**: Auto-fit to fill label width (14pt max, 6pt min)
- **QR Code**: Centered vertically on full label height
- **Text Spacing**: Increased gap between QR code and text fields

#### Layout
```
┌─────────────────────────────────────────┐
│         Assigned To Name (centered)     │
│ [QR]  Item: 1234                        │
│ [QR]  Manufacturer Model                │
│ [QR]  S/N: ABC123                       │
│ [QR]  hostname                          │
│ [QR]  192.168.1.100                     │
├─────────────────────────────────────────┤
│      Organization Name (centered)       │
└─────────────────────────────────────────┘
```

---

## [1.0.0] - 2025-02-11

### Initial Release

First production release of the Asset Management System.

### Features

#### Asset Management
- Create, read, update, and delete IT assets
- Track item numbers, serial numbers, models, and manufacturers
- Store hostname, IP address, MAC addresses, and device credentials
- Assign assets to users and locations
- Track asset status (In Use, In Storage, Retired, etc.)
- Track asset condition (Excellent, Good, Fair, Poor)
- Record purchase information (price, supplier, order number)
- Set warranty and end-of-life dates
- View complete audit history for each asset

#### Label Printing
- Generate QR code labels for asset identification
- Direct printing to Brother QL label printers (DK-22211 29mm tape)
- Print single labels from asset detail page
- Batch print labels for multiple assets
- Download labels as PDF for manual printing
- Configurable label content (Assigned To, Hostname, IP Address)
- Organization name displayed on all labels

#### Stocktake
- Create stocktake sessions for inventory audits
- Filter stocktake by category or location
- Quick verify assets by scanning QR codes
- Track verification progress in real-time
- Update asset condition during stocktake
- Add notes to verified assets
- Complete or cancel stocktake sessions

#### Data Management
- Import assets from Excel (.xlsx) or CSV files
- Export all assets to Excel
- Download import template with correct format
- Configurable page sizes (50, 100, 200, 500, 1000, All)
- Search across all asset fields
- Filter by status, category, manufacturer, or location
- Sort by any column with natural number ordering

#### Lookup Tables
- Categories - Organize assets by type
- Manufacturers - Track device manufacturers
- Locations - Define physical locations
- Suppliers - Manage vendor information

#### User Management
- Secure authentication with session management
- Role-based access control (Admin, User)
- Admin can create, edit, and disable users
- Password change functionality
- Secure password hashing with bcrypt

#### Settings
- Configure organization name for labels
- Select default label printer
- Set default label field visibility

### Technical Stack
- Frontend: React 18, TypeScript, Vite, TailwindCSS
- Backend: Node.js, Express, TypeScript, Prisma
- Database: SQLite
- Label Generation: pdf-lib, bwip-js, pdf-to-printer

---

## Future Versions

_Planned features and improvements will be documented here as they are released._
