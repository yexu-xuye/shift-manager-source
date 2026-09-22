import { useState, useEffect } from 'react';
import { Button, TextField, IconButton, Box, Typography, Checkbox } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import api from '../../api/client';
import { useToast } from '../common/Toast';
import ModalPortal from '../common/ModalPortal';

export default function ADTab() {
  const toast = useToast();
  
  // --- Types ---
  interface ADPreviewDetail {
    type: string; guid: string; ad_name: string; ad_dept: string;
    local_name?: string; local_group?: string; diffs?: string[];
    selected: boolean; sync_disabled?: boolean; sAMAccountName?: string;
  }
  interface ADPreview { total_in_ad: number; ignored_count: number; new_count: number; update_count: number; departed_count: number; details: ADPreviewDetail[]; }
  interface ADImportResult { success: boolean; message: string; new_count: number; update_count: number; errors: string[]; }
  interface ADIgnored { guid: string; name: string; group: string; sAMAccountName: string; ignored_at: string; }
  interface LogEntry { time?: string; new?: number; update?: number; group_created?: number; group_matched?: number; total_ad?: number; message?: string; }

  const [address, setAddress] = useState('');
  const [baseDn, setBaseDn] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);

  const adConfig = () => {
    const isLdaps = /^ldaps:\/\//i.test(address);
    let addr = address.replace(/^ldaps?:\/\//i, '').trim();
    let host: string, portStr: string;
    if (addr.includes(':')) {
      const lastColon = addr.lastIndexOf(':');
      host = addr.substring(0, lastColon);
      portStr = addr.substring(lastColon + 1);
    } else {
      host = addr;
      portStr = isLdaps ? '636' : '389';
    }
    return {
      host: host.trim(),
      port: parseInt(portStr) || (isLdaps ? 636 : 389),
      use_ssl: isLdaps || parseInt(portStr) === 636,
      base_dn: baseDn,
      search_ou: baseDn,
      username,
      password,
    };
  };

  // Preview
  const [preview, setPreview] = useState<ADPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedGuids, setSelectedGuids] = useState<Set<string>>(new Set());

  // Ignored
  const [ignored, setIgnored] = useState<ADIgnored[]>([]);

  // Import result
  const [importResult, setImportResult] = useState<ADImportResult | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  // Sync logs
  const [logs, setLogs] = useState<LogEntry | null>(null);

  const loadIgnored = async () => {
    try {
      const { data } = await api.get('/ad/ignored-users');
      setIgnored(data || []);
    } catch { console.error('加载忽略列表失败'); }
  };

  useEffect(() => { loadIgnored(); }, []);

  const testConnection = async () => {
    setTestResult(null);
    try {
      const { data } = await api.post('/ad/test-connection', adConfig());
      setTestResult(data.success ? data.message : `连接失败: ${data.message}`);
    } catch (e: any) {
      setTestResult('测试失败: ' + (e?.response?.data?.detail || e.message));
    }
  };

  const loadPreview = async () => {
    setPreviewLoading(true);
    setPreview(null);
    try {
      const { data } = await api.post('/ad/import/preview', adConfig());
      setPreview(data);
      const s = new Set<string>();
      (data.details || []).forEach((d: any) => { if (d.selected && d.type !== 'ignored') s.add(d.guid); });
      setSelectedGuids(s);
    } catch (e: any) {
      toast.show(e?.response?.data?.detail || '预览失败', 'error');
    }
    setPreviewLoading(false);
  };

  const toggleGuid = (guid: string) => {
    setSelectedGuids(prev => {
      const next = new Set(prev);
      next.has(guid) ? next.delete(guid) : next.add(guid);
      return next;
    });
  };

  const confirmImport = async () => {
    setImportLoading(true);
    try {
      const { data } = await api.post('/ad/import/confirm', { ...adConfig(), selected_guids: [...selectedGuids] });
      setImportResult(data);
      toast.show(data.message || '导入完成');
      loadPreview();
    } catch (e: any) {
      toast.show(e?.response?.data?.detail || '导入失败', 'error');
    }
    setImportLoading(false);
  };

  const ignoreGuid = async (guid: string) => {
    try {
      await api.post(`/ad/ignored-users/${guid}`);
      toast.show('已忽略');
      loadIgnored(); loadPreview();
    } catch (e: any) {
      toast.show('操作失败', 'error');
    }
  };

  const unignoreGuid = async (guid: string) => {
    try {
      await api.delete(`/ad/ignored-users/${guid}`);
      toast.show('已取消忽略');
      loadIgnored(); loadPreview();
    } catch (e: any) {
      toast.show('操作失败', 'error');
    }
  };

  const loadLogs = async () => {
    try {
      const { data } = await api.get('/ad/sync-logs');
      setLogs(data);
    } catch { console.error('加载忽略列表失败'); }
  };

  const typeLabel: Record<string, string> = { new: '新增', update: '变更', ignored: '已忽略', departed: '已离职' };
  const typeColor: Record<string, string> = { new: '#34c759', update: '#4285f4', ignored: '#8e8e93', departed: '#ff3b30' };

  return (
    <div>
      {/* AD 连接配置 */}
      <Box className="card" sx={{ mb: 3 }}>
        <div className="card-header">
          <div>
            <div className="card-title">AD 连接配置</div>
            <div className="card-subtitle">每次操作均需提供连接信息，不会保存。</div>
          </div>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button variant="outlined" onClick={testConnection}>测试连接</Button>
          </Box>
        </div>
        {testResult && (
          <Box sx={{ mb: 2, py: 1, px: 2, borderRadius: 10, background: testResult.includes('成功') ? 'rgba(52,199,89,0.1)' : 'rgba(255,59,48,0.1)', fontSize: 13, fontWeight: 600 }}>
            {testResult}
          </Box>
        )}
        <div className="form-row">
          <Box className="form-group" sx={{ flex: 2 }}>
            <label>服务器地址:端口</label>
            <TextField fullWidth size="small" value={address} onChange={e => setAddress(e.target.value)} />
          </Box>
          <Box className="form-group" sx={{ flex: 2 }}>
            <label>Base DN</label>
            <TextField fullWidth size="small" value={baseDn} onChange={e => setBaseDn(e.target.value)} />
          </Box>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>用户名</label>
            <TextField fullWidth size="small" value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div className="form-group">
            <label>密码</label>
            <TextField fullWidth size="small" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
        </div>
      </Box>

      {/* 预览差异 */}
      <Box className="card" sx={{ mb: 3 }}>
        <div className="card-header">
          <div>
            <div className="card-title">预览差异</div>
            <div className="card-subtitle">拉取 AD 数据与本地数据库对比</div>
          </div>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button variant="contained" startIcon={<VisibilityIcon />} onClick={loadPreview} disabled={previewLoading}>
              {previewLoading ? '加载中...' : '预览差异'}
            </Button>
            <Button variant="outlined" onClick={loadLogs}>同步日志</Button>
          </Box>
        </div>

        {preview && (
          <div>
            <Box sx={{ display: 'flex', gap: 2, mb: 1.5, fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
              <span>AD: {preview.total_in_ad} 人</span>
              <Typography component="span" color="success.main">新增: {preview.new_count}</Typography>
              <Typography component="span" color="primary">变更: {preview.update_count}</Typography>
              {preview.departed_count > 0 && <Typography component="span" color="error">离职: {preview.departed_count}</Typography>}
              <Typography component="span" color="text.secondary">已忽略: {preview.ignored_count}</Typography>
              <span>待导入: {selectedGuids.size}</span>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
              <Button variant="contained" size="small" startIcon={<DownloadIcon />} onClick={confirmImport} disabled={importLoading || selectedGuids.size === 0}>
                {importLoading ? '导入中...' : `确认导入 (${selectedGuids.size})`}
              </Button>
            </Box>

            {importResult && (
              <Box sx={{ mb: 1.5, py: 1, px: 2, borderRadius: 10, background: 'rgba(52,199,89,0.1)', fontSize: 13, fontWeight: 600 }}>
                导入完成: 新增 {importResult.new_count} · 更新 {importResult.update_count} · {importResult.message}
              </Box>
            )}

            {['new', 'update', 'departed', 'ignored'].map(type => {
              const items = preview.details.filter((d: any) => d.type === type);
              if (items.length === 0) return null;
              return (
                <details key={type} style={{ marginBottom: 8 }} open={type === 'new' || type === 'update'}>
                  <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 14, color: typeColor[type], marginBottom: 8 }}>
                    {typeLabel[type]} ({items.length})
                  </summary>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 0.75 }}>
                    {items.map((d: any) => (
                      <Box key={d.guid} sx={{ py: 1, px: 1.25, background: 'rgba(255,255,255,0.8)', borderRadius: 10, border: '1px solid var(--line)', fontSize: 12 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: type === 'update' && d.diffs?.length ? 0.75 : 0 }}>
                          {type !== 'ignored' && type !== 'departed' && (
                            <Checkbox checked={selectedGuids.has(d.guid)} onChange={() => toggleGuid(d.guid)} size="small" sx={{ p: 0 }} />
                          )}
                          {d.sync_disabled && <Typography component="span" color="warning.main" sx={{ fontSize: 10, flexShrink: 0 }}>⊘暂停</Typography>}
                          <Typography component="span" sx={{ fontWeight: 600, flex: 1 }}>{d.ad_name || d.local_name}</Typography>
                          <Typography component="span" sx={{ color: 'var(--muted)', fontSize: 10, flexShrink: 0 }}>
                            {type === 'new' && `→ ${d.ad_dept || '-'}`}
                            {type === 'ignored' && <Button size="small" sx={{ fontSize: 10, padding: '1px 6px', minWidth: 'auto' }} onClick={() => unignoreGuid(d.guid)}>取消忽略</Button>}
                            {type === 'departed' && `${d.local_group || '-'}`}
                          </Typography>
                          {type !== 'ignored' && type !== 'departed' && (
                            <Button size="small" color="inherit" sx={{ fontSize: 10, padding: '1px 6px', minWidth: 'auto', color: 'text.secondary' }} onClick={() => ignoreGuid(d.guid)}>忽略</Button>
                          )}
                        </Box>
                        {type === 'update' && d.diffs?.length > 0 && (
                          <Box sx={{ mt: 0.25 }}>
                            {d.diffs.map((diff: string, i: number) => (
                              <Box key={i} sx={{ fontSize: 11, color: 'primary.main', lineHeight: 1.6 }}>{diff}</Box>
                            ))}
                          </Box>
                        )}
                      </Box>
                    ))}
                  </Box>
                </details>
              );
            })}
          </div>
        )}
      </Box>

      {/* 忽略列表 */}
      {ignored.length > 0 && (
        <Box className="card" sx={{ mb: 3 }}>
          <div className="card-header">
            <div><div className="card-title">忽略列表</div></div>
          </div>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {ignored.map((u: any) => (
              <Box key={u.guid} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, py: 0.5, px: 1.5, background: 'rgba(255,255,255,0.8)', border: '1px solid var(--line)', borderRadius: 14, fontSize: 12, fontWeight: 500 }}>
                {u.name} · {u.group || '-'}
                <Button size="small" color="primary" sx={{ fontSize: 10, padding: '1px 6px', minWidth: 'auto' }} onClick={() => unignoreGuid(u.guid)}>取消</Button>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* 同步日志弹窗 */}
      <ModalPortal open={!!logs} onClose={() => setLogs(null)} title="同步日志" maxWidth={400}>
        {logs?.time ? (
          <Typography sx={{ fontSize: 13 }}>
            <div>时间: {logs.time?.slice(0, 19)}</div>
            <div>新增: {logs.new} · 更新: {logs.update} · 组匹配: {logs.group_matched || 0}</div>
            <div>AD 总数: {logs.total_ad}</div>
          </Typography>
        ) : (
          <Typography color="text.secondary" sx={{ fontSize: 13 }}>暂无导入记录</Typography>
        )}
      </ModalPortal>
    </div>
  );
}
