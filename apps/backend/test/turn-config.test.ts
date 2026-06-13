import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  turnConfigFromEnv,
  buildIceServers,
  PUBLIC_STUN,
  type TurnConfig,
} from "../src/turn-config.js";

describe("turnConfigFromEnv", () => {
  let saved: NodeJS.ProcessEnv;

  beforeEach(() => {
    saved = { ...process.env };
    delete process.env.TURN_URLS;
    delete process.env.TURN_SHARED_SECRET;
    delete process.env.TURN_TTL_SECONDS;
  });

  afterEach(() => {
    process.env = saved;
  });

  it("returns null when TURN_SHARED_SECRET is unset", () => {
    process.env.TURN_URLS = "turn:turn.example.com:3478";
    expect(turnConfigFromEnv()).toBeNull();
  });

  it("returns null when TURN_URLS is unset", () => {
    process.env.TURN_SHARED_SECRET = "s3cr3t";
    expect(turnConfigFromEnv()).toBeNull();
  });

  it("returns null when TURN_URLS is empty", () => {
    process.env.TURN_URLS = "";
    process.env.TURN_SHARED_SECRET = "s3cr3t";
    expect(turnConfigFromEnv()).toBeNull();
  });

  it("parses comma-separated TURN_URLS and defaults ttl to 600", () => {
    process.env.TURN_URLS =
      "turn:turn.example.com:3478, turns:turn.example.com:5349 ";
    process.env.TURN_SHARED_SECRET = "s3cr3t";
    const cfg = turnConfigFromEnv();
    expect(cfg).toEqual({
      urls: ["turn:turn.example.com:3478", "turns:turn.example.com:5349"],
      secret: "s3cr3t",
      ttlSeconds: 600,
    });
  });

  it("reads TURN_TTL_SECONDS when present", () => {
    process.env.TURN_URLS = "turn:turn.example.com:3478";
    process.env.TURN_SHARED_SECRET = "s3cr3t";
    process.env.TURN_TTL_SECONDS = "120";
    expect(turnConfigFromEnv()?.ttlSeconds).toBe(120);
  });
});

describe("buildIceServers", () => {
  const config: TurnConfig = {
    urls: ["turn:turn.example.com:3478"],
    secret: "s3cr3t",
    ttlSeconds: 600,
  };

  it("returns exactly the STUN entry when config is null", () => {
    const servers = buildIceServers(null);
    expect(servers).toEqual([{ urls: PUBLIC_STUN }]);
    expect(servers[0]).not.toHaveProperty("username");
    expect(servers[0]).not.toHaveProperty("credential");
  });

  it("appends an ephemeral TURN entry with HMAC-SHA1 credential", () => {
    const fixedNow = 1_700_000_000_000;
    const expectedExpiry = Math.floor(fixedNow / 1000) + config.ttlSeconds;
    const expectedUsername = `${expectedExpiry}:lazarus`;
    const expectedCredential = createHmac("sha1", config.secret)
      .update(expectedUsername)
      .digest("base64");

    const servers = buildIceServers(config, fixedNow);

    expect(servers).toHaveLength(2);
    expect(servers[0]).toEqual({ urls: PUBLIC_STUN });
    expect(servers[1]).toEqual({
      urls: config.urls,
      username: expectedUsername,
      credential: expectedCredential,
    });
  });

  it("produces a different credential when now changes (time-bound)", () => {
    const a = buildIceServers(config, 1_700_000_000_000);
    const b = buildIceServers(config, 1_700_000_600_000);
    expect(a[1]?.username).not.toBe(b[1]?.username);
    expect(a[1]?.credential).not.toBe(b[1]?.credential);
  });
});
