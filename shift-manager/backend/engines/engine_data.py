"""
引擎数据适配层 — 提供与旧 DataManager 相同接口的数据访问对象，
底层使用 SQLAlchemy Session。
"""
from dataclasses import dataclass, field
from datetime import date
from typing import Optional
from sqlalchemy.orm import Session

from ..models import (
    Employee, ScheduleRule,
    ShiftTime, RotationOrderItem,
    SubGroup, SubGroupMember, SubGroupTime,
    SingleRotation, SpecialTime,
    DutyRule, DutyRotationOrder,
)


@dataclass
class EmployeeRef:
    """轻量员工引用 — 模拟旧 data_manager.Employee 的接口"""
    name: str
    group: str
    shift_type: str = "rotation"
    fixed_time: str = "9:00"


@dataclass
class ScheduleRuleRef:
    """轻量排班规则引用 — 模拟旧 data_manager.GroupConfig 的接口"""
    name: str
    members: list = field(default_factory=list)
    shift_times: list = field(default_factory=lambda: ["9:00", "13:00"])
    priority: str = "优先早班"
    early_shift_count: int = 2
    late_shift_count: int = 3
    rotation_order: list = field(default_factory=list)
    rotation_start_date: Optional[date] = None
    subgroups: dict = field(default_factory=dict)
    single_rotations: dict = field(default_factory=dict)
    special_times: list = field(default_factory=list)
    default_time: str = ""


class EngineData:
    """替换旧 DataManager 的引擎数据源"""

    def __init__(self, db: Session):
        self._db = db

    def get_group_config(self, group_name: str) -> Optional[ScheduleRuleRef]:
        g = self._db.query(ScheduleRule).filter(ScheduleRule.name == group_name).first()
        if not g:
            return None

        # shift_times
        st_rows = self._db.query(ShiftTime.time_value)\
            .filter(ShiftTime.rule_name == g.name)\
            .order_by(ShiftTime.position).all()
        shift_times = [r[0] for r in st_rows] if st_rows else ["9:00", "13:00"]

        # rotation_order
        ro_rows = self._db.query(RotationOrderItem.employee_name)\
            .filter(RotationOrderItem.rule_name == g.name)\
            .order_by(RotationOrderItem.position).all()
        rotation_order = [r[0] for r in ro_rows]

        # special_times
        sp_rows = self._db.query(SpecialTime.time_value)\
            .filter(SpecialTime.rule_name == g.name)\
            .order_by(SpecialTime.position).all()
        special_times = [r[0] for r in sp_rows]

        # subgroups
        subgroups = {}
        sg_rows = self._db.query(SubGroup).filter(SubGroup.rule_name == g.name).order_by(SubGroup.id).all()
        for sg in sg_rows:
            members = self._db.query(SubGroupMember.employee_name)\
                .filter(SubGroupMember.subgroup_id == sg.id)\
                .order_by(SubGroupMember.position).all()
            times = self._db.query(SubGroupTime.time_value)\
                .filter(SubGroupTime.subgroup_id == sg.id)\
                .order_by(SubGroupTime.position).all()
            subgroups[sg.name] = {
                "members": [m[0] for m in members],
                "times": [t[0] for t in times] if times else ["9:00", "13:00"],
                "initial_order": sg.initial_order,
            }

        # single_rotations
        singles = {}
        sr_rows = self._db.query(SingleRotation).filter(SingleRotation.rule_name == g.name).all()
        for sr in sr_rows:
            ts = []
            if sr.time_one:
                ts.append(sr.time_one)
            if sr.time_two:
                ts.append(sr.time_two)
            singles[sr.employee_name] = {
                "times": ts if ts else ["9:00", "13:00"],
                "start_week": sr.start_week or "单周",
            }

        return ScheduleRuleRef(
            name=g.name,
            shift_times=shift_times,
            priority=g.priority or "优先早班",
            early_shift_count=g.early_shift_count or 2,
            late_shift_count=g.late_shift_count or 3,
            rotation_order=rotation_order,
            rotation_start_date=g.rotation_start_date,
            subgroups=subgroups,
            single_rotations=singles,
            special_times=special_times,
            default_time=g.default_time or "",
        )

    def get_group_employees(self, group_name: str) -> list:
        emps = self._db.query(Employee).filter(Employee.group == group_name).all()
        results = []
        for e in emps:
            ft = e.fixed_time
            if e.shift_type != "fixed" or not ft:
                ft = "9:00"  # 非固定班次员工，引擎内部用默认值兜底（不影响调度分类）
            results.append(EmployeeRef(name=e.name, group=e.group, shift_type=e.shift_type, fixed_time=ft))
        return results

    def cleanup_empty_pending_group(self):
        count = self._db.query(Employee).filter(Employee.group == "待分配").count()
        if count == 0:
            self._db.query(ScheduleRule).filter(ScheduleRule.name == "待分配").delete()
            self._db.commit()

    def save_rotation_start_date(self, group_name: str, start_date):
        """新组首次排班时记录基准日期，供后续周数计算使用。"""
        row = self._db.query(ScheduleRule).filter(ScheduleRule.name == group_name).first()
        if row:
            row.rotation_start_date = start_date
            self._db.commit()

    def get_all_groups(self) -> list:
        rows = self._db.query(Employee.group).distinct().all()
        names = sorted([r[0] for r in rows if r[0]])
        return names

    def get_duty_group_config(self, group_name: str) -> Optional[dict]:
        g = self._db.query(DutyRule).filter(DutyRule.name == group_name).first()
        if not g:
            return None
        # 优先从新关联表读取轮换顺序
        orders = self._db.query(DutyRotationOrder.employee_name)\
            .filter(DutyRotationOrder.group_id == g.id)\
            .order_by(DutyRotationOrder.position)\
            .all()
        if orders:
            raw_order = [o[0] for o in orders]
        else:
            raw_order = []
        if raw_order:
            valid_names = set(
                r[0] for r in self._db.query(Employee.name).filter(
                    Employee.name.in_(raw_order)
                ).all()
            )
            raw_order = [n for n in raw_order if n in valid_names]
        return {
            "start_date": g.start_date or "",
            "rotation_order": raw_order,
            "duty_count": g.duty_count or 1,
            "enabled": bool(g.enabled),
        }
