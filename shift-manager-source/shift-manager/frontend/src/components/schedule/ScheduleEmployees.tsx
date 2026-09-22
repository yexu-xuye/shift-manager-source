import { useState, useEffect, useCallback, useRef } from 'react';
import { MenuItem, Button, IconButton, TextField, InputAdornment, Box, Typography, Alert, Chip, Menu } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import api from '../../api/client';
import { useToast } from '../common/Toast';
import ModalPortal from '../common/ModalPortal';
import ReadOnlyDropdown from '../common/ReadOnlyDropdown';

interface Employee {
  name: string;
  group: string;
  shift_type: string;
  fixed_time: string;
  pinyin_initials: string;
}

const SHIFT_TIMES = ['8:00', '9:00', '10:00', '11:00', '13:00'];

export default function ScheduleEmployees() {
  const toast = useToast();

  // --- State ---
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [filterGroup, setFilterGroup] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  // Employee modal
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState({ name: '', group: '', shift_type: 'rotation', fixed_time: '9:00' });
  const [empAlert, setEmpAlert] = useState('');

  // Delete modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteEmpName, setDeleteEmpName] = useState('');

  // Group modal
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [groupAlert, setGroupAlert] = useState('');
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);
  const [settingsMenuAnchor, setSettingsMenuAnchor] = useState<null | HTMLElement>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  // --- API ---
  const loadEmployees = useCallback(async (group?: string) => {
    try {
      const { data } = await api.get<Employee[]>('/employees', { params: group ? { group } : {} });
      setEmployees(data);
    } catch (e: any) {
      toast.show(e.response?.data?.detail || '加载员工失败', 'error');
    }
  }, [toast]);

  const loadGroups = useCallback(async () => {
    try {
      const { data } = await api.get<string[]>('/groups');
      setGroups(data);
    } catch (e: any) {
      toast.show(e.response?.data?.detail || '加载组别失败', 'error');
    }
  }, [toast]);

  useEffect(() => { loadGroups(); }, [loadGroups]);
  useEffect(() => { loadEmployees(filterGroup || undefined); }, [filterGroup, loadEmployees]);

  // --- Sorting ---
  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortedEmployees = [...employees].sort((a, b) => {
    if (sortKey === 'shift_type') {
      const cmp = a.shift_type === 'fixed' && b.shift_type !== 'fixed' ? 1
        : a.shift_type !== 'fixed' && b.shift_type === 'fixed' ? -1 : a.name.localeCompare(b.name);
      return sortAsc ? cmp : -cmp;
    }
    if (sortKey === 'fixed_time') {
      const aTime = a.shift_type === 'fixed' ? a.fixed_time : '99:99';
      const bTime = b.shift_type === 'fixed' ? b.fixed_time : '99:99';
      return sortAsc ? aTime.localeCompare(bTime) : bTime.localeCompare(aTime);
    }
    return 0;
  });

  const filteredEmployees = sortedEmployees.filter(emp => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return emp.name.toLowerCase().includes(q) || (emp.pinyin_initials || '').toLowerCase().includes(q);
  });

  // --- Employee CRUD ---
  const openAddModal = () => {
    setEditingEmp(null);
    setEmpForm({ name: '', group: filterGroup || groups[0] || '', shift_type: 'rotation', fixed_time: '9:00' });
    setEmpAlert('');
    setEmpModalOpen(true);
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmp(emp);
    setEmpForm({ name: emp.name, group: emp.group, shift_type: emp.shift_type, fixed_time: emp.fixed_time });
    setEmpAlert('');
    setEmpModalOpen(true);
  };

  const closeModal = () => {
    setEmpModalOpen(false);
    setEditingEmp(null);
  };

  const submitEmployeeForm = async () => {
    if (!empForm.name.trim()) {
      setEmpAlert('请输入姓名');
      return;
    }
    if (!empForm.group) {
      setEmpAlert('请选择组别');
      return;
    }
    setSaveLoading(true);
    try {
      if (editingEmp) {
        await api.put(`/employees/${encodeURIComponent(editingEmp.name)}`, {
          new_name: empForm.name.trim(),
          new_group: empForm.group,
          new_shift_type: empForm.shift_type,
          new_fixed_time: empForm.shift_type === 'fixed' ? empForm.fixed_time : '',
        });
        toast.show('员工已更新');
      } else {
        await api.post('/employees', {
          name: empForm.name.trim(),
          group: empForm.group,
          shift_type: empForm.shift_type,
          fixed_time: empForm.shift_type === 'fixed' ? empForm.fixed_time : '',
        });
        toast.show('员工已添加');
      }
      setEmpModalOpen(false);
      loadEmployees(filterGroup || undefined);
      loadGroups();
    } catch (e: any) {
      setEmpAlert(e.response?.data?.detail || '操作失败');
    } finally { setSaveLoading(false); }
  };

  const openDeleteModal = (emp: Employee) => {
    setDeleteEmpName(emp.name);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    try {
      await api.delete(`/employees/${encodeURIComponent(deleteEmpName)}`);
      toast.show('员工已删除');
      setDeleteModalOpen(false);
      loadEmployees(filterGroup || undefined);
      loadGroups();
    } catch (e: any) {
      toast.show(e.response?.data?.detail || '删除失败', 'error');
    }
  };

  // --- Group CRUD ---
  const addGroup = async () => {
    if (!newGroupName.trim()) {
      setGroupAlert('请输入组名');
      return;
    }
    try {
      await api.post('/groups', { name: newGroupName.trim() });
      toast.show('组别已添加');
      setNewGroupName('');
      loadGroups();
    } catch (e: any) {
      setGroupAlert(e.response?.data?.detail || '添加组别失败');
    }
  };

  const confirmGroupDelete = async () => {
    if (!groupToDelete) return;
    try {
      await api.delete(`/groups/${encodeURIComponent(groupToDelete)}`);
      toast.show('组别已删除');
      setGroupToDelete(null);
      loadGroups();
      loadEmployees('');
    } catch (e: any) {
      toast.show(e.response?.data?.detail || '删除组别失败', 'error');
    }
  };

  return (
    <>
      <div className="card">
        <div className="table-toolbar">
          <div className="table-toolbar-left">
            <TextField
              size="small"
              placeholder="搜索员工姓名或首字母"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: '#9ca3af' }} /></InputAdornment>,
              }}
              sx={{
                minWidth: 200,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 999,
                  fontSize: 15,
                  paddingLeft: 1,
                },
              }}
            />
          </div>
          <div className="table-toolbar-right">
            <IconButton onClick={(e) => setSettingsMenuAnchor(e.currentTarget)} sx={{ width: 40, height: 40 }} title="设置">
              <SettingsIcon />
            </IconButton>
            <Menu anchorEl={settingsMenuAnchor} open={Boolean(settingsMenuAnchor)} onClose={() => setSettingsMenuAnchor(null)}>
              <MenuItem onClick={() => { setSettingsMenuAnchor(null); openAddModal(); }}>添加员工</MenuItem>
              <MenuItem onClick={() => { setSettingsMenuAnchor(null); setGroupAlert(''); setGroupToDelete(null); setGroupModalOpen(true); }}>编辑组别</MenuItem>
            </Menu>
          </div>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th className="col-spacer-left"></th>
                <th className="col-name">姓名</th>
                <th className="col-group">
                  <select
                    value={filterGroup}
                    onChange={(e) => setFilterGroup(e.target.value)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      textAlign: 'center',
                      textAlignLast: 'center',
                      fontWeight: 700,
                      color: '#86868b',
                      fontSize: 19,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                      appearance: 'none',
                      paddingRight: 16,
                      fontFamily: 'inherit',
                    }}
                  >
                    <option value="">全部组别</option>
                    {groups.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </th>
                <th className="col-shift col-sortable" onClick={() => toggleSort('shift_type')}>班次类型 {sortKey === 'shift_type' && (sortAsc ? <ArrowDropUpIcon sx={{ verticalAlign: 'middle' }} /> : <ArrowDropDownIcon sx={{ verticalAlign: 'middle' }} />)}</th>
                <th className="col-time col-sortable" onClick={() => toggleSort('fixed_time')}>上班时间 {sortKey === 'fixed_time' && (sortAsc ? <ArrowDropUpIcon sx={{ verticalAlign: 'middle' }} /> : <ArrowDropDownIcon sx={{ verticalAlign: 'middle' }} />)}</th>
                <th className="col-action">操作</th>
                <th className="col-spacer"></th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <div className="empty-state-icon">📋</div>
                      <div className="empty-state-text">暂无数据</div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEmployees.map(emp => (
                  <tr key={emp.name}>
                    <td></td>
                    <td>{emp.name}</td>
                    <td>{emp.group}</td>
                    <td>
                      {emp.shift_type === 'fixed' ? (
                        <Chip label="固定班次" size="small" color="success" variant="outlined" />
                      ) : (
                        <Chip label="轮换班次" size="small" color="primary" variant="outlined" />
                      )}
                    </td>
                    <td>{emp.fixed_time || '-'}</td>
                    <td>
                      <Button size="small" variant="outlined" startIcon={<EditIcon />} sx={{ mr: 1 }} onClick={() => openEditModal(emp)}>
                        编辑
                      </Button>
                      <Button size="small" variant="contained" color="error" startIcon={<DeleteIcon />} onClick={() => openDeleteModal(emp)}>
                        删除
                      </Button>
                    </td>
                    <td></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Employee Add/Edit Modal */}
      <ModalPortal open={empModalOpen} onClose={closeModal} title={editingEmp ? '编辑员工' : '添加员工'} maxWidth={560}>

            {empAlert && (
              <Alert severity="error" sx={{ mb: 2 }}>{empAlert}</Alert>
            )}

            <form onSubmit={(e) => { e.preventDefault(); submitEmployeeForm(); }}>
              <input type="hidden" value={editingEmp?.name || ''} />

              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2 }}>
                <TextField
                  size="small"
                  placeholder="姓名"
                  value={empForm.name}
                  onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })}
                  required
                  sx={{ flex: 1 }}
                />
                <Button type="submit" variant="contained" startIcon={<SaveIcon />} disabled={saveLoading} sx={{ flexShrink: 0, mb: 0 }}>
                  {saveLoading ? '保存中...' : '保存'}
                </Button>
              </Box>

              <Box className="emp-field-row" sx={{ mb: 2 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <label className="emp-label">组别</label>
                  <ReadOnlyDropdown
                    value={empForm.group}
                    onChange={(v) => setEmpForm({ ...empForm, group: v })}
                    options={groups}
                    emptyLabel="请选择组别"
                  />
                </Box>
              </Box>

              <Box className="emp-field-row" sx={{ display: 'flex', gap: 2 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <label className="emp-label">班次类型</label>
                  <ReadOnlyDropdown
                    value={empForm.shift_type}
                    onChange={(v) => setEmpForm({ ...empForm, shift_type: v })}
                    options={['rotation', 'fixed']}
                    getOptionLabel={(v) => (v === 'rotation' ? '轮换班次' : '固定班次')}
                  />
                </Box>
                {empForm.shift_type === 'fixed' && (
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <label className="emp-label">固定上班时间</label>
                    <ReadOnlyDropdown
                      value={empForm.fixed_time}
                      onChange={(v) => setEmpForm({ ...empForm, fixed_time: v })}
                      options={SHIFT_TIMES}
                    />
                  </Box>
                )}
              </Box>
            </form>
      </ModalPortal>

      {/* Delete Confirmation Modal */}
      <ModalPortal open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="确认删除" maxWidth={400}>

            <Box sx={{ py: 2.5 }}>
              <Typography color="text.primary" sx={{ fontSize: '15px', lineHeight: 1.6 }}>
                确定要删除员工 <Typography component="strong" color="error">{deleteEmpName}</Typography> 吗？
              </Typography>
              <Typography color="text.secondary" sx={{ fontSize: '13px', mt: 1.25 }}>
                此操作不可恢复，请谨慎操作。
              </Typography>
            </Box>

            <Box className="form-row" sx={{ mt: 2.5, gap: '15px' }}>
              <Button variant="contained" color="error" startIcon={<DeleteIcon />} onClick={confirmDelete} sx={{ flex: 1 }}>确认删除</Button>
              <Button variant="text" onClick={() => setDeleteModalOpen(false)} sx={{ flex: 1 }}>取消</Button>
            </Box>
      </ModalPortal>

      {/* Group Management Modal */}
      <ModalPortal open={groupModalOpen} onClose={() => setGroupModalOpen(false)} title="编辑组别" maxWidth={520}>

            {groupAlert && (
              <Alert severity="error" sx={{ mb: 2 }}>{groupAlert}</Alert>
            )}

            <Box sx={{ py: 1.25 }}>
              <Box className="form-row" sx={{ mb: 1.875 }}>
                <TextField
                  size="small"
                  placeholder="输入新组别名称"
                  sx={{ flex: 1 }}
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addGroup(); }}
                />
                <Button variant="contained" startIcon={<AddIcon />} onClick={addGroup}>添加</Button>
              </Box>

              <div className="group-list-shell">
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                  <Typography className="card-subtitle" sx={{ fontWeight: 600, mb: 0 }}>当前组别</Typography>
                  <Chip label={`${groups.length} 个组别`} size="small" variant="outlined" />
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {groups.map(g => (
                    <Chip
                      key={g}
                      label={g}
                      variant="outlined"
                      onDelete={() => setGroupToDelete(g)}
                    />
                  ))}
                  {groups.length === 0 && (
                    <Typography color="text.secondary" sx={{ fontSize: '14px' }}>暂无组别</Typography>
                  )}
                </Box>
              </div>
            </Box>

              {/* Nested delete confirmation */}
              {groupToDelete && (
                <Alert severity="error" sx={{ mt: 2 }}
                  action={
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button variant="contained" color="error" size="small" startIcon={<DeleteIcon />} onClick={confirmGroupDelete}>确认删除</Button>
                      <Button variant="text" size="small" onClick={() => setGroupToDelete(null)}>取消</Button>
                    </Box>
                  }
                >
                  <Typography sx={{ fontWeight: 700, mb: 0.5 }}>确认删除组别</Typography>
                  <Typography variant="body2">
                    确定要删除组别 <strong>{groupToDelete}</strong> 吗？
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    该组内的所有员工将变为"待分配"组别，但不会被删除。
                  </Typography>
                </Alert>
              )}
      </ModalPortal>
    </>
  );
}
