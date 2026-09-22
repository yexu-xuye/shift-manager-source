"""
值班管理引擎 - 生成周末值班表
"""

from typing import Dict, List
from datetime import datetime, timedelta, date as date_type
from .engine_data import EngineData


class DutyEngine:
    """值班表生成引擎"""

    def __init__(self, engine_data: EngineData):
        self.data_manager = engine_data

    def generate_duty_schedule(self, start_date: datetime, groups: List[str]) -> Dict:
        """生成值班表

        轮换逻辑：按周推进，每组每次取 duty_count 人循环轮换。
        例如：成员 [1,2,3,4,5]，duty_count=2
            第1周：1,2
            第2周：3,4
            第3周：5,1
            第4周：2,3
            ...

        Args:
            start_date: 开始日期（周日）
            weeks: 生成周数
            groups: 参与组别列表

        Returns:
            {
                'weeks': [
                    {
                        'week_number': 1,
                        'date': '2026-04-19',
                        'date_display': '2026年04月19日',
                        'groups': {
                            '工艺组': ['张三', '李四'],
                            '制作组': ['王五', '赵六']
                        }
                    }
                ]
            }
        """
        if not start_date or start_date.weekday() != 6:  # 必须是周日
            raise ValueError("开始日期必须是周日")

        result_weeks = []

        current_sunday = start_date
        week_data = {
            'week_number': 1,
            'date': current_sunday.strftime('%Y-%m-%d'),
            'groups': {}
        }

        for group_name in groups:
            duty_config = self.data_manager.get_duty_group_config(group_name)
            if not duty_config:
                continue

            enabled = duty_config.get('enabled', True)
            if not enabled:
                continue

            rotation_order = duty_config.get('rotation_order', [])

            if not rotation_order:
                continue

            effective_order = rotation_order

            # 获取该组值班人数，默认1人
            duty_count = duty_config.get('duty_count', 1)
            if duty_count <= 0:
                duty_count = 1

            total_members = len(effective_order)

            # 计算基准偏移：根据配置的 start_date 与选择的 start_date 之间的周数差
            base_offset = 0
            config_start_date_raw = duty_config.get('start_date', '')
            if config_start_date_raw:
                if isinstance(config_start_date_raw, date_type):
                    config_start_date = datetime.combine(config_start_date_raw, datetime.min.time())
                elif isinstance(config_start_date_raw, str) and config_start_date_raw:
                    try:
                        config_start_date = datetime.strptime(config_start_date_raw, '%Y-%m-%d')
                    except ValueError:
                        config_start_date = None
                else:
                    config_start_date = None
                if config_start_date and config_start_date.weekday() == 6:
                    # 计算从配置起始日到选择起始日之间的周数差
                    delta_days = (start_date - config_start_date).days
                    base_offset = delta_days // 7

            # 计算本周值班人员起始索引
            # 每周推进 duty_count 人，循环取模
            start_index = (base_offset * duty_count) % total_members

            # 取本周值班人员（循环截取）
            duty_members = []
            for i in range(duty_count):
                idx = (start_index + i) % total_members
                duty_members.append(effective_order[idx])

            week_data['groups'][group_name] = duty_members

        result_weeks.append(week_data)

        return {
            'weeks': result_weeks
        }
