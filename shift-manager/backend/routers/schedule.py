"""排班生成 + 快照 API 路由"""
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas import ScheduleRequest, SnapshotSave
from ..services import snapshot as snap_svc
from ..engines.engine_data import EngineData
from ..engines.schedule_engine import ScheduleEngine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


@router.post("/schedule")
def generate_schedule(data: ScheduleRequest, db: Session = Depends(get_db)):
    try:
        ed = EngineData(db)
        engine = ScheduleEngine(ed)
        return engine.generate_full_schedule(datetime.combine(data.start_date, datetime.min.time()), data.groups)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("排班生成失败")
        raise HTTPException(status_code=500, detail="排班生成失败")


# ——— 统一快照 API ———

@router.get("/snapshots")
def list_snapshots(type: str = Query("schedule"), db: Session = Depends(get_db)):
    return {"items": snap_svc.list_snapshots(db, type)}


@router.post("/snapshots")
def save_snapshot(data: SnapshotSave, db: Session = Depends(get_db)):
    try:
        snap_svc.save_snapshot(db, data.type, data.week_key, data.data, data.extra)
        return {"success": True}
    except Exception:
        logger.exception("快照保存失败")
        raise HTTPException(status_code=500, detail="快照保存失败")


@router.get("/snapshots/{snapshot_id:int}")
def get_snapshot(snapshot_id: int, db: Session = Depends(get_db)):
    try:
        return snap_svc.get_snapshot(db, snapshot_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/snapshots/{snapshot_id:int}")
def delete_snapshot(snapshot_id: int, db: Session = Depends(get_db)):
    if snap_svc.delete_snapshot(db, snapshot_id):
        return {"success": True}
    raise HTTPException(status_code=404, detail="删除失败或快照不存在")
