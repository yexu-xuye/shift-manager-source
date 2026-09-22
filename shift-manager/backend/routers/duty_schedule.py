"""值班生成 API 路由"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas import DutyGenerateRequest
from ..engines.engine_data import EngineData
from ..engines.duty_engine import DutyEngine

router = APIRouter(prefix="/api")


@router.post("/duty/generate")
def generate_duty(data: DutyGenerateRequest, db: Session = Depends(get_db)):
    try:
        ed = EngineData(db)
        engine = DutyEngine(ed)
        return engine.generate_duty_schedule(datetime.combine(data.start_date, datetime.min.time()), data.groups)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
