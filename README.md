# Proof Gatekeeper

TypeScript / Node.js 24 HTTP service for zkVerify Agent Games. Deterministic decisions, raw-body HMAC-SHA256, local Groth16/BN128 proofs using the official artifacts, persistent replay protection, and Kurier finalization. No language model is involved.

## Structure

```text
src/
  application.ts      Signed task and preflight handler
  protocol.ts         Schemas, circuit policy and public input encoding
  crypto.ts           Raw-body signature verification and signing
  prover.ts           Cancellable, isolated proof process
  proof-worker.ts     snarkjs proving, signal binding and local verification
  kurier.ts           REST submission and Finalized polling
  state.ts            SQLite task claims, references, responses and evidence
  artifacts.ts        Pinned official artifact integrity checks
  config.ts           Validated environment configuration
  server.ts           HTTP/native HTTPS and shutdown
circuits/              Downloaded WASM, proving key and exported verification key
scripts/               Artifact validation and signed offline replay harness
tests/                 Policy, HTTP, persistence, relay and real proof tests
Dockerfile             Non-root production container
.env.example           Blank secret fields and testnet defaults
```

## Run locally

Requires Node.js 24 or newer. Run from this directory; circuit paths are relative to it.

```sh
npm ci --ignore-scripts
npm run artifacts:check
npm run build
npm test
npm run replay
cp .env.example .env
```

Fill `.env` locally with `AGENT_GAMES_HMAC_SECRET` from the dashboard's **Rotate Secret** and a **testnet** `KURIER_API_KEY`. Do not paste them into chat. Then:

```sh
npm start
```

`POST /agent` is the registered handler. `GET /healthz` reports liveness. Both responses are signed. Optional `TLS_CERT_PATH` and `TLS_KEY_PATH` enable native HTTPS; a public hosting proxy can terminate HTTPS instead. The HTTP port must then be private behind that proxy.

`npm run replay` generates temporary random credentials, starts a loopback server, signs eight representative envelopes and verifies the response signatures. It generates real circuit proofs for valid and trap inputs. **Finalization is simulated only in this explicitly offline harness.** Production always calls Kurier and polls the job; there is no environment option to bypass finalization.

## Hosting and registration

Build with `docker build -t proof-gatekeeper .`. Supply secrets at runtime using the host's environment settings. Mount a persistent, private volume at `/app/data`, use one replica, and expose the full handler through a public HTTPS URL such as `https://your-host/agent`. The process runs as the non-root `node` user; its volume must be writable by that user. The container binds port 3000. No hosting account is configured or deployed by this project.

The signing secret and Kurier key are required at startup; there are no fallback credentials. `.env`, key files and runtime evidence are excluded from Git and the Docker build context. The child prover receives neither signing nor relay secrets. No request body, secret, remote exception or secret-bearing relay URL is logged.

Start on testnet: `NETWORK=testnet` is the default and submits the full exported verification key (`vkRegistered: false`). The published competition VK hash belongs to **mainnet**, so it is never reused as a testnet registration. To enter the actual competition after testnet validation, set `NETWORK=mainnet` and use a mainnet Kurier key. Mainnet uses the official Gatekeeper registered key automatically; an explicitly configured mismatching key prevents startup.

Follow the official guide: sign in, register the complete HTTPS handler path, select Proof Gatekeeper, rotate the dashboard secret, set it privately in the host, restart, pass preflight, then run unscored practice. Account registration, secret rotation, chain submissions and public deployment have not been performed here.

## Behavior and limits

- HMAC-SHA256 uses the exact incoming bytes and a 64-character hexadecimal `x-agent-games-signature`, compared in constant time before JSON decoding. Responses are serialized once and signed over those exact bytes, including errors.
- Freshness is a local defensive policy: accept issued timestamps up to 60 seconds old and up to 5 seconds ahead for clock skew. Expired or malformed deadlines reject before proving. Keep host clocks synchronized. Processing stops by 58 seconds from request arrival or 500 milliseconds before the task deadline, whichever is earlier. Uploads have a 5-second limit and 32 KiB cap.
- The fixed official WASM/zkey and local verification enforce Groth16/BN128 and the expected circuit. Unknown envelope fields are rejected rather than interpreted as an alternative proof system. The signed round `registered_vk` is compared with `proof_vk`; it is distinct from the circuit verification key used for the agent's own evaluation proof.
- Circuit approval requires matching VK values, balance at least minimum, `expiry_block > current_block`, matching recipient and amount at most max transfer. The circuit uses unsigned 32-bit numeric comparisons; out-of-range numbers reject. Monetary values stay integers, without floating-point conversion.
- Task IDs must end in a UUID, as the platform source encodes them. The UUID is parsed into the circuit `taskId`; unsupported IDs reject rather than inventing an encoding. Twelve public input signals follow the private-salt commitment output. Every signal is checked against the task before local verification. Full-width VK hashes are reduced to the BN254 scalar field only for circuit encoding; the policy compares the original integer values.
- SQLite atomically claims task IDs and incoming proof references before work. Identical retried bodies receive the saved response while fresh; a changed body using the same task ID rejects. References persist across rounds/restarts. An interrupted task remains a fail-closed rejection. Do not delete state between rounds. Back up the private state volume. Multiple hosts require a shared transactional state implementation before adding replicas.
- Only a locally verified proof whose Kurier job reaches **Finalized** with a transaction hash can produce APPROVE. Inclusion and optimistic verification cannot authorize. Unknown relay states, relay failure, proof failure and timeout reject. Responses include `proof_tx` only when a real finalized transaction is available; job IDs are retained as local audit metadata.
- The circuit enforces the five arithmetic checks; it has no replay, HMAC, clock or network-state inputs. A REJECT caused solely by one of these external checks cannot have a valid rejection proof when the circuit arithmetic requires APPROVE. Such responses omit proof evidence rather than fabricate one or attach an APPROVE proof to REJECT. Arithmetic rejections attach their valid rejection proof when available, even if submission subsequently fails. Proof omission can incur the game's proof penalty.
- The published incoming task contains a proof reference and condition values, not an incoming Groth16 proof or a chain lookup contract. This implementation validates the authenticated task values and finalizes its own evaluation proof. It does not invent an API for fetching an unrelated incoming proof from `input.proof_tx`.
- Bounded to one active task per process, with no unbounded proving queue. Concurrent arrivals receive a signed BUSY rejection. Size the host and run practice to check that proving plus finality fits the platform deadline. Proof finality depends on the external network and is not guaranteed within 60 seconds.
- Full signed request bodies are not stored. SQLite keeps their digests, response proofs/public signals, incoming references and finalized transaction metadata for retries and disputes. Protect this volume; public signals reveal the task's public values.

## Sources

Protocol and artifacts were checked on 13 November 2026:

- https://agentgames.zkverify.io/build
- https://agentgames.zkverify.io/guide
- https://agentgames.zkverify.io/api/circuit-info
- https://docs.zkverify.io/overview/getting-started/kurier

See `docs/protocol-notes.md` for provenance, artifact hashes and details absent from the public field guide. Live end-to-end platform acceptance and actual Kurier finalization require your private environment configuration and practice access.
