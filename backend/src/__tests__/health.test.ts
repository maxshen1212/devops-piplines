import request from "supertest";
import app from "../app";

describe("Health Endpoints", () => {
  describe("GET /health", () => {
    it("should return 200 and status ok", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "ok");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("uptime");
    });

    it("should return valid timestamp format", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toString()).not.toBe("Invalid Date");
    });

    it("should return uptime as a number", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(typeof response.body.uptime).toBe("number");
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("GET /health/db", () => {
    it("should return database health status", async () => {
      const response = await request(app).get("/health/db");

      // DB might not be available in test environment, so we check for either success or error response
      expect([200, 500]).toContain(response.status);
      expect(response.body).toHaveProperty("status");
    });
  });

  describe("GET /", () => {
    it("should return hello message", async () => {
      const response = await request(app).get("/");

      expect(response.status).toBe(200);
      expect(response.text).toBe("Hello Express!");
    });
  });
});
