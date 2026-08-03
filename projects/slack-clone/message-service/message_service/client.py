"""Minimal gRPC client for MessageService.

This is the counterpart to server.py. In a real Slack-like system the *caller*
of message-service is another backend service (the chat/gateway tier), never the
end-user's app directly — see docs/. This module is that caller boiled down to
its essence: open a channel, wrap it in the generated stub, call the two RPCs.

It doubles as:
  - a runnable script (`python -m message_service.client`) to poke a live server, and
  - the client used by the integration tests in tests/.
"""

from __future__ import annotations

import grpc

from . import message_pb2, message_pb2_grpc

# Where the server listens by default (see server.py LISTEN_ADDR).
DEFAULT_TARGET = "localhost:50051"


class MessageClient:
    """Thin wrapper over the generated MessageServiceStub.

    Use as a context manager so the underlying channel is always closed:

        with MessageClient() as client:
            client.send("general", "alice", "hi")
    """

    def __init__(self, target: str = DEFAULT_TARGET):
        # insecure_channel = plaintext HTTP/2, no TLS. Fine for local/test; a
        # real deployment would use grpc.secure_channel with credentials.
        self._channel = grpc.insecure_channel(target)
        self._stub = message_pb2_grpc.MessageServiceStub(self._channel)

    def send(self, channel_id: str, sender: str, body: str) -> message_pb2.Message:
        """Call SendMessage; return the stored Message (with server id + timestamp)."""
        response = self._stub.SendMessage(
            message_pb2.SendMessageRequest(
                channel_id=channel_id, sender=sender, body=body
            )
        )
        return response.message

    def get(self, channel_id: str) -> list[message_pb2.Message]:
        """Call GetMessages; return the channel's messages oldest-first."""
        response = self._stub.GetMessages(
            message_pb2.GetMessagesRequest(channel_id=channel_id)
        )
        return list(response.messages)

    def close(self) -> None:
        self._channel.close()

    def __enter__(self) -> "MessageClient":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()


def main() -> None:
    """Send one message to #general, then read the channel back."""
    with MessageClient() as client:
        sent = client.send("general", "alice", "hello from the client")
        print(f"sent: id={sent.id} created_at={sent.created_at}")

        print("channel #general:")
        for msg in client.get("general"):
            print(f"  [{msg.created_at}] {msg.sender}: {msg.body}")


if __name__ == "__main__":
    main()
