import json

import pytest

from app.mock.templating import TemplateContext, render_json, render_text, validate_json_template

CTX = TemplateContext(
    params={"id": "42", "slug": "a\"b"},
    query={"page": "2"},
    headers={"x-user": "alice"},
    body={"name": "Pen", "price": 3.5, "items": [{"sku": "A"}], "nested": {"ok": True}},
)


def test_bare_placeholders_become_json_values():
    out = render_json('{"id": {{params.id}}, "price": {{body.price}}, "items": {{body.items}}}', CTX)
    assert json.loads(out) == {"id": 42, "price": 3.5, "items": [{"sku": "A"}]}


def test_placeholders_inside_strings_are_escaped():
    out = render_json('{"label": "slug={{params.slug}} by {{headers.X-User}}"}', CTX)
    assert json.loads(out) == {"label": 'slug=a"b by alice'}


def test_missing_values():
    out = render_json('{"a": {{query.nope}}, "b": "{{body.missing.deep}}"}', CTX)
    assert json.loads(out) == {"a": None, "b": ""}


def test_list_index_and_nested_lookup():
    out = render_text("{{body.items.0.sku}}-{{body.nested.ok}}", CTX)
    assert out == "A-true"


def test_builtins():
    out = json.loads(render_json('{"u": "{{uuid}}", "t": {{timestamp}}, "n": "{{now}}"}', CTX))
    assert len(out["u"]) == 36 and isinstance(out["t"], int) and out["n"].endswith("Z")


def test_braces_inside_strings_are_not_confused():
    out = render_json('{"text": "use {{ and }} freely", "id": "{{params.id}}"}', CTX)
    assert json.loads(out) == {"text": "use {{ and }} freely", "id": "42"}


def test_validate_accepts_templates_and_rejects_bad_json():
    validate_json_template('{"id": {{params.id}}, "name": "{{body.name}}"}')
    with pytest.raises(ValueError, match="Invalid JSON"):
        validate_json_template('{"id": 1,}')
