'use client';

/**
 * Scanner status — now a thin re-export of the real socket-backed hook in
 * scanner-socket.ts (the Task 6 wiring landed; the contract below is the
 * one the header already consumed: { status, lastScanAt }).
 */
export { useScannerStatus } from './scanner-socket';
export type { ScannerStatus } from './scanner-socket';

import type { ScannerSnapshot } from './scanner-socket';
export type ScannerState = Pick<ScannerSnapshot, 'status' | 'lastScanAt'>;
