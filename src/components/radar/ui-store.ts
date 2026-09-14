'use client';

/**
 * ui-store — tiny zustand store for cross-component UI state that doesn't
 * belong to any single view:
 *
 * - the create/edit-alert dialog: the hero CTA ("Create your first alert"),
 *   the alerts rail and the mobile sheet all open the SAME dialog instance,
 *   so "open" lives here instead of in props threaded through the tree;
 * - `alertsVersion`: bumped after any alert mutation so every alerts list
 *   (rail, match counts) refetches without a page reload.
 */
import { create } from 'zustand';

type UiState = {
  alertDialogOpen: boolean;
  /** Alert currently being edited (null = create mode). */
  editingAlertId: string | null;
  openAlertDialog: (alertId?: string) => void;
  closeAlertDialog: () => void;
  alertsVersion: number;
  bumpAlertsVersion: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  alertDialogOpen: false,
  editingAlertId: null,
  openAlertDialog: (alertId) =>
    set({ alertDialogOpen: true, editingAlertId: alertId ?? null }),
  closeAlertDialog: () => set({ alertDialogOpen: false, editingAlertId: null }),
  alertsVersion: 0,
  bumpAlertsVersion: () => set((s) => ({ alertsVersion: s.alertsVersion + 1 })),
}));
