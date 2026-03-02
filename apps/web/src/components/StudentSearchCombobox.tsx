import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, X } from 'lucide-react';
import { api, StudentSummary } from '../lib/api';

interface StudentSearchComboboxProps {
  value: Partial<StudentSummary> | null;
  onChange: (student: StudentSummary | null) => void;
  placeholder?: string;
}

export default function StudentSearchCombobox({
  value,
  onChange,
  placeholder = 'Search students...'
}: StudentSearchComboboxProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Search students (debounced via react-query)
  const { data: results = [] } = useQuery({
    queryKey: ['studentSearch', query],
    queryFn: () => (query.length >= 2 ? api.searchStudents(query) : Promise.resolve([])),
    enabled: query.length >= 2 && isOpen
  });

  useEffect(() => {
    setHighlightedIndex(0);
  }, [results]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % results.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + results.length) % results.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (results[highlightedIndex]) {
          selectStudent(results[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  const selectStudent = (student: StudentSummary) => {
    onChange(student);
    setQuery('');
    setIsOpen(false);
  };

  const clearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setQuery('');
  };

  const displayValue = value
    ? `${value.prefName || value.firstName} ${value.surname}`
    : '';

  return (
    <div className="relative">
      <div className="relative">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              placeholder={value ? '' : placeholder}
              value={value && !query ? displayValue : query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onBlur={() => setTimeout(() => setIsOpen(false), 200)}
              onKeyDown={handleKeyDown}
              className="input w-full pr-10"
            />
            <ChevronDown
              size={18}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
          </div>
          {value && (
            <button
              onClick={clearSelection}
              className="text-gray-400 hover:text-gray-600 p-1"
              type="button"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Dropdown List */}
        {isOpen && (
          <div
            ref={listRef}
            className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto"
          >
            {query.length < 2 ? (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">
                Type at least 2 characters to search
              </div>
            ) : results.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">
                No students found
              </div>
            ) : (
              results.map((student, index) => (
                <button
                  key={student.id}
                  onClick={() => selectStudent(student)}
                  className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                    index === highlightedIndex
                      ? 'bg-primary-50 text-primary-900'
                      : 'hover:bg-gray-50'
                  }`}
                  type="button"
                >
                  <div className="font-medium">
                    {student.prefName || student.firstName} {student.surname}
                  </div>
                  <div className="text-xs text-gray-500">
                    {student.schoolYear && `Year ${student.schoolYear}`}
                    {student.schoolYear && student.homeGroup && ' • '}
                    {student.homeGroup && student.homeGroup}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
