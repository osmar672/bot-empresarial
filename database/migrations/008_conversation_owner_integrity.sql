-- Forward-only reconciliation for both published revisions of migration 002.
-- Preserve existing histories and constraints. Invalid ownership stops this migration.
ALTER TABLE pb_conversations ADD UNIQUE KEY uq_conversation_owner (id,company_id,user_id);
ALTER TABLE pb_messages
 ADD CONSTRAINT fk_msg_conversation_owner_v2
 FOREIGN KEY (conversation_id,company_id,user_id)
 REFERENCES pb_conversations(id,company_id,user_id)
 ON DELETE CASCADE;
