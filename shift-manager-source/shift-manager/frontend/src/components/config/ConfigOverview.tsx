import { useState, useEffect } from 'react';
import { Autocomplete, TextField, Box, Typography, CircularProgress } from '@mui/material';
import api from '../../api/client';

interface SubgroupOverview {
  name: string;
  members: string[];
  times: string[];
}

interface SinglePersonOverview {
  name: string;
  times: string[];
}

interface OverviewData {
  rotation_order?: string[];
  subgroups?: SubgroupOverview[];
  single_rotations?: SinglePersonOverview[];
}

interface ConfigOverviewProps {
  value: string;
  onChange: (group: string) => void;
  refreshKey: number;
}

export default function ConfigOverview({ value, onChange, refreshKey }: ConfigOverviewProps) {
  const [groups, setGroups] = useState<string[]>([]);
  const [data, setData] = useState<OverviewData>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<string[]>('/groups').then(({ data: g }) => {
      setGroups(g);
      if (!value && g.length > 0) onChange(g[0]);
    }).catch(() => { console.error('加载组别列表失败'); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!value) { setData({}); return; }
    setLoading(true);
    api.get(`/group-config/${encodeURIComponent(value)}`)
      .then(({ data: d }) => setData(d))
      .catch(() => setData({}))
      .finally(() => setLoading(false));
  }, [value, refreshKey]);

  const order = data.rotation_order || [];
  const subgroups = data.subgroups || [];
  const singlePersons = data.single_rotations || [];

  return (
    <Box className="card" sx={{ position: 'sticky', top: '24px' }}>
      <div className="card-header">
        <div>
          <div className="card-title">当前轮换规则总览</div>
        </div>
      </div>
      <Box className="form-row" sx={{ mb: 2 }}>
        <Box className="form-group" sx={{ flex: 1 }}>
          <label>选择组别</label>
          <Autocomplete
            value={value || null}
            onChange={(_, v) => onChange(v || '')}
            options={groups}
            disableClearable
            openOnFocus
            selectOnFocus={false}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                placeholder="请选择组别"
                inputProps={{ ...params.inputProps, readOnly: true, style: { cursor: 'pointer' } }}
              />
            )}
          />
        </Box>
      </Box>
      <div className="rules-overview-content">
        {!value ? (
          <Typography sx={{ color: '#6e6e73', fontSize: '14px', py: 2.5 }}>请选择组别以查看当前轮换规则。</Typography>
        ) : loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <Box sx={{ fontSize: '14px' }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 1.5, gap: 1 }}>
              <Typography component="span" sx={{ fontWeight: 700, color: '#4285f4', flexShrink: 0, fontSize: '18px', lineHeight: '1.7' }}>多人轮换：</Typography>
              {order.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
                  {order.map((name, i) => (
                    <Typography key={name} component="div" sx={{ fontSize: '18px', color: '#374151', lineHeight: '1.7' }}>{i + 1}. {name}</Typography>
                  ))}
                </Box>
              ) : (
                <Typography component="span" sx={{ color: '#6e6e73', fontSize: '18px', lineHeight: '1.7' }}>未配置</Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 1.5, gap: 1 }}>
              <Typography component="span" sx={{ fontWeight: 700, color: '#34c759', flexShrink: 0, fontSize: '18px', lineHeight: '1.7' }}>子组轮换：</Typography>
              {subgroups.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
                  {subgroups.map((sg, i) => (
                    <Typography key={i} component="div" sx={{ fontSize: '18px', color: '#374151', lineHeight: '1.7' }}>
                      {sg.name}: {sg.members[0]}↔{sg.members[1]}
                    </Typography>
                  ))}
                </Box>
              ) : (
                <Typography component="span" sx={{ color: '#6e6e73', fontSize: '18px', lineHeight: '1.7' }}>未配置</Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 1.5, gap: 1 }}>
              <Typography component="span" sx={{ fontWeight: 700, color: '#b45309', flexShrink: 0, fontSize: '18px', lineHeight: '1.7' }}>单人轮换：</Typography>
              {singlePersons.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
                  {singlePersons.map((sp, i) => (
                    <Typography key={i} component="div" sx={{ fontSize: '18px', color: '#374151', lineHeight: '1.7' }}>
                      {sp.name}: {sp.times[0]}/{sp.times[1]}
                    </Typography>
                  ))}
                </Box>
              ) : (
                <Typography component="span" sx={{ color: '#6e6e73', fontSize: '18px', lineHeight: '1.7' }}>未配置</Typography>
              )}
            </Box>
          </Box>
        )}
      </div>
    </Box>
  );
}
