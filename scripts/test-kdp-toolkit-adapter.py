import importlib.util
import json
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).parents[1] / "integrations" / "kdp-toolkit" / "adapter.py"
SPEC = importlib.util.spec_from_file_location("booknexa_kdp_toolkit_adapter", MODULE_PATH)
assert SPEC and SPEC.loader
adapter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(adapter)


class KdpToolkitAdapterContractTests(unittest.TestCase):
    def test_metadata_normalizes_keywords_and_preserves_upstream_fields(self):
        result = adapter.normalize_metadata({
            "title": "  A Test Book ", "author": " Author ", "description": " Description ",
            "keywords": [" nature ", "", " coloring "], "categories": ["Crafts"], "ai_generated": True,
        })
        self.assertEqual(result["title"], "A Test Book")
        self.assertEqual(result["keywords"], ["nature", "coloring"])
        self.assertEqual(result["publication_format"], "paperback")
        self.assertTrue(result["ai_generated"])

    def test_manifest_matches_shared_contract_and_declares_provenance(self):
        manifest = adapter.make_manifest({"title": "Test"}, "1.0.0")
        self.assertEqual(manifest["schemaVersion"], 1)
        self.assertEqual(manifest["format"], "paperback")
        self.assertEqual(manifest["assets"], {"manuscript": "interior.pdf", "cover": "cover.pdf"})
        self.assertEqual(manifest["source"]["license"], "MIT")
        self.assertEqual(manifest["validation"]["status"], "passed")

    def test_rejects_unsafe_zip_paths(self):
        for path in ("../secret", "/absolute", "C:\\secret", "a/../secret", ""):
            with self.subTest(path=path), self.assertRaises(ValueError):
                adapter.safe_package_path(path)

    def test_metadata_requires_booknexa_minimum_fields(self):
        with self.assertRaisesRegex(ValueError, "title, author, and description"):
            adapter.normalize_metadata({"title": "Title", "author": "Author"})

    def test_manifest_is_json_serializable(self):
        manifest = adapter.make_manifest({}, "1.0.0")
        self.assertEqual(json.loads(json.dumps(manifest))["source"]["adapter"], "kdp-toolkit")


if __name__ == "__main__":
    unittest.main()
