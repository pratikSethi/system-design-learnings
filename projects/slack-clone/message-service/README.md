# message-service

A small gRPC service for learning gRPC + Protobuf. It stores chat messages in
SQLite (raw SQL, no ORM) and exposes two unary RPCs.

```
client ──gRPC──▶ server.py ──raw SQL──▶ SQLite (messages.db) ──▶ back
```

- **Service:** `slack.message.v1.MessageService`
- **RPCs:** `SendMessage`, `GetMessages`
- **Listens on:** `localhost:50051` (plaintext / no TLS)
- **Contract:** [`protos/message.proto`](protos/message.proto)

---

## Prerequisites

- [`uv`](https://docs.astral.sh/uv/) (Python env + deps; project pins Python 3.12)
- [`grpcurl`](https://github.com/fullstorydev/grpcurl) for CLI testing — `brew install grpcurl`
- (optional) [Bruno](https://www.usebruno.com/) GUI — `brew install bruno` (it's a desktop app, launch with `open -a Bruno`, there is no `bruno` CLI command)

First-time setup (installs deps into `.venv/`):

```bash
uv sync
```

---

## Start / stop the server

```bash
# from projects/slack-clone/message-service

# START (runs in foreground; Ctrl-C to stop)
uv run python -m message_service.server

# START in the background instead
uv run python -m message_service.server &

# STOP the background one (find + kill whatever listens on 50051)
kill $(lsof -ti :50051)

# CHECK whether it's running (empty output = not running)
lsof -iTCP:50051 -sTCP:LISTEN
```

On startup it prints: `MessageService listening on [::]:50051 (db: .../messages.db)`

---

## Regenerating gRPC stubs

Only needed if you edit `protos/message.proto`. Regenerates `message_pb2.py` and
`message_pb2_grpc.py`.

```bash
uv run python -m grpc_tools.protoc -I protos \
  --python_out=message_service \
  --grpc_python_out=message_service \
  protos/message.proto
```

> ⚠️ After regenerating, re-apply the one-line fix in `message_service/message_pb2_grpc.py`:
> change `import message_pb2 as message__pb2` → `from . import message_pb2 as message__pb2`
> (codegen emits an absolute import that breaks inside the package).

---

## Testing with grpcurl

`-plaintext` = no TLS (matches the insecure server). Reflection is enabled, so no
need to point at the `.proto` file.

```bash
# List services
grpcurl -plaintext localhost:50051 list

# List a service's methods
grpcurl -plaintext localhost:50051 list slack.message.v1.MessageService

# Describe a method / message type
grpcurl -plaintext localhost:50051 describe slack.message.v1.MessageService
grpcurl -plaintext localhost:50051 describe slack.message.v1.SendMessageRequest

# SendMessage
grpcurl -plaintext -d '{"channel_id":"general","sender":"me","body":"hi from grpcurl"}' \
  localhost:50051 slack.message.v1.MessageService/SendMessage

# GetMessages
grpcurl -plaintext -d '{"channel_id":"general"}' \
  localhost:50051 slack.message.v1.MessageService/GetMessages
```

---

## Testing with Bruno (GUI)

1. Launch: `open -a Bruno` (or Spotlight → "Bruno").
2. Create a Collection, then a **New Request** and switch protocol **HTTP → gRPC**.
3. **URL:** `localhost:50051`, and enable the **plaintext / no-TLS** toggle.
4. Load methods via **server reflection** (preferred), or import `protos/message.proto`.
5. Pick a method, paste a payload below, and Send.

### Copy-paste payloads (Bruno message body is raw JSON)

**SendMessage**

```json
{ "channel_id": "general", "sender": "me", "body": "hi from bruno" }
```

**GetMessages**

```json
{ "channel_id": "general" }
```

---

## Inspecting the database

The SQLite file is `messages.db` in this directory.

```bash
# via CLI
sqlite3 messages.db "SELECT id, channel_id, sender, body, created_at FROM messages;"
```

Or open `messages.db` in **DBeaver** (SQLite driver, no host/port — just point it
at the file).

---

## Project layout

```
message-service/
  protos/message.proto          # the contract (edit this, then regenerate)
  message_service/
    message_pb2.py              # GENERATED — data types (do not hand-edit)
    message_pb2_grpc.py         # GENERATED — server base + client stub
    server.py                   # gRPC server + SQLite handlers
  messages.db                   # SQLite data (gitignored)
  pyproject.toml / uv.lock      # deps: grpcio, grpcio-tools, grpcio-reflection
```
