import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import { Button, IconButton, TextField, Box, Typography, Alert, Chip, Autocomplete } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import DeleteIcon from '@mui/icons-material/Delete';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '../../api/client';
import { useToast } from '../common/Toast';
import ModalPortal from '../common/ModalPortal';
import AppleDatePicker from '../common/AppleDatePicker';
import ReadOnlyDropdown from '../common/ReadOnlyDropdown';

interface Employee {
  name: string;
  group: string;
  shift_type: string;
  fixed_time: string;
  pinyin_initials: string;
}

interface SubgroupData {
  name: string;
  members: string[];
  times: string[];
  initial_order: number;
}

interface SinglePersonData {
  name: string;
  times: string[];
  start_week: string;
}

const SHIFT_TIMES = ['8:00', '9:00', '10:00', '11:00', '13:00'];

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

interface ConfigRulesProps {
  group: string;
  onSaved: () => void;
}

export default function ConfigRules({ group, onSaved }: ConfigRulesProps) {
  const toast = useToast();

  // --- State ---
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [ruleFunction, setRuleFunction] = useState('multi-person');

  // Multi-person
  const [multiLoading, setMultiLoading] = useState(false);
  const [multiConfig, setMultiConfig] = useState<{
    priority?: string;
    shift_times?: string[];
    early_shift_count?: number;
    late_shift_count?: number;
    rotation_order?: string[];
  }>({});
  const [rotationOrder, setRotationOrder] = useState<string[]>([]);
  const [poolEmployees, setPoolEmployees] = useState<string[]>([]);
  const [useSpecialRotation, setUseSpecialRotation] = useState(false);
  const [specialTimes, setSpecialTimes] = useState<string[]>(['8:00', '10:00']);
  const [defaultTime, setDefaultTime] = useState('9:00');

  // Subgroup
  const [subgroups, setSubgroups] = useState<SubgroupData[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [subgroupModalOpen, setSubgroupModalOpen] = useState(false);
  const [editingSubgroupName, setEditingSubgroupName] = useState<string | null>(null);
  const [subgroupForm, setSubgroupForm] = useState<SubgroupData>({
    name: '', members: ['', ''], times: ['9:00', '10:00'], initial_order: 0,
  });
  const [subgroupAlert, setSubgroupAlert] = useState('');

  // Single person
  const [singlePersons, setSinglePersons] = useState<SinglePersonData[]>([]);
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleModalOpen, setSingleModalOpen] = useState(false);
  const [editingSingleName, setEditingSingleName] = useState<string | null>(null);
  const [singleForm, setSingleForm] = useState<SinglePersonData>({
    name: '', times: ['9:00', '13:00'], start_week: '单周',
  });
  const [singleAlert, setSingleAlert] = useState('');

  // Single delete
  const [singleDeleteOpen, setSingleDeleteOpen] = useState(false);
  const [singleDeleteName, setSingleDeleteName] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  // Rotation start date
  const [rotationStartDate, setRotationStartDate] = useState('');

  // --- API ---
  const loadEmployees = useCallback(async () => {
    try {
      const { data } = await api.get<Employee[]>('/employees');
      setAllEmployees(data);
    } catch (e: any) {
      toast.show(e.response?.data?.detail || '加载员工失败', 'error');
    }
  }, [toast]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  // selectedGroup → group prop：切换组别时统一加载全部三种轮换配置到编辑区
  const loadAllGroupConfigs = useCallback(async (group: string) => {
    if (!group) return;
    setMultiLoading(true);
    setSubLoading(true);
    setSingleLoading(true);
    try {
      const { data } = await api.get(`/group-config/${encodeURIComponent(group)}`);
      // 多人轮换
      setMultiConfig(data);
      const order = data.rotation_order || [];
      const groupEmployees = allEmployees.filter(e => e.group === group && e.shift_type === 'rotation');
      const orderedNames = new Set(order);
      setRotationOrder(order);
      setPoolEmployees(groupEmployees.filter(e => !orderedNames.has(e.name)).map(e => e.name));
      if (data.special_times?.length) {
        setUseSpecialRotation(true);
        setSpecialTimes(data.special_times);
        setDefaultTime(data.default_time || '9:00');
      } else {
        setUseSpecialRotation(false);
      }
      // 轮换起始日期
      if (data.rotation_start_date) {
        setRotationStartDate(data.rotation_start_date);
      }
      // 子组轮换
      setSubgroups(data.subgroups || []);
      // 单人轮换
      setSinglePersons(data.single_rotations || []);
    } catch {
      setMultiConfig({});
      const groupEmployees = allEmployees.filter(e => e.group === group && e.shift_type === 'rotation');
      setRotationOrder([]);
      setPoolEmployees(groupEmployees.map(e => e.name));
      setSubgroups([]);
      setSinglePersons([]);
    }
    setMultiLoading(false);
    setSubLoading(false);
    setSingleLoading(false);
  }, [allEmployees]);

  useEffect(() => {
    if (group) {
      loadAllGroupConfigs(group);
    }
  }, [group, loadAllGroupConfigs]);

  const saveMultiConfig = async () => {
    setSavingId('multi');
    try {
      const order = rotationOrder;
      const payload = {
        priority: multiConfig.priority ?? '优先早班',
        shift_times: multiConfig.shift_times ?? ['9:00', '13:00'],
        early_shift_count: multiConfig.early_shift_count ?? 2,
        late_shift_count: multiConfig.late_shift_count ?? 3,
        rotation_order: order,
        special_times: useSpecialRotation ? specialTimes.filter(t => t) : [],
        default_time: useSpecialRotation ? defaultTime : '',
        rotation_start_date: rotationStartDate || null,
      };
      const { data: existing } = await api.get(`/group-config/${encodeURIComponent(group)}`);
      await api.put(`/group-config/${encodeURIComponent(group)}`, { ...existing, ...payload });
      toast.show('多人轮换配置已保存');
      onSaved();
    } catch (e: any) {
      toast.show(e.response?.data?.detail || '保存配置失败', 'error');
    } finally { setSavingId(null); }
  };

  // —— 轮换顺序：添加 / 移除 / 拖拽排序 ——
  const addToOrder = (name: string) => {
    if (!name || rotationOrder.includes(name)) return;
    setRotationOrder(prev => [...prev, name]);
    setPoolEmployees(prev => prev.filter(n => n !== name));
  };

  const removeFromOrder = (name: string) => {
    setRotationOrder(prev => prev.filter(n => n !== name));
    setPoolEmployees(prev => [...prev, name]);
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
  // --- Subgroup config ---
  const saveSubgroupConfig = async () => {
    setSavingId('sub');
    try {
      const { data: existing } = await api.get(`/group-config/${encodeURIComponent(group)}`);
      await api.put(`/group-config/${encodeURIComponent(group)}`, {
        ...existing,
        subgroups,
      });
      toast.show('子组配置已保存');
      onSaved();
    } catch (e: any) {
      toast.show(e.response?.data?.detail || '保存配置失败', 'error');
    } finally { setSavingId(null); }
  };

  const openSubgroupModal = (sg?: SubgroupData) => {
    if (sg) {
      setEditingSubgroupName(sg.name);
      setSubgroupForm(sg);
    } else {
      setEditingSubgroupName(null);
      setSubgroupForm({ name: '', members: ['', ''], times: ['9:00', '10:00'], initial_order: 0 });
    }
    setSubgroupAlert('');
    setSubgroupModalOpen(true);
  };

  const submitSubgroupForm = () => {
    if (!subgroupForm.name.trim()) {
      setSubgroupAlert('请输入子组名称');
      return;
    }
    if (!subgroupForm.members[0] || !subgroupForm.members[1]) {
      setSubgroupAlert('请选择两位成员');
      return;
    }
    if (editingSubgroupName) {
      setSubgroups(prev => prev.map(s =>
        s.name === editingSubgroupName ? subgroupForm : s
      ));
    } else {
      setSubgroups(prev => [...prev, subgroupForm]);
    }
    setSubgroupModalOpen(false);
  };

  const deleteSubgroup = (name: string) => {
    setSubgroups(prev => prev.filter(s => s.name !== name));
  };

  // --- Single person config ---
  const saveSingleConfig = async () => {
    setSavingId('single');
    try {
      const { data: existing } = await api.get(`/group-config/${encodeURIComponent(group)}`);
      await api.put(`/group-config/${encodeURIComponent(group)}`, {
        ...existing,
        single_rotations: singlePersons,
      });
      toast.show('单人轮换配置已保存');
      onSaved();
    } catch (e: any) {
      toast.show(e.response?.data?.detail || '保存配置失败', 'error');
    } finally { setSavingId(null); }
  };

  const openSingleModal = (sp?: SinglePersonData) => {
    if (sp) {
      setEditingSingleName(sp.name);
      setSingleForm(sp);
    } else {
      setEditingSingleName(null);
      setSingleForm({ name: '', times: ['9:00', '13:00'], start_week: '单周' });
    }
    setSingleAlert('');
    setSingleModalOpen(true);
  };

  const submitSingleForm = () => {
    if (!singleForm.name.trim()) {
      setSingleAlert('请选择员工');
      return;
    }
    if (editingSingleName) {
      setSinglePersons(prev => prev.map(s =>
        s.name === editingSingleName ? singleForm : s
      ));
    } else {
      setSinglePersons(prev => [...prev, singleForm]);
    }
    setSingleModalOpen(false);
  };

  const deleteSinglePerson = (name: string) => {
    setSinglePersons(prev => prev.filter(s => s.name !== name));
  };

  // Available employees for the selected group
  const groupEmployees = allEmployees.filter(e => e.group === group);
  const availableEmployees = groupEmployees.filter(e =>
    !singlePersons.some(sp => sp.name === e.name) &&
    e.shift_type === 'rotation'
  );

  // Empty group guard
  if (!group) {
    return (
      <Typography color="text.secondary" sx={{ fontSize: '15px', py: 7.5, textAlign: 'center' }}>
        请在左侧选择组别以开始配置轮换规则。
      </Typography>
    );
  }

  return (
    <>
      {/* Rule Configuration */}
      <div>
        <div className="card-selection-bar">
            <button
              className={`function-tab ${ruleFunction === 'multi-person' ? 'active' : ''}`}
              onClick={() => setRuleFunction('multi-person')}
            >
              多人轮换
            </button>
            <button
              className={`function-tab ${ruleFunction === 'subgroup' ? 'active' : ''}`}
              onClick={() => setRuleFunction('subgroup')}
            >
              子组轮换
            </button>
            <button
              className={`function-tab ${ruleFunction === 'single-person' ? 'active' : ''}`}
              onClick={() => setRuleFunction('single-person')}
            >
              单人轮换
            </button>
          </div>

          {/* Multi-person function */}
          <div className={`rule-function ${ruleFunction === 'multi-person' ? 'active' : ''}`}>
            <div className="card">
              <div className="card-header">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                  <Typography className="card-title" sx={{ mb: 0 }}>多人轮换功能</Typography>
                  <Typography component="span" className="card-highlight" sx={{
                    background: 'rgba(66,133,244,0.08)', color: '#4285f4', py: 0.5, px: 1.5,
                    borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                  }}>
                    适合整组轮换
                  </Typography>
                </Box>
                <Button variant="contained" size="small" startIcon={<SaveIcon />} onClick={saveMultiConfig} disabled={savingId !== null}>
                  {savingId === 'multi' ? '保存中...' : '保存配置'}
                </Button>
              </div>

              <Box sx={{ mt: 2.5 }}>
                <div className="multi-config-layout">
                {/* 轮换模式切换（竖列） */}
                <div className="mode-segment" role="group" aria-label="轮换模式">
                  <button
                    type="button"
                    className={`mode-segment-btn${!useSpecialRotation ? ' active' : ''}`}
                    onClick={() => setUseSpecialRotation(false)}
                  >
                    标准轮换
                  </button>
                  <button
                    type="button"
                    className={`mode-segment-btn${useSpecialRotation ? ' active' : ''}`}
                    onClick={() => setUseSpecialRotation(true)}
                  >
                    特殊轮换
                  </button>
                </div>

                {useSpecialRotation ? (
                  <div className="config-grid config-grid-2">
                    <div className="form-group">
                      <label>特殊时间</label>
                      <TextField
                        size="small"
                        fullWidth
                        value={specialTimes.join(', ')}
                        onChange={e => setSpecialTimes(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        placeholder="8:00, 10:00"
                        helperText="逗号分隔，几段时间就挑几人"
                      />
                    </div>
                    <div className="form-group">
                      <label>默认时间</label>
                      <ReadOnlyDropdown value={defaultTime} onChange={setDefaultTime} options={SHIFT_TIMES} />
                      <Typography className="field-helper">未进入特殊时间的员工上班时间</Typography>
                    </div>
                  </div>
                ) : (
                  <div className="config-grid config-grid-3 config-grid-fill">
                    <div className="form-group">
                      <label>优先策略</label>
                      <ReadOnlyDropdown
                        value={multiConfig.priority ?? '优先早班'}
                        onChange={(v) => setMultiConfig({ ...multiConfig, priority: v })}
                        options={['优先早班', '优先晚班']}
                      />
                    </div>
                    <div className="form-group">
                      <label>早班时间</label>
                      <ReadOnlyDropdown
                        value={multiConfig.shift_times?.[0] || '9:00'}
                        onChange={(v) => {
                          const times = [...(multiConfig.shift_times ?? ['9:00', '13:00'])];
                          times[0] = v;
                          setMultiConfig({ ...multiConfig, shift_times: times });
                        }}
                        options={SHIFT_TIMES}
                      />
                    </div>
                    <div className="form-group">
                      <label>晚班时间</label>
                      <ReadOnlyDropdown
                        value={multiConfig.shift_times?.[1] || '13:00'}
                        onChange={(v) => {
                          const times = [...(multiConfig.shift_times ?? ['9:00', '13:00'])];
                          times[1] = v;
                          setMultiConfig({ ...multiConfig, shift_times: times });
                        }}
                        options={SHIFT_TIMES}
                      />
                    </div>
                    <div className="form-group">
                      <label>轮换起始日期</label>
                      <AppleDatePicker
                        value={rotationStartDate ? dayjs(rotationStartDate) : null}
                        onChange={(d) => setRotationStartDate(d ? d.format('YYYY-MM-DD') : '')}
                      />
                    </div>
                    <div className="form-group">
                      <label>早班人数</label>
                      <TextField
                        type="number"
                        size="small"
                        fullWidth
                        value={multiConfig.early_shift_count ?? 2}
                        onChange={(e) => setMultiConfig({ ...multiConfig, early_shift_count: parseInt(e.target.value) || 0 })}
                        inputProps={{ min: 1 }}
                      />
                    </div>
                    <div className="form-group">
                      <label>晚班人数</label>
                      <TextField
                        type="number"
                        size="small"
                        fullWidth
                        value={multiConfig.late_shift_count ?? 3}
                        onChange={(e) => setMultiConfig({ ...multiConfig, late_shift_count: parseInt(e.target.value) || 0 })}
                        inputProps={{ min: 1 }}
                      />
                    </div>
                  </div>
                )}
                </div>

                {/* 轮换顺序设置 */}
                <Box className="card inner-card" sx={{ mt: 2.25, border: '1px solid rgba(15,23,42,0.06)', borderRadius: '18px' }}>
                  <div className="card-header">
                    <div>
                      <Typography className="card-title" sx={{ fontSize: '18px' }}>轮换顺序设置</Typography>
                      <div className="card-subtitle">拖动调整顺序，数字越小越先轮换。</div>
                    </div>
                    <Chip label={`${rotationOrder.length} 人`} size="small" variant="outlined" />
                  </div>
                  <Box sx={{ mt: 2 }}>
                    <div className="order-panels">
                      <div className="order-panel">
                        <Typography className="drag-panel-title" color="text.primary" sx={{ fontSize: '17px', fontWeight: 700, mb: 1.5 }}>
                          排序员工
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
                          待排序员工 <span className="panel-title-hint">（点击姓名添加）</span>
                        </Typography>
                        {poolEmployees.length === 0 ? (
                          <Typography color="text.secondary" sx={{ fontSize: '13px', py: 2 }}>该组员工已全部加入排序</Typography>
                        ) : (
                          <div className="pool-employee-list">
                            {poolEmployees.map(name => (
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
            </div>
          </div>


          {/* Subgroup function */}
          <div className={`rule-function ${ruleFunction === 'subgroup' ? 'active' : ''}`}>
            <div className="card">
              <div className="card-header">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                  <Typography className="card-title" sx={{ mb: 0 }}>子组轮换功能</Typography>
                  <Typography component="span" className="card-highlight" sx={{
                    background: 'rgba(52,199,89,0.08)', color: '#34c759', py: 0.5, px: 1.5,
                    borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                  }}>
                    适合双人互换
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button variant="outlined" size="small" color="primary" startIcon={<AddIcon />} onClick={() => openSubgroupModal()}>添加子组</Button>
                  <Button variant="contained" size="small" startIcon={<SaveIcon />} onClick={saveSubgroupConfig}
                    disabled={savingId !== null}>
                    {savingId === 'sub' ? '保存中...' : '保存配置'}
                  </Button>
                </Box>
              </div>

              <Box sx={{ mt: 2.25 }}>
                {subgroups.length === 0 ? (
                  <Typography color="text.secondary" sx={{ fontSize: '14px', py: 3.75, textAlign: 'center' }}>
                    暂无子组配置，点击"添加子组"开始配置。
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {subgroups.map((sg, idx) => (
                      <Box key={sg.name || idx} sx={{
                        background: 'rgba(255,255,255,0.8)',
                        border: '1px solid rgba(15,23,42,0.08)',
                        borderRadius: '16px',
                        p: 2,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}>
                        <div>
                          <Typography sx={{ fontSize: '16px', fontWeight: 700, mb: 0.5 }}>{sg.name}</Typography>
                          <Typography sx={{ fontSize: '13px', color: '#6e6e73' }}>
                            {sg.members[0]} ({sg.times[0]}) ↔ {sg.members[1]} ({sg.times[1]})
                          </Typography>
                        </div>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button size="small" variant="outlined" onClick={() => openSubgroupModal(sg)}>编辑</Button>
                          <Button size="small" variant="contained" color="error" onClick={() => deleteSubgroup(sg.name)}>删除</Button>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            </div>
          </div>

          {/* Single person function */}
          <div className={`rule-function ${ruleFunction === 'single-person' ? 'active' : ''}`}>
            <div className="card">
              <div className="card-header">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                  <Typography className="card-title" sx={{ mb: 0 }}>单人轮换功能</Typography>
                  <Typography component="span" className="card-highlight" sx={{
                    background: 'rgba(255,159,10,0.08)', color: '#b45309', py: 0.5, px: 1.5,
                    borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                  }}>
                    适合个人轮换
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button variant="outlined" size="small" color="primary" startIcon={<PersonAddIcon />} onClick={() => openSingleModal()}>添加轮换员工</Button>
                  <Button variant="contained" size="small" startIcon={<SaveIcon />} onClick={saveSingleConfig}
                    disabled={savingId !== null}>
                    {savingId === 'single' ? '保存中...' : '保存配置'}
                  </Button>
                </Box>
              </div>

              <Box sx={{ mt: 2.25 }}>
                {singlePersons.length === 0 ? (
                  <Typography color="text.secondary" sx={{ fontSize: '14px', py: 3.75, textAlign: 'center' }}>
                    暂无单人轮换配置，点击"添加轮换员工"开始配置。
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {singlePersons.map((sp, idx) => (
                      <Box key={sp.name || idx} sx={{
                        background: 'rgba(255,255,255,0.8)',
                        border: '1px solid rgba(15,23,42,0.08)',
                        borderRadius: '16px',
                        py: 1.75, px: 2,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}>
                        <div>
                          <Typography sx={{ fontSize: '15px', fontWeight: 700 }}>{sp.name}</Typography>
                          <Typography sx={{ fontSize: '13px', color: '#6e6e73', mt: 0.5 }}>
                            时间: {sp.times[0]} / {sp.times[1]} | 起始周: {sp.start_week || '-'}
                          </Typography>
                        </div>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button size="small" variant="outlined" onClick={() => openSingleModal(sp)}>编辑</Button>
                          <Button size="small" variant="contained" color="error" onClick={() => {
                            setSingleDeleteName(sp.name);
                            setSingleDeleteOpen(true);
                          }}>删除</Button>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            </div>
          </div>
        </div>

      {/* Subgroup Modal */}
      <ModalPortal open={subgroupModalOpen} onClose={() => setSubgroupModalOpen(false)}>
        <div style={{ maxWidth: '620px' }}>
            <div className="modal-header">
              <h3 className="modal-title">{editingSubgroupName ? '编辑子组' : '子组配置'}</h3>
              <IconButton size="small" onClick={() => setSubgroupModalOpen(false)}><CloseIcon /></IconButton>
            </div>

            {subgroupAlert && (
              <Alert severity="error" sx={{ mb: 2 }}>{subgroupAlert}</Alert>
            )}

            <form onSubmit={(e) => { e.preventDefault(); submitSubgroupForm(); }}>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2.5 }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="子组名称"
                  value={subgroupForm.name}
                  onChange={(e) => setSubgroupForm({ ...subgroupForm, name: e.target.value })}
                  required
                />
<Button type="submit" variant="contained" startIcon={<SaveIcon />} disabled={savingId !== null} sx={{ flexShrink: 0 }}>
                  {savingId === 'sub' ? '保存中...' : '保存'}
                </Button>
              </Box>

              <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'flex-start' }}>
                <Box sx={{ flex: 1 }}>
                  <Chip label="成员一" size="small" color="primary" variant="outlined" sx={{ mb: 1 }} />
                  <Box sx={{ mb: 1 }}>
                    <Autocomplete
                      value={subgroupForm.members[0] || null}
                      onChange={(_, v) => {
                        const m = [...(subgroupForm.members || ['', ''])];
                        m[0] = v || '';
                        setSubgroupForm({ ...subgroupForm, members: m });
                      }}
                      options={groupEmployees.map(e => e.name)}
                      renderInput={(params) => <TextField {...params} placeholder="搜索成员..." />}
                      clearOnBlur={false}
                    />
                  <ReadOnlyDropdown
                    value={subgroupForm.times[0] || '9:00'}
                    onChange={(v) => {
                      const t = [...(subgroupForm.times || ['9:00', '10:00'])];
                      t[0] = v;
                      setSubgroupForm({ ...subgroupForm, times: t });
                    }}
                    options={SHIFT_TIMES}
                  />
                </Box>
                </Box>

                <Box sx={{ textAlign: 'center', flexShrink: 0, pt: 3.5 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#4285f4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
                    <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                </Box>

                <Box sx={{ flex: 1 }}>
                  <Chip label="成员二" size="small" color="success" variant="outlined" sx={{ mb: 1 }} />
                  <Box sx={{ mb: 1 }}>
                    <Autocomplete
                      value={subgroupForm.members[1] || null}
                      onChange={(_, v) => {
                        const m = [...(subgroupForm.members || ['', ''])];
                        m[1] = v || '';
                        setSubgroupForm({ ...subgroupForm, members: m });
                      }}
                      options={groupEmployees.map(e => e.name)}
                      renderInput={(params) => <TextField {...params} placeholder="搜索成员..." />}
                      clearOnBlur={false}
                    />
                  <ReadOnlyDropdown
                    value={subgroupForm.times[1] || '10:00'}
                    onChange={(v) => {
                      const t = [...(subgroupForm.times || ['9:00', '10:00'])];
                      t[1] = v;
                      setSubgroupForm({ ...subgroupForm, times: t });
                    }}
                    options={SHIFT_TIMES}
                  />
                </Box>
                </Box>
              </Box>
            </form>
          </div>
      </ModalPortal>

      {/* Single Person Modal */}
      <ModalPortal open={singleModalOpen} onClose={() => setSingleModalOpen(false)}>
        <div style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 className="modal-title">{editingSingleName ? '编辑单人轮换配置' : '编辑单人轮换配置'}</h3>
              <IconButton size="small" onClick={() => setSingleModalOpen(false)}><CloseIcon /></IconButton>
            </div>

            {singleAlert && (
              <Alert severity="error" sx={{ mb: 2 }}>{singleAlert}</Alert>
            )}

            <form onSubmit={(e) => { e.preventDefault(); submitSingleForm(); }}>
              <Box sx={{ mb: 2 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 1 }}>员工选择</Typography>
                  <Autocomplete
                    value={singleForm.name || null}
                    onChange={(_, v) => setSingleForm({ ...singleForm, name: v || '' })}
                    options={availableEmployees.map(e => e.name)}
                    renderInput={(params) => <TextField {...params} placeholder="搜索员工..." />}
                    clearOnBlur={false}
                  />
                </Box>
              </Box>

              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 1 }}>时间点 1</Typography>
                  <ReadOnlyDropdown
                    value={singleForm.times[0] || '9:00'}
                    onChange={(v) => {
                      const t = [...(singleForm.times || ['9:00', '13:00'])];
                      t[0] = v;
                      setSingleForm({ ...singleForm, times: t });
                    }}
                    options={SHIFT_TIMES}
                  />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 1 }}>时间点 2</Typography>
                  <ReadOnlyDropdown
                    value={singleForm.times[1] || '13:00'}
                    onChange={(v) => {
                      const t = [...(singleForm.times || ['9:00', '13:00'])];
                      t[1] = v;
                      setSingleForm({ ...singleForm, times: t });
                    }}
                    options={SHIFT_TIMES}
                  />
                </Box>
              </Box>

              <Box sx={{ mb: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 1 }}>起始周次</Typography>
                  <ReadOnlyDropdown
                    value={singleForm.start_week}
                    onChange={(v) => setSingleForm({ ...singleForm, start_week: v })}
                    options={['单周', '双周']}
                    getOptionLabel={(v) => (v === '单周' ? '单周（第一周）' : '双周（第二周）')}
                  />
                </Box>
              </Box>

              <div style={{ textAlign: 'right', marginTop: '8px' }}>
<Button type="submit" variant="contained" startIcon={<SaveIcon />} disabled={savingId !== null}>
                  {savingId === 'single' ? '保存中...' : '保存'}
                </Button>
              </div>
            </form>
          </div>
      </ModalPortal>

      {/* Single Person Delete Modal */}
      <ModalPortal open={singleDeleteOpen} onClose={() => setSingleDeleteOpen(false)}>
        <div style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 className="modal-title">确认删除轮换配置</h3>
            </div>

            <div style={{ padding: '20px 0' }}>
              <p style={{ fontSize: '15px', color: '#333', lineHeight: 1.6 }}>
                确定要删除员工 <strong style={{ color: '#dc3545' }}>{singleDeleteName}</strong> 的单人轮换配置吗？
              </p>
              <p style={{ fontSize: '13px', color: '#666', marginTop: '10px' }}>
                此操作不可恢复，请谨慎操作。
              </p>
            </div>

            <div className="form-row" style={{ marginTop: '20px', gap: '15px' }}>
              <Button variant="contained" color="error" startIcon={<DeleteIcon />} onClick={() => { deleteSinglePerson(singleDeleteName); setSingleDeleteOpen(false); }} style={{ flex: 1 }}>
                确认删除
              </Button>
              <Button variant="text" onClick={() => setSingleDeleteOpen(false)} style={{ flex: 1 }}>
                取消
              </Button>
            </div>
          </div>
      </ModalPortal>
    </>
  );
}
