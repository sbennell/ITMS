import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, DeletedItem } from '../../lib/api';

function changeLines(changes: DeletedItem['history'][number]['changes']): string[] {
  if (!changes?.before || !changes?.after) return [];

  return Object.keys(changes.after)
    .filter((field) => JSON.stringify(changes.before[field]) !== JSON.stringify(changes.after[field]))
    .map((field) => {
      if (field === 'devicePassword') return 'devicePassword: changed';
      return `${field}: ${changes.before[field] ?? '(empty)'} → ${changes.after[field] ?? '(empty)'}`;
    });
}

export default function DeletedItemsTab() {
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: items, isLoading, error } = useQuery({
    queryKey: ['deleted-items'],
    queryFn: api.getDeletedItems
  });

  if (isLoading) return <p className="text-sm text-gray-500">Loading...</p>;
  if (error) return <p className="text-sm text-red-600">{(error as Error).message}</p>;
  if (!items?.length) return <p className="text-sm text-gray-500">No deleted assets or software.</p>;

  return (
    <div className="card divide-y divide-gray-200">
      {items.map((item) => (
        <div key={item.id} className="p-4">
          <button
            onClick={() => setOpenId(openId === item.id ? null : item.id)}
            className="w-full flex flex-wrap items-center justify-between gap-2 text-left"
          >
            <span className="text-sm font-medium text-gray-900">
              {item.type} {item.itemNumber}
              {item.description && <span className="font-normal text-gray-500"> {item.description}</span>}
            </span>
            <span className="text-xs text-gray-500">
              Deleted by {item.deletedBy} on {new Date(item.deletedAt).toLocaleString()}
            </span>
          </button>

          {openId === item.id && (
            <ul className="mt-3 space-y-2">
              {item.history.map((entry, index) => (
                <li key={index} className="text-xs text-gray-600">
                  <span className="font-medium text-gray-800">{entry.action}</span>
                  {' '}by {entry.user} on {new Date(entry.timestamp).toLocaleString()}
                  {changeLines(entry.changes).map((line) => (
                    <div key={line} className="pl-4 break-words">{line}</div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
