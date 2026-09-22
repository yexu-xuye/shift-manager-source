"""
值班服务层
"""
from sqlalchemy.orm import Session
from ..models import DutyRule, DutyGroupMember, DutyRotationOrder
from ..schemas import DutyConfigUpdate


# ——— 小组 CRUD ————————————————————————————————

def list_groups(db: Session) -> list[str]:
    rows = db.query(DutyRule.name).order_by(DutyRule.name).all()
    return [r[0] for r in rows]


def add_group(db: Session, name: str) -> DutyRule:
    if db.query(DutyRule).filter(DutyRule.name == name).first():
        raise ValueError("小组已存在")
    g = DutyRule(name=name)
    db.add(g)
    db.commit()
    return g


def delete_group(db: Session, name: str) -> bool:
    g = db.query(DutyRule).filter(DutyRule.name == name).first()
    if not g:
        return False
    db.delete(g)  # CASCADE 自动清理 members / rotation_orders
    db.commit()
    return True


def rename_group(db: Session, old_name: str, new_name: str):
    if db.query(DutyRule).filter(DutyRule.name == new_name).first():
        raise ValueError("组名已存在")
    g = db.query(DutyRule).filter(DutyRule.name == old_name).first()
    if not g:
        raise ValueError("小组不存在")
    g.name = new_name
    db.commit()


# ——— 成员管理 —————————————————————————————————

def _get_group(db: Session, name: str) -> DutyRule:
    g = db.query(DutyRule).filter(DutyRule.name == name).first()
    if not g:
        raise ValueError("小组不存在")
    return g


def get_members(db: Session, name: str) -> list[str]:
    g = _get_group(db, name)
    rows = db.query(DutyGroupMember.employee_name)\
        .filter(DutyGroupMember.group_id == g.id)\
        .order_by(DutyGroupMember.position)\
        .all()
    return [r[0] for r in rows]


def add_member(db: Session, group_name: str, member_name: str):
    g = _get_group(db, group_name)
    existing = db.query(DutyGroupMember).filter(
        DutyGroupMember.group_id == g.id,
        DutyGroupMember.employee_name == member_name,
    ).first()
    if existing:
        raise ValueError("成员已存在")
    max_pos = db.query(DutyGroupMember).filter(
        DutyGroupMember.group_id == g.id
    ).count()
    db.add(DutyGroupMember(group_id=g.id, employee_name=member_name, position=max_pos))
    db.commit()


def remove_member(db: Session, group_name: str, member_name: str) -> bool:
    g = db.query(DutyRule).filter(DutyRule.name == group_name).first()
    if not g:
        return False
    m = db.query(DutyGroupMember).filter(
        DutyGroupMember.group_id == g.id,
        DutyGroupMember.employee_name == member_name,
    ).first()
    if not m:
        return False
    db.delete(m)
    # 同步清理轮换顺序中的该成员
    db.query(DutyRotationOrder).filter(
        DutyRotationOrder.group_id == g.id,
        DutyRotationOrder.employee_name == member_name,
    ).delete()
    db.commit()
    return True


# ——— 配置读写 —————————————————————————————————

def get_config(db: Session, name: str) -> dict:
    g = _get_group(db, name)
    members = db.query(DutyGroupMember.employee_name)\
        .filter(DutyGroupMember.group_id == g.id)\
        .order_by(DutyGroupMember.position)\
        .all()
    orders = db.query(DutyRotationOrder.employee_name)\
        .filter(DutyRotationOrder.group_id == g.id)\
        .order_by(DutyRotationOrder.position)\
        .all()
    return {
        "members": [m[0] for m in members],
        "start_date": g.start_date or "",
        "rotation_order": [o[0] for o in orders],
        "duty_count": g.duty_count or 1,
        "enabled": bool(g.enabled),
    }


def update_config(db: Session, name: str, data: DutyConfigUpdate):
    g = _get_group(db, name)

    if data.members is not None:
        # 清除旧成员，写入新成员
        db.query(DutyGroupMember).filter(DutyGroupMember.group_id == g.id).delete()
        for idx, member_name in enumerate(data.members):
            db.add(DutyGroupMember(group_id=g.id, employee_name=member_name, position=idx))

    if data.start_date is not None:
        g.start_date = data.start_date

    if data.rotation_order is not None:
        db.query(DutyRotationOrder).filter(DutyRotationOrder.group_id == g.id).delete()
        for idx, member_name in enumerate(data.rotation_order):
            db.add(DutyRotationOrder(group_id=g.id, position=idx, employee_name=member_name))

    if data.duty_count is not None:
        g.duty_count = data.duty_count

    if data.enabled is not None:
        g.enabled = 1 if data.enabled else 0

    db.commit()
