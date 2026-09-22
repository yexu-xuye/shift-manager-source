import os

# 数据库路径，支持从环境变量读取
DB_PATH = os.environ.get(
    "SCHEDULE_DB_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "schedule.db"),
)
