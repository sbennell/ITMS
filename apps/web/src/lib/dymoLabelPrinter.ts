// Thin wrapper around DYMO's official `dymo.connect.framework.js` SDK (vendored at
// /vendor/dymo.connect.framework.js), which talks to DYMO Label Software's local web
// service on the user's own machine (127.0.0.1:41951). This must run in the browser —
// the backend server has no access to a printer attached to someone else's PC.

interface DymoPrinterInfo {
  name: string;
  printerType: string;
}

interface DymoCheckEnvironmentResult {
  isBrowserSupported: boolean;
  isFrameworkInstalled: boolean;
  isWebServicePresent: boolean;
}

interface DymoFramework {
  checkEnvironment(onSuccess: (result: DymoCheckEnvironmentResult) => void, onError?: (error: unknown) => void): void;
  getLabelWriterPrintersAsync(): Promise<DymoPrinterInfo[]>;
  createLabelWriterPrintParamsXml(params: { copies?: number; flowDirection?: string }): string;
  printLabelAsync(printerName: string, printParamsXml: string, labelXml: string, labelSetXml: string): Promise<void>;
}

declare global {
  interface Window {
    dymo?: { label: { framework: DymoFramework } };
  }
}

const SDK_URL = '/vendor/dymo.connect.framework.js';
const LAST_PRINTER_KEY = 'dymo.lastPrinterName';

let sdkLoadPromise: Promise<void> | null = null;

export function loadDymoSdk(): Promise<void> {
  if (window.dymo?.label?.framework) {
    return Promise.resolve();
  }
  if (!sdkLoadPromise) {
    sdkLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SDK_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load DYMO SDK script'));
      document.head.appendChild(script);
    });
  }
  return sdkLoadPromise;
}

export interface DymoAvailability {
  available: boolean;
  reason?: string;
}

export async function checkDymoAvailable(): Promise<DymoAvailability> {
  try {
    await loadDymoSdk();
  } catch {
    return { available: false, reason: 'Could not load the DYMO print component' };
  }

  const framework = window.dymo?.label?.framework;
  if (!framework) {
    return { available: false, reason: 'DYMO SDK failed to initialize' };
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ available: false, reason: 'DYMO Label Software did not respond (is it running?)' });
    }, 4000);

    try {
      framework.checkEnvironment((result) => {
        clearTimeout(timeout);
        if (!result.isFrameworkInstalled) {
          resolve({ available: false, reason: 'DYMO Label Software is not installed on this device' });
        } else if (!result.isWebServicePresent) {
          resolve({ available: false, reason: 'DYMO Label Software is installed but not running' });
        } else if (!result.isBrowserSupported) {
          resolve({ available: false, reason: 'This browser is not supported by DYMO Label Software' });
        } else {
          resolve({ available: true });
        }
      }, () => {
        clearTimeout(timeout);
        resolve({ available: false, reason: 'DYMO Label Software not detected on this device' });
      });
    } catch {
      clearTimeout(timeout);
      resolve({ available: false, reason: 'DYMO Label Software not detected on this device' });
    }
  });
}

export async function listDymoPrinters(): Promise<string[]> {
  const framework = window.dymo?.label?.framework;
  if (!framework) return [];
  const printers = await framework.getLabelWriterPrintersAsync();
  return printers.map((p) => p.name);
}

export async function printDymoLabel(xml: string, printerName: string, copies = 1): Promise<void> {
  const framework = window.dymo?.label?.framework;
  if (!framework) {
    throw new Error('DYMO SDK is not loaded');
  }
  const printParamsXml = framework.createLabelWriterPrintParamsXml({ copies, flowDirection: 'LeftToRight' });
  await framework.printLabelAsync(printerName, printParamsXml, xml, '');
}

export function getLastDymoPrinter(): string {
  return localStorage.getItem(LAST_PRINTER_KEY) || '';
}

export function setLastDymoPrinter(printerName: string): void {
  localStorage.setItem(LAST_PRINTER_KEY, printerName);
}
