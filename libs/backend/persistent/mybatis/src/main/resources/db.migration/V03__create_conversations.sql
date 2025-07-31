CREATE TABLE conversations
(
  id         BIGSERIAL PRIMARY KEY,
  title      VARCHAR(255),
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  user_id    BIGINT,
  FOREIGN KEY (user_id) REFERENCES users (id)
);
