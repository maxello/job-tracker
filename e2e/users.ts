// Test-only credentials for the e2e database.
// USER_A must stay empty: sign-in.spec.ts relies on its empty list. USER_B is
// reserved for the cross-user isolation tests. Tests that create data sign up
// their own user with signUpFreshUser() from ./fresh-user.
export const USER_A = {
  name: "E2E User A",
  email: "e2e-a@example.com",
  password: "e2e-password-a",
};

export const USER_B = {
  name: "E2E User B",
  email: "e2e-b@example.com",
  password: "e2e-password-b",
};
