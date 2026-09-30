"""Consistent error envelope: {"error": {"code", "message", "details"}}."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

_STATUS_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
    422: "validation_error",
}


def error_body(status: int, message: str, details: Any = None, code: str | None = None) -> dict:
    return {
        "error": {
            "code": code or _STATUS_CODES.get(status, "error"),
            "message": message,
            "details": details,
        }
    }


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        if isinstance(exc.detail, str):
            message, details = exc.detail, None
        elif isinstance(exc.detail, dict) and "message" in exc.detail:
            details = {k: v for k, v in exc.detail.items() if k != "message"}
            message = str(exc.detail["message"])
        else:
            message, details = "Request failed", exc.detail
        return JSONResponse(
            error_body(exc.status_code, message, details),
            status_code=exc.status_code,
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {"loc": list(e.get("loc", [])), "msg": e.get("msg"), "type": e.get("type")}
            for e in exc.errors()
        ]
        return JSONResponse(error_body(422, "Validation failed", details), status_code=422)


__all__ = ["HTTPException", "error_body", "install_error_handlers"]
