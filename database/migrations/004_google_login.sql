-- Google identity is bound to an existing account; company and role never come from OAuth.
ALTER TABLE pb_users ADD COLUMN google_sub VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
 ADD UNIQUE KEY uq_users_google_sub (google_sub);
