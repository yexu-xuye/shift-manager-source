"""
员工服务层
"""
import logging
from sqlalchemy.orm import Session
from pypinyin import pinyin, Style
from ..models import Employee
from ..schemas import EmployeeUpdate

logger = logging.getLogger(__name__)


def _pinyin(name: str) -> str:
    try:
        return "".join([item[0][0] for item in pinyin(name, style=Style.FIRST_LETTER)])
    except Exception as e:
        logger.warning(f"拼音解析失败: {name}, {e}")
        return ""


def get_pinyin_initials(name: str) -> str:
    return _pinyin(name)


def list_employees(db: Session, group: str = "") -> list[dict]:
    q = db.query(Employee)
    if group:
        q = q.filter(Employee.group == group)
    results = []
    for e in q.order_by(Employee.name).all():
        results.append({
            "name": e.name,
            "group": e.group,
            "shift_type": e.shift_type,
            "fixed_time": e.fixed_time if e.shift_type == "fixed" and e.fixed_time else "",
            "pinyin_initials": _pinyin(e.name),
        })
    return results


def add_employee(db: Session, name: str, group: str, shift_type: str = "rotation", fixed_time: str = "9:00") -> Employee:
    if db.query(Employee).filter(Employee.name == name).first():
        raise ValueError("员工已存在")
    emp = Employee(name=name, group=group, shift_type=shift_type, fixed_time=fixed_time)
    db.add(emp)
    db.commit()
    return emp


def update_employee(db: Session, name: str, data: EmployeeUpdate) -> Employee:
    emp = db.query(Employee).filter(Employee.name == name).first()
    if not emp:
        raise ValueError("员工不存在")
    updates = data.model_dump(exclude_none=True)
    if "new_name" in updates and updates["new_name"] != name:
        if db.query(Employee).filter(Employee.name == updates["new_name"]).first():
            raise ValueError("新姓名已存在")
        emp.name = updates["new_name"]
    if "new_group" in updates:
        emp.group = updates["new_group"]
    if "new_shift_type" in updates:
        emp.shift_type = updates["new_shift_type"]
    if "new_fixed_time" in updates:
        emp.fixed_time = updates["new_fixed_time"]
    db.commit()
    return emp


def remove_employee(db: Session, name: str) -> bool:
    emp = db.query(Employee).filter(Employee.name == name).first()
    if not emp:
        return False
    db.delete(emp)

    # ——— 关联表清理 ———
    from ..models import RotationOrderItem, SingleRotation, SubGroupMember
    from ..models import DutyGroupMember, DutyRotationOrder

    db.query(RotationOrderItem).filter(RotationOrderItem.employee_name == name).delete()
    db.query(SingleRotation).filter(SingleRotation.employee_name == name).delete()
    db.query(SubGroupMember).filter(SubGroupMember.employee_name == name).delete()
    db.query(DutyGroupMember).filter(DutyGroupMember.employee_name == name).delete()
    db.query(DutyRotationOrder).filter(DutyRotationOrder.employee_name == name).delete()

    db.commit()
    return True
