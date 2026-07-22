import { HelpCircle } from 'lucide-react';

export default function FieldLabel({
  text,
  help,
  required = false
}: {
  text: string;
  help?: string;
  required?: boolean;
}) {
  return (
    <label className="label inline-flex items-center gap-1">
      <span>
        {text}
        {required && ' *'}
      </span>
      {help && (
        <span title={help}>
          <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
        </span>
      )}
    </label>
  );
}
