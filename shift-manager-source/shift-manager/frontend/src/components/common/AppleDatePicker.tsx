import { useState, useCallback } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { Dialog, Button, Typography } from '@mui/material';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { PickersDay, PickersDayProps } from '@mui/x-date-pickers/PickersDay';

interface Props {
  value: Dayjs | null;
  onChange: (d: Dayjs | null) => void;
  shouldDisableDate?: (d: Dayjs) => boolean;
  fullWidth?: boolean;
  /** "今天" 的标注（周日限制时用"本周日"） */
  todayLabel?: string;
  /** 第二个快捷按钮的标注（周日限制时用"下周日"） */
  nextLabel?: string;
  /** 第二个快捷按钮取什么日期（默认下一个周一） */
  nextDate?: () => Dayjs;
  /** 隐藏第二个快捷按钮（如值班系统只保留"本周日"） */
  hideNext?: boolean;
}

/**
 * 旧版日历弹窗 — 完全复刻旧版布局和样式
 *
 * 交互逻辑（与 backup/schedule.js 一致）:
 *   - 点击日期 / 快捷按钮 → 只更新弹窗内部预览，不对外通知
 *   - 点击"确定" → 提交选择到外部 onChange
 *   - 点击"取消"/关闭 → 丢弃内部选择
 *
 * 布局结构（从上到下垂直流式）:
 *   ┌──────────────────────────────────┐
 *   │   [‹]      2026年6月       [›]    │
 *   ├──────────────────────────────────┤
 *   │   一   二   三   四   五   六   日 │
 *   │   1    2    3    4    5    6    7  │
 *   │   ...                            │
 *   ├──────────────────────────────────┤
 *   │ [今天]          [下周一]           │
 *   │ 已选择                           │
 *   │ 2026年6月15日                    │
 *   │ [确定]              [取消]        │
 *   └──────────────────────────────────┘
 *
 * 技术方案: MUI Dialog + MUI DateCalendar = 完全控制布局
 */
export default function AppleDatePicker({
  value,
  onChange,
  shouldDisableDate,
  fullWidth = true,
  todayLabel = '今天',
  nextLabel = '下周一',
  nextDate,
  hideNext = false,
}: Props) {
  const [open, setOpen] = useState(false);
  // pending: 弹窗内部暂存的选择（只有点"确定"才提交）
  const [pending, setPending] = useState<Dayjs | null>(null);
  // viewDate 控制当前显示的月份
  const [viewDate, setViewDate] = useState<Dayjs>(() =>
    (value ?? dayjs()).startOf('month')
  );

  // 打开弹窗：同步 pending 到外部 value，重置 viewDate
  const handleOpen = useCallback(() => {
    setPending(value);
    setViewDate((value ?? dayjs()).startOf('month'));
    setOpen(true);
  }, [value]);

  // 关闭（不提交）
  const handleClose = () => setOpen(false);

  // 确定：提交 pending 到外部
  const handleAccept = () => {
    onChange(pending);
    setOpen(false);
  };

  // 取消：丢弃 pending，关闭
  const handleCancel = () => setOpen(false);

  // 月份导航
  const goPrevMonth = () => setViewDate((d) => d.subtract(1, 'month'));
  const goNextMonth = () => setViewDate((d) => d.add(1, 'month'));

  // 快捷按钮：今天 / 本周日
  const handleToday = () => {
    const t = dayjs();
    if (shouldDisableDate && shouldDisableDate(t)) {
      setPending(t.day() === 0 ? t : t.add(7 - t.day(), 'day'));
    } else {
      setPending(t);
    }
    setViewDate(t.startOf('month'));
  };

  // 快捷按钮：下周一 / 下周日（旧版算法：周日+1，其余+(8-周几)）
  const handleNext = () => {
    let d: Dayjs;
    if (nextDate) {
      d = nextDate();
    } else {
      const t = dayjs();
      const dow = t.day(); // 0=周日
      d = t.add(dow === 0 ? 1 : (8 - dow), 'day');
    }
    setPending(d);
    setViewDate(d.startOf('month'));
  };

  /* ── 自定义日期单元格 ── */
  const CustomDay = (props: PickersDayProps<Dayjs>) => {
    const { day } = props;
    return (
      <PickersDay
        {...props}
        sx={{
          height: 40,
          fontSize: 15,
          fontWeight: 400,
          borderRadius: '8px',
          color: day.day() === 0 ? '#ff6b6b' : '#333',
          '&.Mui-selected': {
            background: '#667eea !important', color: '#fff !important',
            fontWeight: 600, boxShadow: '0 2px 8px rgba(102,126,234,0.3)',
          },
          '&.MuiPickersDay-today:not(.Mui-selected)': {
            background: '#f0f3ff !important', color: '#667eea !important',
            fontWeight: 600, border: 'none !important',
          },
          '&:hover:not(.Mui-selected):not(.MuiPickersDay-today)': {
            background: 'rgba(66,133,244,0.08) !important', color: '#4285f4 !important',
            transform: 'translateY(-1px)', boxShadow: '0 8px 18px rgba(66,133,244,0.14)',
            transition: 'all 0.2s',
          },
        }}
      />
    );
  };

  /* ============================================================
   * 渲染
   * ============================================================ */
  return (
    <>
      {/* 触发器 — 显示外部已提交的值 */}
      <button style={triggerStyle} onClick={handleOpen}>
        {value ? value.format('YYYY年M月D日') : '选择日期'}
      </button>

      {/* 弹窗 */}
      <Dialog open={open} onClose={handleClose}
        PaperProps={{ sx: dialogPaperSx }}
      >
        <div style={containerStyle}>
          {/* ═══ 1. 月份导航栏 ═══ */}
          <div className="calendar-head" style={headStyle}>
            <button className="modern-calendar-nav" style={navBtnStyle} onClick={goPrevMonth}>‹</button>
            <h4 id="date-picker-month" style={monthTitleStyle}>
              {viewDate.format('YYYY年M月')}
            </h4>
            <button className="modern-calendar-nav" style={navBtnStyle} onClick={goNextMonth}>›</button>
          </div>

          {/* ═══ 2. 日历主体 ═══ */}
          <DateCalendar
            key={viewDate.format('YYYY-MM')}
            value={pending && pending.startOf('month').isSame(viewDate.startOf('month')) ? pending : null}
            onChange={(d) => setPending(d)}
            referenceDate={viewDate}
            shouldDisableDate={shouldDisableDate}
            slots={{ day: CustomDay }}
            sx={calendarSx}
          />

          {/* ═══ 3. 底部区域 ═══ */}
          <div className="calendar-footer">
            {/* 快捷按钮 */}
            <div className="calendar-quick-actions" style={quickActionsStyle}>
              <button className="modern-calendar-quick" style={quickBtnStyle} onClick={handleToday}>{todayLabel}</button>
              {!hideNext && <button className="modern-calendar-quick" style={quickBtnStyle} onClick={handleNext}>{nextLabel}</button>}
            </div>

            {/* 已选择预览 — 显示内部 pending 值 */}
            <div className="calendar-selection-summary" style={selectionSummaryStyle}>
              <Typography sx={{ fontSize: 13, color: '#6e6e73', mb: 0.5 }}>已选择</Typography>
              <Typography id="selected-date-preview" sx={{ fontSize: 18, fontWeight: 700, color: '#1d1d1f' }}>
                {pending ? pending.format('YYYY年M月D日') : '未选择'}
              </Typography>
            </div>

            {/* 确认/取消 */}
            <div className="action-row" style={actionRowStyle}>
              <Button onClick={handleAccept} variant="contained" sx={confirmBtnSx}>确定</Button>
      <Button onClick={handleCancel} variant="text" sx={cancelBtnSx}>取消</Button>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/* ================================================================
 * 样式常量
 * ================================================================ */

const dialogPaperSx = {
  borderRadius: '28px',
  boxShadow: '0 28px 60px rgba(15,23,42,0.18)',
  border: '1px solid rgba(255,255,255,0.5)',
  overflow: 'hidden',
};

const containerStyle: React.CSSProperties = {
  padding: '32px',
  width: 'min(92vw, 470px)',
};

const triggerStyle: React.CSSProperties = {
  width: '100%', height: 44, borderRadius: 12,
  padding: '0 16px', textAlign: 'left', fontSize: 15, fontWeight: 500,
  color: '#1d1d1f', background: 'rgba(255,255,255,0.88)',
  border: '1px solid rgba(15,23,42,0.1)',
  cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
};

const headStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14,
  marginBottom: 14, paddingBottom: 14,
  borderBottom: '1px solid rgba(15,23,42,0.08)',
};

const navBtnStyle: React.CSSProperties = {
  width: 40, height: 40,
  border: '1px solid rgba(15,23,42,0.08)', borderRadius: '50%',
  background: 'rgba(15,23,42,0.04)', cursor: 'pointer',
  color: '#4285f4', fontSize: 20,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.2s ease', fontFamily: 'inherit', lineHeight: 1,
};

const monthTitleStyle: React.CSSProperties = {
  flex: 1, margin: 0, fontSize: 20, fontWeight: 700, color: '#1d1d1f', textAlign: 'center',
};

const calendarSx = {
  width: '100%',
  '& .MuiDateCalendar-root': {
    padding: '0 !important',
    width: '100% !important',
  },
  '& .MuiPickersCalendarHeader-root': { display: 'none !important' },
  '& .MuiDayCalendar-weekDayLabel': {
    color: '#6e6e73', fontSize: 12, fontWeight: 700, textAlign: 'center',
    width: '100%',
  },
  '& .MuiDayCalendar-header': {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '4px',
    width: '100%',
  },
  '& .MuiDayCalendar-weekContainer': {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '4px',
    margin: '4px 0',
    justifyContent: 'initial',
  },
  '& .MuiPickersDay-root': {
    width: '100%',
    maxWidth: 'none',
    height: 40,
    margin: 0,
  },
  '& .MuiDayCalendar-slideTransition': {
    height: 312,
    display: 'flex',
    flexDirection: 'column',
  },
  '& .MuiDayCalendar-monthContainer': {
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    justifyContent: 'space-between',
  },
};

const quickActionsStyle: React.CSSProperties = {
  display: 'flex', gap: 10,
  marginTop: 14, paddingTop: 14,
  borderTop: '1px solid rgba(15,23,42,0.08)', marginBottom: 12,
};

const quickBtnStyle: React.CSSProperties = {
  flex: 1, minHeight: 42,
  border: '1px solid rgba(15,23,42,0.08)', borderRadius: '999px',
  background: 'rgba(15,23,42,0.04)', color: '#374151',
  cursor: 'pointer', fontSize: 14, fontWeight: 600,
  fontFamily: 'inherit', transition: 'all 0.2s ease',
};

const selectionSummaryStyle: React.CSSProperties = {
  padding: 14, background: 'rgba(15,23,42,0.03)', borderRadius: 18, marginBottom: 12,
};

const actionRowStyle: React.CSSProperties = { display: 'flex', gap: 10 };

const confirmBtnSx = {
  flex: 1, fontWeight: 600, borderRadius: '999px', minHeight: 44, fontSize: 15,
  background: 'linear-gradient(180deg,#4d90fe 0%,#4285f4 100%)',
  '&:hover': { background: 'linear-gradient(180deg,#4d90fe 0%,#4285f4 100%)' },
};

const cancelBtnSx = {
  flex: 1, fontWeight: 600, borderRadius: '999px', minHeight: 44, fontSize: 15,
  color: '#6e6e73',
};
