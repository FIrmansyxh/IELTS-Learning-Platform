'use client';

import * as React from 'react';
import { ConfirmDialog } from '@/components/admin/dialogs';

/**
 * Konfirmasi sebelum menutup Sheet yang punya perubahan belum disimpan (design-system 5.4).
 * `requestClose` menutup langsung bila tidak ada perubahan; selain itu membuka dialog.
 */
export function useDiscardGuard(dirty: boolean, onClose: () => void, copy: { title: string; body: string; action: string }) {
  const [asking, setAsking] = React.useState(false);
  const requestClose = React.useCallback(() => {
    if (dirty) setAsking(true);
    else onClose();
  }, [dirty, onClose]);
  const dialog = (
    <ConfirmDialog
      open={asking}
      onOpenChange={setAsking}
      title={copy.title}
      body={copy.body}
      confirmLabel={copy.action}
      destructive
      onConfirm={() => {
        setAsking(false);
        onClose();
      }}
    />
  );
  return { requestClose, dialog };
}
