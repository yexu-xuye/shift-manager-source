import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import 'dayjs/locale/zh-cn';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/700.css';
import '@fontsource/google-sans/400.css';
import '@fontsource/google-sans/500.css';
import '@fontsource/google-sans/600.css';
import '@fontsource/google-sans/700.css';
import '@fontsource/noto-sans-sc/chinese-simplified-400.css';
import '@fontsource/noto-sans-sc/chinese-simplified-500.css';
import '@fontsource/noto-sans-sc/chinese-simplified-600.css';
import '@fontsource/noto-sans-sc/chinese-simplified-700.css';
import App from './App';
import { theme } from './styles/theme';
import { ToastProvider } from './components/common/Toast';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="zh-cn">
        <ToastProvider>
          <App />
        </ToastProvider>
      </LocalizationProvider>
    </ThemeProvider>
  </React.StrictMode>
);
