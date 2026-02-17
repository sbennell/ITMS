import { useState } from 'react';
import GeneralTab from './settings/GeneralTab';
import UsersTab from './settings/UsersTab';
import NetworkingTab from './settings/NetworkingTab';
import LookupsTab from './settings/LookupsTab';
import DataTab from './settings/DataTab';
import AccountTab from './settings/AccountTab';

type TabId = 'general' | 'users' | 'networking' | 'lookups' | 'data' | 'account';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'users', label: 'Users' },
  { id: 'networking', label: 'Networking' },
  { id: 'lookups', label: 'Lookups' },
  { id: 'data', label: 'Data' },
  { id: 'account', label: 'Account' }
];

const TabComponents: Record<TabId, React.ComponentType> = {
  general: GeneralTab,
  users: UsersTab,
  networking: NetworkingTab,
  lookups: LookupsTab,
  data: DataTab,
  account: AccountTab
};

export default function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const ActiveComponent = TabComponents[activeTab];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage organization, users, categories, manufacturers, suppliers, and locations
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
