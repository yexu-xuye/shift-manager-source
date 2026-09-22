"""组别 API 路由"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas import GroupCreate, GroupConfigUpdate
from ..services import group as svc

router = APIRouter(prefix="/api")


@router.get("/groups")
def list_groups(db: Session = Depends(get_db)):
    return svc.get_all_group_names(db)


@router.post("/groups")
def create_group(data: GroupCreate, db: Session = Depends(get_db)):
    try:
        svc.add_group(db, data.name)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/groups/{group_name:str}")
def delete_group(group_name: str, db: Session = Depends(get_db)):
    try:
        count = svc.delete_group(db, group_name)
        return {"success": True, "reassigned": count}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    
@router.get("/group-config/{group_name:str}")
def get_config(group_name: str, db: Session = Depends(get_db)):
    try:
        return svc.get_config(db, group_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/group-config/{group_name:str}")
def update_config(group_name: str, data: GroupConfigUpdate, db: Session = Depends(get_db)):
    try:
        svc.update_config(db, group_name, data)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
