"""Integration tests: a real gRPC server in a background thread, a real client
over a real socket. No mocks, no Docker.

Why no testcontainers? message-service embeds SQLite in-process, so there is no
external dependency to spin up. The only thing to run is the server itself, and
starting it in-thread on an ephemeral port is strictly simpler than building an
image. (If message-service ever gained a real external DB, testcontainers would
start earning its place — that's when you'd reach for it.)
"""

from __future__ import annotations

from concurrent import futures

import grpc
import pytest

from message_service import message_pb2_grpc, server as server_mod
from message_service.client import MessageClient


@pytest.fixture
def server_target(tmp_path, monkeypatch):
    """Start the real MessageService on an ephemeral port; yield its address.

    - DB_PATH is redirected to a throwaway file so tests never touch the real
      messages.db (and each test gets a clean database via tmp_path).
    - port 0 tells the OS to pick any free port, so tests never collide.
    """
    monkeypatch.setattr(server_mod, "DB_PATH", tmp_path / "test.db")
    server_mod.init_db()

    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    message_pb2_grpc.add_MessageServiceServicer_to_server(
        server_mod.MessageServicer(), server
    )
    port = server.add_insecure_port("localhost:0")
    server.start()
    print(f"\n[fixture] server started on localhost:{port}")

    yield f"localhost:{port}"

    server.stop(grace=None)
    print(f"[fixture] server on localhost:{port} stopped; test finished")


def test_send_returns_server_assigned_fields(server_target):
    with MessageClient(server_target) as client:
        sent = client.send("general", "alice", "hello")

    # The client supplies channel_id/sender/body; the server assigns id + time.
    assert sent.id  # non-empty UUID string
    assert sent.created_at > 0
    assert sent.channel_id == "general"
    assert sent.sender == "alice"
    assert sent.body == "hello"


def test_send_then_get_roundtrip(server_target):
    with MessageClient(server_target) as client:
        client.send("general", "alice", "hello")
        messages = client.get("general")

    assert len(messages) == 1
    assert messages[0].sender == "alice"
    assert messages[0].body == "hello"


def test_get_unknown_channel_is_empty(server_target):
    with MessageClient(server_target) as client:
        assert client.get("no-such-channel") == []


def test_messages_are_scoped_to_their_channel(server_target):
    with MessageClient(server_target) as client:
        client.send("general", "alice", "in general")
        client.send("random", "bob", "in random")

        general_bodies = {m.body for m in client.get("general")}
        random_bodies = {m.body for m in client.get("random")}

    assert general_bodies == {"in general"}
    assert random_bodies == {"in random"}
