import { useState, useEffect, useCallback, useRef } from 'react';
import { Button, IconButton, TextField, Chip, Box, Typography, Alert, Autocomplete } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '../../api/client';
import { useToast } from '../common/Toast';
import ModalPortal from '../common/ModalPortal';
import AppleDatePicker from '../common/AppleDatePicker';
import dayjs from 'dayjs';
import { exportTableAsImage } from '../../utils/exportImage';
import ReadOnlyDropdown from '../common/ReadOnlyDropdown';

interface DutyGroup {
  name: string;
  members?: string[];
}

interface DutyScheduleWeek { date: string; date_display: string; week_number: number; groups: Record<string, string[]>; }
interface DutyScheduleResult { weeks: DutyScheduleWeek[]; }

interface DutyConfig {
  duty_count?: number;
  start_date?: string;
  rotation_order?: string[];
}

const tabLabels = ['值班小组', '值班配置', '值班表生成'];

function getThisSunday(): dayjs.Dayjs {
  const t = dayjs();
  return t.day() === 0 ? t : t.add(7 - t.day(), 'day');
}

// 轮换顺序列表行（可拖拽排序）
interface SortableRowProps {
  id: string;
  index: number;
  onRemove: (name: string) => void;
}

function SortableRow({ id, index, onRemove }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    position: 'relative',
    zIndex: isDragging ? 2 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className={`sortable-row${isDragging ? ' is-dragging' : ''}`}>
      <span className="sort-handle" {...attributes} {...listeners}>
        <DragIndicatorIcon fontSize="small" />
      </span>
      <span className="sort-index">{index + 1}</span>
      <span className="order-employee-name">{id}</span>
      <IconButton size="small" className="order-remove-btn" title="移出轮换顺序" onClick={() => onRemove(id)}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </div>
  );
}

export default function DutyTab() {
  const toast = useToast();
  const previewTableRef = useRef<HTMLTableElement>(null);
  const skipAutoGenRef = useRef(false);

  // --- Sub-tabs ---
  const [subTab, setSubTab] = useState(0);

  // --- Common ---
  const [allEmployees, setAllEmployees] = useState<{ name: string; group: string }[]>([]);
  const [dutyGroups, setDutyGroups] = useState<DutyGroup[]>([]);
  const [loadingDuty, setLoadingDuty] = useState(false);

  // --- Group modals ---
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [addGroupName, setAddGroupName] = useState('');
  const [addGroupMembers, setAddGroupMembers] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<string[]>([]);
  const [editMembersOpen, setEditMembersOpen] = useState(false);
  const [editMembersGroup, setEditMembersGroup] = useState('');
  const [editMembersList, setEditMembersList] = useState<string[]>([]);
  const [editMemberSearch, setEditMemberSearch] = useState('');
  const [editMemberResults, setEditMemberResults] = useState<string[]>([]);
  const [renameGroup, setRenameGroup] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState('');

  // --- Config ---
  const [configGroup, setConfigGroup] = useState('');
  const [configData, setConfigData] = useState<DutyConfig>({});
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaveLoading, setConfigSaveLoading] = useState(false);
  const [rotationOrder, setRotationOrder] = useState<string[]>([]);
  const [poolMembers, setPoolMembers] = useState<string[]>([]);

  // --- Schedule ---
  const [schedGroups, setSchedGroups] = useState<string[]>([]);
  const [schedStartDate, setSchedStartDate] = useState(() => getThisSunday().format('YYYY-MM-DD'));
  const [schedSelected, setSchedSelected] = useState<Set<string>>(new Set());
  const [schedData, setSchedData] = useState<DutyScheduleResult | null>(null);
  const [schedLoading, setSchedLoading] = useState(false);
  const [schedPreview, setSchedPreview] = useState(false);

  // --- Snapshots ---
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<Array<{id: number; week_key: string; record_count: number; created_at: string}>>([]);
  const [isFromSnapshot, setIsFromSnapshot] = useState(false);

  // --- Rest day configs ---
  // { weekKey: [{ dayType: '周六轮休', employees: ['张三', '', ...] }, ...] }
  const [restDayConfigs, setRestDayConfigs] = useState<Record<string, { dayType: string; employees: string[] }[]>>({});

  // --- Rest day modal ---
  const [restDayModal, setRestDayModal] = useState(false);
  type RestDayCtx = { weekKey: string; rowIndex: number; employeeIndex: number | null; mode: 'type' | 'employee' };
  const [restDayCtx, setRestDayCtx] = useState<RestDayCtx | null>(null);
  const [restDaySelect, setRestDaySelect] = useState('');

  // ===== API =====
  const loadDutyGroups = useCallback(async () => {
    setLoadingDuty(true);
    try {
      const { data } = await api.get<string[]>('/duty/groups');
      const groupsWithMembers = await Promise.all(
        data.map(async (name: string) => {
          try {
            const { data: md } = await api.get(`/duty/groups/${encodeURIComponent(name)}/members`);
            return { name, members: (md.members || []) as string[] };
          } catch { return { name, members: [] as string[] }; }
        })
      );
      setDutyGroups(groupsWithMembers);
    } catch (e: any) { toast.show(e.response?.data?.detail || '加载失败', 'error'); }
    setLoadingDuty(false);
  }, [toast]);

  const loadEmployees = useCallback(async () => {
    try { const { data } = await api.get('/employees'); setAllEmployees(data); } catch { console.error('加载员工列表失败'); }
  }, []);

  useEffect(() => { loadDutyGroups(); loadEmployees(); }, []);

  // ===== Group CRUD =====
  const addGroup = async () => {
    if (!addGroupName.trim()) { toast.show('请输入名称', 'warning'); return; }
    try {
      await api.post('/duty/groups', { name: addGroupName.trim() });
      for (const name of addGroupMembers) {
        await api.post(`/duty/groups/${encodeURIComponent(addGroupName.trim())}/members`, { name });
      }
      toast.show('已添加');
      setAddGroupOpen(false); setAddGroupName(''); setAddGroupMembers([]); setMemberSearch('');
      loadDutyGroups();
    } catch (e: any) { toast.show(e.response?.data?.detail || '失败', 'error'); }
  };

  const doDelete = async () => {
    try { await api.delete(`/duty/groups/${encodeURIComponent(deleteName)}`); toast.show('已删除'); setDeleteOpen(false); loadDutyGroups(); }
    catch (e: any) { toast.show(e.response?.data?.detail || '失败', 'error'); }
  };

  const doRename = async (oldName: string) => {
    if (!renameValue.trim() || renameValue.trim() === oldName) { setRenameGroup(''); return; }
    try { await api.put(`/duty/groups/${encodeURIComponent(oldName)}/rename`, { new_name: renameValue.trim() }); toast.show('已重命名'); setRenameGroup(''); loadDutyGroups(); }
    catch (e: any) { toast.show(e.response?.data?.detail || '失败', 'error'); }
  };

  // ===== Members =====
  const openEditMembers = (group: string) => {
    setEditMembersGroup(group);
    setEditMembersList(dutyGroups.find(dg => dg.name === group)?.members || []);
    setEditMemberSearch(''); setEditMemberResults([]); setEditMembersOpen(true);
  };

  const searchMembers = (q: string, cb: (r: string[]) => void) => {
    if (!q) { cb([]); return; }
    cb(allEmployees.filter(e => e.name.toLowerCase().includes(q.toLowerCase())).map(e => e.name).slice(0, 10));
  };

  const addMember = async (name: string) => {
    if (!editMembersGroup) {
      toast.show('请先选择小组', 'warning');
      return;
    }
    try {
      await api.post(`/duty/groups/${encodeURIComponent(editMembersGroup)}/members`, { name });
      setEditMembersList(p => [...p, name]); toast.show(`已添加 ${name}`); setEditMemberSearch(''); setEditMemberResults([]);
      loadDutyGroups();
    } catch (e: any) { toast.show(e.response?.data?.detail || '失败', 'error'); }
  };

  const removeMember = async (name: string) => {
    if (!editMembersGroup) {
      toast.show('请先选择小组', 'warning');
      return;
    }
    try {
      await api.delete(`/duty/groups/${encodeURIComponent(editMembersGroup)}/members/${encodeURIComponent(name)}`);
      setEditMembersList(p => p.filter(m => m !== name)); toast.show(`已移除 ${name}`);
      loadDutyGroups();
    } catch (e: any) { toast.show(e.response?.data?.detail || '失败', 'error'); }
  };

  // ===== Config =====
  const loadConfig = useCallback(async (group: string) => {
    if (!group) { setConfigData({}); setRotationOrder([]); setPoolMembers([]); return; }
    setConfigLoading(true);
    try {
      const { data } = await api.get(`/duty/groups/${encodeURIComponent(group)}/config`);
      setConfigData(data);
      const order = data.rotation_order || [];
      const members = dutyGroups.find(dg => dg.name === group)?.members || [];
      const orderedSet = new Set(order);
      setRotationOrder(order);
      setPoolMembers(members.filter((m: string) => !orderedSet.has(m)));
    } catch {
      const members = dutyGroups.find(dg => dg.name === group)?.members || [];
      setConfigData({}); setRotationOrder([]); setPoolMembers(members);
    }
    setConfigLoading(false);
  }, [dutyGroups]);

  useEffect(() => {
    if (subTab === 1 && configGroup) loadConfig(configGroup);
    else if (subTab === 1 && dutyGroups.length > 0 && !configGroup) setConfigGroup(dutyGroups[0].name);
  }, [subTab, configGroup, dutyGroups, loadConfig]);
  useEffect(() => { if (configGroup && dutyGroups.length > 0) loadConfig(configGroup); }, [configGroup, loadConfig]);

  const saveConfig = async () => {
    setConfigSaveLoading(true);
    try {
      const order = rotationOrder;
      await api.put(`/duty/groups/${encodeURIComponent(configGroup)}/config`, { ...configData, rotation_order: order });
      toast.show('已保存');
    } catch (e: any) { toast.show(e.response?.data?.detail || '失败', 'error'); }
    setConfigSaveLoading(false);
  };

  // —— 轮换顺序：添加 / 移除 / 拖拽排序 ——
  const addToOrder = (name: string) => {
    if (!name || rotationOrder.includes(name)) return;
    setRotationOrder(prev => [...prev, name]);
    setPoolMembers(prev => prev.filter(n => n !== name));
  };

  const removeFromOrder = (name: string) => {
    setRotationOrder(prev => prev.filter(n => n !== name));
    setPoolMembers(prev => [...prev, name]);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setRotationOrder(prev => {
        const oldIndex = prev.indexOf(String(active.id));
        const newIndex = prev.indexOf(String(over.id));
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  // ===== Schedule =====
  useEffect(() => {
    if (subTab === 2) { const names = dutyGroups.map(g => g.name); setSchedGroups(names); setSchedSelected(new Set(names)); }
  }, [subTab, dutyGroups]);

  const toggleSched = (g: string) => setSchedSelected(p => { const n = new Set(p); n.has(g) ? n.delete(g) : n.add(g); return n; });

  const generateDuty = async () => {
    if (!schedStartDate) { toast.show('请选择日期', 'warning'); return; }
    const grps = Array.from(schedSelected);
    if (!grps.length) { toast.show('请选择小组', 'warning'); return; }
    setSchedLoading(true);
    try {
      const { data } = await api.post('/duty/generate', { start_date: schedStartDate, groups: grps });
      setSchedData(data); setSchedPreview(true); setIsFromSnapshot(false);
      setRestDayConfigs({});  // 重置轮休配置
    } catch (e: any) { toast.show(e.response?.data?.detail || '生成失败', 'error'); }
    setSchedLoading(false);
  };

  // 日期或小组变化时自动生成（加载快照时跳过）
  useEffect(() => {
    if (!schedStartDate || schedSelected.size === 0) return;
    if (skipAutoGenRef.current) {
      skipAutoGenRef.current = false;
      return;
    }
    generateDuty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedStartDate, schedSelected]);

  const [snapSaving, setSnapSaving] = useState(false);

  const saveSnapshot = async () => {
    if (!schedData) { toast.show('无数据', 'warning'); return; }
    setSnapSaving(true);
    try { await api.post('/snapshots', { type: 'duty', week_key: schedStartDate, data: schedData, extra: restDayConfigs || undefined }); toast.show('已保存'); }
    catch (e: any) { toast.show(String(e.response?.data?.detail || '保存失败'), 'error'); }
    finally { setSnapSaving(false); }
  };

  const loadSnapshots = async () => {
    setSnapshotOpen(true);
    try { const { data } = await api.get('/snapshots', { params: { type: 'duty' } }); setSnapshots(data.items || []); }
    catch (e: any) { toast.show(String(e.response?.data?.detail || '加载失败'), 'error'); }
  };

  const loadSnapshotDetail = async (id: number) => {
    try { skipAutoGenRef.current = true; const { data } = await api.get(`/snapshots/${id}`);
      setSchedData(data.data);
      setSchedStartDate(data.week_key);
      setSchedPreview(true); setIsFromSnapshot(true);
      setSnapshotOpen(false);
      if (data.extra) setRestDayConfigs(data.extra);
      toast.show('已加载');
    }
    catch (e: any) { toast.show(String(e.response?.data?.detail || '加载失败'), 'error'); }
  };

  const deleteSnapshot = async (id: number) => {
    try { await api.delete(`/snapshots/${id}`); toast.show('已删除'); const { data } = await api.get('/snapshots', { params: { type: 'duty' } }); setSnapshots(data.items || []); }
    catch (e: any) { toast.show(String(e.response?.data?.detail || '删除失败'), 'error'); }
  };

  const exportImage = () => {
    if (previewTableRef.current) exportTableAsImage(previewTableRef.current, `值班表_${schedStartDate}`);
  };

  // ===== Rest day helpers =====
  const ensureRestDayConfigs = (weekKey: string) => {
    if (!restDayConfigs[weekKey]) {
      setRestDayConfigs(prev => ({
        ...prev,
        [weekKey]: [
          { dayType: '周六轮休', employees: Array(6).fill('') },
          { dayType: '周一轮休', employees: Array(6).fill('') },
          { dayType: '',          employees: Array(6).fill('') },
        ],
      }));
    }
  };

  const getRestDayConfigsForWeek = (weekKey: string) => {
    return restDayConfigs[weekKey] || [
      { dayType: '周六轮休', employees: Array(6).fill('') },
      { dayType: '周一轮休', employees: Array(6).fill('') },
      { dayType: '',          employees: Array(6).fill('') },
    ];
  };

  // Collect all employees in this week's duty groups (for employee dropdown)
  const collectWeekEmployees = (week: any) => {
    const groups = week.groups || {};
    const names: string[] = [];
    for (const g of Object.keys(groups)) {
      const members = groups[g] || [];
      if (Array.isArray(members)) {
        for (const m of members) {
          if (m && !names.includes(m)) names.push(m);
        }
      }
    }
    return names;
  };

  const openRestDayTypeEdit = (weekKey: string, rowIndex: number) => {
    ensureRestDayConfigs(weekKey);
    const current = getRestDayConfigsForWeek(weekKey)[rowIndex]?.dayType || '';
    setRestDaySelect(current);
    setRestDayCtx({ weekKey, rowIndex, employeeIndex: null, mode: 'type' });
    setRestDayModal(true);
  };

  const openRestDayEmployeeEdit = (weekKey: string, rowIndex: number, employeeIndex: number) => {
    ensureRestDayConfigs(weekKey);
    const current = getRestDayConfigsForWeek(weekKey)[rowIndex]?.employees?.[employeeIndex] || '';
    setRestDaySelect(current);
    setRestDayCtx({ weekKey, rowIndex, employeeIndex, mode: 'employee' });
    setRestDayModal(true);
  };

  const confirmRestDay = () => {
    if (!restDayCtx) return;
    const { weekKey, rowIndex, employeeIndex, mode } = restDayCtx;
    const configs = getRestDayConfigsForWeek(weekKey);
    if (mode === 'type') {
      configs[rowIndex].dayType = restDaySelect;
    } else if (mode === 'employee' && employeeIndex !== null) {
      configs[rowIndex].employees[employeeIndex] = restDaySelect;
    }
    setRestDayConfigs(prev => ({ ...prev, [weekKey]: configs }));
    setRestDayModal(false);
    setRestDayCtx(null);
  };

  // ===== Render duty schedule table (exact replica of old duty.js L1447-1533) =====
  const renderTable = () => {
    if (!schedData) return null;
    const weeks = schedData.weeks || [];
    if (!weeks.length) return <div className="empty-state">暂无数据，请检查配置是否完整</div>;

    return weeks.map((week: any) => {
      const dateDisplay = week.date_display || week.date;
      const groups = week.groups || {};
      const weekKey = week.date;

      const stations = [
        { name: '制作', time: '10:00-20:00', key: '制作', cells: [0, 1], extra: 2 },
        { name: '工艺', time: '10:00-20:00', key: '工艺', cells: [0], extra: 3 },
        { name: '调图', time: '10:00-20:00', key: '调图', cells: [0], midKey: '机动' },
        { name: '布标', time: '11:00-20:00', key: '布标', cells: [0], extra: 3 },
        { name: 'QC', time: '10:00-20:00', key: 'QC', cells: [0], extra: 3, last: true },
      ];

      return (
        <Box key={dateDisplay} className="duty-preview-wrap" sx={{ mb: 4 }}>
          <table ref={previewTableRef} className="duty-schedule-table">
            <colgroup>{Array.from({ length: 6 }, (_, i) => <col key={i} />)}</colgroup>
            <thead>
              <tr><th colSpan={6} className="duty-preview-title">周末值班表</th></tr>
              <tr className="duty-date-row"><td colSpan={6} className="duty-preview-subtitle">{dateDisplay}</td></tr>
            </thead>
            <tbody>
              {stations.map(s => {
                const members = groups[s.key] || [];
                const c = s.cells || [0];
                return (
                  <tr key={s.name} className={`duty-group-row${s.last ? ' duty-group-last' : ''}`}>
                    <td className="duty-station-cell duty-station-border">{s.name}</td>
                    <td className="duty-time-cell">{s.time}</td>
                    {c.map((i: number) => (
                      <td key={i} className="duty-member-cell">{members[i] || '\u00A0'}</td>
                    ))}
                    {s.midKey && (
                      <>
                        <td></td>
                        <td className="duty-station-cell">机动</td>
                        <td className="duty-member-cell">{(groups[s.midKey] || [])[0] || '\u00A0'}</td>
                      </>
                    )}
                    {typeof s.extra === 'number' && Array.from({ length: s.extra }, (_, i) => (
                      <td key={`extra-${i}`}></td>
                    ))}
                  </tr>
                );
              })}
              {/* 分隔行 */}
              <tr className="duty-section-separator-row"><td colSpan={6}></td></tr>
              {/* 轮休行 */}
              {getRestDayConfigsForWeek(weekKey).map((cfg, idx) => {
                const rowCls = ['duty-rest-first', 'duty-rest-middle', 'duty-rest-last'][idx];
                return (
                  <tr key={`rest-${idx}`} className={`duty-rest-row ${rowCls}`}>
                    <td className="duty-rest-title-cell" onClick={() => openRestDayTypeEdit(weekKey, idx)}>
                      {cfg.dayType || '\u00A0'}
                    </td>
                    {cfg.employees.map((emp, i) => (
                      <td key={i} className="duty-rest-member-cell" onClick={() => openRestDayEmployeeEdit(weekKey, idx, i)}>
                        {emp || '\u00A0'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
      );
    });
  };

  // ===== Member dropdown =====
  const memberDropdown = (
    search: string,
    results: string[],
    onSelect: (n: string) => void,
    occupied: string[],
    onSearchChange: (v: string) => void,
    setResults: (r: string[]) => void
  ) => (
    <div>
      <TextField size="small" placeholder="搜索员工添加成员..." value={search}
        onChange={e => {
          onSearchChange(e.target.value);
          searchMembers(e.target.value, setResults);
        }}
        onFocus={() => { if (search) searchMembers(search, setResults); }}
        autoComplete="off"
        fullWidth />
      {results.length > 0 && (
        <Box className="member-dropdown-container" sx={{ display: 'block' }}>
          <Box className="member-dropdown-list" sx={{ position: 'absolute', top: '100%', left: 0, right: 0 }}>
            {results.map(n => {
              const added = occupied.includes(n);
              return (
                <div key={n} className={`member-dropdown-item${added ? ' added' : ''}`}
                  onClick={() => { if (!added) onSelect(n); }}
                  style={added ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
                  {n} <span className="add-icon">{added ? '✓' : '+'}</span>
                </div>
              );
            })}
          </Box>
        </Box>
      )}
    </div>
  );

  // ===== RENDER =====
  return (
    <div>
      <div className="nav-shell">
        <div className="nav">
          {tabLabels.map((l, i) => (
            <button key={i} className={`nav-tab ${subTab === i ? 'active' : ''}`} onClick={() => setSubTab(i)}>{l}</button>
          ))}
        </div>
      </div>

      <Box className="content" sx={{ p: 4 }}>
        {/* ==== 值班小组 ==== */}
        <div className={`tab-content ${subTab === 0 ? 'active' : ''}`}>
          <div className="section-grid">
            <div className="card">
              <div className="card-header">
                <div><div className="card-title">值班小组列表</div><div className="card-subtitle">管理所有值班小组，可编辑小组成员。</div></div>
                <Button variant="contained" onClick={() => { setAddGroupName(''); setAddGroupMembers([]); setMemberSearch(''); setMemberResults([]); setAddGroupOpen(true); }}>添加小组</Button>
              </div>
              <div id="duty-groups-list">
                {loadingDuty ? <div className="empty-state">加载中...</div> :
                  dutyGroups.length === 0 ? <div className="empty-state">暂无值班小组，请点击"添加小组"按钮创建</div> :
                    dutyGroups.map(dg => (
                      <div key={dg.name} className="entity-card fade-in">
                        <div className="entity-card-header">
                          <div className="entity-card-title">
                            {renameGroup === dg.name ? (
                              <>
                                <input className="form-control inline-rename-input" value={renameValue}
                                  onChange={e => setRenameValue(e.target.value)} onBlur={() => doRename(dg.name)} onKeyDown={e => { if (e.key === 'Enter') doRename(dg.name); }} autoFocus />
                                <span className="inline-edit-confirm" onClick={() => doRename(dg.name)}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                  </svg>
                                </span>
                              </>
                            ) : (
                              <>
                                <span>{dg.name}</span>
                                <span className="inline-edit-trigger" onClick={() => { setRenameGroup(dg.name); setRenameValue(dg.name); }}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                  </svg>
                                </span>
                              </>
                            )}
                          </div>
                          <div className="action-btns">
                            <Button size="small" variant="outlined" onClick={() => openEditMembers(dg.name)}>编辑</Button>
                            <Button size="small" variant="contained" color="error" onClick={() => { setDeleteName(dg.name); setDeleteOpen(true); }}>删除</Button>
                          </div>
                        </div>
                        <div className="subtle-note">
                          <Typography color="text.secondary" sx={{ fontSize: 13, mb: 0.5 }}>{(dg.members || []).length} 名成员</Typography>
                          <Typography color="text.primary" sx={{ fontWeight: 500 }}>{(dg.members && dg.members.length > 0) ? dg.members.join(' ') : '暂无成员'}</Typography>
                        </div>
                      </div>
                    ))
                }
              </div>
            </div>
          </div>
        </div>

        {/* ==== 值班配置 ==== */}
        <div className={`tab-content ${subTab === 1 ? 'active' : ''}`}>
          <div className="split-layout">
            <div className="split-sidebar">
              <Box className="card" sx={{ position: 'sticky', top: 24 }}>
                <div className="card-header"><div><div className="card-title">选择值班小组</div><div className="card-subtitle">选择小组后配置轮换规则。</div></div></div>
                <div className="form-row"><div className="form-group">
                  <label>值班小组</label>
                  <ReadOnlyDropdown
                    value={configGroup}
                    onChange={setConfigGroup}
                    options={dutyGroups.map(dg => dg.name)}
                    placeholder="请选择值班小组"
                  />
                </div></div>
              </Box>
            </div>
            <div className="split-main">
              <Box className="card" sx={{ minHeight: 500 }}>
                <div className="card-header">
                  <div><div className="card-title">轮换配置</div><div className="card-subtitle">设置值班轮换顺序、优先策略。</div></div>
                  <Button variant="contained" onClick={saveConfig} disabled={configSaveLoading}
                  startIcon={<SaveIcon />}>{configSaveLoading ? '保存中...' : '保存配置'}</Button>
                </div>
                <Box id="duty-config-form" sx={{ mt: 2.5 }}>
                  <div className="form-row">
                    <div className="form-group">
                      <label>值班人数（每组）</label>
                      <TextField type="number" size="small" fullWidth value={configData.duty_count ?? 1}
                        onChange={e => setConfigData({ ...configData, duty_count: parseInt(e.target.value) || 1 })}
                        inputProps={{ min: 1, max: 20 }} />
                    </div>
                    <div className="form-group">
                      <label>轮换起始日期（周日）</label>
                      <AppleDatePicker
                        value={configData.start_date ? dayjs(configData.start_date) : null}
                        onChange={(d) => setConfigData({ ...configData, start_date: d ? d.format('YYYY-MM-DD') : '' })}
                        shouldDisableDate={(d: dayjs.Dayjs) => d.day() !== 0}
                        todayLabel="本周日"
                        hideNext
                      />
                    </div>
                  </div>
                  <Box className="card inner-card" sx={{ mt: 2.25 }}>
                    <div className="card-header">
                      <div><Typography className="card-title" sx={{ fontSize: 18 }}>轮换顺序设置</Typography><div className="card-subtitle">拖动调整顺序，数字越小越先轮换。</div></div>
                      <Chip label={`${rotationOrder.length} 人`} size="small" variant="outlined" />
                    </div>
                    <Box sx={{ mt: 2 }}>
                      <div className="order-panels">
                        <div className="order-panel">
                          <Typography className="drag-panel-title" color="text.primary" sx={{ fontSize: '17px', fontWeight: 700, mb: 1.5 }}>
                            排序成员
                          </Typography>
                          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={rotationOrder} strategy={verticalListSortingStrategy}>
                              <div className="sortable-list">
                                {rotationOrder.map((name, idx) => (
                                  <SortableRow key={name} id={name} index={idx} onRemove={removeFromOrder} />
                                ))}
                              </div>
                            </SortableContext>
                          </DndContext>
                          {rotationOrder.length === 0 && (
                            <div className="empty-state" style={{ padding: '18px 0' }}>
                              <div className="empty-state-text">尚未添加轮换顺序</div>
                            </div>
                          )}
                        </div>
                        <div className="order-panel">
                          <Typography className="drag-panel-title" color="text.primary" sx={{ fontSize: '17px', fontWeight: 700, mb: 1.5 }}>
                            待排序成员 <span className="panel-title-hint">（点击姓名添加）</span>
                          </Typography>
                          {poolMembers.length === 0 ? (
                            <Typography color="text.secondary" sx={{ fontSize: '13px', py: 2 }}>该组成员已全部加入排序</Typography>
                          ) : (
                            <div className="pool-employee-list">
                              {poolMembers.map(name => (
                                <span key={name} className="pool-employee-chip" onClick={() => addToOrder(name)}>
                                  {name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </div>
          </div>
        </div>

        {/* ==== 值班表生成 ==== */}
        <div className={`tab-content ${subTab === 2 ? 'active' : ''}`}>
          <div className="section-two-col" style={{ gridTemplateColumns: '1fr 500px' }}>
            <div className="card">
              <div className="card-header"><div><div className="card-title">生成设置</div><div className="card-subtitle">默认显示本周值班表，切换日期自动更新。</div></div></div>
              <div className="form-row">
                <Box className="form-group" sx={{ flex: 1 }}>
                  <label>开始日期（周日）</label>
                  <AppleDatePicker
                    value={schedStartDate ? dayjs(schedStartDate) : null}
                    onChange={(d) => {
                      const val = d ? d.format('YYYY-MM-DD') : '';
                      setSchedStartDate(val);
                    }}
                    shouldDisableDate={(d: dayjs.Dayjs) => d.day() !== 0}
                    todayLabel="本周日"
                    hideNext
                  />
                </Box>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><div><div className="card-title">包含小组</div><div className="card-subtitle">选择需要参与本次值班的组别。</div></div></div>
              <div className="group-card-grid" id="duty-schedule-groups">
                {schedGroups.map(g => (
                  <div
                    key={g}
                    className={`group-card${schedSelected.has(g) ? ' selected' : ''}`}
                    onClick={() => toggleSched(g)}
                  >
                    <span className="group-card-check">{schedSelected.has(g) && <CheckIcon sx={{ fontSize: 13 }} />}</span>
                    <span className="group-card-name">{g}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {schedPreview && (
            <Box className="card" id="duty-schedule-preview-card" sx={{ display: 'block' }}>
              <div className="card-header">
                <div><div className="card-title">值班表预览{isFromSnapshot && <span id="duty-snapshot-badge" className="snapshot-badge">快照</span>}
                  <IconButton size="small" color="primary" onClick={generateDuty} disabled={schedLoading} title="Refresh" sx={{ verticalAlign: 'middle', ml: 1 }}>
                    <RefreshIcon />
                  </IconButton>
                </div><div className="card-subtitle" id="duty-preview-subtitle">预览生成的周末值班表。</div></div>
                <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="contained" startIcon={<SaveIcon />} onClick={saveSnapshot} disabled={snapSaving}>{snapSaving ? '保存中...' : (isFromSnapshot ? '更新快照' : '保存快照')}</Button>
              <Button variant="outlined" onClick={loadSnapshots}>查询快照</Button>
              <Button variant="contained" color="success" startIcon={<DownloadIcon />} onClick={exportImage}>导出图片</Button>
                </Box>
              </div>
              <Box className="preview-box" id="duty-schedule-preview" sx={{ height: 'auto', overflow: 'visible' }}>
                {renderTable()}
              </Box>
            </Box>
          )}
        </div>
      </Box>

      {/* ========== MODALS ========== */}

      <ModalPortal open={addGroupOpen} onClose={() => setAddGroupOpen(false)}>
        <Box sx={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 className="modal-title">添加小组</h3>
              <IconButton size="small" onClick={() => setAddGroupOpen(false)}><CloseIcon /></IconButton>
            </div>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2 }}>
              <TextField size="small" placeholder="输入小组名称" value={addGroupName}
                onChange={e => setAddGroupName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addGroup(); }}
                sx={{ flex: 1 }}
                autoFocus />
              <Button variant="contained" startIcon={<AddIcon />} onClick={addGroup} sx={{ flexShrink: 0 }}>创建</Button>
            </Box>
            <Box sx={{ position: 'relative', mb: 1 }}>
              {memberDropdown(memberSearch, memberResults, n => { setAddGroupMembers([...addGroupMembers, n]); setMemberSearch(''); setMemberResults([]); }, addGroupMembers, setMemberSearch, setMemberResults)}
            </Box>
            <Box className="selected-members-tags" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, minHeight: 36, py: 1 }}>
              {addGroupMembers.length === 0 ? <Typography component="span" sx={{ color: '#999', fontSize: 13 }}>暂未选择成员</Typography> :
                addGroupMembers.map(n => (
                  <span key={n} className="member-tag">
                    <span className="member-tag-icon">👤</span>{n}
                    <span className="member-tag-remove" onClick={() => setAddGroupMembers(addGroupMembers.filter(x => x !== n))}>×</span>
                  </span>
                ))
              }
            </Box>
          </Box>
      </ModalPortal>

      <ModalPortal open={editMembersOpen} onClose={() => setEditMembersOpen(false)}>
        <div >
            <div className="modal-header">
              <h3 className="modal-title">编辑小组 - <span id="edit-members-group-name">{editMembersGroup}</span></h3>
              <IconButton size="small" onClick={() => setEditMembersOpen(false)}>
                <CloseIcon /></IconButton>
            </div>
            <div>
              <Typography component="label" sx={{ fontSize: 14, fontWeight: 600, color: '#1d1d1f', mb: 0.75, display: 'block' }}>小组成员</Typography>
              <Box sx={{ position: 'relative', mb: 1.5 }}>
                {memberDropdown(editMemberSearch, editMemberResults, n => { if (!editMembersList.includes(n)) addMember(n); }, editMembersList, setEditMemberSearch, setEditMemberResults)}
              </Box>
              <Box id="members-list" sx={{ maxHeight: 300, overflowY: 'auto' }}>
                {editMembersList.length === 0 ? <div className="empty-state">暂无成员，请在上方搜索添加</div> :
                  editMembersList.map(m => (
                    <Box key={m} className="group-list-item fade-in" sx={{ mb: 1.25 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: 15 }}>{m}</Typography>
                      <Button size="small" variant="contained" color="error" onClick={() => removeMember(m)}>删除</Button>
                    </Box>
                  ))
                }
              </Box>
            </div>
          </div>
      </ModalPortal>

      <ModalPortal open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <Box sx={{ maxWidth: 400 }}>
            <div className="modal-header"><h3 className="modal-title">确认删除</h3>
              <IconButton size="small" onClick={() => setDeleteOpen(false)}>
                <CloseIcon /></IconButton>
            </div>
            <Box sx={{ py: 2.5 }}>
              <Typography color="text.primary" sx={{ fontSize: 15, lineHeight: 1.6 }}>确定要删除 <Typography component="strong" color="error">{deleteName}</Typography> 吗？</Typography>
              <Typography color="text.secondary" sx={{ fontSize: 13, mt: 1.25 }}>此操作不可恢复，请谨慎操作。</Typography>
            </Box>
            <Box className="form-row" sx={{ mt: 2.5, gap: 1.875 }}>
              <Button variant="contained" color="error" startIcon={<DeleteIcon />} onClick={doDelete} sx={{ flex: 1 }}>确认删除</Button>
              <Button variant="text" onClick={() => setDeleteOpen(false)} sx={{ flex: 1 }}>取消</Button>
            </Box>
          </Box>
      </ModalPortal>

      <ModalPortal open={snapshotOpen} onClose={() => setSnapshotOpen(false)}>
        <Box sx={{ maxWidth: 650 }}>
            <div className="modal-header">
              <h3 className="modal-title">查询值班快照</h3>
              <IconButton size="small" onClick={() => setSnapshotOpen(false)}>
                <CloseIcon /></IconButton>
            </div>
            <Box sx={{ py: 2.5 }}>
              {snapshots.length === 0 ? <div className="empty-state"><div className="empty-state-text">暂无快照记录</div></div> :
                snapshots.map(item => (
                  <div key={item.id} className="snapshot-card">
                    <div><Typography sx={{ fontSize: 16, fontWeight: 700, color: '#1d1d1f' }}>{item.week_key} (周日)</Typography><Typography sx={{ fontSize: 13, color: '#6e6e73', mt: 0.5 }}>{item.record_count || 0} 条记录 · {item.created_at || ''}</Typography></div>
                    <Box sx={{ display: 'flex', gap: 1 }}><Button size="small" variant="outlined" onClick={() => loadSnapshotDetail(item.id)}>加载</Button><Button size="small" variant="contained" color="error" onClick={() => deleteSnapshot(item.id)}>删除</Button></Box>
                  </div>
                ))
              }
            </Box>
          </Box>
      </ModalPortal>

      {/* 轮休设置模态框 */}
      <ModalPortal
        open={restDayModal}
        onClose={() => { setRestDayModal(false); setRestDayCtx(null); }}
        title="设置轮休"
        maxWidth={400}
        height={300}
      >
        <Box>
          {(() => {
            // 收集本周已值班员工
            const week = schedData?.weeks?.find((w: any) => w.date === restDayCtx?.weekKey);
            const weekEmployees = week ? collectWeekEmployees(week) : [];

            const labelSx = { display: 'block', fontSize: 15, fontWeight: 600, color: '#1d1d1f', mb: 1, textAlign: 'left' as const };

            return restDayCtx?.mode === 'type' ? (
              <>
                <Typography component="label" sx={labelSx}>轮休日期</Typography>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <ReadOnlyDropdown
                      value={restDaySelect}
                      onChange={setRestDaySelect}
                      options={['周六轮休', '周一轮休', '周二轮休', '周三轮休', '周四轮休', '周五轮休']}
                      emptyLabel="空"
                    />
                  </Box>
                  <Button variant="contained" onClick={confirmRestDay} sx={{ flexShrink: 0 }}>确定</Button>
                </Box>
              </>
            ) : (
              <>
                <Typography component="label" sx={labelSx}>选择员工</Typography>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                  <Autocomplete
                    value={restDaySelect || null}
                    onChange={(_, v) => setRestDaySelect(v || '')}
                    options={['', ...weekEmployees]}
                    getOptionLabel={(o) => o === '' ? '空' : o}
                    renderInput={(params) => <TextField {...params} placeholder="搜索员工..." />}
                    clearOnBlur={false}
                    sx={{ flex: 1, minWidth: 0 }}
                  />
                  <Button variant="contained" onClick={confirmRestDay} sx={{ flexShrink: 0 }}>确定</Button>
                </Box>
              </>
            );
          })()}
        </Box>
      </ModalPortal>

    </div>
  );
}
