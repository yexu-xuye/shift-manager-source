"""
排班管理系统 — SQLAlchemy ORM 模型（标准版）
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Date, Text, ForeignKey

from .database import Base
from .utils.datetime_utils import utcnow as _utcnow


# ============================================================================
# 1. Employee — 员工表
# ============================================================================

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), unique=True, nullable=False, index=True)
    group = Column(String(100), default="待分配", index=True)
    shift_type = Column(String(20), default="rotation")
    fixed_time = Column(String(10), default="9:00")
    create_time = Column(DateTime, default=_utcnow)
    update_time = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # AD 域集成字段
    ad_guid = Column(String(40))
    sAMAccountName = Column(String(50))
    last_sync_time = Column(DateTime)
    sync_enabled = Column(Integer, default=1)


# ============================================================================
# 2. ScheduleRule — 排班规则表
# ============================================================================

class ScheduleRule(Base):
    __tablename__ = "group_configs"

    name = Column(String(100), primary_key=True)
    priority = Column(String(20), default="优先早班")
    early_shift_count = Column(Integer, default=2)
    late_shift_count = Column(Integer, default=3)
    rotation_start_date = Column(Date)
    default_time = Column(String(10))       # "9:00" — 剩余员工的默认时间
    create_time = Column(DateTime, default=_utcnow)
    update_time = Column(DateTime, default=_utcnow, onupdate=_utcnow)


# ——— ScheduleRule 关联表（替代各 *_json 字段）———

class ShiftTime(Base):
    """班次时间 — 替代 shift_times_json"""
    __tablename__ = "shift_times"
    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_name = Column(String(100), ForeignKey("group_configs.name", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, nullable=False)
    time_value = Column(String(10), nullable=False)
    create_time = Column(DateTime, default=_utcnow)

class RotationOrderItem(Base):
    """轮换顺序 — 替代 rotation_order_json"""
    __tablename__ = "rotation_order_items"
    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_name = Column(String(100), ForeignKey("group_configs.name", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, nullable=False)
    employee_name = Column(String(50), nullable=False)
    create_time = Column(DateTime, default=_utcnow)

class SubGroup(Base):
    """子组 — 替代 subgroups_json 中的组定义"""
    __tablename__ = "subgroups"
    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_name = Column(String(100), ForeignKey("group_configs.name", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    initial_order = Column(Integer, default=0)
    create_time = Column(DateTime, default=_utcnow)

class SubGroupMember(Base):
    """子组成员"""
    __tablename__ = "subgroup_members"
    id = Column(Integer, primary_key=True, autoincrement=True)
    subgroup_id = Column(Integer, ForeignKey("subgroups.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_name = Column(String(50), nullable=False)
    position = Column(Integer, default=0)
    create_time = Column(DateTime, default=_utcnow)

class SubGroupTime(Base):
    """子组班次时间"""
    __tablename__ = "subgroup_times"
    id = Column(Integer, primary_key=True, autoincrement=True)
    subgroup_id = Column(Integer, ForeignKey("subgroups.id", ondelete="CASCADE"), nullable=False, index=True)
    time_value = Column(String(10), nullable=False)
    position = Column(Integer, default=0)
    create_time = Column(DateTime, default=_utcnow)

class SingleRotation(Base):
    """单人轮换 — 替代 single_rotations_json"""
    __tablename__ = "single_rotations"
    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_name = Column(String(100), ForeignKey("group_configs.name", ondelete="CASCADE"), nullable=False, index=True)
    employee_name = Column(String(50), nullable=False)
    time_one = Column(String(10))
    time_two = Column(String(10))
    start_week = Column(String(10), default="单周")
    create_time = Column(DateTime, default=_utcnow)

class SpecialTime(Base):
    """特殊时间 — 替代 special_times_json"""
    __tablename__ = "special_times"
    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_name = Column(String(100), ForeignKey("group_configs.name", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, nullable=False)
    time_value = Column(String(10), nullable=False)
    create_time = Column(DateTime, default=_utcnow)


# ============================================================================
# 3. DutyRule — 值班规则表
# ============================================================================

class DutyRule(Base):
    __tablename__ = "duty_groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    start_date = Column(Date, default=None)
    duty_count = Column(Integer, default=1)
    enabled = Column(Integer, default=1)
    create_time = Column(DateTime, default=_utcnow)
    update_time = Column(DateTime, default=_utcnow, onupdate=_utcnow)


# ============================================================================
# 4. DutyGroupMember — 值班组成员（替代 members_json）
# ============================================================================
class DutyGroupMember(Base):
    __tablename__ = "duty_group_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    group_id = Column(Integer, ForeignKey("duty_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_name = Column(String(50), nullable=False)
    position = Column(Integer, default=0)
    create_time = Column(DateTime, default=_utcnow)


# ============================================================================
# 5. DutyRotationOrder — 值班轮换顺序（替代 rotation_order_json）
# ============================================================================
class DutyRotationOrder(Base):
    __tablename__ = "duty_rotation_orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    group_id = Column(Integer, ForeignKey("duty_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, nullable=False)
    employee_name = Column(String(50), nullable=False)
    create_time = Column(DateTime, default=_utcnow)


# ============================================================================
# 6. Snapshot — 统一快照表（type 区分 schedule / duty）
# ============================================================================

class Snapshot(Base):
    __tablename__ = "snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    type = Column(String(20), nullable=False, index=True)          # "schedule" / "duty"
    week_key = Column(String(40), nullable=False, index=True)       # 周标识
    data_json = Column(Text, nullable=False)                         # 纯业务数据 JSON
    extra_json = Column(Text)                                        # 附加数据（如 rest_day_configs）
    created_at = Column(DateTime, default=_utcnow)


# ============================================================================
# 7. SystemConfig — 系统配置表
# ============================================================================

class SystemConfig(Base):
    __tablename__ = "system_config"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
