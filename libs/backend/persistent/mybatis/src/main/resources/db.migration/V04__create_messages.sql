create table messages
(
  id    BIGSERIAL PRIMARY KEY,
  conversation_id int,
  role  VARCHAR(255),
  content TEXT,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations (id)
)
