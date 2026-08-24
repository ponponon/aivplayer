#!/usr/bin/env python3
"""Upload a large file to Cloudflare R2 through the S3 multipart API.

This script intentionally uses only Python's standard library, so it can be
copied to another project or CI runner without installing boto3. Credentials
are read from environment variables and are never written to the resume state
file.

Example:

    R2_ACCESS_KEY_ID='...' \
    R2_SECRET_ACCESS_KEY='...' \
    python3 scripts/upload-r2-multipart.py \
      --account-id c57c83028780abdf346c0ae895b7c4dc \
      --bucket aivplayer-releases \
      --key aivplayer/models/whisper/large-v3-turbo-q5_0/ggml-large-v3-turbo-q5_0.bin \
      --file '/path/to/ggml-large-v3-turbo-q5_0.bin' \
      --expected-sha256 394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2

The default part size is 64 MiB. A failed run can be started again with the
same arguments; the JSON state file records completed parts and the multipart
upload ID, allowing the script to continue instead of starting over.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import hmac
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import uuid
from pathlib import Path
from typing import Any


SERVICE = "s3"
REGION = "auto"
MIN_PART_SIZE = 5 * 1024 * 1024
MAX_PARTS = 10_000
DEFAULT_PART_SIZE = 64 * 1024 * 1024
DEFAULT_TIMEOUT_SECONDS = 180
DEFAULT_RETRIES = 5
RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
XML_NAMESPACE = "http://s3.amazonaws.com/doc/2006-03-01/"


class R2UploadError(RuntimeError):
    """An R2 S3 API request failed."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="使用 R2 S3 Multipart Upload 上传超过 300 MiB 的大文件。"
    )
    parser.add_argument(
        "--file", required=True, type=Path, help="要上传的本地文件路径。"
    )
    parser.add_argument(
        "--account-id",
        default=os.environ.get("CLOUDFLARE_ACCOUNT_ID"),
        help="Cloudflare Account ID，也可以使用 CLOUDFLARE_ACCOUNT_ID。",
    )
    parser.add_argument(
        "--bucket", default="aivplayer-releases", help="R2 bucket 名称。"
    )
    parser.add_argument("--key", required=True, help="R2 对象路径。")
    parser.add_argument(
        "--endpoint",
        help="自定义 S3 endpoint；默认使用 https://<account-id>.r2.cloudflarestorage.com。",
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        help="可选的本地凭证文件；只读取 R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY 和 CLOUDFLARE_ACCOUNT_ID。",
    )
    parser.add_argument(
        "--part-size-mib",
        type=int,
        default=64,
        help="每个分片大小，默认 64 MiB，R2 要求至少 5 MiB。",
    )
    parser.add_argument(
        "--content-type",
        default="application/octet-stream",
        help="对象 Content-Type，默认 application/octet-stream。",
    )
    parser.add_argument(
        "--cache-control",
        default="public, max-age=31536000, immutable",
        help="对象 Cache-Control。",
    )
    parser.add_argument(
        "--expected-sha256",
        help="可选的本地文件 SHA-256；上传前校验，避免把损坏文件写入 R2。",
    )
    parser.add_argument(
        "--state-file",
        type=Path,
        help="断点状态文件；默认是 <本地文件>.r2-upload.json。",
    )
    parser.add_argument(
        "--restart",
        action="store_true",
        help="忽略并删除旧状态，重新创建 multipart upload。",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=DEFAULT_RETRIES,
        help=f"单个请求的最大重试次数，默认 {DEFAULT_RETRIES}。",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help=f"单个 HTTP 请求超时秒数，默认 {DEFAULT_TIMEOUT_SECONDS}。",
    )
    return parser.parse_args()


def fail(message: str) -> None:
    raise SystemExit(f"错误：{message}")


def load_env_file(path: Path | None) -> None:
    if path is None:
        return
    path = path.expanduser().resolve()
    if not path.is_file():
        fail(f"凭证文件不存在：{path}")
    try:
        lines = path.read_text().splitlines()
    except OSError as error:
        fail(f"无法读取凭证文件 {path}：{error}")
    allowed_names = {
        "CLOUDFLARE_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
    }
    for line_number, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            fail(f"凭证文件第 {line_number} 行缺少 =：{path}")
        name, value = (part.strip() for part in line.split("=", 1))
        if name not in allowed_names:
            fail(f"凭证文件第 {line_number} 行包含不支持的变量：{name}")
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ.setdefault(name, value)


def require_credentials() -> tuple[str, str]:
    access_key = os.environ.get("R2_ACCESS_KEY_ID") or os.environ.get(
        "AWS_ACCESS_KEY_ID"
    )
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY") or os.environ.get(
        "AWS_SECRET_ACCESS_KEY"
    )
    if not access_key or not secret_key:
        fail(
            "缺少 R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY。"
            "请先在 Cloudflare R2 创建 S3 API Token，再用环境变量传入。"
        )
    return access_key, secret_key


def normalize_endpoint(endpoint: str) -> str:
    return endpoint.rstrip("/")


def quote_rfc3986(value: str) -> str:
    return urllib.parse.quote(str(value), safe="-_.~")


def encode_path(bucket: str, key: str) -> str:
    encoded_key = "/".join(quote_rfc3986(part) for part in key.split("/"))
    return f"/{quote_rfc3986(bucket)}/{encoded_key}"


def encode_query(params: list[tuple[str, str]]) -> str:
    encoded = [(quote_rfc3986(key), quote_rfc3986(value)) for key, value in params]
    encoded.sort()
    return "&".join(f"{key}={value}" for key, value in encoded)


def collapse_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip())


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hmac_sha256(key: bytes, value: str) -> bytes:
    return hmac.new(key, value.encode("utf-8"), hashlib.sha256).digest()


def signing_key(secret_key: str, date_stamp: str) -> bytes:
    date_key = hmac_sha256(f"AWS4{secret_key}".encode("utf-8"), date_stamp)
    region_key = hmac_sha256(date_key, REGION)
    service_key = hmac_sha256(region_key, SERVICE)
    return hmac_sha256(service_key, "aws4_request")


def signed_headers(
    method: str,
    endpoint: str,
    path: str,
    query: list[tuple[str, str]],
    headers: dict[str, str],
    access_key: str,
    secret_key: str,
    payload_hash: str,
) -> dict[str, str]:
    parsed = urllib.parse.urlparse(endpoint)
    now = dt.datetime.now(dt.timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")

    normalized = {key.lower(): collapse_spaces(value) for key, value in headers.items()}
    normalized["host"] = parsed.netloc
    normalized["x-amz-date"] = amz_date
    normalized["x-amz-content-sha256"] = payload_hash
    canonical_headers = "".join(
        f"{key}:{normalized[key]}\n" for key in sorted(normalized)
    )
    signed_header_names = ";".join(sorted(normalized))
    canonical_query = encode_query(query)
    canonical_request = "\n".join(
        [
            method.upper(),
            path,
            canonical_query,
            canonical_headers,
            signed_header_names,
            payload_hash,
        ]
    )
    credential_scope = f"{date_stamp}/{REGION}/{SERVICE}/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            credential_scope,
            sha256_hex(canonical_request.encode("utf-8")),
        ]
    )
    signature = hmac.new(
        signing_key(secret_key, date_stamp),
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    authorization = (
        "AWS4-HMAC-SHA256 "
        f"Credential={access_key}/{credential_scope}, "
        f"SignedHeaders={signed_header_names}, Signature={signature}"
    )
    result = dict(headers)
    result["Host"] = parsed.netloc
    result["x-amz-date"] = amz_date
    result["x-amz-content-sha256"] = payload_hash
    result["Authorization"] = authorization
    return result


def xml_text(root: ET.Element, name: str) -> str | None:
    for child in root.iter():
        if child.tag.rsplit("}", 1)[-1] == name:
            return child.text
    return None


def xml_error_message(body: bytes) -> str:
    try:
        root = ET.fromstring(body)
        code = xml_text(root, "Code") or "S3Error"
        message = xml_text(root, "Message") or body.decode("utf-8", "replace")
        return f"{code}: {message}"
    except ET.ParseError:
        return body.decode("utf-8", "replace")[:500]


class R2Client:
    def __init__(
        self,
        *,
        endpoint: str,
        access_key: str,
        secret_key: str,
        timeout: int,
        max_retries: int,
    ) -> None:
        self.endpoint = normalize_endpoint(endpoint)
        self.access_key = access_key
        self.secret_key = secret_key
        self.timeout = timeout
        self.max_retries = max_retries

    def request(
        self,
        method: str,
        *,
        bucket: str,
        key: str,
        query: list[tuple[str, str]] | None = None,
        body: bytes = b"",
        headers: dict[str, str] | None = None,
    ) -> tuple[int, dict[str, str], bytes]:
        query = query or []
        path = encode_path(bucket, key)
        query_string = encode_query(query)
        url = f"{self.endpoint}{path}"
        if query_string:
            url = f"{url}?{query_string}"
        request_headers = headers or {}
        payload_hash = sha256_hex(body)
        request_headers = signed_headers(
            method,
            self.endpoint,
            path,
            query,
            request_headers,
            self.access_key,
            self.secret_key,
            payload_hash,
        )

        for attempt in range(self.max_retries + 1):
            try:
                request = urllib.request.Request(
                    url,
                    data=body if method.upper() not in {"GET", "HEAD"} else None,
                    headers=request_headers,
                    method=method.upper(),
                )
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    return response.status, dict(response.headers.items()), response.read()
            except urllib.error.HTTPError as error:
                response_body = error.read()
                if error.code not in RETRYABLE_STATUS_CODES or attempt >= self.max_retries:
                    raise R2UploadError(
                        f"HTTP {error.code}: {xml_error_message(response_body)}"
                    ) from error
                self.retry(attempt, f"HTTP {error.code}")
            except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
                if attempt >= self.max_retries:
                    raise R2UploadError(f"网络请求失败：{error}") from error
                self.retry(attempt, str(error))
        raise AssertionError("unreachable")

    def retry(self, attempt: int, reason: str) -> None:
        delay = min(30.0, 2**attempt + random.random())
        print(f"请求失败（{reason}），{delay:.1f}s 后重试…", file=sys.stderr)
        time.sleep(delay)

    def create_multipart(
        self,
        bucket: str,
        key: str,
        content_type: str,
        cache_control: str,
        sha256: str,
    ) -> str:
        _, _, body = self.request(
            "POST",
            bucket=bucket,
            key=key,
            query=[("uploads", "")],
            headers={
                "Content-Type": content_type,
                "Cache-Control": cache_control,
                "x-amz-meta-sha256": sha256,
            },
        )
        upload_id = xml_text(ET.fromstring(body), "UploadId")
        if not upload_id:
            raise R2UploadError("R2 没有返回 Multipart Upload ID。")
        return upload_id

    def upload_part(
        self, bucket: str, key: str, upload_id: str, part_number: int, data: bytes
    ) -> str:
        _, headers, _ = self.request(
            "PUT",
            bucket=bucket,
            key=key,
            query=[("partNumber", str(part_number)), ("uploadId", upload_id)],
            body=data,
            headers={"Content-Length": str(len(data))},
        )
        etag = headers.get("ETag") or headers.get("Etag")
        if not etag:
            raise R2UploadError(f"分片 {part_number} 上传成功但没有返回 ETag。")
        return etag

    def complete_multipart(
        self, bucket: str, key: str, upload_id: str, parts: dict[int, str]
    ) -> None:
        root = ET.Element("CompleteMultipartUpload")
        for part_number in sorted(parts):
            part = ET.SubElement(root, "Part")
            ET.SubElement(part, "PartNumber").text = str(part_number)
            ET.SubElement(part, "ETag").text = parts[part_number]
        body = ET.tostring(root, encoding="utf-8", xml_declaration=True)
        self.request(
            "POST",
            bucket=bucket,
            key=key,
            query=[("uploadId", upload_id)],
            body=body,
            headers={"Content-Type": "application/xml"},
        )

    def abort_multipart(self, bucket: str, key: str, upload_id: str) -> None:
        self.request(
            "DELETE",
            bucket=bucket,
            key=key,
            query=[("uploadId", upload_id)],
        )

    def head(self, bucket: str, key: str) -> dict[str, str]:
        _, headers, _ = self.request("HEAD", bucket=bucket, key=key)
        return headers


def calculate_sha256(path: Path, chunk_size: int = 8 * 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


def load_state(
    path: Path,
    *,
    file_size: int,
    file_mtime_ns: int,
    endpoint: str,
    bucket: str,
    key: str,
    part_size: int,
    file_sha256: str,
) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        state = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise R2UploadError(f"无法读取状态文件 {path}: {error}") from error
    expected = {
        "version": 2,
        "file_size": file_size,
        "file_mtime_ns": file_mtime_ns,
        "endpoint": endpoint,
        "bucket": bucket,
        "key": key,
        "part_size": part_size,
        "file_sha256": file_sha256,
    }
    if any(state.get(name) != value for name, value in expected.items()):
        raise R2UploadError(
            f"状态文件 {path} 与当前文件或目标不匹配；如果要重新上传，请使用 --restart。"
        )
    return state


def validate_args(args: argparse.Namespace) -> tuple[Path, str, int]:
    if not args.account_id:
        fail("缺少 --account-id 或 CLOUDFLARE_ACCOUNT_ID。")
    path = args.file.expanduser().resolve()
    if not path.is_file():
        fail(f"本地文件不存在：{path}")
    if args.part_size_mib * 1024 * 1024 < MIN_PART_SIZE:
        fail("--part-size-mib 不能小于 5。")
    if args.max_retries < 0:
        fail("--max-retries 不能是负数。")
    endpoint = normalize_endpoint(
        args.endpoint or f"https://{args.account_id}.r2.cloudflarestorage.com"
    )
    if urllib.parse.urlparse(endpoint).scheme != "https":
        fail("R2 endpoint 必须使用 HTTPS。")
    part_size = args.part_size_mib * 1024 * 1024
    file_size = path.stat().st_size
    part_count = (file_size + part_size - 1) // part_size
    if part_count > MAX_PARTS:
        fail(
            f"文件需要 {part_count} 个分片，超过 S3 Multipart 的 {MAX_PARTS} 个上限；"
            "请增大 --part-size-mib。"
        )
    if args.expected_sha256 and not re.fullmatch(r"[0-9a-fA-F]{64}", args.expected_sha256):
        fail("--expected-sha256 必须是 64 位十六进制 SHA-256。")
    return path, endpoint, part_size


def upload(args: argparse.Namespace) -> None:
    load_env_file(args.env_file)
    if not args.account_id:
        args.account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID")
    path, endpoint, part_size = validate_args(args)
    access_key, secret_key = require_credentials()
    state_path = args.state_file or path.with_name(f"{path.name}.r2-upload.json")
    file_stat = path.stat()

    print(f"正在计算本地 SHA-256：{path}")
    local_sha256 = calculate_sha256(path)
    if args.expected_sha256:
        if local_sha256.lower() != args.expected_sha256.lower():
            fail(
                f"本地文件 SHA-256 不匹配：{local_sha256}，"
                f"期望 {args.expected_sha256.lower()}。"
            )
    print(f"本地 SHA-256：{local_sha256}")

    client = R2Client(
        endpoint=endpoint,
        access_key=access_key,
        secret_key=secret_key,
        timeout=args.timeout,
        max_retries=args.max_retries,
    )
    state = None if args.restart else load_state(
        state_path,
        file_size=file_stat.st_size,
        file_mtime_ns=file_stat.st_mtime_ns,
        endpoint=endpoint,
        bucket=args.bucket,
        key=args.key,
        part_size=part_size,
        file_sha256=local_sha256,
    )

    if args.restart and state_path.exists():
        try:
            old_state = json.loads(state_path.read_text())
            old_upload_id = old_state.get("upload_id")
            if old_upload_id:
                print("正在终止旧的未完成 Multipart Upload…")
                client.abort_multipart(args.bucket, args.key, old_upload_id)
        except (OSError, json.JSONDecodeError, R2UploadError) as error:
            print(f"提示：旧 Multipart Upload 未能终止，将继续创建新的：{error}")
        state_path.unlink(missing_ok=True)

    if state is None:
        upload_id = client.create_multipart(
            args.bucket,
            args.key,
            args.content_type,
            args.cache_control,
            local_sha256,
        )
        state = {
            "version": 2,
            "file": str(path),
            "file_size": file_stat.st_size,
            "file_mtime_ns": file_stat.st_mtime_ns,
            "endpoint": endpoint,
            "bucket": args.bucket,
            "key": args.key,
            "part_size": part_size,
            "file_sha256": local_sha256,
            "upload_id": upload_id,
            "parts": {},
        }
        atomic_write_json(state_path, state)
        print(f"已创建 Multipart Upload，状态文件：{state_path}")
    else:
        print(f"继续已有 Multipart Upload，状态文件：{state_path}")

    if state.get("completed"):
        print("检测到对象已经完成合并，正在校验远端对象…")
        remote_headers = client.head(args.bucket, args.key)
        remote_size = int(remote_headers.get("Content-Length", "-1"))
        if remote_size != file_stat.st_size:
            raise R2UploadError(
                f"远端对象大小不一致：本地 {file_stat.st_size}，远端 {remote_size}。"
            )
        remote_sha256 = next(
            (value for name, value in remote_headers.items() if name.lower() == "x-amz-meta-sha256"),
            "",
        )
        if remote_sha256.lower() != local_sha256.lower():
            raise R2UploadError(
                f"远端对象 SHA-256 元数据不一致：本地 {local_sha256}，远端 {remote_sha256 or '缺失'}。"
            )
        state_path.unlink(missing_ok=True)
        print(f"上传已完成：s3://{args.bucket}/{args.key}")
        return

    upload_id = str(state["upload_id"])
    uploaded_parts = {
        int(number): str(value["etag"])
        for number, value in state.get("parts", {}).items()
    }
    part_count = (file_stat.st_size + part_size - 1) // part_size
    try:
        with path.open("rb") as stream:
            for part_number in range(1, part_count + 1):
                offset = (part_number - 1) * part_size
                expected_size = min(part_size, file_stat.st_size - offset)
                if part_number in uploaded_parts:
                    stream.seek(expected_size, os.SEEK_CUR)
                    print(f"跳过已完成分片 {part_number}/{part_count}")
                    continue
                data = stream.read(expected_size)
                if len(data) != expected_size:
                    raise R2UploadError(
                        f"读取分片 {part_number} 时文件长度变化，期望 {expected_size} 字节，"
                        f"实际 {len(data)} 字节。"
                    )
                print(
                    f"上传分片 {part_number}/{part_count} "
                    f"({len(data) / 1024 / 1024:.1f} MiB)…"
                )
                etag = client.upload_part(
                    args.bucket, args.key, upload_id, part_number, data
                )
                uploaded_parts[part_number] = etag
                state["parts"][str(part_number)] = {
                    "etag": etag,
                    "size": len(data),
                }
                atomic_write_json(state_path, state)

        if len(uploaded_parts) != part_count:
            raise R2UploadError(
                f"已上传 {len(uploaded_parts)} 个分片，但需要 {part_count} 个。"
            )
        latest_file_stat = path.stat()
        latest_sha256 = calculate_sha256(path)
        if latest_file_stat.st_size != file_stat.st_size or latest_sha256.lower() != local_sha256.lower():
            raise R2UploadError(
                "上传期间本地文件发生变化；为避免合并出错误对象，请使用 --restart 重新上传。"
            )
        print("正在合并 Multipart Upload…")
        client.complete_multipart(args.bucket, args.key, upload_id, uploaded_parts)
        state["completed"] = True
        state["file_sha256"] = local_sha256
        atomic_write_json(state_path, state)
        remote_headers = client.head(args.bucket, args.key)
        remote_size = int(remote_headers.get("Content-Length", "-1"))
        if remote_size != file_stat.st_size:
            raise R2UploadError(
                f"上传完成但远端大小不一致：本地 {file_stat.st_size}，远端 {remote_size}。"
            )
        remote_sha256 = next(
            (value for name, value in remote_headers.items() if name.lower() == "x-amz-meta-sha256"),
            "",
        )
        if remote_sha256.lower() != local_sha256.lower():
            raise R2UploadError(
                f"上传完成但远端 SHA-256 元数据不一致：本地 {local_sha256}，远端 {remote_sha256 or '缺失'}。"
            )
        state_path.unlink(missing_ok=True)
        print(
            f"上传完成：s3://{args.bucket}/{args.key}\n"
            f"公开 URL（若 R2 自定义域名已配置）："
            f"https://releases.quniv.cn/{args.key}\n"
            f"大小：{remote_size} bytes\n"
            f"ETag：{remote_headers.get('ETag', '未知')}"
        )
    except Exception:
        print(
            f"上传未完成；状态已保留在 {state_path}。"
            "下次使用相同参数可继续，或使用 --restart 重新开始。",
            file=sys.stderr,
        )
        raise


def main() -> int:
    try:
        upload(parse_args())
        return 0
    except KeyboardInterrupt:
        print("\n已中断；状态文件会保留，稍后可继续。", file=sys.stderr)
        return 130
    except (R2UploadError, OSError) as error:
        print(f"错误：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
