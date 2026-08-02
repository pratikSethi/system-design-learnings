"""gRPC MessageService server backed by SQLite (raw SQL, no ORM).

Flow:  client --gRPC--> this server --raw SQL--> SQLite --> back to client
"""

from __future__ import annotations

import sqlite3
import time
import uuid
from concurrent import futures
from pathlib import Path

import grpc
from grpc_reflection.v1alpha import reflection

from . import message_pb2, message_pb2_grpc

# The SQLite database file lives next to the project root.
DB_PATH = Path(__file__).resolve().parent.parent / "messages.db"
LISTEN_ADDR = "[::]:50051"


def _connect() -> sqlite3.Connection:
    """Open a SQLite connection.

    check_same_thread=False because the gRPC server serves requests from a
    thread pool; each handler opens its own short-lived connection, so this is
    safe here.
    """
    return sqlite3.connect(DB_PATH, check_same_thread=False)


def init_db() -> None:
    """Create the messages table if it doesn't exist yet."""
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id          TEXT PRIMARY KEY,
                channel_id  TEXT NOT NULL,
                sender      TEXT NOT NULL,
                body        TEXT NOT NULL,
                created_at  INTEGER NOT NULL
            )
            """
        )
        conn.commit()


class MessageServicer(message_pb2_grpc.MessageServiceServicer):
    """Implements the two RPCs declared in message.proto."""

    def SendMessage(self, request, context):
        # Server assigns id + timestamp; client never supplies these.
        msg_id = str(uuid.uuid4())
        created_at = int(time.time())

        with _connect() as conn:
            conn.execute(
                "INSERT INTO messages (id, channel_id, sender, body, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (msg_id, request.channel_id, request.sender, request.body, created_at),
            )
            conn.commit()

        stored = message_pb2.Message(
            id=msg_id,
            channel_id=request.channel_id,
            sender=request.sender,
            body=request.body,
            created_at=created_at,
        )
        return message_pb2.SendMessageResponse(message=stored)

    def GetMessages(self, request, context):
        with _connect() as conn:
            rows = conn.execute(
                "SELECT id, channel_id, sender, body, created_at "
                "FROM messages WHERE channel_id = ? ORDER BY created_at ASC",
                (request.channel_id,),
            ).fetchall()

        messages = [
            message_pb2.Message(
                id=row[0],
                channel_id=row[1],
                sender=row[2],
                body=row[3],
                created_at=row[4],
            )
            for row in rows
        ]
        return message_pb2.GetMessagesResponse(messages=messages)


def serve() -> None:
    init_db()

    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    message_pb2_grpc.add_MessageServiceServicer_to_server(MessageServicer(), server)

    # Server reflection lets grpcurl/Postman discover the service without a
    # local copy of the .proto file.
    service_names = (
        message_pb2.DESCRIPTOR.services_by_name["MessageService"].full_name,
        reflection.SERVICE_NAME,
    )
    reflection.enable_server_reflection(service_names, server)

    server.add_insecure_port(LISTEN_ADDR)
    server.start()
    print(f"MessageService listening on {LISTEN_ADDR} (db: {DB_PATH})")
    server.wait_for_termination()


if __name__ == "__main__":
    serve()
