import { useState, useCallback, type ReactNode } from 'react';

export interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  confirmStyle: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
}

const defaultState: ConfirmModalState = {
  isOpen: false,
  title: '',
  message: '',
  confirmLabel: 'Confirmer',
  cancelLabel: 'Annuler',
  confirmStyle: 'danger',
  onConfirm: () => {},
};

export function useConfirmModal() {
  const [confirmState, setConfirmState] = useState<ConfirmModalState>(defaultState);

  const showConfirm = useCallback((config: Partial<ConfirmModalState>) => {
    setConfirmState(prev => ({ ...prev, ...config, isOpen: true }));
  }, []);

  const hideConfirm = useCallback(() => {
    setConfirmState(prev => ({ ...prev, isOpen: false }));
  }, []);

  return { confirmState, showConfirm, hideConfirm } as const;
}
