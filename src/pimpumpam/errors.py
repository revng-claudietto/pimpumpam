"""Application-level exceptions, each mapped to an HTTP status code."""

from __future__ import annotations


class AppError(Exception):
    """Base class for errors that map onto an HTTP response."""

    status_code: int = 500

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class NotFoundError(AppError):
    """A requested resource (account, calendar, event, contact, ...) is absent."""

    status_code = 404


class ConflictError(AppError):
    """The resource already exists."""

    status_code = 409


class PreconditionFailedError(AppError):
    """An ``If-Match`` precondition failed — the resource changed upstream."""

    status_code = 412


class AuthError(AppError):
    """The upstream DAV server rejected the supplied credentials."""

    status_code = 502


class UpstreamError(AppError):
    """The upstream DAV server returned an unexpected error."""

    status_code = 502
