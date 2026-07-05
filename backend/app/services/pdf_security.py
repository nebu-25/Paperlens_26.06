"""Network guards for user-supplied PDF URLs."""

import ipaddress
import socket
import urllib.parse
import urllib.request

from fastapi import HTTPException


def _ip_address_or_none(value: str):
    try:
        return ipaddress.ip_address(value)
    except ValueError:
        return None


def _ensure_public_ip(hostname: str, ip_value: str) -> None:
    ip = _ip_address_or_none(ip_value)
    if ip is None:
        raise HTTPException(status_code=400, detail="PDF URL 호스트를 확인할 수 없습니다.")
    if not ip.is_global:
        raise HTTPException(
            status_code=400,
            detail=(
                f"공용 인터넷 주소의 PDF만 등록할 수 있습니다. 차단된 호스트: {hostname}. "
                "내 컴퓨터의 PDF는 URL 입력칸이 아니라 PDF 업로드로 등록해 주세요."
            ),
        )


def validate_public_pdf_url(url: str) -> str:
    """사용자 제공 URL이 서버 내부망을 가리키지 않는 공용 HTTP(S) 주소인지 확인한다."""
    cleaned = url.strip()
    parsed = urllib.parse.urlparse(cleaned)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(
            status_code=400,
            detail=(
                "PDF URL은 http 또는 https 주소여야 합니다. "
                "내 컴퓨터의 PDF는 URL 입력칸이 아니라 PDF 업로드로 등록해 주세요."
            ),
        )
    if parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="PDF URL에는 사용자 인증 정보를 포함할 수 없습니다.")
    try:
        port = parsed.port
    except ValueError:
        raise HTTPException(status_code=400, detail="PDF URL 포트가 올바르지 않습니다.") from None
    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="PDF URL 호스트가 올바르지 않습니다.")

    if _ip_address_or_none(hostname) is not None:
        _ensure_public_ip(hostname, hostname)
        return cleaned

    try:
        addr_infos = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise HTTPException(status_code=502, detail="PDF URL 호스트를 확인하지 못했습니다.") from exc
    if not addr_infos:
        raise HTTPException(status_code=502, detail="PDF URL 호스트를 확인하지 못했습니다.")

    addresses = {info[4][0] for info in addr_infos if info[4]}
    for address in addresses:
        _ensure_public_ip(hostname, address)
    return cleaned


class PublicOnlyRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        validate_public_pdf_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def open_public_pdf_url(request: urllib.request.Request, *, timeout: int):
    opener = urllib.request.build_opener(PublicOnlyRedirectHandler)
    return opener.open(request, timeout=timeout)  # noqa: S310 - URL is validated before every request
