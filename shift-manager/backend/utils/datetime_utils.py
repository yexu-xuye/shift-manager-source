from datetime import datetime, timezone


def utcnow() -> datetime:
    """返回无时区的 UTC 当前时间（与 SQLite 兼容）。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)
