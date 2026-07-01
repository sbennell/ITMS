import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { X, Printer, Download, Loader2, Settings } from 'lucide-react';
import { api, BatchPrintResult, LabelSettings } from '../lib/api';
import { printDymoLabel, TwinTurboRoll } from '../lib/dymoLabelPrinter';
import { useDymoPrinting } from '../hooks/useDymoPrinting';

interface BatchPrintModalProps {
  assetIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function BatchPrintModal({ assetIds, onClose, onSuccess }: BatchPrintModalProps) {
  const [showOptions, setShowOptions] = useState(false);
  const [labelOptions, setLabelOptions] = useState<Partial<LabelSettings>>({
    showAssignedTo: true,
    showHostname: true,
    showIpAddress: true,
  });

  // Load default settings
  const { data: defaultSettings } = useQuery({
    queryKey: ['labelSettings'],
    queryFn: api.getLabelSettings,
  });

  // Sync label options with default settings when loaded
  useEffect(() => {
    if (defaultSettings) {
      setLabelOptions({
        showAssignedTo: defaultSettings.showAssignedTo,
        showHostname: defaultSettings.showHostname,
        showIpAddress: defaultSettings.showIpAddress,
      });
    }
  }, [defaultSettings]);

  const printMutation = useMutation({
    mutationFn: () => api.printLabelsBatch(assetIds, 1, labelOptions),
    onSuccess: (result) => {
      if (result.success) {
        onSuccess();
        onClose();
      }
    },
  });

  const isDymo = defaultSettings?.labelType === 'dymo-1933081';
  const dymo = useDymoPrinting(isDymo);

  const dymoPrintMutation = useMutation({
    mutationFn: async (): Promise<BatchPrintResult> => {
      const { labels, notFound } = await api.getDymoLabelXmlBatch(assetIds, labelOptions);
      let printed = 0;
      let failed = notFound.length;
      const errors: string[] = [];
      if (notFound.length > 0) errors.push(`Assets not found: ${notFound.length}`);

      for (const label of labels) {
        try {
          await printDymoLabel(label.xml, dymo.selectedPrinter, 1, dymo.isTwinTurbo ? dymo.selectedRoll : undefined);
          printed++;
        } catch (error) {
          failed++;
          errors.push(`${label.itemNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return { success: failed === 0, printed, failed, errors: errors.length > 0 ? errors : undefined };
    },
    onSuccess: (result) => {
      if (result.success) {
        onSuccess();
        onClose();
      }
    },
  });

  const activeMutation = isDymo ? dymoPrintMutation : printMutation;

  const handleDownload = () => {
    const params = new URLSearchParams();
    params.set('assetIds', assetIds.join(','));
    if (labelOptions.showAssignedTo !== undefined) params.set('showAssignedTo', String(labelOptions.showAssignedTo));
    if (labelOptions.showHostname !== undefined) params.set('showHostname', String(labelOptions.showHostname));
    if (labelOptions.showIpAddress !== undefined) params.set('showIpAddress', String(labelOptions.showIpAddress));
    window.open(`/api/labels/download-batch?${params.toString()}`, '_blank');
  };

  const toggleOption = (key: keyof LabelSettings) => {
    setLabelOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Print {assetIds.length} Labels</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Label Options Toggle */}
          <button
            onClick={() => setShowOptions(!showOptions)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <Settings className="w-4 h-4" />
            Label Options
            <span className="text-xs text-gray-400">{showOptions ? '▲' : '▼'}</span>
          </button>

          {showOptions && (
            <div className="p-3 bg-gray-50 rounded-lg space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={labelOptions.showAssignedTo ?? true}
                  onChange={() => toggleOption('showAssignedTo')}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Show Assigned To</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={labelOptions.showHostname ?? true}
                  onChange={() => toggleOption('showHostname')}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Show Hostname</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={labelOptions.showIpAddress ?? true}
                  onChange={() => toggleOption('showIpAddress')}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Show IP Address</span>
              </label>
            </div>
          )}

          {/* DYMO printer selection - detected on this device */}
          {isDymo && dymo.available && (
            <div>
              <label className="label">DYMO Printer (this device)</label>
              <select
                value={dymo.selectedPrinter}
                onChange={(e) => dymo.setSelectedPrinter(e.target.value)}
                className="input"
              >
                {dymo.printers.length === 0 && <option value="">No DYMO printers found</option>}
                {dymo.printers.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          {isDymo && dymo.available && dymo.isTwinTurbo && (
            <div>
              <label className="label">Roll (Twin Turbo)</label>
              <select
                value={dymo.selectedRoll}
                onChange={(e) => dymo.setSelectedRoll(e.target.value as TwinTurboRoll)}
                className="input"
              >
                <option value="Auto">Auto</option>
                <option value="Left">Left</option>
                <option value="Right">Right</option>
              </select>
            </div>
          )}
          {isDymo && !dymo.checking && !dymo.available && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
              {dymo.reason || 'DYMO Label Software not detected on this device'} — use Download PDF instead.
            </div>
          )}

          {/* Error message */}
          {activeMutation.isError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {activeMutation.error instanceof Error ? activeMutation.error.message : 'Print failed'}
            </div>
          )}

          {/* Success message */}
          {activeMutation.isSuccess && activeMutation.data.success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">
              Printed {activeMutation.data.printed} labels
              {activeMutation.data.failed > 0 && `, ${activeMutation.data.failed} failed`}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between p-4 border-t bg-gray-50">
          <button
            onClick={handleDownload}
            className="btn btn-secondary"
          >
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            {isDymo && dymo.checking ? (
              <div className="text-sm text-gray-500 flex items-center px-3">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Checking for DYMO Label Software...
              </div>
            ) : isDymo && !dymo.available ? (
              <div className="text-sm text-gray-500 flex items-center px-3">
                Download only
              </div>
            ) : (
            <button
              onClick={() => activeMutation.mutate()}
              disabled={activeMutation.isPending || (isDymo && !dymo.selectedPrinter)}
              className="btn btn-primary"
            >
              {activeMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Printing...
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </>
              )}
            </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
