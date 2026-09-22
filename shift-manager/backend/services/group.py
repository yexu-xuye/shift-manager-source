"""
组别配置服务层
"""
from sqlalchemy.orm import Session
from ..models import (
    ScheduleRule, Employee,
    ShiftTime, RotationOrderItem,
    SubGroup, SubGroupMember, SubGroupTime,
    SingleRotation, SpecialTime,
)
from ..schemas import GroupConfigUpdate


def get_all_group_names(db: Session) -> list[str]:
    rows = db.query(Employee.group).distinct().all()
    names = sorted([r[0] for r in rows if r[0]])
    return names


def add_group(db: Session, name: str) -> ScheduleRule:
    if db.query(ScheduleRule).filter(ScheduleRule.name == name).first():
        raise ValueError("组别已存在")
    g = ScheduleRule(name=name)
    db.add(g)
    db.commit()
    return g


def delete_group(db: Session, name: str):
    emp_count = db.query(Employee).filter(Employee.group == name).update({"group": "待分配"})
    db.query(ScheduleRule).filter(ScheduleRule.name == name).delete()
    db.commit()
    return emp_count


# ============================================================
#  辅助：关联表 ↔ dict 互转
# ============================================================

def _query_shift_times(db: Session, rule_name: str) -> list[str]:
    rows = db.query(ShiftTime.time_value)\
        .filter(ShiftTime.rule_name == rule_name)\
        .order_by(ShiftTime.position).all()
    return [r[0] for r in rows] if rows else ["9:00", "13:00"]


def _query_rotation_order(db: Session, rule_name: str) -> list[str]:
    rows = db.query(RotationOrderItem.employee_name)\
        .filter(RotationOrderItem.rule_name == rule_name)\
        .order_by(RotationOrderItem.position).all()
    return [r[0] for r in rows]


def _query_special_times(db: Session, rule_name: str) -> list[str]:
    rows = db.query(SpecialTime.time_value)\
        .filter(SpecialTime.rule_name == rule_name)\
        .order_by(SpecialTime.position).all()
    return [r[0] for r in rows]


def _query_subgroups(db: Session, rule_name: str) -> list[dict]:
    subgroups = db.query(SubGroup).filter(SubGroup.rule_name == rule_name)\
        .order_by(SubGroup.id).all()
    result = []
    for sg in subgroups:
        members = db.query(SubGroupMember.employee_name)\
            .filter(SubGroupMember.subgroup_id == sg.id)\
            .order_by(SubGroupMember.position).all()
        times = db.query(SubGroupTime.time_value)\
            .filter(SubGroupTime.subgroup_id == sg.id)\
            .order_by(SubGroupTime.position).all()
        result.append({
            "name": sg.name,
            "members": [m[0] for m in members],
            "times": [t[0] for t in times] if times else ["9:00", "13:00"],
            "initial_order": sg.initial_order,
        })
    return result


def _query_single_rotations(db: Session, rule_name: str) -> list[dict]:
    rows = db.query(SingleRotation).filter(SingleRotation.rule_name == rule_name).all()
    result = []
    for sr in rows:
        times = []
        if sr.time_one:
            times.append(sr.time_one)
        if sr.time_two:
            times.append(sr.time_two)
        result.append({
            "name": sr.employee_name,
            "times": times if times else ["9:00", "13:00"],
            "start_week": sr.start_week or "单周",
        })
    return result


# ============================================================
#  主接口
# ============================================================

def get_config(db: Session, name: str) -> dict:
    g = db.query(ScheduleRule).filter(ScheduleRule.name == name).first()
    if not g:
        emp_exists = db.query(Employee).filter(Employee.group == name).first()
        if emp_exists:
            return {
                "shift_times": ["9:00", "13:00"],
                "priority": "优先早班",
                "early_shift_count": 2,
                "late_shift_count": 3,
                "rotation_order": [],
            }
        else:
            raise ValueError("组别不存在")

    result = {
        "shift_times": _query_shift_times(db, g.name),
        "priority": g.priority if g.priority is not None else "优先早班",
        "early_shift_count": g.early_shift_count if g.early_shift_count is not None else 2,
        "late_shift_count": g.late_shift_count if g.late_shift_count is not None else 3,
        "rotation_order": _query_rotation_order(db, g.name),
    }
    if g.rotation_start_date:
        result["rotation_start_date"] = g.rotation_start_date
    special_times = _query_special_times(db, g.name)
    if special_times:
        result["special_times"] = special_times
    if g.default_time:
        result["default_time"] = g.default_time
    subgroups = _query_subgroups(db, g.name)
    if subgroups:
        result["subgroups"] = subgroups
    single_rotations = _query_single_rotations(db, g.name)
    if single_rotations:
        result["single_rotations"] = single_rotations
    return result


def update_config(db: Session, name: str, data: GroupConfigUpdate):
    g = db.query(ScheduleRule).filter(ScheduleRule.name == name).first()
    if not g:
        g = ScheduleRule(name=name)
        db.add(g)

    # 标量字段
    if data.priority is not None:
        g.priority = data.priority
    if data.early_shift_count is not None:
        g.early_shift_count = data.early_shift_count
    if data.late_shift_count is not None:
        g.late_shift_count = data.late_shift_count
    if data.rotation_start_date is not None:
        g.rotation_start_date = data.rotation_start_date
    if data.default_time is not None:
        g.default_time = data.default_time or None

    # 关联表字段：删旧插新
    if data.shift_times is not None:
        db.query(ShiftTime).filter(ShiftTime.rule_name == g.name).delete()
        for idx, t in enumerate(data.shift_times):
            db.add(ShiftTime(rule_name=g.name, position=idx, time_value=t))

    if data.rotation_order is not None:
        db.query(RotationOrderItem).filter(RotationOrderItem.rule_name == g.name).delete()
        for idx, emp_name in enumerate(data.rotation_order):
            db.add(RotationOrderItem(rule_name=g.name, position=idx, employee_name=emp_name))

    if data.special_times is not None:
        db.query(SpecialTime).filter(SpecialTime.rule_name == g.name).delete()
        val = data.special_times or []
        for idx, t in enumerate(val):
            db.add(SpecialTime(rule_name=g.name, position=idx, time_value=t))

    if data.subgroups is not None:
        # 删除旧子组（CASCADE 自动清成员+时间）
        old_sgs = db.query(SubGroup).filter(SubGroup.rule_name == g.name).all()
        for sg in old_sgs:
            db.query(SubGroupMember).filter(SubGroupMember.subgroup_id == sg.id).delete()
            db.query(SubGroupTime).filter(SubGroupTime.subgroup_id == sg.id).delete()
        db.query(SubGroup).filter(SubGroup.rule_name == g.name).delete()

        for sg_data in data.subgroups:
            sg = SubGroup(rule_name=g.name, name=sg_data["name"],
                          initial_order=sg_data.get("initial_order", 0))
            db.add(sg)
            db.flush()  # 获取 sg.id
            for mi, m in enumerate(sg_data.get("members", [])):
                db.add(SubGroupMember(subgroup_id=sg.id, employee_name=m, position=mi))
            for ti, t in enumerate(sg_data.get("times", ["9:00", "13:00"])):
                db.add(SubGroupTime(subgroup_id=sg.id, time_value=t, position=ti))

    if data.single_rotations is not None:
        db.query(SingleRotation).filter(SingleRotation.rule_name == g.name).delete()
        for sr_data in data.single_rotations:
            times = sr_data.get("times", [])
            db.add(SingleRotation(
                rule_name=g.name,
                employee_name=sr_data["name"],
                time_one=times[0] if len(times) > 0 else None,
                time_two=times[1] if len(times) > 1 else None,
                start_week=sr_data.get("start_week", "单周"),
            ))

    db.commit()
