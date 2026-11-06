import pytest

from app.mock.matcher import (
    InvalidPathError,
    Route,
    match_route,
    normalize_path,
    parse_path,
)


@pytest.mark.parametrize(
    ("raw", "path", "key"),
    [
        ("/users", "/users", "/users"),
        ("users/", "/users", "/users"),
        ("/users/{id}", "/users/:id", "/users/:"),
        ("/users/:userId/orders/:orderId", "/users/:userId/orders/:orderId", "/users/:/orders/:"),
        ("/", "/", "/"),
        ("  /v1/health ", "/v1/health", "/v1/health"),
    ],
)
def test_normalize_path(raw, path, key):
    assert normalize_path(raw) == (path, key)


@pytest.mark.parametrize(
    "raw",
    ["", "   ", "/users?x=1", "/a//b", "/a/../b", "/users/:id/:id", "/users/:1bad", "/a b", "/x{y}", "/" + "a" * 600],
)
def test_invalid_paths(raw):
    with pytest.raises(InvalidPathError):
        parse_path(raw)


def _routes(*specs):
    return [Route(i, m, tuple(parse_path(p))) for i, (m, p) in enumerate(specs)]


def test_static_beats_param():
    routes = _routes(("GET", "/users/:id"), ("GET", "/users/me"))
    result = match_route("GET", "/users/me", routes)
    assert result.route.endpoint_id == 1
    result = match_route("GET", "/users/42", routes)
    assert result.route.endpoint_id == 0
    assert result.params == {"id": "42"}


def test_specificity_is_positional():
    routes = _routes(("GET", "/:a/b"), ("GET", "/a/:b"))
    assert match_route("GET", "/a/b", routes).route.endpoint_id == 1


def test_method_mismatch_reports_allowed_methods():
    routes = _routes(("GET", "/items"), ("POST", "/items"), ("GET", "/other"))
    result = match_route("DELETE", "/items", routes)
    assert result.route is None
    assert result.allowed_methods == ("GET", "POST")


def test_no_match():
    routes = _routes(("GET", "/items"))
    result = match_route("GET", "/items/1/extra", routes)
    assert result.route is None and result.allowed_methods == ()


def test_params_are_url_decoded_and_trailing_slash_ignored():
    routes = _routes(("GET", "/files/:name"))
    result = match_route("GET", "/files/hello%20world/", routes)
    assert result.params == {"name": "hello world"}
