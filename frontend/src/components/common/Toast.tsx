import { useState, useCallback, createContext, useContext, ReactNode } from 'react';
import { Snackbar, Alert, AlertColor } from '@mui/material';

interface ToastContextType { show: (msg: string, severity?: AlertColor) => void; }

const ToastContext = createContext<ToastContextType>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [severity, setSeverity] = useState<AlertColor>('success');

  const show = useCallback((m: string, s: AlertColor = 'success') => {
    setMsg(m); setSeverity(s); setOpen(true);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <Snackbar open={open} autoHideDuration={3000} onClose={() => setOpen(false)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity={severity} onClose={() => setOpen(false)} variant="filled" sx={{ width: '100%' }}>{msg}</Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast() { return useContext(ToastContext); }
