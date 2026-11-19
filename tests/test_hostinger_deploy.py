import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).parents[1] / "infra" / "hostinger" / "portainer-deploy.py"
SPEC = importlib.util.spec_from_file_location("portainer_deploy", SCRIPT)
deploy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deploy)


class HostingerDeployTests(unittest.TestCase):
    def test_release_branch_is_main(self):
        self.assertEqual(deploy.BRANCH, "refs/heads/main")

    def test_reconcile_uses_latest_main_without_manual_approval(self):
        sha = "a" * 40
        active = f"matable:{sha[:7]}-hostinger"
        inspected = subprocess.CompletedProcess(args=[], returncode=0, stdout=f"{active}\n".encode())
        with patch.object(deploy, "restore_pending"), patch.object(
            deploy, "remote_main_sha", return_value=sha
        ) as remote_main_sha, patch.object(
            deploy, "read_env", side_effect=[{}, {"MATABLE_IMAGE": active}]
        ), patch.object(
            deploy, "run", return_value=inspected
        ), patch.object(
            deploy, "desired_settings", return_value={}
        ), patch.object(deploy, "report") as report:
            deploy.reconcile()

        remote_main_sha.assert_called_once_with()
        report.assert_called_once_with(f"{sha[:7]} : version et variables à jour.")

    def test_portainer_release_controls_are_ignored(self):
        with patch.object(
            deploy,
            "get_portainer_stack",
            return_value={
                "Env": [
                    {"name": "MATABLE_RELEASE_SHA", "value": "invalid-legacy-sha"},
                    {"name": "MATABLE_DEPLOY_RETRY", "value": "1"},
                    {"name": "VITE_WHATSAPP_ADMIN_PHONE", "value": "0102749775"},
                ]
            },
        ):
            settings = deploy.desired_settings(
                {"NODE_ENV": "production", "DATABASE_URL": "postgres://example"}
            )
        self.assertEqual(settings["VITE_WHATSAPP_ADMIN_PHONE"], "0102749775")
        self.assertNotIn("MATABLE_RELEASE_SHA", settings)
        self.assertNotIn("MATABLE_DEPLOY_RETRY", settings)

    def test_portainer_stack_request_uses_bearer_token(self):
        from io import BytesIO

        with tempfile.TemporaryDirectory() as directory:
            private = Path(directory)
            (private / "admin-password").write_text("password")
            (private / "stack-id").write_text("7")
            responses = [
                json.dumps({"jwt": "access-token"}).encode(),
                json.dumps({"Name": "matable-production", "Status": 1, "Env": []}).encode(),
            ]

            def open_url(request, timeout):
                return BytesIO(responses.pop(0))

            with patch.object(deploy, "PRIVATE", private), patch.object(
                deploy, "urlopen", side_effect=open_url
            ) as urlopen:
                deploy.get_portainer_stack()

        stack_request = urlopen.call_args_list[1].args[0]
        self.assertEqual(stack_request.get_header("Authorization"), "Bearer access-token")


if __name__ == "__main__":
    unittest.main()
