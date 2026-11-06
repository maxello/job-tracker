import { describe, expect, it } from "vitest";
import { signInSchema, signUpSchema } from "./schemas";

const signUp = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "correct horse",
};
const signIn = { email: signUp.email, password: signUp.password };

function errorFields(result: {
  error?: { issues: { path: PropertyKey[] }[] };
}) {
  return result.error?.issues.map((issue) => issue.path[0]);
}

describe("signUpSchema", () => {
  const parse = (fields: Partial<typeof signUp>) =>
    signUpSchema.safeParse({ ...signUp, ...fields });

  it("US-0: a user can register with name, email and password", () => {
    expect(signUpSchema.safeParse(signUp).data).toEqual(signUp);
  });

  it.each(["name", "email", "password"])(
    "US-0: registering requires %s",
    (field) => {
      for (const value of ["", undefined]) {
        const result = signUpSchema.safeParse({ ...signUp, [field]: value });
        expect(errorFields(result)).toEqual([field]);
      }
    },
  );

  describe("name", () => {
    it("US-0: name accepts 100 chars", () => {
      const name = "a".repeat(100);
      expect(parse({ name }).data?.name).toBe(name);
    });

    it("US-0: name rejects more than 100 chars", () => {
      expect(errorFields(parse({ name: "a".repeat(101) }))).toEqual(["name"]);
    });

    it("US-0: name is trimmed", () => {
      expect(parse({ name: "  Ada  " }).data?.name).toBe("Ada");
    });

    it("US-0: a whitespace-only name counts as empty", () => {
      expect(errorFields(parse({ name: "   " }))).toEqual(["name"]);
    });

    it("Decision 2026-11-05: name rejects NUL bytes", () => {
      expect(errorFields(parse({ name: "Ad\0a" }))).toEqual(["name"]);
    });
  });

  describe("email", () => {
    const domain = "@example.com";

    it("US-0: email accepts 254 chars", () => {
      const email = "a".repeat(254 - domain.length) + domain;
      expect(parse({ email }).data?.email).toBe(email);
    });

    it("US-0: email rejects more than 254 chars", () => {
      const email = "a".repeat(255 - domain.length) + domain;
      expect(errorFields(parse({ email }))).toEqual(["email"]);
    });

    it.each(["not-an-email", "ada@", "@example.com", "ada@example"])(
      "US-0: email must have a valid format (%s)",
      (email) => {
        expect(errorFields(parse({ email }))).toEqual(["email"]);
      },
    );

    it("US-0: email is trimmed and lowercased", () => {
      expect(parse({ email: "  Ada@Example.COM  " }).data?.email).toBe(
        "ada@example.com",
      );
    });
  });

  describe("password", () => {
    it.each([8, 128])("US-0: password accepts %i chars", (length) => {
      const password = "a".repeat(length);
      expect(parse({ password }).data?.password).toBe(password);
    });

    it.each([7, 129])("US-0: password rejects %i chars", (length) => {
      expect(errorFields(parse({ password: "a".repeat(length) }))).toEqual([
        "password",
      ]);
    });

    it("US-0: password is not trimmed", () => {
      const password = "  spaced out  ";
      expect(parse({ password }).data?.password).toBe(password);
    });

    it("US-0: password length counts surrounding spaces", () => {
      expect(parse({ password: "   abcd " }).success).toBe(true);
    });
  });
});

describe("signInSchema", () => {
  it("US-0: a user can sign in with email and password", () => {
    expect(signInSchema.safeParse(signIn).data).toEqual(signIn);
  });

  it.each(["email", "password"])("US-0: signing in requires %s", (field) => {
    for (const value of ["", undefined]) {
      const result = signInSchema.safeParse({ ...signIn, [field]: value });
      expect(errorFields(result)).toEqual([field]);
    }
  });
});
