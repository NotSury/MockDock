import json

from app.mock.redaction import REDACTED, redact_body, redact_headers


def test_sensitive_headers_are_redacted():
    out = redact_headers(
        {
            "Authorization": "Bearer abc.def",
            "Cookie": "session=1",
            "X-Api-Key": "k",
            "Accept": "application/json",
        }
    )
    assert out["Authorization"] == f"Bearer {REDACTED}"
    assert out["Cookie"] == REDACTED
    assert out["X-Api-Key"] == REDACTED
    assert out["Accept"] == "application/json"


def test_sensitive_json_fields_are_redacted_recursively():
    body = json.dumps({"email": "a@b.c", "password": "hunter2", "profile": {"api_key": "x"}, "list": [{"token": "t"}]})
    out = json.loads(redact_body(body))
    assert out == {"email": "a@b.c", "password": REDACTED, "profile": {"api_key": REDACTED}, "list": [{"token": REDACTED}]}


def test_non_json_bodies_untouched():
    assert redact_body("password=hunter2") == "password=hunter2"
    assert redact_body("{not json") == "{not json"
