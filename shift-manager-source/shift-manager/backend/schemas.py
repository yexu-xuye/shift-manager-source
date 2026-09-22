"""
排班管理系统 — Pydantic 请求/响应模型
"""
from typing import Optional, Any, Literal
from datetime import date
from pydantic import BaseModel, ConfigDict, Field, SecretStr


# ============================================================================
# Employee
# ============================================================================

class EmployeeCreate(BaseModel):
    name: str
    group: str
    shift_type: Literal["fixed", "rotation"] = "rotation"
    fixed_time: str = "9:00"


class EmployeeUpdate(BaseModel):
    new_name: Optional[str] = None
    new_group: Optional[str] = None
    new_shift_type: Optional[Literal["fixed", "rotation"]] = None
    new_fixed_time: Optional[str] = None


class EmployeeOut(BaseModel):
    name: str
    group: str
    shift_type: str
    fixed_time: str
    pinyin_initials: str = ""

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Group
# ============================================================================

class GroupCreate(BaseModel):
    name: str


class GroupConfigUpdate(BaseModel):
    shift_times: Optional[list[str]] = None
    priority: Optional[Literal["优先早班", "优先晚班"]] = None
    early_shift_count: Optional[int] = Field(None, ge=1, le=20)
    late_shift_count: Optional[int] = Field(None, ge=1, le=20)
    rotation_order: Optional[list[str]] = None
    rotation_start_date: Optional[date] = None
    subgroups: Optional[list[dict]] = None
    single_rotations: Optional[list[dict]] = None
    special_times: Optional[list[str]] = None
    default_time: Optional[str] = None


# ============================================================================
# Schedule
# ============================================================================

class ScheduleRequest(BaseModel):
    start_date: date
    groups: list[str] = []


# ============================================================================
# Snapshot（统一快照，type 区分 schedule / duty）
# ============================================================================

class SnapshotSave(BaseModel):
    type: Literal["schedule", "duty"]
    week_key: str
    data: Any                          # 纯业务数据：schedule 是 list，duty 是 {weeks: [...]}
    extra: Optional[dict] = None       # 附加数据（值班的 rest_day_configs）

class SnapshotItem(BaseModel):
    id: int
    week_key: str
    record_count: int = 0
    created_at: str = ""

class SnapshotDetail(BaseModel):
    id: int
    type: str
    week_key: str
    data: Any
    extra: Optional[dict] = None
    created_at: str = ""


# ============================================================================
# Duty
# ============================================================================

class DutyGroupCreate(BaseModel):
    name: str


class DutyGroupRename(BaseModel):
    new_name: str


class DutyMemberAdd(BaseModel):
    name: str


class DutyConfigUpdate(BaseModel):
    members: Optional[list[str]] = None
    start_date: Optional[date] = None
    rotation_order: Optional[list[str]] = None
    duty_count: Optional[int] = None
    enabled: Optional[bool] = None


class DutyGenerateRequest(BaseModel):
    start_date: date
    groups: list[str] = []


# ============================================================================
# Pinyin
# ============================================================================

class PinyinRequest(BaseModel):
    name: str


class PinyinResponse(BaseModel):
    name: str
    initials: str


# ============================================================================
# AD 域集成（保留兼容）
# ============================================================================

class ADConfig(BaseModel):
    host: str = ""
    port: int = 636
    use_ssl: bool = True
    base_dn: str = ""
    search_ou: str = ""
    username: str = ""
    password: SecretStr = SecretStr("")


class ADTestResult(BaseModel):
    success: bool
    message: str
    user_count: int = 0


class ADImportPreview(BaseModel):
    total_in_ad: int
    ignored_count: int = 0
    new_count: int
    update_count: int
    details: list[dict] = []


class ADImportResult(BaseModel):
    success: bool
    message: str
    new_count: int = 0
    update_count: int = 0
    leave_count: int = 0
    errors: list[str] = []


class ADIgnoredUser(BaseModel):
    guid: str
    name: str
    group: str = ""
    sAMAccountName: str = ""
    ignored_at: str = ""


class ADSyncPolicy(BaseModel):
    auto_import_new: bool = True
    auto_update_existing: bool = True
    skip_ignored: bool = True


class ADConfirmRequest(ADConfig):
    selected_guids: list[str] = []
