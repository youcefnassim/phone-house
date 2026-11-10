"""Opt-in REAL local Auth/PostgreSQL acceptance harness; never a mock.

No accounts or schema are provisioned. Never print tokens/credentials.
The reviewed fixture/oracle must be implemented in an authorized local stack.
"""
import concurrent.futures
import json
import os
import pathlib
import unittest
import urllib.error
import urllib.parse
import urllib.request


def enabled():
    return False  # Retired loopback activation; separate hosted approval and guarded runner required.


def request_json(base, path, key, token, payload):
    req = urllib.request.Request(base + path, data=json.dumps(payload).encode(),
                                 headers={"apikey": key, "Authorization": "Bearer " + token,
                                          "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return {"status": response.status, "body": json.load(response)}
    except urllib.error.HTTPError as error:
        # Only status is retained: raw errors could expose sensitive rows.
        return {"status": error.code, "body": None}


def value_at(value, path):
    for part in path.split("."):
        value = value[int(part)] if isinstance(value, list) else value[part]
    return value


@unittest.skipUnless(enabled(), "NOT RUN: explicit local database authorization absent")
class RealTransactionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = os.environ["PH_TEST_SUPABASE_URL"].rstrip("/")
        parsed = urllib.parse.urlparse(cls.base)
        if parsed.scheme not in ("http", "https") or parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
            raise RuntimeError("Only a separately approved disposable loopback stack is allowed")
        cls.key = os.environ["PH_TEST_PUBLISHABLE_KEY"]
        # Test-only privileged oracle credential; never passed to user requests.
        cls.oracle_key = os.environ["PH_TEST_ORACLE_KEY"]
        with open(os.environ["PH_TEST_ACCOUNT_FILE"], encoding="utf-8") as source:
            accounts = json.load(source)
        cls.tokens = {}
        required = {"owner", "manager_m01", "seller_m01", "manager_m02", "seller_m02", "unassigned"}
        if set(accounts) != required:
            raise RuntimeError("All six independently authenticated synthetic accounts required")
        for name, account in accounts.items():
            login = request_json(cls.base, "/auth/v1/token?grant_type=password", cls.key, cls.key, account)
            if login["status"] != 200:
                raise RuntimeError("Synthetic account authentication failed")
            cls.tokens[name] = login["body"]["access_token"]
        with open(os.environ["PH_TEST_FIXTURE_FILE"], encoding="utf-8") as source:
            cls.scenarios = json.load(source)
        expected = {"A_isolation", "B_global_imei", "C_accessory_receipt", "D_shift_race", "E_checkout", "F_idempotency", "G_reconciliation", "H_owner_cost_denial", "I_stock_race", "J_rollback"}
        if set(cls.scenarios) != expected:
            raise RuntimeError("All A-J executable scenario fixtures required")

    def rpc(self, account, rpc, args):
        return request_json(self.base, "/rest/v1/rpc/" + rpc, self.key, self.tokens[account], args)

    def oracle(self, rpc, name):
        result = request_json(self.base, "/rest/v1/rpc/" + rpc,
                              self.oracle_key, self.oracle_key, {"scenario": name})
        self.assertEqual(result["status"], 200, "Test-only database oracle unavailable")
        return result["body"]

    def run_scenario(self, name):
        scenario = self.scenarios[name]
        self.oracle("review06_reset_scenario", name)
        before = self.oracle("review06_observe_scenario", name)
        outcomes = []
        def action(item):
            result = self.rpc(item["account"], item["rpc"], item["args"])
            self.assertIn(result["status"], item["allowed_status"], "Unexpected command status")
            for assertion in item.get("assertions", []):
                self.assertEqual(value_at(result["body"], assertion["path"]), assertion["equals"])
            return result
        for step in scenario["steps"]:
            if "parallel" in step:
                with concurrent.futures.ThreadPoolExecutor(max_workers=len(step["parallel"])) as executor:
                    group = list(executor.map(action, step["parallel"]))
                outcomes.extend(group)
                winners = sum(r["status"] == 200 and isinstance(r["body"], dict) and r["body"].get("ok") is True for r in group)
                self.assertEqual(winners, step["expected_successes"])
            else:
                outcomes.append(action(step))
        after = self.oracle("review06_observe_scenario", name)
        self.assertTrue(scenario.get("expectations"), "Concrete database readback assertions required")
        for assertion in scenario["expectations"]:
            actual = value_at(after, assertion["path"])
            expected = value_at(before, assertion["path"]) if assertion.get("unchanged") else assertion["equals"]
            self.assertEqual(actual, expected, "Database invariant violated")
        if scenario.get("identical_replay"):
            ids = [r["body"]["transactionId"] for r in outcomes if r["status"] == 200 and isinstance(r["body"], dict) and r["body"].get("ok")]
            self.assertGreaterEqual(len(ids), 2)
            self.assertEqual(len(set(ids)), 1)

    def test_A_isolation(self): self.run_scenario("A_isolation")
    def test_B_global_imei(self): self.run_scenario("B_global_imei")
    def test_C_accessory_receipt(self): self.run_scenario("C_accessory_receipt")
    def test_D_shift_race(self): self.run_scenario("D_shift_race")
    def test_E_checkout(self): self.run_scenario("E_checkout")
    def test_F_idempotency(self): self.run_scenario("F_idempotency")
    def test_G_reconciliation(self): self.run_scenario("G_reconciliation")
    def test_H_owner_cost_denial(self): self.run_scenario("H_owner_cost_denial")
    def test_I_stock_race(self): self.run_scenario("I_stock_race")
    def test_J_rollback(self): self.run_scenario("J_rollback")


if __name__ == "__main__":
    unittest.main(verbosity=2)