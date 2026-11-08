-- Second guard, enforced by the database itself.
DO $$
BEGIN
  IF current_database() <> 'job_tracker_e2e' THEN
    RAISE EXCEPTION 'refusing to reset database %', current_database();
  END IF;
  TRUNCATE "StatusChange", "Application", "Session", "Account", "Verification", "User";
END $$;
