import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dayjs from 'dayjs';
import { Button, IconButton, Box, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import api from '../../api/client';
import { useToast } from '../common/Toast';
import ModalPortal from '../common/ModalPortal';
import AppleDatePicker from '../common/AppleDatePicker';
import { exportTableAsImage } from '../../utils/exportImage';

interface ScheduleResult { weeks: Array<{ slots: Record<string, string[]>; date: string; date_display: string }>; warnings: string[]; }

function getWeekRange(startDate: string): string {
  if (!startDate) return '';
  const d = dayjs(startDate);
  const day = d.day();
  const monday = d.subtract(day === 0 ? 6 : day - 1, 'day');
  const sunday = monday.add(6, 'day');
  return `${monday.format('YYYY-MM-DD')} - ${sunday.format('YYYY-MM-DD')}`;
}

function getNextMonday(): dayjs.Dayjs {
  const t = dayjs();
  const dow = t.day(); // 0=周日 … 6=周六
  const daysUntilMonday = dow === 1 ? 7 : (8 - dow) % 7;
  return t.add(daysUntilMonday, 'day');
}

export default function ScheduleGenerate() {
  const toast = useToast();
  const previewTableRef = useRef<HTMLTableElement>(null);
  const skipAutoGenRef = useRef(false);

  // --- State ---
  const [groups, setGroups] = useState<string[]>([]);
  const [scheduleStartDate, setScheduleStartDate] = useState(() => getNextMonday().format('YYYY-MM-DD'));
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [scheduleData, setScheduleData] = useState<ScheduleResult | null>(null);
  const [schedulePreview, setSchedulePreview] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // Snapshot
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [isFromSnapshot, setIsFromSnapshot] = useState(false);

  // --- Load groups ---
  const loadGroups = useCallback(async () => {
    try {
      const { data } = await api.get<string[]>('/groups');
      setGroups(data);
      setSelectedGroups(prev => {
        if (prev.size === 0) return new Set(data);
        return prev;
      });
    } catch (e: any) {
      toast.show(e.response?.data?.detail || '加载组别失败', 'error');
    }
  }, [toast]);

  useEffect(() => { loadGroups(); }, [loadGroups]);


  // --- Group selection ---
  const toggleGroup = (g: string) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  };

  // --- Schedule generation ---
  const generateSchedule = async () => {
    if (!scheduleStartDate) {
      toast.show('请选择开始日期', 'warning');
      return;
    }
    const grps = Array.from(selectedGroups);
    if (grps.length === 0) {
      toast.show('请选择至少一个组别', 'warning');
      return;
    }
    setScheduleLoading(true);
    try {
      const { data: res } = await api.post('/schedule', {
        start_date: scheduleStartDate,
        groups: grps,
      });
      setScheduleData(res);
      setSchedulePreview(true);
      setIsFromSnapshot(false);
    } catch (e: any) {
      toast.show(e.response?.data?.detail || '排班生成失败', 'error');
    }
    setScheduleLoading(false);
  };

  // 日期或组别变化时自动生成排班（加载快照时跳过）
  useEffect(() => {
    if (!scheduleStartDate || selectedGroups.size === 0) return;
    if (skipAutoGenRef.current) {
      skipAutoGenRef.current = false;
      return;
    }
    generateSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleStartDate, selectedGroups]);

  const weekKey = scheduleStartDate;
  const dateRange = useMemo(() => getWeekRange(scheduleStartDate), [scheduleStartDate]);

  // --- Snapshots ---
  const [snapshots, setSnapshots] = useState<Array<{id: number; week_key: string; record_count: number; created_at: string}>>([]);

  const [snapSaving, setSnapSaving] = useState(false);

  const saveSnapshot = async () => {
    if (!scheduleData || !scheduleData.weeks) {
      toast.show('无排班数据可保存', 'warning');
      return;
    }
    setSnapSaving(true);
    try {
      await api.post('/snapshots', { type: 'schedule', week_key: scheduleData?.weeks?.[0]?.date || weekKey, data: scheduleData });
      toast.show('快照已保存');
    } catch (e: any) {
      toast.show(String(e.response?.data?.detail || '保存快照失败'), 'error');
    } finally { setSnapSaving(false); }
  };

  const loadSnapshots = async () => {
    setSnapshotModalOpen(true);
    try {
      const { data } = await api.get('/snapshots', { params: { type: 'schedule' } });
      setSnapshots(data.items || []);
    } catch (e: any) {
      toast.show(String(e.response?.data?.detail || '加载快照失败'), 'error');
    }
  };

  const loadSnapshotDetail = async (id: number) => {
    try {
      skipAutoGenRef.current = true;
      const { data } = await api.get(`/snapshots/${id}`);
      setScheduleData(data.data);
      setScheduleStartDate(data.week_key);
      setSchedulePreview(true);
      setIsFromSnapshot(true);
      setSnapshotModalOpen(false);
      toast.show('快照已加载');
    } catch (e: any) {
      toast.show(String(e.response?.data?.detail || '加载快照失败'), 'error');
    }
  };

  const deleteSnapshot = async (id: number) => {
    try {
      await api.delete(`/snapshots/${id}`);
      toast.show('快照已删除');
      const { data } = await api.get('/snapshots', { params: { type: 'schedule' } });
      setSnapshots(data.items || []);
    } catch (e: any) {
      toast.show(String(e.response?.data?.detail || '删除快照失败'), 'error');
    }
  };

  const exportImage = () => {
    if (previewTableRef.current) {
      exportTableAsImage(previewTableRef.current, `排班表_${scheduleData?.weeks?.[0]?.date || weekKey}`);
    }
  };

  // --- Extract slots from response ---
  const slots = useMemo(() => {
    if (!scheduleData?.weeks?.[0]?.slots) return {};
    return scheduleData.weeks[0].slots as Record<string, string[]>;
  }, [scheduleData]);

  const orderedTimes = useMemo(() => {
    const order = ['8:00', '9:00', '10:00', '11:00', '13:00'].filter(t => slots[t]);
    for (const t of Object.keys(slots).sort()) {
      if (!order.includes(t)) order.push(t);
    }
    return order;
  }, [slots]);

  const warnings = scheduleData?.warnings || [];

  return (
    <>
      <Box className="section-two-col" sx={{ gridTemplateColumns: '1fr 750px' }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">排班设置</div>
              <div className="card-subtitle">默认显示下一周排班，切换日期自动更新。</div>
            </div>
          </div>
          <div className="form-row">
            <Box className="form-group" sx={{ flex: 1 }}>
              <label>开始日期</label>
              <AppleDatePicker
                value={scheduleStartDate ? dayjs(scheduleStartDate) : null}
                onChange={(d) => setScheduleStartDate(d ? d.format('YYYY-MM-DD') : '')}
              />
            </Box>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">包含组别</div>
              <div className="card-subtitle">选择需要参与本次排班的组别。</div>
            </div>
          </div>
          <Box className="group-card-grid group-card-grid-5">
            {groups.map(g => (
              <div
                key={g}
                className={`group-card${selectedGroups.has(g) ? ' selected' : ''}`}
                onClick={() => toggleGroup(g)}
              >
                <span className="group-card-check">{selectedGroups.has(g) && <CheckIcon sx={{ fontSize: 13 }} />}</span>
                <span className="group-card-name">{g}</span>
              </div>
            ))}
          </Box>
        </div>
      </Box>

      {/* Schedule Preview Card — exact replica of old renderSchedulePreview() */}
      {schedulePreview && scheduleData?.weeks?.length > 0 && (
        <Box className="card" id="schedule-preview-card" sx={{ display: 'block' }}>
          <div className="card-header">
            <div>
              <div className="card-title">
                排班预览
                {isFromSnapshot && <span className="snapshot-badge" id="schedule-snapshot-badge">快照</span>}
                <IconButton size="small" color="primary" onClick={generateSchedule} disabled={scheduleLoading} title="Refresh" sx={{ verticalAlign: 'middle', ml: 1 }}>
                  <RefreshIcon />
                </IconButton>
              </div>
              <div className="card-subtitle" id="schedule-preview-subtitle"></div>
            </div>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="contained" startIcon={<SaveIcon />} onClick={saveSnapshot} disabled={snapSaving}>{snapSaving ? '保存中...' : (isFromSnapshot ? '更新快照' : '保存快照')}</Button>
              <Button variant="outlined" onClick={loadSnapshots}>查询快照</Button>
              <Button variant="contained" color="success" startIcon={<DownloadIcon />} onClick={exportImage}>导出图片</Button>
            </Box>
          </div>
          <Box className="preview-box" id="schedule-preview" sx={{ height: 'auto', overflow: 'visible' }}>
            <div className="schedule-preview-wrap">
              <table ref={previewTableRef} className="schedule-preview-table">
                <tbody>
                  <tr>
                    <th colSpan={9} className="schedule-preview-title">电脑部上班时间表</th>
                  </tr>
                  <tr>
                    <td colSpan={9} className="schedule-preview-subtitle">
                      <div className="schedule-date-range-wrap">{dateRange}</div>
                    </td>
                  </tr>
                  {orderedTimes.map((time, timeIndex) => {
                    const allEmployees = [...new Set(slots[time] || [])].sort();
                    const rows = Math.ceil(allEmployees.length / 8);
                    const isLastTime = timeIndex === orderedTimes.length - 1;
                    return Array.from({ length: rows }, (_, row) => {
                      const startIdx = row * 8;
                      const rowEmployees = allEmployees.slice(startIdx, startIdx + 8);
                      const isLastRow = row === rows - 1;
                      let rowClass = '';
                      if (isLastRow && !isLastTime) rowClass = 'schedule-time-block-end';
                      else if (isLastRow && isLastTime) rowClass = 'schedule-last-row';
                      return (
                        <tr key={`${time}-${row}`} className={rowClass || undefined}>
                          {row === 0 && (
                            <td
                              rowSpan={rows}
                              className={`schedule-time-cell${isLastTime ? ' schedule-last-time' : ''}`}
                            >
                              {time}
                            </td>
                          )}
                          {rowEmployees.map(emp => (
                            <td key={emp} className="schedule-employee-cell schedule-readonly">{emp}</td>
                          ))}
                          {Array.from({ length: 8 - rowEmployees.length }, (_, i) => (
                            <td key={`empty-${i}`} className="schedule-empty-cell"></td>
                          ))}
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          </Box>
        </Box>
      )}

      {/* Snapshot Query Modal */}
      <ModalPortal open={snapshotModalOpen} onClose={() => setSnapshotModalOpen(false)} title="查询排班快照" maxWidth={650}>
          <Box sx={{ py: 2.5 }}>
            <Box sx={{ minHeight: '100px' }}>
              {snapshots.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📸</div>
                  <div className="empty-state-text">暂无快照记录</div>
                </div>
              ) : (
                snapshots.map(item => (
                  <Box key={item.id} className="snapshot-card" sx={{
                    background: 'rgba(255,255,255,0.85)',
                    border: '1px solid rgba(15,23,42,0.08)',
                    borderRadius: '20px',
                    p: 2,
                    mb: 1.5,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div>
                      <Typography sx={{ fontSize: '16px', fontWeight: 700, color: '#1d1d1f' }}>
                        {item.week_key} (周一)
                      </Typography>
                      <Typography sx={{ fontSize: '13px', color: '#6e6e73', mt: 0.5 }}>
                        {item.record_count || 0} 条记录 · {item.created_at || ''}
                      </Typography>
                    </div>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button size="small" variant="outlined" onClick={() => loadSnapshotDetail(item.id)}>加载</Button>
                      <Button size="small" variant="contained" color="error" onClick={() => deleteSnapshot(item.id)}>删除</Button>
                    </Box>
                  </Box>
                ))
              )}
            </Box>
          </Box>
      </ModalPortal>
    </>
  );
}
