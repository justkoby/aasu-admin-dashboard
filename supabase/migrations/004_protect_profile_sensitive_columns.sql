-- Migration 004_protect_profile_sensitive_columns.sql
-- Description: Prevent non-Super-Admin users from modifying sensitive profile columns (role, is_active, email, id, created_at).

CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS TRIGGER AS $$
DECLARE
  acting_user_role TEXT;
BEGIN
  -- Get the role of the authenticated user attempting the update
  SELECT role INTO acting_user_role
  FROM public.profiles
  WHERE id = auth.uid();

  -- If acting user is super_admin or service_role, allow administrative modifications
  IF acting_user_role = 'super_admin' OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Block unauthorized non-super_admin field mutations
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    RAISE EXCEPTION 'Unauthorized: Only Super Admins can modify user roles.';
  END IF;

  IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    RAISE EXCEPTION 'Unauthorized: Only Super Admins can modify account status.';
  END IF;

  IF OLD.email IS DISTINCT FROM NEW.email THEN
    RAISE EXCEPTION 'Unauthorized: Profile email address cannot be modified directly.';
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'Unauthorized: Profile ID cannot be modified.';
  END IF;

  IF OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'Unauthorized: Account creation timestamp cannot be modified.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_profile_sensitive_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_sensitive_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_sensitive_fields();
