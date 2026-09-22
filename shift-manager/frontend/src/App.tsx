import { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Box } from '@mui/material';
import ScheduleEmployees from './components/schedule/ScheduleEmployees';
import ConfigOverview from './components/config/ConfigOverview';
import ConfigRules from './components/config/ConfigRules';
import ScheduleGenerate from './components/schedule/ScheduleGenerate';
import DutyTab from './components/duty/DutyTab';
import ADTab from './components/ad/ADTab';

// ========================
// 排班管理页（含子Tab）
// ========================
function SchedulePage() {
  const [tab, setTab] = useState(0);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [overviewRefreshKey, setOverviewRefreshKey] = useState(0);
  const triggerRefresh = useCallback(() => setOverviewRefreshKey(k => k + 1), []);

  return (
    <div className="app-shell">
      <div className="container">
        <div className="header">
          <Box>
            <h1 style={{ margin: 0 }}>排班管理系统</h1>
            <Box sx={{ mt: 1 }}>
              <Link to="/duty" className="system-link-topright">
                切换到值班管理 →
              </Link>
            </Box>
          </Box>
          <Link to="/ad" className="system-link-topright">
            ⚙ AD 域设置
          </Link>
        </div>
        <div className="nav-shell">
          <div className="nav">
            <button className={`nav-tab ${tab === 0 ? 'active' : ''}`} onClick={() => setTab(0)}>员工管理</button>
            <button className={`nav-tab ${tab === 1 ? 'active' : ''}`} onClick={() => setTab(1)}>规则配置</button>
            <button className={`nav-tab ${tab === 2 ? 'active' : ''}`} onClick={() => setTab(2)}>排班生成</button>
          </div>
        </div>
        <div className="content">
          <div className={`tab-content ${tab === 0 ? 'active' : ''}`}><ScheduleEmployees /></div>
          <div className={`tab-content ${tab === 1 ? 'active' : ''}`}>
            <div className="split-layout split-layout-wide">
              <div className="split-sidebar">
                <ConfigOverview value={selectedGroup} onChange={setSelectedGroup} refreshKey={overviewRefreshKey} />
              </div>
              <div className="split-main">
                <ConfigRules group={selectedGroup} onSaved={triggerRefresh} />
              </div>
            </div>
          </div>
          <div className={`tab-content ${tab === 2 ? 'active' : ''}`}><ScheduleGenerate /></div>
        </div>
      </div>
    </div>
  );
}

// ========================
// 值班管理页
// ========================
function DutyPage() {
  return (
    <div className="app-shell">
      <div className="container">
        <div className="header">
          <Box>
            <h1 style={{ margin: 0 }}>值班管理系统</h1>
            <Box sx={{ mt: 1 }}>
              <Link to="/" className="system-link-topright">
                ← 切换到排班管理
              </Link>
            </Box>
          </Box>
          <Link to="/ad" className="system-link-topright">
            ⚙ AD 域设置
          </Link>
        </div>
        <DutyTab />
      </div>
    </div>
  );
}

// ========================
// AD 域设置页
// ========================
function ADPage() {
  return (
    <div className="app-shell">
      <div className="container">
        <div className="header">
          <h1>AD 域设置</h1>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Link to="/" className="system-link-topright">
              ← 返回排班管理
            </Link>
          </Box>
        </div>
        <div className="content"><ADTab /></div>
      </div>
    </div>
  );
}

// ========================
// App 入口
// ========================
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SchedulePage />} />
        <Route path="/duty" element={<DutyPage />} />
        <Route path="/ad" element={<ADPage />} />
      </Routes>
    </BrowserRouter>
  );
}
