import { useState } from 'react';
import WarrantyTab from './reports/WarrantyTab';
import FleetHealthTab from './reports/FleetHealthTab';
import ValueTab from './reports/ValueTab';
import LifecycleTab from './reports/LifecycleTab';
import StocktakeReviewTab from './reports/StocktakeReviewTab';

type TabId = 'warranty' | 'fleetHealth' | 'assetValue' | 'lifecycle' | 'stocktakeReview';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'warranty', label: 'Warranty Expiry' },
  { id: 'fleetHealth', label: 'Fleet Health' },
  { id: 'assetValue', label: 'Asset Value' },
  { id: 'lifecycle', label: 'Age & Lifecycle' },
  { id: 'stocktakeReview', label: 'Stocktake Review' }
];

const TabComponents: Record<TabId, React.ComponentType> = {
  warranty: WarrantyTab,
  fleetHealth: FleetHealthTab,
  assetValue: ValueTab,
  lifecycle: LifecycleTab,
  stocktakeReview: StocktakeReviewTab
};

export default function Reports() {
  const [activeTab, setActiveTab] = useState<TabId>('warranty');
  const ActiveComponent = TabComponents[activeTab];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">
          View asset warranty, condition, valuation, lifecycle, and stocktake review reports
        </p>
      </div>

      {/* Tab Bar */}
      <div className="bg-white border-b border-gray-200 rounded-t-lg">
        <div className="flex gap-1 p-4 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-b-lg p-6">
        <ActiveComponent />
      </div>
    </div>
  );
}
