import { useEffect, useState } from 'react';
import {
  checkDymoAvailable,
  DymoPrinterSummary,
  getLastDymoPrinter,
  getLastDymoRoll,
  listDymoPrinters,
  setLastDymoPrinter,
  setLastDymoRoll,
  TwinTurboRoll,
} from '../lib/dymoLabelPrinter';

/**
 * Detects DYMO Label Software running on the current device (browser-local, per
 * machine) and lists its printers. Only runs the detection while `enabled` is true,
 * so it's cheap to mount in modals that aren't currently showing a DYMO label.
 */
export function useDymoPrinting(enabled: boolean) {
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState(false);
  const [reason, setReason] = useState<string | undefined>();
  const [printers, setPrinters] = useState<DymoPrinterSummary[]>([]);
  const [selectedPrinter, setSelectedPrinterState] = useState('');
  const [selectedRoll, setSelectedRollState] = useState<TwinTurboRoll>('Auto');

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setChecking(true);

    (async () => {
      const result = await checkDymoAvailable();
      if (cancelled) return;
      setAvailable(result.available);
      setReason(result.reason);

      if (result.available) {
        const list = await listDymoPrinters();
        if (cancelled) return;
        setPrinters(list);
        const last = getLastDymoPrinter();
        setSelectedPrinterState(last && list.some((p) => p.name === last) ? last : (list[0]?.name || ''));
        setSelectedRollState(getLastDymoRoll());
      }

      setChecking(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const setSelectedPrinter = (name: string) => {
    setSelectedPrinterState(name);
    setLastDymoPrinter(name);
  };

  const setSelectedRoll = (roll: TwinTurboRoll) => {
    setSelectedRollState(roll);
    setLastDymoRoll(roll);
  };

  const isTwinTurbo = printers.find((p) => p.name === selectedPrinter)?.isTwinTurbo ?? false;

  return {
    checking,
    available,
    reason,
    printers,
    selectedPrinter,
    setSelectedPrinter,
    isTwinTurbo,
    selectedRoll,
    setSelectedRoll,
  };
}
