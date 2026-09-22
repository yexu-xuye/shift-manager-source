"""AD 域路由 — P0 Bug 修复验证测试"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import unittest
import logging
from unittest.mock import MagicMock, patch, PropertyMock

# 被测试模块
from backend.routers.ad_routes import _attr_val, _connect_ad, _build_guid_hex


# ============================================================================
# BUG-2 测试：_attr_val 函数 — required 参数逻辑完整性
# ============================================================================

class TestAttrVal(unittest.TestCase):
    """验证 _attr_val 的 required 参数在四种空值场景下均正确记录 WARNING 日志"""

    def setUp(self):
        """创建 logger 捕获器"""
        self.logger = logging.getLogger("backend.routers.ad_routes")
        self.logger.setLevel(logging.DEBUG)
        self._log_buffer = []
        self._handler = logging.Handler()
        self._handler.emit = lambda record: self._log_buffer.append(record)
        self._handler.setLevel(logging.DEBUG)
        self.logger.addHandler(self._handler)

    def tearDown(self):
        self.logger.removeHandler(self._handler)

    # ---- 场景 1：属性不存在于 entry 中 (getattr 返回 None) ----
    def test_01_attr_missing_not_required(self):
        """属性不存在 + required=False → 返回 default，不记录 WARNING"""
        entry = MagicMock(spec=[])
        result = _attr_val(entry, "displayName", default="默认", required=False)
        self.assertEqual(result, "默认")
        self._assert_no_warning()

    def test_02_attr_missing_required(self):
        """属性不存在 + required=True → 返回 default，记录 WARNING"""
        entry = MagicMock(spec=[])
        result = _attr_val(entry, "displayName", default="默认", required=True)
        self.assertEqual(result, "默认")
        self._assert_warning_contains("displayName", "不存在")

    # ---- 场景 2：属性值为 None (v is None) ----
    def test_03_attr_value_none_not_required(self):
        """值为 None + required=False → 返回 default，不记录 WARNING"""
        class FakeAttr:
            value = None
        entry = MagicMock(displayName=FakeAttr(), spec=[])
        result = _attr_val(entry, "displayName", default="默认", required=False)
        self.assertEqual(result, "默认")
        self._assert_no_warning()

    def test_04_attr_value_none_required(self):
        """值为 None + required=True → 返回 default，记录 WARNING"""
        class FakeAttr:
            value = None
        entry = MagicMock(displayName=FakeAttr(), spec=[])
        result = _attr_val(entry, "displayName", default="默认", required=True)
        self.assertEqual(result, "默认")
        self._assert_warning_contains("displayName", "None")

    # ---- 场景 3：属性为空列表 (isinstance(v, list) and not v) ----
    def test_05_attr_empty_list_not_required(self):
        """空列表 + required=False → 返回 default，不记录 WARNING"""
        class FakeAttr:
            value = []
        entry = MagicMock(displayName=FakeAttr(), spec=[])
        result = _attr_val(entry, "displayName", default="默认", required=False)
        self.assertEqual(result, "默认")
        self._assert_no_warning()

    def test_06_attr_empty_list_required(self):
        """空列表 + required=True → 返回 default，记录 WARNING"""
        class FakeAttr:
            value = []
        entry = MagicMock(displayName=FakeAttr(), spec=[])
        result = _attr_val(entry, "displayName", default="默认", required=True)
        self.assertEqual(result, "默认")
        self._assert_warning_contains("displayName", "空列表")

    # ---- 场景 4：属性为空字符串 (str(v).strip() == "") ----
    def test_07_attr_empty_string_required(self):
        """空字符串 + required=True → 返回 default，记录 WARNING"""
        entry = MagicMock(displayName="   ", spec=[])
        result = _attr_val(entry, "displayName", default="默认", required=True)
        self.assertEqual(result, "默认")
        self._assert_warning_contains("displayName", "空字符串")

    def test_08_attr_empty_string_not_required(self):
        """空字符串 + required=False → 返回 default，不记录 WARNING"""
        entry = MagicMock(displayName="   ", spec=[])
        result = _attr_val(entry, "displayName", default="默认", required=False)
        self.assertEqual(result, "默认")
        self._assert_no_warning()

    # ---- 正常值提取 ----
    def test_09_normal_string_value(self):
        """正常字符串值 → 返回 strip 后的值"""
        entry = MagicMock(displayName="  Alice  ", spec=[])
        result = _attr_val(entry, "displayName", default="默认")
        self.assertEqual(result, "Alice")

    def test_10_list_value_returns_first_element(self):
        """列表值 → 返回第一个元素"""
        class FakeAttr:
            value = ["Bob", "Charlie"]
        entry = MagicMock(displayName=FakeAttr(), spec=[])
        result = _attr_val(entry, "displayName")
        self.assertEqual(result, "Bob")

    def test_11_attr_object_with_value_property(self):
        """Attribute 对象且有 .value 属性 → 正确取值"""
        class FakeAttr:
            value = "Carol"
        entry = MagicMock(displayName=FakeAttr(), spec=[])
        result = _attr_val(entry, "displayName")
        self.assertEqual(result, "Carol")

    def test_12_bool_value(self):
        """布尔值 True/False → 转为字符串"""
        entry = MagicMock(enabled=True, spec=[])
        result = _attr_val(entry, "enabled")
        self.assertEqual(result, "True")

    def test_13_custom_default_explicit(self):
        """显式指定 default 参数"""
        entry = MagicMock(spec=[])
        result = _attr_val(entry, "missing", default="N/A")
        self.assertEqual(result, "N/A")

    # ---- WARNING 日志辅助 ----
    def _assert_warning_contains(self, attr_name, keyword):
        warnings = [r for r in self._log_buffer if r.levelno == logging.WARNING]
        self.assertTrue(warnings, f"期望有 WARNING 日志（属性={attr_name}, 关键词={keyword}）")
        match = [r for r in warnings if attr_name in str(r.msg) and keyword in str(r.msg)]
        self.assertTrue(match,
            f"WARNING 日志应包含属性 '{attr_name}' 和关键词 '{keyword}'，实际: {[r.msg for r in warnings]}")

    def _assert_no_warning(self):
        warnings = [r for r in self._log_buffer if r.levelno == logging.WARNING]
        self.assertEqual(len(warnings), 0, f"不应有 WARNING 日志，实际: {[r.msg for r in warnings]}")


# ============================================================================
# BUG-1 测试：_connect_ad — who_am_i 匿名连接检测
# ============================================================================

class TestConnectAD(unittest.TestCase):
    """验证 _connect_ad 用 who_am_i 替代 conn.authentication 检测匿名连接
    
    注意：_connect_ad 内部使用 `from ldap3 import Server, Connection, SIMPLE, ALL`
    因此需要 patch 函数内部的导入目标。patch 时使用函数调用位置所在的模块。
    """

    def setUp(self):
        self.cfg = {
            "host": "dc.example.com",
            "port": 636,
            "use_ssl": True,
            "username": "admin",
            "password": "secret",
            "base_dn": "DC=example,DC=com",
        }

    def test_01_who_am_i_returns_valid_dn(self):
        """who_am_i 返回有效 DN → 绑定成功，返回 conn"""
        with patch("ldap3.Server") as mock_svr, \
             patch("ldap3.Connection") as mock_conn_cls:

            mock_svr.return_value = MagicMock()
            mock_conn = MagicMock()
            mock_conn.bind.return_value = True
            mock_conn.extend.standard.who_am_i.return_value = "u:CN=Admin,DC=example,DC=com"
            mock_conn_cls.return_value = mock_conn

            result = _connect_ad(self.cfg)
            self.assertEqual(result, mock_conn)
            mock_conn.bind.assert_called_once()
            mock_conn.extend.standard.who_am_i.assert_called_once()

    def test_02_who_am_i_returns_none(self):
        """who_am_i 返回 None → 抛出 HTTPException(401)，连接解绑"""
        with patch("ldap3.Server") as mock_svr, \
             patch("ldap3.Connection") as mock_conn_cls:

            mock_svr.return_value = MagicMock()
            mock_conn = MagicMock()
            mock_conn.bind.return_value = True
            mock_conn.extend.standard.who_am_i.return_value = None
            mock_conn_cls.return_value = mock_conn

            from fastapi import HTTPException
            with self.assertRaises(HTTPException) as ctx:
                _connect_ad(self.cfg)
            self.assertEqual(ctx.exception.status_code, 401)
            self.assertIn("匿名", ctx.exception.detail)
            mock_conn.unbind.assert_called_once()

    def test_03_who_am_i_returns_empty_string(self):
        """who_am_i 返回空字符串 → 抛出 HTTPException(401)"""
        with patch("ldap3.Server") as mock_svr, \
             patch("ldap3.Connection") as mock_conn_cls:

            mock_svr.return_value = MagicMock()
            mock_conn = MagicMock()
            mock_conn.bind.return_value = True
            mock_conn.extend.standard.who_am_i.return_value = ""
            mock_conn_cls.return_value = mock_conn

            from fastapi import HTTPException
            with self.assertRaises(HTTPException) as ctx:
                _connect_ad(self.cfg)
            self.assertEqual(ctx.exception.status_code, 401)

    def test_04_who_am_i_returns_whitespace_only(self):
        """who_am_i 返回仅空白字符 → 抛出 HTTPException(401)"""
        with patch("ldap3.Server") as mock_svr, \
             patch("ldap3.Connection") as mock_conn_cls:

            mock_svr.return_value = MagicMock()
            mock_conn = MagicMock()
            mock_conn.bind.return_value = True
            mock_conn.extend.standard.who_am_i.return_value = "   \t  "
            mock_conn_cls.return_value = mock_conn

            from fastapi import HTTPException
            with self.assertRaises(HTTPException) as ctx:
                _connect_ad(self.cfg)
            self.assertEqual(ctx.exception.status_code, 401)

    def test_05_bind_fails_raises_runtime_error(self):
        """bind() 返回 False → 抛出 RuntimeError（不进入 who_am_i 检查）"""
        with patch("ldap3.Server") as mock_svr, \
             patch("ldap3.Connection") as mock_conn_cls:

            mock_svr.return_value = MagicMock()
            mock_conn = MagicMock()
            mock_conn.bind.return_value = False
            mock_conn.result = {"description": "Invalid credentials"}
            mock_conn_cls.return_value = mock_conn

            with self.assertRaises(RuntimeError) as ctx:
                _connect_ad(self.cfg)
            self.assertIn("绑定失败", str(ctx.exception))
            # who_am_i 不应被调用
            mock_conn.extend.standard.who_am_i.assert_not_called()

    def test_06_empty_username_raises_runtime_error(self):
        """用户名为空 → 抛出 RuntimeError（早于任何 LDAP 调用）"""
        cfg = {**self.cfg, "username": "   "}
        with self.assertRaises(RuntimeError) as ctx:
            _connect_ad(cfg)
        self.assertIn("为空", str(ctx.exception))

    def test_07_empty_password_raises_runtime_error(self):
        """密码为空 → 抛出 RuntimeError（早于任何 LDAP 调用）"""
        cfg = {**self.cfg, "password": ""}
        with self.assertRaises(RuntimeError) as ctx:
            _connect_ad(cfg)
        self.assertIn("为空", str(ctx.exception))


# ============================================================================
# BUG-5 测试：confirm_ad_import — 空值覆盖保护
# ============================================================================

class TestConfirmADImport(unittest.TestCase):
    """验证 confirm_ad_import 中 sAMAccountName/name/dept 三个字段的空值保护"""

    def setUp(self):
        """搭建最小 DB mock 环境"""
        self.patcher_get_db = patch("backend.routers.ad_routes.get_db")
        self.patcher_get_config = patch("backend.routers.ad_routes._get_config")
        self.patcher_set_config = patch("backend.routers.ad_routes._set_config")
        self.patcher_get_ignored = patch("backend.routers.ad_routes._get_ignored_guids")
        self.patcher_connect = patch("backend.routers.ad_routes._connect_ad")
        self.patcher_search = patch("backend.routers.ad_routes._search_ad_users")

        self.mock_get_db = self.patcher_get_db.start()
        self.mock_get_config = self.patcher_get_config.start()
        self.mock_set_config = self.patcher_set_config.start()
        self.mock_get_ignored = self.patcher_get_ignored.start()
        self.mock_connect = self.patcher_connect.start()
        self.mock_search = self.patcher_search.start()

        # 默认 get_config 返回值
        self.mock_get_config.return_value = None

        # 无忽略用户
        self.mock_get_ignored.return_value = set()

    def tearDown(self):
        self.patcher_get_db.stop()
        self.patcher_get_config.stop()
        self.patcher_set_config.stop()
        self.patcher_get_ignored.stop()
        self.patcher_connect.stop()
        self.patcher_search.stop()

    def _setup_config(self, ad_config: dict | None = None, policy: dict | None = None):
        """注入配置 mock"""
        def get_config_side_effect(db, key):
            if key == "ad_config":
                import json
                return json.dumps(ad_config) if ad_config else None
            if key == "ad_sync_policy":
                import json
                return json.dumps(policy) if policy else None
            return None
        self.mock_get_config.side_effect = get_config_side_effect

    def _setup_db(self, employees: list, existing_groups: list | None = None):
        """配置 mock DB 返回指定员工列表和组列表。
        
        返回 mock_db 以便测试后验证。
        """
        mock_db = MagicMock()

        # 构建 query chain：同时支持 .all() 和 .filter().all()
        mock_query = MagicMock()
        mock_query.all.return_value = employees
        mock_query.filter.return_value = mock_query

        # 对于 ScheduleRule 查询
        mock_gq = MagicMock()
        mock_gq.all.return_value = existing_groups or []

        def query_side_effect(model):
            if model.__name__ == "ScheduleRule":
                return mock_gq
            return mock_query

        mock_db.query.side_effect = query_side_effect
        self.mock_get_db.return_value = mock_db
        return mock_db

    def _make_employee(self, name="Alice", group="原组", ad_guid="guid-001",
                       sAMAccountName="old_sam", sync_enabled=1):
        """创建 mock Employee"""
        emp = MagicMock()
        emp.name = name
        emp.group = group
        emp.ad_guid = ad_guid
        emp.sAMAccountName = sAMAccountName
        emp.sync_enabled = sync_enabled
        emp.last_sync_time = None
        return emp

    def _make_ad_user(self, guid="guid-001", name="Alice", dept="新组", sam="new_sam"):
        return {"guid": guid, "name": name, "dept": dept, "sAMAccountName": sam}

    def test_01_sam_empty_does_not_overwrite(self):
        """BUG-5: AD 的 sAMAccountName 为空 → 不覆盖本地有效值"""
        self._setup_config(
            ad_config={"host": "dc", "username": "u", "password": "p", "base_dn": "dc"},
            policy={"auto_import_new": True, "auto_update_existing": True},
        )

        emp = self._make_employee(sAMAccountName="existing_sam")
        mock_db = self._setup_db([emp])

        ad_user = self._make_ad_user(sam="")
        self.mock_search.return_value = [ad_user]

        from backend.routers.ad_routes import confirm_ad_import
        from backend.schemas import ADConfirmRequest

        req = ADConfirmRequest(selected_guids=["guid-001"])
        confirm_ad_import(req, db=mock_db)

        self.assertEqual(emp.sAMAccountName, "existing_sam",
                         "sAMAccountName 不应被 AD 空值覆盖")

    def test_02_sam_valid_overwrites(self):
        """BUG-5: AD 的 sAMAccountName 有效 → 正常覆盖"""
        self._setup_config(
            ad_config={"host": "dc", "username": "u", "password": "p", "base_dn": "dc"},
            policy={"auto_import_new": True, "auto_update_existing": True},
        )

        emp = self._make_employee(sAMAccountName="old_sam")
        mock_db = self._setup_db([emp])

        ad_user = self._make_ad_user(sam="new_valid_sam")
        self.mock_search.return_value = [ad_user]

        from backend.routers.ad_routes import confirm_ad_import
        from backend.schemas import ADConfirmRequest

        req = ADConfirmRequest(selected_guids=["guid-001"])
        confirm_ad_import(req, db=mock_db)

        self.assertEqual(emp.sAMAccountName, "new_valid_sam",
                         "sAMAccountName 应被 AD 有效值覆盖")

    def test_03_name_empty_does_not_overwrite_during_full_sync(self):
        """BUG-5: AD 的 name 为空 → 全量更新时不覆盖本地 name"""
        self._setup_config(
            ad_config={"host": "dc", "username": "u", "password": "p", "base_dn": "dc"},
            policy={"auto_import_new": True, "auto_update_existing": True},
        )

        emp = self._make_employee(name="原姓名", sync_enabled=1)
        mock_db = self._setup_db([emp])

        ad_user = self._make_ad_user(name="")
        self.mock_search.return_value = [ad_user]

        from backend.routers.ad_routes import confirm_ad_import
        from backend.schemas import ADConfirmRequest

        req = ADConfirmRequest(selected_guids=["guid-001"])
        confirm_ad_import(req, db=mock_db)

        self.assertEqual(emp.name, "原姓名",
                         "name 不应被 AD 空值覆盖（全量更新场景）")

    def test_04_name_valid_overwrites_during_full_sync(self):
        """BUG-5: AD 的 name 有效 → 全量更新时正常覆盖"""
        self._setup_config(
            ad_config={"host": "dc", "username": "u", "password": "p", "base_dn": "dc"},
            policy={"auto_import_new": True, "auto_update_existing": True},
        )

        emp = self._make_employee(name="旧姓名", sync_enabled=1)
        mock_db = self._setup_db([emp])

        ad_user = self._make_ad_user(name="新姓名")
        self.mock_search.return_value = [ad_user]

        from backend.routers.ad_routes import confirm_ad_import
        from backend.schemas import ADConfirmRequest

        req = ADConfirmRequest(selected_guids=["guid-001"])
        confirm_ad_import(req, db=mock_db)

        self.assertEqual(emp.name, "新姓名",
                         "name 应被 AD 有效值覆盖（全量更新场景）")

    def test_05_dept_empty_does_not_overwrite_during_full_sync(self):
        """BUG-5: AD 的 dept 为空 → 全量更新时不覆盖本地 group"""
        self._setup_config(
            ad_config={"host": "dc", "username": "u", "password": "p", "base_dn": "dc"},
            policy={"auto_import_new": True, "auto_update_existing": True},
        )

        emp = self._make_employee(group="原部门", sync_enabled=1)
        mock_db = self._setup_db([emp])

        ad_user = self._make_ad_user(dept="")
        self.mock_search.return_value = [ad_user]

        from backend.routers.ad_routes import confirm_ad_import
        from backend.schemas import ADConfirmRequest

        req = ADConfirmRequest(selected_guids=["guid-001"])
        confirm_ad_import(req, db=mock_db)

        self.assertEqual(emp.group, "原部门",
                         "group 不应被 AD 空 dept 覆盖（全量更新场景）")

    def test_06_dept_valid_overwrites_during_full_sync(self):
        """BUG-5: AD 的 dept 有效 → 全量更新时正常覆盖 group"""
        self._setup_config(
            ad_config={"host": "dc", "username": "u", "password": "p", "base_dn": "dc"},
            policy={"auto_import_new": True, "auto_update_existing": True},
        )

        emp = self._make_employee(group="旧部门", sync_enabled=1)
        mock_db = self._setup_db([emp])

        ad_user = self._make_ad_user(dept="新部门")
        self.mock_search.return_value = [ad_user]

        from backend.routers.ad_routes import confirm_ad_import
        from backend.schemas import ADConfirmRequest

        req = ADConfirmRequest(selected_guids=["guid-001"])
        confirm_ad_import(req, db=mock_db)

        self.assertEqual(emp.group, "新部门",
                         "group 应被 AD 有效 dept 覆盖（全量更新场景）")

    def test_07_all_three_fields_empty_protected(self):
        """BUG-5: 三个字段同时为空 → 全部不覆盖"""
        self._setup_config(
            ad_config={"host": "dc", "username": "u", "password": "p", "base_dn": "dc"},
            policy={"auto_import_new": True, "auto_update_existing": True},
        )

        emp = self._make_employee(
            name="保留姓名", group="保留部门",
            sAMAccountName="保留工号", sync_enabled=1,
        )
        mock_db = self._setup_db([emp])

        ad_user = self._make_ad_user(name="", dept="", sam="")
        self.mock_search.return_value = [ad_user]

        from backend.routers.ad_routes import confirm_ad_import
        from backend.schemas import ADConfirmRequest

        req = ADConfirmRequest(selected_guids=["guid-001"])
        confirm_ad_import(req, db=mock_db)

        self.assertEqual(emp.name, "保留姓名", "name 不应被空值覆盖")
        self.assertEqual(emp.group, "保留部门", "group 不应被空值覆盖")
        self.assertEqual(emp.sAMAccountName, "保留工号", "sAMAccountName 不应被空值覆盖")

    def test_08_sync_disabled_skip_full_update(self):
        """sync_enabled=0 的用户：不触发全量更新（只做纯身份关联）"""
        self._setup_config(
            ad_config={"host": "dc", "username": "u", "password": "p", "base_dn": "dc"},
            policy={"auto_import_new": True, "auto_update_existing": True},
        )

        emp = self._make_employee(
            name="原姓名", group="原部门",
            sAMAccountName="old_sam", sync_enabled=0,
        )
        mock_db = self._setup_db([emp])

        ad_user = self._make_ad_user(name="新姓名", dept="新部门", sam="new_sam")
        self.mock_search.return_value = [ad_user]

        from backend.routers.ad_routes import confirm_ad_import
        from backend.schemas import ADConfirmRequest

        req = ADConfirmRequest(selected_guids=["guid-001"])
        confirm_ad_import(req, db=mock_db)

        # sync_enabled=0: 全量更新被跳过，但 sAMAccountName 仍然更新（身份关联）
        # 注意：sAMAccountName 更新在 sync_enabled 检查之前（纯身份关联）
        self.assertEqual(emp.sAMAccountName, "new_sam", "身份关联应更新 sAMAccountName")
        self.assertEqual(emp.name, "原姓名", "sync_enabled=0 时 name 不应被全量更新覆盖")
        self.assertEqual(emp.group, "原部门", "sync_enabled=0 时 group 不应被全量更新覆盖")


# ============================================================================
# _build_guid_hex 边界测试
# ============================================================================

class TestBuildGuidHex(unittest.TestCase):
    """验证 GUID 提取的健壮性"""

    def test_valid_guid_bytes(self):
        """正常 objectGUID 字节 → 返回 hex 字符串"""
        raw = b"\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10"
        class FakeGUID:
            raw_values = [raw]
        entry = MagicMock(objectGUID=FakeGUID(), spec=[])
        result = _build_guid_hex(entry)
        self.assertIsInstance(result, str)
        self.assertEqual(len(result), 32)

    def test_missing_guid_returns_empty(self):
        """objectGUID 为 None/空 → 返回空字符串"""
        entry = MagicMock(spec=[])
        entry.objectGUID = None
        result = _build_guid_hex(entry)
        self.assertEqual(result, "")

    # 注意：_build_guid_hex 对 raw_values 为空列表的情况有 IndexError 风险
    # 这不在本次 BUG-1/2/5 的修复范围内，作为 Known Issue 记录


if __name__ == "__main__":
    unittest.main(verbosity=2)
