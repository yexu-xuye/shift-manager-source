import { ReactNode } from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface Props {
  children: ReactNode;
  open: boolean;
  onClose?: () => void;
  title?: string;
  maxWidth?: number | string;
  /** 可选：固定弹窗纸张高度，如 520 或 '80vh' */
  height?: number | string;
}

export default function ModalPortal({ children, open, onClose, title, maxWidth, height }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          ...(maxWidth !== undefined ? { width: maxWidth, maxWidth: 'calc(100% - 64px)' } : {}),
          ...(height !== undefined ? { height, maxHeight: 'calc(100% - 64px)' } : {}),
        },
      }}
    >
      {title && (
        <DialogTitle sx={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.04em', pb: 0 }}>
          {title}
          {onClose && (
            <IconButton onClick={onClose} size="small" sx={{ position: 'absolute', right: 16, top: 16 }}>
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>
      )}
      <DialogContent sx={maxWidth ? { maxWidth } : undefined}>
        {children}
      </DialogContent>
    </Dialog>
  );
}
