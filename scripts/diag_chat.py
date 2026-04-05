import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8080"


def urlopen(req, timeout=3):
    return urllib.request.urlopen(req, timeout=timeout)


def http_get(path: str):
    url = BASE + path
    with urlopen(url) as r:
        body = r.read()
        return r.status, r.headers.get_content_type(), body


def http_get_json(path: str):
    status, _, body = http_get(path)
    return status, json.loads(body.decode("utf-8"))


def http_post_json(path: str, payload: dict):
    url = BASE + path
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    with urlopen(req) as r:
        body = r.read()
        return r.status, json.loads(body.decode("utf-8"))


def main() -> int:
    try:
        status, ctype, body = http_get("/addon/chat")
        html = body.decode("utf-8", errors="replace")

        m_uid = re.search(r'data-profile-id="(\d+)"', html)
        m_rooms = re.search(r'data-rooms-url="([^"]+)"', html)

        print("GET /addon/chat:", status, ctype)
        print("profileId:", m_uid.group(1) if m_uid else None)
        print("roomsUrl:", m_rooms.group(1) if m_rooms else None)

        uid = int(m_uid.group(1)) if m_uid else None
        if not uid:
            print(
                "ERROR: No data-profile-id found in /addon/chat. "
                "This usually means frontend currentUserId is null, so sending/fetching messages won't work.",
                file=sys.stderr,
            )
            return 2

        qs = urllib.parse.urlencode({"include_members": 1, "limit": 5, "user_id": uid})
        status, rooms = http_get_json("/api/chat/rooms?" + qs)
        print("GET /api/chat/rooms:", status, "count=", len(rooms))

        if not rooms:
            print(
                "ERROR: No rooms returned for this user_id. "
                "If the user left all rooms, strict membership filtering will hide everything.",
                file=sys.stderr,
            )
            return 3

        rid = rooms[0]["id"]
        print("Using roomId:", rid)

        qs = urllib.parse.urlencode(
            {"per_page": 5, "order": "desc", "include_files": 1, "viewer_user_id": uid}
        )
        status, msgs = http_get_json(f"/api/chat/rooms/{rid}/messages?" + qs)
        print("GET /messages:", status, "total=", msgs.get("total"))

        status, sent = http_post_json(
            f"/api/chat/rooms/{rid}/messages",
            {"sender_user_id": uid, "content_type": "TEXT", "content_text": "ping-from-diag"},
        )
        print("POST /messages:", status, "sentId=", sent.get("id"))

        return 0

    except urllib.error.HTTPError as e:
        print("HTTPError:", e.code, e.reason, file=sys.stderr)
        try:
            print(e.read().decode("utf-8", errors="replace")[:2000], file=sys.stderr)
        except Exception:
            pass
        return 10
    except urllib.error.URLError as e:
        print("URLError:", e, file=sys.stderr)
        return 11
    except Exception as e:
        print(f"Exception: {type(e).__name__}: {e}", file=sys.stderr)
        return 12


if __name__ == "__main__":
    raise SystemExit(main())
