import { createTheme } from '@mui/material/styles';
import type {} from '@mui/x-date-pickers/themeAugmentation';

// ============================================================
// 设计系统 — Google Gemini + Apple 极简融合
// ============================================================

const blue        = '#4285f4';
const blueHover   = '#3367d6';
const blueLight   = 'rgba(66,133,244,0.08)';
const green       = '#34c759';
const red         = '#ff3b30';
const orange      = '#ff9f0a';
const textPrimary = '#1d1d1f';
const textSec     = '#86868b';
const bgBase      = '#f5f5f7';
const panelBorder = 'rgba(15,23,42,0.06)';
const font        = '"Google Sans", "Noto Sans SC", sans-serif';
const fontTitle   = '"Noto Sans SC", sans-serif';
const shadowMd    = '0 12px 28px -10px rgba(0,0,0,0.08)';
const shadowSm    = '0 6px 16px -6px rgba(0,0,0,0.06)';
const focusRing   = '0 0 0 4px rgba(66,133,244,0.15)';
const spring      = 'cubic-bezier(0.25, 0.1, 0.25, 1)';

export const theme = createTheme({
  palette: {
    primary:   { main: blue, contrastText: '#ffffff' },
    secondary: { main: orange },
    error:     { main: red },
    success:   { main: green },
    warning:   { main: orange },
    text:      { primary: textPrimary, secondary: textSec },
    background: { default: bgBase, paper: 'rgba(255,255,255,0.65)' },
  },

  typography: {
    fontFamily: font,
    h1: { fontFamily: fontTitle, fontWeight: 700, fontSize: 'clamp(36px, 6vw, 56px)', lineHeight: 1.05, letterSpacing: '-0.04em' },
    h4: { fontFamily: fontTitle, fontWeight: 700, fontSize: '1.75rem', color: textPrimary },
    h6: { fontFamily: fontTitle, fontWeight: 600, fontSize: '1.1rem' },
    body2: { fontFamily: font, fontSize: '0.875rem' },
  },

  shape: { borderRadius: 16 },
  zIndex: { snackbar: 10000 },

  components: {

    // ================================================================
    // Button — Gemini 风格的胶囊按钮：无阴影、纯色、微悬停亮度变化
    // ================================================================
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 999,
          padding: '8px 22px',
          minHeight: 40,
          fontSize: 21,
          letterSpacing: '0',
          fontFamily: font,
          transition: `all 0.18s ${spring}`,
          '&:active': { transform: 'scale(0.98)' },
          '&.Mui-disabled': { opacity: 0.45 },
        },
        containedPrimary: {
          background: blue,
          color: '#fff',
          '&:hover': { background: blueHover },
        },
        containedSecondary: {
          background: orange,
          color: '#fff',
          '&:hover': { background: '#e08900' },
        },
        containedError: {
          background: red,
          color: '#fff',
          '&:hover': { background: '#d42a22' },
        },
        containedSuccess: {
          background: green,
          color: '#fff',
          '&:hover': { background: '#2db04e' },
        },
        containedWarning: {
          background: orange,
          color: '#fff',
          '&:hover': { background: '#e08900' },
        },
        outlined: {
          borderColor: 'rgba(0,0,0,0.12)',
          color: textPrimary,
          background: 'rgba(255,255,255,0.6)',
          '&:hover': {
            background: 'rgba(255,255,255,0.95)',
            borderColor: 'rgba(0,0,0,0.22)',
          },
        },
        sizeSmall: {
          minHeight: 32,
          padding: '5px 16px',
          fontSize: 17,
          borderRadius: 999,
        },
        outlinedPrimary: {
          color: blue,
          borderColor: blue,
          background: 'transparent',
          '&:hover': {
            background: blueLight,
            borderColor: blue,
          },
        },
        outlinedError: {
          color: red,
          borderColor: 'rgba(255,59,48,0.4)',
          '&:hover': {
            background: 'rgba(255,59,48,0.06)',
            borderColor: red,
          },
        },
        text: {
          color: textSec,
          '&:hover': { background: 'rgba(0,0,0,0.05)' },
        },
        textPrimary: {
          color: blue,
          '&:hover': { background: blueLight },
        },
      },
    },

    // ================================================================
    // IconButton
    // ================================================================
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: `all 0.15s ${spring}`,
          '&:hover': { background: 'rgba(0,0,0,0.05)' },
        },
      },
    },

    // ================================================================
    // Select — 干净白底输入框
    // ================================================================
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          background: '#ffffff',
          border: '1px solid rgba(0,0,0,0.1)',
          fontFamily: font,
          fontSize: 21,
          fontWeight: 500,
          color: textPrimary,
          minWidth: 200,
          height: 44,
          transition: `all 0.15s ease`,
          boxShadow: 'none',
          '& .MuiSelect-icon': {
            color: '#9ca3af',
            fontSize: 22,
          },
          '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
          '&:hover': {
            borderColor: 'rgba(0,0,0,0.2)',
          },
          '&.Mui-focused': {
            borderColor: blue,
            boxShadow: '0 0 0 3px rgba(66,133,244,0.1)',
          },
        },
      },
    },

    // ================================================================
    // Menu — 朴素附着式下拉
    // ================================================================
    MuiPopover: {
      defaultProps: {
        elevation: 0,
        marginThreshold: 0,
        disableScrollLock: true,
      },
      styleOverrides: {
        paper: {
          borderRadius: 4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
          marginTop: 1,
        },
      },
    },

    MuiMenu: {
      defaultProps: {
        elevation: 0,
        hideBackdrop: true,
        disableScrollLock: true,
      },
      styleOverrides: {
        paper: {
          borderRadius: 4,
          border: '1px solid #e0e0e0',
          boxShadow: 'none',
        },
        list: {
          paddingTop: 4,
          paddingBottom: 4,
        },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontFamily: font,
          fontWeight: 500,
          color: textPrimary,
          fontSize: 21,
          padding: '12px 20px',
          margin: 0,
          borderRadius: 0,
          minHeight: 44,
          '&:hover': {
            background: '#f5f5f5',
          },
          '&.Mui-selected': {
            fontWeight: 500,
            color: blue,
            background: '#ebf3fe',
            '&:hover': {
              background: '#dbe9fc',
            },
          },
        },
      },
    },

    // ================================================================
    // TextField / Input
    // ================================================================
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
            height: 44,
            background: '#ffffff',
            fontFamily: font,
            fontSize: 21,
            fontWeight: 500,
            border: `1px solid ${panelBorder}`,
            transition: `all 0.18s ${spring}`,
            '&:hover': {
              borderColor: 'rgba(66,133,244,0.2)',
              background: '#fafafa',
            },
            '&.Mui-focused': {
              borderColor: blue,
              boxShadow: focusRing,
              background: '#ffffff',
            },
          },
          '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
        },
      },
    },

    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontFamily: font,
          color: textSec,
          fontSize: 17,
          fontWeight: 600,
        },
      },
    },

    // ================================================================
    // Dialog — 更通透的弹窗，更大的间距
    // ================================================================
    MuiDialog: {
      defaultProps: {
        disableScrollLock: true,
      },
      styleOverrides: {
        paper: {
          borderRadius: 28,
          boxShadow: '0 32px 80px -16px rgba(0,0,0,0.12)',
          border: '1px solid rgba(15,23,42,0.06)',
          background: '#ffffff',
        },
      },
    },

    // ================================================================
    // DialogTitle / DialogContent — 统一模态框内边距（上下 42px，左右 36px）
    // ================================================================
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          padding: '24px 36px 0',
          fontFamily: fontTitle,
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '42px 36px',
        },
      },
    },

    // ================================================================
    // Autocomplete — 可搜索下拉
    // ================================================================
    MuiAutocomplete: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
            height: 44,
            background: '#ffffff',
            border: '1px solid rgba(0,0,0,0.1)',
            padding: '0 40px 0 12px !important',
            fontSize: 21,
            fontFamily: font,
            minHeight: 44,
            boxShadow: 'none',
            transition: 'all 0.15s ease',
            '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
            '&:hover': {
              borderColor: 'rgba(0,0,0,0.2)',
            },
            '&.Mui-focused': {
              borderColor: blue,
              boxShadow: '0 0 0 3px rgba(66,133,244,0.1)',
            },
          },
          '& .MuiAutocomplete-endAdornment': { right: '8px !important' },
        },
        paper: {
          background: '#ffffff',
          borderRadius: 12,
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        },
        listbox: {
          padding: '4px 0',
          '& .MuiAutocomplete-option': {
            fontFamily: font,
            fontSize: 18,
            fontWeight: 500,
            padding: '10px 18px',
            minHeight: 40,
            '&:hover': { background: '#f5f5f5' },
            '&.Mui-focused': { background: '#ebf3fe' },
          },
        },
      },
    },

    MuiBackdrop: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(0,0,0,0.2)',
        },
      },
    },

    // ================================================================
    // Chip
    // ================================================================
    MuiChip: {
      styleOverrides: {
        root: {
          fontFamily: font,
          borderRadius: 999,
          fontWeight: 600,
          fontSize: 16,
          height: 28,
          transition: `all 0.15s ${spring}`,
        },
        outlined: {
          borderColor: 'rgba(0,0,0,0.1)',
          color: textPrimary,
          '&:hover': { borderColor: 'rgba(0,0,0,0.18)', background: 'rgba(0,0,0,0.02)' },
        },
        colorPrimary: {
          background: blueLight,
          color: blue,
        },
        deleteIcon: {
          color: textSec,
          '&:hover': { color: red },
        },
      },
    },

    // ================================================================
    // Alert
    // ================================================================
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: '1px solid',
          fontFamily: font,
          fontSize: 21,
          fontWeight: 500,
        },
        standardError: {
          background: 'rgba(255,59,48,0.06)',
          borderColor: 'rgba(255,59,48,0.15)',
          color: red,
        },
        standardWarning: {
          background: 'rgba(255,159,10,0.06)',
          borderColor: 'rgba(255,159,10,0.15)',
          color: '#b85e00',
        },
        standardSuccess: {
          background: 'rgba(52,199,89,0.06)',
          borderColor: 'rgba(52,199,89,0.15)',
          color: green,
        },
        outlinedError: {
          borderColor: 'rgba(255,59,48,0.2)',
        },
      },
    },

    // ================================================================
    // Checkbox
    // ================================================================
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: 'rgba(0,0,0,0.2)',
          '&.Mui-checked': { color: blue },
        },
      },
    },

    // ================================================================
    // Table
    // ================================================================
    MuiTable: {
      styleOverrides: {
        root: {
          borderCollapse: 'collapse',
          fontSize: 21,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: '16px 24px',
          borderBottom: '1px solid rgba(15,23,42,0.08)',
          color: textPrimary,
          fontWeight: 500,
          fontSize: 21,
        },
        head: {
          fontFamily: font,
          padding: '18px 24px',
          fontWeight: 700,
          color: textSec,
          fontSize: 21,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          borderBottom: '1px solid rgba(15,23,42,0.14)',
          backgroundColor: 'rgba(15,23,42,0.02)',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            '& .MuiTableCell-body': {
              backgroundColor: blueLight,
            },
          },
        },
      },
    },

    // ================================================================
    // CssBaseline
    // ================================================================
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          fontFamily: font,
          color: textPrimary,
          background:
            'radial-gradient(ellipse 80% 60% at 20% 0%, rgba(66,133,244,0.12), transparent 45%), ' +
            'radial-gradient(ellipse 60% 50% at 80% 0%, rgba(52,199,89,0.08), transparent 45%), ' +
            'linear-gradient(180deg, #f8f8fc 0%, #edf0f5 100%)',
          minHeight: '100vh',
        },
      },
    },
  },
});
