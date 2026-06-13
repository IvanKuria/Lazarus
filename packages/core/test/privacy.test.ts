import { describe, it, expect } from "vitest";
import { shouldCapture } from "../src/privacy.js";

describe("shouldCapture", () => {
  it("accepts a normal public https article", () => {
    expect(shouldCapture("https://example.com/news/article-123")).toBe(true);
    expect(shouldCapture("http://example.com/page")).toBe(true);
  });

  it("rejects non-http(s) schemes", () => {
    expect(shouldCapture("chrome://extensions")).toBe(false);
    expect(shouldCapture("about:blank")).toBe(false);
    expect(shouldCapture("file:///Users/me/secret.txt")).toBe(false);
    expect(shouldCapture("data:text/html,<h1>hi</h1>")).toBe(false);
    expect(shouldCapture("view-source:https://example.com")).toBe(false);
  });

  it("rejects localhost and loopback", () => {
    expect(shouldCapture("http://localhost:3000/app")).toBe(false);
    expect(shouldCapture("http://127.0.0.1/dashboard")).toBe(false);
    expect(shouldCapture("http://[::1]/x")).toBe(false);
  });

  it("rejects private/LAN hosts", () => {
    expect(shouldCapture("http://192.168.1.10/router")).toBe(false);
    expect(shouldCapture("http://10.0.0.5/internal")).toBe(false);
    expect(shouldCapture("http://printer.local/status")).toBe(false);
  });

  it("rejects obviously sensitive hosts (auth, email, banking)", () => {
    expect(shouldCapture("https://mail.google.com/mail/u/0/#inbox")).toBe(false);
    expect(shouldCapture("https://accounts.google.com/signin")).toBe(false);
    expect(shouldCapture("https://login.example.com/")).toBe(false);
    expect(shouldCapture("https://www.chase.com/banking")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(shouldCapture("not a url")).toBe(false);
    expect(shouldCapture("")).toBe(false);
  });
});
