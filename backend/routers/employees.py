"""员工 API 路由"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas import EmployeeCreate, EmployeeUpdate, PinyinRequest
from ..services import employee as svc

router = APIRouter(prefix="/api")


@router.get("/employees")
def list_employees(group: str = "", db: Session = Depends(get_db)):
    return svc.list_employees(db, group)


@router.post("/employees")
def create_employee(data: EmployeeCreate, db: Session = Depends(get_db)):
    try:
        svc.add_employee(db, data.name, data.group, data.shift_type, data.fixed_time)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/employees/{name:str}")
def update_employee(name: str, data: EmployeeUpdate, db: Session = Depends(get_db)):
    try:
        svc.update_employee(db, name, data)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/employees/{name:str}")
def delete_employee(name: str, db: Session = Depends(get_db)):
    if svc.remove_employee(db, name):
        return {"success": True}
    raise HTTPException(status_code=404, detail="员工不存在")


@router.post("/pinyin-initials")
def get_pinyin_initials(data: PinyinRequest):
    initials = svc.get_pinyin_initials(data.name)
    return {"name": data.name, "initials": initials}
