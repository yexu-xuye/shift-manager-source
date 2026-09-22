"""AD 域集成 — API 路由（选择性同步增强版）"""

from __future__ import annotations

import json
import uuid
from datetime import datetime

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..utils.datetime_utils import utcnow

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ad", tags=["AD"])


# ---------------------------------------------------------------------------
# 配置读写辅助
# ---------------------------------------------------------------------------

def _get_config(db: Session, key: str) -> str | None:
    row = db.query(models.SystemConfig).filter(models.SystemConfig.key == key).first()
    return row.value if row else None


def _set_config(db: Session, key: str, value: str) -> None:
    row = db.query(models.SystemConfig).filter(models.SystemConfig.key == key).first()
    if row:
        row.value = value
        row.updated_at = utcnow()
    else:
        db.add(models.SystemConfig(key=key, value=value))
    db.commit()


# ---------------------------------------------------------------------------
# ldap3 辅助
# ---------------------------------------------------------------------------

def _attr_val(entry, attr_name: str, default: str = "", required: bool = False) -> str:
    """从 ldap3 Entry 安全提取属性值，总是返回字符串。

    ldap3 中 entry.attr 的返回值因版本和属性状态而异：
      - 有值时：  str (2.x) 或 list[str] (某些版本)
      - 无值时：  [] (空列表) 或 None
      - 未请求时：Attribute 对象（需 .value 取）
    本函数统一处理所有情况。
    """
    a = getattr(entry, attr_name, None)
    if a is None:
        if required:
            logger.warning(f"AD 属性 {attr_name} 不存在于 entry 中（要求必填）")
        return default
    # ldap3 2.x 直接返回 value；旧版返回 Attribute 对象需取 .value
    v = a.value if hasattr(a, "value") else a
    if v is None:
        if required:
            logger.warning(f"AD 属性 {attr_name} 值为 None（要求必填）")
        return default
    if isinstance(v, (list, tuple)):
        if not v:
            if required:
                logger.warning(f"AD 属性 {attr_name} 为空列表（要求必填）")
            return default
        return str(v[0])
    # bool 是 int 子类，需要优先判断
    if isinstance(v, bool):
        return str(v)
    s = str(v).strip()
    if not s and required:
        logger.warning(f"AD 属性 {attr_name} 值为空字符串（要求必填）")
    return s if s else default


def _build_guid_hex(entry) -> str:
    """从 ldap3 entry 提取 objectGUID 并转为十六进制字符串。"""
    guid_bytes = getattr(entry, "objectGUID", None)
    if not guid_bytes:
        return ""
    raw_val = guid_bytes.raw_values[0] if hasattr(guid_bytes, "raw_values") else guid_bytes.value
    return uuid.UUID(bytes_le=raw_val).hex if raw_val else ""


def _connect_ad(cfg: dict):
    """创建 AD 连接，手动 SIMPLE bind + 严格匿名检测。"""
    from ldap3 import Server, Connection, SIMPLE, ALL

    use_ssl = cfg.get("use_ssl", True)
    port = cfg.get("port", 636 if use_ssl else 389)
    username = cfg["username"].strip()
    password = cfg["password"]
    if not isinstance(password, str):
        password = password.get_secret_value()

    if not username or not password:
        raise RuntimeError("AD 账号或密码为空")

    server = Server(cfg["host"], port=port, use_ssl=use_ssl,
                    get_info=ALL, connect_timeout=10)
    conn = Connection(server, user=username, password=password,
                      authentication=SIMPLE, auto_bind=False, receive_timeout=30)

    # 手动 bind，控制结果
    if not conn.bind():
        desc = conn.result.get("description", "未知错误")
        raise RuntimeError(f"AD 绑定失败: {desc}（{username}@{cfg['host']}:{port}, ssl={use_ssl}）")

    # BUG-1 修复：conn.authentication 在 bind() 后不回写，匿名回退时仍显示 "SIMPLE"
    # who_am_i 在 Microsoft AD 匿名连接下返回 "u:NT AUTHORITY\ANONYMOUS LOGON"（非空！）
    # 必须同时检测 None/空字符串/包含 "ANONYMOUS" 三种情况
    who_am_i_result = conn.extend.standard.who_am_i()
    if not who_am_i_result or not who_am_i_result.strip() or "ANONYMOUS" in who_am_i_result.upper():
        conn.unbind()
        raise HTTPException(status_code=401,
            detail=f"AD 认证失败：匿名绑定被拒绝（who_am_i={who_am_i_result}），请检查用户名和密码")

    return conn


def _extract_ou_from_dn(dn: str) -> str:
    """从 DN 提取 DC 前最近的 OU 作为组别。CN=张三,OU=工艺,DC=xxx → '工艺'"""
    if not dn:
        return ""
    parts = [p.strip() for p in dn.split(",")]
    ous = [p[3:] for p in parts if p.upper().startswith("OU=")]
    return ous[0] if ous else ""  # 第一个 OU = 组别


def _search_ad_users(conn, cfg: dict, paged_size=500) -> list[dict]:
    """搜索 AD 用户，组别从 DN 的 OU 提取。"""
    from ldap3 import SUBTREE

    search_ou = cfg.get("search_ou") or cfg.get("base_dn", "")
    conn.search(
        search_base=search_ou,
        search_filter="(&(objectClass=user)(objectCategory=person))",
        search_scope=SUBTREE,
        attributes=["objectGUID", "displayName", "distinguishedName", "sAMAccountName"],
        paged_size=paged_size,
    )

    users = []
    for entry in conn.entries:
        guid_hex = _build_guid_hex(entry)
        if not guid_hex:
            continue
        dn = _attr_val(entry, "distinguishedName")
        users.append({
            "guid": guid_hex,
            "name": _attr_val(entry, "displayName"),
            "dept": _extract_ou_from_dn(dn),
            "sAMAccountName": _attr_val(entry, "sAMAccountName"),
        })
    return users

# ===================================================================
#  测试连接
# ===================================================================

@router.post("/test-connection", response_model=schemas.ADTestResult)
def test_ad_connection(cfg: schemas.ADConfig):
    """测试 AD 连接 — 每次均需提供完整凭证。"""
    try:
        conn = _connect_ad(cfg.model_dump())
        users = _search_ad_users(conn, cfg.model_dump())
        conn.unbind()
        return schemas.ADTestResult(
            success=True,
            message=f"连接成功，可查询到 {len(users)} 名用户（{conn.user}）",
            user_count=len(users),
        )
    except ImportError:
        raise HTTPException(status_code=500, detail="缺少 ldap3 库，请执行: pip install ldap3")
    except Exception as e:
        return schemas.ADTestResult(success=False, message=f"连接失败: {str(e)}")


# ===================================================================
#  忽略列表管理 — 使用独立表存储
# ===================================================================

def _get_ignored_guids(db: Session) -> set[str]:
    rows = db.query(models.Employee).filter(models.Employee.sync_enabled == 0, models.Employee.ad_guid.isnot(None)).all()
    return {r.ad_guid for r in rows if r.ad_guid}


@router.get("/ignored-users", response_model=list[schemas.ADIgnoredUser])
def list_ignored_users(db: Session = Depends(get_db)):
    emps = db.query(models.Employee).filter(models.Employee.sync_enabled == 0, models.Employee.ad_guid.isnot(None)).all()
    return [schemas.ADIgnoredUser(guid=e.ad_guid, name=e.name, group=e.group or "", sAMAccountName="", ignored_at=str(e.last_sync_time or "")) for e in emps]


@router.post("/ignored-users/{guid}")
def ignore_ad_user(guid: str, db: Session = Depends(get_db)):
    emp = db.query(models.Employee).filter(models.Employee.ad_guid == guid).first()
    if emp:
        emp.sync_enabled = 0
        db.commit()
        return {"message": f"已忽略 {emp.name}"}
    # AD 用户还未导入本地，记录到忽略列表以备将来
    existing = _get_config(db, "ad_ignored_pending")
    pending = set(json.loads(existing)) if existing else set()
    pending.add(guid)
    _set_config(db, "ad_ignored_pending", json.dumps(list(pending), ensure_ascii=False))
    return {"message": f"已标记忽略 {guid}"}


@router.delete("/ignored-users/{guid}")
def unignore_ad_user(guid: str, db: Session = Depends(get_db)):
    emp = db.query(models.Employee).filter(models.Employee.ad_guid == guid).first()
    if emp:
        emp.sync_enabled = 1
        db.commit()
    # 同时从待定忽略列表中移除
    existing = _get_config(db, "ad_ignored_pending")
    if existing:
        pending = set(json.loads(existing))
        pending.discard(guid)
        _set_config(db, "ad_ignored_pending", json.dumps(list(pending), ensure_ascii=False))
    return {"message": f"已取消忽略 {guid}"}


# ===================================================================
#  同步策略
# ===================================================================

@router.get("/sync-policy", response_model=schemas.ADSyncPolicy)
def get_sync_policy(db: Session = Depends(get_db)):
    """获取同步策略。"""
    raw = _get_config(db, "ad_sync_policy")
    if raw:
        return schemas.ADSyncPolicy(**json.loads(raw))
    return schemas.ADSyncPolicy()


@router.put("/sync-policy")
def save_sync_policy(policy: schemas.ADSyncPolicy, db: Session = Depends(get_db)):
    """保存同步策略。"""
    _set_config(db, "ad_sync_policy", json.dumps(policy.model_dump(), ensure_ascii=False))
    return {"message": "同步策略已保存"}


# ===================================================================
#  共享匹配逻辑（预览和确认复用，保证一致性）
# ===================================================================

def _build_employee_indexes(db: Session):
    """构建本地员工的双索引（guid + name），预览和确认共用。"""
    local_by_guid: dict[str, models.Employee] = {}
    local_by_name: dict[str, models.Employee] = {}
    local_names: set[str] = set()
    all_local = db.query(models.Employee).all()
    for e in all_local:
        if e.ad_guid:
            local_by_guid[e.ad_guid] = e
        local_by_name[e.name] = e
        local_names.add(e.name)
    return local_by_guid, local_by_name, local_names, all_local


def _match_ad_user(ad_user: dict, local_by_guid: dict, local_by_name: dict):
    """用 guid → name 优先级匹配 AD 用户到本地员工，返回匹配结果或 None。"""
    return local_by_guid.get(ad_user["guid"]) or local_by_name.get(ad_user["name"])


def _diff_employee(local: models.Employee, ad_user: dict) -> list[str]:
    """对比本地员工与 AD 数据，返回差异列表。"""
    diffs = []
    if local.name != ad_user["name"]:
        diffs.append(f"姓名: {local.name} → {ad_user['name']}")
    if (local.group or "") != ad_user["dept"]:
        diffs.append(f"组别: {local.group or '无'} → {ad_user['dept']}")
    ad_sam = ad_user.get("sAMAccountName", "")
    if not local.sAMAccountName or local.sAMAccountName != ad_sam:
        diffs.append(f"工号: {(local.sAMAccountName or '无')} → {(ad_sam or '无')}")
    return diffs


# ===================================================================
#  导入预览（不含离职判断，支持忽略列表和勾选）
# ===================================================================

@router.post("/import/preview")
def preview_ad_import(cfg: schemas.ADConfig, db: Session = Depends(get_db)):
    """拉取 AD 数据，对比本地数据库，返回完整差异预览。"""
    try:
        cfg_dict = cfg.model_dump()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"AD 配置格式错误: {e}")

    policy = schemas.ADSyncPolicy()
    policy_raw = _get_config(db, "ad_sync_policy")
    if policy_raw:
        try: policy = schemas.ADSyncPolicy(**json.loads(policy_raw))
        except Exception as e:
            logger.warning(f"同步策略 JSON 解析失败，回退默认值: {e}")

    try:
        conn = _connect_ad(cfg_dict)
        ad_users = _search_ad_users(conn, cfg_dict)
        conn.unbind()
    except ImportError:
        raise HTTPException(status_code=500, detail="缺少 ldap3 库")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AD 连接失败: {str(e)}")

    ignored_guids = _get_ignored_guids(db)
    # 合并待定忽略列表
    pending = _get_config(db, "ad_ignored_pending")
    if pending:
        ignored_guids |= set(json.loads(pending))

    # 本地员工索引 —— 复用共享函数
    local_by_guid, local_by_name, local_names, all_local = _build_employee_indexes(db)

    # AD 用户索引
    ad_by_guid = {au["guid"]: au for au in ad_users}
    ad_names = {au["name"] for au in ad_users}

    details = []
    new_count = update_count = departed_count = 0

    for au in ad_users:
        guid = au["guid"]
        local = _match_ad_user(au, local_by_guid, local_by_name)
        is_ignored = guid in ignored_guids

        if is_ignored:
            details.append({
                "type": "ignored", "guid": guid,
                "ad_name": au["name"], "ad_dept": au["dept"],
                "sAMAccountName": au["sAMAccountName"],
                "selected": False,
            })
            continue

        if local:
            diffs = _diff_employee(local, au)

            if diffs and local.sync_enabled and policy.auto_update_existing:
                update_count += 1
                details.append({
                    "type": "update", "guid": guid,
                    "ad_name": au["name"], "local_name": local.name,
                    "ad_dept": au["dept"], "local_group": local.group or "",
                    "diffs": diffs, "selected": True, "sync_disabled": False,
                })
            elif diffs and not local.sync_enabled:
                details.append({
                    "type": "update", "guid": guid,
                    "ad_name": au["name"], "local_name": local.name,
                    "ad_dept": au["dept"], "local_group": local.group or "",
                    "diffs": diffs, "selected": False, "sync_disabled": True,
                })
        else:
            new_count += 1
            details.append({
                "type": "new", "guid": guid,
                "ad_name": au["name"], "ad_dept": au["dept"],
                "sAMAccountName": au["sAMAccountName"],
                "selected": policy.auto_import_new,
            })

    # 检测已离职：本地存在但 AD 中不存在
    for e in all_local:
        if e.ad_guid and e.ad_guid not in ad_by_guid and e.name not in ad_names:
            departed_count += 1
            details.append({
                "type": "departed", "guid": e.ad_guid,
                "local_name": e.name, "local_dept": e.group or "",
                "local_group": e.group or "",
                "selected": False,
            })

    return {
        "total_in_ad": len(ad_users),
        "ignored_count": len([d for d in details if d["type"] == "ignored"]),
        "new_count": new_count,
        "update_count": update_count,
        "departed_count": departed_count,
        "details": details,
    }


# ===================================================================
#  确认导入（根据管理员勾选的 GUID 执行）
# ===================================================================

@router.post("/import/confirm", response_model=schemas.ADImportResult)
def confirm_ad_import(
    req: schemas.ADConfirmRequest,
    db: Session = Depends(get_db),
):
    """根据管理员勾选的 GUID 列表执行导入。"""
    cfg = req.model_dump()
    ignored_guids = _get_ignored_guids(db)
    pending = _get_config(db, "ad_ignored_pending")
    if pending:
        ignored_guids |= set(json.loads(pending))
    selected_set = set(req.selected_guids) - ignored_guids
    errors = []
    new_count = 0
    update_count = 0

    try:
        conn = _connect_ad(cfg)
        ad_users = _search_ad_users(conn, cfg)
        conn.unbind()

        # 按 guid 索引
        ad_by_guid: dict[str, dict] = {}
        for au in ad_users:
            if au["guid"] not in ignored_guids:
                ad_by_guid[au["guid"]] = au

        local_by_guid, local_by_name, _, _ = _build_employee_indexes(db)

        now = utcnow()
        policy = schemas.ADSyncPolicy()
        policy_raw = _get_config(db, "ad_sync_policy")
        if policy_raw:
            policy = schemas.ADSyncPolicy(**json.loads(policy_raw))

        for guid in selected_set:
            au = ad_by_guid.get(guid)
            if not au:
                continue

            local = _match_ad_user(au, local_by_guid, local_by_name)
            if local:
                # ——— 纯身份关联：无条件补齐 guid 和工号（不碰其他数据）———
                if not local.ad_guid:
                    local.ad_guid = guid
                    local.last_sync_time = now
                    local_by_guid[guid] = local
                    update_count += 1
                # BUG-5 修复：仅当 AD 有有效非空值时才更新 sAMAccountName，防止空值覆盖
                if au.get("sAMAccountName", ""):
                    local.sAMAccountName = au["sAMAccountName"]

                # ——— 全量更新：策略允许时才覆盖姓名/组别等字段 ———
                if local.sync_enabled and policy.auto_update_existing:
                    # BUG-5 修复：仅当 AD 有有效非空值时才覆盖本地数据，防止不可逆数据破坏
                    if au["name"]:
                        local.name = au["name"]
                    if au["dept"]:
                        local.group = au["dept"]
                    local.last_sync_time = now
            else:
                # 新增
                emp = models.Employee(
                    name=au["name"],
                    group=au["dept"],  # AD 为准
                    ad_guid=guid,
                    sAMAccountName=au.get("sAMAccountName", ""),
                    last_sync_time=now,
                    sync_enabled=1,
                )
                db.add(emp)
                # 保存引用以便组匹配
                local_by_guid[guid] = emp
                new_count += 1

        # ——— 自动创建缺失组别 ———
        existing_group_names = {g.name for g in db.query(models.ScheduleRule).all()}
        group_created = 0

        for guid in selected_set:
            au = ad_by_guid.get(guid)
            emp = local_by_guid.get(guid)
            if not au or not emp:
                continue

            dept = au.get("dept", "").strip()
            if dept and dept not in existing_group_names:
                db.add(models.ScheduleRule(name=dept))
                existing_group_names.add(dept)
                group_created += 1

        db.commit()

        # 记录日志
        _set_config(db, "ad_last_import", json.dumps({
            "time": now.isoformat(),
            "new": new_count,
            "update": update_count,
            "group_created": group_created,
            "total_ad": len(ad_users),
        }, ensure_ascii=False))

        return schemas.ADImportResult(
            success=True,
            message="导入完成",
            new_count=new_count,
            update_count=update_count,
            leave_count=0,
            errors=errors,
        )

    except ImportError:
        raise HTTPException(status_code=500, detail="缺少 ldap3 库")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"导入失败: {str(e)}")


# ===================================================================
#  同步日志
# ===================================================================

@router.get("/sync-logs")
def get_sync_logs(db: Session = Depends(get_db)):
    """获取最近一次导入日志。"""
    raw = _get_config(db, "ad_last_import")
    if raw:
        return json.loads(raw)
    return {"message": "暂无导入记录"}
