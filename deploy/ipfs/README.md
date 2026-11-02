# Decentralized hosting: IPFS + ENS

This publishes the exact same static site to IPFS, then points an ENS name at the
directory CID. The result is a content-addressed copy of the site that any IPFS
gateway can serve.

```
static files ──▶ IPFS CID ──▶ ENS contenthash ──▶ name.eth.limo
                                      │
                                      └──▶ ENS-aware browser / wallet
```

## 1. Publish to IPFS

Install [Kubo](https://docs.ipfs.tech/install/), start the daemon, then:

```bash
ipfs daemon
# in another terminal:
chmod +x deploy/ipfs/publish.sh
./deploy/ipfs/publish.sh
```

The script:

- copies the site to a temp directory, excluding `.git`, `deploy/`, `scripts/`
- adds it as a CIDv1 directory with `ipfs add -r --cid-version 1 --pin`
- publishes an IPNS name for a stable pointer
- prints both addresses

Test the CID through a public gateway before touching ENS:

```bash
curl -sI "https://<CID>.ipfs.dweb.link/" | head
```

### Keep it available

A CID is only reachable while at least one node has the blocks. Your local node
pins them, but it must stay online. For durability, pin the CID with a service
(or a second always-on node). Free tiers change frequently, so check current
limits with providers such as Pinata, Filebase, 4EVERLAND, or a self-hosted
Kubo node. If you configure a remote pinning service:

```bash
ipfs pin remote service add my-service https://api.example.com <TOKEN>
IPFS_PIN_REMOTE=my-service ./deploy/ipfs/publish.sh
```

## 2. Get a name

### ENS (works in normal browsers through a gateway)

1. Register a name at [app.ens.domains](https://app.ens.domains).
   **This is not free**: you pay an annual registration fee plus gas.
2. Open the name → **Records** → **Content Hash**.
3. Set it to `ipfs://<CID>` (or `ipns://<IPNS-key>` if you want to update without
   paying gas each time).
4. Visit `https://<your-name>.eth.limo/`.

`eth.limo` is a free public gateway that resolves ENS names over HTTPS. It is a
convenience layer: the name and content are decentralized, but the gateway itself
is an ordinary web service.

ENS-aware browsers and wallets can resolve the name without a gateway, but
support varies.

### Free or cheap subnames

Some wallets and communities issue ENS subnames at no charge, for example
`yourname.cb.id` through Coinbase Wallet. Availability, permanence, and terms
change, and you usually do not control the parent name. Treat these as a demo
convenience, not a durable identity.

### Other decentralized naming systems

| System | Reality check |
| --- | --- |
| **Handshake (HNS)** | Names are not free; normal browsers need a resolver or extension |
| **Unstoppable Domains** | Paid; some wallets/gateways resolve it |
| **Arweave / ArNS** | Paid in AR; permanent storage, not free |
| **IPNS only** | No human name; stable key, but needs a reachable publisher |
| **ENS + IPFS** | Small yearly cost + gas; best browser compatibility via gateways |

**There is no reliably free, permanent, human-readable decentralized domain.**
Anyone claiming otherwise is usually offering a subname they control, a
time-limited promotion, or a gateway URL. Budget a few dollars a year for ENS, or
accept a CID/IPNS URL.

### Why not point ENS at CloudFront?

ENS `contenthash` records address content systems (IPFS, IPNS, Swarm, Arweave),
not arbitrary HTTPS origins. Running both AWS and IPFS means publishing the same
files twice; that is the supported pattern. If you want one canonical address,
use the ENS + IPFS address and treat CloudFront as a fast mirror.

## 3. Update the site

```bash
./deploy/ipfs/publish.sh          # new CID
```

Then either:

- update the ENS content hash to the new `ipfs://CID` (costs gas), or
- set the content hash once to `ipns://<key>` and keep publishing IPNS
  (no gas per update, but the IPNS key must stay reachable).

Old CIDs remain valid forever as long as someone pins them; that is a feature of
content addressing.

## Limits and caveats

- Public gateways rate-limit and may block large or abusive content.
- Free pinning services can evict inactive content or change their terms.
- ENS gas prices vary; registering during a busy period costs more.
- Never put secrets in the site: everything published to IPFS is public and
  immutable.
- Keep the site's legal scope intact: public-domain texts or content you have
  permission to publish.
