"""
排班算法引擎
"""

from typing import Dict, List
from datetime import datetime, timedelta, date as date_type
from .engine_data import EngineData, ScheduleRuleRef as ScheduleRule


class ScheduleEngine:
    """排班引擎类"""
    
    def __init__(self, engine_data: EngineData):
        self.data_manager = engine_data
    
    def get_week_start(self, date: datetime) -> datetime:
        """获取指定日期所在周的周一"""
        weekday = date.weekday()
        if weekday == 6:
            return date - timedelta(days=6)
        return date - timedelta(days=weekday)
    
    def generate_week_schedule(self, start_date: datetime, group_name: str) -> Dict:
        """生成指定组别单周的排班表

        原则：先分类、再调度。每个 rotation 员工先确定归属类别（单人/子组/多人/默认），
        再按类别调度。子组成员不全时自动降级到默认轮换，不会漏排。

        Returns:
            {
                'schedule': {...},  # 排班数据
                'warnings': [...]   # 警告信息
            }
        """
        schedule = {}
        warnings = []
        group_config = self.data_manager.get_group_config(group_name)

        if not group_config:
            return {'schedule': schedule, 'warnings': warnings}

        employees = self.data_manager.get_group_employees(group_name)
        single_rotations_dict = group_config.single_rotations or {}

        fixed_employees = [emp for emp in employees if emp.shift_type == "fixed"]
        rotation_employees = [emp for emp in employees if emp.shift_type == "rotation"]

        base_date_str = getattr(group_config, 'rotation_start_date', None)
        # 新组：自动记录本次排班起始周的周一为基准日期
        if not base_date_str:
            week_start_monday = self.get_week_start(start_date)
            self.data_manager.save_rotation_start_date(group_name, week_start_monday.date())
            base_date_str = week_start_monday.date()

        week_number = self._get_week_number(start_date, base_date_str)
        scheduled_employees = set()

        # ── Step 1: 固定班次（不受轮换规则影响） ──
        for emp in fixed_employees:
            scheduled_employees.add(emp.name)
            schedule.setdefault(emp.fixed_time, []).append(emp.name)

        # ── Step 2: 特殊轮换 —— 仅 rotation_order 内员工参与 ──
        if group_config.special_times and group_config.default_time and group_config.rotation_order:
            special_emps = [emp for emp in rotation_employees if emp.name in group_config.rotation_order and emp.name not in scheduled_employees]
            if special_emps:
                special_schedule = self._generate_rotation_schedule(start_date, group_config, special_emps, week_number)
                self._merge_schedules(schedule, special_schedule)
                for time_emps in special_schedule.values():
                    for name in time_emps:
                        scheduled_employees.add(name)

        # ── 分类阶段：确定每个 rotation 员工的归属（特殊轮换已排的跳过） ──
        subgroup_member_set = set()
        if group_config.subgroups:
            for sg_config in group_config.subgroups.values():
                for member in sg_config.get('members', []):
                    subgroup_member_set.add(member)

        single_queue = []
        subgroup_candidates = []
        multi_queue = []
        default_queue = []

        for emp in rotation_employees:
            name = emp.name
            if name in scheduled_employees:
                continue
            if name in single_rotations_dict:
                single_queue.append(emp)
            elif name in subgroup_member_set:
                subgroup_candidates.append(emp)
            elif group_config.rotation_order and name in group_config.rotation_order:
                multi_queue.append(emp)
            else:
                default_queue.append(emp)

        # ── Step 3: 单人轮换 ──
        for emp in single_queue:
            scheduled_employees.add(emp.name)
            config = single_rotations_dict[emp.name]
            times = config.get("times", ["9:00", "13:00"])
            if len(times) < 2:
                times = times + ["13:00"] * (2 - len(times))
            start_week = config.get("start_week", "单周")
            # week 0 为 rotation_start_date 所在周，按配置决定起点交替取 times[0] 和 times[1]
            offset = 0 if start_week == "单周" else 1
            current_time = times[(week_number + offset) % 2]
            schedule.setdefault(current_time, []).append(emp.name)

        # ── Step 4: 子组轮换 —— 两人成组，缺人不排 ──
        if group_config.subgroups:
            candidate_map = {e.name: e for e in subgroup_candidates}
            subgroup_schedule = {}
            for sg_name, sg_config in group_config.subgroups.items():
                members = sg_config["members"]
                pair = [m for m in members if m in candidate_map]
                if len(pair) == 2:
                    times = sg_config["times"]
                    if len(times) < 2:
                        times = times + ["13:00"] * (2 - len(times))
                    initial_order = sg_config.get("initial_order", 0)
                    is_even_week = week_number % 2 == 0
                    if (is_even_week and initial_order == 0) or (not is_even_week and initial_order == 1):
                        p1, p2 = pair[0], pair[1]
                    else:
                        p1, p2 = pair[1], pair[0]
                    subgroup_schedule.setdefault(times[0], []).append(p1)
                    subgroup_schedule.setdefault(times[1], []).append(p2)
                    scheduled_employees.add(p1)
                    scheduled_employees.add(p2)
                    del candidate_map[p1]
                    del candidate_map[p2]
                elif len(pair) == 1:
                    # 不降级、不排班，强制报错让管理员检查子组配置
                    warnings.append(f"子组「{sg_name}」成员不全（缺搭档），{pair[0]} 未排班，请检查子组配置")
                    del candidate_map[pair[0]]

            self._merge_schedules(schedule, subgroup_schedule)

        # ── Step 5: 多人轮换 ──
        if multi_queue:
            multi_schedule = self._generate_rotation_schedule(
                start_date, group_config, multi_queue, week_number
            )
            self._merge_schedules(schedule, multi_schedule)
            for emp in multi_queue:
                scheduled_employees.add(emp.name)
            total = len(multi_queue)
            need = group_config.early_shift_count + group_config.late_shift_count
            if total < need:
                warnings.append(f"多人轮换成员不足（{total}/{need}人），部分班次缺人")

        # ── Step 6: 默认轮换 —— 无条件兜底 ──
        if default_queue:
            default_schedule = self._generate_rotation_schedule(
                start_date, group_config, default_queue, week_number
            )
            self._merge_schedules(schedule, default_schedule)
            for emp in default_queue:
                scheduled_employees.add(emp.name)

        # ── 最终检查：漏排员工 ──
        for emp in employees:
            if emp.name not in scheduled_employees:
                warnings.append(f"员工 {emp.name} 未安排上班时间")

        return {'schedule': schedule, 'warnings': warnings}
    
    def _merge_schedules(self, target: dict, source: dict):
        """合并两个排班数据，source 合并到 target 中（按时间合并）"""
        for time_str, employees in source.items():
            if time_str not in target:
                target[time_str] = []
            target[time_str].extend(employees)
    
    def _get_week_number(self, date: datetime, base_date_str = None) -> int:
        """计算周数。使用组配置的 rotation_start_date 作为基准，
        如果未配置则使用传入的 start_date 所在周的周一。"""
        if base_date_str:
            if isinstance(base_date_str, date_type):
                base_date = datetime.combine(base_date_str, datetime.min.time())
            elif isinstance(base_date_str, str):
                try:
                    base_date = datetime.strptime(base_date_str, '%Y-%m-%d')
                except ValueError:
                    base_date = self.get_week_start(date)
            else:
                base_date = self.get_week_start(date)
        else:
            base_date = self.get_week_start(date)
        delta = date - base_date
        week_num = delta.days // 7
        return max(0, week_num)
    
    def _generate_rotation_schedule(self, start_date: datetime, group_config: ScheduleRule, 
                                   employees: list, week_number: int) -> Dict[str, List[str]]:
        """生成轮换排班（按周计算）。
        
        当 special_times 配置时：每周从轮换序列中取 N 人依次填入特殊时间，
        其余填入 default_time，逐周步进。
        """
        schedule = {}
        member_names = [emp.name for emp in employees]
        
        if group_config.rotation_order:
            valid_order = [name for name in group_config.rotation_order if name in member_names]
            if valid_order:
                # rotation_order 用于排序，不是过滤：未在 order 中的人排在末尾
                ordered = valid_order
                remainder = [n for n in member_names if n not in ordered]
                member_names = ordered + remainder
        
        total_members = len(member_names)
        if total_members == 0:
            return schedule
        
        # ── 特殊时间模式 ──
        if group_config.special_times and group_config.default_time:
            st = group_config.special_times
            pick = len(st)
            if total_members <= pick:
                for i, t in enumerate(st):
                    if i < total_members:
                        schedule.setdefault(t, []).append(member_names[i])
                return schedule
            idx = (week_number * pick) % total_members
            rotated = member_names[idx:] + member_names[:idx]
            for i in range(pick):
                schedule.setdefault(st[i], []).append(rotated[i])
            for name in rotated[pick:]:
                schedule.setdefault(group_config.default_time, []).append(name)
            return schedule
        
        # ── 标准 2 时间轮换 ──
        shift_times = group_config.shift_times if group_config.shift_times else ["9:00", "13:00"]
        priority = group_config.priority
        early_count = group_config.early_shift_count
        late_count = group_config.late_shift_count
        
        if len(shift_times) >= 2:
            early_time, late_time = shift_times[0], shift_times[1]
        elif len(shift_times) == 1:
            early_time = late_time = shift_times[0]
        else:
            early_time, late_time = "9:00", "13:00"
        
        shift_step = late_count if priority == "优先晚班" else early_count
        rotation_index = (week_number * shift_step) % total_members
        rotated_members = member_names[rotation_index:] + member_names[:rotation_index]
        
        if priority == "优先晚班":
            late_shift_members = rotated_members[:late_count]
            early_shift_members = rotated_members[late_count:late_count + early_count]
        else:
            early_shift_members = rotated_members[:early_count]
            late_shift_members = rotated_members[early_count:early_count + late_count]
        
        schedule[early_time] = early_shift_members
        schedule[late_time] = late_shift_members
        
        return schedule
    
    def generate_full_schedule(self, start_date: datetime, groups: list = None) -> Dict:
        """生成指定组别的排班表。
        
        Returns:
            {
                'weeks': [{'date': '2026-06-14', 'date_display': '2026年06月14日', 'slots': {'9:00': ['张三'], ...}}],
                'warnings': [...]
            }
        """
        all_warnings = []
        
        # 清理空的待分配组
        self.data_manager.cleanup_empty_pending_group()
        
        # 计算本周一开始日期
        week_start = self.get_week_start(start_date)
        
        target_groups = groups or self.data_manager.get_all_groups()
        
        slots: Dict[str, list] = {}
        for group_name in target_groups:
            week_result = self.generate_week_schedule(week_start, group_name)
            for time_str, employees in week_result.get('schedule', {}).items():
                if time_str not in slots:
                    slots[time_str] = []
                for emp in employees:
                    if emp not in slots[time_str]:
                        slots[time_str].append(emp)
            all_warnings.extend(week_result.get('warnings', []))
        
        return {
            'weeks': [{
                'date': week_start.strftime('%Y-%m-%d'),
                'date_display': f"{week_start.year}年{week_start.month:02d}月{week_start.day:02d}日",
                'slots': {t: sorted(slots[t]) for t in sorted(slots.keys()) if slots[t]},
            }],
            'warnings': all_warnings,
        }
