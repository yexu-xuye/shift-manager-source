"""值班小组 API 路由"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas import DutyGroupCreate, DutyGroupRename, DutyMemberAdd, DutyConfigUpdate
from ..services import duty as svc

router = APIRouter(prefix="/api")


@router.get("/duty/groups")
def list_groups(db: Session = Depends(get_db)):
    return svc.list_groups(db)


@router.post("/duty/groups")
def create_group(data: DutyGroupCreate, db: Session = Depends(get_db)):
    try:
        svc.add_group(db, data.name)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/duty/groups/{group_name}")
def delete_group(group_name: str, db: Session = Depends(get_db)):
    if svc.delete_group(db, group_name):
        return {"success": True}
    raise HTTPException(status_code=404, detail="小组不存在")


@router.put("/duty/groups/{group_name}/rename")
def rename_group(group_name: str, data: DutyGroupRename, db: Session = Depends(get_db)):
    try:
        svc.rename_group(db, group_name, data.new_name)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/duty/groups/{group_name}/members")
def get_members(group_name: str, db: Session = Depends(get_db)):
    try:
        members = svc.get_members(db, group_name)
        return {"members": members}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/duty/groups/{group_name}/members")
def add_member(group_name: str, data: DutyMemberAdd, db: Session = Depends(get_db)):
    try:
        svc.add_member(db, group_name, data.name)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/duty/groups/{group_name}/members/{member_name}")
def remove_member(group_name: str, member_name: str, db: Session = Depends(get_db)):
    if svc.remove_member(db, group_name, member_name):
        return {"success": True}
    raise HTTPException(status_code=404, detail="删除失败")


@router.get("/duty/groups/{group_name}/config")
def get_config(group_name: str, db: Session = Depends(get_db)):
    try:
        return svc.get_config(db, group_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/duty/groups/{group_name}/config")
def update_config(group_name: str, data: DutyConfigUpdate, db: Session = Depends(get_db)):
    try:
        svc.update_config(db, group_name, data)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
