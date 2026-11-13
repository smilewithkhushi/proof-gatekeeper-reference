# Protocol evidence and implementation choices

The public build page specifies raw-body HMAC but omits the digest algorithm/encoding, circuit witness names, task ID encoding and public-signal order. Its displayed task ID is a placeholder. No undocumented encoding is derived from that placeholder.

The existing local platform checkout at `../agent-games-railway` supplied these additional implementation details:

- `lib/agent-signature.ts`: HMAC-SHA256 and hexadecimal signature.
- `circuits/gatekeeper/gatekeeper.circom`: witness fields, 32-bit comparator ranges, strict expiry and five arithmetic conditions.
- `lib/gatekeeper/traps.ts`: task UUID suffix encoding and public input order.
- `lib/zk/verify-proof.ts`: one commitment output followed by twelve public inputs, reduced modulo BN254.

These are implementation evidence from a local checkout, not an assertion that the public guide documents these details. The two circuit artifacts freshly downloaded from the live official URLs are byte-for-byte identical to that checkout's `public/circuits` files. Real proof tests exercise the live downloads, including approval, rejection and equal-block expiry. Platform practice remains necessary to establish end-to-end acceptance.

Pinned SHA-256 hashes of downloaded bytes:

| Artifact | SHA-256 |
| --- | --- |
| gatekeeper.wasm | be00aefe3c8ba910951a242f50e55937bf82a0375ad4b69c2ef10629ab92764f |
| gatekeeper_final.zkey | adfe95a439a7063a82a4967ef026d2dd6857a4d02c63b3caf63dac02e01af80d |

URLs:

- https://agentgames.zkverify.io/circuits/gatekeeper.wasm
- https://agentgames.zkverify.io/circuits/gatekeeper_final.zkey

Official mainnet circuit VK hash from the build page and `/api/circuit-info`:

`0x6b79c6012a6d8651f3e13bc4d2a20370280ab49700c90c5316d4168bfbad77b0`

The Kurier guide documents `jobId`, `optimisticVerify: "success"`, `GET /job-status/{apiKey}/{jobId}`, `status: "Finalized"` and `txHash`. A `job_id` field is not silently accepted. Testnet uses `https://api-testnet.kurier.xyz/api/v1`; mainnet uses `https://api.kurier.xyz/api/v1`. Because API credentials appear in the documented URL path, remote errors/URLs must never be logged. Redirects are disabled.

Reason codes for arithmetic traps follow the platform source. `INVALID_SIGNATURE`, `STALE_TASK`, `PROOF_GENERATION_FAILED`, `FINALIZATION_FAILED`, `TIMEOUT`, `INCOMPLETE_TASK`, `TASK_ID_CONFLICT` and other transport reason codes are descriptive local fail-closed responses; the field guide does not publish an exhaustive reason-code enum. No protocol claim is made that these receive special scoring treatment.

Local limits (body size, skew tolerance, upload timeout, concurrency) are operational choices, not platform protocol requirements. The guide requires HTTPS at the registered public endpoint; native TLS and hosting-proxy TLS are supported. Nothing is registered or published automatically.
