import { useState } from 'react';
import StocktakeReviewTab from './reports/StocktakeReviewTab';
import WarrantyTab from './reports/WarrantyTab';
import ConditionTab from './reports/ConditionTab';
import ValueTab from './reports/ValueTab';
import LifecycleTab from './reports/LifecycleTab';

type TabId = 'stocktake' | 'warranty' | 'condition' | 'value' | 'lifecycle';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'stocktake', label: 'Stocktake Review' },
  { id: 'warranty', label: 'Warranty Expiry' },
  { id: 'condition', label: 'Fleet Health' },
  { id: 'value', label: 'Asset Value' },
  { id: 'lifecycle', label: 'Age & Lifecycle' }
];

const TabComponents: Record<TabId, React.ComponentType> = {
  stocktake: StocktakeReviewTab,
  warranty: WarrantyTab,
  condition: ConditionTab,
  value: ValueTab,
  lifecycle: LifecycleTab
};

export default function Reports() {
  const [activeTab, setActiveTab] = useState<TabId>('stocktake');

  const ActiveComponent = TabComponents[activeTab];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">
          Comprehensive asset management insights and analytics
        </p>
      </div>

      {/* Tab Navigation */}
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
