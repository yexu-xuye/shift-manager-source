"""
快照服务层（统一版 — type 区分 schedule / duty）
"""
import json
from sqlalchemy.orm import Session
from ..models import Snapshot
from ..utils.datetime_utils import utcnow as _now


def list_snapshots(db: Session, snap_type: str) -> list[dict]:
    """列出指定类型的所有快照"""
    rows = db.query(Snapshot).filter(Snapshot.type == snap_type).order_by(Snapshot.week_key.desc()).all()
    result = []
    for s in rows:
        parsed = json.loads(s.data_json) if s.data_json else {}
        if isinstance(parsed, list):
            count = len(parsed)  # 旧格式（排班快照为数组）
        else:
            count = len(parsed.get("weeks", []))
        result.append({
            "id": s.id,
            "week_key": s.week_key,
            "record_count": count,
            "created_at": str(s.created_at or ""),
        })
    return result


def save_snapshot(db: Session, snap_type: str, week_key: str, data, extra: dict | None = None) -> Snapshot:
    """保存/更新快照 — data 直接存为纯业务 JSON，extra 存附加数据"""
    existing = db.query(Snapshot).filter(
        Snapshot.type == snap_type, Snapshot.week_key == week_key
    ).first()
    if existing:
        existing.data_json = json.dumps(data, ensure_ascii=False)
        existing.extra_json = json.dumps(extra, ensure_ascii=False) if extra else None
        existing.created_at = _now()
    else:
        existing = Snapshot(
            type=snap_type,
            week_key=week_key,
            data_json=json.dumps(data, ensure_ascii=False),
            extra_json=json.dumps(extra, ensure_ascii=False) if extra else None,
            created_at=_now(),
        )
        db.add(existing)
    db.commit()
    return existing


def get_snapshot(db: Session, snapshot_id: int) -> dict:
    """获取单个快照详情"""
    s = db.query(Snapshot).filter(Snapshot.id == snapshot_id).first()
    if not s:
        raise ValueError("快照不存在")
    return {
        "id": s.id,
        "type": s.type,
        "week_key": s.week_key,
        "data": json.loads(s.data_json) if s.data_json else [],
        "extra": json.loads(s.extra_json) if s.extra_json else None,
        "created_at": str(s.created_at or ""),
    }


def delete_snapshot(db: Session, snapshot_id: int) -> bool:
    """删除快照"""
    s = db.query(Snapshot).filter(Snapshot.id == snapshot_id).first()
    if not s:
        return False
    db.delete(s)
    db.commit()
    return True
